// Typed access to the locked rule file. UI code reads rule values from here, never literals.
import rulesJson from "./bangkok-y10.json";

export const rules = rulesJson;
export const TARGET_ZONE = {
  zoneCode: rules.zone.code,
  zoneName: rules.zone.nameEn,
  colour: rules.zone.colour,
} as const;
