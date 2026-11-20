import { parseZones } from "@/engine/zones";
import type { SiteZone } from "@/engine/siteChecks";

export const ZONES_URL = "/data/bkk-zoning-2556.geojson";

/** Fetch the BMA zoning map once (1.4 MB, lazy, after first paint). */
export async function loadZones(): Promise<{ zones: SiteZone[]; geojson: GeoJSON.FeatureCollection }> {
  const res = await fetch(ZONES_URL);
  if (!res.ok) throw new Error(`zoning map HTTP ${res.status}`);
  const geojson = (await res.json()) as GeoJSON.FeatureCollection;
  return { zones: parseZones(geojson as never), geojson };
}
