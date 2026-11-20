// Shared pieces for concept designs (BUILD_PLAN §6). Pure. Assumption values are design choices,
// shown and editable later (not law); legal numbers come from RULES.
import polygonClipping from "polygon-clipping";
import { edges, dist, type XY } from "../geo";
import { capsule, multiArea, type MultiPolygon, type Polygon } from "../polygon";
import { openSpace, parkingRequired, type BuildingType } from "../far";
import type { FloorHeights } from "../envelope";
import { defaultAssumptions, type Assumptions } from "../assumptions";

export type FloorUse = "lobby" | "parking" | "residential" | "office" | "hotel" | "amenity";

export interface DesignFloor {
  index: number;
  base: number;
  top: number;
  /** Local metres (generator frame). */
  polys: MultiPolygon;
  areaM2: number;
  use: FloorUse;
}

export type DesignId = "A" | "B" | "C";

/** The rule that stops a design from growing (direction file: "Limited by: ..."). Edge = normalised-ring edge. */
export interface LimitedBy {
  kind: "far" | "gate" | "lowRiseArea" | "lowRiseHeight" | "sky" | "plate" | "width" | "parking";
  label: string;
  clause: string;
  edge?: number;
}

export interface Design {
  id: DesignId;
  name: string;
  cls: "highRise" | "lowRise";
  buildable: boolean;
  reason?: string;
  floors: DesignFloor[];
  gfaM2: number;
  heightM: number;
  storeys: number;
  footprintM2: number;
  coverageCapM2: number;
  openSpaceM2: number;
  programme: { netAreaM2: number; units?: number; rooms?: number };
  parking: { required: number; provided: number; openAirStalls: number; note?: string };
  notes: string[];
  limitedBy: LimitedBy | null;
  /** The coverage cap (open space) made the footprint smaller than the ground slice. */
  footprintShrunkForOpenSpace: boolean;
}

/** Fixed design choices (BUILD_PLAN §4.7, §6.1). The editable ones live in ../assumptions; the values here are
 *  their defaults, kept for callers that have no overrides. */
export const DESIGN_DEFAULTS = {
  efficiency: { condo: 0.75, office: 0.8, hotel: 0.65 } as Record<BuildingType, number>,
  condoUnitM2: 35,
  hotelRoomM2: 32,
  parkingStallM2: 30,
  minPlateM2: 150,
  towerPlate: { shareOfPlot: 0.35, minM2: 450, maxM2: 1200, minWidthM: 12 },
  podiumFloors: 3,
  lowRiseMaxFloors: 7,
  /** Share of the ground-level open space Design C may use for an open-air car park. */
  openAirParkingShare: 0.5,
  insetPrecisionM: 0.1,
} as const;

export function floorHeightsFor(type: BuildingType, a: Assumptions = defaultAssumptions(type)): FloorHeights {
  return { groundM: a.groundFloorM, typicalM: a.typicalFloorM };
}

/** Uniform inward offset by d: polygon minus capsules of every boundary edge (outer rings and holes). */
export function inset(mp: MultiPolygon, d: number): MultiPolygon {
  if (d <= 0 || !mp.length) return mp;
  const cutters: Polygon[] = [];
  for (const poly of mp) for (const ring of poly) for (const [a, b] of edges(ring as XY[])) if (dist(a, b) > 1e-9) cutters.push(capsule(a, b, d));
  if (!cutters.length) return mp;
  try {
    return polygonClipping.difference(mp, ...cutters);
  } catch {
    return [];
  }
}

/** Smallest uniform inset (0.1 m steps) that brings the area to ≤ maxArea. */
export function insetToArea(mp: MultiPolygon, maxArea: number): { polys: MultiPolygon; insetM: number } {
  if (multiArea(mp) <= maxArea + 1e-9) return { polys: mp, insetM: 0 };
  if (maxArea <= 0) return { polys: [], insetM: Infinity };
  let lo = 0;
  let hi = 1;
  while (multiArea(inset(mp, hi)) > maxArea && hi < 500) hi *= 2;
  while (hi - lo > DESIGN_DEFAULTS.insetPrecisionM) {
    const mid = (lo + hi) / 2;
    if (multiArea(inset(mp, mid)) > maxArea) lo = mid;
    else hi = mid;
  }
  return { polys: inset(mp, hi), insetM: hi };
}

export function intersect(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (!a.length || !b.length) return [];
  try {
    return polygonClipping.intersection(a, b);
  } catch {
    return [];
  }
}

/** Net area and units / rooms from the non-parking, non-lobby floors. */
export function programmeFor(type: BuildingType, floors: DesignFloor[], a: Assumptions = defaultAssumptions(type)): Design["programme"] {
  const usable = floors.filter((f) => f.use === "residential" || f.use === "office" || f.use === "hotel").reduce((s, f) => s + f.areaM2, 0);
  const net = usable * a.efficiency;
  if (type === "condo") return { netAreaM2: net, units: Math.floor(net / a.condoUnitM2) };
  if (type === "hotel") return { netAreaM2: net, rooms: Math.floor(net / a.hotelRoomM2) };
  return { netAreaM2: net };
}

export const mainUse = (type: BuildingType): FloorUse => (type === "condo" ? "residential" : type);

/**
 * Assign floor uses bottom-up: parking floors until the required stalls fit (up to maxParkingFloors), ground
 * floor becomes the lobby when no parking is needed there, the rest is the main use. Returns stalls provided.
 */
export function assignUses(type: BuildingType, floors: DesignFloor[], maxParkingFloors: number, extraStalls = 0, a: Assumptions = defaultAssumptions(type)): { provided: number; required: number; note?: string } {
  for (const f of floors) f.use = mainUse(type);
  const gfa = floors.reduce((s, f) => s + f.areaM2, 0);
  // Two passes: parking depends on units, units depend on which floors are parking.
  let required = 0;
  let provided = extraStalls;
  for (let pass = 0; pass < 2; pass++) {
    const prog = programmeFor(type, floors, a);
    const p = parkingRequired({ type, gfaM2: gfa, units: prog.units, avgUnitM2: a.condoUnitM2, rooms: prog.rooms });
    required = p.required;
    let need = Math.max(0, required - extraStalls) * a.parkingStallM2;
    provided = extraStalls;
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      if (i < maxParkingFloors && need > 0) {
        f.use = "parking";
        need -= f.areaM2;
        provided += Math.floor(f.areaM2 / a.parkingStallM2);
      } else f.use = i === 0 ? "lobby" : mainUse(type);
    }
  }
  const note = provided < required ? `Parking short by ${required - provided} stalls (basement or more parking floors needed).` : undefined;
  return { provided, required, note };
}

/** Required open space and coverage cap for a GFA (iteration helper). */
export const coverageCap = (type: BuildingType, plotAreaM2: number, gfaM2: number) => openSpace(type, plotAreaM2, gfaM2).coverageCapM2;
