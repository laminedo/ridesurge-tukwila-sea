'use client';

import { useElementWidth } from '@/lib/client/stores';
import { fmtClock, fmtCount, fmtDuration, fmtMult, fmtRange, fmtShort } from '@/lib/format';
import { heatColor, heatInk } from '@/lib/heat';
import type { NavApp } from '@/lib/nav';
import type { Recommendation } from '@/lib/recommend';
import { MIN } from '@/lib/time';
import type { Snapshot, ZoneId, ZoneStep } from '@/lib/types';
import type { View } from '@/lib/view';
import { ZONE_BY_ID, spotsForZone } from '@/lib/zones';
import { CauseIcon } from './BestMove';
import { Sheet } from './Sheet';
import { MultBadge, NavLink } from './ui';

const H = 196;
const PAD = { left: 28, right: 6, top: 10, bottom: 46 };
const GAP = 2;

const SERIES = [
  { key: 'organic', label: 'Everyday', fill: 'var(--color-baseline)', swatch: 'bg-baseline' },
  { key: 'flights', label: 'Arrivals', fill: 'var(--color-flights)', swatch: 'bg-flights' },
  { key: 'airport', label: 'To airport', fill: 'var(--color-airport)', swatch: 'bg-airport' },
  { key: 'events', label: 'Events', fill: 'var(--color-events)', swatch: 'bg-events' },
] as const;

function niceCeil(value: number): number {
  for (const step of [10, 20, 40, 60, 80, 100, 150, 200, 300, 400, 600, 800, 1000]) {
    if (value <= step) return step;
  }
  return Math.ceil(value / 500) * 500;
}

/**
 * Why the zone surges: ride requests stacked by what drives them, against the
 * drivers available to serve them, on one shared axis. The strip underneath
 * is the multiplier that results.
 */
function DemandChart({ steps, sel, onSelect }: { steps: ZoneStep[]; sel: number; onSelect: (step: number) => void }) {
  const [frame, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || 344;
  const slot = (W - PAD.left - PAD.right) / steps.length;
  const BAR = Math.min(24, Math.round(slot * 0.56));
  const floor = H - PAD.bottom;
  const max = niceCeil(Math.max(1, ...steps.map((s) => Math.max(s.demand, s.supply))));
  const scale = (floor - PAD.top) / max;
  const cx = (i: number) => PAD.left + i * slot + slot / 2;
  const supply = steps.map((s, i) => `${cx(i).toFixed(1)} ${(floor - s.supply * scale).toFixed(1)}`);

  return (
    <div ref={frame}>
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full select-none" role="group" aria-label="Ride requests by source against driver capacity, per 15 minutes">
      {[0, max / 2, max].map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={floor - v * scale} y2={floor - v * scale} stroke="var(--color-line)" strokeWidth="1" />
          <text x={PAD.left - 5} y={floor - v * scale + 3} textAnchor="end" fontSize="9" fill="var(--color-fg-3)">
            {v}
          </text>
        </g>
      ))}

      {steps.map((s, i) => {
        let base = floor;
        const top = SERIES.filter((series) => s[series.key] > 0).at(-1)?.key;
        return (
          <g key={s.t}>
            {i === sel && <rect x={cx(i) - slot / 2 + 1} y={PAD.top - 4} width={slot - 2} height={floor - PAD.top + 4} rx="3" fill="var(--color-fg)" opacity="0.07" />}
            {SERIES.map((series) => {
              const height = s[series.key] * scale;
              if (height <= 0) return null;
              const y = base - height;
              base = y;
              // A surface-coloured gap separates the segments; no outlines.
              const drawn = Math.max(1, height - (series.key === top ? 0 : GAP));
              return (
                <rect
                  key={series.key}
                  x={cx(i) - BAR / 2}
                  y={series.key === top ? y : y + GAP}
                  width={BAR}
                  height={drawn}
                  rx={series.key === top ? Math.min(3, drawn / 2) : 0}
                  fill={series.fill}
                />
              );
            })}
          </g>
        );
      })}

      <path d={`M${supply.join('L')}`} fill="none" stroke="var(--color-fg)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {steps.map((s, i) => (
        <circle key={s.t} cx={cx(i)} cy={floor - s.supply * scale} r="3" fill="var(--color-fg)" stroke="var(--color-surface)" strokeWidth="2" />
      ))}

      {/* Resulting multiplier, aligned under each bar */}
      {steps.map((s, i) => (
        <g key={s.t}>
          <rect x={cx(i) - slot / 2 + 1} y={floor + 6} width={slot - 2} height="16" rx="3" fill={heatColor(s.mult)} />
          {s.mult >= 1.2 && (
            <text x={cx(i)} y={floor + 17.5} textAnchor="middle" fontSize="9" fontWeight="600" fill={heatInk(s.mult)}>
              {s.mult.toFixed(1)}
            </text>
          )}
          {(i === 0 || new Date(s.t).getUTCMinutes() === 0) && (
            <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--color-fg-3)">
              {i === 0 ? 'Now' : fmtShort(s.t)}
            </text>
          )}
        </g>
      ))}

      {/* Tap targets wider than the marks */}
      {steps.map((s, i) => (
        <rect
          key={s.t}
          x={cx(i) - slot / 2}
          y={0}
          width={slot}
          height={H}
          fill="transparent"
          role="button"
          tabIndex={0}
          aria-label={`${i === 0 ? 'Now' : fmtClock(s.t)}: ${s.demand} requests, capacity ${s.supply}, ${fmtMult(s.mult)}`}
          aria-pressed={i === sel}
          onClick={() => onSelect(i)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(i);
            }
          }}
          className="cursor-pointer outline-none focus-visible:stroke-accent"
        />
      ))}
    </svg>
    </div>
  );
}

