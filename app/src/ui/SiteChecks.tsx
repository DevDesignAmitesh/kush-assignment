"use client";

import type { IssueLevel, SiteResult } from "@/engine/siteChecks";

const ICON: Record<IssueLevel, { glyph: string; cls: string }> = {
  error: { glyph: "✕", cls: "bg-red-600 text-white" },
  warning: { glyph: "!", cls: "bg-amber-400 text-amber-950" },
  info: { glyph: "i", cls: "bg-sky-100 text-sky-700" },
  ok: { glyph: "✓", cls: "bg-emerald-100 text-emerald-700" },
};

export function SiteChecks({ site }: { site: SiteResult }) {
  const errors = site.issues.filter((i) => i.level === "error").length;
  const warnings = site.issues.filter((i) => i.level === "warning").length;
  const summary =
    errors > 0
      ? { text: `${errors} problem${errors > 1 ? "s" : ""} to fix`, cls: "text-red-600" }
      : warnings > 0
        ? { text: `${warnings} thing${warnings > 1 ? "s" : ""} to check`, cls: "text-amber-600" }
        : { text: "Looks good", cls: "text-emerald-600" };

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-neutral-700">Site checks</span>
        <span className={`text-xs font-semibold ${summary.cls}`}>{summary.text}</span>
      </div>
      <ul className="mt-2 space-y-2">
        {site.issues.map((i) => (
          <li key={i.id} className="panel-in flex gap-2">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${ICON[i.level].cls}`}
              aria-label={i.level}
            >
              {ICON[i.level].glyph}
            </span>
            <div className="min-w-0">
              <div className={`text-[13px] font-medium leading-snug ${i.level === "error" ? "text-red-700" : ""}`}>{i.title}</div>
              {i.detail && <div className="text-xs leading-snug text-neutral-500">{i.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
