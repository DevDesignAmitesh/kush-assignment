import { create } from "zustand";
import type { AssumptionOverrides } from "@/engine/assumptions";
import type { LngLat } from "@/engine/geo";
import type { DataStatus, SiteBuilding, SiteResult, SiteRoad, SiteRoadName, SiteZone, StationData } from "@/engine/siteChecks";
import type { ComputeResult, DesignResult } from "@/engine";
import type { BuildingType } from "@/engine/far";

export interface RoadEdgeState {
  widthM: number;
  /** false until the user edits the width: shown as an estimate (planning Q3). */
  confirmed: boolean;
  /** Where the default came from, e.g. "Soi Ari 1 · minor road". */
  label?: string;
}

export type MapMode = "idle" | "drawing" | "editing";
export type MapStyleMode = "simple" | "detailed" | "satellite";

/** What undo/redo and the share URL restore. */
export interface Snapshot {
  plot: LngLat[] | null;
  roadEdges: Record<number, RoadEdgeState>;
  roadEdgesSource: "auto" | "user";
  buildingType: BuildingType;
  /** FAR bonus per option id (rule JSON farBonus.options), % requested. */
  bonuses: Record<string, number>;
  /** Edited design assumptions (absent key = default for the building type). */
  assumptions: AssumptionOverrides;
}
/** Expert map layer toggles (H.2). Simple always uses SIMPLE_LAYERS. */
export interface MapLayers {
  envelope: boolean;
  design: boolean;
  setbacks: boolean;
}
export const SIMPLE_LAYERS: MapLayers = { envelope: true, design: true, setbacks: false };
export const HISTORY_MAX = 50;

const snap = (s: Snapshot): Snapshot => ({ plot: s.plot, roadEdges: s.roadEdges, roadEdgesSource: s.roadEdgesSource, buildingType: s.buildingType, bonuses: s.bonuses, assumptions: s.assumptions });
const same = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);
export type ToastKind = "info" | "success" | "error";

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

interface AppState {
  /** Plot ring in lon/lat, closed (first == last), or null if none drawn. */
  plot: LngLat[] | null;
  setPlot: (plot: LngLat[] | null) => void;
  plotError: string | null;
  setPlotError: (msg: string | null) => void;

  /** What the map is doing right now; drives the step guide. */
  mode: MapMode;
  setMode: (mode: MapMode) => void;
  /** Corners placed so far while drawing. */
  drawPoints: number;
  setDrawPoints: (n: number) => void;

  toast: Toast | null;
  showToast: (text: string, kind?: ToastKind) => void;
  hideToast: (id: number) => void;

  muted: boolean;
  setMuted: (m: boolean) => void;

  /** OSM context read from map tiles. */
  context: { status: DataStatus; roads: SiteRoad[]; roadNames: SiteRoadName[]; buildings: SiteBuilding[] };
  /** Rail stations for the whole Bangkok bbox (public/data/bkk-rail-stations.geojson). */
  stations: StationData;
  setStations: (s: StationData) => void;
  setContext: (c: AppState["context"]) => void;
  zones: { status: DataStatus; zones: SiteZone[] };
  setZones: (z: AppState["zones"]) => void;
  /** Latest site-check result for the current plot. */
  site: SiteResult | null;
  setSite: (s: SiteResult | null) => void;
  /** Set when a plot was just finished/loaded, so feedback can wait for the site checks. */
  justFinished: string | null;
  setJustFinished: (m: string | null) => void;

