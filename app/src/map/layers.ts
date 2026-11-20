// Map sources/layers: land-use tint, satellite, 3D OSM buildings, zone shading, plot fill, site highlights.
import type { Map as MlMap, ExpressionSpecification, FilterSpecification, GeoJSONSource } from "maplibre-gl";
import type { SiteBuilding, SiteResult } from "@/engine/siteChecks";
import type { LngLat } from "@/engine/geo";
import { DETAIL_ZOOM, VECTOR_SOURCE } from "@/site/tileContext";
import polygonClipping, { type MultiPolygon as PcMulti } from "polygon-clipping";

export const COLORS = {
  buildingLow: "#e7e5e4",
  buildingHigh: "#57534e",
  buildingCut: "#f87171", // light red, same family as "Built over": amber is only the clicked proof
  buildingOverlap: "#dc2626",
  crossing: "#dc2626",
  service: "#ea580c",
  access: "#16a34a",
  onPlot: "#7f1d1d",
  plotClear: "#16a34a",
  plotOverlap: "#f87171",
  plotBuilt: "#dc2626",
  envelope: "#22d3ee",
  roadEdge: "#2563eb",
  roadEdgeEstimate: "#93c5fd", // light blue: amber is reserved for the clicked proof (direction file §4)
} as const;

/** Height ramp for context buildings: light = low, dark = tall. */
export const HEIGHT_STOPS: [number, string][] = [
  [0, "#ece9e6"],
  [12, "#d9d4cf"],
  [30, "#bdb5ad"],
  [60, "#958b81"],
  [120, "#6f655c"],
  [200, COLORS.buildingHigh],
];

export const SATELLITE = {
  tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
} as const;

const FLAGS = "site-flags";
const ZONES = "zones";
const ZONE_MASK = "zone-mask-src";
const RINGS = "station-rings-src";
/** OpenMapTiles classes whose usual right-of-way is ≥ 10 m (engine/roadDefaults: tertiary 16, secondary 20 …). */
const TALLER_ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary"];
export const OUTSIDE_ZONE = "#d4d1ca";
const BUILDINGS = "ctx-buildings-src";
const PLOT_FILL = "plot-fill-src";
const HATCH = "hatch-built";

/** Simple-mode palette: exactly the categories Amitesh listed, one colour each. */
export const SIMPLE = {
  open: "#f4f1ea", // open or unmapped land (NOT "available")
  park: "#cfe3c0",
  water: "#a9cbe4",
  road: "#ffffff",
  roadCasing: "#cbc5ba",
  building: "#b9b6b0",
} as const;

/** Road width (px at zoom 16) by OpenMapTiles class. */
const ROAD_PX: Record<string, number> = { motorway: 12, trunk: 12, primary: 10, secondary: 8, tertiary: 7, minor: 5, busway: 5, service: 2.5 };
const ENVELOPE = "envelope-src";
const EDGES = "plot-edges-src";
const DESIGN = "design-src";

/** 3 muted tones for design floors and the section strip (direction file §4). */
export const BAND = { parking: "#a8a6a1", podium: "#d4d2cd", main: "#f1f0ec" } as const;
/** Floor colours by use (selected design). */
export const USE_COLORS: Record<string, string> = {
  residential: BAND.main,
  office: BAND.main,
  hotel: BAND.main,
  lobby: BAND.podium,
  amenity: BAND.podium,
  parking: BAND.parking,
};
export const AMBER = "#f59e0b";
const PROOF = "proof-src";
const SETBACKS = "setbacks-src";
const EDGE_LABELS = "plot-edge-labels-src";

function firstSymbolLayer(map: MlMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}
/** First road/rail line layer: satellite and land-use tints go just below it. */
function firstTransportLayer(map: MlMap): string | undefined {
  return map.getStyle().layers?.find((l) => "source-layer" in l && l["source-layer"] === "transportation")?.id;
}

const keyIn = (ids: (string | number)[]): ExpressionSpecification => ["in", ["get", "key"], ["literal", ids]];
const empty = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] });

