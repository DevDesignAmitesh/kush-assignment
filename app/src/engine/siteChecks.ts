// Plot placement checks: is this plot drawn in a sensible place?
// PURE: takes plain data (plot, nearby roads/buildings from OSM, zone polygons), returns issues.
// Thresholds here are app sanity limits, not law; legal numbers live in rules/bangkok-y10.json.
import { RULES } from "./rules";
import polygonClipping, { type MultiPolygon as PcMulti, type Polygon as PcPoly } from "polygon-clipping";
import {
  area,
  bboxIntersects,
  bboxOf,
  centroidLngLat,
  clipLineToRing,
  edges,
  makeFrame,
  openRing,
  perimeter,
  pointSegDist,
  pointInRing,
  segSegDist,
  signedArea,
  type BBox,
  type LngLat,
  type XY,
} from "./geo";

export const SITE_LIMITS = {
  minPlotM2: 50, // below this nothing useful can be built (break-it list)
  largePlotM2: 50_000, // 5 ha: warn, results get heavy (BUILD_PLAN §9)
  narrowWidthM: 10, // approx. width under which setbacks on both sides leave little room
  roadInsideMinM: 2, // ignore road slivers shorter than this (drawing noise)
  accessMaxM: 25, // a public road centreline this close to an edge counts as frontage (BUILD_PLAN §5.2)
  roadEdgeMaxAngleDeg: 30, // a plot edge within this angle of the road is a road edge (BUILD_PLAN §5.2)
  searchPadM: 60, // only look at features this close to the plot
  buildingOnPlotShare: 0.9, // ≥ this share of a building inside the plot ⇒ "on the plot"
  buildingCutMinShare: 0.05, // between this and onPlot share ⇒ boundary cuts the building
  buildingCutMinM2: 5,
  zoneMinShare: 0.02, // ignore zone slivers smaller than 2 % of the plot
} as const;

/** OpenMapTiles `transportation` classes. */
const PUBLIC_ROAD = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "busway"]);
const RAIL = new Set(["rail", "transit"]);
const SERVICE = new Set(["service"]);

export interface SiteRoad {
  cls: string;
  subclass?: string;
  brunnel?: string; // bridge | tunnel | ford
  coords: LngLat[];
}
export interface SiteRoadName {
  name: string;
  cls: string;
  coords: LngLat[];
}
export interface SiteBuilding {
  id: string | number;
  /** One or more polygons (each: outer ring then holes). Tile pieces of one building share an id. */
  polygons: LngLat[][][];
  height?: number;
  minHeight?: number;
}
export interface SiteStation {
  name: string;
  /** massTransit = BTS / MRT / ARL (tile subclass subway, light_rail, monorail); rail = SRT station / halt. */
  kind: "massTransit" | "rail";
  at: LngLat;
}

export interface StationData {
  status: DataStatus;
  list: SiteStation[];
  /** Area the list covers (W, S, E, N); outside it the answer is unknown. */
  bbox: BBox | null;
}

export interface StationResult {
  status: "known" | "unknown";
  nearestMassTransit: { name: string; distM: number } | null;
  nearestRail: { name: string; distM: number } | null;
  /** Mass-transit station within the ข้อ 17 distance of the plot boundary; null when unknown. */
  withinLimit: boolean | null;
  limitM: number;
}

export interface SiteZone {
  code: string;
  category: string;
  polygons: LngLat[][][];
  bbox: BBox; // lon/lat
}

export type DataStatus = "loading" | "ready" | "partial" | "unavailable";

export interface SiteInputs {
  plot: LngLat[];
  context: { status: DataStatus; roads: SiteRoad[]; roadNames: SiteRoadName[]; buildings: SiteBuilding[] };
  stations?: StationData;
  zones: { status: DataStatus; zones: SiteZone[] };
  target: { zoneCode: string; zoneName: string };
}

export type IssueLevel = "error" | "warning" | "info" | "ok";
export interface SiteIssue {
  id: string;
  level: IssueLevel;
  title: string;
  detail?: string;
}

