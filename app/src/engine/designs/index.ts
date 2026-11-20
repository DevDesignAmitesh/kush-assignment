// Concept designs A / B / C (BUILD_PLAN §6). Pure. Every floor plate is cut from an envelope slice of
// its class at that floor's own height and from the footprint (no overhangs). Plates are offsets from the
// PLOT edges (fast, exact distance semantics; DEVIATIONS M3). Each design reports what limits it.
import { dist, edges, type XY } from "../geo";
import { capsule, multiArea, subtract, toPc, type MultiPolygon, type Polygon } from "../polygon";
import { computeEnvelope, type EdgeSpec, type Envelope } from "../envelope";
import type { GateResult } from "../classify";
import type { BuildingType, FarResult } from "../far";
import { RULES } from "../rules";
import { assignUses, DESIGN_DEFAULTS, floorHeightsFor, programmeFor, type Design, type DesignId, type LimitedBy } from "./common";
import { iterateCoverage, stackFloors, type Stack } from "./stack";
import { defaultAssumptions, type Assumptions } from "../assumptions";

export * from "./common";

export interface DesignContext {
  ring: XY[];
  specs: EdgeSpec[];
  type: BuildingType;
  plotAreaM2: number;
  far: FarResult;
  gate: GateResult;
  /** Editable design assumptions (defaults for the type when absent). */
  a?: Assumptions;
  /** Extra floor area on top of the FAR cap (parking not counted in FAR). Internal. */
  farAllowanceM2?: number;
}

const asm = (ctx: DesignContext): Assumptions => ctx.a ?? defaultAssumptions(ctx.type);

const LOW_RISE_GFA_CAP = () => RULES.highRise.extraLargeMinGfaM2 - 0.01; // "< 10,000 m²"
type CapSource = "far" | "gate" | "lowRiseArea";

function gfaCapFor(ctx: DesignContext, cls: Design["cls"]): { cap: number; source: CapSource } {
  const far = ctx.far.maxGfaM2 + (ctx.farAllowanceM2 ?? 0);
  const other = cls === "highRise" ? ctx.gate.maxGfaM2 : LOW_RISE_GFA_CAP();
  if (far <= other) return { cap: far, source: "far" };
  return { cap: other, source: cls === "highRise" ? "gate" : "lowRiseArea" };
}

const setbacksOf = (env: Envelope, k: number) => env.slices[k].setbacks.map((x) => x.s);

/** What stopped the stack, in the words of the rules. Edge indices are normalised-ring edges. */
function limitedByOf(stack: Stack, env: Envelope, capSource: CapSource, ctx: DesignContext): LimitedBy {
  const far = ctx.far;
  switch (stack.stop) {
    case "gfa":
      if (capSource === "far") return { kind: "far", label: `Floor area ratio (FAR ${+far.far.toFixed(2)})`, clause: far.source };
      if (capSource === "gate") return { kind: "gate", label: `MR 33 road access (≤ ${ctx.gate.maxGfaM2.toLocaleString("en-US")} m² on this road)`, clause: ctx.gate.source };
      return { kind: "lowRiseArea", label: `Low-rise limit (< ${RULES.highRise.extraLargeMinGfaM2.toLocaleString("en-US")} m²)`, clause: RULES.highRise.defSource };
    case "maxFloors":
      return { kind: "lowRiseHeight", label: `Low-rise height (< ${RULES.highRise.minHeightM} m)`, clause: RULES.highRise.defSource };
    case "width":
      return { kind: "width", label: `Tower plate width (≥ ${DESIGN_DEFAULTS.towerPlate.minWidthM} m)`, clause: "design assumption" };
    default: {
      if (env.cls === "lowRise" && stack.stopSlice === null && env.stoppedBy === "class-limit") {
        return { kind: "lowRiseHeight", label: `Low-rise height (< ${RULES.highRise.minHeightM} m)`, clause: RULES.highRise.defSource };
      }
      // Plate too small or the envelope ran out: did the sky plane push an edge in?
      const k = stack.stopSlice ?? env.slices.length - 1;
      if (k >= 0 && k < env.slices.length) {
        const g = env.slices[0].setbacks;
        const s = env.slices[k].setbacks;
        let best = -1;
        let grow = 0;
        s.forEach((x, i) => {
          const d = x.s - g[i].s;
          if (x.governing === "sky" && d > grow + 1e-9) {
            grow = d;
            best = i;
          }
        });
        if (best >= 0) return { kind: "sky", label: `Sky plane on edge ${best + 1}`, edge: best, clause: RULES.skyPlane.clause };
      }
      if (stack.stopSlice === null && env.stoppedBy === "empty") return { kind: "sky", label: "Sky plane (allowed space ends)", clause: RULES.skyPlane.clause };
      return { kind: "plate", label: `Min floor plate (${DESIGN_DEFAULTS.minPlateM2} m²)`, clause: "design assumption" };
    }
  }
}

