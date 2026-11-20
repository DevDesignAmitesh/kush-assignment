"use client";

import { COLORS, HEIGHT_STOPS, OUTSIDE_ZONE, SIMPLE, USE_COLORS } from "@/map/layers";
import { TARGET_ZONE } from "@/rules";
import { useStore } from "@/store";

type Kind = "block" | "ramp" | "road" | "fill" | "outline" | "hatch" | "line" | "dash";

function Swatch({ kind, color }: { kind: Kind; color?: string }) {
  switch (kind) {
    case "block": // small extruded block icon
      return (
        <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
          <path d="M2 5 8 2l6 3v6l-6 3-6-3Z" fill={color} />
          <path d="M2 5 8 8l6-3M8 8v6" stroke="#ffffff" strokeOpacity="0.6" fill="none" />
        </svg>
      );
    case "ramp":
      return <span className="h-3 w-4 rounded-sm" style={{ background: `linear-gradient(90deg, ${HEIGHT_STOPS.map(([, c]) => c).join(",")})` }} />;
    case "road":
      return <span className="h-2 w-4 rounded-full" style={{ background: SIMPLE.road, boxShadow: `0 0 0 1px ${SIMPLE.roadCasing}` }} />;
    case "outline":
      return <span className="h-3 w-4 rounded-[3px]" style={{ border: `2px solid ${color}` }} />;
    case "hatch":
      return (
        <span
          className="h-3 w-4 rounded-[3px]"
          style={{ background: `repeating-linear-gradient(135deg, ${color} 0 2px, ${color}44 2px 5px)` }}
        />
      );
    case "line":
      return <span className="h-0 w-4" style={{ borderTop: `4px solid ${color}` }} />;
    case "dash":
      return <span className="h-0 w-4" style={{ borderTop: `2px dashed ${color}` }} />;
    default:
      return <span className="h-3 w-4 rounded-[3px]" style={{ background: color }} />;
  }
}

interface Row {
  kind: Kind;
  color?: string;
  label: string;
  note?: string;
}

/** Visual legend on the right; rows follow the active map mode. */
export function Legend() {
  const mode = useStore((s) => s.mapStyle);
  const crossing = useStore((s) => (s.site?.highlights.crossingRoads.length ?? 0) > 0);
  const hasEnvelope = useStore((s) => (s.compute?.features.length ?? 0) > 0);
  const layers = useStore((s) => s.layers);
  const hasDesign = useStore((s) => s.designs.some((d) => d.design.id === s.selectedDesign && d.design.buildable)) && layers.design;

  const plotRows: Row[] = [
    { kind: "outline", color: "#e4572e", label: "Your plot" },
    { kind: "fill", color: `${COLORS.plotClear}88`, label: "Free of buildings" },
    { kind: "hatch", color: COLORS.plotBuilt, label: "Built over" },
    ...(hasEnvelope && layers.envelope ? [{ kind: "fill" as Kind, color: `${COLORS.envelope}99`, label: "Allowed space" }] : []),
    ...(hasEnvelope && layers.setbacks ? [{ kind: "fill" as Kind, color: "#0e749059", label: "Setback strip" }] : []),
    ...(crossing ? [{ kind: "line" as Kind, color: COLORS.crossing, label: "Road in plot" }] : []),
    ...(hasDesign
      ? [
          { kind: "block" as Kind, color: "#e5e5e5", label: "Design: main use" },
          { kind: "block" as Kind, color: USE_COLORS.parking, label: "Design: parking" },
          { kind: "block" as Kind, color: USE_COLORS.lobby, label: "Design: lobby" },
        ]
      : []),
  ];

  let rows: Row[];
  if (mode === "satellite") {
    rows = [...plotRows, { kind: "road", label: "Road" }, { kind: "dash", color: TARGET_ZONE.colour, label: `Zone ${TARGET_ZONE.zoneCode} edge` },
      { kind: "fill", color: OUTSIDE_ZONE, label: `Outside ${TARGET_ZONE.zoneCode} · not covered` }];
  } else if (mode === "detailed") {
    rows = [
      { kind: "ramp", label: "Building, low → tall" },
      { kind: "fill", color: COLORS.buildingCut, label: "Cut building" },
      { kind: "dash", color: COLORS.onPlot, label: "Building on plot" },
      { kind: "line", color: `${COLORS.access}99`, label: "Plot's road" },
      { kind: "fill", color: `${TARGET_ZONE.colour}44`, label: `Zone ${TARGET_ZONE.zoneCode}` },
      ...plotRows,
    ];
  } else {
    rows = [
      { kind: "block", color: SIMPLE.building, label: "Building" },
      { kind: "road", label: "Road" },
      { kind: "fill", color: SIMPLE.water, label: "Water" },
      { kind: "fill", color: SIMPLE.park, label: "Park" },
      { kind: "fill", color: SIMPLE.open, label: "Open land", note: "No building mapped here. OSM can miss buildings: check Satellite." },
      { kind: "dash", color: TARGET_ZONE.colour, label: `Zone ${TARGET_ZONE.zoneCode} edge` },
      { kind: "fill", color: OUTSIDE_ZONE, label: `Outside ${TARGET_ZONE.zoneCode} · not covered` },
      ...plotRows,
    ];
  }

  return (
    <div className="pointer-events-auto absolute right-[352px] top-[300px] max-sm:hidden w-[152px] rounded-xl bg-white/95 px-2.5 py-2 text-[11px] text-neutral-700 shadow-md ring-1 ring-black/10" aria-label="Legend">
      {rows.map((r) => (
        <div key={r.label} className="py-[3px]">
          <div className="flex items-center gap-2">
            <span className="flex w-4 shrink-0 justify-center ring-0">
              <Swatch kind={r.kind} color={r.color} />
            </span>
            <span className="font-medium">{r.label}</span>
          </div>
          {r.note && <div className="ml-6 mt-0.5 text-[10px] leading-snug text-neutral-500">{r.note}</div>}
        </div>
      ))}
    </div>
  );
}
