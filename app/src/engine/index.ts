// computeAll(inputs) → rules, gate, envelopes (designs and checker arrive in M3). Pure.
import { area, centroidLngLat, dist, edges, makeFrame, openRing, pointSegDist, type LngLat, type XY } from "./geo";
import { validatePlot } from "./polygon";
import { computeEnvelope, type EdgeSpec, type Envelope, type FloorHeights } from "./envelope";
import { highRiseGate, type GateResult } from "./classify";
import { farLimit, openSpace, type BuildingType, type FarResult, type OpenSpaceResult } from "./far";
import { clampRoadWidth, DESIGN_ASSUMPTIONS, resolveAssumptions, type AssumptionOverrides } from "./assumptions";
import { generateDesigns, type Design } from "./designs";
import { checkDesign, type CheckRow } from "./checker";
import type { StationResult } from "./siteChecks";

export interface ComputeInputs {
  /** Plot ring as drawn (lon/lat, open or closed). */
  plot: LngLat[];
  /** Road edges: drawn-ring edge index (vertex i → i+1) → right-of-way width (m). */
  roadEdges: Record<number, number>;
  type: BuildingType;
  bonusPcts?: number[];
  floors?: FloorHeights;
  /** Edited design assumptions (defaults for the type when absent). */
  assumptions?: AssumptionOverrides;
}

export interface EnvelopeFeature {
  cls: "highRise" | "lowRise";
  index: number;
  base: number;
  top: number;
  /** lon/lat polygons (outer + holes, closed rings). */
  polygons: LngLat[][][];
}

export type ComputeStatus = "ok" | "invalid" | "no-road";

