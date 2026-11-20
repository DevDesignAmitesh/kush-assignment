// FAR, open space and parking (BUILD_PLAN §4.5-4.7). Numbers from RULES.
import { RULES } from "./rules";

export type BuildingType = "condo" | "office" | "hotel";
export const RESIDENTIAL: Record<BuildingType, boolean> = { condo: true, hotel: true, office: false };

export interface FarResult {
  baseFar: number;
  /** Sum of selected bonuses before the cap, %. */
  bonusRequestedPct: number;
  /** Applied bonus, % (capped). */
  bonusPct: number;
  capped: boolean;
  far: number;
  maxGfaM2: number;
  source: string;
}

/** maxGFA = plotArea × FAR × (1 + min(cap, Σ bonuses)). */
export function farLimit(plotAreaM2: number, bonusPcts: number[] = []): FarResult {
  const requested = bonusPcts.reduce((s, x) => s + Math.max(0, x), 0);
  const bonusPct = Math.min(RULES.farBonus.capPct, requested);
  const far = RULES.far.max * (1 + bonusPct / 100);
  return {
    baseFar: RULES.far.max,
    bonusRequestedPct: requested,
    bonusPct,
    capped: requested > RULES.farBonus.capPct,
    far,
    maxGfaM2: plotAreaM2 * far,
    source: RULES.far.source,
  };
}

export interface OpenSpaceResult {
  landPct: number;
  byLandM2: number;
  byOsrM2: number;
  requiredM2: number;
  governing: "land" | "osr";
  /** Ground coverage cap = plot area − required open space. */
  coverageCapM2: number;
  /** Permeable area required: share of the OSR requirement (ข้อ 17 (2)). */
  permeableRequiredM2: number;
}

/** required = max(landPct × plot, osr% × GFA). */
export function openSpace(type: BuildingType, plotAreaM2: number, gfaM2: number): OpenSpaceResult {
  const landPct = RESIDENTIAL[type] ? RULES.openSpaceLand.residentialPct : RULES.openSpaceLand.nonResidentialPct;
  const byLand = (landPct / 100) * plotAreaM2;
  const byOsr = (RULES.osr.pctOfGfa / 100) * gfaM2;
  const required = Math.max(byLand, byOsr);
  return {
    landPct,
    byLandM2: byLand,
    byOsrM2: byOsr,
    requiredM2: required,
    governing: byLand >= byOsr ? "land" : "osr",
    coverageCapM2: Math.max(0, plotAreaM2 - required),
    permeableRequiredM2: (RULES.permeable.pctOfRequiredOpen / 100) * byOsr,
  };
}

export interface ParkingInput {
  type: BuildingType;
  gfaM2: number;
  units?: number;
  avgUnitM2?: number;
  rooms?: number;
}

export interface ParkingResult {
  required: number;
  byUse: number;
  byArea: number;
  note?: string;
}

/** Bangkok parking (MR 7 ข้อ 3): max(per-use total, GFA / 120). */
export function parkingRequired(p: ParkingInput): ParkingResult {
  const P = RULES.parking;
  const byArea = p.gfaM2 / P.largeBuildingM2PerSpace;
  let byUse = 0;
  const note: string | undefined = undefined;
  if (p.type === "office") byUse = p.gfaM2 / P.officeM2PerSpace;
  else if (p.type === "condo") byUse = (p.avgUnitM2 ?? 0) > P.condoTriggerUnitM2Over ? (p.units ?? 0) * P.condoPerUnit : 0;
  else {
    // MR 7 ข้อ 3 (1)(B) Bangkok: 10 for the first 30 rooms, 1 per 5 rooms up to 100, then 1 per 10; each
    // part rounded up ("fractions of 5 / 10 rooms count as a full 5 / 10").
    const h = P.hotel;
    const rooms = p.rooms ?? 0;
    if (rooms > 0) {
      byUse = h.spacesForFirstRooms;
      if (rooms > h.firstRooms) byUse += Math.ceil((Math.min(rooms, h.upToRooms) - h.firstRooms) / h.thenRoomsPerSpace);
      if (rooms > h.upToRooms) byUse += Math.ceil((rooms - h.upToRooms) / h.aboveRoomsPerSpace);
    }
  }
  return { required: Math.ceil(Math.max(byUse, byArea) - 1e-9), byUse, byArea, note };
}
