export const TZ = 'America/Los_Angeles';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/**
 * Milliseconds to add to a UTC epoch to get Pacific wall-clock time expressed
 * as a UTC epoch (−7 h in PDT, −8 h in PST). Resolved once per request and
 * applied to the whole window, so the server's own timezone never matters.
 */
export function pacificOffsetMs(at: number): number {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(at)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(at / 1000) * 1000;
}

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
