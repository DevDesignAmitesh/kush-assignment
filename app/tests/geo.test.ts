import { describe, expect, it } from "vitest";
import { area, makeFrame, ringAreaM2, signedArea, type XY } from "../src/engine/geo";

describe("geo", () => {
  it("shoelace area of a 40 x 50 m rectangle is 2000 m², CCW positive", () => {
    const r: XY[] = [[0, 0], [40, 0], [40, 50], [0, 50]];
    expect(signedArea(r)).toBe(2000);
    expect(area([...r].reverse())).toBe(2000);
  });

  it("projection round-trips and a lon/lat rectangle in Ari measures ~2000 m²", () => {
    const f = makeFrame(100.5446, 13.7797);
    const corners: XY[] = [[-20, -25], [20, -25], [20, 25], [-20, 25]];
    const ll = corners.map(f.toLngLat);
    ll.forEach((p, i) => {
      const [x, y] = f.toXY(p);
      expect(x).toBeCloseTo(corners[i][0], 6);
      expect(y).toBeCloseTo(corners[i][1], 6);
    });
    expect(ringAreaM2([...ll, ll[0]])).toBeCloseTo(2000, 0);
  });
});