function assemble(
  id: DesignId,
  name: string,
  cls: Design["cls"],
  ctx: DesignContext,
  stack: Stack & { cap: number; shrunk: boolean },
  env: Envelope,
  capSource: CapSource,
  maxParkingFloors: number,
  notes: string[],
  openAirStalls = 0,
): Design {
  // Copies: assignUses writes each floor's use, and stacks can be shared between parking variants.
  const floors = stack.floors.map((f) => ({ ...f }));
  if (!floors.length) return notBuildable(id, name, cls, `Not buildable: no floor plate of at least ${DESIGN_DEFAULTS.minPlateM2} m² fits the allowed space.`);
  const park = assignUses(ctx.type, floors, maxParkingFloors, openAirStalls, asm(ctx));
  const gfa = floors.reduce((s, f) => s + f.areaM2, 0);
  const footprint = floors[0].areaM2;
  return {
    id,
    name,
    cls,
    buildable: true,
    floors,
    gfaM2: gfa,
    heightM: floors[floors.length - 1].top,
    storeys: floors.length,
    footprintM2: footprint,
    coverageCapM2: stack.cap,
    openSpaceM2: ctx.plotAreaM2 - footprint,
    programme: programmeFor(ctx.type, floors, asm(ctx)),
    parking: { required: park.required, provided: park.provided, openAirStalls, note: park.note },
    notes,
    limitedBy: limitedByOf(stack, env, capSource, ctx),
    footprintShrunkForOpenSpace: stack.shrunk,
  };
}

function notBuildable(id: DesignId, name: string, cls: Design["cls"], reason: string): Design {
  return {
    id,
    name,
    cls,
    buildable: false,
    reason,
    floors: [],
    gfaM2: 0,
    heightM: 0,
    storeys: 0,
    footprintM2: 0,
    coverageCapM2: 0,
    openSpaceM2: 0,
    programme: { netAreaM2: 0 },
    parking: { required: 0, provided: 0, openAirStalls: 0 },
    notes: [],
    limitedBy: null,
    footprintShrunkForOpenSpace: false,
  };
}

// Per-context caches: A, B, C and their parking variants share one envelope per class and one
// plot-offset region cache (the same offsets recur across designs). Pure: keyed by the ctx object.
const ctxCache = new WeakMap<DesignContext, { lowStack?: Stack & { cap: number; shrunk: boolean } }>();
function cacheOf(ctx: DesignContext) {
  let c = ctxCache.get(ctx);
  if (!c) ctxCache.set(ctx, (c = {}));
  return c;
}
// Envelopes and offset regions only depend on the geometry (and floor heights), so they are shared by the
// derived contexts the parking-outside-FAR pass creates.
const envCache = new WeakMap<EdgeSpec[], Map<string, Envelope>>();
const regionCache = new WeakMap<XY[], (d: number[]) => MultiPolygon>();
function envFor(ctx: DesignContext, cls: Design["cls"]): Envelope {
  const fh = floorHeightsFor(ctx.type, asm(ctx));
  let m = envCache.get(ctx.specs);
  if (!m) envCache.set(ctx.specs, (m = new Map()));
  const key = `${cls}|${fh.groundM}|${fh.typicalM}`;
  let e = m.get(key);
  if (!e) m.set(key, (e = computeEnvelope(ctx.ring, ctx.specs, cls, fh)));
  return e;
}
function regionFor(ctx: DesignContext) {
  let r = regionCache.get(ctx.ring);
  if (!r) regionCache.set(ctx.ring, (r = regionMaker(ctx.ring)));
  return r;
}

// ---- plate geometry: offsets measured from the PLOT edges ----

const maxv = (a: number[], b: number[]) => a.map((x, i) => Math.max(x, b[i]));
const addv = (a: number[], d: number) => a.map((x) => x + d);

