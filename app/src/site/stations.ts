import type { SiteStation, StationData } from "@/engine/siteChecks";
import type { BBox, LngLat } from "@/engine/geo";

export const STATIONS_URL = "/data/bkk-rail-stations.geojson";

/** Load the station list built from tile POIs by scripts/fetch-stations.mjs (planning Q4). */
export async function loadStations(): Promise<StationData> {
  const res = await fetch(STATIONS_URL);
  if (!res.ok) throw new Error(`stations HTTP ${res.status}`);
  const fc = (await res.json()) as {
    properties: { bbox: BBox };
    features: { properties: { name: string; kind: SiteStation["kind"] }; geometry: { coordinates: LngLat } }[];
  };
  return {
    status: "ready",
    bbox: fc.properties.bbox,
    list: fc.features.map((f) => ({ name: f.properties.name, kind: f.properties.kind, at: f.geometry.coordinates })),
  };
}
