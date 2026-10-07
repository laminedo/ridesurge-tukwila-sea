/**
 * Simulated venue and stadium schedule with an egress model.
 *
 * Stands in for a schedule source such as Ticketmaster Discovery, team feeds
 * and the Port of Seattle cruise calendar. Fixtures are drawn per local day
 * from each venue's real programming pattern (season, weekday, start time,
 * crowd size); the specific matchups are invented. Replace `eventsForDay`
 * with a real fetch to go live.
 */
import { between, gauss, pick, seeded } from '../rng';
import { HOUR, MIN, dayStart, floorTo, localClock, localDate } from '../time';
import type { EventFeed, EventKind, EventStatus, VenueEvent, ZoneId } from '../types';
import { clamp } from '../util';

export const EVENT_BUCKET_MIN = 5;
const BUCKET = EVENT_BUCKET_MIN * MIN;

interface Venue {
  name: string;
  zoneId: ZoneId;
  capacity: number;
  spill: Partial<Record<ZoneId, number>>;
  spot: string;
}

const VENUES = {
  lumen: { name: 'Lumen Field', zoneId: 'SODO', capacity: 68740, spill: { SODO: 0.62, DTN: 0.28, CAP: 0.1 }, spot: 'sodo-holgate' },
  tmobile: { name: 'T-Mobile Park', zoneId: 'SODO', capacity: 47929, spill: { SODO: 0.7, DTN: 0.22, CAP: 0.08 }, spot: 'sodo-holgate' },
  wamu: { name: 'WaMu Theater', zoneId: 'SODO', capacity: 7200, spill: { SODO: 0.75, DTN: 0.25 }, spot: 'sodo-station' },
  showboxSodo: { name: 'Showbox SoDo', zoneId: 'SODO', capacity: 1800, spill: { SODO: 0.8, DTN: 0.2 }, spot: 'sodo-holgate' },
  cpa: { name: 'Climate Pledge Arena', zoneId: 'LQA', capacity: 17151, spill: { LQA: 0.68, SLU: 0.14, DTN: 0.18 }, spot: 'lqa-republican' },
  mccaw: { name: 'McCaw Hall', zoneId: 'LQA', capacity: 2890, spill: { LQA: 0.8, SLU: 0.1, DTN: 0.1 }, spot: 'lqa-5th' },
  pier91: { name: 'Pier 91 · Smith Cove', zoneId: 'LQA', capacity: 9000, spill: { LQA: 0.85, DTN: 0.15 }, spot: 'lqa-pier91' },
  pier66: { name: 'Pier 66 · Bell Street', zoneId: 'DTN', capacity: 4500, spill: { DTN: 0.9, LQA: 0.1 }, spot: 'dtn-belltown' },
  paramount: { name: 'Paramount Theatre', zoneId: 'DTN', capacity: 2807, spill: { DTN: 0.8, CAP: 0.12, SLU: 0.08 }, spot: 'dtn-convention' },
  benaroya: { name: 'Benaroya Hall', zoneId: 'DTN', capacity: 2500, spill: { DTN: 0.9, CAP: 0.1 }, spot: 'dtn-belltown' },
  convention: { name: 'Seattle Convention Center', zoneId: 'DTN', capacity: 10000, spill: { DTN: 0.8, CAP: 0.1, SLU: 0.1 }, spot: 'dtn-convention' },
  husky: { name: 'Husky Stadium', zoneId: 'UDX', capacity: 70083, spill: { UDX: 0.8, CAP: 0.1, SLU: 0.1 }, spot: 'udx-montlake' },
  neptune: { name: 'Neptune Theatre', zoneId: 'UDX', capacity: 1000, spill: { UDX: 1 }, spot: 'udx-45th' },
  showare: { name: 'accesso ShoWare Center', zoneId: 'KNT', capacity: 6150, spill: { KNT: 1 }, spot: 'knt-showare' },
  starfire: { name: 'Starfire Sports', zoneId: 'TUK', capacity: 4500, spill: { TUK: 0.85, REN: 0.15 }, spot: 'tuk-mall' },
  meydenbauer: { name: 'Meydenbauer Center', zoneId: 'BEL', capacity: 2500, spill: { BEL: 1 }, spot: 'bel-tc' },
  bellevueWay: { name: 'Bellevue Way', zoneId: 'BEL', capacity: 12000, spill: { BEL: 1 }, spot: 'bel-way' },
} satisfies Record<string, Venue>;
type VenueId = keyof typeof VENUES;

interface DayContext {
  dow: number;
  month: number;
  date: number;
}

