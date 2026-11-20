/// <reference lib="webworker" />
// Engine Web Worker (DEVIATIONS M4 performance): the pure engine runs here so dragging never blocks the map.
// kind "envelope" = computeAll only (rules + envelopes, used while dragging);
// kind "full" = computeAll + designs + independent checker (+ what-ifs when asked), used on release.
import { computeAll, computeDesigns, type ComputeInputs } from "./index";
import { verdictFor, whatIfs } from "./verdict";
import type { StationResult } from "./siteChecks";

export interface EngineJob {
  id: number;
  kind: "envelope" | "full";
  inp: ComputeInputs;
  station: StationResult | null;
  wantWhatIfs: boolean;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<EngineJob>) => {
  const { id, kind, inp, station, wantWhatIfs } = e.data;
  const t0 = performance.now();
  const compute = computeAll(inp);
  const msCompute = performance.now() - t0;
  if (kind === "envelope") {
    ctx.postMessage({ id, kind, compute, ms: { compute: msCompute } });
    return;
  }
  const t1 = performance.now();
  const designs = compute.status === "ok" ? computeDesigns(compute, { type: inp.type, bonusPcts: inp.bonusPcts, station, assumptions: inp.assumptions }) : [];
  const msDesigns = performance.now() - t1;
  const t2 = performance.now();
  let wi: ReturnType<typeof whatIfs> = [];
  if (wantWhatIfs && compute.status === "ok" && verdictFor(compute, designs, null).colour !== "green") wi = whatIfs(inp, compute, designs, station);
  ctx.postMessage({ id, kind, compute, designs, whatIfs: wi, ms: { compute: msCompute, designs: msDesigns, whatIfs: performance.now() - t2 } });
};
