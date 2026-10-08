'use client';

import {
  ChevronRight,
  CircleCheck,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  LocateFixed,
  Moon,
  Snowflake,
  Sun,
  ThermometerSnowflake,
  ThermometerSun,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { fmtClock, fmtDuration, fmtShort, fmtWeekday } from '@/lib/format';
import { MIN } from '@/lib/time';
import { SKY_LABEL, driverAdvice, type AdviceKind, type Sky, type Weather } from '@/lib/weather';
import { Card, Eyebrow, cx } from './ui';

const DAY_ICON: Record<Sky, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  freezing: CloudHail,
  snow: Snowflake,
  thunder: CloudLightning,
};
const NIGHT_ICON: Record<Sky, LucideIcon> = { ...DAY_ICON, clear: Moon, partly: CloudMoon };

/** The glyph for a sky condition, with a moon instead of a sun after dark. */
function SkyIcon({ sky, day, className, strokeWidth, label }: { sky: Sky; day: boolean; className?: string; strokeWidth?: number; label?: string }) {
  const Icon = (day ? DAY_ICON : NIGHT_ICON)[sky];
  return <Icon className={className} strokeWidth={strokeWidth} aria-label={label} aria-hidden={label ? undefined : true} />;
}

const ADVICE_ICON: Record<AdviceKind, LucideIcon> = {
  rain: CloudRain,
  snow: Snowflake,
  ice: CloudHail,
  wind: Wind,
  fog: CloudFog,
  heat: ThermometerSun,
  cold: ThermometerSnowflake,
  calm: CircleCheck,
};

const degrees = (f: number) => `${Math.round(f)}°`;

/** Compact weather for the overview: conditions now and the headline for drivers. */
export function WeatherCard({
  weather,
  place,
  onOpen,
  className,
}: {
  weather: Weather;
  /** Where the forecast is for. */
  place: string;
  onOpen: () => void;
  className?: string;
}) {
  const { current } = weather;
  const [headline] = driverAdvice(weather);
  return (
    <Card className={cx('p-3', className)}>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-1 text-left">
        <SkyIcon sky={current.sky} day={current.day} className="size-9 shrink-0 text-fg-2" strokeWidth={1.6} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">
            {degrees(current.tempF)} · {SKY_LABEL[current.sky]}
          </span>
          <span className="block truncate text-[12px] text-fg-3">
            {place && `${place} · `}
            {headline?.title ?? 'Live weather'}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
      </button>
    </Card>
  );
}

