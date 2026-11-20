"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, type RoadEdgeState } from "@/store";
import type { ComputeResult, DesignResult } from "@/engine";
import { EngineClient } from "@/site/engineClient";
import { decodeScenario, encodeScenario } from "@/ui/scenario";
import { perfOn } from "@/ui/perf";
import { ModeSwitch, ResultCard, SimpleLegend, SimpleTopBar, StepCard, type RulesData } from "@/ui/Simple";
import { bestDesign, verdictFor, type WhatIf } from "@/engine/verdict";
import { densityMeter } from "@/engine/density";
import { RULES } from "@/engine/rules";
import { centroidLngLat, openRing as openRingLL } from "@/engine/geo";
import { defaultRoadWidth } from "@/engine/roadDefaults";
import type { LngLat } from "@/engine/geo";
import { remapEdges } from "@/engine/remapEdges";
import type { MapApi } from "@/map/MapView";
import { Button } from "@/ui/Button";
import { Toast } from "@/ui/Toast";
import { sound } from "@/ui/sound";
import { checkSite } from "@/engine/siteChecks";
import { TARGET_ZONE } from "@/rules";
import { startTour, Tour, TourMapLayer, tourStepId } from "@/ui/Tour";

const MapView = dynamic(() => import("@/map/MapView"), {
  ssr: false,
  loading: () => <MapLoading />,
});

// Expert-only UI is loaded on demand: Simple mode never downloads it (DEVIATIONS M4 performance).
const DesignPanel = dynamic(() => import("@/ui/DesignPanel").then((m) => m.DesignPanel), { ssr: false });
const CompareModal = dynamic(() => import("@/ui/DesignPanel").then((m) => m.CompareModal), { ssr: false });
const ExpertSteps = dynamic(() => import("@/ui/ExpertSteps").then((m) => m.ExpertSteps), { ssr: false });
const KpiStrip = dynamic(() => import("@/ui/ExpertExtras").then((m) => m.KpiStrip), { ssr: false });
const FooterLine = dynamic(() => import("@/ui/ExpertExtras").then((m) => m.FooterLine), { ssr: false });
const Legend = dynamic(() => import("@/ui/Legend").then((m) => m.Legend), { ssr: false });
const ViewControl = dynamic(() => import("@/ui/ViewControl").then((m) => m.ViewControl), { ssr: false });
const StepGuide = dynamic(() => import("@/ui/StepGuide").then((m) => m.StepGuide), { ssr: false });

function MapLoading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-neutral-500">
      <span className="spinner" aria-hidden />
      Loading the Bangkok map…
    </div>
  );
}


/** Undo / redo from keys or buttons. Ignored while drawing (Esc cancels a drawing). */
function doHistory(kind: "undo" | "redo") {
  const st = useStore.getState();
  if (st.mode === "drawing") return;
  const ok = kind === "undo" ? st.undo() : st.redo();
  if (ok) st.showToast(kind === "undo" ? "Undone" : "Redone");
}

