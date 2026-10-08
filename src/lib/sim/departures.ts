/**
 * Simulated rides from home to the airport.
 *
 * The mirror image of the arrivals feed: every Sea-Tac departure pulls riders
 * out of neighbourhoods and hotels a couple of hours before it leaves. These
 * are the long, pre-dawn fares drivers plan a morning around. A live build
 * would read the departures schedule from the same flight source as arrivals.
 */
import { between, pick, seeded } from '../rng';
import { HOUR, MIN, dayStart, floorTo, localClock } from '../time';
import type { AirportRunFeed, ZoneId } from '../types';
import { lerp, round1 } from '../util';
import { ZONES } from '../zones';
import { rideshareShare } from './flights';

/** Riders request a ride this long before departure: later for short hops, earlier for long-haul. */
export const LEAD_MIN = 90;
export const LEAD_MAX = 170;
const LEAD_MODE = 125;

/** Scheduled departures per local hour (≈560 a day): the 6–9 AM bank dominates. */
const HOURLY_DEPARTURES = [2, 1, 0, 0, 1, 14, 38, 40, 36, 32, 32, 34, 36, 34, 30, 28, 28, 30, 30, 26, 22, 24, 28, 18];
const SEATS = [76, 130, 159, 178, 178, 194, 290] as const;
/** Share of passengers starting their trip in the Seattle area rather than connecting. */
const LOCAL_SHARE = 0.65;
const PARTY_SIZE = 1.45;
/** Average passengers per departure for the fleet mix above. */
const MEAN_PAX = 150;

/**
 * Where airport-bound riders start, as a share of the region. Hotel districts
 * and dense neighbourhoods lead. Nobody hails a ride to the airport from the
 * airport, and the terminal hotels run their own shuttles.
 */
const ORIGIN_WEIGHT: Record<ZoneId, number> = {
  SEA: 0, TUK: 5, REN: 4, KNT: 3, SODO: 1, DTN: 16, CAP: 7, SLU: 7, LQA: 5, UDX: 5, BEL: 10,
  BAL: 5, FRE: 4, NGT: 4, AUR: 2, SHO: 3, WSE: 4, BUR: 2, FDW: 3, KRK: 5, RDM: 5,
};
const TOTAL_WEIGHT = Object.values(ORIGIN_WEIGHT).reduce((s, w) => s + w, 0);

/** Share of the region's airport-bound requests that start in a zone. */
export const originShare = (zone: ZoneId) => ORIGIN_WEIGHT[zone] / TOTAL_WEIGHT;

interface Departure {
  t: number;
  pax: number;
  /** Ride requests this departure generates across the region. */
  requests: number;
}

const dayCache = new Map<string, Departure[]>();

export function departuresForDay(day: number, offset: number): Departure[] {
  const key = `${day}:${offset}`;
  const hit = dayCache.get(key);
  if (hit) return hit;

  const start = dayStart(day, offset);
  const out: Departure[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const r = seeded('departures', day, hour);
    const count = Math.round(HOURLY_DEPARTURES[hour] * between(r, 0.9, 1.1));
    for (let i = 0; i < count; i++) {
      const t = start + hour * HOUR + r() * HOUR;
      const pax = Math.round(pick(r, SEATS) * between(r, 0.8, 0.95));
      // The share is judged at the hour the rider leaves home, not the hour of the flight.
      const share = rideshareShare(localClock(t - LEAD_MODE * MIN, offset).hour);
      out.push({ t, pax, requests: (pax * LOCAL_SHARE * share) / PARTY_SIZE });
    }
  }

  out.sort((a, b) => a.t - b.t);
  if (dayCache.size >= 24) dayCache.delete(dayCache.keys().next().value as string);
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
export function airportRunTotals(start: number, stepMs: number, steps: number, offset: number): number[] {
  const series = new Array<number>(steps).fill(0);
  const end = start + steps * stepMs;
  const firstDay = localClock(start, offset).day;
  const lastDay = localClock(end + LEAD_MAX * MIN, offset).day;

  for (let day = firstDay; day <= lastDay; day++) {
    for (const d of departuresForDay(day, offset)) {
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
export function typicalAirportRuns(hour: number, stepMin: number): number {
  const flightHour = hour + LEAD_MODE / 60;
  const perFlight = (MEAN_PAX * LOCAL_SHARE * rideshareShare(((hour % 24) + 24) % 24)) / PARTY_SIZE;
  return (departuresPerHour(flightHour) * perFlight * stepMin) / 60;
}

const STEP = 15 * MIN;
const STEPS = 12;

export function buildAirportRunFeed(now: number, offset: number): AirportRunFeed {
  const start = floorTo(now, STEP);
  const total = airportRunTotals(start, STEP, STEPS, offset);

  // The departure bank those riders are heading for.
  const from = start + LEAD_MIN * MIN;
  const to = start + STEPS * STEP + LEAD_MAX * MIN;
  let flights = 0;
  let pax = 0;
  for (let day = localClock(from, offset).day; day <= localClock(to, offset).day; day++) {
    for (const d of departuresForDay(day, offset)) {
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
    zones: ZONES.filter((z) => ORIGIN_WEIGHT[z.id] > 0).map((z) => ({
      zoneId: z.id,
      requests: total.map((v) => round1(v * originShare(z.id))),
    })),
    departing: { from, to, flights, pax },
  };
}