export interface SiteResult {
  issues: SiteIssue[];
  highlights: {
    crossingRoads: LngLat[][];
    serviceRoads: LngLat[][];
    accessRoad: LngLat[] | null;
    cutBuildingIds: (string | number)[];
    onPlotBuildingIds: (string | number)[];
  };
  zoneShares: { code: string; category: string; share: number }[] | null;
  /** True when the plot is inside the target zone (largest share) and nothing blocks results. */
  inScope: boolean;
  /** A blocking problem (wrong zone, outside Bangkok, < min area, invalid): no rules/envelope/designs. */
  blocked: boolean;
  /** Plot edges (index i = vertex i to i+1 of the open ring) that face a detected public road. */
  suggestedRoadEdges: { edge: number; distM: number; roadClass: string; name: string | null }[];
  station: StationResult;
}

/** Issue ids that block results (planning answer Q2). Everything else warns only. */
export const BLOCKING_ISSUES = new Set(["invalid", "too-small", "wrong-zone", "outside-plan"]);

const LEVEL_ORDER: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2, ok: 3 };
const fmt0 = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const pct = (s: number) => `${Math.round(s * 100)}%`;

const CATEGORY_EN: Record<string, string> = {
  residential_low: "low-density residential",
  residential_medium: "medium-density residential",
  residential_high: "high-density residential",
  commercial: "commercial",
  industrial: "industrial",
  warehouse: "warehouse",
  agriculture: "rural & agricultural",
  conservation: "Thai art & culture conservation",
};

/** Approximate width of a plot: the short side of the rectangle with the same area and perimeter. */
export function approxWidth(areaM2: number, perimM: number): number {
  const h = perimM / 2;
  const disc = h * h - 4 * areaM2;
  return disc <= 0 ? Math.sqrt(areaM2) : (h - Math.sqrt(disc)) / 2;
}

function polyArea(mp: PcMulti): number {
  let s = 0;
  for (const poly of mp) {
    poly.forEach((ring, i) => {
      const a = Math.abs(signedArea(ring as XY[]));
      s += i === 0 ? a : -a;
    });
  }
  return s;
}

function nameNear(line: XY[], names: { name: string; xy: XY[] }[]): string | null {
  let best: string | null = null;
  let bestD = 15; // metres
  for (const n of names) {
    for (let i = 0; i + 1 < line.length; i++) {
      for (let j = 0; j + 1 < n.xy.length; j++) {
        const d = segSegDist(line[i], line[i + 1], n.xy[j], n.xy[j + 1]);
        if (d < bestD) {
          bestD = d;
          best = n.name;
        }
      }
    }
  }
  return best;
}

function minDistLineToRing(line: XY[], ring: XY[]): number {
  let m = Infinity;
  const es = edges(ring);
  for (let i = 0; i + 1 < line.length; i++) for (const [c, d] of es) m = Math.min(m, segSegDist(line[i], line[i + 1], c, d));
  return m;
}

function listNames(names: string[], fallback: string): string {
  const u = [...new Set(names)];
  if (u.length === 0) return fallback;
  return u.length <= 2 ? u.join(" and ") : `${u.slice(0, 2).join(", ")} and ${u.length - 2} more`;
}

// Feature coordinate arrays are immutable once read from tiles, so their bboxes can be cached.
const bboxCache = new WeakMap<LngLat[], BBox>();
function cachedBBox(coords: LngLat[]): BBox {
  let b = bboxCache.get(coords);
  if (!b) {
    b = bboxOf(coords);
    bboxCache.set(coords, b);
  }
  return b;
}

/** Per-building cache: its tile pieces with bboxes, and its total footprint area (m²). */
interface BuildingInfo {
  pieces: { poly: LngLat[][]; bbox: BBox }[];
  totalArea: number;
}
const infoCache = new WeakMap<SiteBuilding, BuildingInfo>();
function buildingInfo(b: SiteBuilding): BuildingInfo {
  let info = infoCache.get(b);
  if (info) return info;
  const pieces = b.polygons.filter((p) => p[0]?.length >= 3).map((poly) => ({ poly: poly.map((r) => openRing(r)), bbox: bboxOf(poly[0]) }));
  let totalArea = 0;
  if (pieces.length) {
    const fr = makeFrame(pieces[0].poly[0][0][0], pieces[0].poly[0][0][1]);
    for (const { poly } of pieces) poly.forEach((r, i) => (totalArea += (i === 0 ? 1 : -1) * area(r.map(fr.toXY))));
  }
  info = { pieces, totalArea };
  infoCache.set(b, info);
  return info;
}

