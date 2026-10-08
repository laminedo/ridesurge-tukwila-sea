/**
 * Builds a market around any US location from data bundled with the app:
 * a gazetteer of cities and neighbourhoods, a table of commercial airports and
 * the major-league venues. Nothing is looked up online, so the driver's
 * location never leaves the device.
 *
 * A generated region is coarser than the hand-tuned Seattle one: zones are
 * places from the gazetteer, staging spots are their centres, and venues are
 * limited to big-league stadiums and arenas plus a generic nightlife district.
 */
import { haversineMi } from '../geo';
import { club, inMonths } from '../sim/events';
import type { Carrier, Route } from '../sim/flights';
import type { LatLng, StagingSpot, Zone } from '../types';
import { clamp } from '../util';
import { AIRPORTS, type AirportDef } from './airports';
import { timeZoneFor } from './timezones';
import type { Program, ProfileWeights, Region, Venue } from './types';
import { VENUES, type League, type VenueDef } from './venues';

/** [name, state, lat, lng, population in thousands], largest first. */
export type PlaceRow = readonly [string, string, number, number, number];

const MAX_ZONES = 18;
const SCAN_MI = 30;
const WIDE_SCAN_MI = 60;
const AIRPORT_MI = 50;

interface Place extends LatLng {
  name: string;
  state: string;
  popK: number;
  miles: number;
}

const toPlace = (row: PlaceRow, centre: LatLng): Place => {
  const place = { name: row[0], state: row[1], lat: row[2], lng: row[3], popK: row[4] };
  return { ...place, miles: haversineMi(centre, place) };
};

/** Nearest gazetteer places to a point: for search results and naming. */
export function nearestPlace(rows: readonly PlaceRow[], point: LatLng): Place | undefined {
  let best: Place | undefined;
  for (const row of rows) {
    // Cheap reject before the trigonometry.
    if (Math.abs(row[2] - point.lat) > 3 || Math.abs(row[3] - point.lng) > 4) continue;
    const place = toPlace(row, point);
    if (!best || place.miles < best.miles) best = place;
  }
  return best;
}

/** Short radar label: "DAL", "NYC", "GPR" (Grand Prairie). Unique within a region. */
function codeFor(name: string, taken: Set<string>): string {
  const words = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  let code =
    words.length === 1
      ? words[0].slice(0, 3)
      : words.length === 2
        ? words[0][0] + words[1].slice(0, 2)
        : words.map((w) => w[0]).join('').slice(0, 4);
  code = code.toUpperCase();
  // On a clash (Boise the town against BOI the airport) try another spelling before numbering.
  const letters = words.join('').toUpperCase();
  const alternatives = [code, letters.slice(0, 2) + letters.slice(-1), letters[0] + letters.slice(2, 4)];
  let unique = alternatives.find((c) => c.length >= 2 && !taken.has(c)) ?? code;
  for (let n = 2; taken.has(unique); n++) unique = `${code.slice(0, 3)}${n}`;
  taken.add(unique);
  return unique;
}

/** Everyday demand grows with population, but far more slowly. */
const baseDemand = (popK: number) => clamp(3 + 2.6 * Math.pow(Math.max(1, popK), 0.42), 5, 42);

function profileFor(place: Place, isCore: boolean): ProfileWeights {
  const base = Math.round(baseDemand(place.popK));
  // The metro's main city: offices by day, restaurants and bars at night.
  if (isCore || /downtown|midtown|financial|center city|the loop|uptown/i.test(place.name)) return [base, 0.55, 0.65, 1.0, 0.75, 0.4, 0.3];
  if (/university|college|campus/i.test(place.name)) return [base, 0.4, 0.6, 0.6, 0.7, 0.5, 0.4];
  // Larger towns have their own evening economy; small ones are bedroom communities.
  if (place.popK >= 60) return [base, 0.45, 0.55, 0.7, 0.65, 0.3, 0.2];
  return [base, 0.5, 0.5, 0.65, 0.5, 0.15, 0.06];
}

