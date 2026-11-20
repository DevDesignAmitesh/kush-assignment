// Editable design assumptions (EXPECTATIONS C, DEVIATIONS M5): ranges, and that each edit reaches the
// generators and the independent checker.
import { describe, expect, it } from "vitest";
import { computeAll, computeDesigns, type ComputeInputs, type DesignResult } from "../src/engine";
import { ASSUMPTION_RANGES, assumptionInRange, resolveAssumptions, sanitizeAssumptions } from "../src/engine/assumptions";
import { makeFrame, type LngLat, type XY } from "../src/engine/geo";

const f = makeFrame(100.5446, 13.7797);
const ll = (pts: XY[]): LngLat[] => {
  const r = pts.map(f.toLngLat);
  return [...r, r[0]];
};
const RECT: XY[] = [[-20, -25], [20, -25], [20, 25], [-20, 25]];
const BASE: ComputeInputs = { plot: ll(RECT), roadEdges: { 0: 12 }, type: "condo" };
const run = (inp: ComputeInputs): DesignResult[] => computeDesigns(computeAll(inp), { type: inp.type, bonusPcts: inp.bonusPcts, assumptions: inp.assumptions });
const parkingArea = (d: DesignResult) => d.design.floors.filter((x) => x.use === "parking").reduce((s, x) => s + x.areaM2, 0);
const far = (d: DesignResult) => d.checks.find((c) => c.id === "far")!;

describe("assumption ranges", () => {
  it("defaults follow the type; overrides win; out-of-range and unknown keys are dropped", () => {
    expect(resolveAssumptions("office").typicalFloorM).toBe(3.6);
    expect(resolveAssumptions("condo").typicalFloorM).toBe(3);
    expect(resolveAssumptions("condo", { typicalFloorM: 3.4 }).typicalFloorM).toBe(3.4);
    expect(sanitizeAssumptions({ typicalFloorM: 1, efficiency: Number.NaN, parkingStallM2: 25, x: 3 })).toEqual({ parkingStallM2: 25 });
    for (const [k, r] of Object.entries(ASSUMPTION_RANGES)) {
      expect(assumptionInRange(k as keyof typeof ASSUMPTION_RANGES, r.min)).toBe(true);
      expect(assumptionInRange(k as keyof typeof ASSUMPTION_RANGES, r.max + 1)).toBe(false);
    }
  });
});

describe("edits reach the engine and the checker", () => {
  const base = run(BASE);
  it("taller typical floors → the same design is taller per storey; envelope slices use the same heights", () => {
    const tall = run({ ...BASE, assumptions: { typicalFloorM: 4 } });
    const c0 = base[2].design;
    const c1 = tall[2].design;
    expect(c1.floors[1].top - c1.floors[1].base).toBeCloseTo(4, 6);
    expect(c1.heightM).toBeLessThan(23);
    expect(c1.storeys).toBeLessThanOrEqual(c0.storeys);
    const env = computeAll({ ...BASE, assumptions: { typicalFloorM: 4 } }).envelopes!.lowRise!;
    expect(env.slices[1].top - env.slices[1].base).toBeCloseTo(4, 6);
  });
  it("bigger units → fewer units, and the checker re-derives the same programme", () => {
    const big = run({ ...BASE, assumptions: { condoUnitM2: 70 } });
    expect(big[0].design.programme.units!).toBeLessThan(base[0].design.programme.units!);
    expect(big.every((d) => !d.design.buildable || d.checks.length === 12)).toBe(true);
  });
  it("parking not counted in FAR: more floor area, FAR measured without parking, FAR still passes", () => {
    const off = run({ ...BASE, assumptions: { parkingInFar: false } });
    for (let i = 0; i < 3; i++) {
      const d = off[i];
      if (!d.design.buildable) continue;
      const sum = d.design.floors.reduce((s, x) => s + x.areaM2, 0);
      expect(Math.abs(far(d).measured! - (sum - parkingArea(d)))).toBeLessThan(0.01);
      expect(far(d).status).toBe("PASS");
      expect(d.design.gfaM2).toBeGreaterThanOrEqual(base[i].design.gfaM2 - 0.01);
    }
    // A is FAR-limited at W = 12, so it grows by roughly its parking area.
    expect(off[0].design.gfaM2).toBeGreaterThan(base[0].design.gfaM2 + 100);
  });
  it("default assumptions give the same result as no assumptions", () => {
    const same = run({ ...BASE, assumptions: {} });
    expect(same.map((d) => d.design.gfaM2)).toEqual(base.map((d) => d.design.gfaM2));
  });
});