/** Live weather for the driver's area and what it means for the next few hours of driving. */
export function WeatherPanel({
  weather,
  error,
  now,
  area,
  following,
  simulating,
}: {
  weather: Weather | null;
  error: string | null;
  /** The real clock: weather ignores the simulation clock. */
  now: number;
  /** Name of the place the forecast is for. */
  area: string;
  /** True when the forecast follows the device's own position. */
  following: boolean;
  simulating: boolean;
}) {
  if (!weather) {
    return (
      <Card>
        <p className="text-[15px] font-semibold">{error ? 'Weather is unavailable' : 'Loading the weather…'}</p>
        <p className="mt-1.5 text-[13px] leading-snug text-fg-3">
          {error
            ? `${error} The rest of the app does not depend on it. It will try again on its own.`
            : `Getting the live forecast for ${area}.`}
        </p>
      </Card>
    );
  }

  const { current } = weather;
  const advice = driverAdvice(weather);
  const hours = weather.hours.slice(0, 24);
  const ageMin = Math.max(0, (now - weather.fetchedAt) / MIN);

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>Weather now</Eyebrow>
              <p className="mt-1 text-[54px] font-semibold leading-[0.95] tracking-tighter">{degrees(current.tempF)}</p>
              <p className="mt-1 text-[15px] font-medium">{SKY_LABEL[current.sky]}</p>
              <p className="flex items-center gap-1 text-[12px] text-fg-3">
                {following && <LocateFixed className="size-3 shrink-0 text-accent" aria-hidden />}
                <span className="truncate">{following ? `Where you are: ${area}` : area}</span>
              </p>
            </div>
            <SkyIcon sky={current.sky} day={current.day} className="size-20 shrink-0 text-fg-2" strokeWidth={1.3} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <div className="rounded-lg bg-raised px-2.5 py-2">
              <dt className="text-fg-3">Feels like</dt>
              <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{degrees(current.feelsF)}</dd>
            </div>
            <div className="rounded-lg bg-raised px-2.5 py-2">
              <dt className="text-fg-3">Wind</dt>
              <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{Math.round(current.windMph)} mph</dd>
            </div>
            <div className="rounded-lg bg-raised px-2.5 py-2">
              <dt className="text-fg-3">Rain chance</dt>
              <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{Math.round(hours[0]?.chance ?? 0)}%</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-snug text-fg-3">
            Live data, updated {ageMin < 1 ? 'just now' : `${fmtDuration(ageMin)} ago`}
            {error ? ' (the last refresh failed)' : ''}.{simulating ? ' Weather is always live: it ignores the simulation clock.' : ''}
          </p>
        </Card>

        <Card className="p-3">
          <h2 className="px-1 text-[15px] font-semibold">What it means for driving</h2>
          <ul className="mt-2 space-y-2">
            {advice.map((item) => {
              const AdviceIcon = ADVICE_ICON[item.kind];
              return (
                <li key={item.kind} className={cx('flex items-start gap-3 rounded-xl border bg-raised p-3', item.alert ? 'border-line-2' : 'border-line')}>
                  <AdviceIcon className={cx('mt-0.5 size-5 shrink-0', item.alert ? 'text-warning' : 'text-fg-3')} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold leading-snug">{item.title}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-fg-2">{item.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 px-1 text-[11px] leading-snug text-fg-3">
            General guidance from the forecast. The surge numbers on the other screens are simulated and do not include weather.
          </p>
        </Card>
      </div>

      <div className="min-w-0 space-y-3">
        <Card className="p-3">
          <div className="px-1">
            <h2 className="text-[15px] font-semibold">Next 24 hours</h2>
            <p className="mt-0.5 text-[12px] text-fg-3">Temperature and chance of rain or snow, hour by hour. Swipe sideways for later hours.</p>
          </div>
          <ol className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Hourly forecast">
            {hours.map((hour, i) => {
              return (
                <li key={hour.t} className="flex w-[3.25rem] shrink-0 flex-col items-center rounded-xl bg-raised px-1 py-2">
                  <span className="text-[11px] tabular-nums text-fg-3">{i === 0 ? 'Now' : fmtShort(hour.t)}</span>
                  <SkyIcon sky={hour.sky} day={hour.day} className="mt-1.5 size-5 text-fg-2" strokeWidth={1.7} label={SKY_LABEL[hour.sky]} />
                  <span className="mt-1.5 text-[14px] font-semibold tabular-nums">{degrees(hour.tempF)}</span>
                  {/* Chance of precipitation: a bar that fills from the bottom, with its number. */}
                  <span className="mt-2 flex h-10 w-2.5 items-end overflow-hidden rounded-full bg-plane" aria-hidden>
                    <span className="w-full rounded-full bg-flights" style={{ height: `${Math.max(hour.chance, hour.chance > 0 ? 6 : 0)}%` }} />
                  </span>
                  <span className={cx('mt-1 text-[11px] tabular-nums', hour.chance >= 40 ? 'font-semibold text-fg' : 'text-fg-3')}>
                    {Math.round(hour.chance)}%
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-fg-3">
            <span className="h-2.5 w-2.5 rounded-full bg-flights" aria-hidden />
            Chance of rain or snow
          </p>
        </Card>

        <Card className="p-3">
          <h2 className="px-1 text-[15px] font-semibold">Coming days</h2>
          <ul className="mt-1 divide-y divide-line px-1">
            {weather.days.map((day, i) => {
              return (
                <li key={day.t} className="flex items-center gap-3 py-2.5">
                  <span className="w-12 shrink-0 text-[14px] font-medium">{i === 0 ? 'Today' : fmtWeekday(day.t + 12 * 60 * MIN)}</span>
                  <SkyIcon sky={day.sky} day className="size-5 shrink-0 text-fg-2" strokeWidth={1.7} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">{SKY_LABEL[day.sky]}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-fg-3">{Math.round(day.chance)}% rain</span>
                  <span className="w-[4.5rem] shrink-0 text-right text-[14px] font-semibold tabular-nums">
                    {degrees(day.highF)} <span className="font-normal text-fg-3">{degrees(day.lowF)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <p className="px-1 text-[11px] leading-relaxed text-fg-3">
          Weather data by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="text-fg-2 underline">
            Open-Meteo.com
          </a>
          , fetched {fmtClock(weather.fetchedAt)}. To get it, the app sends {following ? 'your position' : 'the centre of your area'}, rounded to about three miles, to
          Open-Meteo. Forecasts can be wrong; check conditions before you drive.
        </p>
      </div>
    </div>
  );
}
