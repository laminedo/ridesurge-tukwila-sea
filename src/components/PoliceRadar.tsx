'use client';

import { ExternalLink, Siren } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fmtDuration } from '@/lib/format';
import { MIN } from '@/lib/time';
import { REPORT_TTL_MIN, compassPoint, bearingDeg, fetchReports, radarPosition, reportPolice, type PoliceReport } from '@/lib/police';
import type { LatLng } from '@/lib/types';
import { useRegion } from './RegionContext';
import { Card, Segmented, cx } from './ui';

const RANGES = [
  { id: '5', label: '5 mi' },
  { id: '10', label: '10 mi' },
  { id: '25', label: '25 mi' },
] as const;
type Range = (typeof RANGES)[number]['id'];

const POLL_MS = 30_000;

/** Shared driver reports, refreshed every 30 seconds while the screen is open. */
function useReports(centre: LatLng) {
  const [reports, setReports] = useState<PoliceReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  // The service only needs the rough area, so small movements do not trigger a new request.
  const lat = Math.round(centre.lat * 20) / 20;
  const lng = Math.round(centre.lng * 20) / 20;

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchReports({ lat, lng })
        .then((found) => {
          if (cancelled) return;
          setReports(found);
          setError(null);
        })
        .catch(() => {
          if (!cancelled) setError('Could not reach the reports service. Showing the last reports received.');
        })
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });

    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [lat, lng, tick]);

  return { reports, error, loaded, reload: useCallback(() => setTick((n) => n + 1), []) };
}

/** The device's position right now, for a report. Asks for permission if it has not been given. */
function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device does not share its location, so it cannot place a report.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? 'Reporting needs your location, and permission was declined.'
              : 'Could not get your location. Try again in a moment.',
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 },
    );
  });
}

/**
 * Second radar: police sightings reported by drivers. It shows what people
 * have reported, not where police are; an empty scope means no reports.
 */