/** True if any edge of ring a properly crosses any edge of ring b. */
function ringsCross(a: XY[], b: XY[]): boolean {
  const ea = edges(a);
  const eb = edges(b);
  for (const [p, q] of ea) for (const [r, t] of eb) if (segSegDist(p, q, r, t) === 0) return true;
  return false;
}

export interface BuildingOverlap {
  /** Buildings at least buildingOnPlotShare inside the plot (hidden, assumed demolished). */
  onPlot: (string | number)[];
  /** Buildings the boundary cuts through. */
  cut: (string | number)[];
  /** Every building with real overlap (on-plot, cut and slivers): drawn red while editing. */
  overlapping: (string | number)[];
  onPlotArea: number;
}

/** Which existing buildings a plot overlaps. Fast enough to run on every pointer move. */
export function buildingOverlaps(plot: LngLat[], buildings: SiteBuilding[]): BuildingOverlap {
  const out: BuildingOverlap = { onPlot: [], cut: [], overlapping: [], onPlotArea: 0 };
  const ringLL = openRing(plot);
  if (ringLL.length < 3) return out;
  const [lon0, lat0] = centroidLngLat(ringLL);
  const f = makeFrame(lon0, lat0);
  const ring = ringLL.map(f.toXY);
  if (!(area(ring) > 0)) return out;
  const plotBB = bboxOf(ringLL);
  const plotPc: PcPoly = [ring.map(([x, y]) => [x, y] as [number, number])];
  for (const b of buildings) {
    const info = buildingInfo(b);
    if (info.totalArea <= 0) continue;
    let iArea = 0;
    let touched = false;
    for (const { poly, bbox } of info.pieces) {
      if (!bboxIntersects(bbox, plotBB)) continue;
      touched = true;
      const geom = poly.map((r) => r.map((p) => f.toXY(p) as [number, number]));
      const outer = geom[0] as XY[];
      const pArea = Math.max(0, area(outer) - geom.slice(1).reduce((s2, h) => s2 + area(h as XY[]), 0));
      // Fast paths: wholly inside / wholly outside need no clipping.
      const crosses = ringsCross(outer, ring);
      const inside = outer.filter((v) => pointInRing(v, ring)).length;
      if (!crosses && inside === outer.length) iArea += pArea;
      else if (!crosses && inside === 0 && !pointInRing(ring[0], outer)) continue;
      else {
        try {
          iArea += polyArea(polygonClipping.intersection(plotPc, geom as PcPoly));
        } catch {
          /* malformed tile geometry: skip the piece rather than crash */
        }
      }
    }
    if (!touched || iArea < 1) continue;
    const share = iArea / info.totalArea;
    out.overlapping.push(b.id);
    if (share >= SITE_LIMITS.buildingOnPlotShare) {
      out.onPlot.push(b.id);
      out.onPlotArea += info.totalArea;
    } else if (share >= SITE_LIMITS.buildingCutMinShare && iArea >= SITE_LIMITS.buildingCutMinM2) {
      out.cut.push(b.id);
    }
  }
  return out;
}

