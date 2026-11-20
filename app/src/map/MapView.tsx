"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  ValidateNotSelfIntersecting,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Polygon } from "geojson";
import { useStore } from "@/store";
import { bboxOf, centroidLngLat, makeFrame, openRing, ringAreaM2, type LngLat, type XY } from "@/engine/geo";
import { buildingOverlaps } from "@/engine/siteChecks";
import { plotSplit } from "@/engine/plotSplit";
import { MANUAL_EDGE_DEFAULT_M } from "@/engine/roadDefaults";
import { sound } from "@/ui/sound";
import { perfOn } from "@/ui/perf";
import { DEVICE } from "@/ui/device";
import { TileContextCollector } from "@/site/tileContext";
import { loadZones } from "@/site/zones";
import { loadStations } from "@/site/stations";
import { TARGET_ZONE } from "@/rules";
import { RULES } from "@/engine/rules";
import { edgeList, edgeRuns, groupRoadEdges, runMidpoint } from "@/ui/roadGroups";
import {
  addContextLayers,
  setBuildingFilters,
  setBuildingsData,
  setDesignData,
  setTallerLayer,
  type EdgeLabel,
  setProofData,
  setEnvelopeData,
  setSetbackData,
  setLayerToggles,
  setPlotEdges,
  setMapStyleMode,
  setPlotSplit,
  type MapStyleMode,
  setSiteFlags,
  setZoneData,
} from "./layers";
import type { LayerToggles } from "./layers";
import { SIMPLE_LAYERS } from "@/store";

// The bundler breaks MapLibre's default (import.meta.url-relative) worker path; serve the
// worker from public/ instead (copied by scripts/copy-maplibre-worker.mjs on dev/build).
maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

// OpenFreeMap "liberty": coloured land use, parks and water (DEVIATIONS: was positron).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
// Ari, Bangkok (zone ย.10 condo belt)
const ARI: LngLat = [100.5446, 13.7797];

/** 40 x 50 m demo plot near Ari. */
const DEMO_OFFSET_M: XY = [-270, -140];
const DEMO_ROT_DEG = 60;

export function demoPlot(): LngLat[] {
  const f = makeFrame(ARI[0], ARI[1]);
  // Offset chosen by running the site checks over real tile data: faces Soi Ari 1, no road or
  // building conflicts, zone ย.10 (see DEVIATIONS.md).
  const [ox, oy] = DEMO_OFFSET_M;
  const a = (DEMO_ROT_DEG * Math.PI) / 180;
  const xy: XY[] = ([[-20, -25], [20, -25], [20, 25], [-20, 25]] as XY[]).map(
    ([x, y]) => [x * Math.cos(a) - y * Math.sin(a) + ox, x * Math.sin(a) + y * Math.cos(a) + oy] as XY,
  );
  // terra-draw rejects coordinates with more than 9 decimals; 7 decimals ≈ 1 cm.
  const round = (v: number) => Math.round(v * 1e7) / 1e7;
  const ring = xy.map(f.toLngLat).map(([lon, lat]) => [round(lon), round(lat)] as LngLat);
  return [...ring, ring[0]];
}

const ACCENT = "#e4572e";
const MIN_FIT_ZOOM = 15; // context tiles carry full detail from here (planning A.4)
const MAX_FIT_ZOOM = 18.6;
const VIEW_MS = 800 * DEVICE.motion;
/** Edge clicks this close (px) to a corner or midpoint handle are left to terra-draw. */
const EDGE_HANDLE_PX = 14;

export type ViewName = "top" | "N" | "E" | "S" | "W";
const VIEWS: Record<ViewName, { bearing: number; pitch: number }> = {
  top: { bearing: 0, pitch: 0 },
  N: { bearing: 0, pitch: 60 },
  E: { bearing: 90, pitch: 60 },
  S: { bearing: 180, pitch: 60 },
  W: { bearing: 270, pitch: 60 },
};

