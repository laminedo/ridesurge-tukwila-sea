import { Grid3x3, Navigation, PlaneLanding, Radar, Ticket, type LucideIcon } from 'lucide-react';
import type { Tab } from '@/lib/client/stores';
import { LogoMark, cx } from './ui';

const ITEMS: { tab: Tab; label: string; wideLabel: string; Icon: LucideIcon }[] = [
  { tab: 'radar', label: 'Radar', wideLabel: 'Overview', Icon: Radar },
  { tab: 'grid', label: 'Heat grid', wideLabel: 'Heat grid', Icon: Grid3x3 },
  { tab: 'flights', label: 'Flights', wideLabel: 'Flights', Icon: PlaneLanding },
  { tab: 'events', label: 'Events', wideLabel: 'Events', Icon: Ticket },
  { tab: 'stage', label: 'Stage', wideLabel: 'Stage', Icon: Navigation },
];

/** Section navigation: a bottom tab bar on phones, a side rail on tablets and computers. */
export function BottomNav({
  tab,
  onChange,
  alerts,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
  /** Tabs with something happening right now (a wave at the curb, a venue letting out). */
  alerts: Partial<Record<Tab, boolean>>;
}) {
  return (
    <nav
      aria-label="Sections"
      className={cx(
        'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-plane/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md',
        'md:sticky md:inset-auto md:top-0 md:h-dvh md:w-[5.5rem] md:shrink-0 md:border-r md:border-t-0 md:bg-surface md:pb-0',
      )}
    >
      <div className="hidden h-[57px] items-center justify-center border-b border-line md:flex">
        <LogoMark className="size-9" />
      </div>
      <ul className="mx-auto grid max-w-[520px] grid-cols-5 md:max-w-none md:grid-cols-1 md:gap-1 md:p-2">
        {ITEMS.map(({ tab: id, label, wideLabel, Icon }) => {
          const active = id === tab;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-[60px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium md:h-16 md:rounded-xl',
                  active ? 'text-accent md:bg-raised' : 'text-fg-3 md:hover:bg-raised/60 md:hover:text-fg-2',
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  {alerts[id] && (
                    <span className="pulse-dot absolute -right-1 -top-0.5 size-2 rounded-full bg-warning ring-2 ring-plane md:ring-surface">
                      <span className="sr-only">active now</span>
                    </span>
                  )}
                </span>
                <span className="md:hidden">{label}</span>
                <span className="hidden md:inline">{wideLabel}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
