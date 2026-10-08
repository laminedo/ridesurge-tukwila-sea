import { haversineMi } from '../geo';
import type { LatLng } from '../types';
import { generateRegion, nearestPlace, type PlaceRow } from './generate';
import { SEATTLE, SEATTLE_CENTER, SEATTLE_RADIUS_MI } from './seattle';
import type { Region } from './types';

export { SEATTLE };
export type { Region };

/** Where to build the market: the curated Seattle one, or around a point. */
export type AreaSpec = { mode: 'seattle' } | { mode: 'point'; lat: number; lng: number };

/** Stable key for caching: points are rounded so small movements reuse the same region. */
export const areaKey = (spec: AreaSpec) =>
  spec.mode === 'seattle' ? 'seattle' : `point:${spec.lat.toFixed(2)},${spec.lng.toFixed(2)}`;

let places: Promise<readonly PlaceRow[]> | undefined;

/** The bundled gazetteer, loaded on first use (it is a separate chunk of about 100 KB compressed). */
export function loadPlaces(): Promise<readonly PlaceRow[]> {
  places ??= import('../../data/us-places.json').then((module) => module.default as unknown as PlaceRow[]);
  return places;
}

const cache = new Map<string, Region>();

/**
 * The region for an area. A point near Seattle gets the hand-tuned market;
 * anywhere else in the US gets one generated from the bundled data. Throws
 * when the point is too far from any town in the gazetteer.
 */
export async function resolveRegion(spec: AreaSpec): Promise<Region> {
  if (spec.mode === 'seattle' || haversineMi(spec, SEATTLE_CENTER) <= SEATTLE_RADIUS_MI) return SEATTLE;

  const key = areaKey(spec);
  const hit = cache.get(key);
  if (hit) return hit;

  const centre: LatLng = { lat: spec.lat, lng: spec.lng };
  const region = generateRegion(await loadPlaces(), centre);
  if (!region) throw new Error('No towns in the app’s US data are within 60 miles of this location.');
  if (cache.size >= 6) cache.delete(cache.keys().next().value as string);
  cache.set(key, region);
  return region;
}

export interface CityMatch extends LatLng {
  name: string;
  state: string;
}

/** City search for the area picker: prefix matches first, largest places first. */
export async function searchCities(query: string, limit = 6): Promise<CityMatch[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const [namePart, statePart] = q.split(',').map((part) => part.trim());
  const rows = await loadPlaces();
  const matches: { row: PlaceRow; rank: number }[] = [];
  for (const row of rows) {
    if (statePart && !row[1].toLowerCase().startsWith(statePart)) continue;
    const name = row[0].toLowerCase();
    const rank = name.startsWith(namePart) ? 0 : name.includes(` ${namePart}`) ? 1 : -1;
    if (rank >= 0) matches.push({ row, rank });
  }
  // Rows are already ordered by population, and sort is stable.
  return matches
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ row }) => ({ name: row[0], state: row[1], lat: row[2], lng: row[3] }));
}

/** Name of the town a point is in, for labelling the driver's own position. */
export async function describePoint(point: LatLng): Promise<string | null> {
  const place = nearestPlace(await loadPlaces(), point);
  return place && place.miles < 40 ? `${place.name}, ${place.state}` : null;
}
