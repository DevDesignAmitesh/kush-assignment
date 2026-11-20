"use client";

import { useStore } from "@/store";

/** Bottom-of-map coach: always says what to do next. */
export function StepGuide({ ready }: { ready: boolean }) {
  const mode = useStore((s) => s.mode);
  const plot = useStore((s) => s.plot);
  const points = useStore((s) => s.drawPoints);
  const errors = useStore((s) => s.site?.issues.filter((i) => i.level === "error").length ?? 0);

  let title: string;
  let body: React.ReactNode;
  let tone = "bg-white text-neutral-900";

  if (!ready) {
    title = "Loading map";
    body = "One moment…";
  } else if (mode === "drawing") {
    tone = "bg-neutral-900 text-white";
    title = points === 0 ? "Click the first corner of your plot" : `${points} corner${points === 1 ? "" : "s"} placed`;
    body =
      points < 3 ? (
        <>Keep clicking each corner on the map. You need at least 3.</>
      ) : (
        <>
          Click the <b>first corner</b> again (or double-click) to finish. <Kbd>Esc</Kbd> cancels.
        </>
      );
  } else if (plot && errors > 0) {
    tone = "bg-red-600 text-white";
    title = `Fix ${errors === 1 ? "the problem" : `${errors} problems`} with this plot`;
    body = (
      <>
        See <b>Site checks</b> on the left. Drag the corners to fix it, or press <b>Redraw plot</b>.
      </>
    );
  } else if (plot) {
    title = "Plot ready. Adjust it if needed";
    body = (
      <>
        Drag a <b>white corner</b> to move it · drag an <b>orange dot</b> to add a corner · drag inside to move the plot.
        <span className="mt-1 block text-xs opacity-70">
          Next build: choose the road and building type, then see the rules, allowed space and designs.
        </span>
      </>
    );
  } else {
    title = "Step 1 · Mark your plot";
    body = (
      <>
        Press <b>Draw plot</b> and click its corners on the map, or try <b>Demo plot (Ari)</b>.
      </>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4 max-sm:hidden">
      <div
        key={`${mode}-${!!plot}-${points}-${errors > 0}`}
        className={`guide-in pointer-events-auto max-w-xl rounded-xl px-5 py-3 text-sm shadow-lg ring-1 ring-black/10 ${tone}`}
        role="status"
        aria-live="polite"
      >
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 opacity-90">{body}</div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-current/30 px-1 py-px text-xs">{children}</kbd>;
}
