'use client';

import { Building2, Drama, Martini, Music, PartyPopper, Ship, Trophy, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { fmtClock, fmtCount, fmtRange, fmtRelative, fmtShort } from '@/lib/format';
import type { NavApp } from '@/lib/nav';
import { MIN } from '@/lib/time';
import type { EventFeed, EventKind, VenueEvent } from '@/lib/types';
import { clamp } from '@/lib/util';
import { SPOT_BY_ID, ZONE_BY_ID } from '@/lib/zones';
import { Card, NavLink, Segmented, cx } from './ui';

const KIND_ICON: Record<EventKind, LucideIcon> = {
  sports: Trophy,
  concert: Music,
  theater: Drama,
  convention: Building2,
  cruise: Ship,
  festival: PartyPopper,
  nightlife: Martini,
};

/** Ride requests leaving the venue over time, with a marker for "now". */
function EgressCurve({ event, now }: { event: VenueEvent; now: number }) {
  const W = 300;
  const H = 44;
  const { curve } = event;
  const slot = W / curve.length;
  const max = Math.max(1, ...curve.map((c) => c.requests));
  const span = curve.length * event.bucketMin * MIN;
  const nowX = ((now - curve[0].t) / span) * W;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-11 w-full"
        role="img"
        aria-label={`Egress ride requests from ${fmtClock(curve[0].t)}, peaking around ${fmtClock(event.egressPeak)}`}
      >
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--color-line-2)" strokeWidth="1" />
        {curve.map((c, i) => {
          const h = (c.requests / max) * (H - 4);
          return h > 0.5 ? (
            <rect key={c.t} x={i * slot + 1} y={H - h} width={Math.max(1, slot - 2)} height={h} rx="1.5" fill="var(--color-events)" />
          ) : null;
        })}
        {nowX > 0 && nowX < W && <line x1={nowX} x2={nowX} y1="0" y2={H} stroke="var(--color-fg)" strokeWidth="1.5" />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-fg-3" aria-hidden>
        <span>{fmtShort(curve[0].t)}</span>
        <span>peak {fmtShort(event.egressPeak)}</span>
        <span>{fmtShort(curve[0].t + span)}</span>
      </div>
    </div>
  );
}

/** The moment that matters for a driver, and what to call it. */
function exitTime(event: VenueEvent): { label: string; t: number } {
  if (event.kind === 'cruise') return { label: 'Peak exit', t: event.egressPeak };
  if (event.kind === 'nightlife') return { label: 'Closes', t: event.end };
  return { label: 'Lets out', t: event.end };
}

function statusLine(event: VenueEvent, now: number): { label: string; live: boolean } {
  if (event.kind === 'nightlife') {
    if (event.status === 'upcoming') return { label: `Opens ${fmtClock(event.start)}`, live: false };
    if (event.status === 'live') return { label: 'Open', live: false };
    if (event.status === 'egress') return { label: now < event.end - 30 * MIN ? 'Starting to empty' : 'Closing rush', live: true };
    return { label: 'Closed', live: false };
  }
  switch (event.status) {
    case 'upcoming':
      return { label: `Starts ${fmtClock(event.start)}`, live: false };
    case 'live':
      return { label: 'In progress', live: false };
    case 'egress':
      return { label: now < event.egressPeak ? 'Letting out now' : 'Crowd thinning', live: true };
    default:
      return { label: 'Cleared', live: false };
  }
}

