// M3: designs A/B/C + independent checker. BUILD_PLAN §10 tests 7-8.
import { describe, expect, it } from "vitest";
import { computeAll, computeDesigns, type ComputeInputs, type DesignResult } from "../src/engine";
import { measureFloors } from "../src/engine/checker";
import { makeFrame, type LngLat, type XY } from "../src/engine/geo";
import type { BuildingType } from "../src/engine/far";

const f = makeFrame(100.5446, 13.7797);
const ll = (pts: XY[]): LngLat[] => {
  const r = pts.map(f.toLngLat);
  return [...r, r[0]];
};
const RECT: XY[] = [[-20, -25], [20, -25], [20, 25], [-20, 25]];
const run = (inp: ComputeInputs): DesignResult[] => computeDesigns(computeAll(inp), { type: inp.type, bonusPcts: inp.bonusPcts });
const status = (d: DesignResult, id: string) => d.checks.find((c) => c.id === id)?.status;
const SETBACK_ROWS = ["sky", "road-setback", "boundary-setback"];

describe("designs on the golden rectangle, W = 12 m, condo", () => {
  const ds = run({ plot: ll(RECT), roadEdges: { 0: 12 }, type: "condo" });
  it("three designs, all buildable, all high-rise class", () => {
    expect(ds.map((d) => d.design.id)).toEqual(["A", "B", "C"]);
    expect(ds.every((d) => d.design.buildable)).toBe(true);
    expect(ds[0].design.cls).toBe("highRise");
    expect(ds[2].design.cls).toBe("lowRise");
  });
  it("§10 test 7: Σ floors = reported GFA = checker GFA (0.01 m²), within max GFA and coverage", () => {
    for (const d of ds) {
      const sum = d.design.floors.reduce((s, fl) => s + fl.areaM2, 0);
      expect(Math.abs(sum - d.design.gfaM2)).toBeLessThan(0.01);
      const m = measureFloors(ll(RECT), d.floors);
      expect(Math.abs(m.gfaM2 - d.design.gfaM2)).toBeLessThan(0.01 * Math.max(1, d.design.floors.length));
      expect(d.design.gfaM2).toBeLessThanOrEqual(16000 + 0.01);
      expect(d.design.footprintM2).toBeLessThanOrEqual(d.design.coverageCapM2 + 0.01);
    }
  });
  it("C stays under 23 m and under 10,000 m²; B tower plates 450-1,200 m²", () => {
    expect(ds[2].design.heightM).toBeLessThan(23);
    expect(ds[2].design.gfaM2).toBeLessThan(10000);
    const tower = ds[1].design.floors.slice(3);
    expect(tower.length).toBeGreaterThan(0);
    for (const fl of tower) expect(fl.areaM2).toBeLessThanOrEqual(1200 + 0.01);
  });
  it("independent checker: every design passes FAR, open space and all setback rows", () => {
    for (const d of ds) {
      for (const id of ["far", "osr", "open-land", ...SETBACK_ROWS]) expect([d.design.id, id, status(d, id)]).toEqual([d.design.id, id, "PASS"]);
      expect(d.checks.length).toBe(12);
    }
  });
});

describe("W = 8 m: gate fails ⇒ only the low-rise design C", () => {
  const ds = run({ plot: ll(RECT), roadEdges: { 0: 8 }, type: "condo" });
  it("A and B are not available (MR 33 gate); C is buildable, low-rise, setbacks pass", () => {
    expect(ds[0].design.buildable).toBe(false);
    expect(ds[1].design.buildable).toBe(false);
    expect(ds[0].design.reason).toMatch(/Not available: Road < 10 m/);
    const c = ds[2];
    expect(c.design.buildable).toBe(true);
    expect(c.design.cls).toBe("lowRise");
    expect(c.design.heightM).toBeLessThan(23);
    for (const id of SETBACK_ROWS) expect(status(c, id)).toBe("PASS");
  });
});

describe("limited by: the binding constraint (direction file §3.3)", () => {
  it("golden rectangle, W = 12: A is limited by FAR; C by the low-rise height", () => {
    const ds = run({ plot: ll(RECT), roadEdges: { 0: 12 }, type: "condo" });
    expect(ds[0].design.limitedBy?.kind).toBe("far");
    expect(ds[0].design.limitedBy?.label).toMatch(/Floor area ratio/);
    expect(ds[2].design.limitedBy?.kind).toBe("lowRiseHeight");
  });
  it("shallow 100 × 24 m plot on a 10 m road: A is limited by the sky plane on the road edge (edge 1)", () => {
    const ds = run({ plot: ll([[-50, -12], [50, -12], [50, 12], [-50, 12]]), roadEdges: { 0: 10 }, type: "condo" });
    const a = ds[0].design;
    expect(a.buildable).toBe(true);
    expect(a.gfaM2).toBeLessThan(0.95 * 19200); // FAR is not what stops it
    expect(a.limitedBy).toMatchObject({ kind: "sky", edge: 0, label: "Sky plane on edge 1" });
  });
  it("road ≥ 10 m but < 18 m on a big plot: A is capped by the MR 33 30,000 m² tier", () => {
    const ds = run({ plot: ll([[-50, -40], [50, -40], [50, 40], [-50, 40]]), roadEdges: { 0: 12 }, type: "condo" });
    expect(ds[0].design.limitedBy?.kind).toBe("gate");
    expect(ds[0].design.gfaM2).toBeLessThanOrEqual(30000);
  });
});

