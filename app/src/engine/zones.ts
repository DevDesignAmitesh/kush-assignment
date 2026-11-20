// Parse the Bangkok zoning GeoJSON into SiteZone records (pure; fetching is done in src/site).
import { bboxOf, type LngLat } from "./geo";
import type { SiteZone } from "./siteChecks";

interface ZoneFeature {
  properties: { zone: string; category: string };
  geometry: { type: "Polygon"; coordinates: LngLat[][] } | { type: "MultiPolygon"; coordinates: LngLat[][][] };
}

export function parseZones(fc: { features: ZoneFeature[] }): SiteZone[] {
  const out: SiteZone[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || !f.properties?.zone) continue;
    const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
    if (!polygons) continue;
    out.push({
      code: f.properties.zone,
      category: f.properties.category,
      polygons,
      bbox: bboxOf(polygons.flatMap((p) => p[0])),
    });
  }
  return out;
}
