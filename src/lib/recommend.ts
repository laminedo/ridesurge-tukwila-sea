/**
 * Turns the forecast into a positioning decision: for each zone, the best
 * surge window the driver can still reach, when to be staged for it and when
 * to leave. Runs on the device so it follows the driver's position and keeps
 * working offline against the last saved snapshot.
 */
import { fmtClock, fmtCount, fmtRange } from './format';
import { driveMinutes } from './geo';
import { HOUR, MIN, localClock, pacificOffsetMs } from './time';
import type { LatLng, Snapshot, StagingSpot, VenueEvent, Zone, ZoneStep } from './types';
import { clamp } from './util';
import { SPOT_BY_ID, ZONES, defaultSpot } from './zones';

export type Cause = 'flights' | 'airport' | 'events' | 'organic';

export interface Recommendation {
  zone: Zone;
  spot: StagingSpot;
  driveMin: number;
  nowMult: number;
  peakMult: number;
  /** Index into the zone's remaining steps. */
  peakIdx: number;
  peakT: number;
  /** When to be in position. */
  stageBy: number;
  leaveBy: number;
  cause: Cause;
  reason: string;
  /** False when nothing reachable surges and the zone is ranked on volume alone. */
  surge: boolean;
  score: number;
}

export interface DriverContext {
  origin: LatLng;
  now: number;
}

const SURGE_FLOOR = 1.3;
/** Arrive this long before the ramp starts. */
const STAGE_BUFFER = 5 * MIN;

function causeOf(step: ZoneStep): Cause {
  if (step.demand > 0) {
    if (step.events / step.demand >= 0.35 && step.events >= step.flights) return 'events';
    if (step.flights / step.demand >= 0.35) return 'flights';
    if (step.airport / step.demand >= 0.35) return 'airport';
  }
  return 'organic';
}

function eventFor(snapshot: Snapshot, zone: Zone, t: number): VenueEvent | undefined {
  return snapshot.events.events
    .filter((e) => (e.spill[zone.id] ?? 0) > 0 && e.egressStart - 30 * MIN <= t && e.egressEnd + 15 * MIN >= t)
    .sort((a, b) => b.requests * (b.spill[zone.id] ?? 0) - a.requests * (a.spill[zone.id] ?? 0))[0];
}

function organicReason(hour: number, dow: number): string {
  const weekday = dow >= 1 && dow <= 5;
  if (hour >= 0.5 && hour < 3.5) return 'Bar close: demand outruns the late-night driver pool';
  if (weekday && hour >= 15.5 && hour < 19) return 'Evening commute demand ahead of available drivers';
  if (weekday && hour >= 6 && hour < 9.5) return 'Morning commute demand ahead of available drivers';
  if (hour >= 21 || hour < 0.5) return 'Nightlife demand ahead of available drivers';
  return 'Demand running ahead of available drivers';
}

function reasonFor(snapshot: Snapshot, zone: Zone, step: ZoneStep, cause: Cause, stepMs: number, offset: number): string {
  if (cause === 'flights') {
    const wave = snapshot.flights.waves.find((w) => w.start < step.t + stepMs && w.end > step.t);
    return wave
      ? `${wave.flights} arrivals put about ${fmtCount(wave.requests)} ride requests at the curb ${fmtRange(wave.start, wave.end)}`
      : `Arrivals reach the curb around ${fmtClock(step.t)}`;
  }
  if (cause === 'airport') {
    return `About ${step.airport} riders leaving here for Sea-Tac around ${fmtClock(step.t)}: long fares to catch the next departure bank`;
  }
  if (cause === 'events') {
    const event = eventFor(snapshot, zone, step.t);
    if (event) {
      const elsewhere = event.zoneId === zone.id ? '' : ' nearby';
      if (event.kind === 'cruise') return `Cruise passengers leaving ${event.venue} ${fmtRange(event.egressStart, event.egressEnd)}`;
      if (event.kind === 'convention') return `${event.title} at ${event.venue}${elsewhere} around ${fmtClock(event.end)} · ${fmtCount(event.attendance)} people`;
      if (event.kind === 'nightlife') return `${event.venue}${elsewhere} empties toward its ${fmtClock(event.end)} close`;
      return `${event.title} lets out${elsewhere} around ${fmtClock(event.end)} · ${fmtCount(event.attendance)} people`;
    }
    return `Venue crowd leaving around ${fmtClock(step.t)}`;
  }
  const { hour, dow } = localClock(step.t, offset);
  return organicReason(hour, dow);
}

