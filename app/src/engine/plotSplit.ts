// Split a plot into the part covered by existing building footprints and the free rest.
// PURE, local metres, polygon-clipping. Used live while drawing/dragging (Amitesh feedback 2).
import polygonClipping from "polygon-clipping";
import { bboxIntersects, bboxOf, centroidLngLat, makeFrame, openRing, type LngLat, type XY } from "./geo";
import { multiArea, toPc, type MultiPolygon, type Polygon } from "./polygon";
import type { SiteBuilding } from "./siteChecks";

export interface PlotSplit {
  freeM2: number;
  builtM2: number;
  /** lon/lat polygons (outer + holes), closed rings. */
  free: LngLat[][][];
  built: LngLat[][][];
}

const EMPTY: PlotSplit = { freeM2: 0, builtM2: 0, free: [], built: [] };

export function plotSplit(plot: LngLat[], buildings: SiteBuilding[]): PlotSplit {
  const ringLL = openRing(plot);
  if (ringLL.length < 3) return EMPTY;
  const [lon0, lat0] = centroidLngLat(ringLL);
  const f = makeFrame(lon0, lat0);
  const plotPc: Polygon = toPc(ringLL.map(f.toXY));
  const plotArea = multiArea([plotPc]);
  if (!(plotArea > 0)) return EMPTY;
  const toLL = (mp: MultiPolygon): LngLat[][][] => mp.map((poly) => poly.map((r) => r.map((p) => f.toLngLat(p as XY))));

  const bb = bboxOf(ringLL);
  const pieces: MultiPolygon[] = [];
  for (const b of buildings) {
    for (const poly of b.polygons) {
      if (!poly[0] || poly[0].length < 4 || !bboxIntersects(bboxOf(poly[0]), bb)) continue;
      const geom: Polygon = poly.map((r) => openRing(r).map((p) => f.toXY(p) as [number, number])).map((r) => [...r, r[0]]);
      try {
        const inter = polygonClipping.intersection(plotPc, geom);
        if (inter.length) pieces.push(inter);
      } catch {
        /* malformed tile geometry: skip */
      }
    }
  }
  if (!pieces.length) return { freeM2: plotArea, builtM2: 0, free: toLL([plotPc]), built: [] };
  let built: MultiPolygon;
  let free: MultiPolygon;
  try {
    // Union so overlapping footprints (tile duplicates, touching buildings) are not counted twice.
    built = pieces.length > 1 ? polygonClipping.union(pieces[0], ...pieces.slice(1)) : pieces[0];
    free = polygonClipping.difference(plotPc, built);
  } catch {
    return { freeM2: plotArea, builtM2: 0, free: toLL([plotPc]), built: [] };
  }
  const builtM2 = multiArea(built);
  return { freeM2: Math.max(0, plotArea - builtM2), builtM2, free: toLL(free), built: toLL(built) };
}
