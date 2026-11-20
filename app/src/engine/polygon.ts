// Polygon helpers in local metres: normalisation, validity, capsule buffer, boolean ops, areas.
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from "polygon-clipping";
import { dist, edges, openRing, segIntersectT, signedArea, type XY } from "./geo";

export type { MultiPolygon, Polygon };

const DUP_EPS = 0.05; // m: vertices closer than this are duplicates (BUILD_PLAN §4.1)
/** Capsule arcs: 16 segments per half circle (BUILD_PLAN §4.4). */
export const ARC_SEGMENTS = 16;

/** Closed? no. Counter-clockwise, no duplicate or collinear vertices (< 0.05 m). */
export function normaliseRing(ring: XY[]): XY[] {
  let r = openRing(ring).slice();
  // drop near-duplicates (including first/last)
  r = r.filter((p, i) => dist(p, r[(i + 1) % r.length]) >= DUP_EPS);
  // drop collinear vertices: distance from v to the line prev→next < eps
  let changed = true;
  while (changed && r.length > 3) {
    changed = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i - 1 + r.length) % r.length];
      const b = r[i];
      const c = r[(i + 1) % r.length];
      const L = dist(a, c);
      const cross = Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]));
      if (L > 0 && cross / L < DUP_EPS) {
        r.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (signedArea(r) < 0) r.reverse();
  return r;
}

/** True if no two non-adjacent edges intersect. */
export function isSimple(ring: XY[]): boolean {
  const es = edges(ring);
  const n = es.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent
      const [a, b] = es[i];
      const [c, d] = es[j];
      if (segIntersectT(a, b, c, d) !== null) return false;
    }
  }
  return true;
}

export type RingCheck = { ok: true; ring: XY[] } | { ok: false; reason: string };

/** Validate and normalise a plot ring. */
export function validatePlot(ring: XY[]): RingCheck {
  const r = normaliseRing(ring);
  if (r.length < 3) return { ok: false, reason: "A plot needs at least 3 distinct corners." };
  if (!isSimple(r)) return { ok: false, reason: "Plot edges cross each other (self-intersecting)." };
  if (!(Math.abs(signedArea(r)) > 0)) return { ok: false, reason: "Plot has no area." };
  return { ok: true, ring: r };
}

/**
 * All points within distance r of segment a-b. The straight sides sit exactly at r; each half-circle cap
 * is a CIRCUMSCRIBED polygon (tangent points at radius r, corner vertices at r / cos(step/2)), so the
 * polygon contains the true capsule: the envelope never comes closer than r to the edge.
 */
export function capsule(a: XY, b: XY, r: number, n = ARC_SEGMENTS): Polygon {
  const step = Math.PI / n;
  const R = r / Math.cos(step / 2);
  const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const pts: [number, number][] = [];
  const cap = (c: XY, from: number) => {
    pts.push([c[0] + r * Math.cos(from), c[1] + r * Math.sin(from)]); // tangent point (on the straight side)
    for (let k = 0; k < n; k++) {
      const t = from + (k + 0.5) * step;
      pts.push([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]);
    }
    pts.push([c[0] + r * Math.cos(from + Math.PI), c[1] + r * Math.sin(from + Math.PI)]); // opposite tangent point
  };
  cap(b, th - Math.PI / 2); // around b: th-90° → th+90°
  cap(a, th + Math.PI / 2); // around a: th+90° → th+270°
  pts.push(pts[0]);
  return [pts as Ring];
}

export function toPc(ring: XY[]): Polygon {
  const r = openRing(ring).map(([x, y]) => [x, y] as [number, number]);
  return [[...r, r[0]] as Ring];
}

/** Area of a polygon-clipping MultiPolygon (outer minus holes). */
export function multiArea(mp: MultiPolygon): number {
  let s = 0;
  for (const poly of mp) poly.forEach((ring, i) => (s += (i === 0 ? 1 : -1) * Math.abs(signedArea(ring as XY[]))));
  return s;
}

/** plot minus the union of the given polygons. */
export function subtract(plot: Polygon, cutters: Polygon[]): MultiPolygon {
  if (!cutters.length) return [plot];
  return polygonClipping.difference(plot, ...cutters);
}

export function intersect(a: MultiPolygon | Polygon, b: MultiPolygon | Polygon): MultiPolygon {
  return polygonClipping.intersection(a, b);
}

/** MultiPolygon minus the union of cutters. */
export function differenceMulti(base: MultiPolygon, cutters: Polygon[]): MultiPolygon {
  if (!cutters.length || !base.length) return base;
  return polygonClipping.difference(base, ...cutters);
}