export function ZoneSheet({
  zoneId,
  view,
  snapshot,
  rec,
  sel,
  now,
  navApp,
  onSelect,
  onClose,
}: {
  zoneId: ZoneId | null;
  view: View | null;
  snapshot: Snapshot | null;
  rec: Recommendation | undefined;
  sel: number;
  now: number;
  navApp: NavApp;
  onSelect: (step: number) => void;
  onClose: () => void;
}) {
  const zone = zoneId ? ZONE_BY_ID[zoneId] : null;
  const steps = zone && view ? view.byZone[zone.id] : null;
  const open = Boolean(zone && steps && snapshot);

  return (
    <Sheet open={open} onClose={onClose} title={zone?.name ?? 'Zone'} subtitle={zone?.area}>
      {zone && steps && snapshot && view && (
        <ZoneBody zone={zone.id} steps={steps} snapshot={snapshot} rec={rec} sel={Math.min(sel, steps.length - 1)} now={now} navApp={navApp} onSelect={onSelect} />
      )}
    </Sheet>
  );
}

function ZoneBody({
  zone,
  steps,
  snapshot,
  rec,
  sel,
  now,
  navApp,
  onSelect,
}: {
  zone: ZoneId;
  steps: ZoneStep[];
  snapshot: Snapshot;
  rec: Recommendation | undefined;
  sel: number;
  now: number;
  navApp: NavApp;
  onSelect: (step: number) => void;
}) {
  const step = steps[sel];
  const peak = steps.reduce((best, s) => (s.mult > best.mult ? s : best), steps[0]);
  const horizonEnd = steps[steps.length - 1].t + 15 * MIN;
  const waves = zone === 'SEA' ? snapshot.flights.waves : [];
  const airportNextHour = steps.slice(0, 4).reduce((s, x) => s + x.airport, 0);
  const events = snapshot.events.events.filter(
    (e) => (e.spill[zone] ?? 0) > 0 && e.egressEnd > now && e.egressStart < horizonEnd,
  );

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-raised p-2.5">
          <dt className="text-[11px] text-fg-3">Right now</dt>
          <dd className="mt-1"><MultBadge mult={steps[0].mult} className="text-[17px]" /></dd>
        </div>
        <div className="rounded-xl bg-raised p-2.5">
          <dt className="text-[11px] text-fg-3">Peak · {fmtShort(peak.t)}</dt>
          <dd className="mt-1"><MultBadge mult={peak.mult} className="text-[17px]" /></dd>
        </div>
        <div className="rounded-xl bg-raised p-2.5">
          <dt className="text-[11px] text-fg-3">Drive</dt>
          <dd className="mt-1 text-[17px] font-semibold leading-[1.45]">{rec ? fmtDuration(rec.driveMin) : 'n/a'}</dd>
        </div>
      </dl>

      {rec?.surge && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-raised p-3 text-[13px] leading-snug text-fg-2">
          <CauseIcon cause={rec.cause} className="mt-px size-4 shrink-0" />
          <span>
            {rec.reason}. Be staged by <span className="font-semibold text-fg">{fmtClock(rec.stageBy)}</span>
            {rec.leaveBy > now ? `, leaving by ${fmtClock(rec.leaveBy)}.` : ', so leave now.'}
          </span>
        </p>
      )}

      <section>
        <h3 className="text-[14px] font-semibold">Demand against drivers</h3>
        <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-fg-2">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-[2px] ${s.swatch}`} aria-hidden />
              {s.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-fg" aria-hidden />
            Driver capacity
          </li>
        </ul>
        <div className="mt-2">
          <DemandChart steps={steps} sel={sel} onSelect={onSelect} />
        </div>
        <p className="mt-1 text-[12px] text-fg-2" aria-live="polite">
          <span className="font-semibold text-fg">{sel === 0 ? 'Now' : fmtClock(step.t)}:</span> {step.demand} requests against capacity for{' '}
          {step.supply} gives {fmtMult(step.mult)} (likely {fmtMult(step.lo)} to {fmtMult(step.hi)}).
        </p>
      </section>

      {(waves.length > 0 || events.length > 0 || airportNextHour >= 3) && (
        <section>
          <h3 className="text-[14px] font-semibold">What is coming</h3>
          <ul className="mt-2 space-y-2 text-[13px] text-fg-2">
            {waves.map((w) => (
              <li key={w.id} className="flex items-start gap-2">
                <CauseIcon cause="flights" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium text-fg">{fmtRange(w.start, w.end)}</span> · {w.flights} arrivals, about{' '}
                  {fmtCount(w.requests)} ride requests at the curb
                </span>
              </li>
            ))}
            {airportNextHour >= 3 && (
              <li className="flex items-start gap-2">
                <CauseIcon cause="airport" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium text-fg">Next hour</span> · about {airportNextHour} riders leaving here for Sea-Tac
                </span>
              </li>
            )}
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <CauseIcon cause="events" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium text-fg">{fmtRange(e.egressStart, e.egressEnd)}</span> · {e.title} at {e.venue},{' '}
                  {fmtCount(e.attendance)} people
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-[14px] font-semibold">Staging spots</h3>
        <ul className="mt-2 space-y-2">
          {spotsForZone(zone).map((spot) => (
            <li key={spot.id}>
              <NavLink spot={spot} app={navApp} variant={spot.id === rec?.spot.id ? 'primary' : 'quiet'} className="w-full">
                {spot.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
