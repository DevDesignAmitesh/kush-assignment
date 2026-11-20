"use client";

// Simple mode (DESIGN_DIRECTION §6-§7): thin top bar, ONE step card, ONE result card, folded legend.
// Words are budgeted (≤ ~40 on screen); every sentence has a "Why?" that opens Expert at the proof.
import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/store";
import type { MapApi } from "@/map/MapView";
import { formatArea, roughly } from "@/engine/units";
import type { Verdict, WhatIf } from "@/engine/verdict";
import type { DensityResult } from "@/engine/density";
import { RULES } from "@/engine/rules";
import { clampRoadWidth } from "@/engine/assumptions";
import { ringAreaM2 } from "@/engine/geo";
import { groupRoadEdges, patchGroup } from "./roadGroups";
import { scheduleCommit } from "./commitLater";
import { sound } from "./sound";

const ACCENT = "#e4572e";

export function ModeSwitch() {
  const mode = useStore((s) => s.uiMode);
  const set = useStore((s) => s.setUiMode);
  return (
    <div className="flex rounded-lg bg-neutral-100 p-0.5 text-[12px] font-semibold" role="radiogroup" aria-label="Mode">
      {(["simple", "expert"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => {
            sound.click();
            set(m);
          }}
          className={`rounded-md px-2.5 py-1 transition-colors ${mode === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          {m === "simple" ? "Simple" : "Expert"}
        </button>
      ))}
    </div>
  );
}

/** "Why?" → Expert, that design, that check row with its proof on the model. */
export function openWhy(open: { design: "A" | "B" | "C"; row: string } | null) {
  const st = useStore.getState();
  sound.click();
  st.setUiMode("expert");
  if (open) {
    st.setSelectedDesign(open.design);
    st.setProof(open);
  }
}

function WhyLink({ open }: { open: { design: "A" | "B" | "C"; row: string } | null }) {
  return (
    <button onClick={() => openWhy(open)} className="ml-1 text-[12px] font-semibold underline decoration-dotted underline-offset-2" style={{ color: ACCENT }}>
      Why?
    </button>
  );
}

export function SimpleTopBar({ place, undo }: { place: string; undo: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-1.5">
      <Link href="/" className="flex min-w-0 items-baseline gap-2" onClick={() => sound.click()}>
        <span className="font-semibold tracking-tight">Plotwise</span>
        <span className="truncate text-[12px] text-neutral-500">{place}</span>
      </Link>
      <div className="flex items-center gap-1.5">
        {undo}
        <ModeSwitch />
      </div>
    </header>
  );
}

// ---------------- step card ----------------

/** A finished step, shrunk to one line; click to reopen it. */
function DoneLine({ onClick, text }: { onClick: () => void; text: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 py-0.5 text-left text-[12px] text-neutral-600 hover:text-neutral-900">
      <span className="text-emerald-600">✓</span>
      <span className="truncate">{text}</span>
    </button>
  );
}

export function StepCard({ api }: { api: MapApi | null }) {
  const plot = useStore((s) => s.plot);
  const mode = useStore((s) => s.mode);
  const step = useStore((s) => s.simpleStep);
  const setStep = useStore((s) => s.setSimpleStep);
  const roadEdges = useStore((s) => s.roadEdges);
  const setRoadEdges = useStore((s) => s.setRoadEdges);
  const type = useStore((s) => s.buildingType);
  const setType = useStore((s) => s.setBuildingType);
  const units = useStore((s) => s.units);
  const groups = groupRoadEdges(roadEdges);
  const roadDone = groups.length > 0 && groups.every((g) => g.confirmed);

  return (
    <section className="panel-in pointer-events-auto absolute left-3 top-3 w-[290px] max-w-[calc(100%-1.5rem)] rounded-xl bg-white/95 px-3 py-2.5 shadow-md ring-1 ring-black/5" aria-label="Steps">
      {step > 1 && plot && <DoneLine onClick={() => setStep(1)} text={formatArea(ringAreaM2(plot), units)} />}
      {step > 2 && roadDone && <DoneLine onClick={() => setStep(2)} text={groups.map((g) => `${g.name ?? "Road"} · ${g.widthM} m`).join(", ")} />}

      {step === 1 && (
        <div>
          <div className="text-[13px] font-semibold">{mode === "drawing" ? "Click each corner" : "Draw your plot"}</div>
          <div className="mt-2 flex gap-2">
            {mode === "drawing" ? (
              <button className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-semibold text-white" onClick={() => api?.cancelDrawing()}>
                Cancel
              </button>
            ) : (
              <>
                <button disabled={!api} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: ACCENT }} onClick={() => api?.startDrawing()}>
                  Draw
                </button>
                <button disabled={!api} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold ring-1 ring-neutral-300 disabled:opacity-40" onClick={() => api?.loadDemo()}>
                  Try a demo
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="text-[13px] font-semibold">Tap the road side</div>
          <ul className="mt-1.5 space-y-1">
            {groups.map((g) => (
              <li key={g.key} className="flex items-center gap-1.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate">{g.name ?? "Road"}</span>
                <button aria-label="Narrower" className="h-6 w-6 rounded ring-1 ring-neutral-300" onClick={() => { setRoadEdges(patchGroup(roadEdges, g, { widthM: clampRoadWidth(g.widthM - 1).value, confirmed: true }), "user"); scheduleCommit(); }}>
                  −
                </button>
                <span className="w-12 text-center font-semibold tabular-nums">{g.widthM} m</span>
                <button aria-label="Wider" className="h-6 w-6 rounded ring-1 ring-neutral-300" onClick={() => { setRoadEdges(patchGroup(roadEdges, g, { widthM: clampRoadWidth(g.widthM + 1).value, confirmed: true }), "user"); scheduleCommit(); }}>
                  +
                </button>
              </li>
            ))}
          </ul>
          {groups.length > 0 && (
            <button
              className="mt-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
              style={{ background: ACCENT }}
              onClick={() => {
                sound.click();
                let next = roadEdges;
                for (const g of groups) next = patchGroup(next, g, { confirmed: true });
                setRoadEdges(next, "user");
                useStore.getState().commit();
                setStep(3);
              }}
            >
              Next
            </button>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="grid grid-cols-3 gap-1" aria-label="Building type">
            {(["condo", "office", "hotel"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  sound.click();
                  setType(t);
                  useStore.getState().commit();
                }}
                className={`rounded-lg py-1.5 text-[12px] font-semibold ring-1 ${type === t ? "text-white ring-transparent" : "ring-neutral-300"}`}
                style={type === t ? { background: ACCENT } : undefined}
              >
                {t === "condo" ? "Condo" : t === "office" ? "Office" : "Hotel"}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------- result card ----------------

const UNIT_LABEL = { m2: "m²", sqft: "ft²", rai: "rai" } as const;
const UNIT_NEXT = { m2: "sqft", sqft: "rai", rai: "m2" } as const;

const DOT = { green: "#16a34a", amber: "#d97706", red: "#dc2626" } as const;

export function ResultCard({ verdict, whatIfs, density, rulesData }: { verdict: Verdict | null; whatIfs: WhatIf[]; density: DensityResult | null; rulesData: RulesData | null }) {
  // Until the steps are done the card stays essential: verdict, 3 numbers, one what-if (word budget).
  const compact = useStore((s) => s.simpleStep) < 3;
  const updating = useStore((s) => s.updating);
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  if (!verdict) return null;
  const n = verdict.numbers;
  return (
    <section
      className="panel-in pointer-events-auto absolute z-10 rounded-xl bg-white/95 px-3.5 py-3 shadow-md ring-1 ring-black/5 max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-b-none max-sm:pb-4 sm:right-3 sm:top-3 sm:w-[300px]"
      aria-label="Result"
      aria-busy={updating}
    >
      {updating && <div className="shimmer pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-xl" aria-hidden />}
      {updating && <span className="absolute right-3.5 top-1 text-[10px] text-neutral-400">Updating…</span>}
      <button className="mx-auto mb-1.5 block h-1.5 w-10 rounded-full bg-neutral-300 sm:hidden" aria-label={sheetOpen ? "Collapse" : "Expand"} onClick={() => setSheetOpen(!sheetOpen)} />
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: DOT[verdict.colour] }} aria-label={verdict.colour} />
        <div className="text-[14px] font-semibold leading-snug">
          {verdict.sentence}
          {verdict.why && verdict.colour !== "green" && !verdict.inSentence ? <span className="block text-[12px] font-normal text-neutral-600">{verdict.why[0].toUpperCase() + verdict.why.slice(1)}.</span> : null}
        </div>
      </div>
      <div className="text-right">
        <WhyLink open={verdict.open} />
      </div>

      {(sheetOpen || typeof window === "undefined") && (
        <>
          {n && (
            <div className="mt-2 grid grid-cols-3 gap-1 text-center">
              <Big value={formatArea(n.gfaM2, units, { round: true })} label="area" />
              <Big value={`${n.storeys}`} label="floors" />
              {n.homes !== null ? <Big value={`~${roughly(n.homes).toLocaleString("en-US")}`} label={n.homesLabel} /> : <Big value="—" label="" />}
            </div>
          )}
          {density && !compact && (
            <div className="mt-2.5">
              <div className="flex justify-between text-[11px] text-neutral-500">
                <span>Neighbours (est.)</span>
                <span className="font-semibold text-neutral-800">
                  {density.bucket} · {density.ratio.toFixed(1)}×
                </span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-0.5" aria-hidden>
                {(["Low", "Medium", "High"] as const).map((b) => (
                  <span key={b} className="h-1.5 rounded-full" style={{ background: density.bucket === b ? ACCENT : "#e5e5e5" }} />
                ))}
              </div>
            </div>
          )}
          {whatIfs.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {whatIfs.slice(0, compact ? 1 : 2).map((w) => (
                <li key={w.text} className="flex gap-1.5 text-[12px] leading-snug text-neutral-700">
                  <span style={{ color: ACCENT }}>↗</span>
                  {w.short}
                </li>
              ))}
            </ul>
          )}
          {!compact && (
          <div className="mt-2.5 flex items-center justify-between border-t border-neutral-100 pt-2">
            <button onClick={() => setRulesOpen(!rulesOpen)} className="text-[12px] font-semibold text-neutral-700" aria-expanded={rulesOpen}>
              Rules (5) {rulesOpen ? "▾" : "▸"}
            </button>
            {/* One tap cycles m² → ft² → rai (keeps the word budget). */}
            <button
              onClick={() => setUnits(UNIT_NEXT[units])}
              aria-label={`Units: ${UNIT_LABEL[units]}. Tap for ${UNIT_LABEL[UNIT_NEXT[units]]}`}
              className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-200"
            >
              {UNIT_LABEL[units]} ⇄
            </button>
          </div>
          )}
          {rulesOpen && !compact && rulesData && <FiveRules d={rulesData} />}
        </>
      )}
    </section>
  );
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[15px] font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-[10.5px] text-neutral-500">{label}</div>
    </div>
  );
}

export interface RulesData {
  far: number;
  gapM: number;
  landPct: number;
  m2PerCar: number;
  design: "A" | "B" | "C" | null;
}

/** The 5 big rules in plain words; numbers come from the engine / rule JSON; no clause numbers. */
function FiveRules({ d }: { d: RulesData }) {
  const open = (row: string) => (d.design ? { design: d.design, row } : null);
  const rows: [string, string, string][] = [
    ["▦", `Floors up to ${+d.far.toFixed(2)} × your land area`, "far"],
    ["◿", `Height ≤ ${RULES.skyPlane.multiplier} × (road width + gap)`, "sky"],
    ["↔", `Keep ${d.gapM.toFixed(0)} m clear from each edge`, "boundary-setback"],
    ["◻", `Leave ${d.landPct} % of the land open`, "open-land"],
    ["P", `1 car space per ${d.m2PerCar} m² of floors`, "parking"],
  ];
  return (
    <ul className="mt-1.5 space-y-1">
      {rows.map(([icon, text, row]) => (
        <li key={row} className="flex items-center gap-2 text-[12px]">
          <span className="w-4 text-center text-neutral-400">{icon}</span>
          <span className="flex-1">{text}</span>
          <WhyLink open={open(row)} />
        </li>
      ))}
    </ul>
  );
}

/** Folded legend: an icon; open = ≤ 5 rows. */
export function SimpleLegend() {
  const [open, setOpen] = useState(false);
  const taller = useStore((s) => s.tallerLayer);
  const setTaller = useStore((s) => s.setTallerLayer);
  const rows: [string, string][] = taller
    ? [
        ["#16a34a", "Tall OK on this road (est.)"],
        ["#a8a29e", "Low-rise soi (est.)"],
        ["#2563eb", "500 m from a station"],
        ["#e4572e", "Your plot"],
        ["#22d3ee", "Allowed space"],
      ]
    : [
        ["#e4572e", "Your plot"],
        ["#22d3ee", "Allowed space"],
        ["#f1f0ec", "Your building"],
        ["#b9b6b0", "Neighbours"],
        ["#d4d1ca", `Outside ${RULES.zone.code}`],
      ];
  return (
    <div className="pointer-events-auto absolute bottom-9 right-14 flex flex-col items-end max-sm:bottom-auto max-sm:right-3 max-sm:top-[150px]">
      {open && (
        <div className="mb-1.5 rounded-lg bg-white/95 px-2.5 py-2 text-[11px] shadow ring-1 ring-black/5">
          {rows.map(([c, t]) => (
            <div key={t} className="flex items-center gap-2 py-0.5">
              <span className="h-3 w-3 rounded-sm ring-1 ring-black/10" style={{ background: c }} />
              {t}
            </div>
          ))}
          <button onClick={() => setTaller(!taller)} aria-pressed={taller} className={`mt-1.5 w-full rounded-md py-1 font-semibold ring-1 ${taller ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "text-neutral-700 ring-neutral-200"}`}>
            {taller ? "Hide taller roads" : "Where could I build taller?"}
          </button>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-label="Legend" aria-expanded={open} className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/10 text-[13px] font-bold text-neutral-600">
        i
      </button>
    </div>
  );
}