export interface ComputeResult {
  status: ComputeStatus;
  message?: string;
  plotAreaM2: number;
  far: FarResult;
  openSpaceAtMaxGfa: OpenSpaceResult;
  roadEdges: { edge: number; widthM: number; lengthM: number; clamped: boolean }[];
  gate: GateResult | null;
  envelopes: { highRise: Envelope | null; lowRise: Envelope | null };
  /** True if some envelope has a floor plate ≥ the minimum usable plate. */
  buildable: boolean;
  notBuildableReason?: string;
  features: EnvelopeFeature[];
  /** Normalised plot ring (local metres, frame origin = drawn centroid) and per-edge specs, for designs. */
  geometry: { origin: LngLat; ring: XY[]; specs: EdgeSpec[]; drawnEdgeOf: number[] } | null;
  /** The plot as drawn (open ring, lon/lat): the checker measures against this, not the normalised ring. */
  drawnPlot: LngLat[];
  ms: number;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function computeAll(inp: ComputeInputs): ComputeResult {
  const t0 = now();
  const asm = resolveAssumptions(inp.type, inp.assumptions);
  const floors = inp.floors ?? { groundM: asm.groundFloorM, typicalM: asm.typicalFloorM };
  const drawn = openRing(inp.plot);
  const [lon0, lat0] = drawn.length ? centroidLngLat(drawn) : [0, 0];
  const f = makeFrame(lon0, lat0);
  const drawnXY = drawn.map(f.toXY);
  const plotAreaM2 = drawnXY.length >= 3 ? area(drawnXY) : 0;
  const far = farLimit(plotAreaM2, inp.bonusPcts ?? []);
  const os = openSpace(inp.type, plotAreaM2, far.maxGfaM2);
  const base: ComputeResult = {
    status: "ok",
    plotAreaM2,
    far,
    openSpaceAtMaxGfa: os,
    roadEdges: [],
    gate: null,
    envelopes: { highRise: null, lowRise: null },
    buildable: false,
    features: [],
    geometry: null,
    drawnPlot: drawn,
    ms: 0,
  };
  const done = (r: ComputeResult) => ({ ...r, ms: now() - t0 });

  const v = validatePlot(drawnXY);
  if (!v.ok) return done({ ...base, status: "invalid", message: v.reason, notBuildableReason: v.reason });
  const ring = v.ring;

  // Road edges on the drawn ring, widths clamped to the input range.
  const drawnEdges = edges(drawnXY);
  const roadEdges = Object.entries(inp.roadEdges)
    .map(([k, w]) => ({ edge: Number(k), w }))
    .filter(({ edge }) => edge >= 0 && edge < drawnEdges.length)
    .map(({ edge, w }) => {
      const c = clampRoadWidth(w);
      const [a, b] = drawnEdges[edge];
      return { edge, widthM: c.value, lengthM: dist(a, b), clamped: c.clamped };
    });
  base.roadEdges = roadEdges;
  if (!roadEdges.length) return done({ ...base, status: "no-road", message: "Mark at least one plot edge that faces a road.", notBuildableReason: "No road edge selected." });

  // Map each normalised edge back to the drawn edge it lies on (normalisation may drop or reorder vertices).
  const widthByDrawn = new Map(roadEdges.map((r) => [r.edge, r.widthM]));
  const drawnEdgeOf: number[] = [];
  const specs: EdgeSpec[] = edges(ring).map(([a, b]) => {
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let best = -1;
    let bestD = Infinity;
    drawnEdges.forEach(([c, d], i) => {
      const dd = pointSegDist(mid, c, d);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    drawnEdgeOf.push(best);
    return { roadWidthM: bestD < 0.1 ? (widthByDrawn.get(best) ?? null) : null };
  });

  const gate = highRiseGate(roadEdges);
  const lowRise = computeEnvelope(ring, specs, "lowRise", floors);
  const highRise = gate.permitted ? computeEnvelope(ring, specs, "highRise", floors) : null;

  const minPlate = DESIGN_ASSUMPTIONS.minPlateM2;
  const usable = (e: Envelope | null) => !!e && e.slices.some((s) => s.areaM2 >= minPlate);
  const buildable = usable(lowRise) || usable(highRise);

  const features: EnvelopeFeature[] = [];
  for (const e of [highRise, lowRise]) {
    if (!e) continue;
    for (const s of e.slices) {
      features.push({
        cls: e.cls,
        index: s.index,
        base: s.base,
        top: s.top,
        polygons: s.polys.map((poly) => poly.map((r) => r.map((p) => f.toLngLat(p as XY)))),
      });
    }
  }

  return done({
    ...base,
    gate,
    envelopes: { highRise, lowRise },
    buildable,
    notBuildableReason: buildable ? undefined : `Not buildable: too narrow for setbacks (no floor plate ≥ ${minPlate} m²).`,
    features,
    geometry: { origin: [lon0, lat0], ring, specs, drawnEdgeOf },
  });
}

// ---------------- designs + independent checklist (M3) ----------------

export interface DesignResult {
  design: Design;
  /** Floors in lon/lat for the map and the checker. */
  floors: { index: number; base: number; top: number; use: string; areaM2: number; polygons: LngLat[][][] }[];
  checks: CheckRow[];
  summary: { pass: number; fail: number; info: number };
}

export function computeDesigns(r: ComputeResult, inp: { type: BuildingType; bonusPcts?: number[]; station?: StationResult | null; assumptions?: AssumptionOverrides }): DesignResult[] {
  if (r.status !== "ok" || !r.geometry || !r.gate) return [];
  const g = r.geometry;
  const fr = makeFrame(g.origin[0], g.origin[1]);
  const a = resolveAssumptions(inp.type, inp.assumptions);
  const designs = generateDesigns({ ring: g.ring, specs: g.specs, type: inp.type, plotAreaM2: r.plotAreaM2, far: r.far, gate: r.gate, a });
  const roadWidths = Object.fromEntries(r.roadEdges.map((e) => [e.edge, e.widthM]));
  return designs.map((d) => {
    // Report the binding edge as the DRAWN edge (what the user sees and the labels use).
    if (d.limitedBy?.edge !== undefined) {
      const drawn = g.drawnEdgeOf[d.limitedBy.edge] ?? d.limitedBy.edge;
      d.limitedBy = { ...d.limitedBy, edge: drawn, label: d.limitedBy.label.replace(/edge \d+/, `edge ${drawn + 1}`) };
    }
    const floors = d.floors.map((fl) => ({
      index: fl.index,
      base: fl.base,
      top: fl.top,
      use: fl.use,
      areaM2: fl.areaM2,
      polygons: fl.polys.map((poly) => poly.map((ring) => ring.map((p) => fr.toLngLat(p as XY)))),
    }));
    const checks = d.buildable
      ? checkDesign({
          plot: r.drawnPlot,
          roadEdges: roadWidths,
          type: inp.type,
          bonusPcts: inp.bonusPcts ?? [],
          floors,
          openAirStalls: d.parking.openAirStalls,
          station: inp.station ?? null,
          assumptions: {
            permeableShare: a.permeableShare,
            efficiency: a.efficiency,
            condoUnitM2: a.condoUnitM2,
            hotelRoomM2: a.hotelRoomM2,
            parkingStallM2: a.parkingStallM2,
            parkingInFar: a.parkingInFar,
          },
        })
      : [];
    const summary = { pass: checks.filter((c) => c.status === "PASS").length, fail: checks.filter((c) => c.status === "FAIL").length, info: checks.filter((c) => c.status === "INFO").length };
    return { design: d, floors, checks, summary };
  });
}
