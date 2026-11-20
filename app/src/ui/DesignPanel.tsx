"use client";

import { useState } from "react";
import { useStore } from "@/store";
import type { DesignResult } from "@/engine";
import type { CheckRow, CheckStatus } from "@/engine/checker";
import { sound } from "./sound";
import { BAND } from "@/map/layers";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const ACCENT = "#e4572e";

const bandOf = (use: string) => (use === "parking" ? "parking" : use === "lobby" || use === "amenity" ? "podium" : "main");
const MAIN_LABEL: Record<string, string> = { condo: "Homes", office: "Offices", hotel: "Hotel rooms" };
const bandLabel = (b: keyof typeof BAND, type: string) => (b === "parking" ? "Parking" : b === "podium" ? "Lobby" : (MAIN_LABEL[type] ?? "Main use"));

const STATUS: Record<CheckStatus, string> = {
  PASS: "text-emerald-700 bg-emerald-50 ring-emerald-200",
  FAIL: "text-white bg-red-600 ring-red-700",
  INFO: "text-neutral-600 bg-neutral-100 ring-neutral-200",
};

/** Right panel: one design at a time (DESIGN_DIRECTION §3). */
export function DesignPanel({ phoneHidden = false }: { phoneHidden?: boolean }) {
  const designs = useStore((s) => s.designs);
  const selected = useStore((s) => s.selectedDesign);
  const select = useStore((s) => s.setSelectedDesign);
  const maxGfa = useStore((s) => s.compute?.far.maxGfaM2 ?? 0);
  const roadEdges = useStore((s) => s.roadEdges);
  const plot = useStore((s) => s.plot);
  const compute = useStore((s) => s.compute);
  const setCompare = useStore((s) => s.setCompareOpen);

  let body: React.ReactNode;
  if (!plot) body = <Empty icon="▱" text="Draw a plot to see designs." />;
  else if (!compute || compute.status === "invalid") body = <Empty icon="!" text="Fix the plot to see designs." />;
  else if (compute.status === "no-road") body = <Empty icon="⟂" text="Click the plot edge that faces the road." />;
  else if (!designs.length) body = <Empty icon="…" text="Working out designs…" />;
  else {
    const cur = designs.find((d) => d.design.id === selected && d.design.buildable) ?? designs.find((d) => d.design.buildable) ?? designs[0];
    body = (
      <>
        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Designs">
          {designs.map((d) => {
            const on = d.design.id === cur.design.id;
            return (
              <button
                key={d.design.id}
                role="tab"
                aria-selected={on}
                disabled={!d.design.buildable}
                title={d.design.buildable ? d.design.name : d.design.reason}
                onClick={() => {
                  sound.click();
                  select(d.design.id);
                }}
                className={`rounded-lg px-2 py-1.5 text-left ring-1 transition-[transform,background-color] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${
                  on ? "text-white ring-transparent" : "bg-white ring-neutral-200 hover:bg-neutral-50"
                }`}
                style={on ? { background: ACCENT } : undefined}
              >
                <div className="text-[12px] font-semibold">{d.design.id}</div>
                <div className="text-[11px] tabular-nums opacity-90">{d.design.buildable ? `${nf.format(d.design.gfaM2)} m²` : "—"}</div>
                <div className="text-[11px] tabular-nums opacity-90">{d.design.buildable ? `${n1.format(d.design.heightM)} m` : "n/a"}</div>
              </button>
            );
          })}
        </div>
        <Selected d={cur} maxGfa={maxGfa} roadLabel={(e) => roadEdges[e]?.label?.split(" · ")[0]} />
        <button
          onClick={() => {
            sound.click();
            setCompare(true);
          }}
          data-tour="compare"
          className="mt-3 w-full rounded-lg py-1.5 text-[12px] font-semibold text-neutral-700 ring-1 ring-neutral-300 transition-[transform,background-color] hover:bg-neutral-50 active:scale-95"
        >
          Compare A / B / C
        </button>
      </>
    );
  }

  return (
    <aside className={`pointer-events-auto absolute bottom-0 right-0 top-0 w-[340px] overflow-y-auto border-l border-neutral-200 bg-white px-4 py-3 text-sm max-sm:top-auto max-sm:h-[calc(45%-2.5rem)] max-sm:w-full max-sm:border-l-0 ${phoneHidden ? "max-sm:hidden" : ""}`}
      aria-label="Designs"
      data-tour="designs"
    >
      {/* On a phone the sheet's tab bar already says "Designs". */}
      <div className="mb-2 text-[13px] font-semibold text-neutral-800 max-sm:hidden">Designs</div>
      {body}
    </aside>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 text-center text-[12px] text-neutral-500">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">{icon}</span>
      {text}
    </div>
  );
}

