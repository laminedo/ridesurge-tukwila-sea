# RideSurge Tukwila/SEA

A mobile-first Progressive Web App for rideshare drivers based in Tukwila, Washington. It combines Sea-Tac flight waves, stadium and venue dismissal times and a per-zone demand forecast into one decision: where to stage, and when to leave, so you arrive ahead of the surge instead of chasing it.

**Live demo:** https://laminedo.github.io/ridesurge-tukwila-sea/ (open it on your phone and add it to the home screen).

> **Every number in this build comes from simulated feeds.** The flight schedule, venue calendar and demand history are generated, and the default forecaster is a local stand-in for TimesFM. The app says so on every screen. See [Going live](#going-live) for what to replace.

## Run it

Requires Node 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. For the installable, offline-capable build:

```bash
npm run build
```

```bash
npm start
```

Other scripts: `npm test` (engine unit tests), `npm run lint`, `npm run typecheck`, `npm run icons` (regenerate app icons), and the GitHub Pages scripts described under [Hosting](#hosting).

The service worker only registers in production builds, so test offline behaviour with `npm run build && npm start`, not `npm run dev`. Browsers also require HTTPS (or `localhost`) to install a PWA.

> **Folder name.** This project lives in a folder called `uber:lyft` (shown as `uber/lyft` in Finder). The colon breaks npm's script `PATH`, so the scripts in `package.json` call each tool by its path under `node_modules`. If you move the project to a folder without a colon you can shorten them back to `next dev`, `eslint .` and so on.

## What is on each screen

The layout follows the screen. Phones get one topic per tab with a bottom tab bar. Tablets and computers get a side rail and a full-width dashboard: the Overview shows the best move, radar, heat grid, flight waves and next dismissals together, and the other sections spread into columns.

| Tab | What it answers |
| --- | --- |
| **Radar** (Overview on wide screens) | The best move right now (zone, peak multiplier, when to leave, one-tap navigation) and a surge radar of all zones. Drag the slider or press play to move through the next three hours. A ring around a blip is the peak coming within the hour. |
| **Heat grid** | Surge multiplier for 11 zones in 15-minute steps. Tap a cell for demand, driver capacity and what is driving it. |
| **Flights** | Ride requests by touchdown time against the same riders at the curb 20 to 35 minutes later, upcoming waves with a leave-by time, and the arrivals feeding them. |
| **Events** | Each venue's estimated dismissal time, its egress curve and where to stage. |
| **Stage** | Quick-launch navigation to staging spots, ordered by the best opportunity from where you are. Opens Google Maps, Waze or Apple Maps. |

Settings holds the navigation app, whether drive times start from the Tukwila base or your location (kept on the device), and a simulation clock for rehearsing moments such as Friday at 10:30 PM or Saturday bar close.

## How it works

```
 sim/flights.ts ──┐
 sim/events.ts  ──┼─► forecast/surge.ts ──► /api/snapshot ──► service worker ──► app
 sim/organic.ts ──┘        │                                   (offline copy)     │
                           ▼                                                      ▼
                  forecast/timesfm.ts                                   recommend.ts
                  (sidecar or emulator)                          (runs on the device)
```

- **Flights** (`src/lib/sim/flights.ts`). About 600 arrivals a day in loose hub banks. Each flight's passengers become ride requests (terminating share, rideshare share by hour, party size), spread over a touchdown-to-request lag that is triangular on 20 to 35 minutes: regional jets early, widebodies and customs late. Waves are the stretches where curb demand runs well above the window's average.
- **Venues** (`src/lib/sim/events.ts`). Seventeen venues with their real programming patterns (season, weekday, start time, capacity). Dismissal is scheduled end plus overtime noise. Egress is a gamma-shaped outflow that takes longer to clear for bigger crowds, and part of it spills into neighbouring zones as riders walk out of the pickup geofence.
- **Everyday demand** (`src/lib/sim/organic.ts`). Commute, midday, evening, nightlife and bar-close curves per zone, with a day-level swing and noise. This is the history the forecaster reads.
- **Forecast** (`src/lib/forecast`). Eight days of 15-minute history per zone go to TimesFM as the target, with flight and egress demand as covariates known into the future. Demand against driver capacity gives the multiplier, a saturating curve capped at 3.5×. Drivers under-respond to weekend nightlife, chase events a step late, and at the airport roll over from one step to the next, so surge shows up at the leading edge of a wave.
- **Recommendation** (`src/lib/recommend.ts`). For each zone: the best surge window still reachable given the drive, when to be staged for its ramp, and when to leave. Runs in the browser so it follows the driver and works offline.

### TimesFM

TimesFM is a Python model, so it runs as a sidecar: `services/timesfm/server.py`, a small FastAPI app that loads `google/timesfm-3.0-pytorch` and passes the covariates as `past_future_covariates`.

```bash
cd services/timesfm
```

```bash
uv run --with "timesfm[torch]" --with fastapi --with uvicorn uvicorn server:app --host 127.0.0.1 --port 8765
```

Then start the app with `TIMESFM_URL=http://127.0.0.1:8765` (see `.env.example`). Without that variable, or whenever the sidecar is slow or down, `emulateTimesFM` answers the same contract: a seasonal forecast of the covariate-free residual with widening quantile bands. Settings shows which one produced the forecast on screen.

The sidecar has been written against the TimesFM 3.0 README but **has not been run against the real model in this repo**. Expect to adjust it on first contact.

### API

All routes accept an optional `?at=` (epoch milliseconds or ISO 8601, within 30 days) used by the simulation clock.

| Route | Returns |
| --- | --- |
| `GET /api/snapshot` | Everything below in one payload. This is what the app polls every minute. |
| `GET /api/flights` | Arrivals, 5-minute landing and curb buckets, detected waves. |
| `GET /api/events` | Venue events with dismissal estimates and egress curves. |
| `GET /api/forecast` | Per-zone steps: multiplier, likely range, demand, capacity and demand by source. |

### Offline

`public/sw.js` keeps the app shell and its hashed bundles (cache first), and the last good API responses (network first with a timeout). The app also stores the last snapshot in local storage. Offline, it opens from cache and keeps working against the saved forecast, advancing through it with the clock until the three-hour horizon runs out. Each build gets its own cache generation and removes the previous one.

## Hosting

The app builds two ways from the same source.

**Server build** (`npm run build`, `npm start`): the full app with its `/api` routes and the TimesFM sidecar hook. Deploy it anywhere that runs Node (Vercel, Fly, a VPS).

**Static build for GitHub Pages**: Pages only serves files, so this build leaves the API routes out and runs the same engine in the browser instead. It needs no server at all and keeps forecasting offline, but it cannot call the TimesFM sidecar and always uses the emulator.

```bash
npm run build:pages
```

```bash
npm run preview:pages
```

```bash
npm run deploy:pages
```

`build:pages` writes the site to `out/`, `preview:pages` serves it at http://localhost:3212/ridesurge-tukwila-sea/ exactly as Pages will, and `deploy:pages` rebuilds and force-pushes `out/` to the `gh-pages` branch, which Pages serves. The path prefix defaults to the repository name; set `PAGES_BASE_PATH` if you rename the repo or use a custom domain (`PAGES_BASE_PATH=""`).

How the two builds share one codebase: API routes are named `route.api.ts`, and only the server build lists `api.ts` as a page extension (see `next.config.ts`). The client checks `NEXT_PUBLIC_STATIC_EXPORT` to decide between fetching `/api/snapshot` and calling `buildSnapshot` directly.

## Going live

| Simulated today | Replace with | Where |
| --- | --- | --- |
| Arrivals schedule | FlightAware AeroAPI, Cirium or the Port of Seattle feed | `flightsForDay` in `sim/flights.ts` |
| Venue calendar | Ticketmaster Discovery, team schedules, the Port cruise calendar | `eventsForDay` in `sim/events.ts` |
| Demand history and driver supply | Your own trip logs, or surge readings sampled from the driver apps | `sim/organic.ts` |
| Forecaster | The TimesFM sidecar | `TIMESFM_URL` |
| Drive times | Google Routes or Mapbox Matrix | `driveMinutes` in `geo.ts` |

The lag kernel, egress model, surge function, recommendation engine and the whole interface work unchanged on real inputs. Once real surge readings exist, fit the surge curve and the supply response to them; the constants here are reasoned estimates, not measurements.

Before relying on it on the road, also check the staging spots in `src/lib/zones.ts`. The two airport waiting lots come from published driver instructions; the rest are suggested areas with approximate coordinates, not designated waiting zones.

## Project layout

```
src/app            App shell, manifest, API routes
src/components     Screens and shared UI
src/lib            Engine: sim/, forecast/, recommend.ts, zones.ts, time and geo helpers
src/lib/client     Browser stores (clock, settings, tab) and the snapshot poller
public             Service worker, offline page, icons
services/timesfm   Python sidecar for the real model
scripts            Icon generator
```
