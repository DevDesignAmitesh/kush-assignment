// Design assumptions (not law): defaults shown and editable in the UI (BUILD_PLAN §3, §6.1).
import type { FloorHeights } from "./envelope";

export const DEFAULT_FLOORS: FloorHeights = { groundM: 4.5, typicalM: 3.0 };

export const DESIGN_ASSUMPTIONS = {
  /** Smallest usable floor plate (Design A, BUILD_PLAN §6.2). */
  minPlateM2: 150,
} as const;

/** Road right-of-way input range (EXPECTATIONS C; break-it "width 0 / 3 / 100"). */
export const ROAD_WIDTH_LIMITS = { minM: 3, maxM: 60 } as const;

export function clampRoadWidth(w: number): { value: number; clamped: boolean } {
  if (!Number.isFinite(w)) return { value: ROAD_WIDTH_LIMITS.minM, clamped: true };
  const v = Math.min(ROAD_WIDTH_LIMITS.maxM, Math.max(ROAD_WIDTH_LIMITS.minM, w));
  return { value: v, clamped: v !== w };
}

// ---------------- editable design assumptions (EXPECTATIONS C) ----------------

export type AssumptionType = "condo" | "office" | "hotel";

export interface Assumptions {
  groundFloorM: number;
  typicalFloorM: number;
  /** Net / gross efficiency of the main-use floors. */
  efficiency: number;
  condoUnitM2: number;
  hotelRoomM2: number;
  parkingStallM2: number;
  /** Share of the open space that is permeable (unsealed). */
  permeableShare: number;
  /** Parking floors count toward the floor area used for the FAR limit. */
  parkingInFar: boolean;
}

export type AssumptionOverrides = Partial<Assumptions>;
export type NumericAssumption = Exclude<keyof Assumptions, "parkingInFar">;

export function defaultAssumptions(type: AssumptionType): Assumptions {
  return {
    groundFloorM: DEFAULT_FLOORS.groundM,
    typicalFloorM: type === "office" ? 3.6 : DEFAULT_FLOORS.typicalM,
    efficiency: { condo: 0.75, office: 0.8, hotel: 0.65 }[type],
    condoUnitM2: 35,
    hotelRoomM2: 32,
    parkingStallM2: 30,
    permeableShare: 0.6,
    parkingInFar: true,
  };
}

/** Allowed input ranges (inclusive). Plausible design values, not law. */
export const ASSUMPTION_RANGES: Record<NumericAssumption, { min: number; max: number }> = {
  groundFloorM: { min: 3, max: 8 },
  typicalFloorM: { min: 2.6, max: 5 },
  efficiency: { min: 0.5, max: 0.95 },
  condoUnitM2: { min: 20, max: 300 },
  hotelRoomM2: { min: 18, max: 120 },
  parkingStallM2: { min: 20, max: 45 },
  permeableShare: { min: 0, max: 1 },
};

export function assumptionInRange(key: NumericAssumption, v: number): boolean {
  const r = ASSUMPTION_RANGES[key];
  return Number.isFinite(v) && v >= r.min && v <= r.max;
}

/** Keep only known keys with valid values (URL input is untrusted). */
export function sanitizeAssumptions(o: unknown): AssumptionOverrides {
  const out: AssumptionOverrides = {};
  if (!o || typeof o !== "object") return out;
  const src = o as Record<string, unknown>;
  for (const k of Object.keys(ASSUMPTION_RANGES) as NumericAssumption[]) {
    const v = src[k];
    if (typeof v === "number" && assumptionInRange(k, v)) out[k] = v;
  }
  if (typeof src.parkingInFar === "boolean") out.parkingInFar = src.parkingInFar;
  return out;
}

export function resolveAssumptions(type: AssumptionType, o?: AssumptionOverrides): Assumptions {
  return { ...defaultAssumptions(type), ...sanitizeAssumptions(o) };
}
