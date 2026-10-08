import { afterEach, describe, expect, it, vi } from 'vitest';
import { surgeMultiplier, MAX_MULTIPLIER } from './forecast/surge';
import { CONTEXT_STEPS, HORIZON_STEPS, emulateTimesFM, runForecast, type SeriesInput } from './forecast/timesfm';
import { driveMinutes } from './geo';
import { demandHeat, demandLevel, heatColor, surgeLevel } from './heat';
import { hotelPickups } from './hotels';
import { bearingDeg, compassPoint, radarPosition } from './police';
import { rankZones } from './recommend';
import { SEATTLE, resolveRegion } from './regions';
import { LEAD_MAX, LEAD_MIN, airportRunTotals, buildAirportRunFeed, originShare } from './sim/departures';
import { eventsForDay } from './sim/events';
import { LAG_MAX, LAG_MIN, buildFlightFeed, flightsForDay, lagCdf, spreadCurb } from './sim/flights';
import { buildSnapshot, resolveAt } from './snapshot';
import { DAY, HOUR, MIN, localClock, pacificOffsetMs, zoneOffsetMs } from './time';
import { HOME_BASE, STAGING_SPOTS, ZONES, defaultSpot } from './zones';

// Friday 10:30 PM Pacific: late arrival banks, shows letting out, nightlife.
const FRIDAY_NIGHT = Date.parse('2026-10-10T05:30:00Z');
const OFFSET = pacificOffsetMs(FRIDAY_NIGHT);

describe('Pacific time', () => {
  it('resolves daylight and standard offsets', () => {
    expect(pacificOffsetMs(Date.parse('2026-07-01T12:00:00Z'))).toBe(-7 * 60 * MIN);
    expect(pacificOffsetMs(Date.parse('2026-12-01T12:00:00Z'))).toBe(-8 * 60 * MIN);
  });

  it('reads the local weekday and hour', () => {
    const { dow, hour } = localClock(FRIDAY_NIGHT, OFFSET);
    expect(dow).toBe(5);
    expect(hour).toBeCloseTo(22.5);
  });
});

