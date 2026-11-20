// M1 engine tests: EXPECTATIONS part D golden numbers + BUILD_PLAN §10 tests 1-6 and 9.
import { describe, expect, it } from "vitest";
import { computeAll, type ComputeInputs } from "../src/engine";
import { makeFrame, edges, pointInRing, pointSegDist, type LngLat, type XY } from "../src/engine/geo";
import { roadBand, skyPlane, clearance, openingsDistance, roadSetback, neighbourSetback } from "../src/engine/setbacks";
import { farLimit, openSpace, parkingRequired } from "../src/engine/far";
import { highRiseGate } from "../src/engine/classify";
import { normaliseRing, isSimple, validatePlot } from "../src/engine/polygon";
import { DEFAULT_FLOORS } from "../src/engine/assumptions";
import type { Envelope } from "../src/engine/envelope";

const TOL_M = 0.01;
const TOL_M2 = 0.01;
const ARI: LngLat = [100.5446, 13.7797];
const f = makeFrame(...ARI);
const ll = (pts: XY[]): LngLat[] => {
  const r = pts.map(f.toLngLat);
  return [...r, r[0]];
};
/** 40 m (x, road side) × 50 m (y) rectangle, centred on the frame origin. Edge 0 = south side = road. */
const RECT: XY[] = [[-20, -25], [20, -25], [20, 25], [-20, 25]];
const rectInputs = (W: number, over: Partial<ComputeInputs> = {}): ComputeInputs => ({
  plot: ll(RECT),
  roadEdges: { 0: W },
  type: "condo",
  ...over,
});
const roadS = (e: Envelope, sliceIdx: number) => e.slices[sliceIdx].setbacks[edgeIndexOfRoad(e)];
// After normalisation the ring is CCW starting at the same vertex, so edge 0 stays the south edge.
const edgeIndexOfRoad = (e: Envelope) => e.slices[0].setbacks.findIndex((s) => s.terms.band !== undefined);
const sides = (e: Envelope, sliceIdx: number) => e.slices[sliceIdx].setbacks.filter((s) => s.terms.band === undefined);

describe("setback formulas (§4.3, numbers from bangkok-y10.json)", () => {
  it("road band: W=12 → 1.2 m; W=8 → 2 m; W=4 → 4 m; W=30 → 2 m; W=20 → 2 m", () => {
    expect(roadBand(12)).toBeCloseTo(1.2, 9);
    expect(roadBand(8)).toBeCloseTo(2, 9);
    expect(roadBand(4)).toBeCloseTo(4, 9); // 6 − 4/2 (stricter than 3 − 4/2)
    expect(roadBand(30)).toBeCloseTo(2, 9);
    expect(roadBand(20)).toBeCloseTo(2, 9);
  });
  it("sky plane d ≥ h/2 − W", () => {
    expect(skyPlane(36, 12)).toBeCloseTo(6, 9);
    expect(skyPlane(22.5, 8)).toBeCloseTo(3.25, 9);
    expect(skyPlane(10, 12)).toBe(0);
  });
  it("clearance 1 m ≤ 15 m, 2 m above; openings 2 m (≤ 2 storeys, ≤ 9 m) / 3 m", () => {
    expect(clearance(15)).toBe(1);
    expect(clearance(15.1)).toBe(2);
    expect(openingsDistance(7.5, 2)).toBe(2);
    expect(openingsDistance(9.5, 2)).toBe(3);
    expect(openingsDistance(7.5, 3)).toBe(3);
  });
  it("MR 33 sets 6 m on road and neighbour edges", () => {
    expect(roadSetback(12, 10, 30, true).s).toBe(6);
    expect(roadSetback(12, 10, 30, true).governing).toBe("mr33");
    expect(neighbourSetback(30, 10, true).s).toBe(6);
  });
});

