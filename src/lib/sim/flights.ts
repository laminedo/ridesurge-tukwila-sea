/**
 * Simulated Sea-Tac arrivals feed.
 *
 * Stands in for a live source such as FlightAware AeroAPI or the Port of
 * Seattle arrivals board. The schedule is generated deterministically per
 * local day, so it is stable across requests and rolls forward with the clock.
 * Replace `flightsForDay` with a real fetch and everything downstream (the lag
 * model, wave detection, forecast covariates) keeps working.
 */
import type { Region } from '../regions/types';
import { between, gauss, pick, pickWeighted, seeded, type Rng } from '../rng';
import { HOUR, MIN, dayStart, floorTo, localClock } from '../time';
import type { Flight, FlightBucket, FlightFeed, FlightStatus, FlightWave } from '../types';
import { clamp, lerp, round1 } from '../util';

/** Touchdown → ride request: taxi-in, deplaning, the walk and bag claim. */
export const LAG_MIN = 20;
export const LAG_MAX = 35;
export const FLIGHT_BUCKET_MIN = 5;
const BUCKET = FLIGHT_BUCKET_MIN * MIN;

/** Hourly shape of a day's arrivals (≈600 a day at Sea-Tac). Scaled to each airport's volume. */
const HOURLY_ARRIVALS = [14, 5, 2, 1, 2, 6, 12, 18, 24, 30, 34, 36, 34, 32, 30, 30, 32, 34, 34, 32, 32, 34, 36, 28];

const HOURLY_TOTAL = HOURLY_ARRIVALS.reduce((s, n) => s + n, 0);

/** Airport volume relative to the reference shape. */
const scaleOf = (region: Region) => (region.flights ? region.flights.daily / HOURLY_TOTAL : 0);

export const AIRCRAFT = {
  E75: { name: 'E175', seats: 76, wide: false },
  A220: { name: 'A220-300', seats: 130, wide: false },
  B738: { name: '737-800', seats: 159, wide: false },
  B739: { name: '737-900ER', seats: 178, wide: false },
  B39M: { name: '737 MAX 9', seats: 178, wide: false },
  A321: { name: 'A321neo', seats: 194, wide: false },
  B752: { name: '757-200', seats: 199, wide: false },
  B763: { name: '767-300ER', seats: 216, wide: true },
  A332: { name: 'A330-200', seats: 234, wide: true },
  A339: { name: 'A330-900', seats: 281, wide: true },
  B789: { name: '787-9', seats: 290, wide: true },
  A359: { name: 'A350-900', seats: 306, wide: true },
  B77W: { name: '777-300ER', seats: 368, wide: true },
} as const;
export type AircraftKey = keyof typeof AIRCRAFT;

export type Route = readonly [iata: string, city: string, blockMin: number];

export interface Carrier {
  code: string;
  /** Relative share of the airport's arrivals. */
  weight: number;
  /** Share of passengers ending their trip here rather than connecting. */
  od: number;
  /** Arrivals that clear customs here (pre-cleared Canadian flights do not). */
  intl: boolean;
  fleet: readonly AircraftKey[];
  concourses: readonly string[];
  routes: readonly Route[];
}

export const foreign = (code: string, fleet: AircraftKey, iata: string, city: string, blockMin: number): Carrier => ({
  code,
  weight: 0.28,
  od: 0.93,
  intl: true,
  fleet: [fleet],
  concourses: ['S', 'A'],
  routes: [[iata, city, blockMin]],
});

