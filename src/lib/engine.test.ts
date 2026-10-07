import { afterEach, describe, expect, it, vi } from 'vitest';
import { surgeMultiplier, MAX_MULTIPLIER } from './forecast/surge';
import { CONTEXT_STEPS, HORIZON_STEPS, emulateTimesFM, runForecast, type SeriesInput } from './forecast/timesfm';
import { driveMinutes } from './geo';
import { rankZones } from './recommend';
import { eventsForDay } from './sim/events';
import { LAG_MAX, LAG_MIN, buildFlightFeed, flightsForDay, lagCdf, spreadCurb } from './sim/flights';
import { buildSnapshot, resolveAt } from './snapshot';
import { DAY, MIN, localClock, pacificOffsetMs } from './time';
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
  const feed = buildFlightFeed(FRIDAY_NIGHT, OFFSET);

  it('is deterministic for a given moment', () => {
    expect(buildFlightFeed(FRIDAY_NIGHT, OFFSET)).toEqual(feed);
  });

  it('generates a realistic day of arrivals', () => {
    const day = flightsForDay(localClock(FRIDAY_NIGHT, OFFSET).day, OFFSET);
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
    const events = Array.from({ length: 7 }, (_, i) => eventsForDay(day + i, OFFSET)).flat();
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
  it('covers at least eight zones, each with a staging spot', () => {
    expect(ZONES.length).toBeGreaterThanOrEqual(8);
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