interface Program {
  id: string;
  venue: VenueId;
  kind: EventKind;
  tag: string;
  titles: readonly string[];
  /** Chance the venue hosts this on a given day. */
  chance: (c: DayContext) => number;
  /** Candidate local start hours (decimal). */
  starts: (c: DayContext) => readonly number[];
  durationMin: readonly [number, number];
  /** Attendance as a share of capacity. */
  fill: readonly [number, number];
  /** Spread of the dismissal time around schedule, minutes. */
  sigmaMin: number;
  capacity?: number;
  /** Override for crowds that trickle out during the event (cruise disembarkation). */
  egress?: { earlyMin: number; clearMin: number };
}

const inMonths = (month: number, from: number, to: number) =>
  from <= to ? month >= from && month <= to : month >= from || month <= to;
const cruiseSeason = ({ month, date }: DayContext) =>
  (month > 4 && month < 10) || (month === 4 && date >= 15) || (month === 10 && date <= 20);
const evening = () => [19.5] as const;

/** Listed in priority order: an earlier program claims the venue for the day. */
const PROGRAMS: readonly Program[] = [
  {
    id: 'seahawks', venue: 'lumen', kind: 'sports', tag: 'NFL',
    titles: ['Seahawks vs 49ers', 'Seahawks vs Rams', 'Seahawks vs Cardinals', 'Seahawks vs Packers', 'Seahawks vs Cowboys', 'Seahawks vs Vikings'],
    chance: ({ dow, month }) => (inMonths(month, 9, 1) ? (dow === 0 ? 0.5 : dow === 1 || dow === 4 ? 0.06 : 0) : 0),
    starts: ({ dow }) => (dow === 0 ? [13.083, 13.417, 17.333] : [17.25]),
    durationMin: [185, 200], fill: [0.97, 1], sigmaMin: 10,
  },
  {
    id: 'sounders', venue: 'lumen', kind: 'sports', tag: 'MLS', capacity: 37722,
    titles: ['Sounders FC vs Portland Timbers', 'Sounders FC vs LA Galaxy', 'Sounders FC vs LAFC', 'Sounders FC vs Vancouver Whitecaps', 'Sounders FC vs Real Salt Lake'],
    chance: ({ dow, month }) => (inMonths(month, 2, 10) ? (dow === 6 ? 0.4 : dow === 0 ? 0.15 : dow === 3 ? 0.14 : 0) : 0),
    starts: ({ dow }) => (dow === 0 ? [13.5, 16] : [19.5]),
    durationMin: [115, 125], fill: [0.72, 0.95], sigmaMin: 6,
  },
  {
    id: 'mariners', venue: 'tmobile', kind: 'sports', tag: 'MLB',
    titles: ['Mariners vs Astros', 'Mariners vs Rangers', 'Mariners vs Angels', 'Mariners vs Athletics', 'Mariners vs Yankees', 'Mariners vs Blue Jays'],
    chance: ({ month }) => (inMonths(month, 4, 9) ? 0.5 : 0),
    starts: ({ dow }) => (dow === 0 ? [13.167] : dow === 6 ? [13.167, 18.667] : [18.667, 19.167]),
    durationMin: [160, 190], fill: [0.5, 0.9], sigmaMin: 18,
  },
  {
    id: 'kraken', venue: 'cpa', kind: 'sports', tag: 'NHL',
    titles: ['Kraken vs Canucks', 'Kraken vs Oilers', 'Kraken vs Golden Knights', 'Kraken vs Avalanche', 'Kraken vs Kings', 'Kraken vs Sharks'],
    chance: ({ dow, month }) => (inMonths(month, 10, 4) ? (dow === 2 || dow === 4 || dow === 6 ? 0.42 : 0.16) : 0),
    starts: ({ dow }) => (dow === 0 ? [13, 17] : [19]),
    durationMin: [150, 160], fill: [0.97, 1], sigmaMin: 8,
  },
  {
    id: 'storm', venue: 'cpa', kind: 'sports', tag: 'WNBA',
    titles: ['Storm vs Aces', 'Storm vs Lynx', 'Storm vs Mercury', 'Storm vs Sparks'],
    chance: ({ month }) => (inMonths(month, 5, 9) ? 0.2 : 0),
    starts: () => [19],
    durationMin: [120, 130], fill: [0.55, 0.9], sigmaMin: 6,
  },
  {
    id: 'arena-show', venue: 'cpa', kind: 'concert', tag: 'Concert',
    titles: ['Arena tour: pop headliner', 'Arena tour: rock double bill', 'Arena tour: country headliner', 'Arena tour: hip-hop headliner', 'Arena comedy special'],
    chance: ({ dow }) => (dow === 5 || dow === 6 ? 0.35 : 0.18),
    starts: () => [20],
    durationMin: [160, 190], fill: [0.8, 1], sigmaMin: 12,
  },
  {
    id: 'huskies', venue: 'husky', kind: 'sports', tag: 'NCAA',
    titles: ['Huskies vs Oregon', 'Huskies vs Washington State', 'Huskies vs USC', 'Huskies vs Michigan', 'Huskies vs Wisconsin'],
    chance: ({ dow, month }) => (inMonths(month, 9, 11) && dow === 6 ? 0.5 : 0),
    starts: () => [12.5, 16.5, 19.5],
    durationMin: [205, 225], fill: [0.9, 1], sigmaMin: 12,
  },
  {
    id: 'wamu-show', venue: 'wamu', kind: 'concert', tag: 'Concert',
    titles: ['Electronic showcase', 'Indie rock headliner', 'Latin pop night', 'EDM festival night'],
    chance: ({ dow }) => (dow === 5 || dow === 6 ? 0.35 : dow === 4 ? 0.2 : 0.08),
    starts: () => [20],
    durationMin: [150, 180], fill: [0.6, 1], sigmaMin: 12,
  },
  {
    id: 'showbox-sodo', venue: 'showboxSodo', kind: 'concert', tag: 'Concert',
    titles: ['Club show: touring headliner', 'Club show: metal bill', 'Club show: DJ night'],
    chance: ({ dow }) => (dow >= 4 && dow <= 6 ? 0.45 : 0.2),
    starts: () => [20.5],
    durationMin: [165, 195], fill: [0.6, 1], sigmaMin: 12,
  },
  {
    id: 'paramount', venue: 'paramount', kind: 'theater', tag: 'Theater',
    titles: ['Broadway touring production', 'Stand-up headliner', 'Live podcast taping', 'Touring musical'],
    chance: ({ dow }) => (dow === 1 ? 0.15 : 0.6),
    starts: ({ dow }) => (dow === 0 ? [14, 19] : [19.5]),
    durationMin: [150, 165], fill: [0.75, 1], sigmaMin: 6,
  },
  {
    id: 'benaroya', venue: 'benaroya', kind: 'theater', tag: 'Symphony',
    titles: ['Seattle Symphony: Masterworks', 'Seattle Symphony: film in concert', 'Seattle Symphony: guest soloist'],
    chance: ({ dow }) => (dow === 6 ? 0.6 : dow === 4 ? 0.5 : dow === 0 ? 0.4 : dow === 5 ? 0.3 : 0),
    starts: ({ dow }) => (dow === 0 ? [14] : evening()),
    durationMin: [120, 130], fill: [0.7, 0.95], sigmaMin: 5,
  },
  {
    id: 'mccaw', venue: 'mccaw', kind: 'theater', tag: 'Ballet / Opera',
    titles: ['Pacific Northwest Ballet', 'Seattle Opera'],
    chance: ({ dow }) => (dow === 5 || dow === 6 ? 0.45 : dow === 0 ? 0.35 : dow === 4 ? 0.25 : 0),
    starts: ({ dow }) => (dow === 0 ? [14] : evening()),
    durationMin: [150, 175], fill: [0.75, 0.95], sigmaMin: 6,
  },
  {
    id: 'neptune', venue: 'neptune', kind: 'concert', tag: 'Concert',
    titles: ['Neptune: indie headliner', 'Neptune: comedy night', 'Neptune: singer-songwriter'],
    chance: ({ dow }) => (dow >= 4 && dow <= 6 ? 0.45 : 0.15),
    starts: () => [20],
    durationMin: [150, 180], fill: [0.6, 1], sigmaMin: 10,
  },
  {
    id: 'convention', venue: 'convention', kind: 'convention', tag: 'Convention',
    titles: ['Tech conference: day sessions end', 'Medical congress: day sessions end', 'Trade expo: show floor closes'],
    chance: ({ dow }) => (dow >= 1 && dow <= 5 ? 0.45 : 0),
    starts: () => [9],
    durationMin: [480, 510], fill: [0.3, 0.9], sigmaMin: 15,
  },
  {
    id: 'meydenbauer', venue: 'meydenbauer', kind: 'convention', tag: 'Convention',
    titles: ['Corporate summit: sessions end', 'Industry forum: sessions end'],
    chance: ({ dow }) => (dow >= 2 && dow <= 4 ? 0.3 : 0),
    starts: () => [9],
    durationMin: [470, 500], fill: [0.35, 0.95], sigmaMin: 12,
  },
  {
    id: 'thunderbirds', venue: 'showare', kind: 'sports', tag: 'WHL',
    titles: ['Thunderbirds vs Silvertips', 'Thunderbirds vs Winterhawks', 'Thunderbirds vs Chiefs', 'Thunderbirds vs Americans'],
    chance: ({ dow, month }) => (inMonths(month, 9, 3) ? (dow === 5 || dow === 6 ? 0.5 : dow === 0 ? 0.2 : dow === 2 || dow === 3 ? 0.15 : 0) : 0),
    starts: ({ dow }) => (dow === 0 ? [17] : [19.083]),
    durationMin: [145, 155], fill: [0.5, 0.85], sigmaMin: 8,
  },
  {
    id: 'starfire', venue: 'starfire', kind: 'sports', tag: 'Soccer',
    titles: ['Match night at Starfire', 'Regional tournament finals'],
    chance: ({ dow, month }) => (inMonths(month, 3, 11) && (dow === 0 || dow >= 5) ? 0.35 : 0),
    starts: ({ dow }) => (dow === 0 ? [15] : [19]),
    durationMin: [110, 120], fill: [0.27, 0.7], sigmaMin: 6,
  },
  {
    id: 'cruise-91', venue: 'pier91', kind: 'cruise', tag: 'Cruise',
    titles: ['Cruise disembarkation: two ships', 'Cruise disembarkation'],
    chance: (c) => (cruiseSeason(c) ? (c.dow === 0 || c.dow >= 5 ? 0.9 : 0.25) : 0),
    starts: () => [7],
    durationMin: [85, 95], fill: [0.45, 0.95], sigmaMin: 15,
    egress: { earlyMin: 75, clearMin: 120 },
  },
  {
    id: 'cruise-66', venue: 'pier66', kind: 'cruise', tag: 'Cruise',
    titles: ['Cruise disembarkation'],
    chance: (c) => (cruiseSeason(c) ? (c.dow === 0 || c.dow === 6 ? 0.6 : 0.12) : 0),
    starts: () => [7.25],
    durationMin: [80, 90], fill: [0.55, 0.9], sigmaMin: 15,
    egress: { earlyMin: 70, clearMin: 110 },
  },
  {
    id: 'snowflake-lane', venue: 'bellevueWay', kind: 'festival', tag: 'Festival',
    titles: ['Snowflake Lane parade'],
    chance: ({ month, date }) => ((month === 12 && date <= 24) || (month === 11 && date >= 27) ? 1 : 0),
    starts: () => [19],
    durationMin: [25, 30], fill: [0.5, 1], sigmaMin: 3,
  },
];