/** Sea-Tac's carrier mix: an Alaska hub with a Delta focus city and long-haul to Asia and Europe. */
export const SEATTLE_CARRIERS: readonly Carrier[] = [
  {
    code: 'AS', weight: 34, od: 0.62, intl: false, fleet: ['B739', 'B39M', 'B738'], concourses: ['C', 'D', 'N'],
    routes: [
      ['LAX', 'Los Angeles', 165], ['SFO', 'San Francisco', 130], ['SAN', 'San Diego', 170], ['SJC', 'San Jose', 130],
      ['SMF', 'Sacramento', 115], ['SNA', 'Orange County', 165], ['LAS', 'Las Vegas', 150], ['PHX', 'Phoenix', 180],
      ['DEN', 'Denver', 160], ['ORD', 'Chicago', 235], ['DFW', 'Dallas', 235], ['MSP', 'Minneapolis', 200],
      ['JFK', 'New York', 320], ['EWR', 'Newark', 320], ['BOS', 'Boston', 330], ['DCA', 'Washington', 310],
      ['ANC', 'Anchorage', 215], ['FAI', 'Fairbanks', 225], ['JNU', 'Juneau', 150], ['HNL', 'Honolulu', 350],
      ['OGG', 'Maui', 350], ['SLC', 'Salt Lake City', 115], ['AUS', 'Austin', 240], ['BNA', 'Nashville', 260],
    ],
  },
  {
    code: 'AS', weight: 13, od: 0.55, intl: false, fleet: ['E75'], concourses: ['C', 'N'],
    routes: [
      ['PDX', 'Portland', 50], ['GEG', 'Spokane', 60], ['BOI', 'Boise', 85], ['YVR', 'Vancouver', 55],
      ['YYC', 'Calgary', 95], ['YEG', 'Edmonton', 110], ['MSO', 'Missoula', 85], ['BZN', 'Bozeman', 105],
      ['RDM', 'Redmond', 65], ['EUG', 'Eugene', 65], ['PSC', 'Tri-Cities', 55], ['YKM', 'Yakima', 45],
      ['BLI', 'Bellingham', 40], ['ALW', 'Walla Walla', 60], ['PUW', 'Pullman', 65], ['MFR', 'Medford', 80],
    ],
  },
  {
    code: 'AS', weight: 1.2, od: 0.7, intl: true, fleet: ['B789', 'A332'], concourses: ['S'],
    routes: [['NRT', 'Tokyo', 560], ['ICN', 'Seoul', 640], ['FCO', 'Rome', 620], ['LHR', 'London', 560]],
  },
  {
    code: 'DL', weight: 19, od: 0.6, intl: false, fleet: ['A321', 'B739', 'A220', 'B752'], concourses: ['A', 'B'],
    routes: [
      ['ATL', 'Atlanta', 300], ['MSP', 'Minneapolis', 200], ['DTW', 'Detroit', 265], ['SLC', 'Salt Lake City', 115],
      ['JFK', 'New York', 320], ['LAX', 'Los Angeles', 165], ['SFO', 'San Francisco', 130], ['LAS', 'Las Vegas', 150],
      ['PHX', 'Phoenix', 180], ['ANC', 'Anchorage', 215], ['BOS', 'Boston', 330], ['DEN', 'Denver', 160],
      ['SAN', 'San Diego', 170], ['PDX', 'Portland', 50], ['GEG', 'Spokane', 60],
    ],
  },
  {
    code: 'DL', weight: 1.6, od: 0.65, intl: true, fleet: ['A339', 'A359', 'B763'], concourses: ['S'],
    routes: [
      ['ICN', 'Seoul', 640], ['HND', 'Tokyo', 570], ['AMS', 'Amsterdam', 570], ['CDG', 'Paris', 580],
      ['LHR', 'London', 560], ['TPE', 'Taipei', 700],
    ],
  },
  {
    code: 'UA', weight: 5, od: 0.97, intl: false, fleet: ['B739', 'B738', 'A321'], concourses: ['A'],
    routes: [['DEN', 'Denver', 160], ['ORD', 'Chicago', 235], ['SFO', 'San Francisco', 130], ['IAH', 'Houston', 265], ['EWR', 'Newark', 320], ['IAD', 'Washington', 300]],
  },
  {
    code: 'WN', weight: 5, od: 0.95, intl: false, fleet: ['B738'], concourses: ['B'],
    routes: [['OAK', 'Oakland', 125], ['DEN', 'Denver', 160], ['LAS', 'Las Vegas', 150], ['PHX', 'Phoenix', 180], ['SMF', 'Sacramento', 115], ['MDW', 'Chicago', 240], ['BUR', 'Burbank', 155]],
  },
  {
    code: 'AA', weight: 5, od: 0.97, intl: false, fleet: ['A321', 'B738'], concourses: ['D'],
    routes: [['DFW', 'Dallas', 235], ['CLT', 'Charlotte', 310], ['ORD', 'Chicago', 235], ['PHX', 'Phoenix', 180], ['PHL', 'Philadelphia', 320], ['MIA', 'Miami', 345]],
  },
  { code: 'B6', weight: 1.2, od: 0.97, intl: false, fleet: ['A321'], concourses: ['A'], routes: [['JFK', 'New York', 320], ['BOS', 'Boston', 330]] },
  { code: 'F9', weight: 1.5, od: 0.98, intl: false, fleet: ['A321'], concourses: ['B'], routes: [['DEN', 'Denver', 160], ['LAS', 'Las Vegas', 150], ['PHX', 'Phoenix', 180]] },
  { code: 'SY', weight: 0.6, od: 0.98, intl: false, fleet: ['B738'], concourses: ['B'], routes: [['MSP', 'Minneapolis', 200]] },
  { code: 'AC', weight: 1.5, od: 0.9, intl: false, fleet: ['A220', 'E75'], concourses: ['A'], routes: [['YVR', 'Vancouver', 55], ['YYZ', 'Toronto', 290]] },
  { code: 'WS', weight: 0.8, od: 0.9, intl: false, fleet: ['B738'], concourses: ['A'], routes: [['YYC', 'Calgary', 95]] },
  { code: 'HA', weight: 1.2, od: 0.9, intl: false, fleet: ['A332'], concourses: ['N'], routes: [['HNL', 'Honolulu', 350], ['OGG', 'Maui', 350]] },
  foreign('BA', 'B789', 'LHR', 'London', 560),
  foreign('LH', 'A359', 'FRA', 'Frankfurt', 600),
  foreign('KE', 'B77W', 'ICN', 'Seoul', 640),
  foreign('NH', 'B789', 'NRT', 'Tokyo', 560),
  foreign('JL', 'B789', 'NRT', 'Tokyo', 560),
  foreign('EK', 'B77W', 'DXB', 'Dubai', 840),
  foreign('QR', 'A359', 'DOH', 'Doha', 830),
  foreign('FI', 'B752', 'KEF', 'Reykjavík', 440),
  foreign('EI', 'A332', 'DUB', 'Dublin', 550),
  foreign('TK', 'B789', 'IST', 'Istanbul', 720),
  foreign('BR', 'B77W', 'TPE', 'Taipei', 700),
  foreign('CI', 'A359', 'TPE', 'Taipei', 700),
  foreign('SQ', 'A359', 'SIN', 'Singapore', 930),
  foreign('HU', 'B789', 'PEK', 'Beijing', 660),
  foreign('DE', 'A339', 'FRA', 'Frankfurt', 600),
  foreign('AY', 'A339', 'HEL', 'Helsinki', 570),
  foreign('VS', 'B789', 'LHR', 'London', 560),
  foreign('AM', 'B738', 'MEX', 'Mexico City', 330),
];

