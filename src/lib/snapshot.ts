import { buildForecast } from './forecast/surge';
import { SEATTLE } from './regions/seattle';
import { regionInfo, type Region } from './regions/types';
import { buildAirportRunFeed } from './sim/departures';
import { buildEventFeed } from './sim/events';
import { buildFlightFeed } from './sim/flights';
import { DAY, zoneOffsetMs } from './time';
import type { Snapshot } from './types';

/** Everything the app needs for one moment in one region, in a single payload it can cache offline. */
export async function buildSnapshot(at: number, region: Region = SEATTLE): Promise<Snapshot> {
  const offset = zoneOffsetMs(at, region.timeZone);
  return {
    generatedAt: at,
    simulated: true,
    region: regionInfo(region),
    flights: buildFlightFeed(region, at, offset),
    airportRuns: buildAirportRunFeed(region, at, offset),
    events: buildEventFeed(region, at, offset),
    forecast: await buildForecast(region, at, offset),
  };
}

const MAX_SHIFT = 30 * DAY;

/**
 * Resolves the optional `?at=` override used by the simulation clock.
 * Accepts epoch milliseconds or an ISO timestamp within 30 days of now.
 */
export function resolveAt(request: Request): { at: number } | { error: string } {
  // Reading the request first marks the route as dynamic before the clock is touched.
  const raw = new URL(request.url).searchParams.get('at');
  const now = Date.now();
  if (raw === null || raw === '') return { at: now };

  const at = /^\d{13}$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(at)) return { error: '`at` must be epoch milliseconds or an ISO 8601 timestamp.' };
  if (Math.abs(at - now) > MAX_SHIFT) return { error: '`at` must be within 30 days of the current time.' };
  return { at };
}

/**
 * Shared GET handler: validate `?at=`, build the payload, never cache it.
 * The HTTP API serves the curated Seattle market; regions generated around a
 * driver are computed on the device, so a location never has to be sent here.
 */
export async function respond<T>(
  request: Request,
  build: (region: Region, at: number, offset: number) => T | Promise<T>,
): Promise<Response> {
  const resolved = resolveAt(request);
  if ('error' in resolved) {
    return Response.json({ error: resolved.error }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = await build(SEATTLE, resolved.at, zoneOffsetMs(resolved.at, SEATTLE.timeZone));
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