/** Picks the places to show: the driver's own town first, then the biggest ones that are not on top of each other. */
function pickZones(rows: readonly PlaceRow[], centre: LatLng): { places: Place[]; reach: number } {
  const within = (miles: number) =>
    rows
      .filter((row) => Math.abs(row[2] - centre.lat) < 1.2 && Math.abs(row[3] - centre.lng) < 1.6)
      .map((row) => toPlace(row, centre))
      .filter((p) => p.miles <= miles);

  let candidates = within(SCAN_MI);
  if (candidates.length < 8) candidates = within(WIDE_SCAN_MI);
  if (candidates.length === 0) return { places: [], reach: SCAN_MI };

  // In a dense metro, zoom in: the nearest sixty places already describe the driver's patch.
  const byDistance = [...candidates].sort((a, b) => a.miles - b.miles);
  const reach = byDistance[Math.min(byDistance.length, 60) - 1].miles;
  const spacing = clamp(reach / 9, 1.4, 4.5);
  const nearby = byDistance.filter((p) => p.miles <= reach);

  const chosen: Place[] = [byDistance[0]];
  // Big places matter more, close places matter more.
  const ranked = nearby.sort((a, b) => b.popK / (1 + (b.miles / reach) ** 2) - a.popK / (1 + (a.miles / reach) ** 2));
  for (const place of ranked) {
    if (chosen.length >= MAX_ZONES) break;
    if (chosen.every((c) => haversineMi(c, place) >= spacing)) chosen.push(place);
  }
  return { places: chosen, reach };
}