function Selected({ d, maxGfa, roadLabel }: { d: DesignResult; maxGfa: number; roadLabel: (edge: number) => string | undefined }) {
  const g = d.design;
  const [openLocal, setOpen] = useState(false);
  const proof = useStore((s) => s.proof);
  // "Why?" from Simple lands here with a proof: show the rows so the highlighted one is visible.
  const open = openLocal || proof?.design === g.id;
  const setProof = useStore((s) => s.setProof);
  if (!g.buildable) return <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-600 ring-1 ring-neutral-200">{g.reason}</div>;
  const lb = g.limitedBy;
  const lbText = lb ? (lb.kind === "sky" && lb.edge !== undefined && roadLabel(lb.edge) ? `Sky plane, ${roadLabel(lb.edge)} (edge ${lb.edge + 1})` : lb.label) : "—";
  const total = d.checks.length;
  const pass = d.summary.pass;
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <div className="text-2xl font-semibold tabular-nums">{nf.format(g.gfaM2)} m²</div>
        <div className="text-[12px] tabular-nums text-neutral-500">uses {maxGfa ? Math.round((g.gfaM2 / maxGfa) * 100) : 0} % of max</div>
      </div>
      <div className="mt-0.5 text-[12px] tabular-nums text-neutral-500">
        {n1.format(g.heightM)} m · {g.storeys} storeys · {g.programme.units !== undefined ? `${nf.format(g.programme.units)} units` : g.programme.rooms !== undefined ? `${nf.format(g.programme.rooms)} rooms` : `${nf.format(g.programme.netAreaM2)} m² net`}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-neutral-500">Limited by:</span>
        <span className="font-semibold">{lbText}</span>
        {lb && lb.clause !== "design assumption" && <Chip text={lb.clause} />}
      </div>

      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ring-1 ring-neutral-200 hover:bg-neutral-50"
      >
        <span>
          Checks {pass}/{total} {d.summary.fail ? "" : "✓"}
        </span>
        <span className={d.summary.fail ? "text-red-600" : "text-emerald-700"}>
          {d.summary.fail ? `${d.summary.fail} fail` : "all pass"}
          {d.summary.info ? ` · ${d.summary.info} info` : ""} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {d.checks.map((c) => (
            <CheckRowItem
              key={c.id}
              c={c}
              active={proof?.design === g.id && proof.row === c.id}
              onClick={() => {
                sound.click();
                setProof(proof?.design === g.id && proof.row === c.id ? null : c.cause ? { design: g.id, row: c.id } : null);
              }}
            />
          ))}
          <li className="pt-1 text-[10.5px] text-neutral-400">Click a check to see its cause on the model · Esc clears</li>
        </ul>
      )}

      <Section d={d} />
      <AreaTable d={d} maxGfa={maxGfa} />
    </div>
  );
}