/** Plot edges that run along a nearby public road: midpoint within accessMaxM and angle under roadEdgeMaxAngleDeg. */
function suggestRoadEdges(
  ring: XY[],
  roads: { line: XY[]; cls: string }[],
  names: { name: string; xy: XY[] }[],
): SiteResult["suggestedRoadEdges"] {
  const out: SiteResult["suggestedRoadEdges"] = [];
  edges(ring).forEach(([a, b], i) => {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) return;
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let best: { d: number; cls: string; seg: [XY, XY] } | null = null;
    for (const r of roads) {
      for (let k = 0; k + 1 < r.line.length; k++) {
        const p = r.line[k];
        const q = r.line[k + 1];
        const d = pointSegDist(mid, p, q);
        if (d > SITE_LIMITS.accessMaxM || (best && d >= best.d)) continue;
        if (angleBetween([a, b], [p, q]) < SITE_LIMITS.roadEdgeMaxAngleDeg) best = { d, cls: r.cls, seg: [p, q] };
      }
    }
    if (best) out.push({ edge: i, distM: best.d, roadClass: best.cls, name: nameNear([best.seg[0], best.seg[1]], names) });
  });
  return out;
}

/** Acute angle between the directions of two segments, in degrees (0-90). */
export function angleBetween([a, b]: [XY, XY], [c, d]: [XY, XY]): number {
  const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const t2 = Math.atan2(d[1] - c[1], d[0] - c[0]);
  let x = Math.abs(((t1 - t2) * 180) / Math.PI) % 180;
  if (x > 90) x = 180 - x;
  return x;
}

/**
 * Distance from each station point to the plot boundary (0 if inside; plan §5.4 uses the station node).
 * Unknown when the station file has not loaded or the plot is outside the area it covers.
 */
export function stationDistances(plot: LngLat[], data: StationData | undefined, limitM: number): StationResult {
  const unknown: StationResult = { status: "unknown", nearestMassTransit: null, nearestRail: null, withinLimit: null, limitM };
  const ringLL = openRing(plot);
  if (ringLL.length < 3 || !data || data.status !== "ready" || !data.bbox) return unknown;
  const [w, so, e, n] = data.bbox;
  if (!ringLL.every(([lo, la]) => lo >= w && lo <= e && la >= so && la <= n)) return unknown;
  const [lon0, lat0] = centroidLngLat(ringLL);
  const f = makeFrame(lon0, lat0);
  const ring = ringLL.map(f.toXY);
  const dist = (p: XY) => (pointInRing(p, ring) ? 0 : Math.min(...edges(ring).map(([a, b]) => pointSegDist(p, a, b))));
  let mt: { name: string; distM: number } | null = null;
  let rail: { name: string; distM: number } | null = null;
  for (const st of data.list) {
    const d = dist(f.toXY(st.at));
    if (st.kind === "massTransit") {
      if (!mt || d < mt.distM) mt = { name: st.name, distM: d };
    } else if (!rail || d < rail.distM) rail = { name: st.name, distM: d };
  }
  return { status: "known", nearestMassTransit: mt, nearestRail: rail, withinLimit: !!mt && mt.distM <= limitM, limitM };
}