  /** Road edges keyed by drawn-ring edge index (vertex i → i+1). */
  roadEdges: Record<number, RoadEdgeState>;
  /** "auto" = from the road-edge suggestion; "user" = the user toggled an edge. */
  roadEdgesSource: "auto" | "user";
  setRoadEdges: (e: Record<number, RoadEdgeState>, source: "auto" | "user") => void;
  buildingType: BuildingType;
  setBuildingType: (t: BuildingType) => void;
  bonuses: Record<string, number>;
  setBonuses: (b: Record<string, number>) => void;
  assumptions: AssumptionOverrides;
  layers: MapLayers;
  setLayer: (k: keyof MapLayers, on: boolean) => void;
  setAssumptions: (a: AssumptionOverrides) => void;
  /** Load a whole scenario (share URL): one undo entry, the map redraws the plot. */
  restoreScenario: (s: Snapshot) => void;
  compute: ComputeResult | null;
  setCompute: (c: ComputeResult | null) => void;
  /** Concept designs + independent checklists (M3). */
  designs: DesignResult[];
  setDesigns: (d: DesignResult[]) => void;
  selectedDesign: "A" | "B" | "C" | null;
  setSelectedDesign: (id: "A" | "B" | "C" | null) => void;
  /** "Proof on the model": the checklist row whose cause is highlighted in 3D (one at a time). */
  proof: { design: "A" | "B" | "C"; row: string } | null;
  setProof: (p: { design: "A" | "B" | "C"; row: string } | null) => void;
  compareOpen: boolean;
  setCompareOpen: (o: boolean) => void;

  /** Simple (default) or Expert UI (DESIGN_DIRECTION §6); kept in the URL hash. */
  uiMode: "simple" | "expert";
  setUiMode: (m: "simple" | "expert") => void;
  /** Area unit in Simple mode. */
  units: "m2" | "sqft" | "rai";
  setUnits: (u: "m2" | "sqft" | "rai") => void;
  /** Simple step card: the step being shown (1 plot, 2 road, 3 type). */
  simpleStep: 1 | 2 | 3;
  setSimpleStep: (n: 1 | 2 | 3) => void;
  /** Guided tour (ui/Tour): the step shown, or null when no tour runs. Only started on request. */
  tourStep: number | null;
  setTourStep: (n: number | null) => void;
  /** "Where could I build taller?" map layer (off by default). */
  tallerLayer: boolean;
  setTallerLayer: (on: boolean) => void;
  /** True while a plot vertex / the plot is being dragged (engine runs envelope-only). */
  dragging: boolean;
  /** A newer full engine result is on its way (drag or input change): result card shimmers. */
  updating: boolean;
  setDragging: (d: boolean) => void;

  mapStyle: MapStyleMode;
  setMapStyle: (m: MapStyleMode) => void;
  /** Free vs built-over plot area (live, from engine/plotSplit). */
  plotAreas: { freeM2: number; builtM2: number } | null;
  setPlotAreas: (a: { freeM2: number; builtM2: number } | null) => void;

  /** Undo history: entries[index] is the current state. */
  history: { entries: Snapshot[]; index: number };
  /** Record the current state as a new entry (drops any redo branch; keeps at most HISTORY_MAX). */
  commit: () => void;
  /** Replace the current entry with the current state (derived changes such as auto road edges). */
  amendCurrent: () => void;
  undo: () => boolean;
  redo: () => boolean;
  /** Increments on every undo/redo so the map and effects can tell a restore from a user edit. */
  restoreSeq: number;
}

let toastSeq = 0;

