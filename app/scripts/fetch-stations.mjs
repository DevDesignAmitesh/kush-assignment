// Build public/data/bkk-rail-stations.geojson from the OpenFreeMap vector tiles (planning answer Q4:
// stations from the tile poi layer, no hand-typed list). Run once: `bun run data:stations`.
// Zoom-12 tiles carry every railway POI that zoom-14 tiles do (checked on a central-Bangkok box:
// 52 = 52), so the whole Bangkok bbox costs ~48 tile requests.
import { readFileSync, writeFileSync } from "node:fs";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const BBOX = [100.3, 13.5, 100.95, 14.0]; // W, S, E, N (BUILD_PLAN §5.4)
const Z = 12;
const MASS_TRANSIT = new Set(["subway", "light_rail", "monorail"]);
const OTHER_RAIL = new Set(["station", "halt"]);
// Named allowlist for lines the tiles cannot tell apart from ordinary SRT rail (ARL, Red Lines).
const allow = JSON.parse(readFileSync(new URL("./bkk-mass-transit-allowlist.json", import.meta.url), "utf8"));
const LINE_OF = new Map();
const alias = allow.tileNameAliases?.aliases ?? {};
for (const l of allow.lines) for (const n of l.stations) { const t = alias[n] ?? n; LINE_OF.set(t, [...(LINE_OF.get(t) ?? []), l.line]); }
const TRACK_Z = 14; // monorail track is dropped from low-zoom tiles: read it at z14 around candidate stations
const MONORAIL_NEAR_M = 80;
const monorail = []; // [lon, lat][] track segments from transportation class=transit subclass=monorail (z14)

const tilejson = await (await fetch("https://tiles.openfreemap.org/planet")).json();
const template = tilejson.tiles[0];
const lon2x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const lat2y = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z);

const byKey = new Map();
let tiles = 0;
for (let x = lon2x(BBOX[0]); x <= lon2x(BBOX[2]); x++) {
  for (let y = lat2y(BBOX[3]); y <= lat2y(BBOX[1]); y++) {
    const url = template.replace("{z}", Z).replace("{x}", x).replace("{y}", y);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    tiles++;
    const vt = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
    const layer = vt.layers.poi;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties;
      if (p.class !== "railway") continue;
      const sub = String(p.subclass ?? "");
      const kind = MASS_TRANSIT.has(sub) ? "massTransit" : OTHER_RAIL.has(sub) ? "rail" : null;
      if (!kind) continue;
      const [lon, lat] = f.toGeoJSON(x, y, Z).geometry.coordinates;
      if (lon < BBOX[0] || lon > BBOX[2] || lat < BBOX[1] || lat > BBOX[3]) continue;
      const name = p["name:en"] ?? p.name_en ?? p.name ?? "unnamed station";
      const key = `${name}|${kind}|${lon.toFixed(4)}|${lat.toFixed(4)}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          type: "Feature",
          properties: { name, nameTh: p["name:th"] ?? p.name ?? null, kind, subclass: sub },
          geometry: { type: "Point", coordinates: [+lon.toFixed(6), +lat.toFixed(6)] },
        });
      }
    }
  }
}

// Monorail track at z14 around every station POI not already mass transit (tiles fetched once each).
const tx = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const ty = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
const trackTiles = new Set();
for (const f of byKey.values()) if (f.properties.kind === "rail" && f.properties.subclass === "station") { const [lo, la] = f.geometry.coordinates; trackTiles.add(tx(lo, TRACK_Z) + "/" + ty(la, TRACK_Z)); }
for (const key of trackTiles) {
  const [x, y] = key.split("/").map(Number);
  const res = await fetch(template.replace("{z}", TRACK_Z).replace("{x}", x).replace("{y}", y));
  if (!res.ok) throw new Error("track tile HTTP " + res.status);
  tiles++;
  const tr = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer()))).layers.transportation;
  if (!tr) continue;
  for (let i = 0; i < tr.length; i++) {
    const f = tr.feature(i);
    if (f.properties.class !== "transit" || f.properties.subclass !== "monorail") continue;
    const g = f.toGeoJSON(x, y, TRACK_Z).geometry;
    const ls = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const c of ls) for (let k = 0; k + 1 < c.length; k++) monorail.push([c[k], c[k + 1]]);
  }
}

// Reclassify: allowlisted lines (name match, subclass station only) and stations on monorail track.
function segDist(p, a, b) {
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180), ky = 110574;
  const P = [(p[0] - a[0]) * kx, (p[1] - a[1]) * ky], B = [(b[0] - a[0]) * kx, (b[1] - a[1]) * ky];
  const L2 = B[0] * B[0] + B[1] * B[1];
  const t = L2 ? Math.max(0, Math.min(1, (P[0] * B[0] + P[1] * B[1]) / L2)) : 0;
  return Math.hypot(P[0] - t * B[0], P[1] - t * B[1]);
}
for (const f of byKey.values()) {
  const p = f.properties;
  if (p.kind !== "rail" || p.subclass !== "station") continue;
  const lines = LINE_OF.get(p.name);
  if (lines) {
    p.kind = "massTransit";
    p.line = lines.join(", ");
    p.reason = "named-line allowlist (research/data/bkk-mass-transit-allowlist.json)";
    continue;
  }
  if (monorail.some(([a, b]) => segDist(f.geometry.coordinates, a, b) <= MONORAIL_NEAR_M)) {
    p.kind = "massTransit";
    p.line = "monorail";
    p.reason = "within " + MONORAIL_NEAR_M + " m of transit/monorail track in the tiles";
  }
}
const missing = [...LINE_OF.keys()].filter((n) => ![...byKey.values()].some((f) => f.properties.name === n));
if (missing.length) console.warn("allowlist names not found in tiles:", missing.join(", "));

const features = [...byKey.values()].sort((a, b) => a.properties.name.localeCompare(b.properties.name));
const out = {
  type: "FeatureCollection",
  properties: {
    source: `OpenFreeMap vector tiles, poi layer, class=railway, zoom ${Z} (${template})`,
    bbox: BBOX,
    fetched: new Date().toISOString(),
    kinds: { massTransit: [...MASS_TRANSIT, "allowlisted line", "monorail track"], rail: [...OTHER_RAIL] },
    allowlist: "research/data/bkk-mass-transit-allowlist.json",
    note: "Station points (not platform edges); distance for the 500 m conditions is measured from the plot boundary to these points (BUILD_PLAN §5.4).",
  },
  features,
};
writeFileSync("public/data/bkk-rail-stations.geojson", JSON.stringify(out));
const mt = features.filter((f) => f.properties.kind === "massTransit").length;
console.log(`tiles ${tiles}; stations ${features.length} (mass transit ${mt}, other rail ${features.length - mt}) → public/data/bkk-rail-stations.geojson`);
