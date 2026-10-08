/**
 * Driver-reported police sightings, shared between RideSurge drivers.
 *
 * There is no public feed of police locations, so this works the way Waze
 * does: a driver taps to report, others nearby see it, and it fades unless
 * someone confirms it. Reports live in a small Supabase database (see the
 * README for its schema). The key below is a publishable key: it can only read
 * fresh reports and call `report_police`, which validates and de-duplicates.
 */
import { haversineMi } from './geo';
import type { LatLng } from './types';

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://otnqmvtlaoafcamzeuuj.supabase.co';
const API_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_VMQVikiu4X1IbtHLIp3-4w_DhaAkf43';

/** A report disappears this long after it was last seen. */
export const REPORT_TTL_MIN = 45;

export interface PoliceReport extends LatLng {
  id: string;
  /** How many drivers have reported or confirmed it. */
  confirmations: number;
  createdAt: number;
  lastSeen: number;
}

interface Row {
  id: string;
  lat: number;
  lng: number;
  confirmations: number;
  created_at: string;
  last_seen: string;
}

const toReport = (row: Row): PoliceReport => ({
  id: row.id,
  lat: row.lat,
  lng: row.lng,
  confirmations: row.confirmations,
  createdAt: Date.parse(row.created_at),
  lastSeen: Date.parse(row.last_seen),
});

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: API_KEY, 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message;
    throw new Error(message ?? `The reports service responded ${response.status}.`);
  }
  return body;
}

/**
 * Active reports around a point. The query box is snapped to a half-degree
 * grid (roughly 35 miles), so the service only ever learns the driver's rough
 * area, never their position.
 */
export async function fetchReports(around: LatLng): Promise<PoliceReport[]> {
  const lat = Math.round(around.lat * 2) / 2;
  const lng = Math.round(around.lng * 2) / 2;
  const query = [
    'select=id,lat,lng,confirmations,created_at,last_seen',
    `lat=gte.${lat - 0.75}`,
    `lat=lte.${lat + 0.75}`,
    `lng=gte.${lng - 1}`,
    `lng=lte.${lng + 1}`,
    'order=last_seen.desc',
    'limit=200',
  ].join('&');
  const rows = (await call(`police_reports?${query}`)) as Row[];
  return Array.isArray(rows) ? rows.map(toReport) : [];
}

/** Report a sighting at a position (rounded to about 100 m by the service), or confirm one already there. */
export async function reportPolice(at: LatLng): Promise<PoliceReport> {
  const row = (await call('rpc/report_police', {
    method: 'POST',
    body: JSON.stringify({ p_lat: at.lat, p_lng: at.lng }),
  })) as Row;
  return toReport(row);
}

/** Compass bearing from one point to another, degrees clockwise from north. */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const rad = Math.PI / 180;
  const dLng = (to.lng - from.lng) * rad;
  const y = Math.sin(dLng) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLng);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const compassPoint = (bearing: number) => POINTS[Math.round(bearing / 45) % 8];

/** Where a point sits on a radar of `rangeMi` centred on the driver: 0–100 on both axes, or null if out of range. */
export function radarPosition(centre: LatLng, point: LatLng, rangeMi: number): { x: number; y: number; miles: number } | null {
  const miles = haversineMi(centre, point);
  if (miles > rangeMi) return null;
  const angle = (bearingDeg(centre, point) * Math.PI) / 180;
  const r = (miles / rangeMi) * 44;
  return { x: 50 + Math.sin(angle) * r, y: 50 - Math.cos(angle) * r, miles };
}
