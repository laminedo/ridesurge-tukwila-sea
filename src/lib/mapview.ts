import { haversineMi } from './geo';
import type { LatLng } from './types';

/** [[west, south], [east, north]] in degrees: the order map libraries expect. */
export type Bounds = [[number, number], [number, number]];

/** Smallest box holding every point, or `null` when there are none. */
export function boundsOf(points: readonly LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { lat, lng } of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** The places a driver at `origin` reaches first: everything within `miles`, and never fewer than `min`. */
export function nearbyPlaces<T extends LatLng>(origin: LatLng, places: readonly T[], miles = 7, min = 4): T[] {
  const ranked = places.map((place) => ({ place, miles: haversineMi(origin, place) })).sort((a, b) => a.miles - b.miles);
  const within = ranked.filter((entry) => entry.miles <= miles).length;
  return ranked.slice(0, Math.max(within, Math.min(min, ranked.length))).map((entry) => entry.place);
}

/** A circle of `miles` around a point as a closed ring of [lng, lat] pairs, for a range ring on the map. */
export function ringAround(centre: LatLng, miles: number, points = 72): [number, number][] {
  const dLat = miles / 69.05;
  const dLng = dLat / Math.cos((centre.lat * Math.PI) / 180);
  return Array.from({ length: points + 1 }, (_, i) => {
    const angle = (i / points) * 2 * Math.PI;
    return [centre.lng + dLng * Math.sin(angle), centre.lat + dLat * Math.cos(angle)];
  });
}

/** Position of a point on the Web Mercator map at a zoom level, in CSS pixels (512-pixel world tiles). */
function mercatorPx({ lat, lng }: LatLng, zoom: number): { x: number; y: number } {
  const world = 512 * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * world, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world };
}

/**
 * Which marks have to shrink so that full-size ones never overlap. Marks are
 * taken in priority order; one that would sit within `size` pixels of an
 * earlier full-size mark is returned as crowded. Zooming in spreads them out.
 */
export function crowdedAt<T extends LatLng & { id: string }>(inPriorityOrder: readonly T[], zoom: number, size: number): Set<string> {
  const placed: { x: number; y: number }[] = [];
  const crowded = new Set<string>();
  for (const mark of inPriorityOrder) {
    const at = mercatorPx(mark, zoom);
    if (placed.some((other) => Math.hypot(other.x - at.x, other.y - at.y) < size)) crowded.add(mark.id);
    else placed.push(at);
  }
  return crowded;
}
