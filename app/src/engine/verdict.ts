// Simple-mode verdict and "what would let you build more?" (DESIGN_DIRECTION §6.1, §6.5). Pure; tested.
// Every sentence carries the check row that explains it ("Why?" → Expert, that row's proof).
import { computeAll, computeDesigns, type ComputeInputs, type ComputeResult, type DesignResult } from "./index";
import { centroidLngLat, makeFrame, openRing, type LngLat, type XY } from "./geo";
import { roughly } from "./units";
import type { StationResult } from "./siteChecks";

export type VerdictColour = "green" | "amber" | "red";

export interface Verdict {
  colour: VerdictColour;
  /** One plain sentence, no clause numbers. */
  sentence: string;
  /** Short reason, shown as "Why: …" (null when green). */
  why: string | null;
  /** The sentence already states the reason (Simple shows no separate reason line). */
  inSentence?: boolean;
  /** Which design and check row "Why?" opens in Expert. */
  open: { design: "A" | "B" | "C"; row: string } | null;
  numbers: { gfaM2: number; storeys: number; homes: number | null; homesLabel: string } | null;
  best: DesignResult | null;
}

/** Best design: buildable, fewest FAILs, then largest floor area. */
export function bestDesign(designs: DesignResult[]): DesignResult | null {
  const ok = designs.filter((d) => d.design.buildable);
  if (!ok.length) return null;
  return [...ok].sort((a, b) => a.summary.fail - b.summary.fail || b.design.gfaM2 - a.design.gfaM2)[0];
}

const ROW_FOR_LIMIT: Record<string, string> = { far: "far", sky: "sky", gate: "hr-access", lowRiseHeight: "hr-access", lowRiseArea: "far", parking: "parking", plate: "boundary-setback", width: "boundary-setback" };

export function verdictFor(r: ComputeResult | null, designs: DesignResult[], blockedReason: string | null): Verdict {
  const none = { open: null, numbers: null, best: null };
  if (blockedReason) return { colour: "red", sentence: "You can't build here.", why: blockedReason, ...none };
  if (!r || r.status === "invalid") return { colour: "red", sentence: "This plot shape doesn't work.", why: r?.message ?? null, ...none };
  // No road edge yet: a prompt, not a verdict (EXPECTATIONS I: "No road edge → prompt; no results").
  if (r.status === "no-road") return { colour: "amber", sentence: "Tap the side of the plot on the road.", why: null, ...none };
  const best = bestDesign(designs);
  if (!best) return { colour: "red", sentence: "You can't build here.", why: "it is too narrow after the required gaps", ...none };
  const g = best.design;
  const homes = g.programme.units ?? g.programme.rooms ?? null;
  const numbers = { gfaM2: roughly(g.gfaM2), storeys: g.storeys, homes: homes === null ? null : roughly(homes), homesLabel: g.programme.units !== undefined ? "homes" : g.programme.rooms !== undefined ? "rooms" : "" };
  const id = g.id;
  if (r.gate && !r.gate.permitted) {
    const w = Math.max(...r.roadEdges.map((e) => e.widthM));
    return { colour: "amber", sentence: `Low-rise only: ${+w.toFixed(1)} m road allows ${g.storeys} floors.`, why: `the road is ${+w.toFixed(1)} m wide`, inSentence: true, open: { design: id, row: "hr-access" }, numbers, best };
  }
  const fail = best.checks.find((c) => c.status === "FAIL");
  if (fail) return { colour: "amber", sentence: "Buildable, but one rule fails.", why: fail.label.toLowerCase(), open: { design: id, row: fail.id }, numbers, best };
  const tall = g.cls === "highRise" && g.heightM >= 23;
  return {
    colour: "green",
    sentence: tall ? "Yes, a tall building fits here." : "Yes, you can build here.",
    why: g.limitedBy ? g.limitedBy.label : null,
    open: { design: id, row: (g.limitedBy && ROW_FOR_LIMIT[g.limitedBy.kind]) || "far" },
    numbers,
    best,
  };
}

// ---------------- what would let you build more? ----------------