export function PoliceRadar({ origin, usingGps, now }: { origin: LatLng; usingGps: boolean; now: number }) {
  const { info } = useRegion();
  const [range, setRange] = useState<Range>('10');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const { reports, error, loaded, reload } = useReports(origin);
  const rangeMi = Number(range);

  // Freshest and nearest first; anything past its 45 minutes drops out between refreshes.
  const active = reports
    .filter((r) => now - r.lastSeen < REPORT_TTL_MIN * MIN)
    .map((r) => ({ report: r, at: radarPosition(origin, r, 60), bearing: bearingDeg(origin, r) }))
    .filter((r): r is typeof r & { at: NonNullable<typeof r.at> } => r.at !== null)
    .sort((a, b) => a.at.miles - b.at.miles);
  // The list reaches 60 miles; the scope redraws each report at the chosen range.
  const inRange = active.flatMap(({ report }) => {
    const at = radarPosition(origin, report, rangeMi);
    return at ? [{ report, at }] : [];
  });

  const send = async (at?: LatLng) => {
    setBusy(true);
    setNotice(null);
    try {
      await reportPolice(at ?? (await currentPosition()));
      setNotice({ ok: true, text: at ? 'Confirmed. Thanks.' : `Reported. Drivers nearby will see it for ${REPORT_TTL_MIN} minutes.` });
      reload();
    } catch (cause) {
      setNotice({ ok: false, text: cause instanceof Error ? cause.message : 'The report could not be sent.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
      <Card className="min-w-0 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="min-w-0 flex-1 basis-40">
            <h2 className="text-[15px] font-semibold">Police radar</h2>
            <p className="truncate text-[12px] text-fg-3">
              Driver reports within {rangeMi} miles of {usingGps ? 'you' : info.home.label}
            </p>
          </div>
          <div className="w-44 shrink-0">
            <Segmented label="Radar range" options={RANGES} value={range} onChange={setRange} />
          </div>
        </div>

        <div className="relative mx-auto mt-3 aspect-square w-full max-w-[520px]">
          <div className="absolute inset-0 overflow-hidden rounded-full border border-line-2 bg-[radial-gradient(circle,#0f1a27_0%,#080d14_100%)]">
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
              {[1, 2, 3].map((ring) => (
                <g key={ring}>
                  <circle cx="50" cy="50" r={(ring / 3) * 44} fill="none" stroke="var(--color-line)" strokeWidth="0.3" />
                  <text x="50.8" y={50 - (ring / 3) * 44 + 3.2} fontSize="2.4" fill="var(--color-fg-3)">
                    {Math.round((rangeMi * ring) / 3)} mi
                  </text>
                </g>
              ))}
              <path d="M50 4V96M4 50H96" stroke="var(--color-line)" strokeWidth="0.2" />
              <text x="46.6" y="4.6" fontSize="2.4" fontWeight="600" fill="var(--color-fg-3)">
                N
              </text>
              {/* Zone names for orientation, in their true direction. */}
              {info.zones.map((zone) => {
                const at = radarPosition(origin, zone, rangeMi);
                return at && at.miles > rangeMi * 0.06 ? (
                  <text key={zone.id} x={at.x} y={at.y} textAnchor="middle" fontSize="2.3" fill="var(--color-fg-3)" opacity="0.7">
                    {zone.code}
                  </text>
                ) : null;
              })}
              <circle cx="50" cy="50" r="1.6" fill="var(--color-accent)" />
              <circle cx="50" cy="50" r="3.4" fill="none" stroke="var(--color-accent)" strokeWidth="0.4" opacity="0.6" />
            </svg>
            <div className="radar-sweep absolute inset-0 rounded-full" aria-hidden />
          </div>

          {inRange.map(({ report, at }) => {
            const ageMin = Math.max(0, (now - report.lastSeen) / MIN);
            return (
              <span
                key={report.id}
                className="absolute flex -translate-x-1/2 -translate-y-3.5 flex-col items-center"
                style={{ left: `${at.x}%`, top: `${at.y}%`, opacity: 1 - 0.55 * Math.min(1, ageMin / REPORT_TTL_MIN) }}
                role="img"
                aria-label={`Police reported ${at.miles.toFixed(1)} miles away, ${fmtDuration(ageMin)} ago`}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-warning text-plane shadow-[0_0_0_2px_#0a1019]">
                  <Siren className="size-4" strokeWidth={2.2} aria-hidden />
                </span>
                <span className="mt-0.5 rounded bg-plane/80 px-1 text-[10px] font-medium tabular-nums text-fg-2">
                  {ageMin < 1 ? 'now' : `${Math.round(ageMin)}m`}
                  {report.confirmations > 1 && ` ·${report.confirmations}`}
                </span>
              </span>
            );
          })}
        </div>

        <p className="mt-3 px-1 text-[12px] leading-snug text-fg-3" role="status">
          {!loaded
            ? 'Checking for reports…'
            : inRange.length > 0
              ? `${inRange.length} ${inRange.length === 1 ? 'report' : 'reports'} in range. Newer reports are brighter.`
              : `No reports within ${rangeMi} miles in the last ${REPORT_TTL_MIN} minutes. That means nobody has reported, not that the road is clear.`}
        </p>
        {error && <p className="mt-1 px-1 text-[12px] text-fg-2">{error}</p>}
      </Card>

      <div className="min-w-0 space-y-3">
        <Card>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className={cx(
              'flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-warning text-[16px] font-semibold text-plane',
              busy && 'opacity-60',
            )}
          >
            <Siren className="size-5" aria-hidden />
            {busy ? 'Sending…' : 'Report police here'}
          </button>
          {notice && (
            <p className={cx('mt-2 text-[13px] leading-snug', notice.ok ? 'text-fg' : 'text-fg-2')} role="status">
              {notice.text}
            </p>
          )}
          <p className="mt-2 text-[12px] leading-snug text-fg-3">
            Uses your current position. Only report when you are stopped, or ask a passenger to tap it.
          </p>

          <a
            href={`https://waze.com/ul?ll=${origin.lat.toFixed(4)}%2C${origin.lng.toFixed(4)}&z=13`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex h-12 items-center justify-center gap-2 rounded-xl border border-line-2 bg-raised text-[14px] font-medium"
          >
            <ExternalLink className="size-4" aria-hidden />
            Open Waze for its live police reports
          </a>
          <p className="mt-2 text-[12px] leading-snug text-fg-3">
            RideSurge only knows what its own drivers report. Waze has far more people reporting, so check it too.
          </p>
        </Card>

        <Card className="p-3">
          <h2 className="px-1 text-[15px] font-semibold">Reports near you</h2>
          {active.length > 0 ? (
            <ul className="mt-1 divide-y divide-line px-1">
              {active.slice(0, 12).map(({ report, at, bearing }) => {
                const ageMin = Math.max(0, (now - report.lastSeen) / MIN);
                return (
                  <li key={report.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-raised">
                      <Siren className="size-4 text-warning" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium tabular-nums">
                        {at.miles < 0.2 ? 'Right here' : `${at.miles.toFixed(1)} mi ${compassPoint(bearing)}`}
                      </span>
                      <span className="block truncate text-[12px] text-fg-3">
                        Seen {ageMin < 1 ? 'just now' : `${fmtDuration(ageMin)} ago`}
                        {report.confirmations > 1 ? ` · ${report.confirmations} drivers` : ' · 1 driver'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void send(report)}
                      disabled={busy}
                      className="h-10 shrink-0 rounded-lg border border-line-2 px-3 text-[13px] font-medium"
                    >
                      Still there
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-1 py-3 text-[13px] leading-snug text-fg-3">
              Nothing reported within 60 miles. Reports only come from RideSurge drivers, so this stays quiet until more of them use it.
            </p>
          )}
        </Card>

        <p className="px-1 text-[11px] leading-relaxed text-fg-3">
          Reports are unverified and anonymous, and fade after {REPORT_TTL_MIN} minutes unless another driver confirms them. Reporting sends
          the spot, rounded to about 100 metres, to the RideSurge reports database; viewing sends only your rough area. This is not a
          reason to speed: drive to the limit whatever the radar shows.
        </p>
      </div>
    </div>
  );
}