/** plot − ∪ capsule(edge_i, d_i): every point at least d_i from plot edge i. Cached per design call. */
function regionMaker(ring: XY[]) {
  const es = edges(ring);
  const plot = toPc(ring);
  const cache = new Map<string, MultiPolygon>();
  return (d: number[]): MultiPolygon => {
    const key = d.map((x) => x.toFixed(3)).join("|");
    const hit = cache.get(key);
    if (hit) return hit;
    const cutters = es.map(([p, q], i) => (d[i] > 0 && dist(p, q) > 0 ? capsule(p, q, d[i]) : null)).filter((c): c is Polygon => !!c);
    let r: MultiPolygon;
    try {
      r = subtract(plot, cutters);
    } catch {
      r = [];
    }
    cache.set(key, r);
    return r;
  };
}

/** Smallest uniform extra offset d ≥ 0 (0.1 m) so that region(base + d) has area ≤ maxArea. */
function minExtraOffset(region: (d: number[]) => MultiPolygon, base: number[], maxArea: number): number {
  if (multiArea(region(base)) <= maxArea + 1e-9) return 0;
  if (maxArea <= 0) return Infinity;
  let lo = 0;
  let hi = 1;
  while (multiArea(region(addv(base, hi))) > maxArea && hi < 512) hi *= 2;
  while (hi - lo > DESIGN_DEFAULTS.insetPrecisionM) {
    const mid = (lo + hi) / 2;
    if (multiArea(region(addv(base, mid))) > maxArea) lo = mid;
    else hi = mid;
  }
  return hi;
}

const EMPTY_STACK = (): Stack & { shrunk: boolean } => ({ floors: [], stop: "plate", stopSlice: 0, shrunk: false });

/** A: terraced block. Footprint = ground slice shrunk to the coverage cap; floor k = slice k ∩ footprint. */
export function terracedBlock(ctx: DesignContext): Design {
  const cls = "highRise";
  const env = envFor(ctx, cls);
  const { cap: gfaCap, source } = gfaCapFor(ctx, cls);
  if (!env.slices.length) return notBuildable("A", "Terraced block", cls, "Not buildable: the high-rise setbacks leave no space.");
  const region = regionFor(ctx);
  const s0 = setbacksOf(env, 0);
  const stack = iterateCoverage(ctx.type, ctx.plotAreaM2, gfaCap, (c) => {
    const d = minExtraOffset(region, s0, c);
    if (!Number.isFinite(d)) return EMPTY_STACK();
    const foot = addv(s0, d);
    return { ...stackFloors(env.slices, (_s, k) => region(maxv(setbacksOf(env, k), foot)), gfaCap), shrunk: d > 0 };
  });
  // Parking on the ground and the floors above it, as many as needed.
  return assemble("A", "Terraced block", cls, ctx, stack, env, source, stack.floors.length, []);
}

/** B: podium + tower. 3-floor podium on the coverage-capped footprint; tower plate 450-1,200 m², ≥ 12 m wide. */
export function podiumTower(ctx: DesignContext, podiumFloors: number = DESIGN_DEFAULTS.podiumFloors): Design {
  const cls = "highRise";
  const env = envFor(ctx, cls);
  const T = DESIGN_DEFAULTS.towerPlate;
  const P = podiumFloors;
  const { cap: gfaCap, source } = gfaCapFor(ctx, cls);
  const target = Math.min(T.maxM2, Math.max(T.minM2, T.shareOfPlot * ctx.plotAreaM2));
  if (env.slices.length <= P) return notBuildable("B", "Podium + tower", cls, "Not buildable: no room for a tower above the podium.");
  const region = regionFor(ctx);
  const s0 = setbacksOf(env, 0);
  const stack = iterateCoverage(ctx.type, ctx.plotAreaM2, gfaCap, (c) => {
    const dP = minExtraOffset(region, s0, c);
    if (!Number.isFinite(dP)) return EMPTY_STACK();
    const podium = addv(s0, dP);
    const towerBase = maxv(setbacksOf(env, P), podium);
    const dT = minExtraOffset(region, towerBase, target);
    if (!Number.isFinite(dT)) return EMPTY_STACK();
    const tower = addv(towerBase, dT);
    const st = stackFloors(
      env.slices,
      (_s, k) => {
        if (k < P) return region(maxv(setbacksOf(env, k), podium));
        const off = maxv(setbacksOf(env, k), tower);
        // At least 12 m wide: the plate shrunk by half that width must still exist.
        return multiArea(region(addv(off, T.minWidthM / 2))) > 0 ? region(off) : null;
      },
      gfaCap,
    );
    return { ...st, shrunk: dP > 0 };
  });
  const notes = stack.floors.length && stack.floors.length <= P ? ["No room for a tower above the podium."] : [];
  // Parking only in the podium (plan §4.7: ground + 2 podium floors); a shortfall is reported, not hidden.
  return assemble("B", "Podium + tower", cls, ctx, stack, env, source, Math.min(P, stack.floors.length), notes);
}