type RawFlight = Omit<Flight, 'status'> & { blockMin: number; taxiMin: number };


/** Share of terminating passengers who request a ride, by local hour. */
export function rideshareShare(hour: number): number {
  // Late at night transit thins out and fewer people get picked up by family.
  if (hour >= 22 || hour < 4) return 0.21;
  if (hour < 5) return lerp(0.21, 0.17, hour - 4);
  if (hour < 6.5) return 0.17;
  if (hour < 7.5) return lerp(0.17, 0.14, hour - 6.5);
  if (hour < 21) return 0.14;
  return lerp(0.14, 0.21, hour - 21);
}

function sampleDelay(r: Rng): number {
  const u = r();
  if (u < 0.07) return -between(r, 6, 20);
  if (u < 0.72) return between(r, -5, 10);
  if (u < 0.9) return between(r, 10, 35);
  if (u < 0.98) return between(r, 35, 90);
  return between(r, 90, 170);
}

const dayCache = new Map<string, RawFlight[]>();

/** Every arrival scheduled on a local day, sorted by touchdown. */
export function flightsForDay(region: Region, day: number, offset: number): RawFlight[] {
  const profile = region.flights;
  if (!profile) return [];
  const key = `${region.id}:${day}:${offset}`;
  const hit = dayCache.get(key);
  if (hit) return hit;
  const scale = scaleOf(region);

  const start = dayStart(day, offset);
  const { dow } = localClock(start, offset);
  const volume = dow === 6 ? 0.9 : dow === 2 || dow === 3 ? 0.95 : 1;
  const busyDay = dow === 0 || dow === 4 || dow === 5;
  const out: RawFlight[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const r = seeded('flights', region.id, day, hour);
    const expected = HOURLY_ARRIVALS[hour] * scale * volume * between(r, 0.9, 1.1);
    // Round at random so a small airport still gets its handful of flights.
    const count = Math.floor(expected) + (r() < expected % 1 ? 1 : 0);
    // Hub schedules cluster into banks; two loose centres an hour gives realistic waves.
    const banks = [r() * 60, r() * 60];

    for (let i = 0; i < count; i++) {
      const minute = r() < 0.45 ? clamp(banks[i % 2] + gauss(r) * 9, 0, 59.9) : r() * 60;
      const carrier = pickWeighted(r, profile.carriers, (c) => c.weight);
      const [origin, originCity, blockMin] = pick(r, carrier.routes);
      const aircraft = AIRCRAFT[pick(r, carrier.fleet)];
      const concourse = pick(r, carrier.concourses);

      const scheduled = start + hour * HOUR + minute * MIN;
      const delayMin = Math.round(sampleDelay(r));
      const touchdown = scheduled + delayMin * MIN;
      const loadFactor = Math.min(0.98, between(r, 0.76, 0.94) + (busyDay ? 0.03 : 0));
      const pax = Math.round(aircraft.seats * loadFactor);

      const share = rideshareShare(localClock(touchdown, offset).hour) + (carrier.intl ? 0.03 : 0);
      const partySize = carrier.intl ? 1.7 : 1.45;
      const requests = (pax * carrier.od * share) / partySize;

      // Regional jets empty fast; widebodies and customs push the lag out.
      const baseLag = carrier.intl ? 32.5 : aircraft.wide ? 28 : aircraft.seats < 100 ? 21.5 : 24;
      const satellite = profile.satellites.includes(concourse) ? 1.5 : 0;
      const lagMin = clamp(baseLag + satellite + gauss(r) * 1.2, LAG_MIN + 1, LAG_MAX - 1);

      out.push({
        id: `${day}-${hour}-${i}`,
        flightNo: `${carrier.code}${100 + Math.floor(r() * 2800)}`,
        origin,
        originCity,
        aircraft: aircraft.name,
        international: carrier.intl,
        widebody: aircraft.wide,
        concourse,
        scheduled,
        touchdown,
        delayMin,
        pax,
        requests,
        lagMin: round1(lagMin),
        curbStart: touchdown + LAG_MIN * MIN,
        curbEnd: touchdown + LAG_MAX * MIN,
        blockMin,
        taxiMin: between(r, 5, 12),
      });
    }
  }

  out.sort((a, b) => a.touchdown - b.touchdown);
  if (dayCache.size >= 40) dayCache.delete(dayCache.keys().next().value as string);
  dayCache.set(key, out);
  return out;
}

