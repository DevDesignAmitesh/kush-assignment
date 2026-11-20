// Allowed space = per-floor slices (BUILD_PLAN §4.4):
//   E_k = Plot − ∪_i capsule(edge_i, s_i(t_k))
// Exact "every point is at least s_i from edge i" for any plot shape (concave included).
import { dist, edges, type XY } from "./geo";
import { capsule, differenceMulti, multiArea, subtract, toPc, type MultiPolygon, type Polygon } from "./polygon";
import { neighbourSetback, roadSetback, type EdgeSetback } from "./setbacks";
import { RULES } from "./rules";

export interface EdgeSpec {
  /** Right-of-way width in metres if this edge faces a road; null for a neighbour boundary. */
  roadWidthM: number | null;
}

export interface FloorHeights {
  groundM: number;
  typicalM: number;
}

export interface Slice {
  index: number;
  base: number;
  top: number;
  polys: MultiPolygon;
  areaM2: number;
  setbacks: EdgeSetback[];
}

export type EnvelopeClass = "highRise" | "lowRise";

export interface Envelope {
  cls: EnvelopeClass;
  slices: Slice[];
  /** Ground slice area (0 if not buildable). */
  groundAreaM2: number;
  /** Top of the highest non-empty slice. */
  heightM: number;
  /** Building height H used for the clearance rule, and storeys used for the openings rule. */
  assumedH: number;
  assumedStoreys: number;
  stoppedBy: "empty" | "height-cap" | "class-limit";
}

export const ENVELOPE_LIMITS = {
  /** No zone height cap in ย.10; airport height zones are out of scope (BUILD_PLAN §4.4). */
  maxHeightM: 300,
  emptyBelowM2: 0.01,
} as const;

/** Floor tops: ground, then typical floors. */
export function floorTops(f: FloorHeights, maxTop: number): { base: number; top: number }[] {
  const out: { base: number; top: number }[] = [];
  let base = 0;
  let top = f.groundM;
  while (top <= maxTop + 1e-9) {
    out.push({ base, top });
    base = top;
    top += f.typicalM;
  }
  return out;
}

/**
 * Envelope for one building class.
 * lowRise: floors with top < high-rise threshold; H = last top; neighbour rules by storeys.
 * highRise: MR 33 6 m on every edge plus the sky plane, up to 300 m.
 */
export function computeEnvelope(ring: XY[], specs: EdgeSpec[], cls: EnvelopeClass, floors: FloorHeights): Envelope {
  const es = edges(ring);
  const plot: Polygon = toPc(ring);
  const mr33 = cls === "highRise";
  const lowLimit = RULES.highRise.minHeightM;
  const schedule =
    cls === "lowRise"
      ? floorTops(floors, ENVELOPE_LIMITS.maxHeightM).filter((f) => f.top < lowLimit)
      : floorTops(floors, ENVELOPE_LIMITS.maxHeightM);
  const assumedStoreys = cls === "lowRise" ? schedule.length : Math.max(schedule.length, 1);
  // Clearance uses building height: low-rise → its tallest allowed floor; high-rise → at least the threshold.
  const assumedH = cls === "lowRise" ? (schedule[schedule.length - 1]?.top ?? 0) : lowLimit;

  const slices: Slice[] = [];
  let lastKey = "";
  let lastPolys: MultiPolygon = [];
  let stoppedBy: Envelope["stoppedBy"] = cls === "lowRise" ? "class-limit" : "height-cap";

  // Neighbour setbacks do not depend on floor height: subtract those capsules once.
  const isRoad = es.map((_, i) => specs[i]?.roadWidthM != null);
  const nbSetback = neighbourSetback(assumedH, assumedStoreys, mr33);
  let afterNeighbours: MultiPolygon;
  try {
    const nbCutters = es
      .map(([a, b], i) => (!isRoad[i] && nbSetback.s > 0 && dist(a, b) > 0 ? capsule(a, b, nbSetback.s) : null))
      .filter((c): c is Polygon => !!c);
    afterNeighbours = subtract(plot, nbCutters);
  } catch {
    afterNeighbours = [];
  }

  for (let k = 0; k < schedule.length; k++) {
    const { base, top } = schedule[k];
    const setbacks = es.map((_, i) => {
      const w = specs[i]?.roadWidthM;
      return w != null ? roadSetback(w, top, assumedH, mr33) : nbSetback;
    });
    const key = setbacks.map((s) => s.s.toFixed(4)).join("|");
    let polys: MultiPolygon;
    if (key === lastKey) polys = lastPolys;
    else {
      const roadCutters = es
        .map(([a, b], i) => (isRoad[i] && setbacks[i].s > 0 && dist(a, b) > 0 ? capsule(a, b, setbacks[i].s) : null))
        .filter((c): c is Polygon => !!c);
      try {
        polys = afterNeighbours.length && roadCutters.length ? differenceMulti(afterNeighbours, roadCutters) : afterNeighbours;
      } catch {
        polys = []; // polygon-clipping failure on degenerate input: treat as empty rather than crash
      }
      lastKey = key;
      lastPolys = polys;
    }
    const areaM2 = multiArea(polys);
    if (!(areaM2 > ENVELOPE_LIMITS.emptyBelowM2)) {
      stoppedBy = "empty";
      break;
    }
    slices.push({ index: k, base, top, polys, areaM2, setbacks });
  }
  return {
    cls,
    slices,
    groundAreaM2: slices[0]?.areaM2 ?? 0,
    heightM: slices[slices.length - 1]?.top ?? 0,
    assumedH,
    assumedStoreys,
    stoppedBy,
  };
}
