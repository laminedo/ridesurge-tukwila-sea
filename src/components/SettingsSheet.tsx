'use client';

import { STATIC_EXPORT } from '@/lib/client/env';
import { updateSettings, type Geolocation, type Settings } from '@/lib/client/stores';
import { fmtClock } from '@/lib/format';
import { NAV_APPS } from '@/lib/nav';
import { DAY, HOUR, MIN, localClock, pacificOffsetMs } from '@/lib/time';
import type { Snapshot } from '@/lib/types';
import { HOME_BASE } from '@/lib/zones';
import { Sheet } from './Sheet';
import { Segmented, cx } from './ui';

const ORIGINS = [
  { id: 'home', label: 'Tukwila base' },
  { id: 'gps', label: 'My location' },
] as const;

/** Moments worth rehearsing: [label, weekday (0 = Sunday), local hour, minute]. */
const SCENARIOS: readonly (readonly [string, number, number, number])[] = [
  ['Fri 10:30 PM · shows let out', 5, 22, 30],
  ['Sat 1:40 AM · bar close', 6, 1, 40],
  ['Sat 8:15 AM · cruise morning', 6, 8, 15],
  ['Sun 4:00 PM · game day', 0, 16, 0],
  ['Mon 8:00 AM · commute', 1, 8, 0],
  ['Thu 5:15 PM · rush + conventions', 4, 17, 15],
];

/** Next occurrence of a local weekday and time, as an offset from the real clock. */
function offsetTo(dow: number, hour: number, minute: number): number {
  const now = Date.now();
  const offset = pacificOffsetMs(now);
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

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-5">
        <Section title="Navigation app" hint="Staging-spot buttons open turn-by-turn directions here.">
          <Segmented label="Navigation app" options={NAV_APPS} value={settings.navApp} onChange={(navApp) => updateSettings({ navApp })} />
        </Section>

        <Section title="Drive times from" hint={`Your base is ${HOME_BASE.label}. Location stays on this device and is never sent to the server.`}>
          <Segmented label="Drive times from" options={ORIGINS} value={settings.origin} onChange={(origin) => updateSettings({ origin })} />
          {settings.origin === 'gps' && (
            <p className="mt-2 text-[12px] text-fg-3" role="status">
              {geolocation.error
                ? `${geolocation.error} Using the Tukwila base instead.`
                : geolocation.position
                  ? 'Using your current location.'
                  : 'Waiting for a location fix. Using the Tukwila base until then.'}
            </p>
          )}
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
                  onSimOffset(offsetTo(dow, hour, minute));
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
            <div>
              <dt className="font-medium text-fg-2">Flights</dt>
              <dd className="text-fg-3">Simulated Sea-Tac arrivals with a 20 to 35 minute touchdown-to-request lag.</dd>
            </div>
            <div>
              <dt className="font-medium text-fg-2">Venues</dt>
              <dd className="text-fg-3">Simulated schedule for stadiums, arenas, theaters, conventions and cruise piers. Matchups are invented.</dd>
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
                <dd className="text-fg-3">{fmtClock(snapshot.generatedAt)} Pacific</dd>
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