export const useStore = create<AppState>((set, get) => ({
  plot: null,
  setPlot: (plot) => set({ plot, plotError: null }),
  plotError: null,
  setPlotError: (plotError) => set({ plotError }),

  mode: "idle",
  setMode: (mode) => set({ mode }),
  drawPoints: 0,
  setDrawPoints: (drawPoints) => set({ drawPoints }),

  toast: null,
  showToast: (text, kind = "info") => set({ toast: { id: ++toastSeq, text, kind } }),
  hideToast: (id) => set((s) => (s.toast?.id === id ? { toast: null } : s)),

  muted: false,
  setMuted: (muted) => {
    try {
      localStorage.setItem("plotwise:muted", muted ? "1" : "0");
    } catch {
      /* storage blocked: keep in memory only */
    }
    set({ muted });
  },

  context: { status: "loading", roads: [], roadNames: [], buildings: [] },
  stations: { status: "loading", list: [], bbox: null },
  setStations: (stations) => set({ stations }),
  setContext: (context) => set({ context }),
  zones: { status: "loading", zones: [] },
  setZones: (zones) => set({ zones }),
  site: null,
  setSite: (site) => set({ site }),
  justFinished: null,
  setJustFinished: (justFinished) => set({ justFinished }),

  roadEdges: {},
  roadEdgesSource: "auto",
  setRoadEdges: (roadEdges, roadEdgesSource) => set({ roadEdges, roadEdgesSource }),
  buildingType: "condo",
  setBuildingType: (buildingType) => set({ buildingType }),
  bonuses: {},
  setBonuses: (bonuses) => set({ bonuses }),
  assumptions: {},
  layers: SIMPLE_LAYERS,
  setLayer: (k, on) => set((s) => ({ layers: { ...s.layers, [k]: on } })),
  setAssumptions: (assumptions) => set({ assumptions }),
  restoreScenario: (sc) => {
    set((s) => ({ ...sc, plotError: null, restoreSeq: s.restoreSeq + 1 }));
    get().commit();
  },
  compute: null,
  setCompute: (compute) => set({ compute }),
  designs: [],
  setDesigns: (designs) => set({ designs }),
  selectedDesign: "A",
  setSelectedDesign: (selectedDesign) => set({ selectedDesign, proof: null }),
  proof: null,
  setProof: (proof) => set({ proof }),
  compareOpen: false,
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  uiMode: "simple",
  setUiMode: (uiMode) => set({ uiMode }),
  units: "m2",
  setUnits: (units) => set({ units }),
  simpleStep: 1,
  setSimpleStep: (simpleStep) => set({ simpleStep }),
  tourStep: null,
  setTourStep: (tourStep) => set({ tourStep }),
  tallerLayer: false,
  setTallerLayer: (tallerLayer) => set({ tallerLayer }),
  dragging: false,
  updating: false,
  setDragging: (dragging) => set({ dragging }),

  mapStyle: "simple",
  setMapStyle: (mapStyle) => set({ mapStyle }),
  plotAreas: null,
  setPlotAreas: (plotAreas) => set({ plotAreas }),

  history: { entries: [{ plot: null, roadEdges: {}, roadEdgesSource: "auto", buildingType: "condo", bonuses: {}, assumptions: {} }], index: 0 },
  commit: () =>
    set((s) => {
      const cur = snap(s);
      const { entries, index } = s.history;
      if (same(entries[index], cur)) return s;
      let next = [...entries.slice(0, index + 1), cur];
      if (next.length > HISTORY_MAX) next = next.slice(next.length - HISTORY_MAX);
      return { history: { entries: next, index: next.length - 1 } };
    }),
  amendCurrent: () =>
    set((s) => {
      const { entries, index } = s.history;
      const cur = snap(s);
      if (same(entries[index], cur)) return s;
      const next = entries.slice();
      next[index] = cur;
      return { history: { entries: next, index } };
    }),
  undo: () => {
    const { history } = get();
    if (history.index <= 0) return false;
    const index = history.index - 1;
    set((s) => ({ ...history.entries[index], plotError: null, history: { entries: history.entries, index }, restoreSeq: s.restoreSeq + 1 }));
    return true;
  },
  redo: () => {
    const { history } = get();
    if (history.index >= history.entries.length - 1) return false;
    const index = history.index + 1;
    set((s) => ({ ...history.entries[index], plotError: null, history: { entries: history.entries, index }, restoreSeq: s.restoreSeq + 1 }));
    return true;
  },
  restoreSeq: 0,
}));

// Test handle: dev builds, or ?perf=1 (performance measurement in the production build).
if (typeof window !== "undefined" && (process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("perf"))) {
  (window as unknown as { __plotwiseStore?: typeof useStore }).__plotwiseStore = useStore;
}

// Dev-only: expose the pure engine for in-page benchmarks.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  void import("@/engine").then((m) => ((window as unknown as { __plotwiseEngine?: typeof m }).__plotwiseEngine = m));
}