/** Arrivals touching down in [from, to), across day boundaries. */
function flightsBetween(region: Region, from: number, to: number, offset: number): RawFlight[] {
  // A badly delayed flight can land up to ~3 h after its scheduled day ends.
  const firstDay = localClock(from - 3 * HOUR, offset).day;
  const lastDay = localClock(to + HOUR, offset).day;
  const out: RawFlight[] = [];
  for (let day = firstDay; day <= lastDay; day++) {
    for (const f of flightsForDay(region, day, offset)) {
      if (f.touchdown >= from && f.touchdown < to) out.push(f);
    }
  }
  return out.sort((a, b) => a.touchdown - b.touchdown);
}

/** CDF of the touchdown→request lag: triangular on [20, 35] min around `mode`. */
export function lagCdf(x: number, mode: number): number {
  if (x <= LAG_MIN) return 0;
  if (x >= LAG_MAX) return 1;
  const span = LAG_MAX - LAG_MIN;
  return x <= mode
    ? (x - LAG_MIN) ** 2 / (span * (mode - LAG_MIN))
    : 1 - (LAG_MAX - x) ** 2 / (span * (LAG_MAX - mode));
}

/** Spread one flight's ride requests across time buckets using the lag kernel. */
export function spreadCurb(
  touchdown: number,
  requests: number,
  lagMode: number,
  bucketMs: number,
  visit: (bucketStart: number, amount: number) => void,
): void {
  const end = touchdown + LAG_MAX * MIN;
  for (let t = floorTo(touchdown + LAG_MIN * MIN, bucketMs); t < end; t += bucketMs) {
    const share = lagCdf((t + bucketMs - touchdown) / MIN, lagMode) - lagCdf((t - touchdown) / MIN, lagMode);
    if (share > 0) visit(t, requests * share);
  }
}

