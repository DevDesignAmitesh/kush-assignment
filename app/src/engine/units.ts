// Area units people know (DESIGN_DIRECTION §6.2). Pure; tested. Conversions are definitions, not rules:
// 1 rai = 1,600 m², 1 ngan = 400 m², 1 square wah = 4 m², 1 m² = 10.764 sq ft.
export type AreaUnit = "m2" | "sqft" | "rai";

export const M2_PER_RAI = 1600;
export const M2_PER_NGAN = 400;
export const M2_PER_WAH = 4;
export const SQFT_PER_M2 = 10.764;

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Round to about 3 significant figures for Simple mode ("~15,600"). */
export function roughly(n: number): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(n))) - 2));
  return Math.round(n / p) * p;
}

/** Split m² into rai-ngan-wah (wah rounded to whole square wah). */
export function toRaiNganWah(m2: number): { rai: number; ngan: number; wah: number } {
  let wahTotal = Math.round(Math.max(0, m2) / M2_PER_WAH);
  const rai = Math.floor(wahTotal / (M2_PER_RAI / M2_PER_WAH));
  wahTotal -= rai * (M2_PER_RAI / M2_PER_WAH);
  const ngan = Math.floor(wahTotal / (M2_PER_NGAN / M2_PER_WAH));
  wahTotal -= ngan * (M2_PER_NGAN / M2_PER_WAH);
  return { rai, ngan, wah: wahTotal };
}

/** Format an area in the chosen unit. `round` = Simple-mode rounding (≈ 3 significant figures). */
export function formatArea(m2: number, unit: AreaUnit, opts: { round?: boolean } = {}): string {
  const r = (x: number) => (opts.round ? roughly(x) : x);
  if (unit === "sqft") return `${nf0.format(r(m2 * SQFT_PER_M2))} sq ft`;
  if (unit === "rai") {
    const { rai, ngan, wah } = toRaiNganWah(m2);
    const parts = [rai ? `${rai} rai` : "", ngan ? `${ngan} ngan` : "", wah || (!rai && !ngan) ? `${wah} sq wah` : ""].filter(Boolean);
    return parts.join(" ");
  }
  return `${nf0.format(r(m2))} m²`;
}
