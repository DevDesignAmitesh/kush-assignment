// Building class and the MR 33 high-rise road-access gate (BUILD_PLAN §4.2).
import { RULES } from "./rules";

export interface BuildingClass {
  highRise: boolean;
  extraLarge: boolean;
  /** MR 33 applies (high-rise or extra-large). */
  mr33: boolean;
}

export function classify(heightM: number, gfaM2: number): BuildingClass {
  const highRise = heightM >= RULES.highRise.minHeightM;
  const extraLarge = gfaM2 >= RULES.highRise.extraLargeMinGfaM2;
  return { highRise, extraLarge, mr33: highRise || extraLarge };
}

export interface RoadEdgeInfo {
  edge: number;
  widthM: number;
  lengthM: number;
}

export interface GateResult {
  /** MR 33 buildings allowed at all (the ≤ 30,000 m² tier passes). */
  permitted: boolean;
  /** Largest GFA the gate allows for an MR 33 building (Infinity if the widest tier passes). */
  maxGfaM2: number;
  /** Road edge that satisfies the gate, if any. */
  viaEdge: number | null;
  reason: string;
  source: string;
}

/** A road edge with W ≥ roadWidthMin and plot-edge length ≥ frontageMin, per GFA tier (MR 33 ข้อ 2). */
export function highRiseGate(roads: RoadEdgeInfo[]): GateResult {
  const tiers = RULES.highRise.roadAccess;
  const small = tiers.find((t) => t.ifTotalFloorAreaMax !== undefined)!;
  const large = tiers.find((t) => t.ifTotalFloorAreaOver !== undefined)!;
  const meets = (t: { frontageMinM: number; roadWidthMinM: number }) =>
    roads.find((r) => r.widthM >= t.roadWidthMinM && r.lengthM >= t.frontageMinM) ?? null;
  const viaLarge = meets(large);
  const viaSmall = meets(small);
  if (viaLarge) {
    return { permitted: true, maxGfaM2: Infinity, viaEdge: viaLarge.edge, reason: "Road access allows high-rise of any size.", source: RULES.highRise.source };
  }
  if (viaSmall) {
    return {
      permitted: true,
      maxGfaM2: large.ifTotalFloorAreaOver!,
      viaEdge: viaSmall.edge,
      reason: `High-rise allowed up to ${large.ifTotalFloorAreaOver!.toLocaleString("en-US")} m² (a road ≥ ${large.roadWidthMinM} m would allow more).`,
      source: RULES.highRise.source,
    };
  }
  return {
    permitted: false,
    maxGfaM2: 0,
    viaEdge: null,
    reason: `Road < ${small.roadWidthMinM} m (or frontage < ${small.frontageMinM} m): max ${(RULES.highRise.minHeightM - 0.01).toFixed(2)} m and < ${RULES.highRise.extraLargeMinGfaM2.toLocaleString("en-US")} m².`,
    source: RULES.highRise.source,
  };
}