export interface WhatIf {
  text: string;
  /** Compact line for Simple mode (word budget). */
  short: string;
  gainM2: number;
}

const bestGfa = (inp: ComputeInputs, station: StationResult | null) => {
  const r = computeAll(inp);
  return bestDesign(computeDesigns(r, { type: inp.type, bonusPcts: inp.bonusPcts, station, assumptions: inp.assumptions }))?.design.gfaM2 ?? 0;
};

/** Move every corner that is not on a road edge away from the first road edge by `m` metres. */
export function deepen(plot: LngLat[], roadEdges: Record<number, number>, m: number): LngLat[] {
  const ring = openRing(plot);
  const roadIdx = Object.keys(roadEdges).map(Number);
  if (!roadIdx.length) return plot;
  const [lon0, lat0] = centroidLngLat(ring);
  const f = makeFrame(lon0, lat0);
  const xy = ring.map(f.toXY);
  const e = roadIdx[0];
  const a = xy[e];
  const b = xy[(e + 1) % xy.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let n: XY = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  // point the normal away from the road, i.e. towards the plot centre
  if ((0 - (a[0] + b[0]) / 2) * n[0] + (0 - (a[1] + b[1]) / 2) * n[1] < 0) n = [-n[0], -n[1]];
  const onRoad = new Set(roadIdx.flatMap((i) => [i, (i + 1) % xy.length]));
  const moved = xy.map((p, i) => (onRoad.has(i) ? p : ([p[0] + n[0] * m, p[1] + n[1] * m] as XY)));
  const out = moved.map(f.toLngLat);
  return [...out, out[0]];
}

/**
 * Re-run the engine with ONE change and report real before → after numbers (max 2, biggest gain first).
 * Changes tried: a wider road (10 / 12 m when the high-rise gate fails, +4 m when the sky plane binds),
 * a deeper plot (when nothing fits), a station within 500 m (when a use limit fails).
 */
export function whatIfs(inp: ComputeInputs, base: ComputeResult, designs: DesignResult[], station: StationResult | null): WhatIf[] {
  const out: WhatIf[] = [];
  if (base.status !== "ok") return out;
  const now = bestDesign(designs)?.design.gfaM2 ?? 0;
  const roads = Object.entries(inp.roadEdges).map(([k, w]) => [Number(k), w] as [number, number]);
  const widest = roads.sort((x, y) => y[1] - x[1])[0];
  const fmt = (x: number) => `~${roughly(x).toLocaleString("en-US")} m²`;
  if (widest) {
    const tries: number[] = [];
    if (base.gate && !base.gate.permitted) tries.push(10, 12);
    else if (bestDesign(designs)?.design.limitedBy?.kind === "sky") tries.push(widest[1] + 4);
    for (const w of tries) {
      if (w <= widest[1]) continue;
      const after = bestGfa({ ...inp, roadEdges: { ...inp.roadEdges, [widest[0]]: w } }, station);
      if (after > now + 1) out.push({ text: `If the road were ${w} m wide: ${fmt(now)} → ${fmt(after)}`, short: `${w} m road → ${fmt(after)}`, gainM2: after - now });
    }
  }
  if (!now) {
    for (const m of [2, 4, 6, 8, 10, 12]) {
      const after = bestGfa({ ...inp, plot: deepen(inp.plot, inp.roadEdges, m) }, station);
      if (after > 0) {
        out.push({ text: `A plot ${m} m deeper would make it buildable (${fmt(after)})`, short: `${m} m deeper plot → ${fmt(after)}`, gainM2: after });
        break;
      }
    }
  }
  const use = bestDesign(designs)?.checks.find((c) => c.id === "use");
  if (use && use.status !== "PASS" && station?.status === "known" && !station.withinLimit) {
    out.push({ text: `A station within ${station.limitM} m would allow this use at this size`, short: `Station ≤ ${station.limitM} m → this use OK`, gainM2: 0.5 });
  }
  // Two lines for the same change (10 m and 12 m road): keep the bigger one first, max 2 lines.
  return out.sort((a, b) => b.gainM2 - a.gainM2).slice(0, 2);
}
