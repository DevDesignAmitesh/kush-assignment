// Reads OSM buildings and roads from the OpenFreeMap vector tiles the map has already loaded
// (DEVIATIONS.md: replaces Overpass as the primary context source).
// Only features near a FOCUS point (plot centroid, else map centre) are kept and shown: keeping every
// building seen while zoomed out (26k at z15 in central Bangkok) crashed the tab (AI miss #21).
import type { Map as MlMap, GeoJSONFeature } from "maplibre-gl";
import { bboxOf, type BBox, type LngLat } from "@/engine/geo";
import type { DataStatus, SiteBuilding, SiteRoad, SiteRoadName } from "@/engine/siteChecks";

export const VECTOR_SOURCE = "openmaptiles";
/** OpenMapTiles carries full building detail from tile zoom 14. */
export const DETAIL_ZOOM = 14;

export const CONTEXT_LIMITS = {
  /** Keep features within this distance of the focus (m). */
  keepRadiusM: 1200,
  /** Default show/check radius (m); plan §5.1 asks for ~450 m. Phones use 300 m (ui/device). */
  showRadiusM: 450,
  /** Hard cap on buildings shown (nearest first). */
  maxShownBuildings: 12_000,
  /** Re-prune stored features when the focus moves this far (m). */
  refocusM: 300,
} as const;

const r6 = (n: number) => Math.round(n * 1e6);
const coordKey = (c: LngLat[]) => `${c.length}:${r6(c[0][0])},${r6(c[0][1])}:${r6(c[c.length - 1][0])},${r6(c[c.length - 1][1])}`;

/** Approximate ground distance in metres (fine for radius filtering). */
function metres(a: LngLat, b: LngLat): number {
  const kx = 111320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110574);
}

function lines(f: GeoJSONFeature): LngLat[][] {
  const g = f.geometry;
  if (g.type === "LineString") return [g.coordinates as LngLat[]];
  if (g.type === "MultiLineString") return g.coordinates as LngLat[][];
  return [];
}
function polygons(f: GeoJSONFeature): LngLat[][][] {
  const g = f.geometry;
  if (g.type === "Polygon") return [g.coordinates as LngLat[][]];
  if (g.type === "MultiPolygon") return g.coordinates as LngLat[][][];
  return [];
}
function nameOf(p: Record<string, unknown>): string | null {
  const n = (p["name:en"] ?? p["name_en"] ?? p["name:latin"] ?? p["name"]) as string | undefined;
  return n && n.trim() ? n.trim() : null;
}
/** Nearest point of a line to p, by vertices (good enough for radius filters). */
function lineDist(c: LngLat[], p: LngLat): number {
  let m = Infinity;
  for (const q of c) m = Math.min(m, metres(q, p));
  return m;
}

export interface ContextSnapshot {
  roads: SiteRoad[];
  roadNames: SiteRoadName[];
  buildings: SiteBuilding[];
}

export class TileContextCollector {
  constructor(private readonly showRadiusM: number = CONTEXT_LIMITS.showRadiusM) {}
  private buildings = new Map<string, SiteBuilding>();
  private roads = new Map<string, SiteRoad>();
  private names = new Map<string, SiteRoadName>();
  private covered: BBox[] = [];
  private version = 0;
  private pruneFocus: LngLat | null = null;
  private snapCache: { key: string; snap: ContextSnapshot } | null = null;