describe("proof on the model: every checklist row carries cause geometry", () => {
  it("rows of design A have a cause with something to frame; the sky row has steps + a corner marker", () => {
    const a = run({ plot: ll(RECT), roadEdges: { 0: 12 }, type: "condo" })[0];
    for (const c of a.checks.filter((x) => x.id !== "use")) {
      expect([c.id, (c.cause?.focus.length ?? 0) > 0]).toEqual([c.id, true]);
    }
    const sky = a.checks.find((c) => c.id === "sky")!.cause!;
    expect(sky.extrusions!.length).toBeGreaterThan(2);
    expect(sky.lines!.length).toBe(1);
    const strip = a.checks.find((c) => c.id === "road-setback")!.cause!;
    expect(strip.ground!.length).toBeGreaterThan(0);
    expect(JSON.stringify(a.checks)).not.toMatch(/NaN/);
  });
});

describe("8 m-deep plot: not buildable, no crash, no NaN", () => {
  it("every design says not buildable", () => {
    const ds = run({ plot: ll([[-25, -4], [25, -4], [25, 4], [-25, 4]]), roadEdges: { 0: 12 }, type: "condo" });
    for (const d of ds) {
      expect(d.design.buildable).toBe(false);
      expect(d.design.reason).toMatch(/Not buildable/);
    }
    expect(JSON.stringify(ds)).not.toMatch(/NaN/);
  });
});

describe("§10 test 8: 200 random plots × random widths / types", () => {
  it("every buildable design passes height vs road, road setback and boundary setback", () => {
    let seed = 20261119;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
    const types: BuildingType[] = ["condo", "office", "hotel"];
    let designsChecked = 0;
    const failures: string[] = [];
    for (let n = 0; n < 200; n++) {
      // Convex blob or concave star-ish polygon, 25-70 m radius, 4-9 vertices.
      const k = 4 + Math.floor(rnd() * 6);
      const concave = rnd() < 0.4;
      const R = 25 + rnd() * 45;
      const pts: XY[] = [];
      for (let i = 0; i < k; i++) {
        const a = (i / k) * 2 * Math.PI + rnd() * 0.3;
        const r = concave && i % 2 === 1 ? R * (0.45 + rnd() * 0.25) : R * (0.85 + rnd() * 0.3);
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      const W = 4 + rnd() * 36;
      const roadEdges: Record<number, number> = { 0: W };
      if (rnd() < 0.3) roadEdges[Math.floor(k / 2)] = 4 + rnd() * 36; // second road edge
      const type = types[Math.floor(rnd() * 3)];
      const r = computeAll({ plot: ll(pts), roadEdges, type });
      if (r.status !== "ok") continue;
      for (const d of computeDesigns(r, { type })) {
        expect(JSON.stringify(d.design)).not.toMatch(/NaN/);
        if (!d.design.buildable) continue;
        designsChecked++;
        for (const id of SETBACK_ROWS) if (status(d, id) !== "PASS") failures.push(`plot ${n} ${d.design.id} ${id}: ${d.checks.find((c) => c.id === id)?.value}`);
      }
    }
    expect(failures).toEqual([]);
    expect(designsChecked).toBeGreaterThan(200);
  }, 120_000);
});

describe("parking passes when the plot allows it (planning decision 1)", () => {
  it("demo-size plot, W = 12: A, B and C all PASS the independent parking check", () => {
    const ds = run({ plot: ll(RECT), roadEdges: { 0: 12 }, type: "condo" });
    for (const d of ds) expect([d.design.id, status(d, "parking")]).toEqual([d.design.id, "PASS"]);
    // B needed a taller podium; it is still within FAR
    expect(ds[1].design.gfaM2).toBeLessThanOrEqual(16000 + 0.01);
  });
  it("W = 8: C passes parking (ground + an extra low parking floor)", () => {
    const c = run({ plot: ll(RECT), roadEdges: { 0: 8 }, type: "condo" })[2];
    expect(status(c, "parking")).toBe("PASS");
  });
});

describe("area statement (EXPECTATIONS H.4)", () => {
  it("Σ floor rows = card GFA = GFA measured by the FAR check, to 0.01 m²", async () => {
    const { computeAll, computeDesigns } = await import("../src/engine");
    const { makeFrame } = await import("../src/engine/geo");
    const fr = makeFrame(100.5446, 13.7797);
    const pts = ([[-20, -25], [20, -25], [20, 25], [-20, 25]] as [number, number][]).map(fr.toLngLat);
    for (const W of [12, 8]) {
      const r = computeAll({ plot: [...pts, pts[0]], roadEdges: { 0: W }, type: "condo" });
      for (const d of computeDesigns(r, { type: "condo" }).filter((x) => x.design.buildable)) {
        const sum = d.floors.reduce((s, f) => s + f.areaM2, 0);
        const far = d.checks.find((c) => c.id === "far")!.measured!;
        expect(Math.abs(sum - d.design.gfaM2)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(far - d.design.gfaM2)).toBeLessThanOrEqual(0.01);
      }
    }
  });
});
