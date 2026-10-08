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

export const TABS = ['radar', 'grid', 'flights', 'events', 'stage', 'weather'] as const;
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

/** Where the app builds its market: around the device (the default), the curated Seattle one, or around a chosen city. */
export type Area =
  | { mode: 'seattle' }
  | { mode: 'gps' }
  | { mode: 'city'; name: string; state: string; lat: number; lng: number };

export interface Settings {
  navApp: NavApp;
  area: Area;
}

const SETTINGS_KEY = 'ridesurge:settings:v1';
/** Stored with the settings. Version 2 made the driver's own location the starting area. */
const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS: Settings = { navApp: 'google', area: { mode: 'gps' } };
const settingsListeners = new Set<Listener>();
let settings = DEFAULT_SETTINGS;
let settingsLoaded = false;

export function parseArea(saved: { area?: Partial<Area> & Record<string, unknown>; v?: unknown }): Area {
  const area = saved.area;
  if (
    area?.mode === 'city' &&
    typeof area.name === 'string' &&
    typeof area.state === 'string' &&
    typeof area.lat === 'number' &&
    typeof area.lng === 'number'
  ) {
    return { mode: 'city', name: area.name, state: area.state, lat: area.lat, lng: area.lng };
  }
  // Seattle used to be the starting area, so an older saved "seattle" was never a choice.
  // Only one saved since then keeps the app off the device's location.
  if (area?.mode === 'seattle' && saved.v === SETTINGS_VERSION) return { mode: 'seattle' };
  return { mode: 'gps' };
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, v: SETTINGS_VERSION }));
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
  /** Latest fix from this session, for drive times and the "you are here" mark. */
  position: LatLng | null;
  /**
   * The point the driver's market is built around. It only moves once the
   * driver is well away from it, so the radar does not reshuffle on every fix.
   */
  anchor: LatLng | null;
  /**
   * The driver's neighbourhood: follows the position in steps of about two
   * miles. Weather and the place name use it, so they keep up with the driver
   * without a new lookup at every fix.
   */
  near: LatLng | null;
  /** True while no fix has ever been seen on this device and none has failed yet. */
  waiting: boolean;
  error: string | null;
}

/** Re-anchor the market after roughly 17 miles from the last anchor. */
const REANCHOR_DEG = 0.25;
/** Move the neighbourhood after roughly two miles. */
const NEAR_DEG = 0.03;
/** The last neighbourhood seen, so the next launch starts in the right city before the first fix. */
const POSITION_KEY = 'ridesurge:position:v1';

const NO_POSITION: Geolocation = { position: null, anchor: null, near: null, waiting: false, error: null };

const movedBy = (from: LatLng | null, to: LatLng, degrees: number) =>
  !from || Math.abs(from.lat - to.lat) > degrees || Math.abs(from.lng - to.lng) > degrees * 1.4;

function savedPosition(): LatLng | null {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as Partial<LatLng> | null;
    return typeof saved?.lat === 'number' && typeof saved.lng === 'number' ? { lat: saved.lat, lng: saved.lng } : null;
  } catch {
    return null;
  }
}

/** Watches the device position while `enabled`; asks for permission on first use. */
export function useGeolocation(enabled: boolean): Geolocation {
  const [state, setState] = useState<Geolocation>(NO_POSITION);

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setState({ ...NO_POSITION, error: 'This device does not share its location.' }));
      return;
    }
    // Start from where this device was last time; the first fix corrects it within seconds.
    queueMicrotask(() =>
      setState((previous) => {
        if (previous.anchor) return previous;
        const last = savedPosition();
        return last ? { ...previous, anchor: last, near: last } : { ...previous, waiting: true };
      }),
    );
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        setState((previous) => {
          // A stale starting point is replaced by the first real fix, however close it is.
          const first = !previous.position;
          const near = first || movedBy(previous.near, position, NEAR_DEG) ? position : previous.near;
          if (near !== previous.near) {
            try {
              localStorage.setItem(POSITION_KEY, JSON.stringify(near));
            } catch {
              // Storage unavailable: the next launch simply waits for a fix.
            }
          }
          return {
            position,
            anchor: movedBy(previous.anchor, position, REANCHOR_DEG) ? position : previous.anchor,
            near,
            waiting: false,
            error: null,
          };
        });
      },
      (error) =>
        setState((previous) => ({
          ...previous,
          waiting: false,
          error:
            error.code === error.PERMISSION_DENIED
              ? 'Location is turned off for this app.'
              : 'Your location is not available right now.',
        })),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [enabled]);

  return state;
}
