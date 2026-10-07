'use client';

import { ArrowUp, LocateFixed, Pause, Play } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { fmtClock, fmtMult, fmtRange, fmtShort } from '@/lib/format';
import { heatColor, heatInk } from '@/lib/heat';
import type { Zone, ZoneId, ZoneStep } from '@/lib/types';
import { clamp } from '@/lib/util';
import type { View } from '@/lib/view';
import { ZONES } from '@/lib/zones';
import { Card, HeatLegend, cx } from './ui';

const SWEEP_SECONDS = 7;
/** A zone is flagged as rising when its peak in the next hour beats the shown value by this much. */
const RISING_BY = 0.3;

function Blip({
  zone,
  steps,
  sel,
  here,
  onZone,
}: {
  zone: Zone;
  steps: ZoneStep[];
  sel: number;
  here: boolean;
  onZone: (zone: ZoneId) => void;
}) {
  const current = steps[sel];
  const ahead = steps.slice(sel + 1, sel + 5).reduce((max, s) => Math.max(max, s.mult), 0);
  const rising = ahead >= current.mult + RISING_BY;

  // Bearing from the scope centre, so the echo fires as the sweep crosses the blip.
  const bearing = ((Math.atan2(zone.radar.x - 50, 50 - zone.radar.y) * 180) / Math.PI + 360) % 360;
  const style = {
    left: `${zone.radar.x}%`,
    top: `${zone.radar.y}%`,
    width: `${12.6 + clamp((current.mult - 1) / 2.5, 0, 1) * 1.2}%`,
    background: heatColor(current.mult),
    color: heatInk(current.mult),
    // A gap in the surface colour, then (if rising) a ring in the colour of what is coming.
    boxShadow: `0 0 0 2px #0a1019${rising ? `, 0 0 0 5px ${heatColor(ahead)}` : ''}`,
    '--echo': heatColor(current.mult),
    '--echo-delay': `${(bearing / 360 - 1) * SWEEP_SECONDS}s`,
    '--sweep': `${SWEEP_SECONDS}s`,
  } as CSSProperties;

  return (
    <button
      type="button"
      onClick={() => onZone(zone.id)}
      style={style}
      aria-label={`${zone.name}: ${fmtMult(current.mult)}${rising ? `, rising to ${fmtMult(ahead)} within the hour` : ''}`}
      className={cx(
        'absolute flex aspect-square -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full',
        'transition-[background-color,box-shadow,width] duration-300 active:brightness-125',
        current.mult >= 1.3 && 'blip-echo',
      )}
    >
      <span className="text-[9px] font-semibold leading-none tracking-wide opacity-85">{zone.code}</span>
      <span className="mt-0.5 text-[13px] font-semibold leading-none tabular-nums">{current.mult.toFixed(1)}</span>
      {rising && (
        <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-fg text-plane">
          <ArrowUp className="size-3" strokeWidth={3} aria-hidden />
        </span>
      )}
      {here && (
        <span className="absolute -bottom-1.5 -left-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-accent-ink">
          <LocateFixed className="size-3" strokeWidth={2.5} aria-hidden />
        </span>
      )}
    </button>
  );
}

/** Schematic backdrop: Puget Sound, Lake Washington and the freeway spines for orientation. */
function Scope() {
  const road = { fill: 'none', stroke: 'var(--color-line-2)', strokeWidth: 0.55, strokeLinecap: 'round' } as const;
  const label = { fontSize: 2.5, fill: 'var(--color-fg-3)', opacity: 0.75 } as const;
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
      <path d="M0 0H22C16 14 14 30 21 42c5 8 3 20-1 30-3 10 0 20-4 28H0Z" fill="#0d2136" opacity="0.6" />
      <path d="M69 9c6 8 4 20 5 30 1 10-1 18-5 20-3-6-2-16-3-26-1-10-1-18 3-24Z" fill="#0d2136" opacity="0.6" />
      {[16, 32, 48].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="var(--color-line)" strokeWidth="0.3" />
      ))}
      <path d="M50 2V98M2 50H98" stroke="var(--color-line)" strokeWidth="0.2" />
      <path d="M52 100C50 88 50 80 49 72 48 62 46 58 46 50 46 42 49 36 49 28 49 18 49 10 50 0" {...road} />
      <path d="M50 76C60 74 70 70 76 62 82 54 80 44 80 34 80 22 78 10 76 0" {...road} />
      <path d="M46 50C56 50 70 46 80 44" {...road} />
      <path d="M50 15C60 16 72 18 79 24" {...road} />
      <text x="50.5" y="96" {...label}>I-5</text>
      <text x="81.5" y="50" {...label}>405</text>
      <text x="66" y="48.5" {...label}>I-90</text>
      <text x="48.2" y="5.5" {...label} fontWeight="600" opacity="1">N</text>
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
}: {
  view: View;
  sel: number;
  onSelect: (step: number) => void;
  onZone: (zone: ZoneId) => void;
  /** Zone the driver is in (or based in). */
  hereZoneId: ZoneId;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold">Surge radar</h2>
        <p className="text-[13px] tabular-nums text-fg-2" aria-live="polite">
          {sel === 0 ? 'Now' : fmtRange(view.steps[sel], view.steps[sel] + view.stepMs)}
        </p>
      </div>

      <div className="relative mx-auto mt-3 aspect-square w-full max-w-[420px]">
        <div className="absolute inset-0 overflow-hidden rounded-full border border-line-2 bg-[radial-gradient(circle,#0f1a27_0%,#080d14_100%)]">
          <Scope />
          <div className="radar-sweep absolute inset-0 rounded-full" style={{ '--sweep': `${SWEEP_SECONDS}s` } as CSSProperties} aria-hidden />
        </div>
        {ZONES.map((zone) => (
          <Blip key={zone.id} zone={zone} steps={view.byZone[zone.id]} sel={sel} here={zone.id === hereZoneId} onZone={onZone} />
        ))}
      </div>

      <Scrubber steps={view.steps} sel={sel} onSelect={onSelect} />

      <div className="mt-3 border-t border-line px-1 pt-3">
        <HeatLegend />
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-3">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full border-2 border-[#f08a1c]" aria-hidden />
            Ring: peak within the next hour
          </span>
          <span className="flex items-center gap-1.5">
            <LocateFixed className="size-3 text-accent" aria-hidden />
            Your zone
          </span>
        </p>
      </div>
    </Card>
  );
}
