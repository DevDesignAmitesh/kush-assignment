import { describe, expect, it } from "vitest";
import { decodeScenario, encodeScenario } from "../src/ui/scenario";
import type { Snapshot } from "../src/store";

const plot: [number, number][] = [[100.5441234, 13.7791234], [100.5451234, 13.7791234], [100.5451234, 13.7801234], [100.5441234, 13.7801234], [100.5441234, 13.7791234]];

describe("share URL scenario", () => {
  it("round-trips plot, road edges, type, bonuses and assumptions exactly", () => {
    const s: Snapshot = {
      plot,
      roadEdges: { 0: { widthM: 12, confirmed: true, label: "Soi Ari 1 · minor" }, 2: { widthM: 8.5, confirmed: false } },
      roadEdgesSource: "user",
      buildingType: "office",
      bonuses: { "energy-certified": 10 },
      assumptions: { typicalFloorM: 3.2, parkingInFar: false },
    };
    const back = decodeScenario(encodeScenario(s)!);
    expect(back).toEqual(s);
  });
  it("rejects malformed links instead of crashing", () => {
    expect(decodeScenario("not-base64!!")).toBeNull();
    expect(decodeScenario(btoa(JSON.stringify({ v: 1, p: [1, 2], r: [], t: "condo", b: {} })))).toBeNull();
    expect(encodeScenario({ plot: null, roadEdges: {}, roadEdgesSource: "auto", buildingType: "condo", bonuses: {}, assumptions: {} })).toBeNull();
  });
  it("drops out-of-range or unknown assumptions from a link", () => {
    const code = btoa(JSON.stringify({ v: 1, p: plot.slice(0, -1).flat(), r: [], t: "condo", b: {}, a: { groundFloorM: 99, efficiency: 0.7, evil: 1, parkingInFar: "no" } }));
    expect(decodeScenario(code)?.assumptions).toEqual({ efficiency: 0.7 });
  });
});
