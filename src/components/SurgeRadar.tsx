'use client';

import { ArrowUp, LocateFixed, Pause, Play, Star } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useOnline } from '@/lib/client/stores';
import { fmtClock, fmtMult, fmtRange, fmtShort } from '@/lib/format';
import { heatColor, heatInk, type Metric } from '@/lib/heat';
import type { LatLng, Zone, ZoneId, ZoneStep } from '@/lib/types';
import { clamp } from '@/lib/util';
import { risingTo, type View } from '@/lib/view';
import { RadarMap } from './RadarMap';
import { useRegion } from './RegionContext';
import { Card, HeatLegend, MetricSwitch, cx, heatOf } from './ui';

const SWEEP_SECONDS = 7;

function Blip({
  zone,
  steps,
  sel,
  here,
  metric,
  maxDemand,
  onZone,
}: {
  zone: Zone;
  steps: ZoneStep[];
  sel: number;
  here: boolean;
  metric: Metric;
  maxDemand: number;
  onZone: (zone: ZoneId) => void;
}) {
  const current = steps[sel];
  const ahead = risingTo(steps, sel);
  const rising = ahead !== null;
  // Colour and number follow the chosen metric; the ring always warns of a coming surge.
  const { heat, label, level } = heatOf(current, metric, maxDemand);

  // Bearing from the scope centre, so the echo fires as the sweep crosses the blip.
  const bearing = ((Math.atan2(zone.radar.x - 50, 50 - zone.radar.y) * 180) / Math.PI + 360) % 360;
  const style = {
    left: `${zone.radar.x}%`,
    top: `${zone.radar.y}%`,
    width: `${10.2 + clamp((heat - 1) / 2.5, 0, 1) * 0.9}%`,
    background: heatColor(heat),
    color: heatInk(heat),
    // A gap in the surface colour, then (if rising) a ring in the colour of what is coming.
    boxShadow: `0 0 0 1.5px #0a1019${ahead !== null ? `, 0 0 0 4px ${heatColor(ahead)}` : ''}`,
    '--echo': heatColor(heat),
    '--echo-delay': `${(bearing / 360 - 1) * SWEEP_SECONDS}s`,
    '--sweep': `${SWEEP_SECONDS}s`,
  } as CSSProperties;

  return (
    <button
      type="button"
      onClick={() => onZone(zone.id)}
      style={style}
      aria-label={`${zone.name}: ${level.toLowerCase()}, ${metric === 'surge' ? fmtMult(current.mult) : `${current.demand} requests per 15 minutes`}${ahead !== null ? `, surge rising to ${fmtMult(ahead)} within the hour` : ''}`}
      className={cx(
        'absolute flex aspect-square -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full',
        'transition-[background-color,box-shadow,width] duration-300 active:brightness-125',
        heat >= 1.3 && 'blip-echo',
      )}
    >
      {/* Type scales with the scope (cqw), so 21 blips stay legible from a phone to a monitor. */}
      <span className="text-[clamp(8px,2.5cqw,10px)] font-semibold leading-none tracking-wide opacity-85">{zone.code}</span>
      <span className="mt-px text-[clamp(10.5px,3.4cqw,14px)] font-semibold leading-none tabular-nums">{label}</span>
      {rising && (
        <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-fg text-plane">
          <ArrowUp className="size-2.5" strokeWidth={3.5} aria-hidden />
        </span>
      )}
      {here && (
        <span className="absolute -bottom-1 -left-1 flex size-3.5 items-center justify-center rounded-full bg-accent text-accent-ink">
          <LocateFixed className="size-2.5" strokeWidth={2.5} aria-hidden />
        </span>
      )}
    </button>
  );
}

