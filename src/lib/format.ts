import { TZ } from './time';

const clockFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
});
const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const countFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function clockParts(t: number) {
  let hour = '';
  let minute = '';
  let period = '';
  for (const p of clockFmt.formatToParts(t)) {
    if (p.type === 'hour') hour = p.value;
    else if (p.type === 'minute') minute = p.value;
    else if (p.type === 'dayPeriod') period = p.value;
  }
  return { hour, minute, period };
}

/** "10:45 PM" in Pacific time. */
export function fmtClock(t: number): string {
  const { hour, minute, period } = clockParts(t);
  return `${hour}:${minute} ${period}`;
}

/** Compact axis label: "10:45p", or "11p" on the hour. */
export function fmtShort(t: number): string {
  const { hour, minute, period } = clockParts(t);
  const p = period.charAt(0).toLowerCase();
  return minute === '00' ? `${hour}${p}` : `${hour}:${minute}${p}`;
}

/** "10:35–11:00 PM", repeating the period only when it changes. */
export function fmtRange(a: number, b: number): string {
  const x = clockParts(a);
  const y = clockParts(b);
  const head = x.period === y.period ? `${x.hour}:${x.minute}` : `${x.hour}:${x.minute} ${x.period}`;
  return `${head}–${y.hour}:${y.minute} ${y.period}`;
}

/** Compact range for tables: "3:05–3:20p". */
export function fmtShortRange(a: number, b: number): string {
  const x = clockParts(a);
  const y = clockParts(b);
  const p = (period: string) => period.charAt(0).toLowerCase();
  const head = x.period === y.period ? `${x.hour}:${x.minute}` : `${x.hour}:${x.minute}${p(x.period)}`;
  return `${head}–${y.hour}:${y.minute}${p(y.period)}`;
}

export const fmtWeekday = (t: number) => weekdayFmt.format(t);

export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')} m`;
}

/** "in 12 min" / "now" / "8 min ago". */
export function fmtRelative(deltaMin: number): string {
  const m = Math.round(deltaMin);
  if (m === 0) return 'now';
  return m > 0 ? `in ${fmtDuration(m)}` : `${fmtDuration(-m)} ago`;
}

export const fmtMult = (m: number) => `${m.toFixed(1)}×`;

export function fmtCount(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return countFmt.format(Math.round(n));
}
