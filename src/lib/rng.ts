/**
 * Deterministic randomness for the simulated feeds. Everything is seeded from
 * stable keys (day, hour, venue…) so every request for the same moment returns
 * the same world, and the world evolves consistently as the clock moves.
 */

export type Rng = () => number;

export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seeded = (...parts: (string | number)[]): Rng => mulberry32(hash32(parts.join('|')));

export const between = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);

export function gauss(r: Rng): number {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(r() * items.length))];
}

export function pickWeighted<T>(r: Rng, items: readonly T[], weight: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += weight(item);
  let roll = r() * total;
  for (const item of items) {
    roll -= weight(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** Stable noise in [-1, 1] for a key, triangular around 0. */
export function unitNoise(key: string): number {
  const h = hash32(key);
  return ((h & 0xffff) + (h >>> 16)) / 0xffff - 1;
}
