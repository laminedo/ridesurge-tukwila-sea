'use client';

import { BadgeCheck, BedDouble, MapPinned } from 'lucide-react';
import { useState } from 'react';
import { updateSettings } from '@/lib/client/stores';
import { fmtClock, fmtDuration } from '@/lib/format';
import { hotelMoment, hotelPickups } from '@/lib/hotels';
import { NAV_APPS, searchUrl, type NavApp } from '@/lib/nav';
import type { Recommendation } from '@/lib/recommend';
import { localClock, zoneOffsetMs } from '@/lib/time';
import type { Hotel, StagingSpot, ZoneId } from '@/lib/types';
import type { View } from '@/lib/view';
import { useRegion } from './RegionContext';
import { Card, ForecastStrip, MultBadge, NavLink, Segmented } from './ui';

const VIEWS = [
  { id: 'spots', label: 'Staging spots' },
  { id: 'hotels', label: 'Hotels' },
] as const;
type StageView = (typeof VIEWS)[number]['id'];

/** A hotel as something to navigate to: the map app finds the door from its name. */
export function hotelSpot(hotel: Hotel, at: { lat: number; lng: number }): StagingSpot {
  return {
    id: hotel.id,
    zoneId: hotel.zoneId,
    official: false,
    name: hotel.name,
    address: hotel.address,
    note: `About ${hotel.rooms} rooms`,
    lat: at.lat,
    lng: at.lng,
  };
}

function Hotels({ recs, now, navApp }: { recs: Recommendation[]; now: number; navApp: NavApp }) {
  const { info, zoneById } = useRegion();
  const { dow, hour } = localClock(now, zoneOffsetMs(now, info.timeZone));
  const drive = new Map(recs.map((r) => [r.zone.id, r.driveMin]));

  // Busiest first right now; a big hotel far away still outranks a small one nearby.
  const ranked = info.hotels
    .map((hotel) => ({ hotel, pickups: hotelPickups(hotel.rooms, dow, hour) }))
    .sort((a, b) => b.pickups - a.pickups);
  const total = ranked.reduce((s, h) => s + h.pickups, 0);

  return (
    <>
      {ranked.length > 0 && (
        <Card className="p-3">
          <div className="px-1">
            <h3 className="text-[15px] font-semibold">Hotels by pickups this hour</h3>
            <p className="mt-0.5 text-[12px] text-fg-3">
              {hotelMoment(hour)}: about {Math.round(total)} hotel pickups across {info.name} this hour. Estimated from hotel size and time
              of day, not from bookings.
            </p>
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {ranked.map(({ hotel, pickups }) => {
              const zone = zoneById[hotel.zoneId];
              if (!zone) return null;
              return (
                <li key={hotel.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-raised p-2.5 pl-3">
                  <span className="w-9 shrink-0 text-center">
                    <span className="block text-[17px] font-semibold leading-none tabular-nums">{pickups < 0.5 ? '<1' : Math.round(pickups)}</span>
                    <span className="mt-0.5 block text-[10px] text-fg-3">/ hr</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium leading-snug">{hotel.name}</span>
                    <span className="block truncate text-[12px] text-fg-3">
                      {zone.name} · {hotel.rooms} rooms{drive.has(zone.id) ? ` · ${fmtDuration(drive.get(zone.id) ?? 0)}` : ''}
                    </span>
                  </span>
                  <NavLink spot={hotelSpot(hotel, zone)} app={navApp} variant="icon" />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-3">
        <div className="px-1">
          <h3 className="text-[15px] font-semibold">Every hotel, on the map</h3>
          <p className="mt-0.5 text-[12px] text-fg-3">
            {ranked.length > 0
              ? 'The list above covers the larger hotels. Open your map app to see every hotel and motel in a zone.'
              : 'There is no built-in hotel list for this area yet. Open your map app to see every hotel and motel in a zone.'}
          </p>
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {(recs.length > 0 ? recs.map((r) => r.zone) : info.zones).map((zone) => (
            <li key={zone.id}>
              <a
                href={searchUrl(navApp, 'hotels', zone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center gap-2 rounded-xl border border-line-2 bg-raised px-3 text-[13px] font-medium"
              >
                <MapPinned className="size-4 shrink-0 text-accent" aria-hidden />
                <span className="truncate">{zone.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

/** Quick-launch navigation to staging spots and hotels, best opportunity first. */
export function StagePanel({
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
  const { info, spotsForZone } = useRegion();
  const [show, setShow] = useState<StageView>('spots');

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-[15px] font-semibold">Quick launch</h2>
        <p className="mt-0.5 text-[12px] text-fg-3">One tap to directions. Zones are ordered by the best move from where you are.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-3">
          <p className="flex items-center gap-1.5 px-1 text-[12px] text-fg-3">
            <BedDouble className="size-3.5" aria-hidden />
            Show
          </p>
          <div className="mt-2">
            <Segmented label="Show" options={VIEWS} value={show} onChange={setShow} />
          </div>
        </Card>
        <Card className="p-3">
          <p className="px-1 text-[12px] text-fg-3">Open directions in</p>
          <div className="mt-2">
            <Segmented label="Navigation app" options={NAV_APPS} value={navApp} onChange={(app) => updateSettings({ navApp: app })} />
          </div>
        </Card>
      </div>

      {show === 'hotels' ? (
        <Hotels recs={recs} now={now} navApp={navApp} />
      ) : (
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
      )}

      <p className="px-1 pb-2 text-[11px] leading-relaxed text-fg-3">
        {info.source === 'curated'
          ? 'Apart from the airport lots, these are suggested areas rather than designated waiting zones.'
          : 'These are town centres, venues and the airport itself rather than designated waiting zones.'}{' '}
        Follow posted signs, each hotel&apos;s pickup rules and your platform&apos;s rules, and set your destination before you start driving.
      </p>
    </div>
  );
}