export default function ClientShell() {
  const [api, setApi] = useState<MapApi | null>(null);
  const plot = useStore((s) => s.plot);
  const mode = useStore((s) => s.mode);
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);
  const onReady = useCallback((a: MapApi) => setApi(a), []);
  const canUndo = useStore((s) => s.history.index > 0);
  const canRedo = useStore((s) => s.history.index < s.history.entries.length - 1);
  const context = useStore((s) => s.context);
  const zones = useStore((s) => s.zones);
  const justFinished = useStore((s) => s.justFinished);

  // Site checks: pure, recomputed on every plot / data change (live while dragging).
  const stations = useStore((s) => s.stations);
  const site = useMemo(
    () => (plot ? checkSite({ plot, context, zones, stations, target: TARGET_ZONE }) : null),
    [plot, context, zones, stations],
  );
  useEffect(() => {
    useStore.getState().setSite(site);
  }, [site]);

  // Road-edge auto-suggestion: the plot edges that run along a detected public road (≤ 25 m, < 30°),
  // with class-default widths marked as estimates. Stops once the user edits edges, until the corner
  // count changes (edge indices shift), then re-detects.
  const roadEdges = useStore((s) => s.roadEdges);
  const buildingType = useStore((s) => s.buildingType);
  const edgeCount = plot ? plot.length - 1 : 0;
  const prevEdgeCount = useRef(0);
  const prevPlot = useRef<LngLat[] | null>(null);
  const prevRestore = useRef(0);
  const restoreSeq = useStore((s) => s.restoreSeq);
  useEffect(() => {
    const st = useStore.getState();
    // Derived road-edge changes amend the current undo entry instead of adding one.
    const setEdges = (e: Record<number, RoadEdgeState>, src: "auto" | "user") => {
      st.setRoadEdges(e, src);
      st.amendCurrent();
    };
    const restored = prevRestore.current !== restoreSeq;
    prevRestore.current = restoreSeq;
    if (!plot) {
      prevEdgeCount.current = 0;
      prevPlot.current = null;
      if (!restored && (Object.keys(st.roadEdges).length || st.roadEdgesSource !== "auto")) setEdges({}, "auto");
      return;
    }
    if (!site) return;
    const countChanged = prevEdgeCount.current !== edgeCount;
    const oldPlot = prevPlot.current;
    prevEdgeCount.current = edgeCount;
    prevPlot.current = plot;
    if (st.roadEdgesSource === "user") {
      // Undo/redo restored edges that already match this plot: nothing to remap.
      if (restored) return;
      // Corner added or removed: carry the user's road edges onto the new edges instead of re-detecting.
      if (countChanged && oldPlot) {
        const moved = remapEdges(oldPlot, plot, st.roadEdges);
        if (Object.keys(moved).length < Object.keys(st.roadEdges).length) st.showToast("A road edge was merged away; check the road edges");
        setEdges(moved, "user");
      }
      return;
    }
    const next: Record<number, RoadEdgeState> = {};
    for (const e of site.suggestedRoadEdges) {
      next[e.edge] = {
        widthM: defaultRoadWidth(e.roadClass, e.name),
        confirmed: false,
        label: `${e.name ?? "unnamed road"} · ${e.roadClass}`,
      };
    }
    if (JSON.stringify(next) !== JSON.stringify(st.roadEdges)) setEdges(next, "auto");
  }, [plot, site, edgeCount, restoreSeq]);

  // Undo / redo keys: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y. Never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const st = useStore.getState();
        if (st.compareOpen) st.setCompareOpen(false);
        else if (st.proof) st.setProof(null);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const k = e.key.toLowerCase();
      const isUndo = k === "z" && !e.shiftKey;
      const isRedo = (k === "z" && e.shiftKey) || (k === "y" && !e.shiftKey);
      if (!isUndo && !isRedo) return;
      e.preventDefault();
      doHistory(isUndo ? "undo" : "redo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Engine: rules + envelopes, live on every plot / input change. Blocked plots get nothing (planning Q2).
  const roadWidths = useMemo(
    () => Object.fromEntries(Object.entries(roadEdges).map(([k, v]) => [k, v.widthM])) as Record<number, number>,
    [roadEdges],
  );
  const blocked = site?.blocked ?? true;
  const station = site?.station ?? null;
  const uiModeForEngine = useStore((s) => s.uiMode);
  const dragging = useStore((s) => s.dragging);
  const bonuses = useStore((s) => s.bonuses);
  const bonusPcts = useMemo(() => Object.values(bonuses), [bonuses]);
  const assumptions = useStore((s) => s.assumptions);

  // Engine runs in Web Workers, latest job wins (DEVIATIONS M4 performance). While dragging only the
  // envelope is computed (≤ 1 job in flight, newer geometry replaces the queued one); on release the full
  // job (designs + independent checker + what-ifs) runs, and any older full result is dropped.
  const [engine, setEngine] = useState<{ compute: ComputeResult | null; designs: DesignResult[]; whatIfs: WhatIf[] }>({ compute: null, designs: [], whatIfs: [] });
  const client = useRef<EngineClient | null>(null);
  useEffect(() => {
    const c = new EngineClient((r) =>
      {
        if (r.kind === "full") useStore.setState({ updating: false });
        setEngine((prev) => (r.kind === "envelope" ? { ...prev, compute: r.compute } : { compute: r.compute, designs: r.designs ?? [], whatIfs: r.whatIfs ?? [] }));
      },
    );
    client.current = c;
    if (perfOn) (window as unknown as { __plotwiseEngineClient?: EngineClient }).__plotwiseEngineClient = c;
    return () => c.dispose();
  }, []);
  useEffect(() => {
    const c = client.current;
    if (!c) return;
    if (!plot || blocked) {
      c.cancelFull();
      useStore.setState({ updating: false });
      return;
    }
    const inp = { plot, roadEdges: roadWidths, type: buildingType, bonusPcts, assumptions };
    useStore.setState({ updating: true });
    if (dragging) {
      c.cancelFull();
      c.run("envelope", { inp, station, wantWhatIfs: false });
    } else c.run("full", { inp, station, wantWhatIfs: uiModeForEngine === "simple" });
  }, [plot, blocked, roadWidths, buildingType, bonusPcts, assumptions, station, dragging, uiModeForEngine]);
  // No plot / blocked plot: nothing is shown, whatever a worker last returned.
  const live = !!plot && !blocked;
  const compute = live ? engine.compute : null;
  const designs = useMemo(() => (live ? engine.designs : []), [live, engine.designs]);
  useEffect(() => {
    useStore.getState().setCompute(compute);
  }, [compute]);

  useEffect(() => {
    const st = useStore.getState();
    st.setDesigns(designs);
    // Keep a buildable design selected (e.g. the gate fails: A and B become unavailable, C remains).
    const cur = designs.find((d) => d.design.id === st.selectedDesign);
    if (designs.length && !cur?.design.buildable) {
      const first = designs.find((d) => d.design.buildable);
      if (first) st.setSelectedDesign(first.design.id);
    }
  }, [designs]);

  // ---------------- Simple / Expert ----------------
  const uiMode = useStore((s) => s.uiMode);
  // Mode lives in the URL hash (#mode=expert); read once, then mirror.
  useEffect(() => {
    const m = new URLSearchParams(window.location.hash.slice(1)).get("mode");
    if (m === "expert" || m === "simple") useStore.getState().setUiMode(m);
  }, []);
  // The whole scenario (plot, roads, type, bonuses, assumptions) is mirrored to #s=… so a reload / shared link restores it.
  // Not while dragging (the release writes it once). The hash is only written after the first restore ran.
  const hashReady = useRef(false);
  useEffect(() => {
    if (!hashReady.current || dragging) return;
    const p = new URLSearchParams(window.location.hash.slice(1));
    p.set("mode", uiMode);
    const code = encodeScenario({ plot, roadEdges, roadEdgesSource: "user", buildingType, bonuses, assumptions });
    if (code) p.set("s", code);
    else p.delete("s");
    const next = `#${p.toString()}`;
    if (next !== window.location.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
  }, [uiMode, plot, roadEdges, buildingType, bonuses, assumptions, dragging]);

  // Steps: no plot → 1; a new plot → 2 (road); the user moves on with "Next".
  const hadPlot = useRef(false);
  useEffect(() => {
    const st = useStore.getState();
    if (!plot) {
      hadPlot.current = false;
      if (st.simpleStep !== 1) st.setSimpleStep(1);
    } else if (!hadPlot.current) {
      hadPlot.current = true;
      if (st.simpleStep === 1) st.setSimpleStep(2);
    }
  }, [plot]);

  const blockedReason = site?.blocked ? (site.issues.find((i) => i.level === "error")?.title ?? "this plot can't be assessed").replace(/^Plot is /, "it is ") : null;
  const verdict = useMemo(() => (plot && (compute || blockedReason) ? verdictFor(compute, designs, blockedReason) : null), [plot, compute, designs, blockedReason]);
  // What-ifs re-run the engine: only in Simple, only on the settled (deferred) result.
  // What-ifs come from the full worker job (Simple only, not when green).
  const whatIfList = uiMode === "simple" && verdict?.colour !== "green" ? (live ? engine.whatIfs : []) : [];
  const density = useMemo(() => {
    const b = bestDesign(designs);
    if (!b || !plot) return null;
    return densityMeter(b.design.heightM, context.buildings, centroidLngLat(openRingLL(plot)), new Set(site?.highlights.onPlotBuildingIds ?? []));
  }, [designs, plot, context.buildings, site]);
  const rulesData: RulesData | null = useMemo(() => {
    if (!compute || compute.status !== "ok") return null;
    const b = bestDesign(designs);
    const low = compute.envelopes.lowRise?.slices[0]?.setbacks.filter((x) => x.terms.band === undefined).map((x) => x.s) ?? [];
    const gapM = b?.design.cls === "highRise" ? RULES.highRise.setbackAllM : Math.max(0, ...low);
    return { far: compute.far.far, gapM, landPct: compute.openSpaceAtMaxGfa.landPct, m2PerCar: buildingType === "office" ? RULES.parking.officeM2PerSpace : RULES.parking.largeBuildingM2PerSpace, design: b?.design.id ?? null };
  }, [compute, designs, buildingType]);
  // In Simple the shown design is the best one (fewest fails, then most floor area).
  useEffect(() => {
    if (uiMode !== "simple") return;
    const b = bestDesign(designs);
    if (b && useStore.getState().selectedDesign !== b.design.id) useStore.getState().setSelectedDesign(b.design.id);
  }, [uiMode, designs]);
  // Expert on a phone: one bottom sheet with Inputs / Designs tabs (or hidden), so the map keeps the top half.
  const [phoneSheet, setPhoneSheet] = useState<"inputs" | "designs" | "closed">("inputs");
  // A proof opened from Simple's "Why?" (or a check row) belongs to the Designs tab.
  const proof = useStore((s) => s.proof);
  const [seenProof, setSeenProof] = useState(proof);
  if (proof !== seenProof) {
    setSeenProof(proof);
    if (proof) setPhoneSheet("designs");
  }
  const tourAt = tourStepId(useStore((s) => s.tourStep));
  const [seenTour, setSeenTour] = useState(tourAt);
  if (tourAt !== seenTour) {
    setSeenTour(tourAt);
    if (tourAt === "designs" || tourAt === "compare") setPhoneSheet("designs");
  }
  const selectedDesign = useStore((s) => s.selectedDesign);
  const shownDesign = designs.find((d) => d.design.id === selectedDesign && d.design.buildable) ?? designs.find((d) => d.design.buildable);
  const designsHint = shownDesign ? (shownDesign.summary.fail ? `${shownDesign.design.id} · ${shownDesign.summary.fail} fail` : `${shownDesign.design.id} · all pass`) : null;

  const near = site?.station?.nearestMassTransit;
  const place = near && near.distM < 1500 ? `near ${near.name} · ${TARGET_ZONE.zoneCode}` : `Bangkok · ${TARGET_ZONE.zoneCode}`;

  // Feedback for a just-finished plot, once its checks exist.
  useEffect(() => {
    if (!justFinished || !site) return;
    const st = useStore.getState();
    st.setJustFinished(null);
    const errors = site.issues.filter((i) => i.level === "error");
    if (errors.length) {
      sound.error();
      st.showToast(`${justFinished}, but: ${errors[0].title}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}`, "error");
    } else {
      sound.success();
      st.showToast(justFinished, "success");
    }
  }, [justFinished, site]);

  // Restore the mute preference.
  useEffect(() => {
    try {
      if (localStorage.getItem("plotwise:muted") === "1") useStore.getState().setMuted(true);
    } catch {
      /* storage blocked */
    }
  }, []);

  // /tool?demo=1 (from the landing page) loads the demo plot as soon as the map is ready.
  useEffect(() => {
    if (!api) return;
    const code = new URLSearchParams(window.location.hash.slice(1)).get("s");
    const sc = code ? decodeScenario(code) : null;
    hashReady.current = true;
    if (sc) {
      useStore.getState().restoreScenario(sc);
      useStore.getState().setSimpleStep(3);
      api.fitPlot();
      return;
    }
    if (code) useStore.getState().showToast("That link could not be read; start a new plot", "error");
    if (new URLSearchParams(window.location.search).get("tour") === "1") {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      startTour();
      return;
    }
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      api.loadDemo();
      window.history.replaceState(null, "", window.location.pathname + window.location.hash); // keep #mode=…
    }
  }, [api]);

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      {uiMode === "simple" ? (
        <SimpleTopBar
          place={place}
          undo={
            <div className="flex" role="group" aria-label="History">
              <Button variant="ghost" className="px-2 text-[12px]" onClick={startTour} title="Guided tour" aria-label="Guided tour">
                <span className="max-sm:hidden">Tour</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-bold ring-1 ring-neutral-400 sm:hidden">?</span>
              </Button>
              <Button variant="ghost" className="px-2" disabled={!canUndo || mode === "drawing"} onClick={() => doHistory("undo")} aria-label="Undo" title="Undo (Ctrl+Z)">
                <UndoIcon />
              </Button>
              <Button variant="ghost" className="px-2" disabled={!canRedo || mode === "drawing"} onClick={() => doHistory("redo")} aria-label="Redo" title="Redo (Ctrl+Shift+Z / Ctrl+Y)">
                <UndoIcon flip />
              </Button>
            </div>
          }
        />
      ) : (
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-2.5 max-sm:gap-1.5 max-sm:px-2 max-sm:py-1.5">
        <div className="flex items-center gap-3 max-sm:w-full max-sm:justify-between">
          <Link href="/" className="flex items-baseline gap-2" onClick={() => sound.click()}>
            <span className="font-semibold tracking-tight">Plotwise</span>
            <span className="text-sm text-neutral-500 max-sm:text-xs">Bangkok · zone {TARGET_ZONE.zoneCode}</span>
          </Link>
          {/* Phone: the mode switch sits on the title row, the actions get one row below. */}
          <div className="sm:hidden">
            <ModeSwitch />
          </div>
          <Link
            href="/"
            onClick={() => sound.click()}
            className="rounded-md px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 max-sm:hidden"
          >
            How it works
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:gap-1">
          {mode === "drawing" ? (
            <Button variant="primary" onClick={() => api?.cancelDrawing()}>
              Cancel drawing
            </Button>
          ) : (
            <Button variant="primary" disabled={!api} pulse={!!api && !plot} onClick={() => api?.startDrawing()}>
              <PenIcon /> {plot ? "Redraw plot" : "Draw plot"}
            </Button>
          )}
          {/* Phone: the demo button is in the Plot step (shown until a plot exists). */}
          <Button className="max-sm:hidden" disabled={!api || mode === "drawing"} onClick={() => api?.loadDemo()}>
            Demo plot (Ari)
          </Button>
          <Button disabled={!api || !plot} onClick={() => api?.clear()}>
            Clear
          </Button>
          <div className="flex gap-1" role="group" aria-label="History">
            <Button variant="ghost" className="px-2.5" disabled={!canUndo || mode === "drawing"} onClick={() => doHistory("undo")} aria-label="Undo" title="Undo (Ctrl+Z)">
              <UndoIcon />
            </Button>
            <Button variant="ghost" className="px-2.5" disabled={!canRedo || mode === "drawing"} onClick={() => doHistory("redo")} aria-label="Redo" title="Redo (Ctrl+Shift+Z / Ctrl+Y)">
              <UndoIcon flip />
            </Button>
          </div>
          <Button variant="ghost" onClick={startTour} title="Guided tour" aria-label="Guided tour">
            <span className="max-sm:hidden">Tour</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-bold ring-1 ring-neutral-400 sm:hidden">?</span>
          </Button>
          {/* Phone: no room for the sound toggle on the actions row. */}
          <Button
            variant="ghost"
            className="max-sm:hidden"
            aria-label={muted ? "Turn sounds on" : "Turn sounds off"}
            title={muted ? "Sounds off" : "Sounds on"}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <MutedIcon /> : <SoundIcon />}
          </Button>
          <div className="max-sm:hidden">
            <ModeSwitch />
          </div>
        </div>
      </header>
      )}

      <main className="relative flex-1 overflow-hidden">
        {/* The map stops at the right panel, so its controls and attribution stay visible and clickable. */}
        {/* Phone (Expert): the map ends at the bottom sheet (45 %), or at its tab bar when the sheet is hidden. */}
        <div className={`absolute inset-y-0 left-0 right-0 ${uiMode === "expert" ? `sm:right-[340px] ${phoneSheet === "closed" ? "max-sm:bottom-10" : "max-sm:bottom-[45%]"}` : "ui-simple"}`}>
          <MapView onReady={onReady} />
          <TourMapLayer api={api} />
        </div>

        {uiMode === "simple" ? (
          <>
            <StepCard api={api} />
            <ResultCard verdict={verdict} whatIfs={whatIfList} density={density} rulesData={rulesData} />
            <SimpleLegend />
          </>
        ) : (
        <>
        {/* Phone: the sheet's tab bar. Desktop shows both panels side by side instead. */}
        <div
          className={`pointer-events-auto absolute inset-x-0 z-10 flex h-10 items-center gap-1 rounded-t-xl border-t border-neutral-200 bg-white px-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:hidden ${phoneSheet === "closed" ? "bottom-0" : "bottom-[calc(45%-2.5rem)]"}`}
          role="tablist"
          aria-label="Panels"
        >
          {(["inputs", "designs"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={phoneSheet === t}
              onClick={() => {
                sound.click();
                setPhoneSheet(t);
              }}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${phoneSheet === t ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
            >
              {t === "inputs" ? "Inputs" : "Designs"}
              {t === "designs" && designsHint && <span className={`ml-1.5 font-normal ${phoneSheet === t ? "text-neutral-300" : "text-neutral-400"}`}>{designsHint}</span>}
            </button>
          ))}
          <button
            onClick={() => {
              sound.click();
              setPhoneSheet(phoneSheet === "closed" ? "inputs" : "closed");
            }}
            className="ml-auto rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-neutral-600"
            aria-label={phoneSheet === "closed" ? "Show panel" : "Hide panel"}
          >
            {phoneSheet === "closed" ? "Show ▴" : "Hide ▾"}
          </button>
        </div>
        {api && <div className={`panel-in pointer-events-auto absolute left-4 top-4 max-h-[calc(100%-8rem)] w-80 max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-white/95 px-4 py-1.5 shadow-md ring-1 ring-black/5 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-[calc(45%-2.5rem)] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:bg-white max-sm:shadow-none max-sm:ring-0 ${phoneSheet === "inputs" ? "" : "max-sm:hidden"}`} aria-label="Inputs">
          <ExpertSteps site={site} api={api} />
        </div>}
        <KpiStrip />
        <FooterLine />

        <DesignPanel phoneHidden={phoneSheet !== "designs"} />
        <CompareModal />
        <ViewControl api={api} />
        <Legend />
        <StepGuide ready={!!api} />
        </>
        )}
        <Toast />
      </main>
      <Tour api={api} />
    </div>
  );
}

function PenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function SoundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}
function MutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5ZM22 9l-6 6M16 9l6 6" />
    </svg>
  );
}

function UndoIcon({ flip }: { flip?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
