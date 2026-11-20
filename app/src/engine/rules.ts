// Every legal number the engine uses, read from rules/bangkok-y10.json (EXPECTATIONS B).
// Pure: JSON import only. Each value carries the clause it comes from for labels and popovers.
import json from "../rules/bangkok-y10.json";

const bc = json.buildingControl;
const bma = json.bmaOrdinance2544;

type Band = { roadWidthLtM?: number; roadWidthGteM?: number; roadWidthLteM?: number; roadWidthGtM?: number; minM?: number; minFractionOfRoadWidth?: number; from: string };

export const RULES = {
  zone: { code: json.zone.code, nameEn: json.zone.nameEn },
  far: { max: json.zone.far.max, source: json.zone.far.source },
  farBonus: { capPct: json.zone.farBonus.combinedMaxPct, source: json.zone.farBonus.source, options: json.zone.farBonus.options },
  osr: { pctOfGfa: json.zone.osr.minPctOfTotalFloorArea, source: json.zone.osr.source },
  permeable: { pctOfRequiredOpen: json.zone.permeable.minPctOfRequiredOpenSpace, source: json.zone.permeable.source },
  openSpaceLand: {
    residentialPct: bma.openSpaceMinPctOfLand.residential,
    nonResidentialPct: bma.openSpaceMinPctOfLand.nonResidential,
    clause: `BMA ${bma.openSpaceMinPctOfLand.clause}`,
  },
  highRise: {
    minHeightM: bc.definitions.highRiseMinHeightM.value,
    extraLargeMinGfaM2: bc.definitions.extraLargeMinFloorAreaM2.value,
    defSource: bc.definitions.highRiseMinHeightM.source,
    setbackAllM: bc.highRiseOrExtraLarge.setbackFromAllBoundariesM,
    fireRoadM: bc.highRiseOrExtraLarge.fireRoadAroundBuildingM,
    roadAccess: bc.highRiseOrExtraLarge.roadAccess as { ifTotalFloorAreaMax?: number; ifTotalFloorAreaOver?: number; frontageMinM: number; roadWidthMinM: number }[],
    source: bc.highRiseOrExtraLarge.source,
  },
  roadSetback: { bands: bma.roadSetback.bands as Band[], clause: `BMA ${bma.roadSetback.clause}` },
  skyPlane: { multiplier: bma.heightVsRoad.multiplier, clause: `BMA ${bma.heightVsRoad.clause}` },
  clearance: {
    tiers: bma.clearanceAllRound as { heightMaxM?: number; heightGtM?: number; minM: number }[],
    clause: `BMA ${bma.clearanceAllRoundClause}`,
  },
  boundaryOpenings: {
    tiers: bma.boundaryOpenings as { storeysMax?: number; heightMaxM?: number; storeysMin?: number; orHeightGtM?: number; minM: number }[],
    clause: `BMA ${bma.boundaryOpeningsClause}`,
  },
  roadFace: bma.roadFace,
  /** ข้อ 17 use limits; the station distance is the same (500 m) in every condition that has one. */
  useLimits: json.zone.useLimits,
  stationWithinM: Math.max(
    ...json.zone.useLimits.flatMap((u) => ((u.requires?.anyOf ?? []) as { stationWithinM?: number }[]).map((a) => a.stationWithinM ?? 0)),
  ),
  parking: {
    condoPerUnit: bc.parkingBangkok.condoSpacesPerUnit,
    condoTriggerUnitM2Over: bc.parkingBangkok.condoTriggerUnitM2Over,
    largeBuildingM2PerSpace: bc.parkingBangkok.largeBuildingM2PerSpace,
    officeM2PerSpace: bc.parkingBangkok.officeM2PerSpace,
    hotel: bc.parkingBangkok.hotel,
    source: bc.parkingBangkok.source,
  },
} as const;
