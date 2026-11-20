"use client";

import { useStore } from "@/store";
import { RULES } from "@/engine/rules";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** Zone badge: code · FAR · OSR, all from the rule JSON. */
export function ZoneBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#8B4513]/10 px-2 py-0.5 text-[11px] font-semibold text-[#6b3410] ring-1 ring-[#8B4513]/25">
      {RULES.zone.code} · FAR {RULES.far.max} · OSR {RULES.osr.pctOfGfa} %
    </span>
  );
}

/** M1 summary: max GFA, high-rise gate, envelope. Full rules panel with clause popovers comes in M4. */
export function RulesSummary() {
  const c = useStore((s) => s.compute);
  const site = useStore((s) => s.site);
  const plot = useStore((s) => s.plot);
  if (!plot) return null;

  if (site?.blocked) {
    const first = site.issues.find((i) => i.level === "error");
    return (
      <Banner tone="red" title={first?.title ?? "This plot can't be assessed"}>
        {first?.id === "wrong-zone" || first?.id === "outside-plan"
          ? `v1 covers ${RULES.zone.code} only, so no ${RULES.zone.code} rules or envelope are shown.`
          : "No rules or envelope until this is fixed."}
      </Banner>
    );
  }
  if (!c) return null;
  if (c.status === "invalid") return <Banner tone="red" title="Plot shape is invalid">{c.message}</Banner>;

  const env = c.envelopes.highRise?.slices.length ? c.envelopes.highRise : c.envelopes.lowRise;
  return (
    <div className="mt-3 border-t border-neutral-200 pt-3">
      <span className="text-[12px] font-semibold text-neutral-700">What the rules allow</span>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <Stat label="Max floor area" value={`${nf.format(c.far.maxGfaM2)} m²`} sub={`FAR ${n1.format(c.far.far)} · ${c.far.source.split(",")[0]}`} />
        <Stat label="Open space needed" value={`${nf.format(c.openSpaceAtMaxGfa.requiredM2)} m²`} sub={`≥ ${c.openSpaceAtMaxGfa.landPct} % of land or ${RULES.osr.pctOfGfa} % of floor area`} />
        {c.status === "ok" && env && (
          <>
            <Stat
              label={env.cls === "highRise" ? "Allowed space (high-rise)" : "Allowed space (low-rise)"}
              value={`${n1.format(env.heightM)} m tall`}
              sub={`${env.slices.length} floor levels · ground ${nf.format(env.groundAreaM2)} m²`}
            />
            <Stat label="Max footprint" value={`${nf.format(c.openSpaceAtMaxGfa.coverageCapM2)} m²`} sub="plot minus open space" />
          </>
        )}
      </dl>
      {c.status === "no-road" && (
        <Banner tone="road" title="Which edge faces the road?">
          Click the plot edge on the road to see the setbacks and allowed space.
        </Banner>
      )}
      {c.status === "ok" && c.gate && !c.gate.permitted && (
        <Banner tone="red" title="High-rise not permitted">
          {c.gate.reason} <span className="opacity-70">({c.gate.source})</span>
        </Banner>
      )}
      {c.status === "ok" && !c.buildable && <Banner tone="red" title="Not buildable">{c.notBuildableReason}</Banner>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-neutral-500">{label}</dt>
      <dd className="text-base font-semibold tabular-nums leading-tight">{value}</dd>
      {sub && <dd className="text-[10.5px] leading-snug text-neutral-400">{sub}</dd>}
    </div>
  );
}

// Amber is kept for what the user clicked (proof on the model); a prompt uses the road-edge blue.
function Banner({ tone, title, children }: { tone: "red" | "road"; title: string; children?: React.ReactNode }) {
  const cls = tone === "red" ? "bg-red-50 text-red-800 ring-red-200" : "bg-blue-50 text-blue-900 ring-blue-200";
  return (
    <div className={`panel-in mt-2.5 rounded-lg px-3 py-2 text-xs ring-1 ${cls}`} role={tone === "red" ? "alert" : "status"}>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-0.5">{children}</div>}
    </div>
  );
}
