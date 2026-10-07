'use client';

import { useState, type PointerEvent } from 'react';
import { fmtCount, fmtDuration, fmtRange, fmtRelative, fmtShort, fmtShortRange } from '@/lib/format';
import type { NavApp } from '@/lib/nav';
import { MIN } from '@/lib/time';
import type { Flight, FlightFeed, FlightWave } from '@/lib/types';
import { clamp } from '@/lib/util';
import { defaultSpot } from '@/lib/zones';
import { Card, Eyebrow, NavLink, Segmented, cx } from './ui';

/* ---------- Chart ---------- */

const W = 344;
const H = 190;
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

  return (
    <div className="relative">
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
            <rect key={b.t} x={x(i) + 1} y={top} width={slot - 2} height={floor - top} rx={Math.min(2, (floor - top) / 2)} fill="var(--color-baseline)" />
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
          style={{ left: `${clamp(((x(hover) + slot / 2) / W) * 100, 27, 73)}%` }}
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
      <NavLink spot={defaultSpot('SEA')} app={navApp} variant="icon" />
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

export function FlightMonitor({
  feed,
  now,
  driveMin,
  navApp,
}: {
  feed: FlightFeed;
  now: number;
  /** Drive time from the driver to the airport waiting lot. */
  driveMin: number;
  navApp: NavApp;
}) {
  const bucketMs = feed.bucketMin * MIN;
  const curbNow = feed.buckets.filter((b) => b.t + bucketMs > now && b.t < now + 15 * MIN).reduce((s, b) => s + b.curb, 0);
  const landingSoon = feed.arrivals.filter((f) => f.touchdown >= now && f.touchdown < now + 60 * MIN);
  const wave = feed.waves[0];

  return (
    <div className="space-y-3">
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

      <Card className="p-3">
        <div className="px-1">
          <h2 className="text-[15px] font-semibold">Flight wave monitor</h2>
          <p className="mt-0.5 text-[12px] text-fg-3">Sea-Tac ride requests per {feed.bucketMin} minutes</p>
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

      <Card className="p-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[15px] font-semibold">Upcoming waves</h2>
          <Eyebrow>Stage 5 min early</Eyebrow>
        </div>
        {feed.waves.length > 0 ? (
          <ul className={cx('mt-1 divide-y divide-line px-1')}>
            {feed.waves.map((w) => (
              <WaveRow key={w.id} wave={w} now={now} driveMin={driveMin} navApp={navApp} />
            ))}
          </ul>
        ) : (
          <p className="px-1 py-4 text-[13px] text-fg-3">
            No arrival bank stands out in the next three hours. Demand at the curb is flat; watch the chart for the next build-up.
          </p>
        )}
      </Card>

      <Arrivals flights={feed.arrivals} />
    </div>
  );
}
