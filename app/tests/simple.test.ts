// Simple-mode helpers: units, density buckets, verdict colours, what-ifs (DESIGN_DIRECTION §6).
import { describe, expect, it } from "vitest";
import { formatArea, roughly, toRaiNganWah, SQFT_PER_M2 } from "../src/engine/units";
import { bucketFor, densityMeter } from "../src/engine/density";
import { verdictFor, whatIfs, deepen } from "../src/engine/verdict";
import { computeAll, computeDesigns, type ComputeInputs } from "../src/engine";
import { makeFrame, ringAreaM2, type LngLat, type XY } from "../src/engine/geo";
import type { SiteBuilding } from "../src/engine/siteChecks";

const f = makeFrame(100.5446, 13.7797);
const ll = (pts: XY[]): LngLat[] => {
  const r = pts.map(f.toLngLat);
  return [...r, r[0]];
};
const RECT: XY[] = [[-20, -25], [20, -25], [20, 25], [-20, 25]];
const verdict = (inp: ComputeInputs) => {
  const r = computeAll(inp);
  const ds = computeDesigns(r, { type: inp.type });
  return { r, ds, v: verdictFor(r, ds, null) };
};

describe("units (rai-ngan-wah, sq ft)", () => {
  it("1 rai = 1,600 m², 1 ngan = 400 m², 1 sq wah = 4 m²", () => {
    expect(toRaiNganWah(1600)).toEqual({ rai: 1, ngan: 0, wah: 0 });
    expect(toRaiNganWah(2000)).toEqual({ rai: 1, ngan: 1, wah: 0 });
    expect(toRaiNganWah(2004)).toEqual({ rai: 1, ngan: 1, wah: 1 });
    expect(formatArea(2000, "rai")).toBe("1 rai 1 ngan");
    expect(formatArea(10, "rai")).toBe("3 sq wah"); // 2.5 wah rounds to 3
  });
  it("sq ft and m², with Simple rounding", () => {
    expect(SQFT_PER_M2).toBe(10.764);
    expect(formatArea(1000, "sqft")).toBe("10,764 sq ft");
    expect(formatArea(15625, "m2", { round: true })).toBe("15,600 m²");
    expect(roughly(243)).toBe(243);
    expect(roughly(15866)).toBe(15900);
  });
});

describe("density meter", () => {
  it("buckets: Low ≤ 1.5×, Medium ≤ 3×, High > 3×", () => {
    expect([bucketFor(1.5), bucketFor(1.51), bucketFor(3), bucketFor(3.01)]).toEqual(["Low", "Medium", "Medium", "High"]);
  });
  it("median of OSM heights within 300 m; skips far, unknown and on-plot buildings", () => {
    const b = (id: number, x: number, h?: number): SiteBuilding => ({ id, polygons: [[ll([[x, 0], [x + 5, 0], [x + 5, 5], [x, 5]])]], height: h });
    const bs = [b(1, 10, 10), b(2, 20, 12), b(3, 30, 14), b(4, 1000, 99), b(5, 40), b(6, 50, 80)];
    const r = densityMeter(46, bs, f.toLngLat([0, 0]), new Set([6]))!;
    expect(r.count).toBe(3);
    expect(r.medianM).toBe(12);
    expect(r.ratio).toBeCloseTo(46 / 12, 6);
    expect(r.bucket).toBe("High");
  });
});

describe("verdict colour (golden cases)", () => {
  it("W = 12 → green, tall building; numbers = the best passing design, rounded", () => {
    const { v, ds } = verdict({ plot: ll(RECT), roadEdges: { 0: 12 }, type: "condo" });
    expect(v.colour).toBe("green");
    expect(v.sentence).toMatch(/tall building/);
    const best = [...ds].filter((d) => d.design.buildable && !d.summary.fail).sort((a, b) => b.design.gfaM2 - a.design.gfaM2)[0];
    expect(v.best?.design.id).toBe(best.design.id);
    expect(v.numbers).toMatchObject({ gfaM2: roughly(best.design.gfaM2), storeys: best.design.storeys });
  });
  it("W = 8 → amber, low-rise only, why = road width", () => {
    const { v } = verdict({ plot: ll(RECT), roadEdges: { 0: 8 }, type: "condo" });
    expect(v.colour).toBe("amber");
    expect(v.why).toBe("the road is 8 m wide");
    expect(v.open?.row).toBe("hr-access");
  });
  it("8 m-deep plot → red, too narrow", () => {
    const { v } = verdict({ plot: ll([[-25, -4], [25, -4], [25, 4], [-25, 4]]), roadEdges: { 0: 12 }, type: "condo" });
    expect(v.colour).toBe("red");
    expect(v.why).toMatch(/too narrow/);
  });
});

describe("what would let you build more?", () => {
  it("W = 8 → 10 on the demo plot gives a larger floor area (real re-run)", () => {
    const inp: ComputeInputs = { plot: ll(RECT), roadEdges: { 0: 8 }, type: "condo" };
    const r = computeAll(inp);
    const ds = computeDesigns(r, { type: "condo" });
    const w = whatIfs(inp, r, ds, null);
    expect(w.length).toBeGreaterThan(0);
    expect(w.length).toBeLessThanOrEqual(2);
    expect(w[0].text).toMatch(/If the road were 1[02] m wide/);
    expect(w[0].gainM2).toBeGreaterThan(0);
    const w10 = w.find((x) => x.text.includes("10 m"));
    expect(w10).toBeTruthy();
  });
  it("deepen moves only the non-road corners, away from the road", () => {
    const p = deepen(ll(RECT), { 0: 12 }, 4);
    expect(ringAreaM2(p)).toBeCloseTo(2000 + 4 * 40, 0);
  });
  it("an 8 m-deep plot suggests a deeper plot", () => {
    const inp: ComputeInputs = { plot: ll([[-25, -4], [25, -4], [25, 4], [-25, 4]]), roadEdges: { 0: 12 }, type: "condo" };
    const r = computeAll(inp);
    const w = whatIfs(inp, r, computeDesigns(r, { type: "condo" }), null);
    expect(w[0]?.text).toMatch(/m deeper would make it buildable/);
  });
});

describe("worker contract", () => {
  it("engine results survive structuredClone (postMessage) unchanged", () => {
    const inp: ComputeInputs = { plot: ll(RECT), roadEdges: { 0: 8 }, type: "condo" };
    const r = computeAll(inp);
    const ds = computeDesigns(r, { type: "condo" });
    const w = whatIfs(inp, r, ds, null);
    const back = structuredClone({ r, ds, w });
    expect(back.r).toEqual(r);
    expect(back.ds).toEqual(ds);
    expect(back.w).toEqual(w);
  });
});

describe("verdict without a road edge", () => {
  it("asks for the road side instead of saying the plot is too narrow", () => {
    const r = computeAll({ plot: ll(RECT), roadEdges: {}, type: "condo" });
    const v = verdictFor(r, computeDesigns(r, { type: "condo" }), null);
    expect(v.colour).toBe("amber");
    expect(v.sentence).toMatch(/road/);
    expect(v.numbers).toBeNull();
  });
});
