"use client";

// Expert left panel (DESIGN_DIRECTION §5): 4 numbered steps (Plot, Road, Type, Bonus). A finished step is
// one line with ✓; click it to reopen. Assumptions folded. Rule numbers come from the rule JSON only.
import { useState } from "react";
import { useStore } from "@/store";
import { RULES } from "@/engine/rules";
import { DESIGN_DEFAULTS, floorHeightsFor } from "@/engine/designs/common";
import { CHECK_ASSUMPTIONS } from "@/engine";
import type { SiteResult } from "@/engine/siteChecks";
import { ringAreaM2 } from "@/engine/geo";
import { RoadEdges } from "./RoadEdges";
import { RulesSummary, ZoneBadge } from "./RulesSummary";
import { SiteChecks } from "./SiteChecks";
import { groupRoadEdges } from "./roadGroups";
import { sound } from "./sound";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const TYPE_LABEL = { condo: "Condo", office: "Office", hotel: "Hotel" } as const;

/** Plain names for the bonus options (the clause and limits come from the JSON). */
const BONUS_NAME: Record<string, string> = {
  "affordable-housing": "Affordable housing",
  "public-open-space": "Public open space",
  "park-and-ride": "Park & ride",
  "rainwater-retention": "Rainwater retention",
  "energy-certified": "Energy certified",
};

type Step = 1 | 2 | 3 | 4;