describe("golden: 40 × 50 m, W = 12 m, condo (EXPECTATIONS D)", () => {
  const r = computeAll(rectInputs(12));
  const hr = r.envelopes.highRise!;
  it("plot 2,000 m², max GFA 16,000 m²", () => {
    expect(r.status).toBe("ok");
    expect(r.plotAreaM2).toBeCloseTo(2000, 2);
    expect(r.far.maxGfaM2).toBeCloseTo(16000, 1);
  });
  it("road band 1.2 m; gate passes", () => {
    expect(roadBand(12)).toBeCloseTo(1.2, 9);
    expect(r.gate!.permitted).toBe(true);
    expect(r.gate!.viaEdge).toBe(0);
  });
  it("MR 33 ⇒ 6 m on all edges at ground level", () => {
    expect(roadS(hr, 0).s).toBeCloseTo(6, 9);
    for (const s of sides(hr, 0)) expect(s.s).toBeCloseTo(6, 9);
  });
  it("ground slice = 28 × 38 = 1,064 m²", () => {
    expect(Math.abs(hr.slices[0].areaM2 - 1064)).toBeLessThan(TOL_M2);
  });
  it("sky plane bites above h = 36 m (not at or below)", () => {
    for (const s of hr.slices) {
      const rs = roadS(hr, hr.slices.indexOf(s));
      if (s.top <= 36) {
        expect(rs.s).toBeCloseTo(6, 9);
        expect(rs.governing).toBe("mr33");
      } else {
        expect(rs.s).toBeCloseTo(s.top / 2 - 12, 9);
        expect(rs.governing).toBe("sky");
      }
    }
    // there is at least one slice above 36 m and its area is smaller than the ground slice
    const above = hr.slices.find((s) => s.top > 36)!;
    expect(above).toBeTruthy();
    expect(above.areaM2).toBeLessThan(hr.slices[0].areaM2);
  });
  it("required open space = max(600, 0.04 × 16,000 = 640) = 640; coverage cap 1,360", () => {
    expect(r.openSpaceAtMaxGfa.byLandM2).toBeCloseTo(600, 6);
    expect(r.openSpaceAtMaxGfa.requiredM2).toBeCloseTo(640, 6);
    expect(r.openSpaceAtMaxGfa.coverageCapM2).toBeCloseTo(1360, 6);
  });
});

describe("golden: W = 8 m", () => {
  const r = computeAll(rectInputs(8));
  const lr = r.envelopes.lowRise!;
  it("gate fails (banner reason), no high-rise envelope", () => {
    expect(r.gate!.permitted).toBe(false);
    expect(r.gate!.reason).toMatch(/Road < 10 m/);
    expect(r.envelopes.highRise).toBeNull();
  });
  it("low-rise: 7 floors, top 22.5 m (< 23 m)", () => {
    expect(lr.slices.length).toBe(7);
    expect(lr.heightM).toBeCloseTo(22.5, 9);
  });
  it("road setback 2 m on low floors, 3.25 m at the 22.5 m top floor", () => {
    for (let i = 0; i < lr.slices.length - 1; i++) expect(roadS(lr, i).s).toBeCloseTo(2, 9);
    const top = lr.slices.length - 1;
    expect(roadS(lr, top).s).toBeCloseTo(3.25, 9);
    expect(roadS(lr, top).governing).toBe("sky");
  });
  it("sides 3 m", () => {
    for (const s of sides(lr, 0)) expect(s.s).toBeCloseTo(3, 9);
  });
});

describe("golden: W = 4 m", () => {
  it("road band 4 m", () => {
    expect(roadBand(4)).toBeCloseTo(4, 9);
    const lr = computeAll(rectInputs(4)).envelopes.lowRise!;
    expect(roadS(lr, 0).terms.band).toBeCloseTo(4, 9);
    expect(roadS(lr, 0).s).toBeCloseTo(4, 9);
  });
});

describe("golden: FAR bonus cap (§10 test 9)", () => {
  it("15 % + 10 % → capped 20 % ⇒ FAR 9.6 ⇒ 19,200 m²", () => {
    const fr = farLimit(2000, [15, 10]);
    expect(fr.bonusRequestedPct).toBe(25);
    expect(fr.bonusPct).toBe(20);
    expect(fr.capped).toBe(true);
    expect(fr.far).toBeCloseTo(9.6, 9);
    expect(fr.maxGfaM2).toBeCloseTo(19200, 6);
    expect(computeAll(rectInputs(12, { bonusPcts: [15, 10] })).far.maxGfaM2).toBeCloseTo(19200, 1);
  });
});

describe("golden: office, W = 12 m", () => {
  const r = computeAll(rectInputs(12, { type: "office" }));
  it("open space ≥ 10 % of plot (not 30 %)", () => {
    expect(r.openSpaceAtMaxGfa.landPct).toBe(10);
    expect(r.openSpaceAtMaxGfa.byLandM2).toBeCloseTo(200, 6);
    expect(openSpace("condo", 2000, 16000).landPct).toBe(30);
  });
  it("parking 1 per 60 m²", () => {
    const p = parkingRequired({ type: "office", gfaM2: 16000 });
    expect(p.byUse).toBeCloseTo(16000 / 60, 9);
    expect(p.required).toBe(Math.ceil(16000 / 60));
  });
});

