'use client';

import { useCallback, useEffect, useState } from 'react';
import { setDisplayTimeZone } from '../format';
import { areaKey, type AreaSpec } from '../regions';
import type { Snapshot } from '../types';
import { BASE_PATH, STATIC_EXPORT } from './env';

// Bump when the snapshot shape changes, so an older saved copy is never fed to newer screens.
const CACHE_KEY = 'ridesurge:snapshot:v3';
const POLL_MS = 60_000;
const TIMEOUT_MS = 8_000;

function isSnapshot(value: unknown): value is Snapshot {
  const v = value as Partial<Snapshot> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.generatedAt === 'number' &&
    Array.isArray(v.region?.zones) &&
    Array.isArray(v.forecast?.zones) &&
    v.forecast.zones.length === v.region.zones.length &&
    Array.isArray(v.forecast?.steps) &&
    Array.isArray(v.airportRuns?.steps) &&
    Array.isArray(v.flights?.buckets) &&
    Array.isArray(v.events?.events)
  );
}

/** Last good snapshot kept on the device: the second line of offline defence after the service worker. */
async function readSaved(key: string): Promise<Snapshot | null> {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { key?: string; snapshot?: unknown } | null;
    return saved?.key === key && isSnapshot(saved.snapshot) ? saved.snapshot : null;
  } catch {
    return null;
  }
}

function save(key: string, snapshot: Snapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key, snapshot }));
  } catch {
    // Storage full or unavailable: the service worker cache still has it.
  }
}

/** Fetches the snapshot for a moment; the flag says the service worker answered from its cache. */
async function request(spec: AreaSpec, at: number | null): Promise<{ data: unknown; fromCache: boolean }> {
  // The server only knows the curated market. Anything built around a location is computed here,
  // so that location never leaves the device. The static build has no server at all.
  if (STATIC_EXPORT || spec.mode !== 'seattle') {
    const [{ resolveRegion }, { buildSnapshot }] = await Promise.all([import('../regions'), import('../snapshot')]);
    return { data: await buildSnapshot(at ?? Date.now(), await resolveRegion(spec)), fromCache: false };
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
 * Refreshes the snapshot for an area once a minute while the app is visible.
 * `simOffset` shifts the requested moment for the simulation clock; saved data
 * is only read and written for the live clock.
 */
export function useSnapshot(simOffset: number, spec: AreaSpec): SnapshotState {
  const key = areaKey(spec);
  const [held, setHeld] = useState<{ snapshot: Snapshot; simOffset: number; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  useEffect(() => {
    const live = simOffset === 0;
    let cancelled = false;
    let inFlight = false;

    const accept = (snapshot: Snapshot) => {
      // Every clock on screen follows the region's own time zone.
      setDisplayTimeZone(snapshot.region.timeZone);
      setHeld((current) =>
        current && current.simOffset === simOffset && current.key === key && current.snapshot.generatedAt > snapshot.generatedAt
          ? current
          : { snapshot, simOffset, key },
      );
    };

    const load = async (restoreSaved: boolean) => {
      if (inFlight) return;
      inFlight = true;
      try {
        if (restoreSaved && live) {
          const saved = await readSaved(key);
          if (saved && !cancelled) accept(saved);
        }
        if (cancelled) return;
        setLoading(true);

        const { data, fromCache } = await request(spec, live ? null : Date.now() + simOffset);
        if (!isSnapshot(data)) throw new Error('The server sent an unreadable forecast.');
        if (cancelled) return;

        accept(data);
        if (fromCache) {
          setError('The server could not be reached.');
        } else {
          setError(null);
          if (live) save(key, data);
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
    // `key` stands in for `spec`: two specs with the same key describe the same region.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simOffset, key, refreshToken]);

  return {
    snapshot: held && held.simOffset === simOffset && held.key === key ? held.snapshot : null,
    error,
    loading,
    refresh,
  };
}
