/**
 * Live weather for the driver's area from Open-Meteo (https://open-meteo.com),
 * a free forecast service that needs no key. This is the one feed in the app
 * that is real rather than simulated, and it is shown as information: the
 * simulated surge forecast does not take it into account.
 */
import { fmtShort } from './format';
import { HOUR } from './time';
import type { LatLng } from './types';

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'freezing' | 'snow' | 'thunder';

export interface HourWeather {
  t: number;
  tempF: number;
  /** Chance of precipitation, 0–100. */
  chance: number;
  /** Inches in the hour. */
  precipIn: number;
  gustMph: number;
  sky: Sky;
  day: boolean;
}

export interface DayWeather {
  t: number;
  highF: number;
  lowF: number;
  chance: number;
  precipIn: number;
  sky: Sky;
}

export interface Weather {
  fetchedAt: number;
  current: {
    t: number;
    tempF: number;
    feelsF: number;
    precipIn: number;
    windMph: number;
    gustMph: number;
    humidity: number;
    sky: Sky;
    day: boolean;
  };
  /** From the current hour, 48 hours ahead. */
  hours: HourWeather[];
  days: DayWeather[];
}

/** WMO weather interpretation codes, grouped into what a driver cares about. */
export function skyOf(code: number): Sky {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'freezing';
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}

export const SKY_LABEL: Record<Sky, string> = {
  clear: 'Clear',
  partly: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  freezing: 'Freezing rain',
  snow: 'Snow',
  thunder: 'Thunderstorms',
};

const WET: readonly Sky[] = ['drizzle', 'rain', 'freezing', 'thunder'];
const isWet = (h: { sky: Sky; chance: number; precipIn: number }) =>
  (WET.includes(h.sky) && h.chance >= 40) || h.chance >= 60 || h.precipIn >= 0.03;

interface ApiResponse {
  current: Record<string, number>;
  hourly: Record<string, number[]>;
  daily: Record<string, number[]>;
}

/**
 * Weather does not need a precise position, so the request carries the area's
 * centre rounded to about three miles.
 */
export async function fetchWeather(around: LatLng): Promise<Weather> {
  const lat = (Math.round(around.lat * 20) / 20).toFixed(2);
  const lng = (Math.round(around.lng * 20) / 20).toFixed(2);
  const query = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,is_day',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timeformat: 'unixtime',
    timezone: 'auto',
    forecast_days: '3',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`The weather service responded ${response.status}.`);
  return parseWeather((await response.json()) as ApiResponse, Date.now());
}

export function parseWeather(data: ApiResponse, now: number): Weather {
  const { current: c, hourly: h, daily: d } = data;
  const hours: HourWeather[] = h.time
    .map((seconds, i) => ({
      t: seconds * 1000,
      tempF: h.temperature_2m[i],
      chance: h.precipitation_probability[i] ?? 0,
      precipIn: h.precipitation[i] ?? 0,
      gustMph: h.wind_gusts_10m[i] ?? 0,
      sky: skyOf(h.weather_code[i]),
      day: h.is_day[i] === 1,
    }))
    .filter((hour) => hour.t > now - HOUR)
    .slice(0, 48);

  return {
    fetchedAt: now,
    current: {
      t: c.time * 1000,
      tempF: c.temperature_2m,
      feelsF: c.apparent_temperature,
      precipIn: c.precipitation,
      windMph: c.wind_speed_10m,
      gustMph: c.wind_gusts_10m,
      humidity: c.relative_humidity_2m,
      sky: skyOf(c.weather_code),
      day: c.is_day === 1,
    },
    hours,
    days: d.time.map((seconds, i) => ({
      t: seconds * 1000,
      highF: d.temperature_2m_max[i],
      lowF: d.temperature_2m_min[i],
      chance: d.precipitation_probability_max[i] ?? 0,
      precipIn: d.precipitation_sum[i] ?? 0,
      sky: skyOf(d.weather_code[i]),
    })),
  };
}

export type AdviceKind = 'rain' | 'snow' | 'ice' | 'wind' | 'fog' | 'heat' | 'cold' | 'calm';

export interface Advice {
  kind: AdviceKind;
  title: string;
  body: string;
  /** Worth a marker on the Weather tab: it changes how the next few hours go. */
  alert: boolean;
}