export function checkSite(inp: SiteInputs): SiteResult {
  const issues: SiteIssue[] = [];
  const suggestedRoadEdges: SiteResult["suggestedRoadEdges"] = [];
  const highlights: SiteResult["highlights"] = {
    crossingRoads: [],
    serviceRoads: [],
    accessRoad: null,
    cutBuildingIds: [],
    onPlotBuildingIds: [],
  };
  const ringLL = openRing(inp.plot);
  const [lon0, lat0] = centroidLngLat(ringLL);
  const f = makeFrame(lon0, lat0);
  const ring = ringLL.map(f.toXY);
  const A = area(ring);
  const P = perimeter(ring);
  if (!Number.isFinite(A) || ring.length < 3) {
    return {
      issues: [{ id: "invalid", level: "error", title: "Plot shape is invalid", detail: "Draw at least 3 corners." }],
      highlights,
      zoneShares: null,
      inScope: false,
      blocked: true,
      suggestedRoadEdges: [],
      station: { status: "unknown", nearestMassTransit: null, nearestRail: null, withinLimit: null, limitM: RULES.stationWithinM },
    };
  }

  // Search box in local metres, and its lon/lat equivalent for prefiltering.
  const bb = bboxOf(ring);
  const pad = SITE_LIMITS.searchPadM;
  const swLL = f.toLngLat([bb[0] - pad, bb[1] - pad]);
  const neLL = f.toLngLat([bb[2] + pad, bb[3] + pad]);
  const searchLL: BBox = [swLL[0], swLL[1], neLL[0], neLL[1]];
  const near = (coords: LngLat[]) => bboxIntersects(cachedBBox(coords), searchLL);

  // ---- shape ----
  if (A < SITE_LIMITS.minPlotM2) {
    issues.push({
      id: "too-small",
      level: "error",
      title: `Plot is too small (${fmt0(A)} m²)`,
      detail: `Under ${SITE_LIMITS.minPlotM2} m² nothing useful fits once setbacks apply. Check the corners.`,
    });
  } else if (A >= SITE_LIMITS.largePlotM2) {
    issues.push({
      id: "very-large",
      level: "warning",
      title: `Very large plot (${(A / 10_000).toFixed(1)} ha)`,
      detail: "Is this really one plot? Large sites usually need subdivision and internal roads; results may be slow.",
    });
  }
  const w = approxWidth(A, P);
  if (A >= SITE_LIMITS.minPlotM2 && w < SITE_LIMITS.narrowWidthM) {
    issues.push({
      id: "narrow",
      level: "warning",
      title: `Very narrow plot (about ${w.toFixed(1)} m wide)`,
      detail: "Setbacks on both sides may leave little or no room for a building.",
    });
  }

  // ---- roads ----
  const ctx = inp.context;
  if (ctx.status === "ready" || ctx.status === "partial") {
    const names = ctx.roadNames.filter((n) => near(n.coords)).map((n) => ({ name: n.name, xy: n.coords.map(f.toXY) }));
    const crossing: { name: string | null; length: number; rail: boolean }[] = [];
    const service: number[] = [];
    let access: { d: number; name: string | null; line: LngLat[] } | null = null;
    let nearestAny: { d: number; name: string | null } | null = null;
    const nearRoads: { line: XY[]; cls: string }[] = [];

    for (const r of ctx.roads) {
      if (!near(r.coords)) continue;
      const line = r.coords.map(f.toXY);
      const isPublic = PUBLIC_ROAD.has(r.cls);
      const isRail = RAIL.has(r.cls);
      const isService = SERVICE.has(r.cls);
      if (!isPublic && !isRail && !isService) continue; // footpaths, tracks, etc.

      if (r.brunnel !== "tunnel") {
        const { length, pieces } = clipLineToRing(line, ring);
        if (length >= SITE_LIMITS.roadInsideMinM) {
          if (isPublic || isRail) {
            crossing.push({ name: nameNear(line, names), length, rail: isRail });
            highlights.crossingRoads.push(...pieces.map((p) => p.map(f.toLngLat)));
          } else {
            service.push(length);
            highlights.serviceRoads.push(...pieces.map((p) => p.map(f.toLngLat)));
          }
        }
      }
      if (isPublic && r.brunnel !== "tunnel") {
        const d = minDistLineToRing(line, ring);
        if (!nearestAny || d < nearestAny.d) nearestAny = { d, name: null };
        if (d <= SITE_LIMITS.accessMaxM && (!access || d < access.d)) access = { d, name: null, line: r.coords };
        if (d <= SITE_LIMITS.accessMaxM) nearRoads.push({ line, cls: r.cls });
      }
    }

    suggestedRoadEdges.push(...suggestRoadEdges(ring, nearRoads, names));

    if (crossing.length) {
      const roads = crossing.filter((c) => !c.rail);
      const rails = crossing.filter((c) => c.rail);
      const total = crossing.reduce((s, c) => s + c.length, 0);
      const what = [
        roads.length ? listNames(roads.map((c) => c.name).filter((n): n is string => !!n), roads.length === 1 ? "a road" : `${roads.length} roads`) : null,
        rails.length ? "a rail/BTS line" : null,
      ]
        .filter(Boolean)
        .join(" and ");
      issues.push({
        id: "crosses-road",
        level: "warning",
        title: `Plot crosses ${what}`,
        detail: `About ${fmt0(total)} m of public road or rail runs inside the boundary (red on the map). A plot can't include a public road: move the corners to the road's edge.`,
      });
    }
    if (service.length) {
      issues.push({
        id: "service-road",
        level: "warning",
        title: "A service lane or driveway runs through the plot",
        detail: `About ${fmt0(service.reduce((s, x) => s + x, 0))} m. Fine if it is private and will be removed; otherwise move the boundary.`,
      });
    }
    if (access) {
      const aXY = access.line.map(f.toXY);
      const nm = nameNear(aXY, names);
      highlights.accessRoad = access.line;
      if (!crossing.length) {
        issues.push({
          id: "access",
          level: "ok",
          title: nm ? `Faces ${nm}` : "Has a road next to it",
          detail: `Road centreline ${access.d.toFixed(0)} m from the plot edge. Confirm the road edge and width under Road.`,
        });
      }
    } else if (!crossing.length) {
      issues.push({
        id: "no-access",
        level: "warning",
        title: "No public road next to the plot",
        detail: nearestAny
          ? `The nearest mapped road is about ${fmt0(nearestAny.d)} m away. A building needs a plot edge on a public road; extend the plot to it or check the map.`
          : `No mapped public road within ${SITE_LIMITS.searchPadM} m. A building needs a plot edge on a public road.`,
      });
    }

    // ---- existing buildings ----
    const ov = buildingOverlaps(inp.plot, ctx.buildings);
    highlights.onPlotBuildingIds.push(...ov.onPlot);
    highlights.cutBuildingIds.push(...ov.cut);
    const onPlotArea = ov.onPlotArea;
    if (highlights.cutBuildingIds.length) {
      const n = highlights.cutBuildingIds.length;
      issues.push({
        id: "cuts-buildings",
        level: "warning",
        title: `Boundary cuts through ${n} neighbouring building${n > 1 ? "s" : ""}`,
        detail: "Plot lines normally run between buildings; a corner may be in the wrong place. Check Satellite.",
      });
    }
    if (highlights.onPlotBuildingIds.length) {
      const n = highlights.onPlotBuildingIds.length;
      issues.push({
        id: "on-plot-buildings",
        level: "info",
        title: `${n} existing building${n > 1 ? "s" : ""} on the plot (${fmt0(onPlotArea)} m²)`,
        detail: "Hidden from the 3D view and assumed to be demolished. Dashed outlines show where they stand.",
      });
    }
    if (ctx.status === "partial") {
      issues.push({
        id: "context-partial",
        level: "info",
        title: "Zoom in to check roads and buildings fully",
        detail: "Part of the plot is outside the map area loaded at street level.",
      });
    }
  } else if (ctx.status === "loading") {
    issues.push({ id: "context-loading", level: "info", title: "Checking roads and buildings…" });
  } else {
    issues.push({
      id: "context-unavailable",
      level: "warning",
      title: "Road and building checks unavailable",
      detail: "Map data for this area didn't load. Zoom in on the plot or check your connection.",
    });
  }

  // ---- zone ----
  let zoneShares: SiteResult["zoneShares"] = null;
  let inTarget = false;
  if (inp.zones.status === "ready") {
    const plotBB: BBox = bboxOf(ringLL);
    const cands = inp.zones.zones.filter((z) => bboxIntersects(z.bbox, plotBB));
    const inZone = (p: LngLat, z: SiteZone) =>
      z.polygons.some((poly) => pointInRing(p as XY, poly[0] as XY[]) && !poly.slice(1).some((h) => pointInRing(p as XY, h as XY[])));
    // Fast path: every corner and the centroid in one zone and in no other.
    const pts = [...ringLL, [lon0, lat0] as LngLat];
    const holders = cands.filter((z) => pts.some((p) => inZone(p, z)));
    const shares: { code: string; category: string; share: number }[] = [];
    if (holders.length === 1 && pts.every((p) => inZone(p, holders[0]))) {
      shares.push({ code: holders[0].code, category: holders[0].category, share: 1 });
    } else {
      const plotPc: PcPoly = [ring.map(([x, y]) => [x, y] as [number, number])];
      for (const z of cands) {
        try {
          const zg: PcMulti = z.polygons.map((poly) => poly.map((r) => openRing(r).map((p) => f.toXY(p) as [number, number])));
          const s = polyArea(polygonClipping.intersection(plotPc, zg)) / A;
          if (s >= SITE_LIMITS.zoneMinShare) shares.push({ code: z.code, category: z.category, share: Math.min(1, s) });
        } catch {
          /* skip malformed zone polygon */
        }
      }
    }
    // Merge same codes, sort by share.
    const merged = new Map<string, { code: string; category: string; share: number }>();
    for (const s of shares) {
      const m = merged.get(s.code);
      if (m) m.share += s.share;
      else merged.set(s.code, { ...s });
    }
    zoneShares = [...merged.values()].sort((a, b) => b.share - a.share);
    const covered = zoneShares.reduce((s, z) => s + z.share, 0);
    const top = zoneShares[0];
    const t = inp.target;

    if (!top) {
      issues.push({
        id: "outside-plan",
        level: "error",
        title: "Outside Bangkok's city plan area",
        detail: `This tool covers Bangkok zone ${t.zoneCode} only. Move the plot into Bangkok (zone ${t.zoneCode} has a dashed brown outline on the map).`,
      });
    } else {
      const label = (z: { code: string; category: string }) => `${z.code} (${CATEGORY_EN[z.category] ?? z.category})`;
      if (top.code !== t.zoneCode) {
        issues.push({
          id: "wrong-zone",
          level: "error",
          title: `Plot is in zone ${label(top)}`,
          detail: `This version covers zone ${t.zoneCode} (${t.zoneName}) only, so its rules would be wrong here. Move the plot inside the dashed brown outline (zone ${t.zoneCode}).`,
        });
      } else {
        inTarget = true;
        if (zoneShares.length === 1 && covered > 0.98) {
          issues.push({ id: "zone-ok", level: "ok", title: `Zone ${t.zoneCode} · ${t.zoneName}` });
        }
      }
      if (zoneShares.length > 1) {
        issues.push({
          id: "across-zones",
          level: "warning",
          title: "Plot crosses a zone boundary",
          detail: `${zoneShares.map((z) => `${pct(z.share)} ${z.code}`).join(" · ")}. Each part follows its own zone's rules; this tool uses the largest share.`,
        });
      }
      if (covered < 0.98 && covered > 0) {
        issues.push({
          id: "partly-outside",
          level: "warning",
          title: `${pct(1 - covered)} of the plot is outside the zoning map`,
          detail: "Usually a river, canal or the city boundary. Check the plot outline.",
        });
      }
    }
  } else if (inp.zones.status === "loading") {
    issues.push({ id: "zone-loading", level: "info", title: "Looking up the zone…" });
  } else {
    issues.push({ id: "zone-unavailable", level: "warning", title: "Zoning map unavailable", detail: "Couldn't load the zone boundaries." });
  }

  const station = stationDistances(inp.plot, inp.stations, RULES.stationWithinM);
  const fmtD = (d: number) => (d === 0 ? "on the plot" : `${fmt0(d)} m from the plot`);
  if (station.status === "unknown") {
    issues.push({ id: "station", level: "info", title: "Nearest BTS / MRT station: unknown", detail: "Station data is not loaded, or the plot is outside the area it covers; use limits that depend on it are shown as unknown." });
  } else if (station.nearestMassTransit) {
    const m = station.nearestMassTransit;
    issues.push({
      id: "station",
      level: "info",
      title: `Nearest BTS / MRT: ${m.name}, ${fmtD(m.distM)}`,
      detail: station.withinLimit ? `Within ${station.limitM} m (ข้อ 17 use conditions).` : `More than ${station.limitM} m away (ข้อ 17 use conditions).`,
    });
  } else {
    issues.push({ id: "station", level: "info", title: "No BTS / MRT station in the station list" });
  }
  issues.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const blocked = issues.some((i) => i.level === "error" && BLOCKING_ISSUES.has(i.id));
  return { issues, highlights, zoneShares, inScope: inTarget && !blocked, blocked, suggestedRoadEdges, station };
}
