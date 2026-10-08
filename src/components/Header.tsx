import { FlaskConical, History, MapPin, RefreshCw, Settings, WifiOff } from 'lucide-react';
import { fmtClock, fmtDuration, fmtWeekday } from '@/lib/format';
import { LogoMark, cx } from './ui';

export type Health = 'loading' | 'live' | 'stale' | 'offline';

function StatusPill({ health, ageMin, simulating }: { health: Health; ageMin: number; simulating: boolean }) {
  const content = {
    loading: { icon: <span className="pulse-dot size-1.5 rounded-full bg-fg-3" />, label: 'Syncing' },
    live: simulating
      ? { icon: <FlaskConical className="size-3.5 text-accent" aria-hidden />, label: 'Sim' }
      : { icon: <span className="size-1.5 rounded-full bg-good" />, label: 'Live' },
    stale: { icon: <History className="size-3.5 text-warning" aria-hidden />, label: ageMin < 1 ? 'Saved' : `${fmtDuration(ageMin)} old` },
    offline: { icon: <WifiOff className="size-3.5 text-critical" aria-hidden />, label: 'Offline' },
  }[health];

  return (
    <span
      role="status"
      className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 text-[12px] font-medium text-fg-2"
    >
      {content.icon}
      {content.label}
    </span>
  );
}

export function Header({
  now,
  area,
  health,
  ageMin,
  simulating,
  refreshing,
  onRefresh,
  onSettings,
  onArea,
}: {
  now: number | null;
  /** Name of the market on screen. */
  area: string;
  health: Health;
  ageMin: number;
  simulating: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSettings: () => void;
  onArea: () => void;
}) {
  const iconButton = 'flex size-10 items-center justify-center rounded-full text-fg-2 active:bg-raised';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-plane/85 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md md:px-6">
      <div className="flex items-center gap-2.5">
        {/* On tablets and computers the mark lives at the top of the side rail. */}
        <LogoMark className="md:hidden" />
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold leading-tight tracking-tight">RideSurge</h1>
          {/* The area is a button: it opens the picker for another city or the driver's own location. */}
          <button
            type="button"
            onClick={onArea}
            aria-label={`Area: ${area}. Change area`}
            className="-my-1 flex max-w-full items-center gap-1 py-1 text-left text-[11px] leading-tight text-fg-3"
          >
            <MapPin className="size-3 shrink-0 text-accent" aria-hidden />
            <span className="truncate">
              {area}
              {now !== null && ` · ${simulating ? `${fmtWeekday(now)} ` : ''}${fmtClock(now)}`}
            </span>
          </button>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <StatusPill health={health} ageMin={ageMin} simulating={simulating} />
          <button type="button" onClick={onRefresh} aria-label="Refresh forecast" className={cx(iconButton, 'ml-1')}>
            <RefreshCw className={cx('size-[18px]', refreshing && 'animate-spin')} aria-hidden />
          </button>
          <button type="button" onClick={onSettings} aria-label="Settings" className={iconButton}>
            <Settings className="size-[18px]" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