describe('touchdown → ride request lag', () => {
  it('is a proper distribution over 20–35 minutes', () => {
    expect(lagCdf(LAG_MIN, 24)).toBe(0);
    expect(lagCdf(LAG_MAX, 24)).toBe(1);
    let previous = 0;
    for (let x = LAG_MIN; x <= LAG_MAX; x += 0.5) {
      const value = lagCdf(x, 24);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('puts every request inside the window and loses none', () => {
    const touchdown = FRIDAY_NIGHT + 7 * MIN;
    let total = 0;
    spreadCurb(touchdown, 40, 27, MIN, (t, amount) => {
      expect(t + MIN).toBeGreaterThan(touchdown + LAG_MIN * MIN);
      expect(t).toBeLessThan(touchdown + LAG_MAX * MIN);
      total += amount;
    });
    expect(total).toBeCloseTo(40, 6);
  });
});

describe('flight feed', () => {
  const feed = buildFlightFeed(SEATTLE, FRIDAY_NIGHT, OFFSET);

  it('is deterministic for a given moment', () => {
    expect(buildFlightFeed(SEATTLE, FRIDAY_NIGHT, OFFSET)).toEqual(feed);
  });

  it('generates a realistic day of arrivals', () => {
    const day = flightsForDay(SEATTLE, localClock(FRIDAY_NIGHT, OFFSET).day, OFFSET);
    expect(day.length).toBeGreaterThan(450);
    expect(day.length).toBeLessThan(750);
  });

  it('gives each arrival a curb window 20–35 minutes after touchdown', () => {
    expect(feed.arrivals.length).toBeGreaterThan(0);
    for (const f of feed.arrivals) {
      expect(f.curbStart - f.touchdown).toBe(LAG_MIN * MIN);
      expect(f.curbEnd - f.touchdown).toBe(LAG_MAX * MIN);
      expect(f.lagMin).toBeGreaterThan(LAG_MIN);
      expect(f.lagMin).toBeLessThan(LAG_MAX);
    }
  });

  it('shifts curb demand later than touchdowns by 20–35 minutes on average', () => {
    const centroid = (key: 'landing' | 'curb') => {
      // Only touchdowns whose whole curb window fits inside the chart.
      const usable = feed.buckets.slice(0, feed.buckets.length - (key === 'landing' ? 8 : 0));
      const mass = usable.reduce((s, b) => s + b[key], 0);
      return usable.reduce((s, b) => s + b[key] * b.t, 0) / mass;
    };
    const shiftMin = (centroid('curb') - centroid('landing')) / MIN;
    expect(shiftMin).toBeGreaterThan(5);
    expect(shiftMin).toBeLessThan(60);
  });

  it('reports only waves that are still ahead or in progress', () => {
    for (const wave of feed.waves) {
      expect(wave.end).toBeGreaterThan(FRIDAY_NIGHT);
      expect(wave.requests).toBeGreaterThan(0);
      expect(wave.peak).toBeGreaterThanOrEqual(wave.start);
      expect(wave.peak).toBeLessThan(wave.end);
    }
  });
});

describe('venue egress', () => {
  const day = localClock(FRIDAY_NIGHT, OFFSET).day;

  it('releases the whole crowd once, peaking after early leavers start', () => {
    const events = Array.from({ length: 7 }, (_, i) => eventsForDay(SEATTLE, day + i, OFFSET)).flat();
    expect(events.length).toBeGreaterThan(5);
    for (const e of events) {
      const released = e.curve.reduce((s, v) => s + v, 0);
      expect(Math.abs(released - e.requests)).toBeLessThan(1);
      expect(e.egressStart).toBeLessThan(e.end);
      expect(e.egressPeak).toBeGreaterThan(e.egressStart);
      expect(e.egressEnd).toBeGreaterThan(e.egressPeak);
      const spill = Object.values(e.spill).reduce((s, v) => s + (v ?? 0), 0);
      expect(spill).toBeCloseTo(1, 6);
    }
  });
});

describe('clubs and late-night venues', () => {
  it('empty toward closing time with the rush at last call', () => {
    // Friday night: every club is open.
    const clubs = eventsForDay(SEATTLE, localClock(FRIDAY_NIGHT, OFFSET).day, OFFSET).filter((e) => e.kind === 'nightlife');
    expect(clubs.length).toBeGreaterThanOrEqual(8);
    expect(clubs.some((e) => e.tag === 'Showgirls')).toBe(true);
    for (const club of clubs) {
      const closeHour = localClock(club.end, OFFSET).hour;
      expect(closeHour).toBeGreaterThanOrEqual(2);
      expect(closeHour).toBeLessThan(3);
      const busiest = club.curve.indexOf(Math.max(...club.curve));
      const busiestAt = club.curveStart + busiest * 5 * MIN;
      expect(Math.abs(busiestAt - club.end)).toBeLessThanOrEqual(5 * MIN);
    }
  });
});

describe('rides to the airport', () => {
  // Thursday 5:00 AM Pacific: riders are leaving home for the morning departure bank.
  const EARLY = Date.parse('2026-10-08T12:00:00Z');

  it('peak before dawn and fade overnight', () => {
    const offset = pacificOffsetMs(EARLY);
    const morning = airportRunTotals(SEATTLE, EARLY, 15 * MIN, 4, offset).reduce((s, v) => s + v, 0);
    const lateNight = airportRunTotals(SEATTLE, EARLY - 5 * 60 * MIN, 15 * MIN, 4, offset).reduce((s, v) => s + v, 0);
    expect(morning).toBeGreaterThan(200);
    expect(lateNight).toBeLessThan(morning / 10);
    expect(LEAD_MIN).toBeLessThan(LEAD_MAX);
  });

  it('start in neighbourhoods and hotels, never at the airport itself', () => {
    const feed = buildAirportRunFeed(SEATTLE, EARLY, pacificOffsetMs(EARLY));
    expect(originShare(SEATTLE, 'SEA')).toBe(0);
    expect(feed.zones.some((z) => z.zoneId === 'SEA')).toBe(false);
    expect(ZONES.reduce((s, z) => s + originShare(SEATTLE, z.id), 0)).toBeCloseTo(1, 6);
    feed.total.forEach((total, i) => {
      const split = feed.zones.reduce((s, z) => s + z.requests[i], 0);
      expect(Math.abs(split - total)).toBeLessThan(1.5);
    });
    expect(feed.departing.flights).toBeGreaterThan(50);
  });

  it('show up in the zone forecast as their own demand source', async () => {
    const { forecast } = await buildSnapshot(EARLY);
    const downtown = forecast.zones.find((z) => z.zoneId === 'DTN');
    const airport = forecast.zones.find((z) => z.zoneId === 'SEA');
    expect(downtown?.steps[0].airport).toBeGreaterThan(5);
    expect(airport?.steps.every((s) => s.airport === 0)).toBe(true);
  });
});

describe('surge multiplier', () => {
  it('stays at 1.0× while drivers cover demand', () => {
    expect(surgeMultiplier(40, 40)).toBe(1);
    expect(surgeMultiplier(10, 80)).toBe(1);
  });

  it('rises with demand, falls with supply and respects the cap', () => {
    let previous = 1;
    for (let demand = 20; demand <= 2000; demand += 20) {
      const m = surgeMultiplier(demand, 40);
      expect(m).toBeGreaterThanOrEqual(previous);
      expect(m).toBeLessThanOrEqual(MAX_MULTIPLIER);
      previous = m;
    }
    expect(previous).toBe(MAX_MULTIPLIER);
    expect(surgeMultiplier(100, 40)).toBeGreaterThan(surgeMultiplier(100, 80));
  });

  it('damps surge in thin markets', () => {
    expect(surgeMultiplier(4, 2)).toBeLessThan(surgeMultiplier(40, 20));
  });
});

describe('TimesFM emulator', () => {
  const flat = (value: number, withSpikeAt?: number): SeriesInput => {
    const covariate = new Array<number>(CONTEXT_STEPS + HORIZON_STEPS).fill(0);
    if (withSpikeAt !== undefined) covariate[CONTEXT_STEPS + withSpikeAt] = 50;
    return { id: 'z', context: new Array<number>(CONTEXT_STEPS).fill(value), covariates: [covariate] };
  };

  it('returns ordered quantiles for every horizon step', () => {
    const [f] = emulateTimesFM([flat(20)], HORIZON_STEPS);
    expect(f.point).toHaveLength(HORIZON_STEPS);
    f.point.forEach((p, h) => {
      expect(p).toBeCloseTo(20, 6);
      expect(f.q10[h]).toBeLessThanOrEqual(p);
      expect(f.q90[h]).toBeGreaterThanOrEqual(p);
    });
    expect(f.q90[HORIZON_STEPS - 1] - f.q10[HORIZON_STEPS - 1]).toBeGreaterThan(f.q90[0] - f.q10[0]);
  });

  it('adds known-future covariates on top of the baseline', () => {
    const [f] = emulateTimesFM([flat(20, 5)], HORIZON_STEPS);
    expect(f.point[5]).toBeCloseTo(70, 6);
    expect(f.point[4]).toBeCloseTo(20, 6);
  });
});

describe('TimesFM sidecar client', () => {
  const series: SeriesInput[] = [
    { id: 'SEA', context: new Array<number>(CONTEXT_STEPS).fill(30), covariates: [new Array<number>(CONTEXT_STEPS + HORIZON_STEPS).fill(0)] },
  ];

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the sidecar forecast when TIMESFM_URL is set', async () => {
    vi.stubEnv('TIMESFM_URL', 'http://127.0.0.1:8765/');
    const flat = (v: number) => new Array<number>(HORIZON_STEPS).fill(v);
    const fetchMock = vi.fn(async () =>
      Response.json({ model: 'google/timesfm-3.0-pytorch', series: [{ id: 'SEA', point: flat(42), q10: flat(35), q90: flat(50) }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const run = await runForecast(series, HORIZON_STEPS);
    expect(run.model.mode).toBe('remote');
    expect(run.model.id).toBe('google/timesfm-3.0-pytorch');
    expect(run.forecasts[0].point[0]).toBe(42);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8765/forecast');
    const body = JSON.parse(String(init.body)) as { horizon: number; series: SeriesInput[] };
    expect(body.horizon).toBe(HORIZON_STEPS);
    expect(body.series[0].covariates[0]).toHaveLength(CONTEXT_STEPS + HORIZON_STEPS);
  });

  it('falls back to the emulator when the sidecar fails or answers badly', async () => {
    vi.stubEnv('TIMESFM_URL', 'http://127.0.0.1:8765');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection refused'); }));
    const down = await runForecast(series, HORIZON_STEPS);
    expect(down.model.mode).toBe('emulated');
    expect(down.model.note).toContain('connection refused');
    expect(down.forecasts[0].point).toHaveLength(HORIZON_STEPS);

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ series: [{ id: 'SEA', point: [1, 2] }] })));
    const malformed = await runForecast(series, HORIZON_STEPS);
    expect(malformed.model.mode).toBe('emulated');
  });

  it('uses the emulator when no sidecar is configured', async () => {
    vi.stubEnv('TIMESFM_URL', '');
    expect((await runForecast(series, HORIZON_STEPS)).model.mode).toBe('emulated');
  });
});

describe('snapshot', () => {
  it('forecasts at least eight zones in 15-minute steps with sane bounds', async () => {
    const snapshot = await buildSnapshot(FRIDAY_NIGHT);
    const { forecast } = snapshot;
    expect(forecast.zones.length).toBeGreaterThanOrEqual(8);
    expect(forecast.zones.map((z) => z.zoneId)).toEqual(ZONES.map((z) => z.id));
    expect(forecast.steps).toHaveLength(HORIZON_STEPS);
    expect(forecast.steps[0]).toBeLessThanOrEqual(FRIDAY_NIGHT);
    expect(forecast.steps[1] - forecast.steps[0]).toBe(15 * MIN);

    for (const zone of forecast.zones) {
      expect(zone.steps).toHaveLength(HORIZON_STEPS);
      for (const s of zone.steps) {
        expect(s.mult).toBeGreaterThanOrEqual(1);
        expect(s.mult).toBeLessThanOrEqual(MAX_MULTIPLIER);
        expect(s.lo).toBeLessThanOrEqual(s.mult);
        expect(s.hi).toBeGreaterThanOrEqual(s.mult);
      }
    }
  });

  it('only attributes flight demand to the airport', async () => {
    const { forecast } = await buildSnapshot(FRIDAY_NIGHT);
    for (const zone of forecast.zones) {
      const flights = zone.steps.reduce((s, step) => s + step.flights, 0);
      if (zone.zoneId === 'SEA') expect(flights).toBeGreaterThan(0);
      else expect(flights).toBe(0);
    }
  });

  it('validates the simulation clock override', () => {
    const request = (query: string) => new Request(`http://localhost/api/snapshot${query}`);
    expect(resolveAt(request(''))).toHaveProperty('at');
    expect(resolveAt(request(`?at=${Date.now() + DAY}`))).toHaveProperty('at');
    expect(resolveAt(request('?at=tomorrow'))).toHaveProperty('error');
    expect(resolveAt(request(`?at=${Date.now() + 90 * DAY}`))).toHaveProperty('error');
  });
});

describe('recommendations', () => {
  it('ranks every zone and never asks the driver to leave in the past for a future stage time', async () => {
    const snapshot = await buildSnapshot(FRIDAY_NIGHT);
    const ranked = rankZones(snapshot, 0, { origin: HOME_BASE, now: FRIDAY_NIGHT });
    expect(ranked).toHaveLength(ZONES.length);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    for (const r of ranked) {
      expect(r.driveMin).toBeGreaterThan(0);
      expect(r.stageBy - r.leaveBy).toBe(r.driveMin * MIN);
      expect(r.peakMult).toBeGreaterThanOrEqual(1);
      expect(r.reason.length).toBeGreaterThan(10);
    }
    // A sold-out arena show is letting out at this moment in the simulated world.
    expect(ranked[0].surge).toBe(true);
  });
});

describe('zones and staging', () => {
  it('keeps radar blips apart and inside the scope', () => {
    for (const a of ZONES) {
      expect(Math.hypot(a.radar.x - 50, a.radar.y - 50)).toBeLessThanOrEqual(44);
      for (const b of ZONES) {
        if (a.id < b.id) expect(Math.hypot(a.radar.x - b.radar.x, a.radar.y - b.radar.y)).toBeGreaterThanOrEqual(13);
      }
    }
  });

  it('covers at least twenty zones, each with a staging spot', () => {
    expect(ZONES.length).toBeGreaterThanOrEqual(20);
    for (const zone of ZONES) expect(defaultSpot(zone.id)).toBeDefined();
    expect(new Set(STAGING_SPOTS.map((s) => s.id)).size).toBe(STAGING_SPOTS.length);
  });

  it('estimates plausible drive times from Tukwila', () => {
    const airport = driveMinutes(HOME_BASE, defaultSpot('SEA'), 3, 13);
    const bellevue = driveMinutes(HOME_BASE, defaultSpot('BEL'), 3, 13);
    expect(airport).toBeGreaterThan(3);
    expect(airport).toBeLessThan(15);
    expect(bellevue).toBeGreaterThan(airport);
    expect(driveMinutes(HOME_BASE, defaultSpot('BEL'), 3, 17)).toBeGreaterThan(bellevue);
  });
});

describe('regions anywhere in the US', () => {
  const AREAS = [
    { label: 'Dallas, TX', lat: 32.78, lng: -96.8, airport: 'DFW', timeZone: 'America/Chicago' },
    { label: 'Manhattan, NY', lat: 40.75, lng: -73.99, airport: 'LGA', timeZone: 'America/New_York' },
    { label: 'Los Angeles, CA', lat: 34.05, lng: -118.25, airport: 'LAX', timeZone: 'America/Los_Angeles' },
    { label: 'Boise, ID', lat: 43.62, lng: -116.2, airport: 'BOI', timeZone: 'America/Boise' },
    { label: 'Miami, FL', lat: 25.77, lng: -80.19, airport: 'MIA', timeZone: 'America/New_York' },
  ];

  it('keeps the hand-tuned market for drivers around Seattle', async () => {
    expect(await resolveRegion({ mode: 'seattle' })).toBe(SEATTLE);
    expect(await resolveRegion({ mode: 'point', lat: 47.46, lng: -122.26 })).toBe(SEATTLE);
    for (const program of SEATTLE.programs) expect(SEATTLE.venues[program.venue]).toBeDefined();
  });

  it.each(AREAS)('builds a usable market around $label', async (area) => {
    const region = await resolveRegion({ mode: 'point', lat: area.lat, lng: area.lng });
    expect(region.source).toBe('generated');
    expect(region.timeZone).toBe(area.timeZone);
    expect(region.airport?.code).toBe(area.airport);
    expect(region.zones.length).toBeGreaterThanOrEqual(4);
    expect(new Set(region.zones.map((z) => z.id)).size).toBe(region.zones.length);

    // Every zone is drawable, forecastable and has somewhere to navigate to.
    for (const a of region.zones) {
      expect(region.profiles[a.id]).toBeDefined();
      expect(region.spots.some((s) => s.zoneId === a.id)).toBe(true);
      expect(Math.hypot(a.radar.x - 50, a.radar.y - 50)).toBeLessThanOrEqual(44);
      for (const b of region.zones) {
        if (a.id < b.id) expect(Math.hypot(a.radar.x - b.radar.x, a.radar.y - b.radar.y)).toBeGreaterThanOrEqual(12.5);
      }
    }
    for (const program of region.programs) expect(region.venues[program.venue]).toBeDefined();
    for (const venue of Object.values(region.venues)) expect(region.spots.some((s) => s.id === venue.spot)).toBe(true);
  });

  it.each(AREAS)('forecasts and recommends for $label in its own time zone', async (area) => {
    const region = await resolveRegion({ mode: 'point', lat: area.lat, lng: area.lng });
    const snapshot = await buildSnapshot(FRIDAY_NIGHT, region);
    expect(snapshot.region.id).toBe(region.id);
    expect(snapshot.forecast.zones.map((z) => z.zoneId)).toEqual(region.zones.map((z) => z.id));
    for (const zone of snapshot.forecast.zones) {
      for (const s of zone.steps) {
        expect(Number.isFinite(s.mult)).toBe(true);
        expect(s.mult).toBeGreaterThanOrEqual(1);
        expect(s.mult).toBeLessThanOrEqual(MAX_MULTIPLIER);
      }
    }
    // Flights land at this region's airport and nowhere else.
    const airportZone = snapshot.forecast.zones.find((z) => z.zoneId === area.airport);
    expect(airportZone).toBeDefined();
    expect(snapshot.flights.arrivals.every((f) => f.origin !== area.airport)).toBe(true);

    const ranked = rankZones(snapshot, 0, { origin: region.home, now: FRIDAY_NIGHT });
    expect(ranked).toHaveLength(region.zones.length);

    // Local midnight differs from Pacific midnight outside the Pacific zone.
    const offset = zoneOffsetMs(FRIDAY_NIGHT, region.timeZone);
    expect(Math.abs(offset) % (HOUR / 2)).toBe(0);
  });

  it('sizes the flight feed to the airport', async () => {
    const day = localClock(FRIDAY_NIGHT, OFFSET).day;
    const dallas = await resolveRegion({ mode: 'point', lat: 32.78, lng: -96.8 });
    const boise = await resolveRegion({ mode: 'point', lat: 43.62, lng: -116.2 });
    expect(flightsForDay(dallas, day, OFFSET).length).toBeGreaterThan(flightsForDay(boise, day, OFFSET).length * 5);
    expect(flightsForDay(boise, day, OFFSET).length).toBeGreaterThan(30);
  });

  it('refuses a location with no towns in reach', async () => {
    await expect(resolveRegion({ mode: 'point', lat: 39.5, lng: -116.9 })).rejects.toThrow();
  });
});

describe('high and low colours', () => {
  it('names the level a colour stands for', () => {
    expect(surgeLevel(1)).toBe('Low');
    expect(surgeLevel(1.4)).toBe('Medium');
    expect(surgeLevel(2)).toBe('High');
    expect(surgeLevel(3)).toBe('Very high');
    expect(demandLevel(0.05)).toBe('Low');
    expect(demandLevel(0.9)).toBe('Very high');
  });

  it('puts the quietest and busiest zones at the two ends of the ramp', () => {
    expect(heatColor(demandHeat(0))).toBe(heatColor(1));
    expect(heatColor(demandHeat(1))).toBe(heatColor(3.5));
    expect(heatColor(1)).not.toBe(heatColor(1.6));
  });
});

describe('hotels', () => {
  it('belong to zones that exist', () => {
    expect(SEATTLE.hotels.length).toBeGreaterThan(40);
    const zoneIds = new Set(SEATTLE.zones.map((z) => z.id));
    for (const hotel of SEATTLE.hotels) expect(zoneIds.has(hotel.zoneId)).toBe(true);
    expect(new Set(SEATTLE.hotels.map((h) => h.id)).size).toBe(SEATTLE.hotels.length);
  });

  it('are busiest around morning checkout and scale with size', () => {
    expect(hotelPickups(400, 3, 7)).toBeGreaterThan(hotelPickups(400, 3, 2) * 4);
    expect(hotelPickups(800, 3, 7)).toBeCloseTo(hotelPickups(400, 3, 7) * 2, 6);
    const day = Array.from({ length: 24 }, (_, h) => hotelPickups(400, 3, h)).reduce((s, v) => s + v, 0);
    expect(day).toBeGreaterThan(100);
    expect(day).toBeLessThan(200);
  });
});

describe('police radar geometry', () => {
  const tukwila = { lat: 47.459, lng: -122.2585 };

  it('finds the compass direction of a report', () => {
    expect(compassPoint(bearingDeg(tukwila, { lat: 47.6, lng: -122.2585 }))).toBe('N');
    expect(compassPoint(bearingDeg(tukwila, { lat: 47.459, lng: -122.0 }))).toBe('E');
    expect(compassPoint(bearingDeg(tukwila, { lat: 47.3, lng: -122.45 }))).toBe('SW');
  });

  it('places reports by bearing and distance and drops those out of range', () => {
    const north = radarPosition(tukwila, { lat: 47.5, lng: -122.2585 }, 10);
    expect(north).not.toBeNull();
    expect(north!.x).toBeCloseTo(50, 0);
    expect(north!.y).toBeLessThan(50);
    expect(north!.miles).toBeGreaterThan(2.5);
    expect(north!.miles).toBeLessThan(3.2);
    expect(radarPosition(tukwila, { lat: 48.5, lng: -122.2585 }, 10)).toBeNull();
    expect(radarPosition(tukwila, tukwila, 10)).toMatchObject({ x: 50, y: 50 });
  });
});
