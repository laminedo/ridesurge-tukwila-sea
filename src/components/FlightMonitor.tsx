'use client';

import { ChevronRight } from 'lucide-react';
import { useState, type PointerEvent } from 'react';
import { useElementWidth } from '@/lib/client/stores';
import { fmtCount, fmtDuration, fmtRange, fmtRelative, fmtShort, fmtShortRange } from '@/lib/format';
import type { NavApp } from '@/lib/nav';
import { MIN } from '@/lib/time';
import type { Recommendation } from '@/lib/recommend';
import type { AirportRunFeed, Flight, FlightFeed, FlightWave, ZoneId } from '@/lib/types';
import { clamp } from '@/lib/util';
import { useRegion } from './RegionContext';
import { Card, Eyebrow, MultBadge, NavLink, Segmented, cx } from './ui';

/* ---------- Chart ---------- */

const PAD = { left: 28, right: 8, top: 20, bottom: 24 };

function niceCeil(value: number): number {
  for (const step of [10, 20, 30, 40, 60, 80, 100, 120, 160, 200, 300, 400, 600, 800]) {
    if (value <= step) return step;
  }
  return Math.ceil(value / 500) * 500;
}

/**
 * Both series share one unit and one axis (ride requests per 5 minutes): the
 * bars place each flight's riders at touchdown, the line places the same
 * riders where they actually request. The gap between them is the lag.
 */