/** Add all context layers. Call once after style load, BEFORE terra-draw starts (keeps the plot on top). */
export function addContextLayers(map: MlMap, zoneColour: string, opts: { hatch: boolean } = { hatch: true }) {
  const symbols = firstSymbolLayer(map);
  const transport = firstTransportLayer(map);

  // ---- Simple mode base (default): flat, calm, five categories, same OpenFreeMap source ----
  map.addLayer({ id: "simple-bg", type: "background", paint: { "background-color": SIMPLE.open } }, transport);
  map.addLayer(
    {
      id: "simple-park",
      type: "fill",
      source: VECTOR_SOURCE,
      "source-layer": "park",
      paint: { "fill-color": SIMPLE.park },
    },
    transport,
  );
  map.addLayer(
    {
      id: "simple-green",
      type: "fill",
      source: VECTOR_SOURCE,
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["grass", "wood", "wetland", "farmland"]]],
      paint: { "fill-color": SIMPLE.park },
    },
    transport,
  );
  map.addLayer({ id: "simple-water", type: "fill", source: VECTOR_SOURCE, "source-layer": "water", paint: { "fill-color": SIMPLE.water } }, transport);
  map.addLayer(
    {
      id: "simple-waterway",
      type: "line",
      source: VECTOR_SOURCE,
      "source-layer": "waterway",
      paint: { "line-color": SIMPLE.water, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 18, 6] },
    },
    transport,
  );

  // Land-use tints the "liberty" style lacks (commercial / retail / industrial).
  map.addLayer(
    {
      id: "landuse-tint",
      type: "fill",
      source: VECTOR_SOURCE,
      "source-layer": "landuse",
      filter: ["in", ["get", "class"], ["literal", ["commercial", "retail", "industrial", "railway"]]],
      paint: {
        "fill-color": ["match", ["get", "class"], "commercial", "#f6d9e0", "retail", "#f8d5c8", "industrial", "#e3dbea", "#e6e2dc"],
        "fill-opacity": 0.75,
      },
    },
    transport,
  );

  // Satellite imagery is added lazily, the first time Satellite is chosen (setMapStyleMode).

  // Simple roads: white fill with a darker casing, width by class (used in Simple and Satellite modes).
  const roadFilter: FilterSpecification = [
    "all",
    ["in", ["get", "class"], ["literal", Object.keys(ROAD_PX)]],
    ["!=", ["get", "brunnel"], "tunnel"],
  ];
  const w: ExpressionSpecification = ["match", ["get", "class"], ...Object.entries(ROAD_PX).flat(), 3] as unknown as ExpressionSpecification;
  const widthAt = (k: number, add: number): ExpressionSpecification => ["+", ["*", w, k], add];
  map.addLayer(
    {
      id: "simple-road-casing",
      type: "line",
      source: VECTOR_SOURCE,
      "source-layer": "transportation",
      filter: roadFilter,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": SIMPLE.roadCasing,
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 13, widthAt(0.25, 1), 16, widthAt(1, 2), 19, widthAt(5, 3)],
      },
    },
    transport,
  );
  map.addLayer(
    {
      id: "simple-road",
      type: "line",
      source: VECTOR_SOURCE,
      "source-layer": "transportation",
      filter: roadFilter,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": SIMPLE.road,
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 13, widthAt(0.25, 0), 16, widthAt(1, 0), 19, widthAt(5, 0)],
      },
    },
    transport,
  );

  map.addSource(ZONES, { type: "geojson", data: empty() });
  map.addLayer({ id: "zone-fill", type: "fill", source: ZONES, paint: { "fill-color": zoneColour, "fill-opacity": 0.1 } }, symbols);
  map.addLayer(
    {
      id: "zone-line",
      type: "line",
      source: ZONES,
      paint: { "line-color": zoneColour, "line-opacity": 0.45, "line-width": 1.2, "line-dasharray": [3, 2] },
    },
    symbols,
  );

  // Plot split (terra-draw draws only the outline): free part green, part under buildings red + hatch.
  if (!map.hasImage(HATCH)) map.addImage(HATCH, hatchImage(COLORS.plotBuilt));
  map.addSource(PLOT_FILL, { type: "geojson", data: empty() });
  map.addLayer({
    id: "plot-free",
    type: "fill",
    source: PLOT_FILL,
    filter: ["==", ["get", "part"], "free"],
    paint: { "fill-color": COLORS.plotClear, "fill-opacity": 0.3 },
  });
  map.addLayer({
    id: "plot-built",
    type: "fill",
    source: PLOT_FILL,
    filter: ["==", ["get", "part"], "built"],
    paint: { "fill-color": COLORS.plotBuilt, "fill-opacity": 0.28 },
  });
  map.addLayer({
    id: "plot-built-hatch",
    type: "fill",
    source: PLOT_FILL,
    filter: ["==", ["get", "part"], "built"],
    layout: { visibility: opts.hatch ? "visible" : "none" },
    paint: { "fill-pattern": HATCH },
  });

  map.addSource(FLAGS, { type: "geojson", data: empty() });
  map.addLayer({
    id: "flag-onplot",
    type: "line",
    source: FLAGS,
    filter: ["==", ["get", "kind"], "onplot"],
    paint: { "line-color": COLORS.onPlot, "line-width": 1.5, "line-dasharray": [2, 2] },
  });
  map.addLayer({
    id: "flag-access",
    type: "line",
    source: FLAGS,
    filter: ["==", ["get", "kind"], "access"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLORS.access, "line-width": 6, "line-opacity": 0.55 },
  });
  map.addLayer({
    id: "flag-service",
    type: "line",
    source: FLAGS,
    filter: ["==", ["get", "kind"], "service"],
    paint: { "line-color": COLORS.service, "line-width": 4, "line-dasharray": [1.5, 1] },
  });
  map.addLayer({
    id: "flag-crossing",
    type: "line",
    source: FLAGS,
    filter: ["==", ["get", "kind"], "crossing"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLORS.crossing, "line-width": 7, "line-opacity": 0.85 },
  });

  // Buildings come from our own per-building features (tile ids are shared; AI miss #16).
  map.addSource(BUILDINGS, { type: "geojson", data: empty() });
  const ramp = ["interpolate", ["linear"], ["get", "h"], ...HEIGHT_STOPS.flat()] as unknown as ExpressionSpecification;
  const extrusion = (id: string, color: ExpressionSpecification | string, opacity: number, filter: FilterSpecification) =>
    map.addLayer(
      {
        id,
        type: "fill-extrusion",
        source: BUILDINGS,
        minzoom: DETAIL_ZOOM,
        filter,
        paint: {
          "fill-extrusion-color": color,
          "fill-extrusion-height": ["get", "h"],
          "fill-extrusion-base": ["get", "b"],
          "fill-extrusion-opacity": opacity,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      symbols,
    );
  extrusion("ctx-buildings", ramp, 0.9, ["!", keyIn([])]);
  extrusion("ctx-buildings-cut", COLORS.buildingCut, 0.92, keyIn([]));
  extrusion("ctx-buildings-overlap", COLORS.buildingOverlap, 0.92, keyIn([]));

  // Road names in Simple / Satellite mode: only from zoom 16, no POIs.
  map.addLayer({
    id: "simple-road-label",
    type: "symbol",
    source: VECTOR_SOURCE,
    "source-layer": "transportation_name",
    minzoom: 16,
    filter: ["in", ["get", "class"], ["literal", Object.keys(ROAD_PX)]],
    layout: {
      "symbol-placement": "line",
      "text-field": ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
    },
    paint: { "text-color": "#77736c", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });

  // Allowed space: translucent cyan terraces, one extrusion per floor slice (BUILD_PLAN §4.4).
  map.addSource(ENVELOPE, { type: "geojson", data: empty() });
  map.addLayer(
    {
      id: "envelope",
      type: "fill-extrusion",
      source: ENVELOPE,
      paint: {
        "fill-extrusion-color": COLORS.envelope,
        "fill-extrusion-height": ["get", "top"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-opacity": 0.38,
        "fill-extrusion-vertical-gradient": false,
      },
    },
    symbols,
  );

  // Selected design: solid floors, banded by use (slightly thinner than the floor so floors read as bands).
  map.addSource(DESIGN, { type: "geojson", data: empty() });
  map.addLayer(
    {
      id: "design-floors",
      type: "fill-extrusion",
      source: DESIGN,
      paint: {
        "fill-extrusion-color": ["match", ["get", "use"], ...Object.entries(USE_COLORS).flat(), "#fafafa"] as unknown as ExpressionSpecification,
        "fill-extrusion-height": ["-", ["get", "top"], 0.25],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-opacity": 0.97,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    symbols,
  );

  // Draw the solid design BEFORE the translucent envelope: extrusions share one depth buffer, so a design
  // drawn after the envelope is discarded wherever envelope faces are in front of it.
  map.moveLayer("design-floors", "envelope");

  // "Where could I build taller?" (off by default): roads whose class implies ≥ 10 m green, minor sois grey,
  // 500 m rings around mass-transit stations. Road width from class is an estimate (legend says so).
  map.addLayer(
    {
      id: "taller-major",
      type: "line",
      source: VECTOR_SOURCE,
      "source-layer": "transportation",
      layout: { visibility: "none", "line-cap": "round" },
      filter: ["all", ["in", ["get", "class"], ["literal", TALLER_ROAD_CLASSES]], ["!=", ["get", "brunnel"], "tunnel"]],
      paint: { "line-color": "#16a34a", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2, 17, 7], "line-opacity": 0.75 },
    },
    symbols,
  );
  map.addLayer(
    {
      id: "taller-minor",
      type: "line",
      source: VECTOR_SOURCE,
      "source-layer": "transportation",
      layout: { visibility: "none" },
      filter: ["==", ["get", "class"], "minor"],
      paint: { "line-color": "#a8a29e", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 4], "line-opacity": 0.7 },
    },
    symbols,
  );
  map.addSource(RINGS, { type: "geojson", data: empty() });
  map.addLayer({ id: "station-rings", type: "fill", source: RINGS, layout: { visibility: "none" }, paint: { "fill-color": "#2563eb", "fill-opacity": 0.07 } }, symbols);
  map.addLayer({ id: "station-rings-line", type: "line", source: RINGS, layout: { visibility: "none" }, paint: { "line-color": "#2563eb", "line-opacity": 0.45, "line-dasharray": [2, 2] } }, symbols);

  // Everything outside zone ย.10 is greyed: v1 only covers that zone (DEVIATIONS post-M3).
  map.addSource(ZONE_MASK, { type: "geojson", data: empty() });
  map.addLayer({ id: "zone-mask", type: "fill", source: ZONE_MASK, paint: { "fill-color": OUTSIDE_ZONE, "fill-opacity": 0.68 } });
  map.moveLayer("zone-line");

  // Proof on the model: the clicked check's cause, amber, above everything else.
  map.addSource(PROOF, { type: "geojson", data: empty() });
  map.addLayer({ id: "proof-ground", type: "fill", source: PROOF, filter: ["==", ["get", "k"], "ground"], paint: { "fill-color": AMBER, "fill-opacity": 0.55 } });
  map.addLayer({ id: "proof-line", type: "line", source: PROOF, filter: ["==", ["get", "k"], "line"], layout: { "line-cap": "round" }, paint: { "line-color": AMBER, "line-width": 6 } });
  map.addLayer({
    id: "proof-ext",
    type: "fill-extrusion",
    source: PROOF,
    filter: ["==", ["get", "k"], "ext"],
    paint: { "fill-extrusion-color": AMBER, "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.88 },
  });
  // Setbacks (Expert toggle, off by default): the strip between the plot edge and the ground-floor allowed
  // space, plus its inner boundary dashed. On the ground, under the 3D layers.
  map.addSource(SETBACKS, { type: "geojson", data: empty() });
  map.addLayer({ id: "setbacks-band", type: "fill", source: SETBACKS, layout: { visibility: "none" }, filter: ["==", ["get", "k"], "band"], paint: { "fill-color": "#0e7490", "fill-opacity": 0.22 } }, "ctx-buildings");
  map.addLayer({ id: "setbacks-line", type: "line", source: SETBACKS, layout: { visibility: "none" }, filter: ["==", ["get", "k"], "edge"], paint: { "line-color": "#0e7490", "line-width": 2, "line-dasharray": [2, 1.5] } }, "ctx-buildings");
  // Plot fills belong on the ground, under every 3D layer (otherwise they tint the design and envelope).
  for (const id of ["plot-free", "plot-built", "plot-built-hatch"]) map.moveLayer(id, "ctx-buildings");

  // Plot edges: road edges drawn thick blue (light blue while the width is an unconfirmed estimate);
  // a wide invisible hit line on every edge makes them clickable.
  map.addSource(EDGES, { type: "geojson", data: empty() });
  map.addLayer({
    id: "plot-edge-road",
    type: "line",
    source: EDGES,
    filter: ["==", ["get", "road"], true],
    layout: { "line-cap": "round" },
    paint: { "line-color": ["case", ["get", "confirmed"], COLORS.roadEdge, COLORS.roadEdgeEstimate], "line-width": 7, "line-opacity": 0.9 },
  });
  map.addLayer({ id: "plot-edge-hit", type: "line", source: EDGES, paint: { "line-color": "#000", "line-width": 22, "line-opacity": 0.001 } });
  map.addSource(EDGE_LABELS, { type: "geojson", data: empty() });
  map.addLayer({
    id: "plot-edge-labels",
    type: "symbol",
    source: EDGE_LABELS,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-offset": [0, -1.2],
      // Hide labels without room rather than overlap (direction file §3.6); road edges win.
      "text-allow-overlap": false,
      "text-padding": 6,
      "symbol-sort-key": ["coalesce", ["get", "prio"], 0],
    },
    paint: { "text-color": ["case", ["to-boolean", ["get", "road"]], "#1e3a8a", "#57534e"], "text-halo-color": "#ffffff", "text-halo-width": 2 },
  });
}

/** Envelope slices for the class being shown. */
export function setEnvelopeData(map: MlMap, features: { cls: string; base: number; top: number; polygons: LngLat[][][] }[], cls: string | null) {
  const fs: GeoJSON.Feature[] = cls
    ? features
        .filter((f) => f.cls === cls)
        .flatMap((f) => f.polygons.map((poly) => ({ type: "Feature" as const, properties: { base: f.base, top: f.top }, geometry: { type: "Polygon" as const, coordinates: poly } })))
    : [];
  (map.getSource(ENVELOPE) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: fs });
}

/** Plot edges (drawn ring) with their road state, plus width labels on road edges. */
/** An edge label: text at the edge midpoint, or text at an explicit point (one label for a run of road edges). */
export type EdgeLabel = string | { text: string; at: LngLat };

export function setPlotEdges(map: MlMap, plot: LngLat[] | null, roads: Record<number, { widthM: number; confirmed: boolean }>, labelText?: Record<number, EdgeLabel>) {
  const lines: GeoJSON.Feature[] = [];
  const labels: GeoJSON.Feature[] = [];
  if (plot && plot.length >= 4) {
    const n = plot.length - 1;
    for (let i = 0; i < n; i++) {
      const a = plot[i];
      const b = plot[i + 1];
      const r = roads[i];
      lines.push({ type: "Feature", properties: { edge: i, road: !!r, confirmed: !!r?.confirmed }, geometry: { type: "LineString", coordinates: [a, b] } });
      if (labelText) {
        const l = labelText[i];
        if (l) {
          const text = typeof l === "string" ? l : l.text;
          const at = typeof l === "string" ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : l.at;
          labels.push({ type: "Feature", properties: { label: text, road: !!r, prio: r ? 0 : 1 }, geometry: { type: "Point", coordinates: at } });
        }
      } else if (r) {
        labels.push({
          type: "Feature",
          properties: { label: `Road ${r.widthM % 1 ? r.widthM.toFixed(1) : r.widthM} m${r.confirmed ? "" : " (est.)"}` },
          geometry: { type: "Point", coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
        });
      }
    }
  }
  (map.getSource(EDGES) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: lines });
  (map.getSource(EDGE_LABELS) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: labels });
}

export type MapStyleMode = "simple" | "detailed" | "satellite";

/**
 * Switch Simple / Detailed / Satellite by toggling layer visibility (no setStyle, so terra-draw and
 * our layers survive). `basemapIds` = the liberty style's own layers, captured before we added ours.
 */
export function setMapStyleMode(map: MlMap, mode: MapStyleMode, basemapIds: string[]) {
  const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  const style = map.getStyle();
  for (const id of basemapIds) {
    const l = style.layers?.find((x) => x.id === id);
    const isBuilding = !!l && "source-layer" in l && l["source-layer"] === "building";
    vis(id, mode === "detailed" && !isBuilding);
  }
  for (const id of ["simple-bg", "simple-park", "simple-green", "simple-water", "simple-waterway"]) vis(id, mode === "simple");
  for (const id of ["simple-road-casing", "simple-road", "simple-road-label"]) vis(id, mode !== "detailed");
  for (const id of ["simple-road-casing", "simple-road"]) if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", mode === "satellite" ? 0.6 : 1);
  if (mode === "satellite" && !map.getSource("satellite")) {
    // Lazy: no satellite tiles are requested until the user asks for them. Above land use, below roads.
    map.addSource("satellite", { type: "raster", tiles: [...SATELLITE.tiles], tileSize: 256, maxzoom: 19, attribution: SATELLITE.attribution });
    const below = map.getLayer("simple-road-casing") ? "simple-road-casing" : firstTransportLayer(map);
    map.addLayer({ id: "satellite", type: "raster", source: "satellite" }, below);
  }
  vis("satellite", mode === "satellite");
  // Detailed-only extras (Amitesh: Simple shows exactly the listed categories).
  for (const id of ["landuse-tint", "zone-fill", "flag-access", "flag-service"]) vis(id, mode === "detailed");
  // The zone boundary stays visible in every mode: the wrong-zone message points to it.
  vis("zone-line", true);
  if (map.getLayer("zone-line")) map.setPaintProperty("zone-line", "line-width", mode === "detailed" ? 1.2 : 2);
  if (map.getLayer("ctx-buildings")) {
    map.setPaintProperty("ctx-buildings", "fill-extrusion-color", mode === "detailed" ? heightRamp() : SIMPLE.building);
    map.setPaintProperty("ctx-buildings", "fill-extrusion-opacity", mode === "satellite" ? 0.55 : 0.9);
  }
}

/** Free (green) and built (red hatched) parts of the plot. */
export function setPlotSplit(map: MlMap, split: { free: LngLat[][][]; built: LngLat[][][] } | null) {
  const features: GeoJSON.Feature[] = [];
  if (split) {
    for (const poly of split.free) features.push({ type: "Feature", properties: { part: "free" }, geometry: { type: "Polygon", coordinates: poly } });
    for (const poly of split.built) features.push({ type: "Feature", properties: { part: "built" }, geometry: { type: "Polygon", coordinates: poly } });
  }
  (map.getSource(PLOT_FILL) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
}

/** 12 × 12 diagonal hatch image for the built part of the plot. */
function hatchImage(color: string): { width: number; height: number; data: Uint8Array } {
  const n = 12;
  const data = new Uint8Array(n * n * 4);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const on = (x + y) % n < 2; // 2 px diagonal stripe
      const i = (y * n + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = on ? 200 : 0;
    }
  }
  return { width: n, height: n, data };
}

function heightRamp(): ExpressionSpecification {
  return ["interpolate", ["linear"], ["get", "h"], ...HEIGHT_STOPS.flat()] as unknown as ExpressionSpecification;
}

/** Draw the target zone and grey out everything else. Returns the zone's bounding box (W, S, E, N). */
export function setZoneData(map: MlMap, geojson: GeoJSON.FeatureCollection, zoneCode: string): [number, number, number, number] | null {
  const zone = geojson.features.filter((f) => f.properties?.zone === zoneCode);
  (map.getSource(ZONES) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: zone });
  const polys: number[][][][] = [];
  for (const f of zone) {
    const g = f.geometry;
    if (g.type === "Polygon") polys.push(g.coordinates as number[][][]);
    else if (g.type === "MultiPolygon") polys.push(...(g.coordinates as number[][][][]));
  }
  if (!polys.length) return null;
  // Mask = world ring with every zone outer ring as a hole, plus the zone's own holes (enclaves) as grey polygons.
  const world = [[-179, -85], [179, -85], [179, 85], [-179, 85], [-179, -85]];
  const mask: GeoJSON.Feature[] = [
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...polys.map((p) => p[0])] } },
    ...polys.flatMap((p) => p.slice(1).map((hole) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [hole] } }))),
  ];
  (map.getSource(ZONE_MASK) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: mask });
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys) for (const [x, y] of p[0]) {
    w = Math.min(w, x); s = Math.min(s, y); e = Math.max(e, x); n = Math.max(n, y);
  }
  return [w, s, e, n];
}

