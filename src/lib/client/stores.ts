'use client';

/**
 * Small external stores read with `useSyncExternalStore`. Each one renders a
 * fixed server value first, so the prerendered shell never depends on the
 * clock, the URL or the device.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { NavApp } from '../nav';
import type { LatLng } from '../types';

type Listener = () => void;

/* ---------- Clock ---------- */

const TICK_MS = 15_000;
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<Listener>();

function tick() {
  clockNow = Date.now();
  clockListeners.forEach((l) => l());
}

function subscribeClock(listener: Listener) {
  clockListeners.add(listener);
  if (clockTimer === undefined) {
    clockTimer = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tick);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clearInterval(clockTimer);
      clockTimer = undefined;
      document.removeEventListener('visibilitychange', tick);
    }
  };
}

const readClock = () => (clockNow ||= Date.now());

/** Wall-clock time, refreshed every 15 seconds; `null` until mounted. */
export const useNow = () => useSyncExternalStore<number | null>(subscribeClock, readClock, () => null);

/* ---------- Connectivity ---------- */

function subscribeOnline(listener: Listener) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

/* ---------- Screen size ---------- */

/** Tablet and up: matches the `md` breakpoint the layout switches on. */
const WIDE_QUERY = '(min-width: 768px)';

function subscribeWide(listener: Listener) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** True on tablets and computers, where the overview shows every panel at once. */
export const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );

/** Live pixel width of an element, so charts can draw at their real size (0 until measured). */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/* ---------- Active tab (kept in the URL so home-screen shortcuts deep-link) ---------- */

export const TABS = ['radar', 'grid', 'flights', 'events', 'stage', 'police'] as const;
export type Tab = (typeof TABS)[number];

const TAB_EVENT = 'ridesurge:tab';

function readTab(): Tab {
  const value = new URLSearchParams(window.location.search).get('tab');
  return (TABS as readonly string[]).includes(value ?? '') ? (value as Tab) : 'radar';
}

function subscribeTab(listener: Listener) {
  window.addEventListener('popstate', listener);
  window.addEventListener(TAB_EVENT, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(TAB_EVENT, listener);
  };
}

export const useTab = () => useSyncExternalStore<Tab>(subscribeTab, readTab, () => 'radar');

export function setTab(tab: Tab) {
  const url = new URL(window.location.href);
  if (tab === 'radar') url.searchParams.delete('tab');
  else url.searchParams.set('tab', tab);
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new Event(TAB_EVENT));
  window.scrollTo({ top: 0 });
}

/* ---------- Settings (persisted on the device) ---------- */

/** Where the app builds its market: the curated Seattle one, around the device, or around a chosen city. */
export type Area =
  | { mode: 'seattle' }
  | { mode: 'gps' }
  | { mode: 'city'; name: string; state: string; lat: number; lng: number };

export interface Settings {
  navApp: NavApp;
  area: Area;
}

const SETTINGS_KEY = 'ridesurge:settings:v1';
const DEFAULT_SETTINGS: Settings = { navApp: 'google', area: { mode: 'seattle' } };
const settingsListeners = new Set<Listener>();
let settings = DEFAULT_SETTINGS;
let settingsLoaded = false;

function parseArea(saved: { area?: Partial<Area> & Record<string, unknown>; origin?: unknown }): Area {
  const area = saved.area;
  if (area?.mode === 'gps' || saved.origin === 'gps') return { mode: 'gps' };
  if (
    area?.mode === 'city' &&
    typeof area.name === 'string' &&
    typeof area.state === 'string' &&
    typeof area.lat === 'number' &&
    typeof area.lng === 'number'
  ) {
    return { mode: 'city', name: area.name, state: area.state, lat: area.lat, lng: area.lng };
  }
  return { mode: 'seattle' };
}

function readSettings(): Settings {
  if (!settingsLoaded) {
    settingsLoaded = true;
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Parameters<typeof parseArea>[0] & { navApp?: unknown };
      settings = {
        navApp: saved.navApp === 'waze' || saved.navApp === 'apple' ? saved.navApp : 'google',
        area: parseArea(saved),
      };
    } catch {
      // Private mode or corrupt storage: fall back to defaults.
    }
  }
  return settings;
}

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...readSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
  settingsListeners.forEach((l) => l());
}

function subscribeSettings(listener: Listener) {
  settingsListeners.add(listener);
  return () => settingsListeners.delete(listener);
}

export const useSettings = () => useSyncExternalStore(subscribeSettings, readSettings, () => DEFAULT_SETTINGS);

/* ---------- Device position ---------- */

export interface Geolocation {
  /** Latest fix, for drive times. */
  position: LatLng | null;
  /**
   * The point the driver's market is built around. It only moves once the
   * driver is well away from it, so the radar does not reshuffle on every fix.
   */
  anchor: LatLng | null;
  error: string | null;
}

/** Re-anchor after roughly this many miles from the last anchor. */
const REANCHOR_DEG = 0.25;

/** Watches the device position while `enabled`; asks for permission on first use. */
export function useGeolocation(enabled: boolean): Geolocation {
  const [state, setState] = useState<Geolocation>({ position: null, anchor: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setState({ position: null, anchor: null, error: 'This device does not share its location.' }));
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        setState((previous) => {
          const { anchor } = previous;
          const moved = !anchor || Math.abs(anchor.lat - position.lat) > REANCHOR_DEG || Math.abs(anchor.lng - position.lng) > REANCHOR_DEG * 1.4;
          return { position, anchor: moved ? position : anchor, error: null };
        });
      },
      (error) =>
        setState((previous) => ({
          ...previous,
          error: error.code === error.PERMISSION_DENIED ? 'Location permission was declined.' : 'Location is unavailable right now.',
        })),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [enabled]);

  return state;
}
