import type { Region } from '../regions/types';
import { airportRunTotals, originShare, typicalAirportRuns } from '../sim/departures';
import { eventZoneSeries } from '../sim/events';
import { flightCurbSeries, typicalCurbDemand } from '../sim/flights';
import { dayLevel, organicActual, supplyBaseline } from '../sim/organic';
import { MIN, floorTo, localClock } from '../time';
import type { ForecastFeed, ZoneForecast, ZoneId, ZoneStep } from '../types';
import { round1 } from '../util';
import { CONTEXT_STEPS, HORIZON_STEPS, STEP_MIN, runForecast, type SeriesInput } from './timesfm';

export const MAX_MULTIPLIER = 3.5;
/** Requests per step below which a zone is too thin to surge at full strength. */
const THIN_MARKET_REQUESTS = 8;
/** Share of idle airport-queue drivers still waiting one step later. */
const QUEUE_CARRYOVER = 0.6;
const STEP = STEP_MIN * MIN;

/**
 * Surge as a saturating function of the demand/supply ratio: flat while
 * drivers keep up, climbing quickly once they do not, and capped the way
 * the platforms cap it.
 */
export function surgeMultiplier(demand: number, supply: number): number {
  const ratio = demand / Math.max(supply, 1e-6);
  const lift = 2.6 * (1 - Math.exp(-0.6 * Math.max(0, ratio - 1.05)));
  // A handful of requests cannot hold a price up: thin markets surge less.
  const depth = Math.min(1, demand / THIN_MARKET_REQUESTS);
  return round1(Math.min(MAX_MULTIPLIER, 1 + lift * depth));
}

export async function buildForecast(region: Region, now: number, offset: number): Promise<ForecastFeed> {
  const t0 = floorTo(now, STEP);
  const contextStart = t0 - CONTEXT_STEPS * STEP;
  const span = CONTEXT_STEPS + HORIZON_STEPS;

  // Known-future covariates: who is landing and which venues are letting out.
  const flights = flightCurbSeries(region, contextStart, STEP, span, offset);
  const events = eventZoneSeries(region, contextStart, STEP, span, offset);
  // Riders leaving home for the airport, split across the zones they start in.
  const airportRuns = airportRunTotals(region, contextStart, STEP, span, offset);
  const airportZone = region.airport?.zoneId;
  // The airport queue scales with the airport: a few cars at a regional field, dozens at a hub.
  const queueFloor = region.flights ? Math.max(4, 14 * Math.sqrt(region.flights.daily / 606)) : 4;
  const none = new Array<number>(span).fill(0);
  const airportFor = (zone: ZoneId) => {
    const share = originShare(region, zone);
    return share > 0 ? airportRuns.map((v) => v * share) : none;
  };

  const series: SeriesInput[] = region.zones.map((zone) => {
    const fl = zone.id === airportZone ? flights : none;
    const ev = events[zone.id] ?? none;
    const ap = airportFor(zone.id);
    const context = new Array<number>(CONTEXT_STEPS);
    for (let i = 0; i < CONTEXT_STEPS; i++) {
      context[i] = round1(organicActual(region, zone.id, contextStart + i * STEP, offset) + fl[i] + ev[i] + ap[i]);
    }
    return { id: zone.id, context, covariates: [fl.map(round1), ev.map(round1), ap.map(round1)] };
  });

  const { model, forecasts } = await runForecast(series, HORIZON_STEPS);

  const zones: ZoneForecast[] = region.zones.map((zone, z) => {
    const fl = zone.id === airportZone ? flights : none;
    const ev = events[zone.id] ?? none;
    const ap = airportFor(zone.id);
    const share = originShare(region, zone.id);
    const forecast = forecasts[z];

    const airport = zone.id === airportZone;
    // Drivers idling in the airport lot roll over into the next step.
    let queued = 0;
    if (airport) {
      const last = localClock(t0 - STEP, offset);
      const lastSupply = supplyBaseline(region, zone.id, last.dow, last.hour) + 0.92 * typicalCurbDemand(region, last.hour, STEP_MIN);
      queued = QUEUE_CARRYOVER * Math.max(0, lastSupply - series[z].context[CONTEXT_STEPS - 1]);
    }

    const steps: ZoneStep[] = [];
    for (let h = 0; h < HORIZON_STEPS; h++) {
      const i = CONTEXT_STEPS + h;
      const t = t0 + h * STEP;
      const { dow, hour } = localClock(t, offset);

      // Everyday drivers, plus those who planned around the event and those who chase it late.
      let supply = supplyBaseline(region, zone.id, dow, hour) + 0.18 * ev[i] + 0.25 * ev[i - 1] + 0.15 * ev[i - 2];
      if (airport) {
        // The airport queue is sized for the usual pattern and reacts a step late to a big bank.
        const usual = typicalCurbDemand(region, hour, STEP_MIN);
        const usualBefore = typicalCurbDemand(region, hour - STEP_MIN / 60, STEP_MIN);
        supply += 0.92 * usual + 0.25 * Math.max(0, fl[i - 1] - usualBefore) + queued;
      }
      // Drivers expect the morning airport bank, so only an unusually heavy one outruns them.
      supply += 0.9 * share * typicalAirportRuns(region, hour, STEP_MIN);
      supply = Math.max(airport ? queueFloor : 4, supply);

      const demand = Math.max(0, forecast.point[h]);
      if (airport) queued = Math.min(120, QUEUE_CARRYOVER * Math.max(0, supply - demand));
      // Flight and egress volumes carry their own error on top of the model's band.
      const exogenous = 0.12 * fl[i] + 0.22 * ev[i] + 0.15 * ap[i];
      const low = Math.max(0, Math.min(demand, forecast.q10[h] - exogenous));
      const high = Math.max(demand, forecast.q90[h] + exogenous);

      steps.push({
        t,
        mult: surgeMultiplier(demand, supply),
        lo: surgeMultiplier(low, supply),
        hi: surgeMultiplier(high, supply),
        demand: Math.round(demand),
        supply: Math.round(supply),
        organic: Math.round(Math.max(0, demand - fl[i] - ev[i] - ap[i])),
        flights: Math.round(fl[i]),
        airport: Math.round(ap[i]),
        events: Math.round(ev[i]),
      });
    }
    return { zoneId: zone.id, steps };
  });

  return {
    generatedAt: now,
    stepMin: STEP_MIN,
    steps: Array.from({ length: HORIZON_STEPS }, (_, h) => t0 + h * STEP),
    model,
    demandIndex: Math.round(dayLevel(region, localClock(now, offset).day) * 100) / 100,
    zones,
  };
}
