"use client";

// Expert top KPI strip (4 numbers, live) and the honest footer line (DESIGN_DIRECTION §5 items 1 and 7).
import { useStore } from "@/store";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function KpiStrip() {
  const compute = useStore((s) => s.compute);
  const designs = useStore((s) => s.designs);
  const sel = useStore((s) => s.selectedDesign);
  const updating = useStore((s) => s.updating);
  if (!compute || compute.status !== "ok") return null;
  const d = designs.find((x) => x.design.id === sel && x.design.buildable);
  const items: [string, string, string?][] = [
    ["Max floor area", `${nf.format(compute.far.maxGfaM2)} m²`],
    ["Height", d ? `${n1.format(d.design.heightM)} m` : "—"],
    ["Storeys", d ? `${d.design.storeys}` : "—"],
    ["Checks", d ? `${d.summary.pass}/${d.checks.length}${d.summary.fail ? "" : " ✓"}` : "—", d && d.summary.fail ? "text-red-600" : d ? "text-emerald-700" : undefined],
  ];
  return (
    <div
      className={`pointer-events-auto absolute left-1/2 top-3 z-10 flex max-sm:hidden -translate-x-1/2 divide-x divide-neutral-200 rounded-xl bg-white/95 shadow-md ring-1 ring-black/5 transition-opacity ${updating ? "opacity-70" : ""}`}
      role="status"
      aria-label="Key numbers"
    >
      {items.map(([k, v, cls]) => (
        <div key={k} className="px-3.5 py-1.5 text-center">
          <div className={`text-[15px] font-semibold tabular-nums leading-tight ${cls ?? ""}`}>{v}</div>
          <div className="text-[10.5px] text-neutral-500">{k}</div>
        </div>
      ))}
    </div>
  );
}

export function FooterLine() {
  return <div className="pointer-events-none absolute bottom-1.5 left-[120px] max-sm:hidden rounded bg-white/85 px-1.5 py-0.5 text-[11px] text-neutral-600">A feasibility study, not a design. An architect must check and sign.</div>;
}