/** The sketch radar: zones laid out by direction around the scope. Used when the street map cannot load. */
function Scope({
  view,
  sel,
  metric,
  hereZoneId,
  onZone,
}: {
  view: View;
  sel: number;
  metric: Metric;
  hereZoneId: ZoneId;
  onZone: (zone: ZoneId) => void;
}) {
  const { info } = useRegion();
  return (
    <div className="@container relative mx-auto mt-3 aspect-square w-full max-w-[520px] md:my-auto">
      <div className="absolute inset-0 overflow-hidden rounded-full border border-line-2 bg-[radial-gradient(circle,#0f1a27_0%,#080d14_100%)]">
        {info.id === 'seattle' ? <SeattleScope /> : <PlainScope />}
        <div className="radar-sweep absolute inset-0 rounded-full" style={{ '--sweep': `${SWEEP_SECONDS}s` } as CSSProperties} aria-hidden />
      </div>
      {info.zones.map((zone) => (
        <Blip
          key={zone.id}
          zone={zone}
          steps={view.byZone[zone.id]}
          sel={sel}
          here={zone.id === hereZoneId}
          metric={metric}
          maxDemand={view.maxDemand}
          onZone={onZone}
        />
      ))}
    </div>
  );
}

/** Backdrop for a generated region: range rings and a north marker, with the driver at the centre. */
function PlainScope() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
      {[16, 32, 48].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="var(--color-line)" strokeWidth="0.3" />
      ))}
      <path d="M50 2V98M2 50H98" stroke="var(--color-line)" strokeWidth="0.2" />
      <text x="51.5" y="6" fontSize="2.4" fontWeight="600" fill="var(--color-fg-3)">
        N
      </text>
    </svg>
  );
}

/** Seattle backdrop: Puget Sound, Lake Washington and the freeway spines for orientation. */
function SeattleScope() {
  const road = { fill: 'none', stroke: 'var(--color-line-2)', strokeWidth: 0.5, strokeLinecap: 'round' } as const;
  const label = { fontSize: 2.4, fill: 'var(--color-fg-3)', opacity: 0.75 } as const;
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
      <path d="M0 0H13C9 14 8 30 9 44c1 8 2 14 0 22-2 12 4 22 6 34H0Z" fill="#0d2136" opacity="0.6" />
      <path d="M66 26c3 6 2 14 2.5 21 .5 6-.5 10-2.5 11-2.5-4-2-10-2.5-17-.5-6 0-11 2.5-15Z" fill="#0d2136" opacity="0.6" />
      {[16, 32, 48].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="var(--color-line)" strokeWidth="0.3" />
      ))}
      <path d="M50 2V98M2 50H98" stroke="var(--color-line)" strokeWidth="0.2" />
      {/* I-5, I-405, I-90, SR-520 and Aurora (SR-99) */}
      <path d="M47 100C47 92 48 84 48 76 48 68 49 62 49 55 49 49 45 46 45 41 45 35 46 30 46 24 46 16 50 10 50 0" {...road} />
      <path d="M48 74C56 74 66 70 71 63 76 55 79 50 79 44 79 36 74 28 72 21 71 14 70 6 69 0" {...road} />
      <path d="M48 56C58 55 70 50 79 46" {...road} />
      <path d="M52 29C62 31 74 32 86 31" {...road} />
      <path d="M40 55C36 48 35 40 35 32 35 24 33 18 34 10 35 6 37 3 38 0" {...road} strokeWidth={0.35} />
      <text x="50" y="66" {...label}>I-5</text>
      <text x="80.5" y="56" {...label}>405</text>
      <text x="62" y="50.5" {...label}>I-90</text>
      <text x="29.5" y="21" {...label}>99</text>
      <text x="20" y="14" {...label} fontWeight="600" opacity="1">N ↑</text>
    </svg>
  );
}

