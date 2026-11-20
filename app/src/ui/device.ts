// Device profile for rendering cost (DEVIATIONS M4 performance): phones / low-core machines get a capped
// pixel ratio, a smaller context radius, no hatch pattern and a lower default pitch; reduced motion is honoured.
const w = typeof window !== "undefined" ? window : undefined;
const mq = (q: string) => !!w?.matchMedia?.(q).matches;

export const lowEnd = !!w && (mq("(max-width: 640px)") || mq("(pointer: coarse)") || (navigator.hardwareConcurrency ?? 8) <= 4);
export const reducedMotion = mq("(prefers-reduced-motion: reduce)");

export const DEVICE = {
  /** Map canvas pixel ratio. */
  pixelRatio: w ? (lowEnd ? Math.min(w.devicePixelRatio || 1, 1.5) : w.devicePixelRatio || 1) : 1,
  /** Context buildings shown and checked around the plot (m). */
  contextRadiusM: lowEnd ? 300 : 450,
  hatch: !lowEnd,
  defaultPitch: lowEnd ? 45 : 60,
  /** Camera animation length multiplier (0 = jump). */
  motion: reducedMotion ? 0 : 1,
} as const;
