export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const round1 = (v: number) => Math.round(v * 10) / 10;

export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
