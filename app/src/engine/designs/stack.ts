// Floor stacking + the open-space / coverage iteration shared by the three designs (BUILD_PLAN §4.6, §6).
// stackFloors also reports WHY it stopped, so each design can say what limits it (direction file §3.3).
import { multiArea, type MultiPolygon } from "../polygon";
import type { Slice } from "../envelope";
import type { BuildingType } from "../far";
import { coverageCap, DESIGN_DEFAULTS, type DesignFloor } from "./common";

/** gfa: next floor would pass the floor-area cap · plate: plate < min size · width: tower plate < 12 m wide ·
 *  maxFloors: design floor limit · slices: the envelope has no more floors. */
export type StopReason = "gfa" | "plate" | "width" | "maxFloors" | "slices";

export interface Stack {
  floors: DesignFloor[];
  stop: StopReason;
  /** Envelope slice index the stack could not use (null when the envelope ran out). */
  stopSlice: number | null;
}

/** Stack floors from slices while each plate is usable and the GFA cap holds. plateFor returns null = too narrow. */
export function stackFloors(
  slices: Slice[],
  plateFor: (s: Slice, i: number) => MultiPolygon | null,
  gfaCap: number,
  opts: { maxFloors?: number; minPlateM2?: number } = {},
): Stack {
  const floors: DesignFloor[] = [];
  let gfa = 0;
  const minPlate = opts.minPlateM2 ?? DESIGN_DEFAULTS.minPlateM2;
  for (let i = 0; i < slices.length; i++) {
    if (opts.maxFloors !== undefined && floors.length >= opts.maxFloors) return { floors, stop: "maxFloors", stopSlice: i };
    const polys = plateFor(slices[i], i);
    if (!polys) return { floors, stop: "width", stopSlice: i };
    const areaM2 = multiArea(polys);
    if (!(areaM2 >= minPlate)) return { floors, stop: "plate", stopSlice: i };
    if (gfa + areaM2 > gfaCap + 1e-6) return { floors, stop: "gfa", stopSlice: i };
    gfa += areaM2;
    floors.push({ index: i, base: slices[i].base, top: slices[i].top, polys, areaM2, use: "residential" });
  }
  return { floors, stop: "slices", stopSlice: null };
}

const gfaOf = (s: Stack) => s.floors.reduce((a, f) => a + f.areaM2, 0);

/**
 * Open space depends on GFA, so the coverage cap does too: build with cap(maxGFA) first (always valid),
 * then retry with cap(previous GFA) and keep a result only if its footprint fits cap(its own GFA).
 * `shrunk` = the coverage cap made the footprint smaller than the ground slice.
 */
export function iterateCoverage(
  type: BuildingType,
  plotAreaM2: number,
  maxGfaM2: number,
  build: (cap: number) => Stack & { shrunk: boolean },
): Stack & { cap: number; shrunk: boolean } {
  let guess = maxGfaM2;
  let best: (Stack & { cap: number; shrunk: boolean }) | null = null;
  for (let iter = 0; iter < 4; iter++) {
    const cap = coverageCap(type, plotAreaM2, guess);
    const s = build(cap);
    const gfa = gfaOf(s);
    const footprint = s.floors[0]?.areaM2 ?? 0;
    const ownCap = coverageCap(type, plotAreaM2, gfa);
    if (footprint <= ownCap + 1e-6 && (!best || gfa > gfaOf(best))) best = { ...s, cap: ownCap };
    if (Math.abs(gfa - guess) < 1) break;
    guess = gfa;
  }
  return best ?? { floors: [], stop: "plate", stopSlice: 0, shrunk: false, cap: coverageCap(type, plotAreaM2, maxGfaM2) };
}
