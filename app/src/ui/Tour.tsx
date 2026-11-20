"use client";

// Guided tour of the tool, started only on request (Tour button, "Take the tour", /tool?tour=1).
// Simple mode first: fly to an empty lot, Draw, tap 4 corners (a hand points at each), road side, result;
// then Expert: designs and Compare. Steps that wait for an action move on by themselves when it happens.
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store";
import type { LngLat } from "@/engine/geo";
import type { MapApi } from "@/map/MapView";
import { sound } from "./sound";

/**
 * Empty lot for the tour: open land on Phahon Yothin Road, ~240 m from Ari BTS, inside ย.10. Picked by running
 * the app's own checkSite over the OpenFreeMap tiles (no building, no road crossing, a road along edge 1).
 */
export const TOUR_LOT: LngLat[] = [
  [100.545172, 13.781822],
  [100.545276, 13.782112],
  [100.544892, 13.782244],
  [100.544788, 13.781953],
];

export const TOUR_STEPS = ["welcome", "go", "draw", "corners", "road", "result", "model", "expert", "designs", "compare"] as const;
export type TourStepId = (typeof TOUR_STEPS)[number];
export const tourStepId = (n: number | null): TourStepId | null => (n === null ? null : (TOUR_STEPS[n] ?? null));

export function startTour() {
  sound.click();
  useStore.getState().setTourStep(0);
}

const ACCENT = "#e4572e";
const at = (id: TourStepId) => TOUR_STEPS.indexOf(id);