export function ExpertSteps({ site, api }: { site: SiteResult | null; api: { startDrawing(): void; loadDemo(): void } | null }) {
  const plot = useStore((s) => s.plot);
  const plotError = useStore((s) => s.plotError);
  const plotAreas = useStore((s) => s.plotAreas);
  const roadEdges = useStore((s) => s.roadEdges);
  const type = useStore((s) => s.buildingType);
  const bonuses = useStore((s) => s.bonuses);
  // null = automatic (first unfinished step), 0 = all closed.
  const [openStep, setOpenStep] = useState<Step | 0 | null>(null);
  const groups = groupRoadEdges(roadEdges);
  const done: Record<Step, boolean> = { 1: !!plot, 2: groups.length > 0 && groups.every((g) => g.confirmed), 3: !!plot, 4: !!plot };
  // Default open step: the first unfinished one.
  const current: Step | 0 = openStep ?? ([1, 2] as Step[]).find((k) => !done[k]) ?? 0;
  const toggle = (k: Step) => {
    sound.click();
    setOpenStep(current === k ? 0 : k);
  };
  const bonusTotal = Object.values(bonuses).reduce((s, x) => s + x, 0);
  const bonusApplied = Math.min(RULES.farBonus.capPct, bonusTotal);

  return (
    <div className="text-sm">
      <StepHead n={1} title="Plot" done={done[1]} open={current === 1} onClick={() => toggle(1)} summary={plot ? `${nf.format(ringAreaM2(plot))} m² · ${plot.length - 1} corners` : "not drawn"}>
        {plot ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            {site?.zoneShares?.[0]?.code === RULES.zone.code && <ZoneBadge />}
            {plotAreas && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 font-medium tabular-nums text-neutral-700" title="Plot area free of mapped buildings vs covered by them">
                <span className="h-2 w-2 rounded-full bg-[#16a34a]" />Free {nf.format(plotAreas.freeM2)} m²
                <span className="text-neutral-300">·</span>
                <span className="h-2 w-2 rounded-full bg-[#dc2626]" />Built {nf.format(plotAreas.builtM2)} m²
              </span>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button disabled={!api} onClick={() => api?.startDrawing()} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
              Draw plot
            </button>
            <button disabled={!api} onClick={() => api?.loadDemo()} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold ring-1 ring-neutral-300 disabled:opacity-40">
              Demo plot (Ari)
            </button>
          </div>
        )}
        {plotError && <div className="mt-2 text-xs text-red-600">{plotError}</div>}
      </StepHead>

      <StepHead
        n={2}
        title="Road"
        done={done[2]}
        open={current === 2}
        onClick={() => toggle(2)}
        summary={groups.length ? groups.map((g) => `${g.name ?? "Road"} ${g.widthM} m`).join(", ") : "tap the plot edge on the road"}
        warn={!!plot && groups.length === 0}
      >
        <RoadEdges />
      </StepHead>

      <StepHead n={3} title="Type" done={done[3]} open={current === 3} onClick={() => toggle(3)} summary={TYPE_LABEL[type]}>
        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Building type">
          {(["condo", "office", "hotel"] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={type === t}
              onClick={() => {
                sound.click();
                useStore.getState().setBuildingType(t);
                useStore.getState().commit();
              }}
              className={`rounded-lg py-1.5 text-[12px] font-semibold ring-1 ${type === t ? "bg-neutral-900 text-white ring-transparent" : "ring-neutral-300 hover:bg-neutral-50"}`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </StepHead>

      <StepHead
        n={4}
        title="Bonus"
        done={done[4]}
        open={current === 4}
        onClick={() => toggle(4)}
        summary={bonusApplied ? `+${bonusApplied} % → FAR ${+(RULES.far.max * (1 + bonusApplied / 100)).toFixed(2)}` : "none"}
      >
        <BonusInputs site={site} />
      </StepHead>

      <Folded title="Assumptions">
        <Assumptions />
      </Folded>
      <RulesSummary />
      {site && <SiteChecks site={site} />}
    </div>
  );
}

function StepHead({ n, title, done, open, onClick, summary, warn, children }: { n: number; title: string; done: boolean; open: boolean; onClick: () => void; summary: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className="border-b border-neutral-100 py-2 last:border-0">
      <button onClick={onClick} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-emerald-100 text-emerald-700" : "bg-neutral-900 text-white"}`}>{done ? "✓" : n}</span>
        <span className="text-[13px] font-semibold">{title}</span>
        <span className={`min-w-0 flex-1 truncate text-right text-[12px] tabular-nums ${warn ? "text-red-600" : "text-neutral-500"}`}>{summary}</span>
      </button>
      {open && <div className="mt-2 pl-7">{children}</div>}
    </div>
  );
}

function Folded({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-neutral-100 py-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between text-[12px] font-semibold text-neutral-700">
        {title} <span className="text-neutral-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

/** FAR bonus (city plan ข้อ 52-56): % per option, total capped by the JSON; FAR shown live. */
function BonusInputs({ site }: { site: SiteResult | null }) {
  const bonuses = useStore((s) => s.bonuses);
  const set = (id: string, pct: number) => {
    const next = { ...bonuses };
    if (pct > 0) next[id] = pct;
    else delete next[id];
    useStore.getState().setBonuses(next);
    useStore.getState().commit();
  };
  const total = Object.values(bonuses).reduce((s, x) => s + x, 0);
  const applied = Math.min(RULES.farBonus.capPct, total);
  const near = site?.station?.nearestMassTransit;
  return (
    <div className="space-y-1.5">
      {RULES.farBonus.options.map((o) => {
        const levels = "pctByLevel" in o && o.pctByLevel ? Object.values(o.pctByLevel as Record<string, number>) : null;
        const max = "maxPct" in o && typeof o.maxPct === "number" ? o.maxPct : levels ? Math.max(...levels) : RULES.farBonus.capPct;
        const stations = "stationsWithin500m" in o ? (o.stationsWithin500m as string[]) : null;
        const eligible = !stations || (!!near && stations.includes(near.name) && near.distM <= 500);
        const v = bonuses[o.id] ?? 0;
        return (
          <div key={o.id} className="text-[12px]">
            <div className="flex items-center gap-2">
              <span className={`flex-1 ${eligible ? "" : "text-neutral-400"}`}>{BONUS_NAME[o.id] ?? o.id}</span>
              <span className="rounded bg-neutral-100 px-1 text-[10px] text-neutral-500">{o.clause}</span>
              {levels ? (
                <select aria-label={`${BONUS_NAME[o.id]} level`} value={v} onChange={(e) => set(o.id, Number(e.target.value))} className="rounded border border-neutral-300 px-1 py-0.5 tabular-nums">
                  <option value={0}>none</option>
                  {levels.map((p, i) => (
                    <option key={p} value={p}>
                      level {i + 1} · +{p} %
                    </option>
                  ))}
                </select>
              ) : (
                <label className="flex items-center gap-1 tabular-nums">
                  +
                  <input
                    type="number"
                    min={0}
                    max={max}
                    step={1}
                    disabled={!eligible}
                    aria-label={`${BONUS_NAME[o.id]} bonus %`}
                    value={v}
                    onChange={(e) => set(o.id, Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
                    className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-right disabled:bg-neutral-50"
                  />
                  %
                </label>
              )}
            </div>
            {stations && !eligible && <div className="text-[11px] text-neutral-400">Only within 500 m of {stations.length} listed stations</div>}
          </div>
        );
      })}
      <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-[12px] tabular-nums">
        <span className="text-neutral-500">
          Total {total} %{total > RULES.farBonus.capPct ? ` → capped at ${RULES.farBonus.capPct} %` : ""}
        </span>
        <span className="font-semibold">
          FAR {RULES.far.max} → {+(RULES.far.max * (1 + applied / 100)).toFixed(2)}
        </span>
      </div>
      <div className="text-[11px] text-neutral-400">You must provide what each clause asks for (units, open space, parking, storage, rating). {RULES.farBonus.source}</div>
    </div>
  );
}

function Assumptions() {
  const type = useStore((s) => s.buildingType);
  const fh = floorHeightsFor(type);
  const rows: [string, string][] = [
    ["Floor heights", `ground ${fh.groundM} m · typical ${fh.typicalM} m`],
    ["Net / gross efficiency", `${Math.round(DESIGN_DEFAULTS.efficiency[type] * 100)} %`],
    ["Condo unit / hotel room", `${DESIGN_DEFAULTS.condoUnitM2} m² / ${DESIGN_DEFAULTS.hotelRoomM2} m²`],
    ["Area per parking stall", `${DESIGN_DEFAULTS.parkingStallM2} m²`],
    ["Permeable share of open space", `${Math.round(CHECK_ASSUMPTIONS.permeableShare * 100)} %`],
    ["Parking counted in floor area", "yes"],
  ];
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-neutral-500">{k}</dt>
          <dd className="text-right tabular-nums">{v}</dd>
        </div>
      ))}
      <div className="col-span-2 pt-1 text-[11px] text-neutral-400">Design assumptions, not law. Editing them comes after v1.</div>
    </dl>
  );
}
