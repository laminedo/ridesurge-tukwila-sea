import { buildForecast } from './forecast/surge';
import { buildAirportRunFeed } from './sim/departures';
import { buildEventFeed } from './sim/events';
import { buildFlightFeed } from './sim/flights';
import { DAY, pacificOffsetMs } from './time';
import type { Snapshot } from './types';

export { pacificOffsetMs };

/** Everything the app needs for one moment, in a single payload it can cache offline. */
export async function buildSnapshot(at: number): Promise<Snapshot> {
  const offset = pacificOffsetMs(at);
  return {
    generatedAt: at,
    simulated: true,
    flights: buildFlightFeed(at, offset),
    airportRuns: buildAirportRunFeed(at, offset),
    events: buildEventFeed(at, offset),
    forecast: await buildForecast(at, offset),
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

/** Shared GET handler: validate `?at=`, build the payload, never cache it. */
export async function respond<T>(
  request: Request,
  build: (at: number, offset: number) => T | Promise<T>,
): Promise<Response> {
  const resolved = resolveAt(request);
  if ('error' in resolved) {
    return Response.json({ error: resolved.error }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = await build(resolved.at, pacificOffsetMs(resolved.at));
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
