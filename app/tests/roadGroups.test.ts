import { describe, expect, it } from "vitest";
import { edgeList, groupRoadEdges, patchGroup, removeGroup, edgeRuns, runMidpoint } from "../src/ui/roadGroups";

const re = {
  2: { widthM: 16, confirmed: false, label: "Soi Phahon Yothin 2 · tertiary" },
  3: { widthM: 16, confirmed: false, label: "Soi Phahon Yothin 2 · tertiary" },
  4: { widthM: 16, confirmed: false, label: "Soi Phahon Yothin 2 · tertiary" },
  5: { widthM: 10, confirmed: false, label: "added by you" },
  6: { widthM: 10, confirmed: false, label: "added by you" },
};
describe("road-edge grouping (planning decision 3)", () => {
  it("one card per named road; hand-added edges keep their own card", () => {
    const g = groupRoadEdges(re);
    expect(g.map((x) => [x.name, edgeList(x.edges)])).toEqual([
      ["Soi Phahon Yothin 2", "3–5"],
      [null, "6"],
      [null, "7"],
    ]);
  });
  it("one width for the whole road; removing removes all its edges", () => {
    const g = groupRoadEdges(re)[0];
    const next = patchGroup(re, g, { widthM: 12, confirmed: true });
    expect([next[2].widthM, next[3].widthM, next[4].widthM, next[5].widthM]).toEqual([12, 12, 12, 10]);
    expect(Object.keys(removeGroup(re, g))).toEqual(["5", "6"]);
  });
  it("edgeList formats runs and gaps", () => {
    expect(edgeList([4, 2, 3])).toBe("3–5");
    expect(edgeList([0, 2, 6])).toBe("1, 3, 7");
    expect(edgeList([1])).toBe("2");
  });
});

describe("one label per road run", () => {
  it("splits a group into consecutive runs, wrapping past the last edge", () => {
    expect(edgeRuns([1, 2, 3], 6)).toEqual([[1, 2, 3]]);
    expect(edgeRuns([0, 5, 2], 6)).toEqual([[5, 0], [2]]);
  });
  it("places the label halfway along the run", () => {
    // Three collinear edges of lengths 1, 1, 2 along the equator: halfway (2 of 4) = end of edge 2.
    const plot: [number, number][] = [[0, 0], [1, 0], [2, 0], [4, 0], [4, 1], [0, 0]];
    const [x, y] = runMidpoint(plot, [0, 1, 2]);
    expect(x).toBeCloseTo(2, 9);
    expect(y).toBe(0);
  });
});