function WaveChart({ feed, now }: { feed: FlightFeed; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the card's real pixel width, so type and strokes stay the same size on any screen.
  const [frame, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || 344;
  const H = W >= 640 ? 250 : 190;
  const { buckets } = feed;
  const bucketMs = feed.bucketMin * MIN;
  const slot = (W - PAD.left - PAD.right) / buckets.length;
  const max = niceCeil(Math.max(1, ...buckets.map((b) => Math.max(b.landing, b.curb))));
  const floor = H - PAD.bottom;
  const x = (i: number) => PAD.left + i * slot;
  const y = (v: number) => PAD.top + (floor - PAD.top) * (1 - v / max);
  const timeX = (t: number) => clamp(PAD.left + ((t - buckets[0].t) / bucketMs) * slot, PAD.left, W - PAD.right);

  const points = buckets.map((b, i) => `${(x(i) + slot / 2).toFixed(1)} ${y(b.curb).toFixed(1)}`);
  const line = `M${points.join('L')}`;
  const area = `${line}L${(x(buckets.length - 1) + slot / 2).toFixed(1)} ${floor}L${(x(0) + slot / 2).toFixed(1)} ${floor}Z`;

  const nextWave = feed.waves.find((w) => w.peak >= now - bucketMs);
  const peakIdx = nextWave ? buckets.findIndex((b) => b.t === nextWave.peak) : -1;
  const nowX = timeX(now);

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    setHover(clamp(Math.floor((px - PAD.left) / slot), 0, buckets.length - 1));
  };

  const shown = hover === null ? null : buckets[hover];
  // Thin marks: wider screens get more air between bars, not fatter bars.
  const bar = Math.min(12, slot - 2);

  return (
    <div ref={frame} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-pan-y select-none"
        role="img"
        aria-label="Ride requests per five minutes: riders by touchdown time against riders at the curb 20 to 35 minutes later"
        tabIndex={0}
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const from = hover ?? Math.floor((nowX - PAD.left) / slot);
          setHover(clamp(from + (event.key === 'ArrowRight' ? 1 : -1), 0, buckets.length - 1));
        }}
      >
        {/* Wave windows */}
        {feed.waves.map((w) => (
          <rect
            key={w.id}
            x={timeX(w.start)}
            y={PAD.top}
            width={Math.max(0, timeX(w.end) - timeX(w.start))}
            height={floor - PAD.top}
            fill="var(--color-flights)"
            opacity="0.09"
            rx="2"
          />
        ))}

        {/* Grid and y-axis */}
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={PAD.left - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--color-fg-3)" className="tabular-nums">
              {v}
            </text>
          </g>
        ))}

        {/* Riders by touchdown time */}
        {buckets.map((b, i) => {
          const top = y(b.landing);
          return b.landing > 0 ? (
            <rect key={b.t} x={x(i) + (slot - bar) / 2} y={top} width={bar} height={floor - top} rx={Math.min(bar > 8 ? 4 : 2, (floor - top) / 2)} fill="var(--color-baseline)" />
          ) : null;
        })}

        {/* Riders at the curb */}
        <path d={area} fill="var(--color-flights)" opacity="0.12" />
        <path d={line} fill="none" stroke="var(--color-flights)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Everything left of "now" has already happened */}
        <rect x={PAD.left} y={PAD.top} width={nowX - PAD.left} height={floor - PAD.top} fill="var(--color-surface)" opacity="0.45" />
        <line x1={nowX} x2={nowX} y1={PAD.top - 6} y2={floor} stroke="var(--color-fg-2)" strokeWidth="1" />
        <text x={nowX} y={PAD.top - 9} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--color-fg-2)">
          now
        </text>

        {/* Peak of the next wave, labelled directly */}
        {nextWave && peakIdx >= 0 && (
          <g>
            <circle cx={x(peakIdx) + slot / 2} cy={y(buckets[peakIdx].curb)} r="4.5" fill="var(--color-flights)" stroke="var(--color-surface)" strokeWidth="2" />
            <text
              x={clamp(x(peakIdx) + slot / 2, PAD.left + 34, W - PAD.right - 34)}
              y={Math.max(PAD.top + 8, y(buckets[peakIdx].curb) - 9)}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="600"
              fill="var(--color-fg)"
            >
              peak {fmtShort(nextWave.peak)}
            </text>
          </g>
        )}

        {/* Time axis */}
        {buckets.map((b, i) =>
          new Date(b.t).getUTCMinutes() % 30 === 0 && x(i) > PAD.left + 10 && x(i) < W - PAD.right - 12 ? (
            <text key={b.t} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--color-fg-3)" className="tabular-nums">
              {fmtShort(b.t)}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <line x1={x(hover) + slot / 2} x2={x(hover) + slot / 2} y1={PAD.top} y2={floor} stroke="var(--color-fg)" strokeWidth="1" opacity="0.6" />
        )}
      </svg>

      {shown && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border border-line-2 bg-raised px-2.5 py-2 text-[11px] shadow-lg"
          style={{ left: clamp(x(hover) + slot / 2, 92, W - 92) }}
        >
          <p className="font-semibold tabular-nums">{fmtRange(shown.t, shown.t + bucketMs)}</p>
          <p className="mt-1 flex justify-between gap-2 text-fg-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-baseline" />
              Touching down
            </span>
            <span className="tabular-nums text-fg">{Math.round(shown.landing)}</span>
          </p>
          <p className="flex justify-between gap-2 text-fg-2">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-2 rounded-full bg-flights" />
              At the curb
            </span>
            <span className="tabular-nums text-fg">{Math.round(shown.curb)}</span>
          </p>
          <p className="mt-1 text-fg-3">
            {shown.flights} {shown.flights === 1 ? 'flight' : 'flights'} · {fmtCount(shown.pax)} passengers landed
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Supporting pieces ---------- */

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="truncate text-[11px] text-fg-3">{label}</p>
      <p className="mt-0.5 truncate text-[19px] font-semibold leading-tight">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-fg-3">{detail}</p>
    </div>
  );
}

function WaveRow({ wave, now, driveMin, navApp }: { wave: FlightWave; now: number; driveMin: number; navApp: NavApp }) {
  const underway = wave.start <= now;
  const leaveIn = (wave.start - 5 * MIN - driveMin * MIN - now) / MIN;
  const catchable = now + driveMin * MIN < wave.end - 5 * MIN;
  const { airportSpot } = useRegion();
  const advice = !catchable ? 'Ends before you could get there' : underway || leaveIn <= 1 ? 'Head to the lot now' : `Leave in ${fmtDuration(leaveIn)}`;
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold tabular-nums">
          {fmtRange(wave.start, wave.end)}
          <span className="text-[12px] font-medium text-fg-3">
            {underway ? 'at the curb now' : fmtRelative((wave.start - now) / MIN)}
          </span>
        </p>
        <p className="mt-0.5 text-[12px] text-fg-2">
          About {fmtCount(wave.requests)} ride requests from {wave.flights} arrivals
          {wave.international > 0 && ` (${wave.international} international)`}
        </p>
        <p className="mt-0.5 text-[12px] text-fg-3">
          {advice} · {fmtDuration(driveMin)} drive
        </p>
      </div>
      {airportSpot && <NavLink spot={airportSpot} app={navApp} variant="icon" />}
    </li>
  );
}

