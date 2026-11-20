import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { angleBetween, approxWidth, buildingOverlaps, checkSite, type SiteInputs, type SiteRoad, type SiteBuilding } from "../src/engine/siteChecks";
import { parseZones } from "../src/engine/zones";
import { makeFrame, type LngLat, type XY } from "../src/engine/geo";

const ARI: LngLat = [100.5446, 13.7797];
const f = makeFrame(...ARI);
const ll = (pts: XY[]) => pts.map(f.toLngLat);
const closed = (pts: XY[]) => {
  const r = ll(pts);
  return [...r, r[0]];
};
// 40 m (x) × 50 m (y) rectangle centred on the origin.
const RECT = closed([[-20, -25], [20, -25], [20, 25], [-20, 25]]);
const ZONES = parseZones(JSON.parse(readFileSync("public/data/bkk-zoning-2556.geojson", "utf8")));
const TARGET = { zoneCode: "ย.10", zoneName: "Very-high-density residential" };

function inputs(over: Partial<SiteInputs["context"]> = {}, plot = RECT): SiteInputs {
  return {
    plot,
    context: { status: "ready", roads: [], roadNames: [], buildings: [], ...over },
    zones: { status: "ready", zones: ZONES },
    target: TARGET,
  };
}
const road = (cls: string, pts: XY[], extra: Partial<SiteRoad> = {}): SiteRoad => ({ cls, coords: ll(pts), ...extra });
const bldg = (id: number, pts: XY[]): SiteBuilding => ({ id, polygons: [[closed(pts)]] });
const ids = (r: ReturnType<typeof checkSite>) => r.issues.map((i) => `${i.level}:${i.id}`);

describe("approxWidth", () => {
  it("recovers the short side of a rectangle", () => {
    expect(approxWidth(8 * 50, 2 * (8 + 50))).toBeCloseTo(8, 6);
    expect(approxWidth(40 * 50, 180)).toBeCloseTo(40, 6);
  });
});

describe("checkSite: roads", () => {
  it("a road along the south edge (8 m off) = frontage, named", () => {
    const r = checkSite(
      inputs({
        roads: [road("minor", [[-60, -33], [60, -33]])],
        roadNames: [{ name: "Soi Test", cls: "minor", coords: ll([[-60, -33], [60, -33]]) }],
      }),
    );
    expect(ids(r)).toContain("ok:access");
    expect(r.issues.find((i) => i.id === "access")!.title).toBe("Faces Soi Test");
    expect(r.highlights.crossingRoads).toHaveLength(0);
  });

  it("a road through the middle = warning (still computes) with ~40 m inside", () => {
    const r = checkSite(inputs({ roads: [road("primary", [[-60, 0], [60, 0]])] }));
    const e = r.issues.find((i) => i.id === "crosses-road")!;
    expect(e.level).toBe("warning");
    expect(e.detail).toContain("About 40 m");
    expect(r.blocked).toBe(false);
    expect(r.inScope).toBe(true);
    expect(r.highlights.crossingRoads).toHaveLength(1);
  });

  it("an MRT tunnel under the plot is not a crossing", () => {
    const r = checkSite(inputs({ roads: [road("transit", [[-60, 0], [60, 0]], { brunnel: "tunnel" })] }));
    expect(ids(r)).not.toContain("error:crosses-road");
  });

  it("an elevated BTS line over the plot is a crossing", () => {
    const r = checkSite(inputs({ roads: [road("transit", [[-60, 0], [60, 0]], { brunnel: "bridge" })] }));
    expect(r.issues.find((i) => i.id === "crosses-road")!.title).toContain("rail/BTS");
  });

  it("a service lane inside = warning only; footpaths ignored", () => {
    const r = checkSite(
      inputs({ roads: [road("service", [[0, -60], [0, 60]]), road("path", [[-60, 5], [60, 5]], { subclass: "footway" })] }),
    );
    expect(ids(r)).toContain("warning:service-road");
    expect(ids(r)).not.toContain("error:crosses-road");
  });

  it("nearest road 100 m away = no-access warning", () => {
    const r = checkSite(inputs({ roads: [road("minor", [[-60, 125], [60, 125]])] }));
    expect(ids(r)).toContain("warning:no-access");
  });
});

