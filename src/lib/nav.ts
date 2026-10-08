import type { StagingSpot } from './types';

export type NavApp = 'google' | 'waze' | 'apple';

export const NAV_APPS: { id: NavApp; label: string }[] = [
  { id: 'google', label: 'Google Maps' },
  { id: 'waze', label: 'Waze' },
  { id: 'apple', label: 'Apple Maps' },
];

/** Universal link that opens turn-by-turn directions in the chosen app. */
export function navUrl(app: NavApp, spot: StagingSpot): string {
  const destination = encodeURIComponent(spot.address);
  switch (app) {
    case 'waze':
      return `https://waze.com/ul?q=${destination}&navigate=yes`;
    case 'apple':
      return `https://maps.apple.com/?daddr=${destination}&dirflg=d`;
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  }
}

/** Opens the navigation app's own search (for example "hotels") around a point. */
export function searchUrl(app: NavApp, query: string, near: { lat: number; lng: number }): string {
  const q = encodeURIComponent(query);
  const ll = `${near.lat.toFixed(4)},${near.lng.toFixed(4)}`;
  switch (app) {
    case 'waze':
      return `https://waze.com/ul?q=${q}&ll=${encodeURIComponent(ll)}&z=14`;
    case 'apple':
      return `https://maps.apple.com/?q=${q}&sll=${ll}&z=14`;
    default:
      return `https://www.google.com/maps/search/${q}/@${ll},14z`;
  }
}
