import { BadgeCheck } from 'lucide-react';
import { updateSettings } from '@/lib/client/stores';
import { fmtClock, fmtDuration } from '@/lib/format';
import { NAV_APPS, type NavApp } from '@/lib/nav';
import type { Recommendation } from '@/lib/recommend';
import type { ZoneId } from '@/lib/types';
import type { View } from '@/lib/view';
import { spotsForZone } from '@/lib/zones';
import { Card, ForecastStrip, MultBadge, NavLink, Segmented } from './ui';

/** Quick-launch navigation to staging spots, best opportunity first. */
export function StagePanel({
  recs,
  view,
  navApp,
  onZone,
}: {
  recs: Recommendation[];
  view: View;
  navApp: NavApp;
  onZone: (zone: ZoneId) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-[15px] font-semibold">Quick launch</h2>
        <p className="mt-0.5 text-[12px] text-fg-3">One tap to directions. Zones are ordered by the best move from where you are.</p>
      </div>

      <Card className="p-3 md:max-w-md">
        <p className="px-1 text-[12px] text-fg-3">Open directions in</p>
        <div className="mt-2">
          <Segmented label="Navigation app" options={NAV_APPS} value={navApp} onChange={(app) => updateSettings({ navApp: app })} />
        </div>
      </Card>

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
      {recs.map((rec) => (
        <Card key={rec.zone.id} className="p-3">
          <button type="button" onClick={() => onZone(rec.zone.id)} className="flex w-full items-center gap-3 px-1 text-left">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{rec.zone.name}</span>
              <span className="block truncate text-[12px] text-fg-3">
                {fmtDuration(rec.driveMin)} drive ·{' '}
                {rec.surge && rec.peakIdx > 0 ? `peaks ${fmtClock(rec.peakT)}` : rec.surge ? 'surging now' : 'no surge ahead'}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-fg-3">
              <MultBadge mult={rec.nowMult} className="text-[12px]" />
              {rec.surge && rec.peakIdx > 0 && (
                <>
                  <span aria-hidden>→</span>
                  <span className="sr-only">rising to</span>
                  <MultBadge mult={rec.peakMult} className="text-[12px]" />
                </>
              )}
            </span>
          </button>
          <ForecastStrip steps={view.byZone[rec.zone.id]} markIdx={rec.surge ? rec.peakIdx : undefined} className="mx-1 mt-2.5" />

          <ul className="mt-3 space-y-2">
            {spotsForZone(rec.zone.id).map((spot) => (
              <li key={spot.id} className="flex items-center gap-3 rounded-xl border border-line bg-raised p-2.5 pl-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium leading-snug">{spot.name}</p>
                  {spot.official && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-2">
                      <BadgeCheck className="size-3.5 text-accent" aria-hidden />
                      Official airport lot
                    </p>
                  )}
                  <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{spot.note}</p>
                </div>
                <NavLink spot={spot} app={navApp} variant="icon" />
              </li>
            ))}
          </ul>
        </Card>
      ))}
      </div>

      <p className="px-1 pb-2 text-[11px] leading-relaxed text-fg-3">
        Apart from the airport lots, these are suggested areas rather than designated waiting zones. Follow posted signs and your
        platform&apos;s rules, and set your destination before you start driving.
      </p>
    </div>
  );
}
