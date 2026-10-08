'use client';

import { useEffect, useState } from 'react';
import type { LatLng } from '../types';
import { fetchWeather, type Weather } from '../weather';

const CACHE_KEY = 'ridesurge:weather:v1';
/** Forecasts change slowly: a refresh every 15 minutes is plenty and stays inside fair use of a free service. */
const REFRESH_MS = 15 * 60_000;

interface Saved {
  key: string;
  weather: Weather;
}

function readSaved(key: string): Weather | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Saved | null;
    return saved?.key === key && Array.isArray(saved.weather?.hours) ? saved.weather : null;
  } catch {
    return null;
  }
}

export interface WeatherState {
  weather: Weather | null;
  error: string | null;
}

/** Live weather around a point, refreshed every 15 minutes, with the last good copy kept for offline use. */
export function useWeather(centre: LatLng | null): WeatherState {
  const [held, setHeld] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the rough area matters, so movement inside it does not trigger a new request.
  const lat = centre ? Math.round(centre.lat * 20) / 20 : null;
  const lng = centre ? Math.round(centre.lng * 20) / 20 : null;
  const key = lat === null || lng === null ? null : `${lat},${lng}`;

  useEffect(() => {
    if (lat === null || lng === null || key === null) return;
    let cancelled = false;

    const load = async (restore: boolean) => {
      if (restore) {
        const saved = await Promise.resolve(readSaved(key));
        if (saved && !cancelled) setHeld({ key, weather: saved });
        // A recent copy is good enough: skip the request.
        if (saved && Date.now() - saved.fetchedAt < REFRESH_MS) return;
      }
      try {
        const weather = await fetchWeather({ lat, lng });
        if (cancelled) return;
        setHeld({ key, weather });
        setError(null);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ key, weather } satisfies Saved));
        } catch {
          // Storage unavailable: the forecast still shows for this session.
        }
      } catch {
        if (!cancelled) setError('The weather service could not be reached.');
      }
    };

    void load(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [lat, lng, key]);

  return { weather: held && held.key === key ? held.weather : null, error };
}
