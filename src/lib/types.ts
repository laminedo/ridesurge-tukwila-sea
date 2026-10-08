/** Zone ids are unique within a region ("SEA", "DTN", …). */
export type ZoneId = string;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Zone extends LatLng {
  id: ZoneId;
  /** Short label drawn inside radar blips and grid rows. */
  code: string;
  name: string;
  area: string;
  /** Schematic radar position, 0–100 on both axes, north up. */
  radar: { x: number; y: number };
}

export interface StagingSpot extends LatLng {
  id: string;
  zoneId: ZoneId;
  name: string;
  /** Geocodable destination handed to the navigation app. */
  address: string;
  note: string;
  /** True for lots designated by the airport/venue; false for suggested areas. */
  official: boolean;
}

/** A hotel worth knowing as a pickup point. */
export interface Hotel {
  id: string;
  name: string;
  zoneId: ZoneId;
  /** Approximate room count: how much business it can generate. */
  rooms: number;
  /** What the navigation app is asked to find. */
  address: string;
}

/** The market a snapshot describes: what the screens need to draw it. */
export interface RegionInfo {
  id: string;
  name: string;
  /** Hand-tuned market, or one generated around the driver from the bundled gazetteer. */
  source: 'curated' | 'generated';
  timeZone: string;
  /** Where drive times start when the driver's own position is not in use. */
  home: LatLng & { label: string };
  airport: { code: string; name: string; zoneId: ZoneId } | null;
  zones: Zone[];
  spots: StagingSpot[];
  /** Named hotels, where the region has a curated list. Elsewhere the app hands off to a map search. */
  hotels: Hotel[];
}

/* ---------- Flights ---------- */

export type FlightStatus = 'scheduled' | 'enroute' | 'landed' | 'at_gate';

export interface Flight {
  id: string;
  flightNo: string;
  origin: string;
  originCity: string;
  aircraft: string;
  international: boolean;
  widebody: boolean;
  concourse: string;
  scheduled: number;
  /** Estimated (future) or actual (past) wheels-down time. */
  touchdown: number;
  delayMin: number;
  pax: number;
  /** Expected ride requests this flight generates. */
  requests: number;
  /** Most likely touchdown→request lag for this flight, minutes. */
  lagMin: number;
  curbStart: number;
  curbEnd: number;
  status: FlightStatus;
}

export interface FlightBucket {
  t: number;
  /** Ride requests attributed to the moment their flight touched down. */
  landing: number;
  /** Ride requests expected at the curb in this bucket (lag applied). */
  curb: number;
  pax: number;
  flights: number;
}

export interface FlightWave {
  id: string;
  start: number;
  end: number;
  peak: number;
  /** Peak ride requests per bucket. */
  peakRate: number;
  requests: number;
  flights: number;
  pax: number;
  international: number;
}

export interface FlightFeed {
  generatedAt: number;
  source: 'simulated';
  bucketMin: number;
  lag: { minMin: number; maxMin: number };
  buckets: FlightBucket[];
  waves: FlightWave[];
  arrivals: Flight[];
}

/* ---------- Venue events ---------- */

export type EventKind = 'sports' | 'concert' | 'theater' | 'convention' | 'cruise' | 'festival' | 'nightlife';
export type EventStatus = 'upcoming' | 'live' | 'egress' | 'cleared';

export interface VenueEvent {
  id: string;
  venue: string;
  zoneId: ZoneId;
  kind: EventKind;
  tag: string;
  title: string;
  start: number;
  /** Estimated dismissal time. */
  end: number;
  /** ± minutes of uncertainty on the dismissal estimate. */
  endUncertaintyMin: number;
  attendance: number;
  /** Expected ride requests across the whole egress. */
  requests: number;
  egressStart: number;
  egressPeak: number;
  egressEnd: number;
  status: EventStatus;
  stagingSpotId: string;
  /** Share of egress demand landing in each zone (riders walk out of the geofence). */
  spill: Record<ZoneId, number>;
  bucketMin: number;
  curve: { t: number; requests: number }[];
}

export interface EventFeed {
  generatedAt: number;
  source: 'simulated';
  events: VenueEvent[];
}

/* ---------- Rides to the airport ---------- */

export interface AirportRunFeed {
  generatedAt: number;
  source: 'simulated';
  stepMin: number;
  /** How long before departure riders leave home. */
  lead: { minMin: number; maxMin: number };
  steps: number[];
  /** Region-wide airport-bound ride requests per step. */
  total: number[];
  zones: { zoneId: ZoneId; requests: number[] }[];
  /** The departures those riders are travelling to catch. */
  departing: { from: number; to: number; flights: number; pax: number };
}

/* ---------- Forecast ---------- */

export interface ZoneStep {
  t: number;
  mult: number;
  lo: number;
  hi: number;
  demand: number;
  supply: number;
  organic: number;
  /** Arrivals at the airport curb. */
  flights: number;
  /** Riders heading from this zone to the airport. */
  airport: number;
  events: number;
}

export interface ZoneForecast {
  zoneId: ZoneId;
  steps: ZoneStep[];
}

export interface ModelInfo {
  id: string;
  label: string;
  mode: 'remote' | 'emulated';
  note: string;
  contextSteps: number;
  horizonSteps: number;
  stepMin: number;
}

export interface ForecastFeed {
  generatedAt: number;
  stepMin: number;
  /** Start time of each forecast bucket; index 0 is the bucket in progress. */
  steps: number[];
  model: ModelInfo;
  /** Today's organic demand level relative to a typical day (1 = typical). */
  demandIndex: number;
  zones: ZoneForecast[];
}

export interface Snapshot {
  generatedAt: number;
  simulated: boolean;
  region: RegionInfo;
  flights: FlightFeed;
  airportRuns: AirportRunFeed;
  events: EventFeed;
  forecast: ForecastFeed;
}