/** The airport a driver here would work: big and close beats bigger and far. */
function pickAirport(centre: LatLng): AirportDef | undefined {
  let best: AirportDef | undefined;
  let bestScore = 0;
  for (const airport of AIRPORTS) {
    const miles = haversineMi(centre, airport);
    if (miles > AIRPORT_MI) continue;
    const score = airport.daily / (1 + (miles / 20) ** 2);
    if (score > bestScore) {
      best = airport;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Radar positions: true compass bearing and distance from the centre, then
 * nudged apart until every blip has room. Far zones sit on the rim.
 */
function layout(points: LatLng[], centre: LatLng): { x: number; y: number }[] {
  const milesPerLat = 69.05;
  const milesPerLng = 69.17 * Math.cos((centre.lat * Math.PI) / 180);
  const raw = points.map((p) => ({ dx: (p.lng - centre.lng) * milesPerLng, dy: (centre.lat - p.lat) * milesPerLat }));
  const distances = raw.map((p) => Math.hypot(p.dx, p.dy)).sort((a, b) => a - b);
  const reach = Math.max(1, distances[Math.floor(distances.length * 0.9)] ?? 1);

  const RIM = 42;
  const GAP = 13.4;
  const xy = raw.map((p) => {
    const d = Math.hypot(p.dx, p.dy);
    const r = Math.min(RIM, (d / reach) * 38);
    return d === 0 ? { x: 50, y: 50 } : { x: 50 + (p.dx / d) * r, y: 50 + (p.dy / d) * r };
  });

  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < xy.length; i++) {
      for (let j = i + 1; j < xy.length; j++) {
        let dx = xy[j].x - xy[i].x;
        let dy = xy[j].y - xy[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= GAP) continue;
        if (d < 0.01) {
          // Coincident points: separate along a fixed, index-based direction.
          dx = Math.cos(i * 2.4);
          dy = Math.sin(i * 2.4);
          d = 1;
        }
        const push = (GAP - d) / 2 + 0.05;
        xy[i].x -= (dx / d) * push;
        xy[i].y -= (dy / d) * push;
        xy[j].x += (dx / d) * push;
        xy[j].y += (dy / d) * push;
        moved = true;
      }
    }
    for (const p of xy) {
      const d = Math.hypot(p.x - 50, p.y - 50);
      if (d > RIM) {
        p.x = 50 + ((p.x - 50) / d) * RIM;
        p.y = 50 + ((p.y - 50) / d) * RIM;
      }
    }
    if (!moved) break;
  }
  return xy.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
}

/* ---------- Flights ---------- */

const FOREIGN: readonly Route[] = [
  ['LHR', 'London', 540], ['FRA', 'Frankfurt', 570], ['CDG', 'Paris', 540], ['NRT', 'Tokyo', 690],
  ['MEX', 'Mexico City', 240], ['CUN', 'Cancún', 210], ['YYZ', 'Toronto', 180], ['AMS', 'Amsterdam', 540],
];

/** A generic US carrier mix flying in from the other large airports. */
function carriersFor(airport: AirportDef): Carrier[] {
  const routes: Route[] = AIRPORTS.filter((other) => other.code !== airport.code && other.daily >= 150)
    .slice(0, 36)
    .map((other) => [other.code, other.city, Math.round(haversineMi(airport, other) / 8 + 35)]);
  const od = airport.hub ? 0.5 : 0.88;
  const mainline = (code: string, weight: number, concourse: string): Carrier => ({
    code, weight, od, intl: false, fleet: ['B738', 'A321', 'B739', 'A220'], concourses: [concourse], routes,
  });

  const carriers: Carrier[] = [
    mainline('AA', 22, 'A'),
    mainline('DL', 22, 'B'),
    mainline('UA', 20, 'C'),
    mainline('WN', 20, 'D'),
    mainline('AS', 4, 'A'),
    mainline('B6', 4, 'B'),
    mainline('F9', 4, 'D'),
    { code: 'MQ', weight: airport.daily < 120 ? 30 : 8, od, intl: false, fleet: ['E75'], concourses: ['A'], routes },
  ];
  if (airport.daily >= 350) {
    carriers.push({ code: 'INT', weight: 6, od: 0.9, intl: true, fleet: ['B789', 'A339', 'B77W'], concourses: ['E'], routes: FOREIGN });
  }
  return carriers;
}

/* ---------- Events ---------- */

const SEASONS: Record<League, { months: [number, number]; chance: (dow: number) => number; starts: (dow: number) => number[]; duration: [number, number]; sigma: number }> = {
  NFL: { months: [9, 1], chance: (dow) => (dow === 0 ? 0.5 : dow === 1 || dow === 4 ? 0.06 : 0), starts: (dow) => (dow === 0 ? [13, 16.4] : [20.25]), duration: [185, 200], sigma: 10 },
  MLB: { months: [4, 9], chance: () => 0.5, starts: (dow) => (dow === 0 ? [13.2] : [18.7, 19.1]), duration: [160, 190], sigma: 18 },
  NBA: { months: [10, 4], chance: (dow) => (dow === 5 || dow === 6 ? 0.34 : 0.26), starts: () => [19, 19.5], duration: [140, 150], sigma: 8 },
  NHL: { months: [10, 4], chance: (dow) => (dow === 2 || dow === 4 || dow === 6 ? 0.36 : 0.2), starts: () => [19], duration: [150, 160], sigma: 8 },
  MLS: { months: [3, 10], chance: (dow) => (dow === 6 ? 0.4 : dow === 3 ? 0.12 : 0), starts: () => [19.5], duration: [115, 125], sigma: 6 },
};
const LEAGUE_ORDER: League[] = ['NFL', 'MLB', 'NBA', 'NHL', 'MLS'];

function programsFor(key: string, def: VenueDef): Program[] {
  const programs: Program[] = LEAGUE_ORDER.filter((league) => def.teams[league]).map((league) => {
    const season = SEASONS[league];
    return {
      id: `${key}-${league}`,
      venue: key,
      kind: 'sports',
      tag: league,
      titles: [`${def.teams[league]} home game`],
      chance: ({ dow, month }) => (inMonths(month, ...season.months) ? season.chance(dow) : 0),
      starts: ({ dow }) => season.starts(dow),
      durationMin: season.duration,
      fill: league === 'MLB' ? [0.5, 0.9] : league === 'MLS' ? [0.3, 0.5] : [0.92, 1],
      sigmaMin: season.sigma,
    };
  });
  // Arenas fill their dark nights with touring shows.
  if (def.capacity < 25000) {
    programs.push({
      id: `${key}-show`,
      venue: key,
      kind: 'concert',
      tag: 'Concert',
      titles: ['Arena tour: headliner', 'Arena tour: double bill', 'Arena comedy special'],
      chance: ({ dow }) => (dow === 5 || dow === 6 ? 0.3 : 0.14),
      starts: () => [20],
      durationMin: [160, 190],
      fill: [0.75, 1],
      sigmaMin: 12,
    });
  }
  return programs;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- Region ---------- */

export function generateRegion(rows: readonly PlaceRow[], centre: LatLng): Region | null {
  const { places, reach } = pickZones(rows, centre);
  if (places.length === 0) return null;

  const home = places[0];
  const core = places.reduce((a, b) => (b.popK > a.popK ? b : a));
  const airport = pickAirport(centre);
  const taken = new Set<string>(airport ? [airport.code] : []);

  const zones: Zone[] = [];
  const spots: StagingSpot[] = [];
  const profiles: Record<string, ProfileWeights> = {};
  const airportOrigin: Record<string, number> = {};
  const cityZones = places.map((place) => ({ place, id: codeFor(place.name, taken) }));

  const positions = layout([...places, ...(airport ? [airport] : [])], centre);
  cityZones.forEach(({ place, id }, i) => {
    const isCore = place === core;
    zones.push({
      id,
      code: id,
      name: place.name,
      area: isCore ? 'City centre' : place.popK >= 60 ? 'City' : place === home ? 'Your area' : 'Community',
      lat: place.lat,
      lng: place.lng,
      radar: positions[i],
    });
    profiles[id] = profileFor(place, isCore);
    airportOrigin[id] = profiles[id][0] * (isCore ? 1.6 : 1);
    spots.push({
      id: `${id}-centre`,
      zoneId: id,
      official: false,
      name: `${place.name} centre`,
      address: `${place.name}, ${place.state}`,
      note: 'Central point for this area. Pick a legal place to wait nearby.',
      lat: place.lat,
      lng: place.lng,
    });
  });

  if (airport) {
    zones.push({
      id: airport.code,
      code: airport.code,
      name: airport.name.replace(/ International| Airport/g, '').trim() + ' Airport',
      area: 'Arrivals · rideshare queue',
      lat: airport.lat,
      lng: airport.lng,
      radar: positions[positions.length - 1],
    });
    profiles[airport.code] = [5, 0.6, 0.5, 0.6, 0.5, 0.3, 0.05];
    airportOrigin[airport.code] = 0;
    spots.push({
      id: `${airport.code}-airport`,
      zoneId: airport.code,
      official: false,
      name: `${airport.code} rideshare staging`,
      address: airport.name,
      note: 'Directions go to the airport. Follow your driver app to the official waiting lot.',
      lat: airport.lat,
      lng: airport.lng,
    });
  }

  // Venues close enough to matter, each attached to the nearest zone.
  const venues: Record<string, Venue> = {};
  const programs: Program[] = [];
  const nearestZone = (point: LatLng) => zones.reduce((a, b) => (haversineMi(point, b) < haversineMi(point, a) ? b : a));
  for (const def of VENUES) {
    if (haversineMi(centre, def) > Math.max(reach * 1.4, 18)) continue;
    const key = slug(def.name);
    const zone = nearestZone(def);
    venues[key] = { name: def.name, zoneId: zone.id, capacity: def.capacity, spill: { [zone.id]: 1 }, spot: `${key}-venue` };
    spots.push({
      id: `${key}-venue`,
      zoneId: zone.id,
      official: false,
      name: def.name,
      address: `${def.name}, ${zone.name}`,
      note: 'Directions go to the venue. Stage outside the event-day closures.',
      lat: def.lat,
      lng: def.lng,
    });
    programs.push(...programsFor(key, def));
  }

  // Every city of size has a bar district that empties at last call, and weekday conventions.
  const coreZone = cityZones.find((z) => z.place === core)!;
  if (core.popK >= 40) {
    venues.nightlife = {
      name: `${core.name} bars and clubs`,
      zoneId: coreZone.id,
      capacity: Math.round(clamp(core.popK * 4, 300, 2600)),
      spill: { [coreZone.id]: 1 },
      spot: `${coreZone.id}-centre`,
    };
    programs.push(club('nightlife', 'nightlife', 'Club', 21, 26, ({ dow }) => (dow === 5 || dow === 6 ? 1 : dow === 4 ? 0.7 : 0)));
  }
  if (core.popK >= 150) {
    venues.convention = {
      name: `${core.name} convention centre`,
      zoneId: coreZone.id,
      capacity: Math.round(clamp(core.popK * 8, 1500, 10000)),
      spill: { [coreZone.id]: 1 },
      spot: `${coreZone.id}-centre`,
    };
    programs.push({
      id: 'convention',
      venue: 'convention',
      kind: 'convention',
      tag: 'Convention',
      titles: ['Conference: day sessions end', 'Trade expo: show floor closes'],
      chance: ({ dow }) => (dow >= 1 && dow <= 5 ? 0.4 : 0),
      starts: () => [9],
      durationMin: [480, 510],
      fill: [0.3, 0.9],
      sigmaMin: 15,
    });
  }

  return {
    id: `gen:${home.name}-${home.state}:${centre.lat.toFixed(2)},${centre.lng.toFixed(2)}`,
    name: core === home || core.miles > reach ? `${home.name}, ${home.state}` : `${home.name} · ${core.name}, ${core.state}`,
    source: 'generated',
    timeZone: timeZoneFor(home.state, home.lat, home.lng),
    home: { lat: centre.lat, lng: centre.lng, label: home.name },
    airport: airport ? { code: airport.code, name: airport.name, zoneId: airport.code } : null,
    zones,
    spots,
    // No hotel list ships for generated regions; the Hotels screen opens a map search instead.
    hotels: [],
    profiles,
    airportOrigin,
    venues,
    programs,
    flights: airport ? { daily: airport.daily, localShare: airport.hub ? 0.5 : 0.88, carriers: carriersFor(airport), satellites: ['E'] } : null,
  };
}
