/**
 * Simulated rides from home to the airport.
 *
 * The mirror image of the arrivals feed: every departure pulls riders out of
 * neighbourhoods and hotels a couple of hours before it leaves. These are the
 * long, pre-dawn fares drivers plan a morning around. A live build would read
 * the departures schedule from the same flight source as arrivals.
 */
import type { Region } from '../regions/types';
import { between, pick, seeded } from '../rng';
import { HOUR, MIN, dayStart, floorTo, localClock } from '../time';
import type { AirportRunFeed, ZoneId } from '../types';
import { lerp, round1 } from '../util';
import { rideshareShare } from './flights';

/** Riders request a ride this long before departure: later for short hops, earlier for long-haul. */
export const LEAD_MIN = 90;
export const LEAD_MAX = 170;
const LEAD_MODE = 125;

/** Hourly shape of a day's departures; the 6–9 AM bank dominates. Scaled to each airport's volume. */
const HOURLY_DEPARTURES = [2, 1, 0, 0, 1, 14, 38, 40, 36, 32, 32, 34, 36, 34, 30, 28, 28, 30, 30, 26, 22, 24, 28, 18];
const HOURLY_TOTAL = HOURLY_DEPARTURES.reduce((s, n) => s + n, 0);
const SEATS = [76, 130, 159, 178, 178, 194, 290] as const;
const PARTY_SIZE = 1.45;
/** Average passengers per departure for the fleet mix above. */
const MEAN_PAX = 150;

/** Departures leave about as often as arrivals land. */
const scaleOf = (region: Region) => (region.flights ? region.flights.daily / HOURLY_TOTAL : 0);

const shareCache = new Map<string, Record<ZoneId, number>>();

/**
 * Share of the region's airport-bound requests that start in a zone. Hotel
 * districts and dense neighbourhoods lead; nobody hails a ride to the airport
 * from the airport itself.
 */
export function originShare(region: Region, zone: ZoneId): number {
  let shares = shareCache.get(region.id);
  if (!shares) {
    const total = Object.values(region.airportOrigin).reduce((s, w) => s + w, 0) || 1;
    shares = Object.fromEntries(Object.entries(region.airportOrigin).map(([id, w]) => [id, w / total]));
    if (shareCache.size >= 12) shareCache.delete(shareCache.keys().next().value as string);
    shareCache.set(region.id, shares);
  }
  return shares[zone] ?? 0;
}

interface Departure {
  t: number;
  pax: number;
  /** Ride requests this departure generates across the region. */
  requests: number;
}

const dayCache = new Map<string, Departure[]>();

export function departuresForDay(region: Region, day: number, offset: number): Departure[] {
  if (!region.flights) return [];
  const key = `${region.id}:${day}:${offset}`;
  const hit = dayCache.get(key);
  if (hit) return hit;

  const scale = scaleOf(region);
  const start = dayStart(day, offset);
  const out: Departure[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const r = seeded('departures', region.id, day, hour);
    const expected = HOURLY_DEPARTURES[hour] * scale * between(r, 0.9, 1.1);
    // Round at random so a small airport still gets its handful of flights.
    const count = Math.floor(expected) + (r() < expected % 1 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const t = start + hour * HOUR + r() * HOUR;
      const pax = Math.round(pick(r, SEATS) * between(r, 0.8, 0.95));
      // The share is judged at the hour the rider leaves home, not the hour of the flight.
      const share = rideshareShare(localClock(t - LEAD_MODE * MIN, offset).hour);
      out.push({ t, pax, requests: (pax * region.flights.localShare * share) / PARTY_SIZE });
    }
  }

  out.sort((a, b) => a.t - b.t);
  if (dayCache.size >= 40) dayCache.delete(dayCache.keys().next().value as string);
  dayCache.set(key, out);
  return out;
}

/** CDF of how long before departure a rider requests: triangular on [90, 170] minutes. */
function leadCdf(x: number): number {
  if (x <= LEAD_MIN) return 0;
  if (x >= LEAD_MAX) return 1;
  const span = LEAD_MAX - LEAD_MIN;
  return x <= LEAD_MODE
    ? (x - LEAD_MIN) ** 2 / (span * (LEAD_MODE - LEAD_MIN))
    : 1 - (LEAD_MAX - x) ** 2 / (span * (LEAD_MAX - LEAD_MODE));
}

/** Region-wide airport-bound ride requests per step over a window. */
export function airportRunTotals(region: Region, start: number, stepMs: number, steps: number, offset: number): number[] {
  const series = new Array<number>(steps).fill(0);
  if (!region.flights) return series;
  const end = start + steps * stepMs;
  const firstDay = localClock(start, offset).day;
  const lastDay = localClock(end + LEAD_MAX * MIN, offset).day;

  for (let day = firstDay; day <= lastDay; day++) {
    for (const d of departuresForDay(region, day, offset)) {
      const opens = d.t - LEAD_MAX * MIN;
      const closes = d.t - LEAD_MIN * MIN;
      if (closes <= start || opens >= end) continue;
      for (let t = floorTo(opens, stepMs); t < closes; t += stepMs) {
        const i = Math.round((t - start) / stepMs);
        if (i < 0 || i >= steps) continue;
        // Minutes before departure at the two edges of this bucket.
        const share = leadCdf((d.t - t) / MIN) - leadCdf((d.t - t - stepMs) / MIN);
        if (share > 0) series[i] += d.requests * share;
      }
    }
  }
  return series;
}

function departuresPerHour(hour: number): number {
  const h = (((hour - 0.5) % 24) + 24) % 24;
  const i = Math.floor(h);
  return lerp(HOURLY_DEPARTURES[i], HOURLY_DEPARTURES[(i + 1) % 24], h - i);
}

/** Region-wide airport-bound requests drivers are used to at this hour, per step. */
export function typicalAirportRuns(region: Region, hour: number, stepMin: number): number {
  if (!region.flights) return 0;
  const flightHour = hour + LEAD_MODE / 60;
  const perFlight = (MEAN_PAX * region.flights.localShare * rideshareShare(((hour % 24) + 24) % 24)) / PARTY_SIZE;
  return (departuresPerHour(flightHour) * scaleOf(region) * perFlight * stepMin) / 60;
}

const STEP = 15 * MIN;
const STEPS = 12;

export function buildAirportRunFeed(region: Region, now: number, offset: number): AirportRunFeed {
  const start = floorTo(now, STEP);
  const total = airportRunTotals(region, start, STEP, STEPS, offset);

  // The departure bank those riders are heading for.
  const from = start + LEAD_MIN * MIN;
  const to = start + STEPS * STEP + LEAD_MAX * MIN;
  let flights = 0;
  let pax = 0;
  for (let day = localClock(from, offset).day; day <= localClock(to, offset).day; day++) {
    for (const d of departuresForDay(region, day, offset)) {
      if (d.t >= from && d.t < to) {
        flights += 1;
        pax += d.pax;
      }
    }
  }

  return {
    generatedAt: now,
    source: 'simulated',
    stepMin: 15,
    lead: { minMin: LEAD_MIN, maxMin: LEAD_MAX },
    steps: Array.from({ length: STEPS }, (_, i) => start + i * STEP),
    total: total.map(round1),
    zones: region.zones
      .filter((z) => originShare(region, z.id) > 0)
      .map((z) => ({ zoneId: z.id, requests: total.map((v) => round1(v * originShare(region, z.id))) })),
    departing: { from, to, flights, pax },
  };
}