function CheckRowItem({ c, active, onClick }: { c: CheckRow; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        disabled={!c.cause}
        className={`w-full rounded-md px-2 py-1 text-left ring-1 transition-colors ${active ? "bg-amber-50 ring-amber-400" : "ring-transparent hover:bg-neutral-50"}`}
        aria-pressed={active}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium">
            {c.label}
            {c.assumption && <span className="ml-1 text-[10px] font-normal text-neutral-400">assumption</span>}
          </span>
          <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold ring-1 ${STATUS[c.status]}`}>{c.status}</span>
        </div>
        <div className="text-[11px] tabular-nums leading-snug text-neutral-600">{c.value}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className="text-[10.5px] tabular-nums text-neutral-400">limit {c.limit}</span>
          <Chip text={c.clause} />
        </div>
      </button>
    </li>
  );
}

function Chip({ text }: { text: string }) {
  return <span className="rounded-full bg-neutral-100 px-1.5 py-px text-[10px] text-neutral-500 ring-1 ring-neutral-200">{text}</span>;
}

/** Section strip: floors stacked by use (3 tones), grouped runs, Σ floors = GFA. */
function Section({ d }: { d: DesignResult }) {
  const type = useStore((s) => s.buildingType);
  const runs: { band: keyof typeof BAND; from: number; to: number; area: number; count: number }[] = [];
  d.design.floors.forEach((f, i) => {
    const band = bandOf(f.use);
    const last = runs[runs.length - 1];
    if (last && last.band === band) {
      last.to = i + 1;
      last.area += f.areaM2;
      last.count++;
    } else runs.push({ band, from: i + 1, to: i + 1, area: f.areaM2, count: 1 });
  });
  const sum = d.design.floors.reduce((s, f) => s + f.areaM2, 0);
  const per = Math.max(3, Math.min(12, 220 / Math.max(1, d.design.floors.length)));
  return (
    <div className="mt-3">
      <div className="text-[12px] font-semibold text-neutral-700">Section</div>
      <div className="mt-1.5 flex flex-col-reverse gap-px">
        {runs.map((r) => (
          <div key={r.from} className="flex items-center gap-2">
            <div className="w-14 shrink-0 rounded-sm ring-1 ring-neutral-300" style={{ height: r.count * per, background: BAND[r.band] }} />
            <div className="text-[11px] tabular-nums leading-tight text-neutral-600">
              {r.from === r.to ? `Floor ${r.from}` : `Floors ${r.from}–${r.to}`} · {bandLabel(r.band, type)} · {nf.format(r.area)} m²
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 text-[11px] font-semibold tabular-nums">
        <span>Σ {d.design.floors.length} floors</span>
        <span>{nf.format(sum)} m²</span>
      </div>
    </div>
  );
}

/**
 * Compare A / B / C: one column per design, one row per measure (fits a phone). A design that can't be built
 * shows its reason once instead of a column of dashes. No cost or income rows (no sourced data).
 */
export function CompareModal() {
  const open = useStore((s) => s.compareOpen);
  const setOpen = useStore((s) => s.setCompareOpen);
  const designs = useStore((s) => s.designs);
  const selected = useStore((s) => s.selectedDesign);
  const select = useStore((s) => s.setSelectedDesign);
  const type = useStore((s) => s.buildingType);
  const maxGfa = useStore((s) => s.compute?.far.maxGfaM2 ?? 0);
  if (!open) return null;

  const progLabel = type === "condo" ? "Homes" : type === "hotel" ? "Rooms" : "Net office area";
  const rows: { label: string; cell: (d: DesignResult) => React.ReactNode }[] = [
    { label: "Floor area", cell: (d) => <span className="font-semibold">{nf.format(d.design.gfaM2)} m²</span> },
    { label: "Of the max allowed", cell: (d) => (maxGfa ? `${Math.round((d.design.gfaM2 / maxGfa) * 100)} %` : "—") },
    { label: "Height", cell: (d) => `${n1.format(d.design.heightM)} m · ${d.design.storeys} floors` },
    {
      label: progLabel,
      cell: (d) => {
        const p = d.design.programme;
        return p.units !== undefined ? nf.format(p.units) : p.rooms !== undefined ? nf.format(p.rooms) : `${nf.format(p.netAreaM2)} m²`;
      },
    },
    {
      label: "Parking",
      cell: (d) => {
        const short = d.design.parking.provided < d.design.parking.required;
        return (
          <span className={short ? "font-semibold text-red-600" : ""}>
            {d.design.parking.provided} <span className="font-normal text-neutral-400">needs {d.design.parking.required}</span>
          </span>
        );
      },
    },
    { label: "Limited by", cell: (d) => <span className="text-neutral-700">{d.design.limitedBy?.label ?? "—"}</span> },
    {
      label: "Checks",
      // Same count as the panel's "Checks 10/12 ✓" (info rows count in the total, as there).
      cell: (d) =>
        d.summary.fail ? (
          <span className="font-semibold text-red-600">{d.summary.fail} fail</span>
        ) : (
          <span className="font-semibold text-emerald-700">
            {d.summary.pass}/{d.checks.length} ✓
          </span>
        ),
    },
  ];
  const close = () => setOpen(false);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-start justify-center bg-black/25 pt-20 max-sm:items-end max-sm:pt-0" onClick={close}>
      <div
        className="panel-in max-h-[calc(100%-6rem)] w-[680px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-white p-4 shadow-xl ring-1 ring-black/10 max-sm:max-h-[85%] max-sm:max-w-none max-sm:w-full max-sm:rounded-b-none max-sm:p-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Compare designs"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold">Compare designs</span>
          <button onClick={close} className="rounded px-2 py-0.5 text-neutral-500 hover:bg-neutral-100" aria-label="Close">
            ✕
          </button>
        </div>
        <table className="w-full table-fixed text-[12px] tabular-nums max-sm:text-[11.5px]">
          <colgroup>
            <col className="w-[22%] max-sm:w-[24%]" />
            {designs.map((d) => (
              <col key={d.design.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th />
              {designs.map((d) => {
                const on = d.design.id === selected && d.design.buildable;
                return (
                  <th key={d.design.id} className={`rounded-t-lg px-2 pb-1.5 pt-2 text-left align-top ${on ? "bg-[#e4572e]/10" : ""}`}>
                    <div className="text-[13px] font-bold" style={on ? { color: ACCENT } : undefined}>
                      {d.design.id}
                    </div>
                    <div className="font-medium leading-tight text-neutral-600">{d.design.name}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className="border-t border-neutral-100">
                <th className="py-1.5 pr-2 text-left align-top font-medium text-neutral-500">{r.label}</th>
                {designs.map((d) => {
                  const on = d.design.id === selected && d.design.buildable;
                  if (!d.design.buildable) {
                    // One merged cell with the reason, in the first row only.
                    return i === 0 ? (
                      <td key={d.design.id} rowSpan={rows.length} className="px-2 py-1.5 align-top">
                        <div className="rounded-lg bg-neutral-100 p-2 text-[11.5px] leading-snug text-neutral-600 max-sm:p-1.5 max-sm:text-[10.5px]">
                          <div className="mb-0.5 font-semibold text-neutral-700">Not possible here</div>
                          {(d.design.reason ?? "This design does not fit this plot.").replace(/^Not available:\s*/, "")}
                        </div>
                      </td>
                    ) : null;
                  }
                  return (
                    <td key={d.design.id} className={`px-2 py-1.5 align-top ${on ? "bg-[#e4572e]/10" : ""}`}>
                      {r.cell(d)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th />
              {designs.map((d) => {
                const on = d.design.id === selected && d.design.buildable;
                return (
                  <td key={d.design.id} className={`rounded-b-lg px-2 pb-2 pt-1 ${on ? "bg-[#e4572e]/10" : ""}`}>
                    {d.design.buildable &&
                      (on ? (
                        <span className="block py-1 text-center text-[11px] font-semibold" style={{ color: ACCENT }}>
                          On the map
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            sound.click();
                            select(d.design.id);
                            close();
                          }}
                          className="w-full rounded-md py-1 text-[11px] font-semibold ring-1 ring-neutral-300 transition-[transform,background-color] hover:bg-neutral-50 active:scale-95"
                        >
                          Show on map
                        </button>
                      ))}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
        <div className="mt-2 text-[10.5px] text-neutral-400">Parking: stalls provided, and the number the law requires.</div>
      </div>
    </div>
  );
}

const n2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Area statement (BUILD_PLAN §8, EXPECTATIONS H.4): plot, max floor area, one row per floor, and the total three
 * ways: Σ rows, the design card, and the area the independent FAR check measured. They must agree to 0.01 m².
 */
function AreaTable({ d, maxGfa }: { d: DesignResult; maxGfa: number }) {
  const [open, setOpen] = useState(false);
  const type = useStore((s) => s.buildingType);
  const plotM2 = useStore((s) => s.compute?.plotAreaM2 ?? 0);
  const sum = d.design.floors.reduce((s, f) => s + f.areaM2, 0);
  const card = d.design.gfaM2;
  const far = d.checks.find((c) => c.id === "far")?.measured;
  // "Parking counted in floor area: no" (assumption): FAR counts the non-parking floors only.
  const parkingInFar = useStore((s) => s.assumptions.parkingInFar !== false);
  const parking = d.design.floors.filter((f) => f.use === "parking").reduce((s, f) => s + f.areaM2, 0);
  const counted = parkingInFar ? sum : sum - parking;
  const ok = Math.abs(sum - card) <= 0.01 && (far === undefined || Math.abs(far - counted) <= 0.01);
  const open2 = d.checks.find((c) => c.id === "open-land");
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between text-[12px] font-semibold text-neutral-700">
        Area statement
        <span className={ok ? "text-emerald-700" : "text-red-600"}>
          {ok ? "totals match ✓" : "totals differ"} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <table className="mt-1.5 w-full text-[11.5px] tabular-nums" aria-label="Area statement">
          <tbody>
            <tr className="text-neutral-500"><td>Plot area</td><td /><td className="text-right">{n2.format(plotM2)} m²</td></tr>
            <tr className="text-neutral-500"><td>Max floor area (FAR)</td><td /><td className="text-right">{n2.format(maxGfa)} m²</td></tr>
            <tr className="border-t border-neutral-200 text-[10.5px] text-neutral-400"><td>Floor</td><td>Use</td><td className="text-right">Area</td></tr>
            {[...d.design.floors].reverse().map((fl) => (
              <tr key={fl.index}>
                <td>{fl.index + 1}</td>
                <td className="text-neutral-600">{bandLabel(bandOf(fl.use), type)}</td>
                <td className="text-right">{n2.format(fl.areaM2)} m²</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-300 font-semibold"><td colSpan={2}>Σ rows</td><td className="text-right">{n2.format(sum)} m²</td></tr>
            <tr><td colSpan={2}>Design card</td><td className="text-right">{n2.format(card)} m²</td></tr>
            {!parkingInFar && <tr className="text-neutral-500"><td colSpan={2}>Parking, not counted for FAR</td><td className="text-right">− {n2.format(parking)} m²</td></tr>}
            {!parkingInFar && <tr><td colSpan={2}>Counted for FAR</td><td className="text-right">{n2.format(counted)} m²</td></tr>}
            {far !== undefined && <tr><td colSpan={2}>Measured by the FAR check</td><td className="text-right">{n2.format(far)} m²</td></tr>}
            <tr className="border-t border-neutral-200 text-neutral-500"><td colSpan={2}>Coverage (ground floor)</td><td className="text-right">{n2.format(d.design.footprintM2)} m²</td></tr>
            <tr className="text-neutral-500"><td colSpan={2}>Open space</td><td className="text-right">{n2.format(d.design.openSpaceM2)} m²</td></tr>
            {open2 && <tr className="text-neutral-500"><td colSpan={2}>Open space vs land</td><td className="text-right">{open2.value}</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
