// INDEPENDENT checklist (BUILD_PLAN §7). It re-measures the final floors in its own frame and re-derives
// every limit from the rule JSON. It must NOT import setbacks.ts, envelope.ts, far.ts or designs/*:
// a generator bug then shows up as a FAIL instead of being repeated here (EXPECTATIONS G.1).
import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import { area, centroidLngLat, dist, edges, makeFrame, openRing, perimeter, pointInRing, segSegDist, signedArea, type LngLat, type XY } from "./geo";
import { RULES } from "./rules";
import type { StationResult } from "./siteChecks";

export type CheckStatus = "PASS" | "FAIL" | "INFO";

/** Geometry that proves a row, for "proof on the model" (lon/lat). */
export interface Cause {
  /** Amber 3D blocks (floors, sky-plane steps, worst-corner marker). */
  extrusions?: { base: number; top: number; polygon: LngLat[][] }[];
  /** Amber ground areas (setback strips, open space). */
  ground?: LngLat[][][];
  /** Amber lines (edges, building sides). */
  lines?: LngLat[][];
  /** Points the camera should frame. */
  focus: LngLat[];
}

export interface CheckRow {
  id: string;
  label: string;
  value: string;
  limit: string;
  status: CheckStatus;
  clause: string;
  /** Row depends on a design assumption (e.g. permeable share). */
  assumption?: boolean;
  cause?: Cause;
  /** The checker's own measured quantity (FAR row: gross floor area, m²) for the area statement. */
  measured?: number;
}

export interface CheckFloor {
  base: number;
  top: number;
  use: string;
  /** lon/lat polygons, closed rings. */
  polygons: LngLat[][][];
}

export interface CheckInput {
  plot: LngLat[];
  /** Drawn-ring edge index → road right-of-way width (m). */
  roadEdges: Record<number, number>;
  type: "condo" | "office" | "hotel";
  bonusPcts: number[];
  floors: CheckFloor[];
  openAirStalls: number;
  station: StationResult | null;
  assumptions: { permeableShare: number; efficiency: number; condoUnitM2: number; hotelRoomM2: number; parkingStallM2: number };
}

const TOL_M = 0.01;
const TOL_M2 = 0.01;
/** Road-face heuristic (plan §7 row 10): a building side counts as facing the road below this angle. */
const ROAD_FACE_MAX_ANGLE_DEG = 30;
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "–");
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "–");
const f0 = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

function mpArea(mp: MultiPolygon): number {
  let s = 0;
  for (const poly of mp) poly.forEach((r, i) => (s += (i === 0 ? 1 : -1) * Math.abs(signedArea(r as XY[]))));
  return s;
}

/** Shortest distance between a set of polygons and a segment (0 if they touch or overlap). */
function polysSegDist(mp: MultiPolygon, a: XY, b: XY): number {
  let m = Infinity;
  for (const poly of mp) {
    for (const ring of poly) for (const [c, d] of edges(ring as XY[])) m = Math.min(m, segSegDist(a, b, c, d));
    if (pointInRing(a, poly[0] as XY[]) || pointInRing(b, poly[0] as XY[])) m = 0;
  }
  return m;
}

function acuteAngle(a: XY, b: XY, c: XY, d: XY): number {
  const t = Math.abs(((Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(d[1] - c[1], d[0] - c[0])) * 180) / Math.PI) % 180;
  return t > 90 ? 180 - t : t;
}

