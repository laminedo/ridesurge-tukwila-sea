import { ChevronRight, PlaneLanding, Ticket, TrendingUp } from 'lucide-react';
import { fmtClock, fmtDuration, fmtMult, fmtRelative, fmtShort } from '@/lib/format';
import type { NavApp } from '@/lib/nav';
import type { Cause, Recommendation } from '@/lib/recommend';
import { MIN } from '@/lib/time';
import type { ZoneId } from '@/lib/types';
import type { View } from '@/lib/view';
import { Card, Eyebrow, ForecastStrip, MultBadge, NavLink, cx } from './ui';

export function CauseIcon({ cause, className }: { cause: Cause; className?: string }) {
  if (cause === 'flights') return <PlaneLanding className={cx('text-flights', className)} aria-hidden />;
  if (cause === 'events') return <Ticket className={cx('text-events', className)} aria-hidden />;
  return <TrendingUp className={cx('text-fg-3', className)} aria-hidden />;
}

function urgency(rec: Recommendation, now: number): { label: string; hot: boolean } {
  if (!rec.surge) return { label: 'Steady', hot: false };
  if (rec.driveMin <= 3) return { label: 'In position', hot: true };
  const leaveIn = (rec.leaveBy - now) / MIN;
  if (leaveIn <= 1) return { label: 'Leave now', hot: true };
  if (leaveIn <= 20) return { label: `Leave in ${fmtDuration(leaveIn)}`, hot: false };
  return { label: `Leave by ${fmtClock(rec.leaveBy)}`, hot: false };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-raised px-2.5 py-2">
      <dt className="text-[11px] text-fg-3">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** The single decision the app exists to make: where to head, and when to leave. */
export function BestMove({
  recs,
  view,
  now,
  navApp,
  onZone,
}: {
  recs: Recommendation[];
  view: View;
  now: number;
  navApp: NavApp;
  onZone: (zone: ZoneId) => void;
}) {
  const top = recs[0];
  if (!top) return null;

  const { label, hot } = urgency(top, now);
  const alternatives = recs.slice(1).filter((r) => r.surge).slice(0, 2);
  const headline = top.surge ? top.peakMult : top.nowMult;

  return (
    <Card className="border-line-2 bg-[linear-gradient(180deg,#101a27_0%,var(--color-surface)_70%)]">
      <div className="flex items-center justify-between">
        <Eyebrow>{top.surge ? 'Best move' : 'No surge within reach'}</Eyebrow>
        <span
          className={cx(
            'rounded-full px-2.5 py-1 text-[12px] font-semibold',
            hot ? 'bg-accent text-accent-ink' : 'border border-line-2 bg-raised text-fg-2',
          )}
        >
          {label}
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <button type="button" onClick={() => onZone(top.zone.id)} className="min-w-0 text-left">
          <h2 className="text-[24px] font-semibold leading-[1.1] tracking-tight">{top.zone.name}</h2>
          <p className="mt-1 text-[13px] text-fg-3">
            {!top.surge
              ? `Highest steady demand nearby · ${top.zone.area}`
              : top.peakIdx === 0
                ? `Surging now · ${top.zone.area}`
                : `Peaks ${fmtClock(top.peakT)} · ${fmtRelative((top.peakT - now) / MIN)}`}
          </p>
        </button>
        <p
          className="shrink-0 text-[54px] font-semibold leading-[0.9] tracking-tighter"
          aria-label={`${top.surge ? 'Peak' : 'Current'} multiplier ${fmtMult(headline)}`}
        >
          {headline.toFixed(1)}
          <span className="text-[30px] text-fg-2">×</span>
        </p>
      </div>

      <ForecastStrip steps={view.byZone[top.zone.id]} markIdx={top.surge ? top.peakIdx : undefined} className="mt-3" />
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-fg-3" aria-hidden>
        <span>Now</span>
        <span>{fmtShort(view.steps[view.steps.length - 1] + view.stepMs)}</span>
      </div>

      <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-fg-2">
        <CauseIcon cause={top.cause} className="mt-px size-4 shrink-0" />
        {top.reason}
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Fact label="Drive" value={fmtDuration(top.driveMin)} />
        <Fact label={top.surge ? 'Be staged by' : 'Arrive'} value={fmtClock(top.stageBy)} />
        <Fact label="Right now" value={fmtMult(top.nowMult)} />
      </dl>

      <NavLink spot={top.spot} app={navApp} detail={top.spot.name} className="mt-3">
        Navigate
      </NavLink>

      {alternatives.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {alternatives.map((alt) => (
            <li key={alt.zone.id}>
              <button
                type="button"
                onClick={() => onZone(alt.zone.id)}
                className="flex h-13 w-full items-center gap-3 text-left"
              >
                <MultBadge mult={alt.peakMult} className="w-12 text-[13px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{alt.zone.name}</span>
                  <span className="block truncate text-[12px] text-fg-3">
                    Peaks {fmtClock(alt.peakT)} · {fmtDuration(alt.driveMin)} drive
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
