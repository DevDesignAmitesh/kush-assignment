// Group road edges by the road they face (one card per road, one shared width). Pure helper.
import type { RoadEdgeState } from "@/store";

export interface RoadGroup {
  key: string;
  /** Road name, or null for an edge the user added by hand. */
  name: string | null;
  roadClass: string | null;
  edges: number[];
  widthM: number;
  confirmed: boolean;
}

const MANUAL = "added by you";

/** "3–5" for a run, "3, 5, 7" otherwise (1-based edge numbers). */
export function edgeList(edges: number[]): string {
  const n = [...edges].sort((a, b) => a - b).map((e) => e + 1);
  const consecutive = n.every((x, i) => i === 0 || x === n[i - 1] + 1);
  if (n.length > 1 && consecutive) return `${n[0]}–${n[n.length - 1]}`;
  return n.join(", ");
}

export function groupRoadEdges(roadEdges: Record<number, RoadEdgeState>): RoadGroup[] {
  const groups = new Map<string, RoadGroup>();
  for (const [k, r] of Object.entries(roadEdges)) {
    const edge = Number(k);
    const [name, cls] = (r.label ?? MANUAL).split(" · ");
    const manual = !r.label || r.label === MANUAL;
    // Auto-detected edges on the same named road share a card; hand-added edges keep their own.
    const key = manual ? `manual:${edge}` : `road:${name}`;
    const g = groups.get(key);
    if (g) {
      g.edges.push(edge);
      g.confirmed = g.confirmed && r.confirmed;
    } else {
      groups.set(key, { key, name: manual ? null : name, roadClass: manual ? null : (cls ?? null), edges: [edge], widthM: r.widthM, confirmed: r.confirmed });
    }
  }
  return [...groups.values()].sort((a, b) => Math.min(...a.edges) - Math.min(...b.edges));
}

/** Apply a patch to every edge of a group. */
export function patchGroup(roadEdges: Record<number, RoadEdgeState>, g: RoadGroup, patch: Partial<RoadEdgeState>): Record<number, RoadEdgeState> {
  const next = { ...roadEdges };
  for (const e of g.edges) next[e] = { ...next[e], ...patch };
  return next;
}

export function removeGroup(roadEdges: Record<number, RoadEdgeState>, g: RoadGroup): Record<number, RoadEdgeState> {
  const next = { ...roadEdges };
  for (const e of g.edges) delete next[e];
  return next;
}

/** Consecutive runs of a group's edges, e.g. [1,2,3,6] → [[1,2,3],[6]] (also wraps last → first edge). */
export function edgeRuns(edges: number[], edgeCount: number): number[][] {
  const set = new Set(edges);
  const runs: number[][] = [];
  const seen = new Set<number>();
  for (const e of [...edges].sort((a, b) => a - b)) {
    if (seen.has(e)) continue;
    // Walk back to the start of this run (wrapping), then forward.
    let start = e;
    for (let k = 0; k < edgeCount && set.has((start - 1 + edgeCount) % edgeCount) && (start - 1 + edgeCount) % edgeCount !== e; k++) start = (start - 1 + edgeCount) % edgeCount;
    const run: number[] = [];
    for (let j = start; set.has(j) && !seen.has(j); j = (j + 1) % edgeCount) {
      run.push(j);
      seen.add(j);
    }
    runs.push(run);
  }
  return runs;
}

/** Point halfway along the polyline formed by plot edges `run` (lng/lat, local metre scale). */
export function runMidpoint(plot: [number, number][], run: number[]): [number, number] {
  const kx = Math.cos((plot[0][1] * Math.PI) / 180);
  const segs = run.map((j) => [plot[j], plot[j + 1]] as const);
  const len = (a: readonly number[], b: readonly number[]) => Math.hypot((b[0] - a[0]) * kx, b[1] - a[1]);
  let half = segs.reduce((s, [a, b]) => s + len(a, b), 0) / 2;
  for (const [a, b] of segs) {
    const l = len(a, b);
    if (half <= l || l === 0) {
      const t = l === 0 ? 0 : half / l;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    half -= l;
  }
  const [a, b] = segs[segs.length - 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
