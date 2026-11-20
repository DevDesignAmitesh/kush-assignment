// Opt-in performance log (?perf=1), also in production builds, so drag / compute timings can be measured
// in a real browser (DEVIATIONS M4 performance). Holds the last 500 entries on window.__plotwisePerf.
export interface PerfEntry {
  kind: string;
  ms: number;
  t: number;
}

export const perfOn = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf");

export function perfMark(kind: string, ms: number) {
  if (!perfOn) return;
  const w = window as unknown as { __plotwisePerf?: PerfEntry[] };
  const log = (w.__plotwisePerf ??= []);
  log.push({ kind, ms, t: performance.now() });
  if (log.length > 500) log.shift();
}

/** Run fn and log its duration under `kind` (no-op cost when ?perf is off). */
export function timed<T>(kind: string, fn: () => T): T {
  if (!perfOn) return fn();
  const t = performance.now();
  const r = fn();
  perfMark(kind, performance.now() - t);
  return r;
}