/** What the next twelve hours of weather mean for a rideshare driver. */
export function driverAdvice(weather: Weather): Advice[] {
  const ahead = weather.hours.slice(0, 12);
  const advice: Advice[] = [];
  if (ahead.length === 0) return advice;

  const snow = ahead.find((h) => h.sky === 'snow' && h.chance >= 30);
  const ice = ahead.find((h) => h.sky === 'freezing' && h.chance >= 30);
  if (ice) {
    advice.push({
      kind: 'ice',
      title: `Freezing rain around ${fmtShort(ice.t)}`,
      body: 'Roads glaze over fast. Requests jump because people will not drive themselves, but bridges, ramps and hills are dangerous. Decide now whether the fares are worth it.',
      alert: true,
    });
  }
  if (snow) {
    advice.push({
      kind: 'snow',
      title: `Snow around ${fmtShort(snow.t)}`,
      body: 'Demand spikes while many drivers stay home, so prices climb. Trips take far longer and side streets may be impassable. Stick to main roads and keep the tank full.',
      alert: true,
    });
  }

  const wetNow = isWet({ ...ahead[0], precipIn: Math.max(ahead[0].precipIn, weather.current.precipIn) }) || WET.includes(weather.current.sky);
  if (wetNow) {
    const dries = ahead.find((h, i) => i > 0 && !isWet(h));
    advice.push({
      kind: 'rain',
      title: dries ? `Wet now, easing around ${fmtShort(dries.t)}` : 'Wet for the next twelve hours',
      body: 'Rain moves people off foot, bikes and buses into cars, so expect more short trips and busier pickups at stations, shops and venues. Traffic slows: allow extra time to reach a surge.',
      alert: true,
    });
  } else {
    const starts = ahead.find((h) => isWet(h));
    if (starts) {
      advice.push({
        kind: 'rain',
        title: `Rain likely from ${fmtShort(starts.t)} (${Math.round(starts.chance)}%)`,
        body: 'Requests usually pick up as it starts, especially short trips and anything letting out. Be in a busy zone before the first shower rather than driving to one in it.',
        alert: starts.t - ahead[0].t <= 3 * HOUR,
      });
    }
  }

  const windy = ahead.find((h) => h.gustMph >= 35);
  if (windy) {
    advice.push({
      kind: 'wind',
      title: `Gusts to ${Math.round(Math.max(...ahead.map((h) => h.gustMph)))} mph around ${fmtShort(windy.t)}`,
      body: 'Strong wind brings flight delays and diversions, which bunches arrivals into bigger waves later. Watch the Flights tab, and watch for debris and outages.',
      alert: true,
    });
  }

  const foggy = weather.current.sky === 'fog' ? ahead[0] : ahead.slice(0, 4).find((h) => h.sky === 'fog');
  if (foggy) {
    advice.push({
      kind: 'fog',
      title: weather.current.sky === 'fog' ? 'Fog right now' : `Fog around ${fmtShort(foggy.t)}`,
      body: 'Low visibility slows the freeways and can hold up morning flights, pushing the arrival waves later than scheduled.',
      alert: false,
    });
  }

  const hottest = Math.max(...ahead.map((h) => h.tempF));
  const coldest = Math.min(...ahead.map((h) => h.tempF));
  if (hottest >= 90) {
    advice.push({
      kind: 'heat',
      title: `Hot: up to ${Math.round(hottest)}°`,
      body: 'People avoid walking and waiting outside in the heat, so short trips rise through the afternoon. Keep the cabin cool; it shows up in ratings.',
      alert: false,
    });
  }
  if (coldest <= 28 && !snow && !ice) {
    advice.push({
      kind: 'cold',
      title: `Hard freeze: down to ${Math.round(coldest)}°`,
      body: 'Cold nights lift late requests as people skip the walk home. Watch for black ice on bridges and shaded ramps.',
      alert: false,
    });
  }

  if (advice.length === 0) {
    advice.push({
      kind: 'calm',
      title: 'No weather effect expected',
      body: 'Dry and settled for the next twelve hours. Demand should follow its usual pattern of flights, events and time of day.',
      alert: false,
    });
  }
  return advice;
}