/** Share of the crowd that requests a ride, and riders per request. */
const RIDE_PROFILE: Record<EventKind, readonly [share: number, partySize: number]> = {
  sports: [0.07, 2.4],
  concert: [0.11, 2.2],
  theater: [0.09, 2.0],
  convention: [0.1, 1.3],
  cruise: [0.26, 2.3],
  festival: [0.04, 2.6],
};

interface RawEvent extends Omit<VenueEvent, 'status' | 'endUncertaintyMin' | 'curve'> {
  sigmaMin: number;
  curveStart: number;
  curve: number[];
}

const dayCache = new Map<string, RawEvent[]>();

function egressCurve(end: number, attendance: number, requests: number, override?: Program['egress']) {
  // Bigger crowds take longer to clear the building and the surrounding streets.
  const clearMin = override?.clearMin ?? 22 + 55 * Math.pow(attendance / 70000, 0.55);
  const earlyMin = override?.earlyMin ?? Math.min(20, 6 + clearMin * 0.15);
  const scale = clearMin / 5;
  const egressStart = end - earlyMin * MIN;
  const curveStart = floorTo(egressStart, BUCKET);

  // Gamma-shaped outflow: a few early leavers, a sharp peak, a long tail.
  const weights: number[] = [];
  for (let t = curveStart; (t - egressStart) / MIN < scale * 8; t += BUCKET) {
    const x = (t + BUCKET / 2 - egressStart) / MIN;
    weights.push(x > 0 ? x * x * Math.exp(-x / scale) : 0);
  }
  const total = weights.reduce((s, w) => s + w, 0) || 1;

  return {
    egressStart,
    egressPeak: egressStart + 2 * scale * MIN,
    egressEnd: egressStart + 6 * scale * MIN,
    curveStart,
    curve: weights.map((w) => (w / total) * requests),
  };
}