/** Ride requests at the airport curb per step over a window (forecast covariate). */
export function flightCurbSeries(region: Region, start: number, stepMs: number, steps: number, offset: number): number[] {
  const series = new Array<number>(steps).fill(0);
  const end = start + steps * stepMs;
  for (const f of flightsBetween(region, start - LAG_MAX * MIN, end, offset)) {
    spreadCurb(f.touchdown, f.requests, f.lagMin, stepMs, (t, amount) => {
      const i = Math.round((t - start) / stepMs);
      if (i >= 0 && i < steps) series[i] += amount;
    });
  }
  return series;
}

const wrapHour = (hour: number) => ((hour % 24) + 24) % 24;

function arrivalsPerHour(hour: number): number {
  // HOURLY_ARRIVALS[i] describes the hour centred on i + 0.5.
  const h = wrapHour(hour - 0.5);
  const i = Math.floor(h);
  return lerp(HOURLY_ARRIVALS[i], HOURLY_ARRIVALS[(i + 1) % 24], h - i);
}

const rideBaseCache = new Map<string, number>();

/**
 * Riders per arrival before the time-of-day rideshare share is applied,
 * averaged over the airport's own carrier and fleet mix. Measured from two
 * sample days so it stays right for any region.
 */
function rideBasePerFlight(region: Region): number {
  const hit = rideBaseCache.get(region.id);
  if (hit !== undefined) return hit;
  let sum = 0;
  let count = 0;
  for (const day of [20000, 20003]) {
    for (const f of flightsForDay(region, day, 0)) {
      sum += f.requests / rideshareShare(localClock(f.touchdown, 0).hour);
      count++;
    }
  }
  const base = count ? sum / count : 0;
  rideBaseCache.set(region.id, base);
  return base;
}

/**
 * Curb demand the airport driver queue is used to at this hour, per step.
 * Supply at the airport tracks this pattern, so surge appears when a bank of
 * arrivals (or a pile-up of delays) lands well above it.
 */
export function typicalCurbDemand(region: Region, hour: number, stepMin: number): number {
  if (!region.flights) return 0;
  const landedAt = hour - 27 / 60;
  const requestsPerFlight = rideBasePerFlight(region) * rideshareShare(wrapHour(landedAt));
  return (arrivalsPerHour(landedAt) * scaleOf(region) * requestsPerFlight * stepMin) / 60;
}

function statusOf(f: RawFlight, now: number): FlightStatus {
  if (now >= f.touchdown + f.taxiMin * MIN) return 'at_gate';
  if (now >= f.touchdown) return 'landed';
  return now >= f.touchdown - f.blockMin * MIN ? 'enroute' : 'scheduled';
}

