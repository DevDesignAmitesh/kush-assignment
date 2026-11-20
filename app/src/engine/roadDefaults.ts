// Class-default road right-of-way widths (BUILD_PLAN §5.3). Site-data estimates, not law:
// shown as "estimate, please confirm" until the user edits them (planning answer Q3).
// Classes are OpenMapTiles `transportation` classes (tiles carry no OSM `width` tag).

const BY_CLASS: Record<string, number> = {
  motorway: 40,
  trunk: 40,
  primary: 30,
  secondary: 20,
  tertiary: 16,
  minor: 10, // OSM residential / unclassified / living_street
  service: 6,
  busway: 10,
};

const SOI_WIDTH_M = 8;
const FALLBACK_M = 10;

/** Default width for a road class; a minor road named "Soi"/"ซอย" gets the soi default. */
export function defaultRoadWidth(cls: string | null | undefined, name?: string | null): number {
  if (cls === "minor" && name && /(^|\s)(soi|ซอย)/i.test(name)) return SOI_WIDTH_M;
  return (cls && BY_CLASS[cls]) || FALLBACK_M;
}

export const MANUAL_EDGE_DEFAULT_M = FALLBACK_M;
