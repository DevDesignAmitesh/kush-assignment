"use client";

import { useState } from "react";
import type { MapApi, ViewName } from "@/map/MapView";
import { sound } from "./sound";
import { useStore, type MapStyleMode } from "@/store";

const MODES: [MapStyleMode, string][] = [
  ["simple", "Simple"],
  ["detailed", "Detailed"],
  ["satellite", "Satellite"],
];

const CYCLE: ViewName[] = ["N", "E", "S", "W"];
const LABEL: Record<ViewName, string> = { top: "Top", N: "North", E: "East", S: "South", W: "West" };

/** Camera presets around the plot: Top / N / E / S / W. The big button cycles N → E → S → W. */
export function ViewControl({ api }: { api: MapApi | null }) {
  const [view, setView] = useState<ViewName>("N");
  const mapStyle = useStore((s) => s.mapStyle);

  const go = (v: ViewName) => {
    sound.click();
    setView(v);
    api?.setView(v);
  };
  const next = () => go(CYCLE[(CYCLE.indexOf(view) + 1) % CYCLE.length] ?? "N");

  const small =
    "h-7 w-9 rounded-md text-[11px] font-semibold transition-[transform,background-color] duration-150 active:scale-90 disabled:opacity-40";

  return (
    <div className="pointer-events-auto absolute right-[352px] top-[84px] max-sm:hidden flex w-[152px] flex-col gap-1.5 rounded-xl bg-white/95 p-1.5 shadow-md ring-1 ring-black/10">
      <button
        disabled={!api}
        onClick={next}
        title="Rotate the view around the plot (N → E → S → W)"
        className="flex items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2 text-xs font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-neutral-800 active:scale-95 disabled:opacity-40"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
          style={{ transform: `rotate(${view === "top" ? 0 : CYCLE.indexOf(view) * 90}deg)`, transition: "transform 800ms ease" }}
        >
          <path d="M12 3 7 14h10L12 3Z" fill="currentColor" />
          <path d="M12 14v7" />
        </svg>
        {view === "top" ? "Top view" : `View from ${LABEL[view]}`}
      </button>
      <div className="grid grid-cols-3 gap-1">
        <span />
        <ViewBtn v="N" cur={view} onClick={go} cls={small} disabled={!api} />
        <span />
        <ViewBtn v="W" cur={view} onClick={go} cls={small} disabled={!api} />
        <ViewBtn v="top" cur={view} onClick={go} cls={small} disabled={!api} />
        <ViewBtn v="E" cur={view} onClick={go} cls={small} disabled={!api} />
        <span />
        <ViewBtn v="S" cur={view} onClick={go} cls={small} disabled={!api} />
        <span />
      </div>
      <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-neutral-100 p-0.5" role="radiogroup" aria-label="Map style">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            role="radio"
            aria-checked={mapStyle === m}
            disabled={!api}
            onClick={() => {
              sound.click();
              api?.setMapStyle(m);
            }}
            title={m === "satellite" ? "Satellite imagery shows buildings missing from OpenStreetMap" : undefined}
            className={`rounded-md py-1 text-[10.5px] font-semibold transition-[transform,background-color] duration-150 active:scale-95 disabled:opacity-40 ${
              mapStyle === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ViewBtn({
  v,
  cur,
  onClick,
  cls,
  disabled,
}: {
  v: ViewName;
  cur: ViewName;
  onClick: (v: ViewName) => void;
  cls: string;
  disabled: boolean;
}) {
  const active = v === cur;
  return (
    <button
      disabled={disabled}
      onClick={() => onClick(v)}
      title={v === "top" ? "Top view" : `View from the ${LABEL[v].toLowerCase()}`}
      aria-pressed={active}
      className={`${cls} ${active ? "bg-[#e4572e] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
    >
      {v === "top" ? "Top" : v}
    </button>
  );
}