function toFlight(f: RawFlight, now: number): Flight {
  return {
    id: f.id,
    flightNo: f.flightNo,
    origin: f.origin,
    originCity: f.originCity,
    aircraft: f.aircraft,
    international: f.international,
    widebody: f.widebody,
    concourse: f.concourse,
    scheduled: f.scheduled,
    touchdown: f.touchdown,
    delayMin: f.delayMin,
    pax: f.pax,
    requests: round1(f.requests),
    lagMin: f.lagMin,
    curbStart: f.curbStart,
    curbEnd: f.curbEnd,
    status: statusOf(f, now),
  };
}

function detectWaves(buckets: FlightBucket[], flights: RawFlight[], now: number, scale: number): FlightWave[] {
  const mean = buckets.reduce((s, b) => s + b.curb, 0) / Math.max(1, buckets.length);
  // A wave has to stand out, and at a small airport it also has to be worth a trip.
  const threshold = Math.max(3 + 7 * Math.min(1, scale), mean * 1.2);
  const waves: FlightWave[] = [];
  let run: FlightBucket[] = [];

  const close = () => {
    if (run.length >= 2) {
      const start = run[0].t;
      const end = run[run.length - 1].t + BUCKET;
      const peak = run.reduce((best, b) => (b.curb > best.curb ? b : best), run[0]);
      const feeders = flights.filter((f) => f.curbStart < end && f.curbEnd > start);
      if (end > now) {
        waves.push({
          id: `wave-${start}`,
          start,
          end,
          peak: peak.t,
          peakRate: round1(peak.curb),
          requests: Math.round(run.reduce((s, b) => s + b.curb, 0)),
          flights: feeders.length,
          pax: feeders.reduce((s, f) => s + f.pax, 0),
          international: feeders.filter((f) => f.international).length,
        });
      }
    }
    run = [];
  };

  for (const bucket of buckets) {
    if (bucket.curb >= threshold) run.push(bucket);
    else close();
  }
  close();
  return waves;
}

/** Buckets shown before "now" (45 min) and the look-ahead (3 h). */
const BUCKETS_BACK = 9;
const BUCKETS_AHEAD = 36;

export function buildFlightFeed(region: Region, now: number, offset: number): FlightFeed {
  const windowStart = floorTo(now, BUCKET) - BUCKETS_BACK * BUCKET;
  const count = BUCKETS_BACK + BUCKETS_AHEAD;
  const windowEnd = windowStart + count * BUCKET;
  const flights = flightsBetween(region, windowStart - LAG_MAX * MIN, windowEnd, offset);

  const buckets: FlightBucket[] = Array.from({ length: count }, (_, i) => ({
    t: windowStart + i * BUCKET,
    landing: 0,
    curb: 0,
    pax: 0,
    flights: 0,
  }));
  const at = (t: number) => buckets[Math.floor((t - windowStart) / BUCKET)];

  for (const f of flights) {
    const landed = f.touchdown >= windowStart ? at(f.touchdown) : undefined;
    if (landed) {
      landed.landing += f.requests;
      landed.pax += f.pax;
      landed.flights += 1;
    }
    spreadCurb(f.touchdown, f.requests, f.lagMin, BUCKET, (t, amount) => {
      const bucket = t >= windowStart && t < windowEnd ? at(t) : undefined;
      if (bucket) bucket.curb += amount;
    });
  }
  for (const b of buckets) {
    b.landing = round1(b.landing);
    b.curb = round1(b.curb);
  }

  const arrivals = flights
    .filter((f) => f.curbEnd > now && f.touchdown < now + 150 * MIN)
    .map((f) => toFlight(f, now));

  return {
    generatedAt: now,
    source: 'simulated',
    bucketMin: FLIGHT_BUCKET_MIN,
    lag: { minMin: LAG_MIN, maxMin: LAG_MAX },
    buckets,
    waves: detectWaves(buckets, flights, now, scaleOf(region)),
    arrivals,
  };
}