/** The tour card and the highlight around the element it talks about (fixed, over everything). */
export function Tour({ api }: { api: MapApi | null }) {
  const stepN = useStore((s) => s.tourStep);
  const plot = useStore((s) => s.plot);
  const mode = useStore((s) => s.mode);
  const drawPoints = useStore((s) => s.drawPoints);
  const simpleStep = useStore((s) => s.simpleStep);
  const uiMode = useStore((s) => s.uiMode);
  const [flying, setFlying] = useState(false);
  const step = tourStepId(stepN);
  const set = (id: TourStepId | null) => useStore.getState().setTourStep(id === null ? null : at(id));

  // Steps that wait for the user's action move on when it happens.
  useEffect(() => {
    if (step === "draw" && mode === "drawing") set("corners");
    else if (step === "corners" && plot && mode !== "drawing") set("road");
    else if (step === "road" && simpleStep === 3) set("result");
  }, [step, mode, plot, simpleStep]);

  const target = step ? TARGET[step] : null;
  const { rect, cardH, cardRef } = useTracked(target, step);
  if (!step) return null;

  const end = (msg?: string) => {
    set(null);
    if (msg) useStore.getState().showToast(msg, "success");
  };
  const total = TOUR_STEPS.length;
  const n = at(step);

  // ---- per-step text and buttons ----
  let title = "";
  let body: React.ReactNode = null;
  let next: { label: string; run: () => void; disabled?: boolean } | null = null;
  let back: (() => void) | null = () => set(TOUR_STEPS[n - 1]);
  switch (step) {
    case "welcome":
      title = "Welcome to Plotwise";
      body = (
        <>
          In about a minute: draw a plot on the map, see what the law lets you build, and compare three designs.
          {plot && <span className="mt-1 block text-neutral-500">Starting clears your current plot (Undo brings it back).</span>}
        </>
      );
      back = null;
      next = {
        label: "Start",
        run: () => {
          const st = useStore.getState();
          if (st.mode === "drawing") api?.cancelDrawing();
          if (st.plot) api?.clear();
          st.setUiMode("simple");
          st.setSimpleStep(1);
          set("go");
        },
      };
      break;
    case "go":
      title = "Go to an empty lot";
      body = "The map shows the real buildings around you. We'll fly to an open lot beside Phahon Yothin Road, a short walk from Ari BTS.";
      next = {
        label: flying ? "Flying…" : "Go there",
        disabled: flying || !api,
        run: () => {
          if (!api) return;
          setFlying(true);
          api.flyToRing(TOUR_LOT).then(() => {
            setFlying(false);
            if (useStore.getState().tourStep === at("go")) set("draw");
          });
        },
      };
      break;
    case "draw":
      title = "Press Draw";
      body = (
        <>
          The dashed outline is the lot. Press <b>Draw</b> on the card to start marking it.
        </>
      );
      next = { label: "Draw", run: () => api?.startDrawing() };
      break;
    case "corners": {
      const closing = drawPoints >= TOUR_LOT.length;
      title = closing ? "Close the plot" : `Tap corner ${drawPoints + 1} of ${TOUR_LOT.length}`;
      body = closing ? (
        <>
          Tap the <b>first corner</b> again to finish the plot.
        </>
      ) : (
        <>Tap the map where the hand points. Close enough is fine: you can drag the corners later.</>
      );
      back = () => {
        api?.cancelDrawing();
        set("draw");
      };
      break;
    }
    case "road":
      title = "Which side faces the road?";
      body = (
        <>
          Plotwise found the road along the plot and guessed its width. Use <b>−</b> / <b>+</b> if it looks wrong, then press{" "}
          <b>Next</b> on the card.
        </>
      );
      back = () => {
        api?.clear();
        set("draw");
      };
      break;
    case "result":
      title = "The verdict";
      body = (
        <>
          Green, amber or red: can you build here, and how much. <b>Why?</b> opens the rule behind it. Try condo, office or hotel on the card.
        </>
      );
      back = () => {
        useStore.getState().setSimpleStep(2);
        set("road");
      };
      next = { label: "Next", run: () => set("model") };
      break;
    case "model":
      title = "The 3D model";
      body = (
        <>
          The <b className="text-cyan-600">blue</b> volume is the space the law allows on this plot. The solid block inside it is the best of the
          three designs.
        </>
      );
      next = { label: "Next", run: () => set("expert") };
      break;
    case "expert":
      title = "Want every number?";
      body = "Expert mode shows all the inputs and assumptions, the three designs and the full pass/fail checklist.";
      next = {
        label: "Show Expert",
        run: () => {
          useStore.getState().setUiMode("expert");
          set("designs");
        },
      };
      break;
    case "designs":
      title = "Three designs";
      body = (
        <>
          <b>A</b> terraced block, <b>B</b> podium + tower, <b>C</b> low-rise. Each shows its floor area, what limits it and a checklist; tap a
          check row to see its cause on the model.
        </>
      );
      back = () => {
        useStore.getState().setUiMode("simple");
        set("expert");
      };
      next = { label: "Next", run: () => set("compare") };
      break;
    case "compare":
      title = "Compare them";
      body = "Compare puts A, B and C side by side, or says why one is not possible here. That's the tour!";
      next = { label: "Finish", run: () => end("Tour finished. Replay it any time from Tour.") };
      break;
  }
  // The spotlighted element is missing (e.g. the user switched modes): the card still guides, without a ring.
  const showRing = !!rect && uiMode === (n >= at("designs") ? "expert" : "simple");

  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-live="polite">
      {step === "welcome" && <div className="pointer-events-auto absolute inset-0 bg-black/35" />}
      {showRing && rect && (
        <div
          className="absolute rounded-xl ring-4 ring-[#f5c542] transition-all duration-200"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)" }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Tour step ${n + 1} of ${total}: ${title}`}
        className="panel-in pointer-events-auto absolute w-[330px] max-w-[calc(100vw-24px)] rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/10"
        style={cardPos(step, showRing ? rect : null, cardH)}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wide text-neutral-400">
            STEP {n + 1} OF {total}
          </span>
          <button onClick={() => end()} className="rounded px-1.5 text-[12px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            Skip tour
          </button>
        </div>
        <div className="mt-1 text-[15px] font-semibold text-neutral-900">{title}</div>
        <div className="mt-1 text-[13px] leading-snug text-neutral-600">{body}</div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden>
            {TOUR_STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full ${i === n ? "w-4" : "w-1.5"}`} style={{ background: i <= n ? ACCENT : "#e5e5e5" }} />
            ))}
          </div>
          {back && (
            <button
              onClick={() => {
                sound.click();
                back();
              }}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50"
            >
              Back
            </button>
          )}
          {next && (
            <button
              disabled={next.disabled}
              onClick={() => {
                sound.click();
                next.run();
              }}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              {next.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** What each step points at (a `data-tour` element). */
const TARGET: Partial<Record<TourStepId, string>> = {
  draw: "draw",
  road: "stepcard",
  result: "result",
  designs: "designs",
  compare: "compare",
};

type Rect = { left: number; top: number; width: number; height: number };

/** Track the target element's rect and the card's height every frame (layout moves with panels and sheets). */
function useTracked(target: string | null | undefined, step: TourStepId | null) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(180);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!step) return;
    // The target may sit below the fold of a scrolling panel (Compare in the phone sheet): bring it into view.
    const t0 = target ? setTimeout(() => document.querySelector(`[data-tour="${target}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 350) : 0;
    let raf = 0;
    let last = "";
    const tick = () => {
      const el = target ? document.querySelector(`[data-tour="${target}"]`) : null;
      const r = el?.getBoundingClientRect();
      const visible = r && r.width > 0 && r.height > 0;
      const h = cardRef.current?.offsetHeight ?? 180;
      const key = visible ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${h}` : `none,${h}`;
      if (key !== last) {
        last = key;
        setRect(visible ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
        setCardH(h);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (t0) clearTimeout(t0);
    };
  }, [target, step]);
  return { rect, cardH, cardRef };
}

/** Card placement: centred for the welcome, next to the target when there is one, else at the bottom. */
function cardPos(step: TourStepId, r: Rect | null, cardH: number): React.CSSProperties {
  const W = typeof window !== "undefined" ? window.innerWidth : 1200;
  const H = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(330, W - 24);
  const clampX = (x: number) => Math.max(12, Math.min(W - cardW - 12, x));
  // Whatever the target does (off screen, scrolling), the card stays fully on screen.
  const clampY = (y: number) => Math.max(12, Math.min(H - cardH - 12, y));
  if (step === "welcome") return { left: clampX((W - cardW) / 2), top: clampY((H - cardH) / 2) };
  if (!r) return { left: clampX((W - cardW) / 2), top: clampY(H - cardH - 16) };
  const gap = 18;
  if (r.top + r.height + gap + cardH < H - 8) return { left: clampX(r.left + r.width / 2 - cardW / 2), top: clampY(r.top + r.height + gap) };
  if (r.top - gap - cardH > 8) return { left: clampX(r.left + r.width / 2 - cardW / 2), top: clampY(r.top - gap - cardH) };
  // Tall target (e.g. the designs panel): beside it, on the side with room; on a phone, over the map above it.
  if (W < 640) return { left: clampX((W - cardW) / 2), top: clampY(Math.min(r.top, H * 0.55) - gap - cardH) };
  const left = r.left - gap - cardW >= 12 ? r.left - gap - cardW : clampX(r.left + r.width + gap);
  return { left, top: clampY(r.top + 60) };
}

/** Inside the map container: the lot outline and the hand pointing at the next corner. */
export function TourMapLayer({ api }: { api: MapApi | null }) {
  const step = tourStepId(useStore((s) => s.tourStep));
  const drawPoints = useStore((s) => s.drawPoints);
  const mode = useStore((s) => s.mode);
  const [, setTick] = useState(0);
  const show = !!api && (step === "draw" || step === "corners");
  useEffect(() => {
    if (!api || !show) return;
    return api.onCamera(() => setTick((t) => t + 1));
  }, [api, show]);
  if (!show || !api) return null;

  const pts = TOUR_LOT.map((p) => api.project(p));
  const drawing = step === "corners" && mode === "drawing";
  const k = drawing ? Math.min(drawPoints, TOUR_LOT.length) % TOUR_LOT.length : 0;
  const hand = step === "corners" ? pts[k] : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden>
      <svg className="absolute inset-0 h-full w-full">
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(245,197,66,0.12)" stroke="#f5c542" strokeWidth="2.5" strokeDasharray="8 6" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="11" fill={drawing && i < drawPoints ? ACCENT : "#fff"} stroke={ACCENT} strokeWidth="2" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={drawing && i < drawPoints ? "#fff" : ACCENT}>
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      {hand && (
        <>
          <span className="tour-ripple absolute h-10 w-10 rounded-full border-2 border-[#e4572e]" style={{ left: hand.x - 20, top: hand.y - 20 }} />
          <span className="tour-hand absolute select-none text-[38px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" style={{ left: hand.x - 14, top: hand.y + 6 }}>
            👆
          </span>
        </>
      )}
    </div>
  );
}