function EventCard({ event, now, navApp }: { event: VenueEvent; now: number; navApp: NavApp }) {
  const Icon = KIND_ICON[event.kind];
  const spot = SPOT_BY_ID[event.stagingSpotId];
  const { label, live } = statusLine(event, now);
  const exit = exitTime(event);
  const nightlife = event.kind === 'nightlife';
  const untilMin = clamp((event.egressStart - now) / MIN, -999, 9999);

  return (
    <Card className={cx(live && 'border-line-2')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
            <span className="flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-fg-2">
              <Icon className="size-3 text-events" aria-hidden />
              {event.tag}
            </span>
            <span className={cx('flex items-center gap-1.5', live ? 'text-fg' : 'text-fg-3')}>
              {live && <span className="pulse-dot size-1.5 rounded-full bg-warning" aria-hidden />}
              {label}
            </span>
          </p>
          {/* For a club the venue is the headline; for a show it is the event. */}
          <h3 className="mt-1.5 text-[16px] font-semibold leading-snug">{nightlife ? event.venue : event.title}</h3>
          <p className="mt-0.5 truncate text-[12px] text-fg-3">
            {nightlife ? event.title : event.venue} · {ZONE_BY_ID[event.zoneId].name}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-fg-3">{exit.label}</p>
          <p className="text-[21px] font-semibold leading-tight tabular-nums">{fmtShort(exit.t)}</p>
          <p className="text-[11px] tabular-nums text-fg-3">
            {event.kind === 'nightlife'
              ? 'last call'
              : event.status === 'egress' || event.status === 'cleared'
                ? `clears ${fmtShort(event.egressEnd)}`
                : `± ${event.endUncertaintyMin} min`}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <EgressCurve event={event} now={now} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <dt className="text-fg-3">{event.kind === 'nightlife' ? 'Through the door' : 'Crowd'}</dt>
          <dd className="font-medium tabular-nums">{fmtCount(event.attendance)}</dd>
        </div>
        <div>
          <dt className="text-fg-3">Ride requests</dt>
          <dd className="font-medium tabular-nums">~{fmtCount(event.requests)}</dd>
        </div>
        <div>
          <dt className="text-fg-3">Exit window</dt>
          <dd className="font-medium tabular-nums">{fmtRange(event.egressStart, event.egressEnd)}</dd>
        </div>
      </dl>

      {spot && event.status !== 'cleared' && (
        <div className="mt-3 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[12px] text-fg-3">
            {untilMin > 0 ? `First riders ${fmtRelative(untilMin)}. ` : ''}
            Stage at <span className="text-fg-2">{spot.name}</span>
          </p>
          <NavLink spot={spot} app={navApp} variant="quiet" className="shrink-0">
            Navigate
          </NavLink>
        </div>
      )}
    </Card>
  );
}

/** Compact list of the next dismissals for the overview. */
export function EventsSummary({
  feed,
  now,
  onMore,
  className,
}: {
  feed: EventFeed;
  now: number;
  onMore: () => void;
  className?: string;
}) {
  const next = feed.events
    .filter((e) => e.status !== 'cleared')
    .sort((a, b) => a.egressStart - b.egressStart)
    .slice(0, 3);

  return (
    <Card className={cx('p-3', className)}>
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold">Next dismissals</h2>
        <button type="button" onClick={onMore} className="-my-2 h-9 text-[12px] font-medium text-accent">
          All events
        </button>
      </div>
      {next.length > 0 ? (
        <ul className="mt-1 divide-y divide-line px-1">
          {next.map((event) => {
            const Icon = KIND_ICON[event.kind];
            const { label, live } = statusLine(event, now);
            return (
              <li key={event.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-raised">
                  <Icon className="size-4 text-events" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{event.kind === 'nightlife' ? event.venue : event.title}</span>
                  <span className="block truncate text-[12px] text-fg-3">
                    {event.kind === 'nightlife' ? event.tag : event.venue} · {live ? label : `${fmtCount(event.attendance)} people`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-semibold tabular-nums">{fmtShort(exitTime(event).t)}</span>
                  <span className="block text-[11px] text-fg-3">{live ? 'now' : exitTime(event).label.toLowerCase()}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 py-4 text-[13px] text-fg-3">No stadium, arena, theater or cruise dismissals in the next 18 hours.</p>
      )}
    </Card>
  );
}

type Filter = 'all' | 'shows' | 'clubs';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'shows', label: 'Shows & games' },
  { id: 'clubs', label: 'Clubs' },
] as const;

export function EventsPanel({ feed, now, navApp }: { feed: EventFeed; now: number; navApp: NavApp }) {
  const [filter, setFilter] = useState<Filter>('all');

  // What is letting out now first, then the next dismissals in order.
  const events = feed.events
    .filter((e) => filter === 'all' || (filter === 'clubs') === (e.kind === 'nightlife'))
    .sort((a, b) => {
      const rank = (e: VenueEvent) => (e.status === 'egress' ? 0 : e.status === 'cleared' ? 2 : 1);
      return rank(a) - rank(b) || a.egressStart - b.egressStart;
    });

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-[15px] font-semibold">Venues, clubs and dismissals</h2>
        <p className="mt-0.5 text-[12px] text-fg-3">
          When each crowd lets out or each club closes, how fast it clears and where to stage ahead of it.
        </p>
      </div>
      <div className="md:max-w-lg">
        <Segmented label="Filter venues" options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      {events.length > 0 ? (
        <div className="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} now={now} navApp={navApp} />
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-[14px] font-medium">
            {filter === 'clubs' ? 'No clubs open in the next 12 hours' : 'Nothing letting out in the next 18 hours'}
          </p>
          <p className="mt-1 text-[13px] text-fg-3">
            {filter === 'clubs'
              ? 'Club nights run Thursday to Saturday; the showgirls clubs open nightly from early evening.'
              : 'No stadium, arena, theater or cruise dismissals are on the schedule. Flight waves and everyday demand still drive the radar.'}
          </p>
        </Card>
      )}
    </div>
  );
}
