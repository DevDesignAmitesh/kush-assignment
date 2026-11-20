// Keep road-edge flags when the plot's corners change (vertex inserted / deleted shifts edge indices).
// Pure. A new edge inherits an old edge's value when its midpoint lies on that old edge (≤ tol) and it
// runs parallel to it (< maxAngleDeg). Splitting a road edge gives two road edges; merges are dropped.
import { centroidLngLat, makeFrame, openRing, pointSegDist, type LngLat, type XY } from "./geo";
import { angleBetween } from "./siteChecks";

export function remapEdges<T>(oldPlot: LngLat[], newPlot: LngLat[], values: Record<number, T>, tolM = 0.5, maxAngleDeg = 5): Record<number, T> {
  const o = openRing(oldPlot);
  const n = openRing(newPlot);
  if (o.length < 3 || n.length < 3) return {};
  const [lon0, lat0] = centroidLngLat(n);
  const f = makeFrame(lon0, lat0);
  const oXY = o.map(f.toXY);
  const nXY = n.map(f.toXY);
  const out: Record<number, T> = {};
  for (let j = 0; j < nXY.length; j++) {
    const a = nXY[j];
    const b = nXY[(j + 1) % nXY.length];
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const [k, v] of Object.entries(values)) {
      const i = Number(k);
      const c = oXY[i];
      const d = oXY[(i + 1) % oXY.length];
      if (!c || !d) continue;
      if (pointSegDist(mid, c, d) <= tolM && angleBetween([a, b], [c, d]) < maxAngleDeg) {
        out[j] = v;
        break;
      }
    }
  }
  return out;
}