describe("golden: 8 m-deep plot (§10 test 5)", () => {
  // 50 m road frontage × 8 m deep, W = 12. See AI_MISSES_LOG #17: high-rise empty, low-rise a sub-150 m² strip.
  const r = computeAll({ plot: ll([[-25, -4], [25, -4], [25, 4], [-25, 4]]), roadEdges: { 0: 12 }, type: "condo" });
  it("high-rise envelope empty (6 + 6 > 8)", () => {
    expect(r.envelopes.highRise!.slices.length).toBe(0);
  });
  it("low-rise leaves only a 3 m strip (2 m road + 3 m rear) under the 150 m² minimum plate", () => {
    const g = r.envelopes.lowRise!.groundAreaM2;
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(150);
    expect(Math.abs(g - 3 * 44)).toBeLessThan(TOL_M2); // 44 m × 3 m after 3 m side setbacks
  });
  it('"Not buildable: too narrow for setbacks", no NaN', () => {
    expect(r.buildable).toBe(false);
    expect(r.notBuildableReason).toMatch(/Not buildable: too narrow for setbacks/);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity(?!")/);
  });
});

describe("§10 test 4: L-shaped concave plot property test", () => {
  // L: 60 × 60 with the NE 30 × 30 removed. Road on the south edge (edge 0), W = 12.
  const L: XY[] = [[0, 0], [60, 0], [60, 30], [30, 30], [30, 60], [0, 60]].map(([x, y]) => [x - 30, y - 30]);
  const r = computeAll({ plot: ll(L), roadEdges: { 0: 12 }, type: "condo" });
  const env = r.envelopes.highRise!;
  it("envelope exists and has no point closer than s_i to edge i (2,000 random samples per class)", () => {
    expect(env.slices.length).toBeGreaterThan(0);
    // sample random points; keep those inside an envelope slice; check distance to every plot edge
    let rng = 12345;
    const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (const e of [env, r.envelopes.lowRise!]) {
      for (const sIdx of [0, Math.floor(e.slices.length / 2), e.slices.length - 1]) {
        const slice = e.slices[sIdx];
        // the engine's normalised ring has the same vertices as L (already CCW)
        const es = edges(L);
        let checked = 0;
        // sample inside the slice bounding box so even small top slices get many samples
        const pts = slice.polys.flatMap((poly) => poly[0]);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        for (let n = 0; n < 2000; n++) {
          const p: XY = [x0 + (x1 - x0) * rand(), y0 + (y1 - y0) * rand()];
          const inSlice = slice.polys.some((poly) => pointInRing(p, poly[0] as XY[]) && !poly.slice(1).some((h) => pointInRing(p, h as XY[])));
          if (!inSlice) continue;
          checked++;
          expect(pointInRing(p, L)).toBe(true);
          es.forEach(([a, b], i) => expect(pointSegDist(p, a, b)).toBeGreaterThanOrEqual(slice.setbacks[i].s - TOL_M));
        }
        expect(checked).toBeGreaterThan(500);
      }
    }
  });
  it("concave corner: the inner corner is respected (point near (0,0) of the notch excluded)", () => {
    const g = env.slices[0];
    // point 3 m from the re-entrant corner (0,0) diagonally into the notch side is < 6 m from both notch edges
    const p: XY = [-3, -3];
    const inSlice = g.polys.some((poly) => pointInRing(p, poly[0] as XY[]));
    expect(inSlice).toBe(false);
  });
});

describe("§10 test 5: triangle plot", () => {
  it("computes without NaN; envelope inside the plot", () => {
    const T: XY[] = [[-30, -20], [30, -20], [0, 32]];
    const r = computeAll({ plot: ll(T), roadEdges: { 0: 16 }, type: "condo" });
    expect(r.status).toBe("ok");
    expect(JSON.stringify(r)).not.toMatch(/NaN/);
    const g = r.envelopes.lowRise!.slices[0];
    for (const poly of g.polys) for (const p of poly[0]) expect(pointInRing([p[0] * 0.999, p[1] * 0.999] as XY, T)).toBe(true);
  });
});

describe("§10 test 6: self-intersecting polygon", () => {
  it("is rejected with a message", () => {
    const bow: XY[] = [[-20, -20], [20, 20], [20, -20], [-20, 20]];
    expect(isSimple(bow)).toBe(false);
    const v = validatePlot(bow);
    expect(v.ok).toBe(false);
    const r = computeAll({ plot: ll(bow), roadEdges: { 0: 12 }, type: "condo" });
    expect(r.status).toBe("invalid");
    expect(r.message).toMatch(/self-intersecting/);
  });
});

describe("plumbing", () => {
  it("normaliseRing: CCW, drops duplicates and collinear points", () => {
    const cw: XY[] = [[0, 0], [0, 10], [5, 10], [10, 10], [10, 0], [10, 0.01]];
    const n = normaliseRing(cw);
    expect(n.length).toBe(4);
  });
  it("no road edge → status no-road", () => {
    expect(computeAll({ plot: ll(RECT), roadEdges: {}, type: "condo" }).status).toBe("no-road");
  });
  it("road width 0 / 100 are clamped to 3 / 60", () => {
    expect(computeAll(rectInputs(0)).roadEdges[0]).toMatchObject({ widthM: 3, clamped: true });
    expect(computeAll(rectInputs(100)).roadEdges[0]).toMatchObject({ widthM: 60, clamped: true });
  });
  it("gate needs edge length ≥ 12 m: a 10 m frontage on a 12 m road fails", () => {
    expect(highRiseGate([{ edge: 0, widthM: 12, lengthM: 10 }]).permitted).toBe(false);
    expect(highRiseGate([{ edge: 0, widthM: 18, lengthM: 12 }]).maxGfaM2).toBe(Infinity);
    expect(highRiseGate([{ edge: 0, widthM: 12, lengthM: 40 }]).maxGfaM2).toBe(30000);
  });
  it("default floors 4.5 m + 3.0 m", () => {
    expect(DEFAULT_FLOORS).toEqual({ groundM: 4.5, typicalM: 3.0 });
  });
});

import { defaultRoadWidth } from "../src/engine/roadDefaults";
describe("road width class defaults (§5.3)", () => {
  it("maps classes and sois", () => {
    expect(defaultRoadWidth("primary")).toBe(30);
    expect(defaultRoadWidth("tertiary")).toBe(16);
    expect(defaultRoadWidth("minor", "Soi Ari 1")).toBe(8);
    expect(defaultRoadWidth("minor", "ซอยอารีย์ 1")).toBe(8);
    expect(defaultRoadWidth("minor", "Phahon Yothin Road")).toBe(10);
    expect(defaultRoadWidth("service")).toBe(6);
    expect(defaultRoadWidth(null)).toBe(10);
  });
});

import { remapEdges } from "../src/engine/remapEdges";
describe("remapEdges (vertex inserted / deleted)", () => {
  const sq = ll([[-20, -20], [20, -20], [20, 20], [-20, 20]]);
  it("inserting a vertex on the road edge splits it into two road edges; later edges shift", () => {
    const withMid = ll([[-20, -20], [0, -20], [20, -20], [20, 20], [-20, 20]]);
    expect(remapEdges(sq, withMid, { 0: "road12", 2: "road8" })).toEqual({ 0: "road12", 1: "road12", 3: "road8" });
  });
  it("inserting a vertex elsewhere shifts indices only", () => {
    const withMid = ll([[-20, -20], [20, -20], [20, 0], [20, 20], [-20, 20]]);
    expect(remapEdges(sq, withMid, { 0: "r", 3: "s" })).toEqual({ 0: "r", 4: "s" });
  });
  it("deleting a corner drops the merged edges", () => {
    const tri = ll([[-20, -20], [20, -20], [-20, 20]]);
    expect(remapEdges(sq, tri, { 0: "r" })).toEqual({ 0: "r" });
  });
});

describe("hotel parking (MR 7 ข้อ 3 (1)(B), incl. the > 100 rooms rate from the planning session)", () => {
  it("10 for ≤ 30 rooms; +1 per 5 to 100; +1 per 10 above; fractions round up", () => {
    expect(parkingRequired({ type: "hotel", gfaM2: 0, rooms: 30 }).byUse).toBe(10);
    expect(parkingRequired({ type: "hotel", gfaM2: 0, rooms: 31 }).byUse).toBe(11);
    expect(parkingRequired({ type: "hotel", gfaM2: 0, rooms: 100 }).byUse).toBe(24);
    expect(parkingRequired({ type: "hotel", gfaM2: 0, rooms: 150 }).byUse).toBe(29);
    expect(parkingRequired({ type: "hotel", gfaM2: 0, rooms: 101 }).byUse).toBe(25);
  });
});