describe("checkSite: buildings", () => {
  it("separates buildings on the plot from buildings the boundary cuts", () => {
    const r = checkSite(
      inputs({
        roads: [road("minor", [[-60, -33], [60, -33]])],
        buildings: [
          bldg(1, [[-10, -10], [10, -10], [10, 10], [-10, 10]]), // fully inside
          bldg(2, [[15, 0], [35, 0], [35, 10], [15, 10]]), // 25 % inside
          bldg(3, [[100, 100], [110, 100], [110, 110], [100, 110]]), // far away
        ],
      }),
    );
    expect(r.highlights.onPlotBuildingIds).toEqual([1]);
    expect(r.highlights.cutBuildingIds).toEqual([2]);
    expect(r.issues.find((i) => i.id === "on-plot-buildings")!.title).toBe("1 existing building on the plot (400 m²)");
  });

  it("merges tile pieces of one building before measuring", () => {
    // One 20×20 building split in two tile pieces, fully inside.
    const b: SiteBuilding = {
      id: 9,
      polygons: [[closed([[-10, -10], [0, -10], [0, 10], [-10, 10]])], [closed([[0, -10], [10, -10], [10, 10], [0, 10]])]],
    };
    const r = checkSite(inputs({ buildings: [b] }));
    expect(r.highlights.onPlotBuildingIds).toEqual([9]);
    expect(r.issues.find((i) => i.id === "on-plot-buildings")!.title).toContain("(400 m²)");
  });
});

