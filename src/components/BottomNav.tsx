import { Grid3x3, Navigation, PlaneLanding, Radar, Ticket, type LucideIcon } from 'lucide-react';
import type { Tab } from '@/lib/client/stores';
import { cx } from './ui';

const ITEMS: { tab: Tab; label: string; Icon: LucideIcon }[] = [
  { tab: 'radar', label: 'Radar', Icon: Radar },
  { tab: 'grid', label: 'Heat grid', Icon: Grid3x3 },
  { tab: 'flights', label: 'Flights', Icon: PlaneLanding },
  { tab: 'events', label: 'Events', Icon: Ticket },
  { tab: 'stage', label: 'Stage', Icon: Navigation },
];

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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-plane/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="mx-auto grid max-w-[520px] grid-cols-5">
        {ITEMS.map(({ tab: id, label, Icon }) => {
          const active = id === tab;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-[60px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  active ? 'text-accent' : 'text-fg-3',
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  {alerts[id] && (
                    <span className="pulse-dot absolute -right-1 -top-0.5 size-2 rounded-full bg-warning ring-2 ring-plane">
                      <span className="sr-only">active now</span>
                    </span>
                  )}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
