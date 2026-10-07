'use client';

import { CircleAlert, FlaskConical, History, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { STATIC_EXPORT } from '@/lib/client/env';
import { setTab, useGeolocation, useNow, useOnline, useSettings, useTab, useWide } from '@/lib/client/stores';
import { useSnapshot } from '@/lib/client/useSnapshot';
import { fmtClock, fmtWeekday } from '@/lib/format';
import { haversineMi } from '@/lib/geo';
import { rankZones } from '@/lib/recommend';
import { MIN } from '@/lib/time';
import type { ZoneId } from '@/lib/types';
import { buildView, currentStep } from '@/lib/view';
import { HOME_BASE, ZONES } from '@/lib/zones';
import { BestMove } from './BestMove';
import { BottomNav } from './BottomNav';
import { EventsPanel, EventsSummary } from './EventsPanel';
import { FlightMonitor, FlightWaveCard, UpcomingWavesCard } from './FlightMonitor';
import { Header, type Health } from './Header';
import { HeatGrid } from './HeatGrid';
import { SettingsSheet } from './SettingsSheet';
import { StagePanel } from './StagePanel';
import { SurgeRadar } from './SurgeRadar';
import { ZoneSheet } from './ZoneSheet';
import { Card } from './ui';

/** Data older than this is no longer called live. */
const FRESH_MS = 150_000;

function Skeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading forecast">
      <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface md:h-[30rem]" />
      <div className="aspect-square animate-pulse rounded-2xl border border-line bg-surface md:aspect-auto md:h-[30rem]" />
      <div className="hidden h-[30rem] animate-pulse rounded-2xl border border-line bg-surface xl:block" />
    </div>
  );
}

function Notice({ icon, title, body, action, onAction }: { icon: React.ReactNode; title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <div role="status" className="flex items-start gap-3 border-b border-line bg-raised px-4 py-2.5 text-[12px] leading-snug">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="min-w-0 flex-1 text-fg-2">
        <span className="font-semibold text-fg">{title}</span> {body}
      </p>
      {action && (
        <button type="button" onClick={onAction} className="-my-1 h-9 shrink-0 rounded-lg border border-line-2 px-3 font-medium text-fg">
          {action}
        </button>
      )}
    </div>
  );
}

