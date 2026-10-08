'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { RegionInfo, StagingSpot, Zone, ZoneId } from '@/lib/types';

/** The market on screen, with the lookups the screens need. */
export interface RegionView {
  info: RegionInfo;
  zoneById: Record<ZoneId, Zone>;
  spotById: Record<string, StagingSpot>;
  spotsForZone: (zone: ZoneId) => StagingSpot[];
  /** Where to wait for airport pickups, when the region has an airport. */
  airportSpot: StagingSpot | undefined;
}

const Context = createContext<RegionView | null>(null);

export function RegionProvider({ region, children }: { region: RegionInfo; children: ReactNode }) {
  const view = useMemo<RegionView>(() => {
    const byZone = new Map<ZoneId, StagingSpot[]>();
    for (const spot of region.spots) byZone.set(spot.zoneId, [...(byZone.get(spot.zoneId) ?? []), spot]);
    return {
      info: region,
      zoneById: Object.fromEntries(region.zones.map((z) => [z.id, z])),
      spotById: Object.fromEntries(region.spots.map((s) => [s.id, s])),
      spotsForZone: (zone) => byZone.get(zone) ?? [],
      airportSpot: region.airport ? byZone.get(region.airport.zoneId)?.[0] : undefined,
    };
  }, [region]);

  return <Context.Provider value={view}>{children}</Context.Provider>;
}

export function useRegion(): RegionView {
  const view = useContext(Context);
  if (!view) throw new Error('useRegion must be used inside a RegionProvider');
  return view;
}