export interface MapApi {
  startDrawing(): void;
  cancelDrawing(): void;
  loadDemo(): void;
  clear(): void;
  setView(v: ViewName): void;
  setMapStyle(m: MapStyleMode): void;
  /** Fit the camera to the current plot (after a share-link restore). */
  fitPlot(): void;
  /** Fly the camera to frame a ring (guided tour); resolves when the camera stops. */
  flyToRing(ring: LngLat[]): Promise<void>;
  /** Screen point (px, relative to the map container) of a lon/lat. */
  project(p: LngLat): { x: number; y: number };
  /** Call `cb` on every camera move; returns an unsubscribe function. */
  onCamera(cb: () => void): () => void;
}

const fmtArea = (ring: LngLat[]) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(ringAreaM2(ring))} m²`;

export default function MapView({ onReady }: { onReady?: (api: MapApi) => void }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    // Handlers read the store directly so the map is created once.
    const st = () => useStore.getState();

    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: ARI,
      zoom: 17,
      pitch: DEVICE.defaultPitch,
      bearing: 0,
      pixelRatio: DEVICE.pixelRatio,
      maxPitch: 80,
      canvasContextAttributes: { antialias: true },
    });
    // Zoom only: the compass just reset north and looked broken (planning A.1); views live in ViewControl.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    // Dev-only handle for headless-browser tests.
    if (process.env.NODE_ENV !== "production" || perfOn) (window as unknown as { __plotwiseMap?: maplibregl.Map }).__plotwiseMap = map;

    let draw: TerraDraw | null = null;
    let cancelled = false;
    let lastRejectAt = 0;
    /** True while the user is drawing or dragging: buildings overlapping the plot show red. */
    let live = false;
    let liveRing: LngLat[] | null = null;
    let liveTimer: ReturnType<typeof setTimeout> | null = null;
    let publishRaf = 0;
    let pointerDown = false;
    let basemapIds: string[] = [];
    let suppressDrawEvents = false;
    let pendingPublish: string | number | null = null;

    // ---------- building colouring (live vs settled) ----------
    const refreshOverlap = () => {
      const s = st();
      const ring = live ? liveRing : s.plot;
      // Plot split: free part green, part under building footprints red (Amitesh feedback 2).
      const split = ring && ring.length >= 4 ? plotSplit(ring, s.context.buildings) : null;
      setPlotSplit(map, split);
      const areas = split ? { freeM2: split.freeM2, builtM2: split.builtM2 } : null;
      const prev = s.plotAreas;
      if (!areas !== !prev || (areas && prev && (Math.abs(areas.freeM2 - prev.freeM2) > 0.5 || Math.abs(areas.builtM2 - prev.builtM2) > 0.5))) s.setPlotAreas(areas);
      const detailed = s.mapStyle === "detailed";
      if (live) {
        // Detailed mode also turns overlapping buildings red while editing; Simple keeps one grey.
        const ov = detailed && ring ? buildingOverlaps(ring, s.context.buildings) : null;
        setBuildingFilters(map, { hide: [], cut: [], red: ov?.overlapping ?? [] });
      } else {
        const h = s.site?.highlights;
        setBuildingFilters(map, { hide: h?.onPlotBuildingIds ?? [], cut: detailed ? (h?.cutBuildingIds ?? []) : [], red: [] });
      }
    };
    const setLive = (ring: LngLat[] | null) => {
      live = true;
      // A held pointer outside polygon drawing = a drag: the engine runs envelope-only until release.
      if (pointerDown && st().mode !== "drawing" && !st().dragging) st().setDragging(true);
      liveRing = ring;
      refreshOverlap();
      // While a pointer is held, live mode lasts until release (holding still mid-drag stays red).
      // Without a held pointer (e.g. keyboard edits), settle shortly after the last change.
      if (liveTimer) clearTimeout(liveTimer);
      liveTimer = pointerDown ? null : setTimeout(() => endLive("timer"), 1500);
    };
    const endLive = (why = "timer") => {
      void why;
      if (liveTimer) clearTimeout(liveTimer);
      liveTimer = null;
      if (!live) return;
      if (st().mode === "drawing") return; // still drawing: stay live
      live = false;
      liveRing = null;
      if (st().dragging) st().setDragging(false);
      refreshOverlap();
    };

    // ---------- camera ----------
    // Room left for the panels over the map. Fixed desktop paddings (380 px left) are wider than a phone, so on
    // narrow maps the plot is framed between the top card and the bottom sheet instead.
    const pad = (desk: { top: number; bottom: number; left: number; right: number }) => {
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      if (w >= 640) return desk;
      // Expert on a phone: the panels sit below the map (bottom sheet), so the whole map is free.
      if (st().uiMode === "expert") return { top: 32, bottom: 32, left: 24, right: 24 };
      return { top: Math.round(h * 0.22), bottom: Math.round(h * 0.36), left: 24, right: 24 };
    };
    const fitTo = (ring: LngLat[], bearing = map.getBearing(), pitch = map.getPitch(), duration = VIEW_MS) => {
      const [w, s, e, n] = bboxOf(ring);
      const cam = map.cameraForBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: pad({ top: 120, bottom: 160, left: 380, right: 200 }), bearing },
      );
      if (!cam) return;
      // A pitched camera sees the plot foreshortened and the envelope rising above it: zoom out so both fit.
      let back = 0;
      if (pitch > 30) {
        const c = st().compute;
        const h = c?.envelopes.highRise?.heightM || c?.envelopes.lowRise?.heightM || 0;
        const f0 = makeFrame((w + e) / 2, (s + n) / 2);
        const [x0, y0] = f0.toXY([w, s]);
        const [x1, y1] = f0.toXY([e, n]);
        const span = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
        back = 0.35 + Math.max(0, Math.log2((span + h * 1.1) / span));
      }
      const z = Math.min(MAX_FIT_ZOOM, Math.max(MIN_FIT_ZOOM, (cam.zoom ?? 17) - back));
      map.easeTo({ center: cam.center, zoom: z, bearing, pitch, duration, essential: true });
    };

    const publish = (id: string | number) => {
      const f = draw?.getSnapshotFeature(id);
      if (!f || f.geometry.type !== "Polygon") return null;
      const ring = (f.geometry as Polygon).coordinates[0] as LngLat[];
      if (ring.length < 4) return null;
      st().setPlot(ring);
      return ring;
    };

    const toEditing = (id: string | number, message: string) => {
      const ring = publish(id);
      if (!ring) return;
      st().setMode("editing");
      live = false;
      liveRing = null;
      fitTo(ring);
      st().commit(); // undo entry: plot drawn / demo loaded
      // Sound + toast are decided by ClientShell once the site checks have run for this plot.
      st().setJustFinished(`${message} · ${fmtArea(ring)}`);
    };

    const collector = new TileContextCollector(DEVICE.contextRadiusM);
    // Context is kept and shown around a focus: the plot centroid, or the map centre with no plot.
    const focusPoint = (): LngLat => {
      const p = st().plot;
      if (p && p.length >= 4) return centroidLngLat(openRing(p));
      const c = map.getCenter();
      return [c.lng, c.lat];
    };
    let lastSnap: unknown = null;
    const pushContext = () => {
      const focus = focusPoint();
      collector.collect(map, focus);
      const snap = collector.snapshot(focus);
      const status = collector.coverage(st().plot);
      if (snap !== lastSnap) {
        lastSnap = snap;
        setBuildingsData(map, snap.buildings);
        st().setContext({ status, ...snap });
      } else if (status !== st().context.status) st().setContext({ ...st().context, status });
    };
    const unsubs: (() => void)[] = [];

    // ---- labels on the model (direction file §3.6): road width + setback on every edge, ≤ 8 labels ----
    const MAX_EDGE_LABELS = 8;
    const edgeLenM = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110574);
    const edgeLabels = (): Record<number, EdgeLabel> | undefined => {
      const s = st();
      // Simple: only edge numbers, and only while choosing the road; otherwise no edge labels.
      if (s.uiMode === "simple") {
        if (!s.plot || s.simpleStep !== 2) return {};
        const nums: Record<number, string> = {};
        for (let j = 0; j < s.plot.length - 1 && j < MAX_EDGE_LABELS; j++) nums[j] = `${j + 1}`;
        return nums;
      }
      const c = s.compute;
      if (!s.plot || !c || c.status !== "ok" || !c.geometry) return undefined;
      const d = s.designs.find((x) => x.design.id === s.selectedDesign && x.design.buildable);
      const cls = d ? d.design.cls : c.envelopes.highRise?.slices.length ? "highRise" : "lowRise";
      const env = c.envelopes[cls] ?? c.envelopes.lowRise;
      if (!env?.slices.length) return undefined;
      const ground = env.slices[0].setbacks;
      const byDrawn: Record<number, number> = {};
      c.geometry.drawnEdgeOf.forEach((dj, ni) => (byDrawn[dj] = Math.max(byDrawn[dj] ?? 0, ground[ni]?.s ?? 0)));
      const n = s.plot.length - 1;
      const plot = s.plot;
      const order = [...Array(n).keys()]
        .filter((j) => byDrawn[j] !== undefined)
        .sort((a, b) => (s.roadEdges[b] ? 1 : 0) - (s.roadEdges[a] ? 1 : 0) || edgeLenM(plot[b], plot[b + 1]) - edgeLenM(plot[a], plot[a + 1]))
        .slice(0, MAX_EDGE_LABELS);
      const out: Record<number, EdgeLabel> = {};
      // A run of edges on one road gets ONE label halfway along the run (planning review item 4).
      const runOf = new Map<number, number[]>();
      for (const g of groupRoadEdges(s.roadEdges)) for (const run of edgeRuns(g.edges, n)) if (run.length > 1) for (const j of run) runOf.set(j, run);
      const done = new Set<number>();
      for (const j of order) {
        const r = s.roadEdges[j];
        const run = runOf.get(j);
        if (run) {
          if (done.has(run[0])) continue;
          done.add(run[0]);
          const sb = Math.max(...run.map((k) => byDrawn[k] ?? 0)).toFixed(1);
          out[j] = { text: `${edgeList(run)} · ${r.widthM % 1 ? r.widthM.toFixed(1) : r.widthM} m road${r.confirmed ? "" : " (est.)"} · ${sb} m`, at: runMidpoint(plot, run) };
          continue;
        }
        const sb = byDrawn[j].toFixed(1);
        out[j] = r ? `${j + 1} · ${r.widthM % 1 ? r.widthM.toFixed(1) : r.widthM} m road${r.confirmed ? "" : " (est.)"} · ${sb} m` : `${j + 1} · ${sb} m`;
      }
      return out;
    };

    // ---- "61 m · 22 st" on top of the selected design (HTML marker raised by its projected height) ----
    const topEl = document.createElement("div");
    topEl.className = "rounded-md bg-neutral-900/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white shadow pointer-events-none";
    const topMarker = new maplibregl.Marker({ element: topEl, anchor: "bottom" });
    let topInfo: { at: LngLat; h: number } | null = null;
    const placeTop = () => {
      if (!topInfo) return;
      const pxPerM = (512 * 2 ** map.getZoom()) / (40075016.686 * Math.cos((topInfo.at[1] * Math.PI) / 180));
      topMarker.setOffset([0, -topInfo.h * pxPerM * Math.sin((map.getPitch() * Math.PI) / 180)]);
    };
    const updateTop = () => {
      const s = st();
      const d = s.designs.find((x) => x.design.id === s.selectedDesign && x.design.buildable);
      const top = d?.floors[d.floors.length - 1];
      const ring = top?.polygons[0]?.[0];
      if (!d || !ring) {
        topInfo = null;
        topMarker.remove();
        return;
      }
      const pts = ring.slice(0, -1);
      const at: LngLat = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
      topInfo = { at, h: d.design.heightM };
      topEl.textContent = s.uiMode === "simple" ? `${Math.round(d.design.heightM)} m · ${d.design.storeys} floors` : `${Number(d.design.heightM.toFixed(1))} m · ${d.design.storeys} st`;
      topMarker.setLngLat(at).addTo(map);
      placeTop();
    };
    map.on("move", placeTop);

    // ---- proof on the model: highlight the clicked check's cause and ease the camera (≤ 400 ms) ----
    const PROOF_MS = 400 * DEVICE.motion;
    const showProof = () => {
      const s = st();
      const d = s.proof && s.designs.find((x) => x.design.id === s.proof!.design);
      const row = d && d.checks.find((c) => c.id === s.proof!.row);
      const cause = row?.cause ?? null;
      setProofData(map, cause);
      if (!cause || !cause.focus.length) return;
      const lons = cause.focus.map((p) => p[0]);
      const lats = cause.focus.map((p) => p[1]);
      const cam = map.cameraForBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: pad({ top: 140, bottom: 180, left: 400, right: 220 }), bearing: map.getBearing() },
      );
      if (!cam) return;
      const z = Math.min(map.getZoom() + 0.6, Math.max(MIN_FIT_ZOOM, (cam.zoom ?? map.getZoom()) - 0.4));
      map.easeTo({ center: cam.center, zoom: z, bearing: map.getBearing(), pitch: map.getPitch(), duration: PROOF_MS, essential: true });
    };
    // terra-draw refuses a corner drag that would make edges cross, silently: the corner stays at its last
    // valid spot while the pointer moves on. A corner drag that ends far from every corner = a refused move.
    let cornerDrag = false;
    const nearestCornerPx = (x: number, y: number) => {
      const p = st().plot;
      if (!p) return Infinity;
      return Math.min(...p.slice(0, -1).map((q) => {
        const v = map.project(q as [number, number]);
        return Math.hypot(v.x - x, v.y - y);
      }));
    };
    const localXY = (e: PointerEvent) => {
      const r = map.getCanvasContainer().getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onPointerDown = (e: PointerEvent) => {
      pointerDown = true;
      const [x, y] = localXY(e);
      cornerDrag = st().mode === "editing" && nearestCornerPx(x, y) <= 12;
    };
    const onPointerUp = (e: PointerEvent) => {
      pointerDown = false;
      if (cornerDrag) {
        cornerDrag = false;
        const [x, y] = localXY(e);
        if (nearestCornerPx(x, y) > 24) {
          sound.error();
          st().showToast("Plot edges can't cross: kept the last valid shape", "error");
        }
      }
      // terra-draw sends "finish" on drag end; this covers releases it does not report.
      if (live && st().mode !== "drawing") {
        if (liveTimer) clearTimeout(liveTimer);
        liveTimer = setTimeout(() => endLive("pointerup"), 120);
      }
    };
    const el = container.current;
    el.addEventListener("pointerdown", onPointerDown, true);
    unsubs.push(() => el.removeEventListener("pointerdown", onPointerDown, true));
    window.addEventListener("pointerup", onPointerUp, true);
    unsubs.push(() => window.removeEventListener("pointerup", onPointerUp, true));

    map.on("load", () => {
      // MapLibre opens the compact attribution until the first drag; on a phone it would cover the step card.
      if (map.getContainer().clientWidth < 640) map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      if (cancelled) return;
      // Hide the basemap's own buildings; ctx-buildings re-draws them in 3D with our filters.
      for (const layer of map.getStyle().layers ?? []) {
        if ("source-layer" in layer && layer["source-layer"] === "building") {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
      basemapIds = (map.getStyle().layers ?? []).map((l) => l.id);
      addContextLayers(map, TARGET_ZONE.colour, { hatch: DEVICE.hatch });
      setMapStyleMode(map, st().mapStyle, basemapIds);

      // Context from tiles: refresh whenever the map settles (new tiles) and when the plot moves.
      map.on("idle", pushContext);
      let lastPlot: LngLat[] | null = null;
      let lastSite: unknown = null;
      let lastBuildings: unknown = null;
      let lastCompute: unknown = null;
      let lastEdges: unknown = null;
      let lastEdgePlot: unknown = null;
      let lastRestore = 0;
      let lastDesigns: unknown = null;
      let lastSelected: unknown = null;
      let lastDragging = false;
      let lastProof: unknown = null;
      let lastLabelKey = "";
      let lastUiMode: string | null = null;
      let lastTaller = false;
      let lastToggles: LayerToggles | null = null;
      let lastStations: unknown = null;
      let lastTallerPlot: unknown = null;
      unsubs.push(
        useStore.subscribe((s) => {
          // While dragging only the envelope is live; the design (computed on release) is hidden, not stale.
          if (s.designs !== lastDesigns || s.selectedDesign !== lastSelected || s.dragging !== lastDragging) {
            lastDesigns = s.designs;
            lastSelected = s.selectedDesign;
            lastDragging = s.dragging;
            const d = s.dragging ? undefined : s.designs.find((x) => x.design.id === s.selectedDesign && x.design.buildable);
            setDesignData(map, d ? d.floors : null);
            updateTop();
          }
          if (s.proof !== lastProof || (s.proof && s.designs !== lastDesigns)) {
            lastProof = s.proof;
            showProof();
          }
          // Edge labels follow plot, road edges, envelope and the selected design's class.
          const labelKey = `${s.plot?.length}|${JSON.stringify(s.roadEdges)}|${s.compute?.ms}|${s.selectedDesign}|${s.designs.length}|${s.uiMode}|${s.simpleStep}`;
          // H.2 layer toggles are Expert-only; Simple always shows envelope + design, no setbacks.
          const toggles = s.uiMode === "expert" ? s.layers : SIMPLE_LAYERS;
          if (toggles !== lastToggles) {
            lastToggles = toggles;
            setLayerToggles(map, toggles);
          }
          if (s.uiMode !== lastUiMode) {
            lastUiMode = s.uiMode;
            setSiteFlags(map, s.uiMode === "simple" ? null : s.site, s.context.buildings);
            updateTop();
          }
          if (s.tallerLayer !== lastTaller || (s.tallerLayer && (s.stations !== lastStations || s.plot !== lastTallerPlot))) {
            lastTaller = s.tallerLayer;
            lastStations = s.stations;
            lastTallerPlot = s.plot;
            const c = map.getCenter();
            const near: LngLat = s.plot ? centroidLngLat(openRing(s.plot)) : [c.lng, c.lat];
            setTallerLayer(map, s.tallerLayer, s.stations.list, RULES.stationWithinM, near);
          }
          if (labelKey !== lastLabelKey) {
            lastLabelKey = labelKey;
            setPlotEdges(map, s.plot, s.roadEdges, edgeLabels());
          }
          if (s.restoreSeq !== lastRestore) {
            lastRestore = s.restoreSeq;
            showRestored(s.plot);
          }
          if (s.plot !== lastPlot) {
            lastPlot = s.plot;
            // The focus follows the plot (snapshot is cached on a ~50 m grid, so this is cheap).
            pushContext();
          }
          if (s.site !== lastSite || s.context.buildings !== lastBuildings) {
            lastSite = s.site;
            lastBuildings = s.context.buildings;
            setSiteFlags(map, s.uiMode === "simple" ? null : s.site, s.context.buildings);
            refreshOverlap();
          }
          if (s.compute !== lastCompute) {
            lastCompute = s.compute;
            const c = s.compute;
            // Show the high-rise envelope when the gate allows it, otherwise the low-rise one.
            const cls = c && c.status === "ok" ? (c.envelopes.highRise?.slices.length ? "highRise" : "lowRise") : null;
            setEnvelopeData(map, c?.features ?? [], cls);
            const ground = cls ? (c?.features ?? []).filter((f) => f.cls === cls && f.index === 0).flatMap((f) => f.polygons) : [];
            setSetbackData(map, cls ? s.plot : null, ground);
          }
          if (s.roadEdges !== lastEdges || s.plot !== lastEdgePlot) {
            lastEdges = s.roadEdges;
            lastEdgePlot = s.plot;
            setPlotEdges(map, s.plot, s.roadEdges, edgeLabels());
          }
        }),
      );

      // Stations (whole Bangkok bbox): lazy, small.
      loadStations()
        .then((d) => !cancelled && st().setStations(d))
        .catch((e) => {
          console.error("stations failed", e);
          st().setStations({ status: "unavailable", list: [], bbox: null });
        });

      // Zoning map: lazy, after first paint.
      loadZones()
        .then(({ zones, geojson }) => {
          if (cancelled) return;
          st().setZones({ status: "ready", zones });
          const bb = setZoneData(map, geojson, TARGET_ZONE.zoneCode);
          // Keep the view around the zone this version covers (+ ~3 km so its edges stay in view).
          if (bb) {
            const pad = 0.027;
            map.setMaxBounds([
              [bb[0] - pad, bb[1] - pad],
              [bb[2] + pad, bb[3] + pad],
            ]);
          }
        })
        .catch((e) => {
          console.error("zoning map failed", e);
          st().setZones({ status: "unavailable", zones: [] });
        });

      const notSelfIntersecting = (feature: Parameters<typeof ValidateNotSelfIntersecting>[0]) => {
        const res = ValidateNotSelfIntersecting(feature);
        if (!res.valid) {
          st().setPlotError("Plot edges can't cross each other. That move was undone.");
          // Validation runs on every pointer move; sound at most once a second.
          const now = performance.now();
          // plotError is cleared by the next valid move; the toast outlives the release and shows in Simple too.
          if (now - lastRejectAt > 1000) {
            sound.error();
            st().showToast("Plot edges can't cross: kept the last valid shape", "error");
          }
          lastRejectAt = now;
        }
        return res;
      };

      draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode({
            validation: (feature) => notSelfIntersecting(feature),
            styles: {
              // Fill comes from our plot-fill layer (green clear / red overlap); outline only here.
              fillColor: ACCENT,
              fillOpacity: 0,
              outlineColor: ACCENT,
              outlineWidth: 2,
              closingPointColor: ACCENT,
              closingPointOutlineColor: "#ffffff",
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: { midpoints: true, draggable: true, deletable: true },
                },
              },
            },
            validation: (feature) => notSelfIntersecting(feature),
            styles: {
              selectedPolygonColor: ACCENT,
              selectedPolygonFillOpacity: 0,
              selectedPolygonOutlineColor: ACCENT,
              selectedPolygonOutlineWidth: 3,
              selectionPointColor: "#ffffff",
              selectionPointOutlineColor: ACCENT,
              midPointColor: ACCENT,
            },
          }),
        ],
      });
      draw.start();
      draw.setMode("select");

      // Only one plot at a time.
      draw.on("finish", (id, ctx) => {
        if (!draw) return;
        if (ctx.mode === "polygon") {
          for (const f of draw.getSnapshot()) if (f.id !== id) draw.removeFeatures([f.id!]);
          draw.setMode("select");
          draw.selectFeature(id);
          toEditing(id, "Plot drawn");
        } else {
          if (publishRaf) cancelAnimationFrame(publishRaf);
          publishRaf = 0;
          pendingPublish = null;
          publish(id);
          st().commit(); // one drag = one undo entry, recorded on release
          endLive("finish"); // drag released
        }
      });
      // Live updates while drawing, dragging vertices or moving the whole plot.
      draw.on("change", (ids, type) => {
        if (!draw || type === "delete" || suppressDrawEvents) return;
        for (const id of ids) {
          const f = draw.getSnapshotFeature(id);
          if (f?.geometry.type !== "Polygon" || f.properties.mode !== "polygon") continue;
          const ring = (f.geometry as Polygon).coordinates[0] as LngLat[];
          if (f.properties.currentlyDrawing) {
            setLive(ring);
          } else if (type === "update" && pointerDown) {
            // Dragging (a pointer is held): publish at most once per animation frame (BUILD_PLAN §9).
            // Updates without a held pointer are selection changes (e.g. deselect on clear), not drags.
            pendingPublish = id;
            if (!publishRaf) {
              publishRaf = requestAnimationFrame(() => {
                publishRaf = 0;
                if (pendingPublish != null) publish(pendingPublish);
                pendingPublish = null;
              });
            }
            setLive(ring);
          } else {
            publish(id);
          }
        }
      });

      // Click a plot edge to mark / unmark it as facing a road.
      map.on("click", "plot-edge-hit", (e) => {
        const s = st();
        if (s.mode === "drawing" || !s.plot) return;
        const edge = Number(e.features?.[0]?.properties?.edge);
        if (!Number.isInteger(edge)) return;
        // Clicks on a corner or on the midpoint handle belong to terra-draw (move / add a corner).
        const a0 = map.project(s.plot[edge] as [number, number]);
        const b0 = map.project(s.plot[edge + 1] as [number, number]);
        const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
        const near = (p: { x: number; y: number }) => Math.hypot(p.x - e.point.x, p.y - e.point.y) < EDGE_HANDLE_PX;
        if (near(a0) || near(b0) || near(m0)) return;
        const next = { ...s.roadEdges };
        if (next[edge]) {
          delete next[edge];
          s.showToast("Edge set as a neighbour boundary");
        } else {
          next[edge] = { widthM: MANUAL_EDGE_DEFAULT_M, confirmed: false, label: "added by you" };
          s.showToast("Edge set as a road edge: confirm its width");
        }
        sound.click();
        s.setRoadEdges(next, "user");
        s.commit();
      });
      map.on("mouseenter", "plot-edge-hit", () => {
        if (st().mode !== "drawing") map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "plot-edge-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      // Feedback for each corner placed while drawing.
      map.on("click", () => {
        if (st().mode !== "drawing") return;
        st().setDrawPoints(st().drawPoints + 1);
        sound.tick();
      });

      const cancelDrawing = () => {
        if (!draw || st().mode !== "drawing") return;
        draw.clear();
        draw.setMode("select");
        st().setMode("idle");
        st().setDrawPoints(0);
        live = false;
        liveRing = null;
        refreshOverlap();
        st().showToast("Drawing cancelled");
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") cancelDrawing();
      };
      window.addEventListener("keydown", onKey);
      map.once("remove", () => window.removeEventListener("keydown", onKey));

      const loadRing = (ring: LngLat[], message: string) => {
        if (!draw) return;
        draw.clear();
        draw.setMode("select");
        const [res] = draw.addFeatures([
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: { mode: "polygon" },
          },
        ]);
        if (res?.valid) {
          draw.selectFeature(res.id!);
          toEditing(res.id!, message);
        } else {
          console.error("Plot rejected by terra-draw:", res?.reason);
          sound.error();
          st().setPlotError(`Could not load plot: ${res?.reason ?? "unknown reason"}`);
        }
      };

      // Undo/redo: put the restored plot into terra-draw without creating a new history entry.
      function showRestored(ring: LngLat[] | null) {
        if (!draw) return;
        live = false;
        liveRing = null;
        // The store already holds the restored state: ignore terra-draw's own events while rebuilding
        // (clear() emits a deselect "update" for the old feature, which would re-publish the old ring).
        suppressDrawEvents = true;
        try {
          draw.clear();
          draw.setMode("select");
          if (ring) {
            const [res] = draw.addFeatures([{ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: { mode: "polygon" } }]);
            if (res?.valid) draw.selectFeature(res.id!);
          }
        } finally {
          suppressDrawEvents = false;
        }
        st().setMode(ring ? "editing" : "idle");
        refreshOverlap();
      }

      onReady?.({
        startDrawing: () => {
          if (!draw) return;
          draw.clear();
          st().setPlot(null);
          st().setDrawPoints(0);
          st().setMode("drawing");
          draw.setMode("polygon");
        },
        cancelDrawing,
        loadDemo: () => loadRing(demoPlot(), "Demo plot loaded"),
        fitPlot: () => {
          const p = st().plot;
          if (p) fitTo(p);
        },
        flyToRing: (ring) =>
          new Promise<void>((resolve) => {
            map.once("moveend", () => resolve());
            setTimeout(resolve, 4000); // fitTo returns early if the camera can't be computed
            fitTo(ring, 0, DEVICE.defaultPitch, VIEW_MS * 2);
          }),
        project: (p) => {
          const q = map.project(p as [number, number]);
          return { x: q.x, y: q.y };
        },
        onCamera: (cb) => {
          map.on("move", cb);
          return () => {
            map.off("move", cb);
          };
        },
        clear: () => {
          draw?.clear();
          draw?.setMode("select");
          st().setPlot(null);
          st().setMode("idle");
          st().setDrawPoints(0);
          live = false;
          liveRing = null;
          refreshOverlap();
          st().commit();
          st().showToast("Plot cleared");
        },
        setView: (v) => {
          const { bearing, pitch } = VIEWS[v];
          const plot = st().plot;
          if (plot) fitTo(plot, bearing, pitch);
          else map.easeTo({ bearing, pitch, duration: VIEW_MS, essential: true });
        },
        setMapStyle: (m) => {
          st().setMapStyle(m);
          setMapStyleMode(map, m, basemapIds);
          refreshOverlap();
        },
      });
    });

    return () => {
      cancelled = true;
      if (liveTimer) clearTimeout(liveTimer);
      if (publishRaf) cancelAnimationFrame(publishRaf);
      unsubs.forEach((u) => u());
      topMarker.remove();
      try {
        draw?.stop();
      } catch {
        /* map already torn down */
      }
      map.remove();
    };
  }, [onReady]);

  return <div ref={container} className="h-full w-full" />;
}