export function AppShell() {
  const realNow = useNow();
  // The static build computes its forecast on the device, so it never depends on the network.
  const online = useOnline() || STATIC_EXPORT;
  const tab = useTab();
  // Tablets and computers get every panel on the overview; phones keep one topic per tab.
  const wide = useWide();
  const settings = useSettings();
  const [simOffset, setSimOffset] = useState(0);
  const [step, setStep] = useState(0);
  const [zoneId, setZoneId] = useState<ZoneId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { snapshot, error, loading, refresh } = useSnapshot(simOffset);
  const geolocation = useGeolocation(settings.origin === 'gps');
  const origin = settings.origin === 'gps' && geolocation.position ? geolocation.position : HOME_BASE;
  const now = realNow === null ? null : realNow + simOffset;

  const nowIdx = snapshot && now !== null ? currentStep(snapshot, now) : 0;
  const view = useMemo(() => (snapshot ? buildView(snapshot, nowIdx) : null), [snapshot, nowIdx]);
  const recs = useMemo(
    () => (snapshot && view && now !== null ? rankZones(snapshot, nowIdx, { origin, now }) : []),
    [snapshot, view, nowIdx, origin, now],
  );
  const hereZoneId = useMemo(
    () => ZONES.reduce((best, z) => (haversineMi(origin, z) < haversineMi(origin, best) ? z : best), ZONES[0]).id,
    [origin],
  );

  const ageMs = snapshot && now !== null ? Math.max(0, now - snapshot.generatedAt) : 0;
  const health: Health =
    !snapshot || now === null ? 'loading' : !online ? 'offline' : error || ageMs > FRESH_MS ? 'stale' : 'live';
  const sel = view ? Math.min(step, view.steps.length - 1) : 0;
  const expired = Boolean(snapshot && now !== null && !view);

  const alerts = snapshot && now !== null
    ? {
        flights: snapshot.flights.waves.some((w) => w.start <= now + 15 * MIN && w.end > now),
        events: snapshot.events.events.some((e) => e.egressStart <= now && e.egressEnd > now),
      }
    : {};

  const airportDrive = recs.find((r) => r.zone.id === 'SEA')?.driveMin ?? 0;

  return (
    <div className="min-h-dvh md:flex">
      <BottomNav tab={tab} onChange={setTab} alerts={alerts} />

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
      <Header
        now={now}
        health={health}
        ageMin={ageMs / MIN}
        simulating={simOffset !== 0}
        refreshing={loading}
        onRefresh={refresh}
        onSettings={() => setSettingsOpen(true)}
      />

      {snapshot && view && health === 'offline' && (
        <Notice
          icon={<WifiOff className="size-4 text-critical" aria-hidden />}
          title="Offline."
          body={`Showing the forecast saved at ${fmtClock(snapshot.generatedAt)}. It stays usable until ${fmtClock(view.steps[view.steps.length - 1] + view.stepMs)}.`}
        />
      )}
      {snapshot && view && health === 'stale' && (
        <Notice
          icon={<History className="size-4 text-warning" aria-hidden />}
          title={`Saved forecast from ${fmtClock(snapshot.generatedAt)}.`}
          body={error ?? 'The last refresh did not complete.'}
          action="Retry"
          onAction={refresh}
        />
      )}

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-8 md:pt-4">
        {expired ? (
          <Card className="mx-auto max-w-xl">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <CircleAlert className="size-4 text-warning" aria-hidden />
              The saved forecast has run out
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-fg-3">
              The last forecast only reached three hours ahead and that window has passed. Reconnect to load a fresh one.
            </p>
            <button type="button" onClick={refresh} className="mt-3 h-12 w-full rounded-xl bg-accent text-[15px] font-semibold text-accent-ink">
              Try again
            </button>
          </Card>
        ) : !snapshot || !view || now === null ? (
          error && !loading ? (
            <Card className="mx-auto max-w-xl">
              <p className="flex items-center gap-2 text-[15px] font-semibold">
                <CircleAlert className="size-4 text-critical" aria-hidden />
                Could not load the forecast
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-fg-3">{error} Nothing is saved on this device yet, so there is no offline copy to show.</p>
              <button type="button" onClick={refresh} className="mt-3 h-12 w-full rounded-xl bg-accent text-[15px] font-semibold text-accent-ink">
                Try again
              </button>
            </Card>
          ) : (
            <Skeleton />
          )
        ) : (
          // Hold the previous render through a refresh instead of flashing a skeleton.
          <div className="space-y-3">
            {snapshot.simulated && (
              <p className="flex min-h-6 items-center gap-1.5 px-1 text-[11px] leading-snug text-fg-3">
                <FlaskConical className="size-3.5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  Demo data: flights, venues and demand are simulated
                  {simOffset !== 0 && `, clock set to ${fmtWeekday(now)} ${fmtClock(now)}`}
                </span>
                {simOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSimOffset(0);
                      setStep(0);
                    }}
                    className="-my-2 h-9 shrink-0 rounded-lg border border-line-2 px-2.5 font-medium text-fg"
                  >
                    Live clock
                  </button>
                )}
              </p>
            )}
            {tab === 'radar' && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <BestMove recs={recs} view={view} now={now} navApp={settings.navApp} onZone={setZoneId} />
                <SurgeRadar view={view} sel={sel} onSelect={setStep} onZone={setZoneId} hereZoneId={hereZoneId} />
                {wide && (
                  <>
                    <HeatGrid
                      view={view}
                      recs={recs}
                      sel={sel}
                      onSelect={setStep}
                      onZone={setZoneId}
                      className="md:col-span-2 xl:col-span-1"
                    />
                    <FlightWaveCard feed={snapshot.flights} now={now} className="md:col-span-2" />
                    <div className="grid content-start gap-3 md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
                      <UpcomingWavesCard feed={snapshot.flights} now={now} driveMin={airportDrive} navApp={settings.navApp} limit={2} />
                      <EventsSummary feed={snapshot.events} now={now} onMore={() => setTab('events')} />
                    </div>
                  </>
                )}
              </div>
            )}
            {tab === 'grid' && <HeatGrid view={view} recs={recs} sel={sel} onSelect={setStep} onZone={setZoneId} />}
            {tab === 'flights' && (
              <FlightMonitor
                feed={snapshot.flights}
                now={now}
                driveMin={airportDrive}
                navApp={settings.navApp}
              />
            )}
            {tab === 'events' && <EventsPanel feed={snapshot.events} now={now} navApp={settings.navApp} />}
            {tab === 'stage' && <StagePanel recs={recs} view={view} navApp={settings.navApp} onZone={setZoneId} />}
          </div>
        )}
      </main>
      </div>

      <ZoneSheet
        zoneId={zoneId}
        view={view}
        snapshot={snapshot}
        rec={recs.find((r) => r.zone.id === zoneId)}
        sel={sel}
        now={now ?? 0}
        navApp={settings.navApp}
        onSelect={setStep}
        onClose={() => setZoneId(null)}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        geolocation={geolocation}
        simOffset={simOffset}
        onSimOffset={(offset) => {
          setSimOffset(offset);
          setStep(0);
        }}
        snapshot={snapshot}
      />
    </div>
  );
}
