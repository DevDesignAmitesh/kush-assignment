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
