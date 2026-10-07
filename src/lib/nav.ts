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