/**
 * Rank every zone for a driver. `nowIdx` is the forecast step containing
 * "now" (greater than zero when working from an older saved snapshot).
 */
export function rankZones(snapshot: Snapshot, nowIdx: number, { origin, now }: DriverContext): Recommendation[] {
  const offset = pacificOffsetMs(now);
  const { dow, hour } = localClock(now, offset);
  const stepMs = snapshot.forecast.stepMin * MIN;

  const ranked = ZONES.flatMap((zone): Recommendation[] => {
    const steps = snapshot.forecast.zones.find((z) => z.zoneId === zone.id)?.steps.slice(nowIdx) ?? [];
    if (steps.length === 0) return [];

    // Pick the staging spot from what drives the zone's biggest step.
    const hottest = steps.reduce((best, s) => (s.mult > best.mult ? s : best), steps[0]);
    const hotEvent = causeOf(hottest) === 'events' ? eventFor(snapshot, zone, hottest.t) : undefined;
    const eventSpot = hotEvent ? SPOT_BY_ID[hotEvent.stagingSpotId] : undefined;
    const spot = eventSpot?.zoneId === zone.id ? eventSpot : defaultSpot(zone.id);

    const driveMin = driveMinutes(origin, spot, dow, hour);
    const arrive = now + driveMin * MIN;
    const first = clamp(Math.floor((arrive - steps[0].t) / stepMs), 0, steps.length - 1);

    // Best step still reachable; waiting around idle erodes the payoff.
    let peakIdx = first;
    let bestValue = -Infinity;
    for (let i = first; i < steps.length; i++) {
      const value = steps[i].mult - 0.25 * (Math.max(0, steps[i].t - arrive) / HOUR);
      if (value > bestValue + 1e-9) {
        bestValue = value;
        peakIdx = i;
      }
    }
    const peak = steps[peakIdx];
    const surge = peak.mult >= SURGE_FLOOR;

    // Be staged just before the ramp into that peak begins.
    let ramp = peakIdx;
    const rampFloor = Math.max(SURGE_FLOOR, peak.mult * 0.75);
    while (ramp > first && steps[ramp - 1].mult >= rampFloor) ramp--;
    const stageBy = surge && ramp > first ? Math.max(arrive, steps[ramp].t - STAGE_BUFFER) : arrive;

    const around = steps.slice(Math.max(first, peakIdx - 1), peakIdx + 2);
    const sustained = around.reduce((s, x) => s + x.mult, 0) / around.length;
    const depth = Math.sqrt(clamp(peak.demand / 30, 0.3, 1));
    const hoursOut = Math.max(0, (peak.t - now) / HOUR - 0.25);
    const score = surge
      ? (0.6 * peak.mult + 0.4 * sustained - 1) * depth - 0.012 * driveMin - 0.08 * hoursOut
      : -1 + steps[first].demand / (60 + 3 * driveMin) / 100;

    const cause = causeOf(peak);
    return [
      {
        zone,
        spot,
        driveMin,
        nowMult: steps[0].mult,
        peakMult: peak.mult,
        peakIdx,
        peakT: peak.t,
        stageBy,
        leaveBy: stageBy - driveMin * MIN,
        cause,
        reason: reasonFor(snapshot, zone, peak, cause, stepMs, offset),
        surge,
        score,
      },
    ];
  });

  return ranked.sort((a, b) => b.score - a.score);
}
