'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Snapshot } from '../types';
import { ZONES } from '../zones';
import { BASE_PATH, STATIC_EXPORT } from './env';

// Bump when the snapshot shape changes, so an older saved copy is never fed to newer screens.
const CACHE_KEY = 'ridesurge:snapshot:v2';
const POLL_MS = 60_000;
const TIMEOUT_MS = 8_000;

function isSnapshot(value: unknown): value is Snapshot {
  const v = value as Partial<Snapshot> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.generatedAt === 'number' &&
    Array.isArray(v.forecast?.zones) &&
    v.forecast.zones.length === ZONES.length &&
    Array.isArray(v.airportRuns?.steps) &&
    Array.isArray(v.forecast?.steps) &&
    Array.isArray(v.flights?.buckets) &&
    Array.isArray(v.events?.events)
  );
}

/** Last good snapshot kept on the device: the second line of offline defence after the service worker. */
async function readSaved(): Promise<Snapshot | null> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return isSnapshot(saved) ? saved : null;
  } catch {
    return null;
  }
}

function save(snapshot: Snapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable: the service worker cache still has it.
  }
}

/** Fetches the snapshot for a moment; the flag says the service worker answered from its cache. */
async function request(at: number | null): Promise<{ data: unknown; fromCache: boolean }> {
  if (STATIC_EXPORT) {
    // No server on GitHub Pages: run the same engine the API routes use, here.
    const { buildSnapshot } = await import('../snapshot');
    return { data: await buildSnapshot(at ?? Date.now()), fromCache: false };
  }
  const url = `${BASE_PATH}/api/snapshot${at === null ? '' : `?at=${at}`}`;
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`The server responded ${response.status}.`);
  // The service worker marks responses it had to serve from its cache.
  return { data: await response.json(), fromCache: response.headers.get('X-RideSurge-Source') === 'cache' };
}

export interface SnapshotState {
  snapshot: Snapshot | null;
  /** Message from the most recent failed refresh, cleared by the next success. */
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Refreshes the snapshot once a minute while the app is visible (from `/api/snapshot`, or computed in the
 * browser in the static build). `simOffset`
 * shifts the requested moment for the simulation clock; saved data is only
 * read and written for the live clock.
 */
export function useSnapshot(simOffset: number): SnapshotState {
  const [held, setHeld] = useState<{ snapshot: Snapshot; simOffset: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  useEffect(() => {
    const live = simOffset === 0;
    let cancelled = false;
    let inFlight = false;

    const accept = (snapshot: Snapshot) =>
      setHeld((current) =>
        current && current.simOffset === simOffset && current.snapshot.generatedAt > snapshot.generatedAt
          ? current
          : { snapshot, simOffset },
      );

    const load = async (restoreSaved: boolean) => {
      if (inFlight) return;
      inFlight = true;
      try {
        if (restoreSaved && live) {
          const saved = await readSaved();
          if (saved && !cancelled) accept(saved);
        }
        if (cancelled) return;
        setLoading(true);

        const { data, fromCache } = await request(live ? null : Date.now() + simOffset);
        if (!isSnapshot(data)) throw new Error('The server sent an unreadable forecast.');
        if (cancelled) return;

        accept(data);
        if (fromCache) {
          setError('The server could not be reached.');
        } else {
          setError(null);
          if (live) save(data);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'The forecast request timed out.');
        }
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    void load(true);
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, POLL_MS);
    const wake = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);

    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [simOffset, refreshToken]);

  return {
    snapshot: held && held.simOffset === simOffset ? held.snapshot : null,
    error,
    loading,
    refresh,
  };
}
