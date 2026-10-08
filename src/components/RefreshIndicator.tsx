'use client';

import { Check, CircleAlert, Download, RefreshCw } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { cx } from './ui';

/** Where a refresh stands: nothing happening, fetching, just finished, failed, or reloading for a new version. */
export type RefreshPhase = 'idle' | 'busy' | 'done' | 'failed' | 'updating';

/** How far the page has to be pulled down, in pixels of chip travel, before letting go refreshes. */
const THRESHOLD = 64;
const MAX_PULL = 104;
/** A finger travels further than the chip, like a stretched spring. */
const RESISTANCE = 0.5;
/** Where the chip rests below the header while a refresh runs. */
const REST = 14;

/**
 * The refresh chip. On a touch screen, pulling the page down from the top
 * drags it into view and letting go past the mark starts a refresh; the same
 * chip drops in when the refresh button is used. It spins while data loads
 * and confirms with a tick.
 */
export function RefreshIndicator({ phase, onRefresh }: { phase: RefreshPhase; onRefresh: () => void }) {
  const [pull, setPull] = useState(0);
  const idle = phase === 'idle';
  const start = useEffectEvent(onRefresh);

  useEffect(() => {
    if (!idle) return;
    let fromY: number | null = null;
    let fromX = 0;
    let pulling = false;
    let travel = 0;

    const reset = () => {
      fromY = null;
      pulling = false;
      travel = 0;
      setPull(0);
    };

    const onStart = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      // Only a one-finger pull from the very top of the page, and never from the map, a slider or an open sheet.
      if (event.touches.length !== 1 || window.scrollY > 0 || !target) return;
      if (document.querySelector('dialog[open]') || target.closest('.maplibregl-map, input[type="range"]')) return;
      fromY = event.touches[0].clientY;
      fromX = event.touches[0].clientX;
    };

    const onMove = (event: TouchEvent) => {
      if (fromY === null) return;
      if (event.touches.length !== 1) return reset();
      const dy = event.touches[0].clientY - fromY;
      const dx = event.touches[0].clientX - fromX;
      if (!pulling) {
        // Sideways swipes and upward scrolls belong to the page.
        if (dy < -6 || Math.abs(dx) > Math.max(18, dy)) return reset();
        if (dy < 12 || window.scrollY > 0) return;
        pulling = true;
      }
      travel = Math.min(MAX_PULL, Math.max(0, dy * RESISTANCE));
      setPull(travel);
    };

    const onEnd = () => {
      if (pulling && travel >= THRESHOLD) start();
      reset();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', reset);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [idle]);

  const dragging = idle && pull > 0;
  const armed = pull >= THRESHOLD;
  const progress = Math.min(1, pull / THRESHOLD);
  const shown = !idle || dragging;
  const y = idle ? pull - 52 : REST;

  const label = {
    idle: armed ? 'Release to refresh' : 'Pull to refresh',
    busy: 'Refreshing…',
    done: 'Updated',
    failed: 'Could not refresh',
    updating: 'Getting the new version…',
  }[phase];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-40 flex justify-center md:left-[5.5rem]"
      role="status"
      aria-live="polite"
    >
      <div
        className={cx(
          'flex h-10 items-center gap-2 rounded-full border bg-raised pl-3 pr-3.5 text-[13px] font-medium shadow-[0_8px_24px_rgb(0_0_0/0.5)]',
          // The chip follows the finger exactly; everything else eases.
          !dragging && 'transition-[transform,opacity,border-color] duration-300 ease-out',
          phase === 'done' || armed ? 'border-accent text-fg' : phase === 'failed' ? 'border-warning text-fg' : 'border-line-2 text-fg-2',
        )}
        style={{ transform: `translateY(${y}px) scale(${shown ? 1 : 0.8})`, opacity: idle ? progress : 1 }}
      >
        {phase === 'done' ? (
          <Check className="refresh-pop size-4 text-accent" strokeWidth={3} aria-hidden />
        ) : phase === 'failed' ? (
          <CircleAlert className="size-4 text-warning" aria-hidden />
        ) : phase === 'updating' ? (
          <Download className="size-4 animate-bounce text-accent" aria-hidden />
        ) : (
          <RefreshCw
            className={cx('size-4', phase === 'busy' ? 'animate-spin text-accent' : armed && 'text-accent')}
            style={idle ? { transform: `rotate(${progress * 270}deg)` } : undefined}
            aria-hidden
          />
        )}
        {/* While the chip is hidden it says nothing, so screen readers only hear real refreshes. */}
        <span>{shown ? label : ''}</span>
      </div>
    </div>
  );
}
