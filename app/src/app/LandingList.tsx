"use client";

import { useState } from "react";

type Cat = "Input" | "Rules" | "Designs" | "Modes";

/** Category colour (dot chip and pixel icon). */
const CAT: Record<Cat, string> = {
  Input: "#e4572e",
  Rules: "#0891b2",
  Designs: "#6366f1",
  Modes: "#d97706",
};

/** 5×5 pixel glyphs ("1" = filled), one per row. */
const GLYPH = {
  plot: ["11110", "10010", "10001", "10001", "11111"],
  road: ["00000", "11111", "00000", "10101", "00000"],
  rules: ["11111", "00000", "11110", "00000", "11100"],
  envelope: ["00100", "01110", "01110", "11111", "11111"],
  designs: ["00010", "00011", "10011", "11011", "11111"],
  checks: ["00001", "00010", "10100", "01000", "00000"],
  compare: ["10101", "10101", "10101", "11111", "11111"],
  simple: ["01110", "11111", "11111", "11111", "01110"],
  expert: ["11011", "11011", "00000", "11011", "11011"],
  link: ["01100", "10010", "01110", "01001", "00110"],
} as const;

const ITEMS: { glyph: keyof typeof GLYPH; title: string; text: string; cat: Cat; tags: string[] }[] = [
  {
    glyph: "plot",
    title: "Draw the plot",
    text: "Click its corners on a real Bangkok map. Plotwise warns you if it crosses a road or a building, or sits outside the zone.",
    cat: "Input",
    tags: ["Step 1", "Any shape"],
  },
  {
    glyph: "road",
    title: "Road side and building type",
    text: "Roads along the plot are picked up from the map; confirm the width. Then choose condo, office or hotel.",
    cat: "Input",
    tags: ["Step 2"],
  },
  {
    glyph: "rules",
    title: "The rules that apply",
    text: "Floor area, open space, setbacks, sky plane, height and parking, each with the legal clause it comes from.",
    cat: "Rules",
    tags: ["Step 3", "Sourced"],
  },
  {
    glyph: "envelope",
    title: "The 3D space you may build in",
    text: "The allowed volume, drawn floor by floor on the map. It follows the plot live while you drag a corner.",
    cat: "Rules",
    tags: ["Live"],
  },
  {
    glyph: "designs",
    title: "Three designs that fit",
    text: "A terraced block, a podium with a tower and a low-rise, in 3D among the real neighbours, each saying what limits it.",
    cat: "Designs",
    tags: ["Step 4", "3D"],
  },
  {
    glyph: "checks",
    title: "A pass/fail checklist per design",
    text: "An independent check re-measures every design. Click a row to see the cause on the model.",
    cat: "Designs",
    tags: ["Proof on the model"],
  },
  {
    glyph: "compare",
    title: "Compare A / B / C",
    text: "Floor area, height, homes or rooms, parking and checks side by side, or why a design is not possible.",
    cat: "Designs",
    tags: ["Expert"],
  },
  {
    glyph: "simple",
    title: "Simple mode",
    text: "One verdict (green, amber or red) and the change that would fix it. Made for phones.",
    cat: "Modes",
    tags: ["Phone"],
  },
  {
    glyph: "expert",
    title: "Expert mode",
    text: "Every input, editable assumption, check row and the floor-by-floor area statement.",
    cat: "Modes",
    tags: ["Desktop"],
  },
  {
    glyph: "link",
    title: "Share link and undo",
    text: "The whole scenario lives in the page link, so a reload or a shared link opens the same plot. Undo and redo any step.",
    cat: "Modes",
    tags: ["Link"],
  },
];

const FILTERS: ("All" | Cat)[] = ["All", "Input", "Rules", "Designs", "Modes"];

export function LandingList() {
  const [filter, setFilter] = useState<"All" | Cat>("All");
  const shown = filter === "All" ? ITEMS : ITEMS.filter((i) => i.cat === filter);
  return (
    <div className="px-4 pb-6 sm:px-12">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-5 sm:mx-0 sm:justify-center sm:px-0" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => {
          const on = f === filter;
          return (
            <button
              key={f}
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-colors sm:px-5 ${
                on ? "bg-[#151515] text-white" : "bg-[#efede8] text-[#3a3a3a] hover:bg-[#e6e3dc]"
              }`}
            >
              {f === "All" ? (
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
                  {[0, 7].flatMap((x) => [0, 7].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="5" height="5" rx="1" fill="none" stroke={on ? "#f5d87a" : "currentColor"} strokeWidth="1.4" />))}
                </svg>
              ) : (
                <span className="h-2 w-2 rounded-full" style={{ background: CAT[f] }} />
              )}
              {f}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-3">
        {shown.map((it) => (
          <li key={it.title} className="flex items-center gap-4 rounded-2xl border border-[#e7e4de] bg-white px-4 py-4 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] sm:px-5">
            <PixelIcon rows={GLYPH[it.glyph]} colour={CAT[it.cat]} />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-[#151515]">{it.title}</div>
              <p className="mt-0.5 text-[13.5px] leading-snug text-[#4a4a4a]">{it.text}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] text-[#555]">
                <span className="flex items-center gap-1.5 rounded-full border border-[#e7e4de] px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: CAT[it.cat] }} />
                  {it.cat}
                </span>
                {it.tags.map((t) => (
                  <span key={t} className="rounded-full border border-[#e7e4de] px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PixelIcon({ rows, colour }: { rows: readonly string[]; colour: string }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#e7e4de] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <svg width="22" height="22" viewBox="0 0 25 25" aria-hidden>
        {rows.flatMap((r, y) => [...r].map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={x * 5} y={y * 5} width="4" height="4" fill={colour} /> : null)))}
      </svg>
    </div>
  );
}
