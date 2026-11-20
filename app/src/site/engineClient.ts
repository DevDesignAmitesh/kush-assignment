// Runs the engine in Web Workers with "latest job wins" (DEVIATIONS M4 performance).
// - envelope worker: fast jobs (rules + envelope), used on every frame while dragging;
// - full worker: designs + checker + what-ifs, used on release. A new drag terminates a running full job,
//   so a stale result can never arrive after newer geometry.
// Falls back to the main thread if workers cannot start.
import { computeAll, computeDesigns, type ComputeResult, type DesignResult } from "@/engine";
import { verdictFor, whatIfs, type WhatIf } from "@/engine/verdict";
import type { EngineJob } from "@/engine/worker";
import { perfMark } from "@/ui/perf";

export interface EngineResult {
  id: number;
  kind: "envelope" | "full";
  compute: ComputeResult;
  designs?: DesignResult[];
  whatIfs?: WhatIf[];
  ms: { compute: number; designs?: number; whatIfs?: number };
}

type Lane = { worker: Worker | null; busy: EngineJob | null; pending: EngineJob | null };

function spawn(): Worker | null {
  try {
    return new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export class EngineClient {
  private seq = 0;
  private lanes: Record<"envelope" | "full", Lane> = { envelope: { worker: null, busy: null, pending: null }, full: { worker: null, busy: null, pending: null } };
  /** Latest job id per kind: older results are dropped. */
  private latest = { envelope: 0, full: 0 };

  constructor(private onResult: (r: EngineResult) => void) {
    for (const k of ["envelope", "full"] as const) this.lanes[k].worker = this.attach(k, spawn());
  }

  private attach(kind: "envelope" | "full", w: Worker | null): Worker | null {
    if (!w) return null;
    w.onmessage = (e: MessageEvent<EngineResult>) => this.done(kind, e.data);
    w.onerror = () => {
      // A worker that cannot load (old browser, CSP) degrades to the main thread.
      this.lanes[kind].worker = null;
      const job = this.lanes[kind].busy;
      this.lanes[kind].busy = null;
      if (job) this.runSync(job);
    };
    return w;
  }

  run(kind: "envelope" | "full", job: Omit<EngineJob, "id" | "kind">) {
    const j: EngineJob = { ...job, id: ++this.seq, kind };
    this.latest[kind] = j.id;
    const lane = this.lanes[kind];
    if (!lane.worker) return this.runSync(j);
    if (lane.busy) lane.pending = j; // replaces any older pending job
    else this.send(kind, j);
  }

  /** Drop the running full job (e.g. a drag started): terminate and respawn the full worker. */
  cancelFull() {
    const lane = this.lanes.full;
    lane.pending = null;
    if (lane.busy && lane.worker) {
      lane.worker.terminate();
      lane.worker = this.attach("full", spawn());
      lane.busy = null;
    }
    this.latest.full = ++this.seq;
  }

  dispose() {
    for (const k of ["envelope", "full"] as const) this.lanes[k].worker?.terminate();
  }

  private send(kind: "envelope" | "full", j: EngineJob) {
    const lane = this.lanes[kind];
    lane.busy = j;
    lane.worker!.postMessage(j);
  }

  private done(kind: "envelope" | "full", r: EngineResult) {
    const lane = this.lanes[kind];
    lane.busy = null;
    perfMark(`worker:${kind}:compute`, r.ms.compute);
    if (r.ms.designs !== undefined) perfMark("worker:full:designs", r.ms.designs);
    // Envelope results are shown progressively; a full result is dropped if newer geometry is queued.
    const stale = kind === "full" && r.id < this.latest.full;
    if (!stale) this.onResult(r);
    if (lane.pending) {
      const next = lane.pending;
      lane.pending = null;
      this.send(kind, next);
    }
  }

  private runSync(j: EngineJob) {
    const t0 = performance.now();
    const compute = computeAll(j.inp);
    const ms: EngineResult["ms"] = { compute: performance.now() - t0 };
    let designs: DesignResult[] | undefined;
    let wi: WhatIf[] | undefined;
    if (j.kind === "full") {
      designs = compute.status === "ok" ? computeDesigns(compute, { type: j.inp.type, bonusPcts: j.inp.bonusPcts, station: j.station, assumptions: j.inp.assumptions }) : [];
      wi = j.wantWhatIfs && compute.status === "ok" && verdictFor(compute, designs, null).colour !== "green" ? whatIfs(j.inp, compute, designs, j.station) : [];
    }
    if (j.id >= this.latest[j.kind]) this.onResult({ id: j.id, kind: j.kind, compute, designs, whatIfs: wi, ms });
  }
}