/** Inward unit normal of plot edge a→b (works for CW or CCW rings). */
function inwardNormal(a: XY, b: XY, ring: XY[]): XY {
  const L = dist(a, b) || 1;
  const n: XY = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  const mid: XY = [(a[0] + b[0]) / 2 + n[0] * 0.05, (a[1] + b[1]) / 2 + n[1] * 0.05];
  return pointInRing(mid, ring) ? n : [-n[0], -n[1]];
}
/** Band between offsets d0 and d1 inward from plot edge a→b, clipped to the plot. */
function band(a: XY, b: XY, d0: number, d1: number, ring: XY[], plotPc: MultiPolygon): MultiPolygon {
  const n = inwardNormal(a, b, ring);
  const q = (p: XY, d: number): [number, number] => [p[0] + n[0] * d, p[1] + n[1] * d];
  const quad = [[q(a, d0), q(b, d0), q(b, d1), q(a, d1), q(a, d0)]] as unknown as MultiPolygon[number];
  try {
    return polygonClipping.intersection(plotPc, quad);
  } catch {
    return [];
  }
}
/** Vertex of mp closest to segment a-b (worst corner for the sky plane). */
function closestVertex(mp: MultiPolygon, a: XY, b: XY): XY | null {
  let best: XY | null = null;
  let bd = Infinity;
  for (const poly of mp) for (const p of poly[0] as XY[]) {
    const d = segSegDist(p, p, a, b);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

// ---- limits re-derived from the JSON (deliberately not shared with setbacks.ts) ----
function bandFromJson(W: number): number {
  let best = 0;
  for (const b of RULES.roadSetback.bands) {
    const ok =
      (b.roadWidthLtM === undefined || W < b.roadWidthLtM) &&
      (b.roadWidthGteM === undefined || W >= b.roadWidthGteM) &&
      (b.roadWidthLteM === undefined || W <= b.roadWidthLteM) &&
      (b.roadWidthGtM === undefined || W > b.roadWidthGtM);
    if (!ok) continue;
    const raw = b.minFractionOfRoadWidth !== undefined ? b.minFractionOfRoadWidth * W : (b.minM ?? 0);
    best = Math.max(best, b.from === "centreline" ? raw - W / 2 : raw);
  }
  return Math.max(0, best);
}
function clearanceFromJson(H: number): number {
  return Math.max(0, ...RULES.clearance.tiers.map((t) => ((t.heightMaxM !== undefined && H <= t.heightMaxM) || (t.heightGtM !== undefined && H > t.heightGtM) ? t.minM : 0)));
}
function openingsFromJson(H: number, storeys: number): number {
  return Math.max(
    0,
    ...RULES.boundaryOpenings.tiers.map((t) =>
      (t.storeysMin !== undefined && storeys >= t.storeysMin) || (t.orHeightGtM !== undefined && H > t.orHeightGtM) || (t.storeysMax !== undefined && t.heightMaxM !== undefined && storeys <= t.storeysMax && H <= t.heightMaxM)
        ? t.minM
        : 0,
    ),
  );
}
function parkingFromJson(type: CheckInput["type"], gfa: number, units: number, avgUnitM2: number, rooms: number): number {
  const P = RULES.parking;
  const byArea = gfa / P.largeBuildingM2PerSpace;
  let byUse = 0;
  if (type === "office") byUse = gfa / P.officeM2PerSpace;
  else if (type === "condo") byUse = avgUnitM2 > P.condoTriggerUnitM2Over ? units * P.condoPerUnit : 0;
  else if (rooms > 0) {
    const h = P.hotel;
    byUse = h.spacesForFirstRooms;
    if (rooms > h.firstRooms) byUse += Math.ceil((Math.min(rooms, h.upToRooms) - h.firstRooms) / h.thenRoomsPerSpace);
    if (rooms > h.upToRooms) byUse += Math.ceil((rooms - h.upToRooms) / h.aboveRoomsPerSpace);
  }
  return Math.ceil(Math.max(byUse, byArea) - 1e-9);
}
/** Number in a JSON condition string such as "rooms > 80" or "floorArea > 10000". */
function conditionThreshold(cond: string | undefined, key: string): number | null {
  const m = cond && new RegExp(`${key}\\s*>\\s*([\\d.]+)`).exec(cond);
  return m ? Number(m[1]) : null;
}

/** The checker's own measurement of the floors (used by checkDesign and by tests). */
export function measureFloors(plot: LngLat[], floors: CheckFloor[]): { gfaM2: number; heightM: number; storeys: number } {
  const ringLL = openRing(plot);
  const [lon0, lat0] = centroidLngLat(ringLL);
  const fr = makeFrame(lon0, lat0);
  const gfaM2 = floors.reduce((s, f) => s + mpArea(f.polygons.map((poly) => poly.map((r) => r.map((p) => fr.toXY(p) as [number, number]))) as MultiPolygon), 0);
  return { gfaM2, heightM: Math.max(0, ...floors.map((f) => f.top)), storeys: floors.length };
}

export function checkDesign(inp: CheckInput): CheckRow[] {
  const ringLL = openRing(inp.plot);
  const [lon0, lat0] = centroidLngLat(ringLL);
  const fr = makeFrame(lon0, lat0);
  const plot = ringLL.map(fr.toXY);
  const A = area(plot);
  const plotEdges = edges(plot);
  const floors = inp.floors.map((f) => ({ ...f, mp: f.polygons.map((poly) => poly.map((r) => r.map((p) => fr.toXY(p) as [number, number]))) as MultiPolygon }));
  const areas = floors.map((f) => mpArea(f.mp));
  const gfa = areas.reduce((s, a) => s + a, 0);
  const H = Math.max(0, ...floors.map((f) => f.top));
  const storeys = floors.length;
  const mr33 = H >= RULES.highRise.minHeightM || gfa >= RULES.highRise.extraLargeMinGfaM2;

  // Roofed footprint = union of every floor projected to the ground.
  let footprint: MultiPolygon = [];
  try {
    const all = floors.map((f) => f.mp).filter((m) => m.length);
    footprint = all.length ? (all.length > 1 ? polygonClipping.union(all[0], ...all.slice(1)) : all[0]) : [];
  } catch {
    footprint = floors[0]?.mp ?? [];
  }
  const footArea = mpArea(footprint);
  const open = A - footArea;

  const rows: CheckRow[] = [];
  const row = (r: CheckRow) => rows.push(r);
  const LL = (p: XY | [number, number]) => fr.toLngLat(p as XY);
  const mpLL = (mp: MultiPolygon): LngLat[][][] => mp.map((poly) => poly.map((r) => r.map((p) => LL(p as XY))));
  const plotPc: MultiPolygon = [[[...plot.map(([x, y]) => [x, y] as [number, number]), [plot[0][0], plot[0][1]] as [number, number]]]];
  const floorBlocks = (fs: typeof floors) => fs.flatMap((f) => f.mp.map((poly) => ({ base: f.base, top: f.top, polygon: poly.map((r) => r.map((p) => LL(p as XY))) })));
  const focusOf = (mp: MultiPolygon) => mp.flatMap((poly) => (poly[0] as XY[]).map(LL));
  let openArea: MultiPolygon = [];
  try {
    openArea = footprint.length ? polygonClipping.difference(plotPc, footprint) : plotPc;
  } catch {
    openArea = [];
  }
  const openCause = (): Cause => ({ ground: mpLL(openArea), focus: plot.map(LL) });
  const pf = (ok: boolean): CheckStatus => (ok ? "PASS" : "FAIL");

  // 1 FAR
  const bonus = Math.min(RULES.farBonus.capPct, inp.bonusPcts.reduce((s, x) => s + Math.max(0, x), 0));
  const farMax = RULES.far.max * (1 + bonus / 100);
  row({ id: "far", measured: gfa, label: "Floor area ratio", value: `${f2(gfa / A)} (${f0(gfa)} m²)`, limit: `≤ ${f2(farMax)} (${f0(farMax * A)} m²)`, status: pf(gfa <= farMax * A + TOL_M2), clause: RULES.far.source, cause: { extrusions: floorBlocks(floors), focus: focusOf(footprint) } });

  // 2 OSR, 3 permeable, 4 open space % of land
  const osrReq = (RULES.osr.pctOfGfa / 100) * gfa;
  row({ id: "osr", label: "Open space vs floor area", value: `${f0(open)} m²`, limit: `≥ ${f0(osrReq)} m² (${RULES.osr.pctOfGfa} % of floor area)`, status: pf(open >= osrReq - TOL_M2), clause: RULES.osr.source, cause: openCause() });
  const permeable = open * inp.assumptions.permeableShare;
  const permReq = (RULES.permeable.pctOfRequiredOpen / 100) * osrReq;
  row({
    id: "permeable",
    label: "Permeable ground",
    value: `${f0(permeable)} m² (assumed ${Math.round(inp.assumptions.permeableShare * 100)} % of open space)`,
    limit: `≥ ${f0(permReq)} m²`,
    status: pf(permeable >= permReq - TOL_M2),
    clause: RULES.permeable.source,
    assumption: true,
    cause: openCause(),
  });
  const landPct = inp.type === "office" ? RULES.openSpaceLand.nonResidentialPct : RULES.openSpaceLand.residentialPct;
  row({ id: "open-land", label: "Open space vs land", value: `${f1((open / A) * 100)} %`, limit: `≥ ${landPct} % of the plot`, status: pf(open >= (landPct / 100) * A - TOL_M2), clause: RULES.openSpaceLand.clause, cause: openCause() });

  // Road and neighbour edges (drawn ring order).
  const roadIdx = new Set(Object.keys(inp.roadEdges).map(Number));
  const roads = plotEdges.map(([a, b], i) => ({ a, b, i, W: inp.roadEdges[i] })).filter((e) => roadIdx.has(e.i));
  const neighbours = plotEdges.map(([a, b], i) => ({ a, b, i })).filter((e) => !roadIdx.has(e.i));

  // 5 height vs road: every floor, every road edge: top ≤ m × (W + d).
  {
    const m = RULES.skyPlane.multiplier;
    let worst = Infinity;
    let worstTxt = "no road edge";
    let w: { f: (typeof floors)[number]; r: (typeof roads)[number]; d: number } | null = null;
    for (const f of floors) {
      for (const r of roads) {
        const d = polysSegDist(f.mp, r.a, r.b);
        const allowed = m * (r.W + d);
        if (allowed - f.top < worst) {
          worst = allowed - f.top;
          worstTxt = `${f1(f.top)} m at ${f1(d)} m from edge ${r.i + 1} (allowed ${f1(allowed)} m)`;
          w = { f, r, d };
        }
      }
    }
    let cause: Cause | undefined;
    if (w) {
      // The sky plane over that edge, drawn as thin amber steps (2 m bands), up to just past the worst floor.
      const steps: NonNullable<Cause["extrusions"]> = [];
      for (let t = 0; t < w.d + 8 && steps.length < 24; t += 2) {
        const top = m * (w.r.W + t + 1);
        for (const poly of band(w.r.a, w.r.b, t, t + 2, plot, plotPc)) steps.push({ base: Math.max(0, top - 0.5), top, polygon: poly.map((ring) => ring.map((p) => LL(p as XY))) });
      }
      const v = closestVertex(w.f.mp, w.r.a, w.r.b);
      const marker = v ? [{ base: w.f.top - 0.3, top: w.f.top + 1.2, polygon: [[LL([v[0] - 0.8, v[1] - 0.8]), LL([v[0] + 0.8, v[1] - 0.8]), LL([v[0] + 0.8, v[1] + 0.8]), LL([v[0] - 0.8, v[1] + 0.8]), LL([v[0] - 0.8, v[1] - 0.8])]] }] : [];
      cause = { extrusions: [...steps, ...marker], lines: [[LL(w.r.a), LL(w.r.b)]], focus: [LL(w.r.a), LL(w.r.b), ...(v ? [LL(v)] : [])] };
    }
    row({ id: "sky", label: "Height vs road width", value: worstTxt, limit: `≤ ${m} × (road width + distance)`, status: roads.length ? pf(worst >= -TOL_M) : "FAIL", clause: RULES.skyPlane.clause, cause });
  }

  // 6 road setback, 7 boundary setback: measured from every floor.
  const clear = clearanceFromJson(H);
  {
    let ok = roads.length > 0;
    const parts: string[] = [];
    let wr: { r: (typeof roads)[number]; need: number; margin: number } | null = null;
    for (const r of roads) {
      const need = Math.max(bandFromJson(r.W), clear, mr33 ? RULES.highRise.setbackAllM : 0);
      const d = Math.min(...floors.map((f) => polysSegDist(f.mp, r.a, r.b)));
      if (d < need - TOL_M) ok = false;
      parts.push(`edge ${r.i + 1}: ${f2(d)} m (need ${f2(need)})`);
      if (!wr || d - need < wr.margin) wr = { r, need, margin: d - need };
    }
    const roadCause: Cause | undefined = wr ? { ground: mpLL(band(wr.r.a, wr.r.b, 0, wr.need, plot, plotPc)), lines: [[LL(wr.r.a), LL(wr.r.b)]], focus: [LL(wr.r.a), LL(wr.r.b)] } : undefined;
    row({ id: "road-setback", label: "Road setback", value: parts.join("; ") || "no road edge", limit: mr33 ? `band, clearance and ${RULES.highRise.setbackAllM} m (MR 33)` : "band and clearance", status: pf(ok && floors.length > 0), clause: `${RULES.roadSetback.clause}${mr33 ? `; ${RULES.highRise.source}` : ""}`, cause: roadCause });
  }
  {
    const need = mr33 ? RULES.highRise.setbackAllM : Math.max(openingsFromJson(H, storeys), clear);
    let minD = Infinity;
    let closest: (typeof neighbours)[number] | null = null;
    for (const n of neighbours) {
      const d = Math.min(...floors.map((f) => polysSegDist(f.mp, n.a, n.b)));
      if (d < minD) {
        minD = d;
        closest = n;
      }
    }
    row({
      id: "boundary-setback",
      label: "Boundary setback",
      value: neighbours.length ? `${f2(minD)} m (closest)` : "no neighbour edge",
      limit: `≥ ${f2(need)} m`,
      status: pf(!neighbours.length || minD >= need - TOL_M),
      clause: mr33 ? RULES.highRise.source : `${RULES.boundaryOpenings.clause}; ${RULES.clearance.clause}`,
      cause: closest ? { ground: mpLL(band(closest.a, closest.b, 0, need, plot, plotPc)), lines: [[LL(closest.a), LL(closest.b)]], focus: [LL(closest.a), LL(closest.b)] } : undefined,
    });
  }

  // 8 high-rise road access
  if (mr33) {
    const tier = RULES.highRise.roadAccess.find((t) => (t.ifTotalFloorAreaOver !== undefined ? gfa > t.ifTotalFloorAreaOver : gfa <= (t.ifTotalFloorAreaMax ?? Infinity)))!;
    const okEdge = roads.find((r) => r.W >= tier.roadWidthMinM && dist(r.a, r.b) >= tier.frontageMinM);
    row({ id: "hr-access", label: "High-rise road access", value: okEdge ? `edge ${okEdge.i + 1}: road ${f1(okEdge.W)} m, frontage ${f1(dist(okEdge.a, okEdge.b))} m` : "no qualifying road edge", limit: `road ≥ ${tier.roadWidthMinM} m and frontage ≥ ${tier.frontageMinM} m`, status: pf(!!okEdge), clause: RULES.highRise.source, cause: { lines: (okEdge ? [okEdge] : roads).map((r) => [LL(r.a), LL(r.b)]), focus: roads.flatMap((r) => [LL(r.a), LL(r.b)]) } });
  } else {
    row({ id: "hr-access", label: "High-rise road access", value: `not high-rise (${f1(H)} m, ${f0(gfa)} m²)`, limit: "applies to high-rise / extra-large", status: "INFO", clause: RULES.highRise.source });
  }

  // 9 fire-truck ring
  if (mr33) {
    const d = Math.min(...plotEdges.map(([a, b]) => polysSegDist(footprint, a, b)));
    row({ id: "fire-ring", label: "Fire-truck ring", value: `${f2(d)} m clear`, limit: `≥ ${RULES.highRise.fireRoadM} m around the building`, status: pf(d >= RULES.highRise.fireRoadM - TOL_M), clause: RULES.highRise.source, cause: (() => {
      let ringArea: MultiPolygon = [];
      try {
        const strips = plotEdges.map(([a, b]) => band(a, b, 0, RULES.highRise.fireRoadM, plot, plotPc)).filter((x) => x.length);
        ringArea = strips.length ? polygonClipping.union(strips[0], ...strips.slice(1)) : [];
      } catch {
        ringArea = [];
      }
      return { ground: mpLL(ringArea), focus: plot.map(LL) };
    })() });
  } else {
    row({ id: "fire-ring", label: "Fire-truck ring", value: "not high-rise", limit: `${RULES.highRise.fireRoadM} m ring for high-rise`, status: "INFO", clause: RULES.highRise.source });
  }

  // 10 road face (BMA ข้อ 53)
  {
    const rf = RULES.roadFace;
    let facing = 0;
    let perim = 0;
    const facingLines: LngLat[][] = [];
    for (const poly of footprint) {
      const outer = poly[0] as XY[];
      perim += perimeter(outer);
      for (const [a, b] of edges(outer)) {
        if (roads.some((r) => acuteAngle(a, b, r.a, r.b) < ROAD_FACE_MAX_ANGLE_DEG && segSegDist(a, b, r.a, r.b) <= rf.maxDistanceFromRoadM)) {
          facing += dist(a, b);
          facingLines.push([LL(a), LL(b)]);
        }
      }
    }
    row({ id: "road-face", label: "Side facing the road", value: `${f1(facing)} m of ${f1(perim)} m perimeter`, limit: `> ${rf.minFractionOfPerimeter * 100} % of perimeter, ≤ ${rf.maxDistanceFromRoadM} m from road`, status: pf(perim > 0 && facing > rf.minFractionOfPerimeter * perim), clause: rf.clause, cause: { lines: facingLines.length ? facingLines : focusOf(footprint).length ? [focusOf(footprint)] : [], focus: focusOf(footprint) } });
  }

  // 11 parking (re-derived programme and requirement)
  {
    const a = inp.assumptions;
    const usable = floors.reduce((s, f, i) => s + (["residential", "office", "hotel"].includes(f.use) ? areas[i] : 0), 0);
    const net = usable * a.efficiency;
    const units = inp.type === "condo" ? Math.floor(net / a.condoUnitM2) : 0;
    const rooms = inp.type === "hotel" ? Math.floor(net / a.hotelRoomM2) : 0;
    const required = parkingFromJson(inp.type, gfa, units, a.condoUnitM2, rooms);
    const provided = floors.reduce((s, f, i) => s + (f.use === "parking" ? Math.floor(areas[i] / a.parkingStallM2) : 0), 0) + inp.openAirStalls;
    row({ id: "parking", label: "Parking", value: `${provided} stalls`, limit: `≥ ${required} stalls`, status: pf(provided >= required), clause: RULES.parking.source, cause: { extrusions: floorBlocks(floors.filter((f) => f.use === "parking")), focus: focusOf(footprint) } });

    // 12 use permitted in the zone (ข้อ 17)
    const rule = RULES.useLimits.find((u) => u.buildingType === inp.type && "condition" in u && u.condition);
    if (!rule || !("requires" in rule) || !rule.requires) {
      row({ id: "use", label: "Use allowed in zone", value: `${inp.type}: no size or road condition`, limit: "—", status: "PASS", clause: RULES.useLimits.find((u) => u.buildingType === inp.type)?.source ?? "ข้อ 17" });
    } else {
      const thr = conditionThreshold(rule.condition, inp.type === "hotel" ? "rooms" : "floorArea");
      const measure = inp.type === "hotel" ? rooms : gfa;
      const triggered = thr !== null && measure > thr;
      const anyOf = rule.requires.anyOf as { roadWidthMin?: number; stationWithinM?: number }[];
      const roadOk = anyOf.some((c) => c.roadWidthMin !== undefined && roads.some((r) => r.W >= c.roadWidthMin!));
      const st = inp.station;
      const stationOk = st?.status === "known" ? !!st.withinLimit : null;
      const status: CheckStatus = !triggered || roadOk || stationOk === true ? "PASS" : stationOk === null ? "INFO" : "FAIL";
      row({
        id: "use",
        label: "Use allowed in zone",
        value: triggered ? `${inp.type === "hotel" ? `${rooms} rooms` : `${f0(gfa)} m²`}; road ${roadOk ? "ok" : "too narrow"}; station ${stationOk === null ? "unknown" : stationOk ? "within reach" : "too far"}` : `${inp.type === "hotel" ? `${rooms} rooms` : `${f0(gfa)} m²`} (below the trigger)`,
        limit: rule.condition ?? "",
        status,
        clause: rule.source,
      });
    }
  }
  return rows;
}
