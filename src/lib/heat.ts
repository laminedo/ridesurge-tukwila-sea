/**
 * Surge heat ramp. Lightness climbs monotonically (OKLab L 0.25 → 0.95) so a
 * calm zone recedes into the dark surface and a hot one glows, and the order
 * survives colour-vision deficiency. Every heat mark also carries its number.
 */
const STOPS: readonly (readonly [number, string])[] = [
  [1.0, '#18222f'],
  [1.25, '#3b2a52'],
  [1.5, '#6d2a66'],
  [1.8, '#a8324f'],
  [2.2, '#d9532b'],
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
  if (luminance > 0.19) return '#0a0e14';
  return mult < 1.15 ? '#8e9cb1' : '#f6f8fb';
}

export const HEAT_LEGEND = [1.0, 1.25, 1.5, 1.8, 2.2, 2.6, 3.0, 3.5];