  /** Pull features near `focus` from the loaded tiles. Returns true when anything new arrived. */
  collect(map: MlMap, focus: LngLat): boolean {
    if (!map.getSource(VECTOR_SOURCE) || map.getZoom() < DETAIL_ZOOM) return false;
    const before = this.version;
    const keep = CONTEXT_LIMITS.keepRadiusM;
    this.prune(focus);

    // Tile feature ids are NOT per building: at z14 OpenMapTiles merges equal-height buildings into one
    // MultiPolygon with one id (AI miss #16). Each polygon part is therefore its own building.
    for (const f of map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: "building" })) {
      const height = Number(f.properties.render_height) || undefined;
      const minHeight = Number(f.properties.render_min_height) || 0;
      for (const poly of polygons(f)) {
        if (!poly[0] || poly[0].length < 4) continue;
        if (metres(poly[0][0], focus) > keep) continue;
        const k = coordKey(poly[0]);
        if (this.buildings.has(k)) continue;
        this.buildings.set(k, { id: k, polygons: [poly], height, minHeight });
        this.version++;
      }
    }
    for (const f of map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: "transportation" })) {
      const p = f.properties;
      for (const c of lines(f)) {
        if (c.length < 2 || lineDist(c, focus) > keep) continue;
        const k = `${p.class}:${coordKey(c)}`;
        if (this.roads.has(k)) continue;
        this.roads.set(k, { cls: String(p.class), subclass: p.subclass as string | undefined, brunnel: p.brunnel as string | undefined, coords: c });
        this.version++;
      }
    }
    for (const f of map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: "transportation_name" })) {
      const name = nameOf(f.properties);
      if (!name) continue;
      for (const c of lines(f)) {
        if (c.length < 2 || lineDist(c, focus) > keep) continue;
        const k = `${name}:${coordKey(c)}`;
        if (this.names.has(k)) continue;
        this.names.set(k, { name, cls: String(f.properties.class), coords: c });
        this.version++;
      }
    }

    const b = map.getBounds();
    const view: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    if (!this.covered.some((c) => c[0] <= view[0] && c[1] <= view[1] && c[2] >= view[2] && c[3] >= view[3])) {
      this.covered.push(view);
      if (this.covered.length > 60) this.covered.shift();
      this.version++;
    }
    return this.version !== before;
  }

  /** Drop stored features far from a new focus, so memory stays bounded while panning around the city. */
  private prune(focus: LngLat) {
    if (this.pruneFocus && metres(this.pruneFocus, focus) < CONTEXT_LIMITS.refocusM) return;
    this.pruneFocus = focus;
    const keep = CONTEXT_LIMITS.keepRadiusM;
    for (const [k, v] of this.buildings) if (metres(v.polygons[0][0][0], focus) > keep) this.buildings.delete(k);
    for (const [k, v] of this.roads) if (lineDist(v.coords, focus) > keep) this.roads.delete(k);
    for (const [k, v] of this.names) if (lineDist(v.coords, focus) > keep) this.names.delete(k);
    this.version++;
  }

  /** How well the loaded data covers a plot. */
  coverage(plot: LngLat[] | null): DataStatus {
    if (this.covered.length === 0) return "loading";
    if (!plot) return "ready";
    const pb = bboxOf(plot);
    if (this.covered.some((c) => c[0] <= pb[0] && c[1] <= pb[1] && c[2] >= pb[2] && c[3] >= pb[3])) return "ready";
    // Some or none of the plot was seen at street-level zoom.
    return "partial";
  }

  /**
   * Features within showRadiusM of the focus (nearest buildings first, capped). The same arrays are
   * returned while nothing changed, so downstream caches and React memos stay valid.
   */
  snapshot(focus: LngLat): ContextSnapshot {
    const key = `${this.version}:${Math.round(focus[0] * 2000)}:${Math.round(focus[1] * 2000)}`; // ~50 m focus grid
    if (this.snapCache?.key === key) return this.snapCache.snap;
    const show = this.showRadiusM;
    const near: [number, SiteBuilding][] = [];
    for (const b of this.buildings.values()) {
      const d = metres(b.polygons[0][0][0], focus);
      if (d <= show) near.push([d, b]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const snap: ContextSnapshot = {
      buildings: near.slice(0, CONTEXT_LIMITS.maxShownBuildings).map(([, b]) => b),
      roads: [...this.roads.values()].filter((r) => lineDist(r.coords, focus) <= show),
      roadNames: [...this.names.values()].filter((n) => lineDist(n.coords, focus) <= show),
    };
    this.snapCache = { key, snap };
    return snap;
  }
}
