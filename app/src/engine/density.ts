// "How big is this next to the neighbours?" (DESIGN_DIRECTION §6.4). Pure; tested.
// Heights come from OSM tiles (render_height), so the result is an estimate.
import type { LngLat } from "./geo";
import type { SiteBuilding } from "./siteChecks";

export const DENSITY = { radiusM: 300, lowMax: 1.5, mediumMax: 3 } as const;
export type DensityBucket = "Low" | "Medium" | "High";

export interface DensityResult {
  medianM: number;
  count: number;
  ratio: number;
  bucket: DensityBucket;
}

export function bucketFor(ratio: number): DensityBucket {
  if (ratio <= DENSITY.lowMax) return "Low";
  if (ratio <= DENSITY.mediumMax) return "Medium";
  return "High";
}

/** Median OSM building height within radius of `at` (excluding `skip` ids), and the design's ratio to it. */
export function densityMeter(designHeightM: number, buildings: SiteBuilding[], at: LngLat, skip: Set<string | number> = new Set(), radiusM: number = DENSITY.radiusM): DensityResult | null {
  const kx = 111320 * Math.cos((at[1] * Math.PI) / 180);
  const hs: number[] = [];
  for (const b of buildings) {
    if (skip.has(b.id) || !(b.height && b.height > 0)) continue;
    const p = b.polygons[0]?.[0]?.[0];
    if (!p) continue;
    if (Math.hypot((p[0] - at[0]) * kx, (p[1] - at[1]) * 110574) > radiusM) continue;
    hs.push(b.height);
  }
  if (!hs.length || !(designHeightM > 0)) return null;
  hs.sort((a, b) => a - b);
  const m = hs.length % 2 ? hs[(hs.length - 1) / 2] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2;
  const ratio = designHeightM / m;
  return { medianM: m, count: hs.length, ratio, bucket: bucketFor(ratio) };
}