function Scrubber({ steps, sel, onSelect }: { steps: number[]; sel: number; onSelect: (step: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const last = steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => onSelect(sel >= last ? 0 : sel + 1), 900);
    return () => clearInterval(timer);
  }, [playing, sel, last, onSelect]);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause forecast playback' : 'Play forecast forward'}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-2 bg-raised text-fg"
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-px" aria-hidden />}
        </button>
        <input
          type="range"
          className="scrubber min-w-0 flex-1"
          min={0}
          max={last}
          step={1}
          value={sel}
          onChange={(event) => {
            setPlaying(false);
            onSelect(Number(event.target.value));
          }}
          aria-label="Forecast time"
          aria-valuetext={sel === 0 ? 'Now' : fmtClock(steps[sel])}
          style={{ '--fill': `${last ? (sel / last) * 100 : 0}%` } as CSSProperties}
        />
      </div>
      <div className="relative ml-[52px] mt-0.5 h-4 text-[11px] tabular-nums text-fg-3" aria-hidden>
        {steps.map((t, i) =>
          i === 0 || (i > 1 && new Date(t).getUTCMinutes() === 0) ? (
            // The thumb travels between the track's inset ends, so the labels do too.
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `calc(13px + (100% - 26px) * ${last ? i / last : 0})` }}>
              {i === 0 ? 'Now' : fmtShort(t)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function SurgeRadar({
  view,
  sel,
  onSelect,
  onZone,
  hereZoneId,
  bestZoneId,
  origin,
  live,
  metric,
  onMetric,
}: {
  view: View;
  sel: number;
  onSelect: (step: number) => void;
  onZone: (zone: ZoneId) => void;
  metric: Metric;
  onMetric: (metric: Metric) => void;
  /** Zone the driver is in (or based in). */
  hereZoneId: ZoneId;
  /** The top recommendation, starred on the map. */
  bestZoneId: ZoneId | undefined;
  /** Where the driver is, or where drive times start from. */
  origin: LatLng | null;
  /** True when `origin` comes from the device's GPS. */
  live: boolean;
}) {
  const online = useOnline();
  // The street map needs a connection and WebGL; without them the sketch radar takes over.
  const [mapFailed, setMapFailed] = useState(false);
  const mapped = online && !mapFailed && origin !== null;

  return (
    <Card className="flex flex-col p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{metric === 'surge' ? 'Surge radar' : 'Demand radar'}</h2>
          <p className="truncate text-[12px] tabular-nums text-fg-3" aria-live="polite">
            {sel === 0 ? 'Now' : fmtRange(view.steps[sel], view.steps[sel] + view.stepMs)} ·{' '}
            {metric === 'surge' ? 'price multiplier' : 'ride requests per 15 min'}
          </p>
        </div>
        <MetricSwitch metric={metric} onChange={onMetric} />
      </div>

      {mapped ? (
        <RadarMap
          view={view}
          sel={sel}
          metric={metric}
          origin={origin}
          live={live}
          hereZoneId={hereZoneId}
          bestZoneId={bestZoneId}
          onZone={onZone}
          onFail={() => setMapFailed(true)}
        />
      ) : (
        <Scope view={view} sel={sel} metric={metric} hereZoneId={hereZoneId} onZone={onZone} />
      )}

      <Scrubber steps={view.steps} sel={sel} onSelect={onSelect} />

      <div className="mt-3 border-t border-line px-1 pt-3">
        <HeatLegend metric={metric} />
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-3">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full border-2 border-[#f08a1c]" aria-hidden />
            Ring: surge peak within the hour
          </span>
          {mapped ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full border-2 border-fg bg-accent" aria-hidden />
                {live ? 'You' : 'Your start point'}
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="size-3 text-fg" fill="currentColor" strokeWidth={0} aria-hidden />
                Best move
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 border-t border-dashed border-accent" aria-hidden />
                5 and 10 miles away
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <LocateFixed className="size-3 text-accent" aria-hidden />
              Your zone
            </span>
          )}
        </p>
        {mapped ? (
          <p className="mt-1.5 text-[11px] leading-snug text-fg-3">
            Small dots are zones too close together to label: zoom in, or tap one. Move the map with two fingers.
          </p>
        ) : (
          !online && <p className="mt-1.5 text-[11px] leading-snug text-fg-3">The street map needs a connection. This sketch works offline.</p>
        )}
      </div>
    </Card>
  );
}
