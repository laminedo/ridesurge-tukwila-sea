import { Navigation } from 'lucide-react';
import type { ReactNode } from 'react';
import { fmtMult, fmtShort } from '@/lib/format';
import { HEAT_LEGEND, demandHeat, demandLevel, heatColor, heatInk, surgeLevel, type Level, type Metric } from '@/lib/heat';
import { navUrl, type NavApp } from '@/lib/nav';
import type { StagingSpot, ZoneStep } from '@/lib/types';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx('size-8 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-surface)" stroke="var(--color-line-2)" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="var(--color-accent)" strokeOpacity="0.35" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="5.5" fill="none" stroke="var(--color-accent)" strokeOpacity="0.6" strokeWidth="1.2" />
      <path d="M16 16 L16 6 A10 10 0 0 1 24.66 11 Z" fill="var(--color-accent)" fillOpacity="0.25" />
      <path d="M16 16 L24.66 11" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="21" cy="9.5" r="2.4" fill="#f9c22e" />
    </svg>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl border border-line bg-surface p-4', className)}>{children}</section>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3', className)}>{children}</p>
  );
}

/** A multiplier on its heat colour. Calm values recede; hot ones glow. */
export function MultBadge({ mult, className }: { mult: number; className?: string }) {
  return (
    <span
      className={cx('inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums', className)}
      style={{ background: heatColor(mult), color: heatInk(mult) }}
    >
      {fmtMult(mult)}
    </span>
  );
}

/** One-tap launch into turn-by-turn directions. */
export function NavLink({
  spot,
  app,
  variant = 'primary',
  children,
  detail,
  className,
}: {
  spot: StagingSpot;
  app: NavApp;
  variant?: 'primary' | 'quiet' | 'icon';
  children?: ReactNode;
  /** Second line under the label, e.g. the destination name. */
  detail?: string;
  className?: string;
}) {
  const styles = {
    primary: 'min-h-13 gap-2.5 rounded-xl bg-accent px-4 py-2 text-[15px] font-semibold text-accent-ink',
    quiet: 'min-h-11 gap-2 rounded-xl border border-line-2 bg-raised px-3.5 py-1.5 text-[13px] font-medium text-fg',
    icon: 'size-12 shrink-0 rounded-xl bg-accent text-accent-ink',
  }[variant];

  return (
    <a
      href={navUrl(app, spot)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Navigate to ${spot.name}`}
      className={cx('flex min-w-0 items-center justify-center transition-transform active:scale-[0.98]', styles, className)}
    >
      <Navigation className={variant === 'icon' ? 'size-5' : 'size-4 shrink-0'} aria-hidden />
      {variant !== 'icon' && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate">{children ?? 'Navigate'}</span>
          {detail && <span className="block truncate text-[12px] font-medium opacity-75">{detail}</span>}
        </span>
      )}
    </a>
  );
}

/** How one zone at one step is drawn under the chosen metric: where it sits on the ramp, its label and its level. */
export function heatOf(step: ZoneStep, metric: Metric, maxDemand: number): { heat: number; label: string; level: Level } {
  if (metric === 'demand') {
    const share = step.demand / Math.max(1, maxDemand);
    return { heat: demandHeat(share), label: String(step.demand), level: demandLevel(share) };
  }
  return { heat: step.mult, label: step.mult.toFixed(1), level: surgeLevel(step.mult) };
}

const METRICS = [
  { id: 'surge', label: 'Surge' },
  { id: 'demand', label: 'Demand' },
] as const;

/** Switch between colouring zones by surge multiplier and by how busy they are. */
export function MetricSwitch({ metric, onChange }: { metric: Metric; onChange: (metric: Metric) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour zones by" className="flex shrink-0 rounded-lg border border-line bg-plane p-0.5">
      {METRICS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === metric}
          onClick={() => onChange(option.id)}
          className={cx(
            'h-8 rounded-md px-2.5 text-[12px] font-medium',
            option.id === metric ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_var(--color-line-2)]' : 'text-fg-3',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Colour key for every heat-coloured mark in the app: blue is low, yellow is high. */
export function HeatLegend({ metric = 'surge', className }: { metric?: Metric; className?: string }) {
  return (
    <div className={cx('text-[11px] text-fg-3', className)}>
      <span className="flex h-2.5 overflow-hidden rounded-full" aria-hidden>
        {HEAT_LEGEND.map((m) => (
          <span key={m} className="flex-1" style={{ background: heatColor(m) }} />
        ))}
      </span>
      <div className="mt-1 flex justify-between">
        <span>
          <span className="font-medium text-fg-2">Low</span> · {metric === 'surge' ? '1.0×' : 'few requests'}
        </span>
        <span>Medium</span>
        <span>
          {metric === 'surge' ? '3.5×' : 'busiest zone'} · <span className="font-medium text-fg-2">High</span>
        </span>
      </div>
    </div>
  );
}

/** The next three hours for one zone as a row of heat cells. */
export function ForecastStrip({ steps, markIdx, className }: { steps: ZoneStep[]; markIdx?: number; className?: string }) {
  return (
    <div
      className={cx('flex gap-[2px]', className)}
      role="img"
      aria-label={`Surge over the next ${Math.round((steps.length * 15) / 60)} hours, from ${fmtMult(steps[0]?.mult ?? 1)} now`}
    >
      {steps.map((s, i) => (
        <span
          key={s.t}
          title={`${fmtShort(s.t)} · ${fmtMult(s.mult)}`}
          className={cx('h-2.5 flex-1 rounded-[2px]', i === markIdx && 'outline outline-[1.5px] outline-offset-1 outline-fg')}
          style={{ background: heatColor(s.mult) }}
        />
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-line bg-plane p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          onClick={() => onChange(option.id)}
          className={cx(
            'h-9 flex-1 rounded-lg px-2 text-[13px] font-medium transition-colors',
            option.id === value ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_var(--color-line-2)]' : 'text-fg-3',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
