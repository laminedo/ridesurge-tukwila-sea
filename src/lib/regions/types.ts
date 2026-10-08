import type { Carrier } from '../sim/flights';
import type { EventKind, RegionInfo } from '../types';

/** [base requests per 15 min, AM commute, midday, PM commute, evening, late night, bar close] */
export type ProfileWeights = readonly [number, number, number, number, number, number, number];

export interface DayContext {
  /** 0 = Sunday. */
  dow: number;
  month: number;
  date: number;
}

export interface Venue {
  name: string;
  zoneId: string;
  capacity: number;
  /** Share of egress demand landing in each zone (riders walk out of the pickup geofence). */
  spill: Record<string, number>;
  /** Staging spot id. */
  spot: string;
}

export interface Program {
  id: string;
  /** Key into the region's venues. */
  venue: string;
  kind: EventKind;
  tag: string;
  titles: readonly string[];
  /** Chance the venue hosts this on a given day. */
  chance: (c: DayContext) => number;
  /** Candidate local start hours (decimal). */
  starts: (c: DayContext) => readonly number[];
  durationMin: readonly [number, number];
  /** Attendance as a share of capacity. */
  fill: readonly [number, number];
  /** Spread of the dismissal time around schedule, minutes. */
  sigmaMin: number;
  capacity?: number;
  /** Override for crowds that trickle out during the event (cruise disembarkation). */
  egress?: { earlyMin: number; clearMin: number };
  /** Late-night venues empty toward a hard closing time instead of after a final whistle. */
  closing?: boolean;
}

export interface FlightProfile {
  /** Scheduled passenger arrivals on a typical day. */
  daily: number;
  /** Share of departing passengers who start their trip locally rather than connecting. */
  localShare: number;
  carriers: readonly Carrier[];
  /** Concourses that add a train ride to the walk out. */
  satellites: readonly string[];
}

/**
 * Everything the engine needs to simulate one market. `RegionInfo` is the part
 * the screens need and travels in every snapshot; the rest stays in the engine.
 */
export interface Region extends RegionInfo {
  profiles: Record<string, ProfileWeights>;
  /** Relative weight of each zone as a starting point for rides to the airport. */
  airportOrigin: Record<string, number>;
  venues: Record<string, Venue>;
  /** In priority order: an earlier program claims its venue for the day. */
  programs: readonly Program[];
  /** `null` when no commercial airport is within reach. */
  flights: FlightProfile | null;
}

export function regionInfo(region: Region): RegionInfo {
  const { id, name, source, timeZone, home, airport, zones, spots, hotels } = region;
  return { id, name, source, timeZone, home, airport, zones, spots, hotels };
}
