/**
 * Simulated everyday ("organic") ride demand and driver supply per zone.
 *
 * This is the history a live deployment would read from its own trip logs:
 * commute peaks, lunch, evenings out, weekend nightlife and bar close, plus a
 * day-level swing and noise. It is the series TimesFM is asked to forecast.
 * Each zone's character comes from its region's profile weights.
 */
import type { ProfileWeights, Region } from '../regions/types';
import { seeded, unitNoise } from '../rng';
import { MIN, localClock } from '../time';
import type { ZoneId } from '../types';

/** Bell curve on the 24-hour clock, wrapping past midnight. */
function bump(hour: number, centre: number, width: number): number {
  let d = Math.abs(hour - centre) % 24;
  if (d > 12) d = 24 - d;
  return Math.exp(-(d * d) / (2 * width * width));
}

function shape(profile: ProfileWeights, dow: number, hour: number, nightElasticity: number): number {
  const [base, am, midday, pm, evening, night, barClose] = profile;
  const weekend = dow === 0 || dow === 6;
  // The small hours belong to the night before: 1 AM Saturday is Friday night.
  const nightOf = hour < 5 ? (dow + 6) % 7 : dow;
  const nightlife = Math.pow(nightOf === 5 || nightOf === 6 ? 2.3 : nightOf === 4 ? 1.4 : 1, nightElasticity);

  return (
    base *
    (0.1 +
      am * bump(hour, 7.9, 1.1) * (weekend ? 0.3 : 1) +
      midday * bump(hour, 12.6, 1.9) * (weekend ? 1.25 : 1) +
      pm * bump(hour, 17.4, 1.3) * (weekend ? 0.65 : 1) +
      evening * bump(hour, 20.3, 1.5) * (weekend ? 1.1 : 1) +
      night * bump(hour, 23.8, 1.4) * nightlife +
      barClose * bump(hour, 1.9, 0.45) * nightlife)
  );
}

/** Typical ride requests per 15 minutes for a zone at this point in the week. */
export const organicExpected = (region: Region, zone: ZoneId, dow: number, hour: number) =>
  shape(region.profiles[zone], dow, hour, 1);

/** Share of the usual driver pool that is online and moving freely. */
function availability(dow: number, hour: number): number {
  const weekday = dow >= 1 && dow <= 5;
  if (hour >= 1 && hour < 4) return 0.86; // drivers log off before bar close ends
  if (hour >= 4 && hour < 6.5) return 0.95; // thin early-morning coverage
  if (weekday && hour >= 16 && hour < 18.5) return 0.98; // gridlock strands cars
  return 1.12;
}

/**
 * Rides the everyday driver pool can serve per 15 minutes. Drivers follow the
 * weekly rhythm but under-respond to weekend nightlife, which is why Friday
 * and Saturday nights surge without any event on the calendar.
 */
export const supplyBaseline = (region: Region, zone: ZoneId, dow: number, hour: number) =>
  shape(region.profiles[zone], dow, hour, 0.75) * availability(dow, hour);

/** How hot today runs against a typical day (weather, paydays, school breaks). */
export function dayLevel(region: Region, day: number): number {
  return 0.9 + seeded('level', region.id, day)() * 0.3;
}

const STEP = 15 * MIN;

/** Simulated observed organic demand for the 15-minute bucket starting at `t`. */
export function organicActual(region: Region, zone: ZoneId, t: number, offset: number): number {
  const { day, dow, hour } = localClock(t, offset);
  const noise = 1 + 0.08 * unitNoise(`${region.id}|${zone}|${Math.floor(t / STEP)}`);
  return organicExpected(region, zone, dow, hour) * dayLevel(region, day) * noise;
}
