export const TZ = 'America/Los_Angeles';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * Milliseconds to add to a UTC epoch to get wall-clock time in `timeZone`
 * expressed as a UTC epoch (−7 h for Pacific in summer). Resolved once per
 * request and applied to the whole window, so the server's own timezone never
 * matters.
 */
export function zoneOffsetMs(at: number, timeZone: string): number {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(at)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(at / 1000) * 1000;
}

export const pacificOffsetMs = (at: number) => zoneOffsetMs(at, TZ);

export interface LocalClock {
  /** Local days since the epoch; the seed for per-day schedules. */
  day: number;
  /** 0 = Sunday. */
  dow: number;
  /** Fractional local hour, 0–24. */
  hour: number;
}

export function localClock(t: number, offset: number): LocalClock {
  const local = t + offset;
  const day = Math.floor(local / DAY);
  return { day, dow: (((day + 4) % 7) + 7) % 7, hour: (local - day * DAY) / HOUR };
}

export function localDate(day: number): { month: number; date: number } {
  const d = new Date(day * DAY);
  return { month: d.getUTCMonth() + 1, date: d.getUTCDate() };
}

/** Epoch of local midnight for a local day index. */
export const dayStart = (day: number, offset: number) => day * DAY - offset;

export const floorTo = (t: number, stepMs: number) => Math.floor(t / stepMs) * stepMs;