describe("checkSite: shape", () => {
  it("tiny plot = error", () => {
    const r = checkSite(inputs({}, closed([[0, 0], [5, 0], [5, 5], [0, 5]])));
    expect(ids(r)).toContain("error:too-small");
  });
  it("8 m deep plot = narrow warning", () => {
    const r = checkSite(inputs({}, closed([[-25, -4], [25, -4], [25, 4], [-25, 4]])));
    expect(r.issues.find((i) => i.id === "narrow")!.title).toBe("Very narrow plot (about 8.0 m wide)");
  });
  it("no NaN for a degenerate plot", () => {
    const r = checkSite(inputs({}, closed([[0, 0], [10, 0], [20, 0]])));
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
});

describe("checkSite: zones (real BMA zoning data)", () => {
  it("Ari resolves to ย.10 (golden)", () => {
    const r = checkSite(inputs());
    expect(r.zoneShares?.[0].code).toBe("ย.10");
    expect(ids(r)).toContain("ok:zone-ok");
  });
  it("Siam resolves to พ.5, out of scope (golden)", () => {
    const g = makeFrame(100.5347, 13.7462);
    const sq = [[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]].map((p) => g.toLngLat(p as XY));
    const r = checkSite(inputs({}, sq));
    expect(r.zoneShares?.[0].code).toBe("พ.5");
    expect(ids(r)).toContain("error:wrong-zone");
    expect(r.inScope).toBe(false);
  });
  it("outside Bangkok (Chiang Mai) = error", () => {
    const g = makeFrame(98.9853, 18.7883);
    const sq = [[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]].map((p) => g.toLngLat(p as XY));
    expect(ids(checkSite(inputs({}, sq)))).toContain("error:outside-plan");
  });
});

describe("blocking (planning Q2)", () => {
  it("blocks on too-small and wrong zone, not on cut buildings", () => {
    expect(checkSite(inputs({}, closed([[0, 0], [5, 0], [5, 5], [0, 5]]))).blocked).toBe(true);
    const g = makeFrame(100.5347, 13.7462);
    const sq = [[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]].map((p) => g.toLngLat(p as XY));
    expect(checkSite(inputs({}, sq)).blocked).toBe(true);
    const cut = checkSite(inputs({ buildings: [bldg(2, [[15, 0], [35, 0], [35, 10], [15, 10]])] }));
    expect(cut.blocked).toBe(false);
  });
});

describe("road-edge suggestion", () => {
  it("picks the south edge (index 0) for a parallel road 8 m away, not the sides", () => {
    const r = checkSite(inputs({ roads: [road("minor", [[-60, -33], [60, -33]])] }));
    expect(r.suggestedRoadEdges.map((e) => e.edge)).toEqual([0]);
    expect(r.suggestedRoadEdges[0].distM).toBeCloseTo(8, 1);
  });
  it("corner plot: two roads give two edges", () => {
    const r = checkSite(inputs({ roads: [road("minor", [[-60, -33], [60, -33]]), road("tertiary", [[28, -60], [28, 60]])] }));
    expect(r.suggestedRoadEdges.map((e) => e.edge).sort()).toEqual([0, 1]);
  });
  it("names the road the edge faces, not a cross street touching the segment at a junction", () => {
    // The main-road segment ends at a junction (x = 40) where a cross street's name line meets it.
    const r = checkSite(
      inputs({
        roads: [road("primary", [[-60, -33], [40, -33]])],
        roadNames: [
          { name: "Soi Cross", cls: "minor", coords: ll([[40, -33], [40, -100]]) },
          { name: "Main Road", cls: "primary", coords: ll([[-60, -33], [40, -33]]) },
        ],
      }),
    );
    expect(r.suggestedRoadEdges.map((e) => [e.edge, e.name])).toEqual([[0, "Main Road"]]);
  });
  it("a road at 45° is not suggested", () => {
    const r = checkSite(inputs({ roads: [road("minor", [[-60, -90], [60, 30]])] }));
    expect(r.suggestedRoadEdges).toEqual([]);
  });
  it("angleBetween is direction-agnostic", () => {
    expect(angleBetween([[0, 0], [1, 0]], [[5, 5], [4, 5]])).toBeCloseTo(0, 6);
    expect(angleBetween([[0, 0], [1, 0]], [[0, 0], [1, 1]])).toBeCloseTo(45, 6);
  });
});

describe("buildingOverlaps (live colouring)", () => {
  it("lists every overlapping building, splits on-plot vs cut", () => {
    const ov = buildingOverlaps(RECT, [
      bldg(1, [[-10, -10], [10, -10], [10, 10], [-10, 10]]),
      bldg(2, [[15, 0], [35, 0], [35, 10], [15, 10]]),
      bldg(3, [[100, 100], [110, 100], [110, 110], [100, 110]]),
    ]);
    expect(ov.overlapping.sort()).toEqual([1, 2]);
    expect(ov.onPlot).toEqual([1]);
    expect(ov.cut).toEqual([2]);
  });
  it("degenerate plot returns nothing, no throw", () => {
    expect(buildingOverlaps(closed([[0, 0], [1, 0]]), [bldg(1, [[0, 0], [1, 0], [1, 1], [0, 1]])]).overlapping).toEqual([]);
  });
});

import { plotSplit } from "../src/engine/plotSplit";
describe("plotSplit (free vs built)", () => {
  it("40 × 50 plot with a 20 × 20 building inside → built 400, free 1,600", () => {
    const s = plotSplit(RECT, [bldg(1, [[-10, -10], [10, -10], [10, 10], [-10, 10]])]);
    expect(s.builtM2).toBeCloseTo(400, 1);
    expect(s.freeM2).toBeCloseTo(1600, 1);
    expect(s.free.length).toBe(1);
    expect(s.free[0].length).toBe(2); // outer ring + hole where the building stands
  });
  it("a building half outside counts only its inside part", () => {
    const s = plotSplit(RECT, [bldg(2, [[15, 0], [35, 0], [35, 10], [15, 10]])]);
    expect(s.builtM2).toBeCloseTo(50, 1); // 5 m × 10 m inside
  });
  it("overlapping footprints are not double-counted", () => {
    const s = plotSplit(RECT, [bldg(1, [[-10, -10], [10, -10], [10, 10], [-10, 10]]), bldg(2, [[0, 0], [15, 0], [15, 15], [0, 15]])]);
    expect(s.builtM2).toBeCloseTo(400 + 225 - 100, 1);
    expect(s.freeM2 + s.builtM2).toBeCloseTo(2000, 1);
  });
  it("no buildings → all free; degenerate plot → zeros", () => {
    expect(plotSplit(RECT, []).freeM2).toBeCloseTo(2000, 1);
    expect(plotSplit(closed([[0, 0], [1, 0]]), []).freeM2).toBe(0);
  });
});

import { stationDistances, type SiteStation, type StationData } from "../src/engine/siteChecks";
import { RULES } from "../src/engine/rules";
describe("stations (planning Q4, file from tile POIs)", () => {
  const st = (name: string, kind: SiteStation["kind"], xy: XY): SiteStation => ({ name, kind, at: f.toLngLat(xy) });
  const BKK: [number, number, number, number] = [100.3, 13.5, 100.95, 14.0];
  const data = (list: SiteStation[]): StationData => ({ status: "ready", list, bbox: BKK });
  it("500 m limit comes from the rule JSON", () => {
    expect(RULES.stationWithinM).toBe(500);
  });
  it("distance is to the plot boundary; inside = 0", () => {
    expect(stationDistances(RECT, data([st("Ari", "massTransit", [0, 0])]), 500).nearestMassTransit).toEqual({ name: "Ari", distM: 0 });
    const r = stationDistances(RECT, data([st("Ari", "massTransit", [0, 325])]), 500); // 300 m north of the 25 m edge
    expect(r.nearestMassTransit!.distM).toBeCloseTo(300, 1);
    expect(r.withinLimit).toBe(true);
  });
  it("600 m away is outside the limit; SRT rail never counts as mass transit", () => {
    const r = stationDistances(RECT, data([st("Far", "massTransit", [0, 625]), st("Sam Sen", "rail", [0, 50])]), 500);
    expect(r.withinLimit).toBe(false);
    expect(r.nearestRail!.name).toBe("Sam Sen");
  });
  it("unknown when the file is not loaded or the plot is outside its bbox", () => {
    expect(stationDistances(RECT, { status: "loading", list: [], bbox: null }, 500).status).toBe("unknown");
    expect(stationDistances(RECT, undefined, 500).status).toBe("unknown");
    const g = makeFrame(98.9853, 18.7883); // Chiang Mai
    const cm = [[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]].map((p) => g.toLngLat(p as XY));
    expect(stationDistances(cm, data([]), 500).status).toBe("unknown");
    expect(stationDistances(RECT, data([]), 500)).toMatchObject({ status: "known", withinLimit: false });
  });
  it("checkSite reports the nearest station as an info row", () => {
    const r = checkSite({ ...inputs(), stations: data([st("Ari", "massTransit", [0, 125])]) });
    expect(r.issues.find((i) => i.id === "station")!.title).toBe("Nearest BTS / MRT: Ari, 100 m from the plot");
  });
  it("the built stations file has the key Ari-area stations as mass transit", () => {
    const fc = JSON.parse(readFileSync("public/data/bkk-rail-stations.geojson", "utf8"));
    const kind = (n: string) => fc.features.filter((x: { properties: { name: string } }) => x.properties.name === n).map((x: { properties: { kind: string } }) => x.properties.kind);
    for (const n of ["Ari", "Saphan Khwai", "Sanam Pao", "Siam", "Asok", "Sukhumvit"]) expect(kind(n)).toContain("massTransit");
    expect(fc.properties.bbox).toEqual(BKK);
  });
});

describe("mass-transit line classification (allowlist + monorail track)", () => {
  const fc = JSON.parse(readFileSync("public/data/bkk-rail-stations.geojson", "utf8"));
  const allow = JSON.parse(readFileSync("../research/data/bkk-mass-transit-allowlist.json", "utf8"));
  type F = { properties: { name: string; kind: string; subclass: string; line?: string } };
  const kinds = (n: string) => (fc.features as F[]).filter((x) => x.properties.name === n).map((x) => `${x.properties.subclass}:${x.properties.kind}`);
  it("every allowlisted station (with its tile alias) exists in the tile data and is mass transit", () => {
    const alias = allow.tileNameAliases.aliases as Record<string, string>;
    for (const line of allow.lines as { line: string; stations: string[] }[]) {
      for (const n of line.stations) expect([line.line, n, kinds(alias[n] ?? n).some((k) => k === "station:massTransit")]).toEqual([line.line, n, true]);
    }
  });
  it("ARL, Red Line and monorail stations count; ordinary SRT does not", () => {
    for (const n of ["Makkasan", "Lat Krabang", "Krung Thep Aphiwat", "Don Muang", "Ram Inthra Kor Mor 4", "Lat Phrao 83", "Min Buri"]) expect(kinds(n)).toContain("station:massTransit");
    for (const n of ["Sam Sen", "Chitlada", "Thonburi", "Bang Sue Junction"]) expect(kinds(n).every((k) => k.endsWith(":rail"))).toBe(true);
    // the SRT halt named Phaya Thai stays ordinary rail even though the ARL station of that name counts
    expect(kinds("Phaya Thai")).toEqual(expect.arrayContaining(["halt:rail", "station:massTransit"]));
  });
});
