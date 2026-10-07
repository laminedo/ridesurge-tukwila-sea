import type { LatLng } from './types';

const EARTH_RADIUS_MI = 3958.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMi(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

/** Typical door-to-door speed on the I-5 / I-405 corridor, mph. */
function corridorSpeed(dow: number, hour: number): number {
  const weekday = dow >= 1 && dow <= 5;
  if (weekday && ((hour >= 6.5 && hour < 9.5) || (hour >= 15 && hour < 18.75))) return 24;
  if (hour >= 21 || hour < 5.5) return 44;
  return weekday ? 34 : 36;
}

/**
 * Drive-time estimate without a routing API: great-circle distance, a
 * circuity factor for the road network, a time-of-day corridor speed and a
 * fixed allowance for getting on and off the freeway. Swap for a routing
 * service (Google Routes, Mapbox Matrix) when live traffic matters.
 */
export function driveMinutes(from: LatLng, to: LatLng, dow: number, hour: number): number {
  const miles = haversineMi(from, to) * 1.2;
  if (miles < 0.25) return 1;
  return Math.round((miles / corridorSpeed(dow, hour)) * 60 + 3);
}
