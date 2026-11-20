// Per-edge setback distances (BUILD_PLAN §4.3). All numbers from RULES (bangkok-y10.json).
import { RULES } from "./rules";

export type SetbackTerm = "band" | "sky" | "clear" | "mr33" | "open";

export interface EdgeSetback {
  /** Distance from the plot edge inward, metres. */
  s: number;
  /** The rule that sets s (the largest term). */
  governing: SetbackTerm;
  clause: string;
  terms: Partial<Record<SetbackTerm, number>>;
}

const CLAUSE: Record<SetbackTerm, string> = {
  band: RULES.roadSetback.clause,
  sky: RULES.skyPlane.clause,
  clear: RULES.clearance.clause,
  mr33: RULES.highRise.source,
  open: RULES.boundaryOpenings.clause,
};

/** Road-setback band from the road boundary for right-of-way W (BMA ข้อ 50 = MR 55 ข้อ 41). */
export function roadBand(W: number): number {
  let best = 0;
  for (const b of RULES.roadSetback.bands) {
    const matches =
      (b.roadWidthLtM === undefined || W < b.roadWidthLtM) &&
      (b.roadWidthGteM === undefined || W >= b.roadWidthGteM) &&
      (b.roadWidthLteM === undefined || W <= b.roadWidthLteM) &&
      (b.roadWidthGtM === undefined || W > b.roadWidthGtM);
    if (!matches) continue;
    let d: number;
    if (b.minFractionOfRoadWidth !== undefined) d = b.minFractionOfRoadWidth * W;
    else d = b.minM ?? 0;
    // Distances measured from the road centreline convert to the boundary by subtracting W/2.
    if (b.from === "centreline") d -= W / 2;
    best = Math.max(best, d);
  }
  return Math.max(0, best);
}

/** Sky plane: height ≤ multiplier × (W + d) ⇒ d ≥ h / multiplier − W (BMA ข้อ 49). */
export function skyPlane(h: number, W: number): number {
  return Math.max(0, h / RULES.skyPlane.multiplier - W);
}

/** All-round clearance by building height H (BMA ข้อ 55). */
export function clearance(H: number): number {
  let m = 0;
  for (const t of RULES.clearance.tiers) {
    if ((t.heightMaxM !== undefined && H <= t.heightMaxM) || (t.heightGtM !== undefined && H > t.heightGtM)) m = Math.max(m, t.minM);
  }
  return m;
}

/** Distance to a neighbour boundary for a wall with openings (BMA ข้อ 54). All walls assumed to have openings. */
export function openingsDistance(H: number, storeys: number): number {
  let m = 0;
  for (const t of RULES.boundaryOpenings.tiers) {
    const hit =
      (t.storeysMin !== undefined && storeys >= t.storeysMin) ||
      (t.orHeightGtM !== undefined && H > t.orHeightGtM) ||
      (t.storeysMax !== undefined && t.heightMaxM !== undefined && storeys <= t.storeysMax && H <= t.heightMaxM);
    if (hit) m = Math.max(m, t.minM);
  }
  return m;
}

function pick(terms: Partial<Record<SetbackTerm, number>>, order: SetbackTerm[]): EdgeSetback {
  let governing: SetbackTerm = order[0];
  let s = -Infinity;
  for (const k of order) {
    const v = terms[k];
    if (v !== undefined && v > s + 1e-9) {
      s = v;
      governing = k;
    }
  }
  return { s: Math.max(0, s), governing, clause: CLAUSE[governing], terms };
}

/**
 * Road edge: max(band(W), clear(H), mr33 ? 6 : 0, sky(h, W)).
 * @param h top of the floor being checked (m above road level); H building height for clearance.
 */
export function roadSetback(W: number, h: number, H: number, mr33: boolean): EdgeSetback {
  const terms: Partial<Record<SetbackTerm, number>> = { band: roadBand(W), clear: clearance(H), sky: skyPlane(h, W) };
  if (mr33) terms.mr33 = RULES.highRise.setbackAllM;
  // Ties go to the earlier term: MR 33 first, then the sky plane, band, clearance.
  return pick(terms, ["mr33", "sky", "band", "clear"]);
}

/** Neighbour edge: mr33 ? 6 : max(open(H, storeys), clear(H)). */
export function neighbourSetback(H: number, storeys: number, mr33: boolean): EdgeSetback {
  if (mr33) return pick({ mr33: RULES.highRise.setbackAllM }, ["mr33"]);
  return pick({ open: openingsDistance(H, storeys), clear: clearance(H) }, ["open", "clear"]);
}