/** Which buildings to hide / tint as cut / tint red. One place, so live and settled states never fight. */
export function setBuildingFilters(map: MlMap, f: { hide: (string | number)[]; cut: (string | number)[]; red: (string | number)[] }) {
  const special = [...f.hide, ...f.cut, ...f.red];
  if (map.getLayer("ctx-buildings")) map.setFilter("ctx-buildings", ["!", keyIn(special)]);
  if (map.getLayer("ctx-buildings-cut")) map.setFilter("ctx-buildings-cut", keyIn(f.cut));
  if (map.getLayer("ctx-buildings-overlap")) map.setFilter("ctx-buildings-overlap", keyIn(f.red));
}

/** Road highlights and on-plot building outlines from the latest site result. */
export function setSiteFlags(map: MlMap, site: SiteResult | null, buildings: SiteBuilding[]) {
  const h = site?.highlights;
  const features: GeoJSON.Feature[] = [];
  if (h) {
    for (const c of h.crossingRoads) features.push(line(c, "crossing"));
    for (const c of h.serviceRoads) features.push(line(c, "service"));
    if (h.accessRoad && !h.crossingRoads.length) features.push(line(h.accessRoad, "access"));
    const onPlot = new Set(h.onPlotBuildingIds);
    for (const b of buildings) {
      if (!onPlot.has(b.id)) continue;
      for (const poly of b.polygons) features.push({ type: "Feature", properties: { kind: "onplot" }, geometry: { type: "LineString", coordinates: poly[0] } });
    }
  }
  (map.getSource(FLAGS) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
}

/** Replace the 3D context buildings. Default height 9 m when OSM has none (marked approximate in the legend). */
export function setBuildingsData(map: MlMap, buildings: SiteBuilding[]) {
  const features: GeoJSON.Feature[] = buildings.map((b) => ({
    type: "Feature",
    properties: { key: b.id, h: b.height ?? 9, b: b.minHeight ?? 0 },
    geometry: { type: "Polygon", coordinates: b.polygons[0] },
  }));
  (map.getSource(BUILDINGS) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
}

function line(coords: number[][], kind: string): GeoJSON.Feature {
  return { type: "Feature", properties: { kind }, geometry: { type: "LineString", coordinates: coords } };
}

/** Floors of the selected design (null clears). Envelope fades when a design is shown. */
export function setDesignData(map: MlMap, floors: { base: number; top: number; use: string; polygons: LngLat[][][] }[] | null) {
  const features: GeoJSON.Feature[] = (floors ?? []).flatMap((f) =>
    f.polygons.map((poly) => ({ type: "Feature" as const, properties: { base: f.base, top: f.top, use: f.use }, geometry: { type: "Polygon" as const, coordinates: poly } })),
  );
  (map.getSource(DESIGN) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  if (map.getLayer("envelope")) map.setPaintProperty("envelope", "fill-extrusion-opacity", features.length ? 0.16 : 0.38);
}

/** Highlight one check's cause (null clears). */
export function setProofData(map: MlMap, cause: { extrusions?: { base: number; top: number; polygon: LngLat[][] }[]; ground?: LngLat[][][]; lines?: LngLat[][] } | null) {
  const features: GeoJSON.Feature[] = [];
  if (cause) {
    for (const e of cause.extrusions ?? []) features.push({ type: "Feature", properties: { k: "ext", base: e.base, top: e.top }, geometry: { type: "Polygon", coordinates: e.polygon } });
    for (const g of cause.ground ?? []) features.push({ type: "Feature", properties: { k: "ground" }, geometry: { type: "Polygon", coordinates: g } });
    for (const l of cause.lines ?? []) if (l.length >= 2) features.push({ type: "Feature", properties: { k: "line" }, geometry: { type: "LineString", coordinates: l } });
  }
  (map.getSource(PROOF) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
}

/** Rings are drawn only for stations this close to the plot (or map centre), never all of Bangkok. */
export const TALLER_RING_NEAR_M = 2000;

/** Toggle the "Where could I build taller?" layer; rings = 500 m (rule JSON) around mass-transit stations near `near`. */
export function setTallerLayer(map: MlMap, on: boolean, stations: { at: LngLat; kind: string }[], radiusM: number, near: LngLat) {
  for (const id of ["taller-major", "taller-minor", "station-rings", "station-rings-line"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  if (!on) return;
  const features: GeoJSON.Feature[] = stations
    .filter((s) => {
      if (s.kind !== "massTransit") return false;
      const dx = (s.at[0] - near[0]) * 111320 * Math.cos((near[1] * Math.PI) / 180);
      const dy = (s.at[1] - near[1]) * 110574;
      return Math.hypot(dx, dy) <= TALLER_RING_NEAR_M;
    })
    .map((s) => {
      const kx = 111320 * Math.cos((s.at[1] * Math.PI) / 180);
      const ring: LngLat[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * 2 * Math.PI;
        ring.push([s.at[0] + (radiusM * Math.cos(a)) / kx, s.at[1] + (radiusM * Math.sin(a)) / 110574]);
      }
      return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
    });
  (map.getSource(RINGS) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
}

/** Setback strip = plot − ground slice of the allowed space (null / empty clears). */
export function setSetbackData(map: MlMap, plot: LngLat[] | null, ground: LngLat[][][]) {
  const fs: GeoJSON.Feature[] = [];
  if (plot && ground.length) {
    let band: PcMulti = [];
    try {
      band = polygonClipping.difference([[plot as [number, number][]]], ...(ground as unknown as PcMulti[]).map((p) => [p] as unknown as PcMulti));
    } catch {
      band = [];
    }
    for (const poly of band) fs.push({ type: "Feature", properties: { k: "band" }, geometry: { type: "Polygon", coordinates: poly } });
    for (const poly of ground) for (const ring of poly) fs.push({ type: "Feature", properties: { k: "edge" }, geometry: { type: "LineString", coordinates: ring } });
  }
  (map.getSource(SETBACKS) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: fs });
}

export interface LayerToggles {
  envelope: boolean;
  design: boolean;
  setbacks: boolean;
}

/** Expert H.2 toggles: show / hide whole layers (data stays loaded). */
export function setLayerToggles(map: MlMap, t: LayerToggles) {
  const vis = (on: boolean) => (on ? "visible" : "none");
  const ids: [string, boolean][] = [
    ["envelope", t.envelope],
    ["design-floors", t.design],
    ["setbacks-band", t.setbacks],
    ["setbacks-line", t.setbacks],
  ];
  for (const [id, on] of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(on));
}
