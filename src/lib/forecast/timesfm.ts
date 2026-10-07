/**
 * TimesFM integration.
 *
 * Each zone is sent as one target series (ride requests per 15 minutes) with
 * two covariates known into the future: flight-driven curb demand and venue
 * egress demand. That maps directly onto TimesFM 3.0's
 * `past_future_covariates` input.
 *
 * TimesFM is a Python model, so it runs as a sidecar (see `services/timesfm`).
 * Set `TIMESFM_URL` to use it. Without it, or if the sidecar is slow or down,
 * a local emulator answers the same contract so the app never loses its
 * forecast.
 */
import type { ModelInfo } from '../types';
import { clamp } from '../util';

export const STEP_MIN = 15;
/** Forecast buckets returned, including the one in progress (3 hours). */
export const HORIZON_STEPS = 12;
/** Eight days of history: a full week of seasonality plus the last 24 hours. */
export const CONTEXT_STEPS = 768;

const STEPS_PER_DAY = (24 * 60) / STEP_MIN;
const STEPS_PER_WEEK = STEPS_PER_DAY * 7;
const REMOTE_TIMEOUT_MS = 2500;

export interface SeriesInput {
  id: string;
  /** Observed target, oldest first. */
  context: number[];
  /** Covariates spanning the context and the horizon (`context.length + horizon` values each). */
  covariates: number[][];
}

export interface SeriesForecast {
  id: string;
  point: number[];
  q10: number[];
  q90: number[];
}

export interface ForecastRun {
  model: ModelInfo;
  forecasts: SeriesForecast[];
}

const modelInfo = (id: string, label: string, mode: ModelInfo['mode'], note: string): ModelInfo => ({
  id,
  label,
  mode,
  note,
  contextSteps: CONTEXT_STEPS,
  horizonSteps: HORIZON_STEPS,
  stepMin: STEP_MIN,
});

/**
 * Stand-in for the model: a seasonal forecast of the covariate-free residual
 * (same slot last week, blended with the same slot on recent days), corrected
 * for how today is running, with the known-future covariates added back and
 * quantile bands that widen with the horizon. Deterministic and dependency-free.
 */
export function emulateTimesFM(series: SeriesInput[], horizon: number): SeriesForecast[] {
  return series.map(({ id, context, covariates }) => {
    const n = context.length;
    const covariateAt = (i: number) => covariates.reduce((s, c) => s + (c[i] ?? 0), 0);
    const residual = context.map((v, i) => Math.max(0, v - covariateAt(i)));

    const seasonal = (i: number): number => {
      let daily = 0;
      let days = 0;
      for (let k = 1; k <= 7; k++) {
        const j = i - k * STEPS_PER_DAY;
        if (j >= 0 && j < n) {
          daily += residual[j];
          days++;
        }
      }
      const dailyMean = days ? daily / days : (residual[n - 1] ?? 0);
      const lastWeek = i - STEPS_PER_WEEK;
      return lastWeek >= 0 && lastWeek < n ? 0.8 * residual[lastWeek] + 0.2 * dailyMean : dailyMean;
    };

    // How today compares with the seasonal expectation over the last two hours.
    let actual = 0;
    let expected = 0;
    for (let i = Math.max(0, n - 8); i < n; i++) {
      actual += residual[i];
      expected += seasonal(i);
    }
    const level = expected > 0 ? clamp(actual / expected, 0.6, 1.8) : 1;

    // Residual spread over the last day sets the width of the quantile band.
    let squares = 0;
    let count = 0;
    for (let i = Math.max(0, n - STEPS_PER_DAY); i < n; i++) {
      const s = seasonal(i);
      if (s > 0.5) {
        squares += (residual[i] / s - level) ** 2;
        count++;
      }
    }
    const cv = clamp(count ? Math.sqrt(squares / count) : 0.15, 0.06, 0.3);

    const point: number[] = [];
    const q10: number[] = [];
    const q90: number[] = [];
    for (let h = 0; h < horizon; h++) {
      const base = seasonal(n + h) * (1 + (level - 1) * Math.pow(0.9, h + 1));
      const sigma = cv * base * (0.45 + h / 10);
      const known = covariateAt(n + h);
      point.push(base + known);
      q10.push(Math.max(0, base - 1.2816 * sigma) + known);
      q90.push(base + 1.2816 * sigma + known);
    }
    return { id, point, q10, q90 };
  });
}

function isSeriesForecast(value: unknown, horizon: number): value is SeriesForecast {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const numbers = (x: unknown) =>
    Array.isArray(x) && x.length === horizon && x.every((n) => typeof n === 'number' && Number.isFinite(n));
  return typeof v.id === 'string' && numbers(v.point) && numbers(v.q10) && numbers(v.q90);
}

async function callSidecar(url: string, series: SeriesInput[], horizon: number): Promise<ForecastRun> {
  const response = await fetch(`${url.replace(/\/+$/, '')}/forecast`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ horizon, step_minutes: STEP_MIN, series }),
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`sidecar responded ${response.status}`);

  const body = (await response.json()) as { model?: unknown; series?: unknown };
  const forecasts = Array.isArray(body.series) ? body.series : [];
  const byId = new Map<string, SeriesForecast>();
  for (const f of forecasts) if (isSeriesForecast(f, horizon)) byId.set(f.id, f);
  if (series.some((s) => !byId.has(s.id))) throw new Error('sidecar response is missing series');

  const id = typeof body.model === 'string' ? body.model : 'timesfm';
  return {
    model: modelInfo(id, 'TimesFM', 'remote', 'Live forecast from the TimesFM sidecar.'),
    forecasts: series.map((s) => byId.get(s.id) as SeriesForecast),
  };
}

export async function runForecast(series: SeriesInput[], horizon: number): Promise<ForecastRun> {
  const url = process.env.TIMESFM_URL;
  let note = 'Set TIMESFM_URL to forecast with a live TimesFM sidecar.';

  if (url) {
    try {
      return await callSidecar(url, series, horizon);
    } catch (error) {
      note = `TimesFM sidecar unavailable (${error instanceof Error ? error.message : 'unknown error'}); using the emulator.`;
    }
  }

  return {
    model: modelInfo('timesfm-emulator', 'TimesFM emulator', 'emulated', note),
    forecasts: emulateTimesFM(series, horizon),
  };
}