/** Every event dismissing on a local day. */
export function eventsForDay(day: number, offset: number): RawEvent[] {
  const key = `${day}:${offset}`;
  const hit = dayCache.get(key);
  if (hit) return hit;

  const start = dayStart(day, offset);
  const ctx: DayContext = { dow: localClock(start, offset).dow, ...localDate(day) };
  const booked = new Set<VenueId>();
  const out: RawEvent[] = [];

  for (const program of PROGRAMS) {
    const r = seeded('event', day, program.id);
    if (r() >= program.chance(ctx) || booked.has(program.venue)) continue;
    booked.add(program.venue);

    const venue: Venue = VENUES[program.venue];
    const eventStart = start + pick(r, program.starts(ctx)) * HOUR;
    const scheduledEnd = eventStart + between(r, ...program.durationMin) * MIN;
    // Overtime, extra innings and encores move the real dismissal off schedule.
    const end = scheduledEnd + clamp(gauss(r), -1.5, 2.5) * program.sigmaMin * 0.6 * MIN;
    const attendance = Math.round(((program.capacity ?? venue.capacity) * between(r, ...program.fill)) / 10) * 10;

    const [share, partySize] = RIDE_PROFILE[program.kind];
    const endHour = localClock(end, offset).hour;
    const lateBoost = endHour >= 22 || endHour < 4 ? 1.25 : 1;
    const requests = (attendance * share * lateBoost) / partySize;

    out.push({
      id: `${day}-${program.id}`,
      venue: venue.name,
      zoneId: venue.zoneId,
      kind: program.kind,
      tag: program.tag,
      title: pick(r, program.titles),
      start: eventStart,
      end,
      sigmaMin: program.sigmaMin,
      attendance,
      requests: Math.round(requests),
      stagingSpotId: venue.spot,
      spill: venue.spill,
      bucketMin: EVENT_BUCKET_MIN,
      ...egressCurve(end, attendance, requests, program.egress),
    });
  }

  out.sort((a, b) => a.end - b.end);
  if (dayCache.size >= 24) dayCache.delete(dayCache.keys().next().value as string);
  dayCache.set(key, out);
  return out;
}

