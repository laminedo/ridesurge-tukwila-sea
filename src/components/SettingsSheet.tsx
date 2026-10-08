'use client';

import { LocateFixed, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { STATIC_EXPORT } from '@/lib/client/env';
import { updateSettings, type Area, type Geolocation, type Settings } from '@/lib/client/stores';
import { fmtClock } from '@/lib/format';
import { NAV_APPS } from '@/lib/nav';
import type { CityMatch } from '@/lib/regions';
import { DAY, HOUR, MIN, localClock, zoneOffsetMs } from '@/lib/time';
import type { Snapshot } from '@/lib/types';
import { Sheet } from './Sheet';
import { Segmented, cx } from './ui';

const AREA_MODES = [
  { id: 'gps', label: 'My location' },
  { id: 'seattle', label: 'Seattle' },
  { id: 'city', label: 'Another city' },
] as const;

/** Moments worth rehearsing: [label, weekday (0 = Sunday), local hour, minute]. */
const SCENARIOS: readonly (readonly [string, number, number, number])[] = [
  ['Fri 10:30 PM · shows let out', 5, 22, 30],
  ['Sat 1:40 AM · bar close', 6, 1, 40],
  ['Sat 4:45 AM · airport runs', 6, 4, 45],
  ['Sun 4:00 PM · game day', 0, 16, 0],
  ['Mon 8:00 AM · commute', 1, 8, 0],
  ['Thu 5:15 PM · rush + conventions', 4, 17, 15],
];

/** Next occurrence of a weekday and time in the region's own time zone, as an offset from the real clock. */
function offsetTo(dow: number, hour: number, minute: number, timeZone: string): number {
  const now = Date.now();
  const offset = zoneOffsetMs(now, timeZone);
  const today = localClock(now, offset);
  let target = (today.day + ((dow - today.dow + 7) % 7)) * DAY + hour * HOUR + minute * MIN - offset;
  if (target <= now) target += 7 * DAY;
  return target - now;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Finds a US city in the bundled data. The search runs on the device. */
function CitySearch({ current, onPick }: { current: Area; onPick: (city: CityMatch) => void }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CityMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Loaded on demand: the gazetteer is only needed once somebody looks for a city.
    void import('@/lib/regions')
      .then(({ searchCities }) => searchCities(query))
      .then((found) => {
        if (!cancelled) setMatches(found);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="mt-2">
      <label className="flex h-12 items-center gap-2 rounded-xl border border-line-2 bg-plane px-3 focus-within:border-accent">
        <Search className="size-4 shrink-0 text-fg-3" aria-hidden />
        <span className="sr-only">Search for a US city</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="City, or city and state (Dallas, TX)"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-3"
        />
      </label>
      {matches.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {matches.map((city) => (
            <li key={`${city.name}-${city.state}-${city.lat}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(city);
                  setQuery('');
                }}
                className="flex h-11 w-full items-center justify-between gap-3 bg-raised px-3 text-left text-[14px] active:brightness-125"
              >
                <span className="truncate font-medium">{city.name}</span>
                <span className="shrink-0 text-[12px] text-fg-3">{city.state}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && matches.length === 0 && (
        <p className="mt-2 text-[12px] text-fg-3">No US city of 5,000 people or more matches that name.</p>
      )}
      {current.mode === 'city' && matches.length === 0 && (
        <p className="mt-2 text-[12px] text-fg-2" role="status">
          Showing {current.name}, {current.state}.
        </p>
      )}
    </div>
  );
}

export function SettingsSheet({
  open,
  onClose,
  settings,
  geolocation,
  simOffset,
  onSimOffset,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  geolocation: Geolocation;
  simOffset: number;
  onSimOffset: (offset: number) => void;
  snapshot: Snapshot | null;
}) {
  const model = snapshot?.forecast.model;
  const region = snapshot?.region;
  const { area } = settings;
  const airport = region?.airport?.code ?? 'the airport';

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-5">
        <Section
          title="Your area"
          hint="The radar map, weather, forecast and staging spots follow this place. My location uses the GPS in your phone or tablet. Seattle–Tacoma is hand-tuned; everywhere else in the US is built from data inside the app."
        >
          <Segmented
            label="Area"
            options={AREA_MODES}
            value={area.mode}
            onChange={(mode) => {
              // "Another city" only takes effect once a city is picked below.
              if (mode !== 'city') updateSettings({ area: { mode } });
              else if (area.mode !== 'city') updateSettings({ area: { mode: 'city', name: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 } });
            }}
          />

          {area.mode === 'gps' && (
            <p className="mt-2 flex items-start gap-2 text-[12px] leading-snug text-fg-2" role="status">
              <LocateFixed className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />
              <span>
                {geolocation.error && !geolocation.position
                  ? `${geolocation.error} Allow location for this site in your browser settings, or pick a city. Until then the app shows ${geolocation.anchor ? 'the last area this device was in' : 'Seattle–Tacoma'}.`
                  : geolocation.anchor
                    ? `Following your location${region ? `: ${region.name}` : ''}.`
                    : 'Waiting for your location. If your phone or tablet asks, tap Allow.'}{' '}
                <span className="text-fg-3">
                  Your exact location stays on this device. The weather lookup is given your position rounded to about three miles, and
                  the map service can tell which part of the map you are looking at.
                </span>
              </span>
            </p>
          )}

          {area.mode === 'city' && (
            <CitySearch current={area} onPick={(city) => updateSettings({ area: { mode: 'city', ...city } })} />
          )}
        </Section>

        <Section title="Navigation app" hint="Staging-spot buttons open turn-by-turn directions here.">
          <Segmented label="Navigation app" options={NAV_APPS} value={settings.navApp} onChange={(navApp) => updateSettings({ navApp })} />
        </Section>

        <Section title="Simulation clock" hint="Jump to a typical moment in the week to see how the forecast behaves.">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSimOffset(0)}
              aria-pressed={simOffset === 0}
              className={cx(
                'col-span-2 h-11 rounded-xl border text-[13px] font-medium',
                simOffset === 0 ? 'border-accent bg-accent text-accent-ink' : 'border-line-2 bg-raised',
              )}
            >
              {simOffset === 0 ? 'Running on the live clock' : 'Back to the live clock'}
            </button>
            {SCENARIOS.map(([label, dow, hour, minute]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onSimOffset(offsetTo(dow, hour, minute, region?.timeZone ?? 'America/Los_Angeles'));
                  onClose();
                }}
                className="min-h-11 rounded-xl border border-line-2 bg-raised px-2 py-1.5 text-[12px] font-medium leading-tight"
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Data sources">
          <dl className="space-y-2 text-[12px] leading-snug">
            {region && (
              <div>
                <dt className="font-medium text-fg-2">Area · {region.name}</dt>
                <dd className="text-fg-3">
                  {region.source === 'curated'
                    ? 'Hand-tuned zones, staging spots and venues.'
                    : `Built on this device from a US gazetteer: ${region.zones.length} zones from towns and neighbourhoods, staging at their centres${region.airport ? `, flights at ${region.airport.code}` : ''}, and big-league venues only.`}
                </dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-fg-2">Flights</dt>
              <dd className="text-fg-3">
                Simulated arrivals at {airport} with a 20 to 35 minute touchdown-to-request lag, and departures that pull riders from home 90
                to 170 minutes ahead. Volumes are sized to the airport.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-fg-2">Weather</dt>
              <dd className="text-fg-3">
                Live forecast from Open-Meteo, not simulated. It follows where you are: the app sends your position (or the centre of
                your area), rounded to about three miles, to get it.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-fg-2">Map</dt>
              <dd className="text-fg-3">
                Street map from OpenFreeMap, drawn from OpenStreetMap data. It needs a connection; offline, the radar switches to a
                sketch that needs none.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-fg-2">Venues</dt>
              <dd className="text-fg-3">The venues are real; schedules, line-ups and crowd sizes are invented.</dd>
            </div>
            <div>
              <dt className="font-medium text-fg-2">Forecast · {model?.label ?? 'TimesFM'}</dt>
              <dd className="text-fg-3">
                {model ? `${model.note} ${model.contextSteps / 96} days of history, ${model.horizonSteps} steps of ${model.stepMin} minutes.` : 'Loading.'}
              </dd>
            </div>
            {STATIC_EXPORT && (
              <div>
                <dt className="font-medium text-fg-2">Hosted demo</dt>
                <dd className="text-fg-3">This copy has no server. The whole engine runs in your browser, so it keeps working offline.</dd>
              </div>
            )}
            {snapshot && (
              <div>
                <dt className="font-medium text-fg-2">Last update</dt>
                <dd className="text-fg-3">
                  {fmtClock(snapshot.generatedAt)} local time ({snapshot.region.timeZone.replace(/_/g, ' ')})
                </dd>
              </div>
            )}
          </dl>
        </Section>

        <p className="rounded-xl border border-line bg-raised p-3 text-[12px] leading-snug text-fg-3">
          Every number in this build comes from simulated feeds. Treat it as a planning aid, not a promise of fares, and set your
          destination before you drive.
        </p>
      </div>
    </Sheet>
  );
}
