// The whole scenario in the URL hash (EXPECTATIONS C "Share"): #mode=…&s=<base64url JSON>.
// Plot to 7 decimals (~1 cm), road edges with width / confirmed / label, building type, FAR bonuses.
import type { Snapshot } from "@/store";
import type { BuildingType } from "@/engine/far";

const TYPES: BuildingType[] = ["condo", "office", "hotel"];

interface Wire {
  v: 1;
  p: number[];
  r: [number, number, 0 | 1, string | null][];
  t: BuildingType;
  b: Record<string, number>;
}

const r7 = (x: number) => Math.round(x * 1e7) / 1e7;

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeScenario(s: Snapshot): string | null {
  if (!s.plot) return null;
  const w: Wire = {
    v: 1,
    p: s.plot.slice(0, -1).flatMap(([x, y]) => [r7(x), r7(y)]),
    r: Object.entries(s.roadEdges).map(([k, e]) => [Number(k), e.widthM, e.confirmed ? 1 : 0, e.label ?? null]),
    t: s.buildingType,
    b: s.bonuses,
  };
  return b64urlEncode(JSON.stringify(w));
}

/** Decode; null for anything malformed (a bad link never crashes the tool). */
export function decodeScenario(code: string): Snapshot | null {
  try {
    const w = JSON.parse(b64urlDecode(code)) as Wire;
    if (w.v !== 1 || !Array.isArray(w.p) || w.p.length < 6 || w.p.length % 2 || !w.p.every(Number.isFinite)) return null;
    const ring: [number, number][] = [];
    for (let i = 0; i < w.p.length; i += 2) ring.push([w.p[i], w.p[i + 1]]);
    ring.push(ring[0]);
    const roadEdges: Snapshot["roadEdges"] = {};
    for (const [k, width, c, label] of w.r ?? []) {
      if (!Number.isInteger(k) || k < 0 || k >= ring.length - 1 || !Number.isFinite(width)) continue;
      roadEdges[k] = { widthM: width, confirmed: c === 1, ...(label ? { label } : {}) };
    }
    const bonuses: Record<string, number> = {};
    for (const [k, v] of Object.entries(w.b ?? {})) if (Number.isFinite(v) && v > 0) bonuses[k] = v;
    return { plot: ring, roadEdges, roadEdgesSource: "user", buildingType: TYPES.includes(w.t) ? w.t : "condo", bonuses };
  } catch {
    return null;
  }
}