const STATUS_LABEL: Record<Flight['status'], string> = {
  scheduled: 'Scheduled',
  enroute: 'En route',
  landed: 'Landed',
  at_gate: 'At gate',
};

type Filter = 'all' | 'ground' | 'big';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ground', label: 'Landed' },
  { id: 'big', label: 'Long-haul' },
] as const;

function Arrivals({ flights }: { flights: Flight[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);

  const matching = flights.filter((f) =>
    filter === 'ground' ? f.status === 'landed' || f.status === 'at_gate' : filter === 'big' ? f.widebody || f.international : true,
  );
  const visible = expanded ? matching : matching.slice(0, 14);

  return (
    <Card className="p-3">
      <div className="px-1">
        <h2 className="text-[15px] font-semibold">Arrivals feeding the curb</h2>
        <p className="mt-0.5 text-[12px] text-fg-3">Each flight&apos;s riders reach the pickup area 20 to 35 minutes after touchdown.</p>
      </div>
      <div className="mt-3">
        <Segmented label="Filter arrivals" options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <table className="mt-2 w-full table-fixed border-collapse text-left text-[12px]">
        <colgroup>
          <col className="w-[3.6rem]" />
          <col />
          <col className="w-[6.4rem]" />
        </colgroup>
        <thead>
          <tr className="text-[11px] text-fg-3">
            <th scope="col" className="py-1.5 pl-1 font-medium">Lands</th>
            <th scope="col" className="py-1.5 font-medium">Flight</th>
            <th scope="col" className="py-1.5 pr-1 text-right font-medium">At the curb</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((f) => (
            <tr key={f.id} className="border-t border-line align-top">
              <td className="whitespace-nowrap py-2 pl-1 tabular-nums">
                <span className="font-medium">{fmtShort(f.touchdown)}</span>
                {f.delayMin >= 15 && <span className="block text-[11px] text-fg-3">{f.delayMin} m late</span>}
              </td>
              <td className="py-2 pr-2">
                <span className="block truncate">
                  <span className="font-mono font-medium">{f.flightNo}</span>
                  <span className="text-fg-2"> · {f.originCity}</span>
                </span>
                <span className="block truncate text-[11px] text-fg-3">
                  {STATUS_LABEL[f.status]}
                  {f.widebody ? ` · ${f.aircraft}` : ''}
                  {f.international ? ' · customs' : ''} · {f.concourse} gates
                </span>
              </td>
              <td className="whitespace-nowrap py-2 pr-1 text-right tabular-nums">
                <span className="font-medium">{fmtShortRange(f.curbStart, f.curbEnd)}</span>
                <span className="block text-[11px] text-fg-3">
                  {f.pax} pax · ~{Math.round(f.requests)} rides
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {matching.length === 0 && <p className="px-1 py-4 text-[13px] text-fg-3">No arrivals match this filter right now.</p>}
      {matching.length > 14 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 h-11 w-full rounded-xl border border-line-2 text-[13px] font-medium"
        >
          {expanded ? 'Show fewer' : `Show all ${matching.length} arrivals`}
        </button>
      )}
    </Card>
  );
}

/* ---------- Tab ---------- */

/** The wave chart with its legend. */
export function FlightWaveCard({ feed, now, className }: { feed: FlightFeed; now: number; className?: string }) {
  const { info } = useRegion();
  return (
    <Card className={cx('p-3', className)}>
      <div className="px-1">
        <h2 className="text-[15px] font-semibold">Flight wave monitor</h2>
        <p className="mt-0.5 text-[12px] text-fg-3">{info.airport?.code ?? 'Airport'} ride requests per {feed.bucketMin} minutes</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-baseline" aria-hidden />
            Riders touching down
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-flights" aria-hidden />
            Riders at the curb, {feed.lag.minMin}–{feed.lag.maxMin} min later
          </li>
        </ul>
      </div>
      <div className="mt-2">
        <WaveChart feed={feed} now={now} />
      </div>
    </Card>
  );
}

/** Waves still ahead, each with a leave-by time and a navigation button. */
export function UpcomingWavesCard({
  feed,
  now,
  driveMin,
  navApp,
  limit,
  className,
}: {
  feed: FlightFeed;
  now: number;
  driveMin: number;
  navApp: NavApp;
  limit?: number;
  className?: string;
}) {
  const waves = limit ? feed.waves.slice(0, limit) : feed.waves;
  return (
    <Card className={cx('p-3', className)}>
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold">Upcoming waves</h2>
        <Eyebrow>Stage 5 min early</Eyebrow>
      </div>
      {waves.length > 0 ? (
        <ul className="mt-1 divide-y divide-line px-1">
          {waves.map((w) => (
            <WaveRow key={w.id} wave={w} now={now} driveMin={driveMin} navApp={navApp} />
          ))}
        </ul>
      ) : (
        <p className="px-1 py-4 text-[13px] text-fg-3">
          No arrival bank stands out in the next three hours. Demand at the curb is flat; watch the chart for the next build-up.
        </p>
      )}
    </Card>
  );
}

/** Airport-bound ride requests per 15 minutes: one series, so the card title is its legend. */
function RunBars({ feed }: { feed: AirportRunFeed }) {
  const [frame, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || 320;
  const H = 112;
  const pad = { top: 18, bottom: 20 };
  const floor = H - pad.bottom;
  const slot = W / feed.total.length;
  const bar = Math.min(12, slot - 4);
  const max = Math.max(1, ...feed.total);
  const peak = feed.total.indexOf(max);

  return (
    <div ref={frame}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={`Airport-bound ride requests per 15 minutes, peaking near ${fmtShort(feed.steps[peak])} at about ${Math.round(max)}`}
      >
        <line x1="0" x2={W} y1={floor + 0.5} y2={floor + 0.5} stroke="var(--color-line-2)" strokeWidth="1" />
        {feed.total.map((v, i) => {
          const h = (v / max) * (floor - pad.top);
          const x = i * slot + (slot - bar) / 2;
          return (
            <g key={feed.steps[i]}>
              {h > 0.5 && <rect x={x} y={floor - h} width={bar} height={h} rx={Math.min(4, h / 2)} fill="var(--color-airport)" />}
              {i === peak && max >= 1 && (
                <text x={x + bar / 2} y={floor - h - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-fg)">
                  {Math.round(v)}
                </text>
              )}
              {(i === 0 || (i > 1 && new Date(feed.steps[i]).getUTCMinutes() === 0)) && (
                <text x={i * slot + slot / 2} y={H - 5} textAnchor="middle" fontSize="9" fill="var(--color-fg-3)">
                  {i === 0 ? 'Now' : fmtShort(feed.steps[i])}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Rides from home to the airport: how many are coming and which neighbourhoods they start in. */
export function AirportRunsCard({
  feed,
  recs,
  onZone,
  limit = 6,
  className,
}: {
  feed: AirportRunFeed;
  recs: Recommendation[];
  onZone: (zone: ZoneId) => void;
  limit?: number;
  className?: string;
}) {
  const { zoneById } = useRegion();
  const nextHour = feed.total.slice(0, 4).reduce((s, v) => s + v, 0);
  const rec = new Map(recs.map((r) => [r.zone.id, r]));
  const origins = feed.zones
    .map((z) => ({ zoneId: z.zoneId, rides: z.requests.slice(0, 4).reduce((s, v) => s + v, 0) }))
    .filter((z) => z.rides >= 0.5)
    .sort((a, b) => b.rides - a.rides)
    .slice(0, limit);

  return (
    <Card className={cx('p-3', className)}>
      <div className="px-1">
        <h2 className="text-[15px] font-semibold">Rides to the airport</h2>
        <p className="mt-0.5 text-[12px] text-fg-3">
          Riders leave home {feed.lead.minMin} to {feed.lead.maxMin} minutes before take-off.{' '}
          {feed.departing.flights > 0
            ? `${feed.departing.flights} flights depart ${fmtRange(feed.departing.from, feed.departing.to)}.`
            : 'No departures are coming up.'}
        </p>
      </div>

      <div className="mt-3 flex items-baseline gap-2 px-1">
        <p className="text-[26px] font-semibold leading-none">~{fmtCount(nextHour)}</p>
        <p className="text-[12px] text-fg-3">airport rides across the region in the next hour</p>
      </div>
      <div className="mt-2 px-1">
        <RunBars feed={feed} />
      </div>

      {origins.length > 0 ? (
        <>
          <Eyebrow className="mt-3 px-1">Where they start</Eyebrow>
          <ul className="mt-1 divide-y divide-line px-1">
            {origins.map(({ zoneId, rides }) => {
              const r = rec.get(zoneId);
              return (
                <li key={zoneId}>
                  <button type="button" onClick={() => onZone(zoneId)} className="flex h-13 w-full items-center gap-3 text-left">
                    <span className="w-9 shrink-0 text-right text-[17px] font-semibold tabular-nums">{Math.round(rides)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{zoneById[zoneId]?.name}</span>
                      <span className="block truncate text-[12px] text-fg-3">
                        rides next hour{r ? ` · ${fmtDuration(r.driveMin)} away` : ''}
                      </span>
                    </span>
                    {r && <MultBadge mult={r.nowMult} className="shrink-0 text-[12px]" />}
                    <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-2 px-1 text-[13px] text-fg-3">
          Almost nobody is heading to the airport right now. The first riders of the morning bank leave home around 3:30 AM.
        </p>
      )}
    </Card>
  );
}

export function FlightMonitor({
  feed,
  airportRuns,
  recs,
  now,
  driveMin,
  navApp,
  onZone,
}: {
  feed: FlightFeed;
  airportRuns: AirportRunFeed;
  recs: Recommendation[];
  now: number;
  /** Drive time from the driver to the airport waiting lot. */
  driveMin: number;
  navApp: NavApp;
  onZone: (zone: ZoneId) => void;
}) {
  const { info } = useRegion();
  const bucketMs = feed.bucketMin * MIN;
  const curbNow = feed.buckets.filter((b) => b.t + bucketMs > now && b.t < now + 15 * MIN).reduce((s, b) => s + b.curb, 0);
  const landingSoon = feed.arrivals.filter((f) => f.touchdown >= now && f.touchdown < now + 60 * MIN);
  const wave = feed.waves[0];

  if (!info.airport) {
    return (
      <Card>
        <p className="text-[15px] font-semibold">No commercial airport in reach</p>
        <p className="mt-1.5 text-[13px] leading-snug text-fg-3">
          There is no airport with scheduled passenger flights within about 50 miles of {info.home.label}, so there are no flight waves or
          airport runs to plan around here. The radar, heat grid and events still cover your area.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-7">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="At curb now" value={`~${Math.round(curbNow)}`} detail="rides / 15 min" />
          <Tile
            label="Next wave"
            value={wave ? (wave.start <= now ? 'Now' : fmtShort(wave.start)) : 'None'}
            detail={wave ? `~${fmtCount(wave.requests)} rides` : 'in next 3 h'}
          />
          <Tile
            label="Landing in 1 h"
            value={fmtCount(landingSoon.reduce((s, f) => s + f.pax, 0))}
            detail={`pax · ${landingSoon.length} flights`}
          />
        </div>
        <FlightWaveCard feed={feed} now={now} />
        <UpcomingWavesCard feed={feed} now={now} driveMin={driveMin} navApp={navApp} />
      </div>
      <div className="space-y-3 lg:col-span-5">
        <AirportRunsCard feed={airportRuns} recs={recs} onZone={onZone} />
        <Arrivals flights={feed.arrivals} />
      </div>
    </div>
  );
}