/** C: low-rise (< 23 m, < 10,000 m²), max 7 floors, plus an open-air car park in part of the open space. */
export function lowRise(ctx: DesignContext, parkingFloors = 1): Design {
  const env = envFor(ctx, "lowRise");
  const { cap: gfaCap, source } = gfaCapFor(ctx, "lowRise");
  if (!env.slices.length) return notBuildable("C", "Low-rise", "lowRise", "Not buildable: the setbacks leave no space.");
  const region = regionFor(ctx);
  const s0 = setbacksOf(env, 0);
  // The geometry does not depend on parkingFloors (only the use assignment does): computed once per ctx.
  const cache = cacheOf(ctx);
  const stack = (cache.lowStack ??= iterateCoverage(ctx.type, ctx.plotAreaM2, gfaCap, (c) => {
    const d = minExtraOffset(region, s0, c);
    if (!Number.isFinite(d)) return EMPTY_STACK();
    const foot = addv(s0, d);
    return { ...stackFloors(env.slices, (_s, k) => region(maxv(setbacksOf(env, k), foot)), gfaCap, { maxFloors: DESIGN_DEFAULTS.lowRiseMaxFloors }), shrunk: d > 0 };
  }));
  const openSpace = stack.floors.length ? ctx.plotAreaM2 - stack.floors[0].areaM2 : 0;
  const openAir = Math.floor((DESIGN_DEFAULTS.openAirParkingShare * openSpace) / asm(ctx).parkingStallM2);
  return assemble("C", "Low-rise", "lowRise", ctx, stack, env, source, parkingFloors, [], openAir);
}

/**
 * When the MR 33 gate fails only the low-rise design is offered (planning instruction, DEVIATIONS M3 UI):
 * A and B would be low-rise copies of C.
 */
/** Parking must pass when the plot allows it (planning decision): try the variants in order, keep the first that
 *  passes; if none does, keep the first variant and say parking is the limit. */
function firstParkingPass(variants: (() => Design)[]): Design {
  let first: Design | null = null;
  for (const make of variants) {
    const d = make();
    if (!first) first = d;
    if (!d.buildable) return d;
    if (d.parking.provided >= d.parking.required) return d;
  }
  const d = first!;
  if (d.buildable) {
    d.limitedBy = { kind: "parking", label: `Parking (${d.parking.required - d.parking.provided} stalls short)`, clause: RULES.parking.source };
  }
  return d;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const P0 = DESIGN_DEFAULTS.podiumFloors;
const makeA = (c: DesignContext) => firstParkingPass([() => terracedBlock(c)]);
// B: a taller podium holds more parking floors (within FAR and the envelope).
const makeB = (c: DesignContext) => firstParkingPass(range(P0, P0 + 5).map((p) => () => podiumTower(c, p)));
const makeC = (c: DesignContext) => firstParkingPass(range(1, 3).map((n) => () => lowRise(c, n)));

export const parkingAreaOf = (d: Pick<Design, "floors">) => d.floors.filter((f) => f.use === "parking").reduce((s, f) => s + f.areaM2, 0);

/**
 * "Parking counted in floor area: no" (DEVIATIONS M5): parking floors do not count toward the FAR limit, so the
 * design may stack that much more floor area. Re-stack with the parking area as an allowance until it settles;
 * keep a step only if its non-parking floor area still fits the FAR cap.
 */
function parkingOutsideFar(ctx: DesignContext, make: (c: DesignContext) => Design): Design {
  let d = make(ctx);
  if (asm(ctx).parkingInFar || !d.buildable) return d;
  let allowance = 0;
  for (let i = 0; i < 4; i++) {
    const P = parkingAreaOf(d);
    if (P <= allowance + 0.5) break;
    const next = make({ ...ctx, farAllowanceM2: P });
    if (!next.buildable || next.gfaM2 - parkingAreaOf(next) > ctx.far.maxGfaM2 + 0.01) break;
    d = next;
    allowance = P;
  }
  return d;
}

export function generateDesigns(ctx: DesignContext): Design[] {
  const C = parkingOutsideFar(ctx, makeC);
  if (!ctx.gate.permitted) {
    const why = `Not available: ${ctx.gate.reason} Only the low-rise design applies.`;
    return [notBuildable("A", "Terraced block", "highRise", why), notBuildable("B", "Podium + tower", "highRise", why), C];
  }
  return [parkingOutsideFar(ctx, makeA), parkingOutsideFar(ctx, makeB), C];
}
