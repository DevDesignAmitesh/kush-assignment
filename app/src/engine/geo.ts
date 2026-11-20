// Pure geometry helpers in local metres. No DOM, no MapLibre.
// Projection per BUILD_PLAN §4.1: equirectangular around an origin; error < 0.1 % within 1 km.

export type LngLat = [number, number];
export type XY = [number, number];

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON_EQ = 111320;

export interface LocalFrame {
  lon0: number;
  lat0: number;
  toXY(p: LngLat): XY;
  toLngLat(p: XY): LngLat;
}

export function makeFrame(lon0: number, lat0: number): LocalFrame {
  const kx = M_PER_DEG_LON_EQ * Math.cos((lat0 * Math.PI) / 180);
  return {
    lon0,
    lat0,
    toXY: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * M_PER_DEG_LAT],
    toLngLat: ([x, y]) => [lon0 + x / kx, lat0 + y / M_PER_DEG_LAT],
  };
}

/** Open ring (last vertex != first). Drops a closing duplicate if present. */
export function openRing<T extends number[]>(ring: T[]): T[] {
  if (ring.length > 1) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Signed shoelace area (m²); positive = counter-clockwise. */
export function signedArea(ring: XY[]): number {
  const r = openRing(ring);
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function area(ring: XY[]): number {
  return Math.abs(signedArea(ring));
}

export function centroidLngLat(ring: LngLat[]): LngLat {
  const r = openRing(ring);
  let lon = 0;
  let lat = 0;
  for (const [x, y] of r) {
    lon += x;
    lat += y;
  }
  return [lon / r.length, lat / r.length];
}

/** Plot area in m² for a lon/lat ring. */
export function ringAreaM2(ring: LngLat[]): number {
  const [lon0, lat0] = centroidLngLat(ring);
  const f = makeFrame(lon0, lat0);
  return area(openRing(ring).map(f.toXY));
}

// ---------- planar helpers (local metres) ----------

export function dist(a: XY, b: XY): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function pointSegDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Parameter t on a→b where it properly crosses c→d, or null. */
export function segIntersectT(a: XY, b: XY, c: XY, d: XY): number | null {
  const r0 = b[0] - a[0];
  const r1 = b[1] - a[1];
  const s0 = d[0] - c[0];
  const s1 = d[1] - c[1];
  const den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

export function segSegDist(a: XY, b: XY, c: XY, d: XY): number {
  if (segIntersectT(a, b, c, d) !== null) return 0;
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}

/** Even-odd point-in-polygon on an open or closed ring. */
export function pointInRing(p: XY, ring: XY[]): boolean {
  const r = openRing(ring);
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function perimeter(ring: XY[]): number {
  const r = openRing(ring);
  let s = 0;
  for (let i = 0; i < r.length; i++) s += dist(r[i], r[(i + 1) % r.length]);
  return s;
}

/** Edges of a ring as [a, b] pairs. */
export function edges(ring: XY[]): [XY, XY][] {
  const r = openRing(ring);
  return r.map((p, i) => [p, r[(i + 1) % r.length]] as [XY, XY]);
}

/** Pieces of a polyline that lie inside a ring, and their total length. */
export function clipLineToRing(line: XY[], ring: XY[]): { length: number; pieces: XY[][] } {
  const es = edges(ring);
  const pieces: XY[][] = [];
  let length = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const ts = [0, 1];
    for (const [c, d] of es) {
      const t = segIntersectT(a, b, c, d);
      if (t !== null) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k];
      const t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      const lerp = (t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const mid = lerp((t0 + t1) / 2);
      if (!pointInRing(mid, ring)) continue;
      const p0 = lerp(t0);
      const p1 = lerp(t1);
      length += dist(p0, p1);
      const last = pieces[pieces.length - 1];
      if (last && dist(last[last.length - 1], p0) < 1e-6) last.push(p1);
      else pieces.push([p0, p1]);
    }
  }
  return { length, pieces };
}

export type BBox = [number, number, number, number]; // minX, minY, maxX, maxY

export function bboxOf(points: number[][]): BBox {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const [x, y] of points) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

export function bboxIntersects(p: BBox, q: BBox): boolean {
  return p[0] <= q[2] && q[0] <= p[2] && p[1] <= q[3] && q[1] <= p[3];
}
