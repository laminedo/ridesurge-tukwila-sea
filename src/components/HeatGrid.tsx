'use client';

import { useMemo, useState } from 'react';
import { fmtClock, fmtDuration, fmtMult, fmtShort } from '@/lib/format';
import { heatColor, heatInk } from '@/lib/heat';
import type { Recommendation } from '@/lib/recommend';
import type { ZoneId } from '@/lib/types';
import type { View } from '@/lib/view';
import { useRegion } from './RegionContext';
import { Card, HeatLegend, MultBadge, Segmented, cx } from './ui';

type Sort = 'hot' | 'near';
const SORTS = [
  { id: 'hot', label: 'Hottest first' },
  { id: 'near', label: 'Nearest first' },
] as const;

/** Calm cells stay unlabelled so the surges are what the eye lands on. */
const LABEL_FROM = 1.3;

function Driver({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cx('size-2 rounded-[2px]', swatch)} aria-hidden />
      <dt className="text-fg-3">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function HeatGrid({
  view,
  recs,
  sel,
  onSelect,
  onZone,
  limit,
  onMore,
  className,
}: {
  view: View;
  recs: Recommendation[];
  sel: number;
  onSelect: (step: number) => void;
  onZone: (zone: ZoneId) => void;
  /** Show only the first rows (the overview keeps to the top of the list). */
  limit?: number;
  onMore?: () => void;
  className?: string;
}) {
  const { info, zoneById } = useRegion();
  const zones = info.zones;
  const [sort, setSort] = useState<Sort>('hot');
  const [picked, setPicked] = useState<ZoneId | null>(null);

  const rows = useMemo(() => {
    const drive = new Map(recs.map((r) => [r.zone.id, r.driveMin]));
    const peak = (id: ZoneId) => view.byZone[id].reduce((max, s) => Math.max(max, s.mult), 1);
    const nearer = (a: ZoneId, b: ZoneId) => (drive.get(a) ?? 0) - (drive.get(b) ?? 0);
    const sorted = zones.map((zone) => ({ zone, driveMin: drive.get(zone.id) ?? 0 })).sort((a, b) =>
      sort === 'hot' ? peak(b.zone.id) - peak(a.zone.id) || nearer(a.zone.id, b.zone.id) : nearer(a.zone.id, b.zone.id),
    );
    return limit ? sorted.slice(0, limit) : sorted;
  }, [view, recs, sort, limit, zones]);

  const focusId = picked && rows.some((r) => r.zone.id === picked) ? picked : rows[0].zone.id;
  const focus = view.byZone[focusId][sel];

  return (
    // A container, so the layout follows the card's own width wherever it is placed.
    <Card className={cx('@container p-3', className)}>
      <div className="px-1">
        <h2 className="text-[15px] font-semibold">Zone demand heat grid</h2>
        <p className="mt-0.5 text-[12px] text-fg-3">
          {limit ? `Top ${rows.length} of ${zones.length} zones` : `All ${zones.length} zones`}, every 15 minutes for the next{' '}
          {fmtDuration(view.steps.length * 15)}.
        </p>
      </div>

      <div className="mt-3 @4xl:max-w-sm">
        <Segmented label="Row order" options={SORTS} value={sort} onChange={setSort} />
      </div>

      <div className="@4xl:flex @4xl:items-start @4xl:gap-4">
      <div className="min-w-0 flex-1">
      <table className="mt-2 w-full table-fixed border-separate border-spacing-[2px]">
        <caption className="sr-only">Forecast surge multiplier by zone and time</caption>
        <colgroup>
          <col className="w-[3.4rem]" />
          {view.steps.map((t) => (
            <col key={t} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="pb-1 pl-1 text-left align-bottom text-[10px] font-medium text-fg-3">
              Zone
            </th>
            {view.steps.map((t, i) => (
              <th key={t} scope="col" className="p-0">
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-label={`Show ${i === 0 ? 'now' : fmtClock(t)}`}
                  aria-pressed={i === sel}
                  className={cx(
                    'flex h-8 w-full flex-col items-center justify-end gap-0.5 text-[10px] tabular-nums',
                    i === sel ? 'font-semibold text-accent' : 'text-fg-3',
                  )}
                >
                  {i === 0 ? 'Now' : new Date(t).getUTCMinutes() === 0 ? fmtShort(t) : ''}
                  <span className={cx('h-0.5 w-full rounded-full', i === sel ? 'bg-accent' : 'bg-transparent')} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ zone, driveMin }) => (
            <tr key={zone.id}>
              <th scope="row" className="p-0">
                <button
                  type="button"
                  onClick={() => onZone(zone.id)}
                  aria-label={`${zone.name}, ${fmtDuration(driveMin)} away. Open details`}
                  className="flex h-9 w-full flex-col items-start justify-center pl-1 text-left @4xl:h-11"
                >
                  <span className={cx('text-[12px] font-semibold leading-none', zone.id === focusId ? 'text-accent' : 'text-fg')}>
                    {zone.code}
                  </span>
                  <span className="mt-1 text-[10px] font-normal leading-none tabular-nums text-fg-3">{driveMin} min</span>
                </button>
              </th>
              {view.byZone[zone.id].map((s, i) => {
                const active = zone.id === focusId && i === sel;
                return (
                  <td key={s.t} className="p-0">
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(zone.id);
                        onSelect(i);
                      }}
                      aria-label={`${zone.name}, ${i === 0 ? 'now' : fmtClock(s.t)}: ${fmtMult(s.mult)}`}
                      aria-pressed={active}
                      className={cx(
                        'flex h-9 w-full items-center justify-center rounded-[4px] text-[10px] font-semibold tabular-nums @2xl:text-[12px] @4xl:h-11',
                        active && 'relative z-10 outline outline-2 outline-fg',
                      )}
                      style={{ background: heatColor(s.mult), color: heatInk(s.mult) }}
                    >
                      {s.mult >= LABEL_FROM ? s.mult.toFixed(1) : ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {limit && onMore && (
        <button type="button" onClick={onMore} className="mt-2 h-10 w-full rounded-xl border border-line-2 text-[13px] font-medium">
          Show all {zones.length} zones
        </button>
      )}
      <HeatLegend className="mt-3 px-1" />
      </div>

      <div className="mt-3 rounded-xl border border-line bg-raised p-3 @4xl:mt-2 @4xl:w-80 @4xl:shrink-0" aria-live="polite">
        <div className="flex items-center gap-3">
          <MultBadge mult={focus.mult} className="h-10 w-14 text-[17px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{zoneById[focusId]?.name}</p>
            <p className="truncate text-[12px] text-fg-3">
              {sel === 0 ? 'Now' : fmtClock(focus.t)} ·{' '}
              {focus.lo === focus.hi ? 'no surge expected' : `range ${focus.lo.toFixed(1)}–${fmtMult(focus.hi)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onZone(focusId)}
            className="h-10 shrink-0 rounded-lg border border-line-2 px-3 text-[13px] font-medium"
          >
            Details
          </button>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
          <div className="flex items-center gap-1.5">
            <dt className="text-fg-3">Requests / 15 min</dt>
            <dd className="font-medium tabular-nums">{focus.demand}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-fg-3">Driver capacity</dt>
            <dd className="font-medium tabular-nums">{focus.supply}</dd>
          </div>
        </dl>
        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
          <Driver swatch="bg-baseline" label="Everyday" value={focus.organic} />
          <Driver swatch="bg-flights" label="Arrivals" value={focus.flights} />
          <Driver swatch="bg-airport" label="To airport" value={focus.airport} />
          <Driver swatch="bg-events" label="Events" value={focus.events} />
        </dl>
      </div>
      </div>
    </Card>
  );
}
