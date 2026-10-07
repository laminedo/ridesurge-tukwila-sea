'use client';

/**
 * Small external stores read with `useSyncExternalStore`. Each one renders a
 * fixed server value first, so the prerendered shell never depends on the
 * clock, the URL or the device.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
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

/* ---------- Active tab (kept in the URL so home-screen shortcuts deep-link) ---------- */

export const TABS = ['radar', 'grid', 'flights', 'events', 'stage'] as const;
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

export interface Settings {
  navApp: NavApp;
  origin: 'home' | 'gps';
}

const SETTINGS_KEY = 'ridesurge:settings:v1';
const DEFAULT_SETTINGS: Settings = { navApp: 'google', origin: 'home' };
const settingsListeners = new Set<Listener>();
let settings = DEFAULT_SETTINGS;
let settingsLoaded = false;

function readSettings(): Settings {
  if (!settingsLoaded) {
    settingsLoaded = true;
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
      settings = {
        navApp: saved.navApp === 'waze' || saved.navApp === 'apple' ? saved.navApp : 'google',
        origin: saved.origin === 'gps' ? 'gps' : 'home',
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
  position: LatLng | null;
  error: string | null;
}

/** Watches the device position while `enabled`; asks for permission on first use. */
export function useGeolocation(enabled: boolean): Geolocation {
  const [state, setState] = useState<Geolocation>({ position: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setState({ position: null, error: 'This device does not share its location.' }));
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => setState({ position: { lat: coords.latitude, lng: coords.longitude }, error: null }),
      (error) =>
        setState({
          position: null,
          error: error.code === error.PERMISSION_DENIED ? 'Location permission was declined.' : 'Location is unavailable right now.',
        }),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [enabled]);

  return state;
}