function eventsBetween(from: number, to: number, offset: number): RawEvent[] {
  // Egress tails run past midnight, so look one day back as well.
  const firstDay = localClock(from, offset).day - 1;
  const lastDay = localClock(to, offset).day;
  const out: RawEvent[] = [];
  for (let day = firstDay; day <= lastDay; day++) {
    for (const e of eventsForDay(day, offset)) {
      if (e.curveStart + e.curve.length * BUCKET > from && e.curveStart < to) out.push(e);
    }
  }
  return out;
}

/** Egress ride requests per zone per step over a window (forecast covariate). */
export function eventZoneSeries(
  start: number,
  stepMs: number,
  steps: number,
  offset: number,
): Partial<Record<ZoneId, number[]>> {
  const series: Partial<Record<ZoneId, number[]>> = {};
  for (const e of eventsBetween(start, start + steps * stepMs, offset)) {
    e.curve.forEach((requests, k) => {
      const i = Math.floor((e.curveStart + k * BUCKET - start) / stepMs);
      if (i < 0 || i >= steps) return;
      for (const [zone, share] of Object.entries(e.spill) as [ZoneId, number][]) {
        (series[zone] ??= new Array<number>(steps).fill(0))[i] += requests * share;
      }
    });
  }
  return series;
}

function statusOf(e: RawEvent, now: number): EventStatus {
  if (now < e.start) return 'upcoming';
  if (now < e.egressStart) return 'live';
  return now < e.egressEnd ? 'egress' : 'cleared';
}

export function buildEventFeed(now: number, offset: number): EventFeed {
  const events = eventsBetween(now - 20 * MIN, now + 18 * HOUR, offset)
    .filter((e) => e.egressEnd > now - 20 * MIN && e.start < now + 18 * HOUR)
    .sort((a, b) => a.end - b.end)
    .slice(0, 12)
    .map((e): VenueEvent => {
      const { sigmaMin, curveStart, curve, ...rest } = e;
      // The estimate firms up as the event nears its end.
      const remaining = clamp((e.end - now) / Math.max(MIN, e.end - e.start), 0.25, 1);
      return {
        ...rest,
        endUncertaintyMin: Math.max(2, Math.round(sigmaMin * remaining)),
        status: statusOf(e, now),
        curve: curve.map((requests, k) => ({
          t: curveStart + k * BUCKET,
          requests: Math.round(requests * 10) / 10,
        })),
      };
    });

  return { generatedAt: now, source: 'simulated', events };
}
