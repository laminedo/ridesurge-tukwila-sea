/**
 * Low-to-high colour ramp: cool blue for a quiet zone, through violet and red,
 * to bright yellow for the hottest. Lightness climbs evenly (OKLab L 0.35 →
 * 0.95), so the order also survives colour-vision deficiency, and every heat
 * mark carries its number or a Low/Medium/High word as well.
 */
const STOPS: readonly (readonly [number, string])[] = [
  [1.0, '#1b3a63'],
  [1.25, '#3f3a8f'],
  [1.5, '#7a2f8a'],
  [1.8, '#b5345f'],
  [2.2, '#dc552c'],
  [2.6, '#f08a1c'],
  [3.0, '#f9c22e'],
  [3.5, '#fdf0a8'],
];

export const HEAT_MIN = STOPS[0][0];
export const HEAT_MAX = STOPS[STOPS.length - 1][0];

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function rgbAt(mult: number): number[] {
  if (mult <= HEAT_MIN) return channels(STOPS[0][1]);
  for (let i = 1; i < STOPS.length; i++) {
    const [hi, hiHex] = STOPS[i];
    if (mult <= hi) {
      const [lo, loHex] = STOPS[i - 1];
      const t = (mult - lo) / (hi - lo);
      const a = channels(loHex);
      const b = channels(hiHex);
      return a.map((v, k) => Math.round(v + (b[k] - v) * t));
    }
  }
  return channels(STOPS[STOPS.length - 1][1]);
}

export function heatColor(mult: number): string {
  const [r, g, b] = rgbAt(mult);
  return `rgb(${r} ${g} ${b})`;
}

/** Text colour that clears contrast on the heat fill for this multiplier. */
export function heatInk(mult: number): string {
  const [r, g, b] = rgbAt(mult).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.19 ? '#0a0e14' : '#f6f8fb';
}

export const HEAT_LEGEND = [1.0, 1.25, 1.5, 1.8, 2.2, 2.6, 3.0, 3.5];

/* ---------- What the colours stand for ---------- */

/** Colour a zone by its surge multiplier, or by how busy it is compared with the busiest zone. */
export type Metric = 'surge' | 'demand';
export type Level = 'Low' | 'Medium' | 'High' | 'Very high';

/** Position on the ramp (as a multiplier-equivalent) for a share of the busiest zone's demand. */
export const demandHeat = (share: number) => HEAT_MIN + Math.min(1, Math.max(0, share)) * (HEAT_MAX - HEAT_MIN);

export function surgeLevel(mult: number): Level {
  if (mult < 1.2) return 'Low';
  if (mult < 1.6) return 'Medium';
  return mult < 2.3 ? 'High' : 'Very high';
}

export function demandLevel(share: number): Level {
  if (share < 0.2) return 'Low';
  if (share < 0.5) return 'Medium';
  return share < 0.8 ? 'High' : 'Very high';
}
