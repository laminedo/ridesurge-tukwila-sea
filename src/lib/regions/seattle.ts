/**
 * The hand-tuned Seattle–Tacoma market: real neighbourhoods, staging spots,
 * venues with their programming patterns, and Sea-Tac's carrier mix. Drivers
 * anywhere else get a region generated around them (see `generate.ts`).
 */
import { SEATTLE_PROGRAMS, SEATTLE_VENUES } from '../sim/events';
import { SEATTLE_CARRIERS } from '../sim/flights';
import { HOME_BASE, STAGING_SPOTS, ZONES } from '../zones';
import type { ProfileWeights, Region } from './types';

const PROFILES: Record<string, ProfileWeights> = {
  SEA: [5, 0.6, 0.5, 0.6, 0.5, 0.3, 0.05],
  TUK: [15, 0.35, 0.9, 0.9, 0.75, 0.15, 0.05],
  REN: [11, 0.5, 0.55, 0.75, 0.5, 0.12, 0.05],
  KNT: [9, 0.5, 0.45, 0.65, 0.5, 0.12, 0.05],
  SODO: [12, 0.45, 0.5, 0.7, 0.35, 0.15, 0.08],
  DTN: [42, 0.55, 0.65, 1.0, 0.75, 0.38, 0.3],
  CAP: [30, 0.35, 0.35, 0.55, 0.85, 0.7, 0.6],
  SLU: [26, 0.6, 0.55, 1.0, 0.45, 0.14, 0.06],
  LQA: [18, 0.35, 0.45, 0.55, 0.75, 0.3, 0.2],
  UDX: [20, 0.4, 0.6, 0.6, 0.7, 0.45, 0.35],
  BEL: [25, 0.5, 0.65, 1.0, 0.65, 0.2, 0.1],
  BAL: [16, 0.35, 0.4, 0.5, 0.85, 0.6, 0.45],
  FRE: [14, 0.35, 0.4, 0.5, 0.8, 0.5, 0.35],
  NGT: [12, 0.5, 0.6, 0.7, 0.5, 0.15, 0.06],
  AUR: [9, 0.35, 0.45, 0.55, 0.55, 0.4, 0.3],
  SHO: [8, 0.5, 0.45, 0.6, 0.45, 0.12, 0.05],
  WSE: [12, 0.45, 0.45, 0.55, 0.65, 0.3, 0.2],
  BUR: [9, 0.5, 0.45, 0.6, 0.5, 0.2, 0.1],
  FDW: [10, 0.5, 0.55, 0.65, 0.5, 0.15, 0.06],
  KRK: [14, 0.45, 0.5, 0.7, 0.75, 0.35, 0.25],
  RDM: [15, 0.55, 0.6, 1.0, 0.5, 0.15, 0.06],
};

/** Where airport-bound riders start. The terminal hotels run their own shuttles. */
const AIRPORT_ORIGIN: Record<string, number> = {
  SEA: 0, TUK: 5, REN: 4, KNT: 3, SODO: 1, DTN: 16, CAP: 7, SLU: 7, LQA: 5, UDX: 5, BEL: 10,
  BAL: 5, FRE: 4, NGT: 4, AUR: 2, SHO: 3, WSE: 4, BUR: 2, FDW: 3, KRK: 5, RDM: 5,
};

export const SEATTLE: Region = {
  id: 'seattle',
  name: 'Seattle–Tacoma',
  source: 'curated',
  timeZone: 'America/Los_Angeles',
  home: HOME_BASE,
  airport: { code: 'SEA', name: 'Seattle-Tacoma International Airport', zoneId: 'SEA' },
  zones: ZONES,
  spots: STAGING_SPOTS,
  profiles: PROFILES,
  airportOrigin: AIRPORT_ORIGIN,
  venues: SEATTLE_VENUES,
  programs: SEATTLE_PROGRAMS,
  flights: { daily: 606, localShare: 0.65, carriers: SEATTLE_CARRIERS, satellites: ['N', 'S'] },
};

/** Anywhere within this distance of Seattle uses the curated market. */
export const SEATTLE_CENTER = { lat: 47.56, lng: -122.33 };
export const SEATTLE_RADIUS_MI = 45;
