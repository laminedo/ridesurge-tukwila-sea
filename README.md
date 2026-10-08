# RideSurge

A Progressive Web App for rideshare drivers. It started as a tool for drivers based in Tukwila, Washington, and now builds itself around wherever you drive in the US. It combines Sea-Tac flight waves, rides from home to the airport, stadium, venue and club closing times and a demand forecast for 21 zones into one decision: where to stage, and when to leave, so you arrive ahead of the surge instead of chasing it.

**Live demo:** https://laminedo.github.io/ridesurge-tukwila-sea/ (open it on your phone and add it to the home screen).

> **Every forecast number in this build comes from simulated feeds.** The flight schedule, venue calendar and demand history are generated, and the default forecaster is a local stand-in for TimesFM. The app says so on every screen. See [Going live](#going-live) for what to replace.

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

## Works where you drive

The app starts from **your own location**. The first time it opens, your phone or tablet asks whether RideSurge may use its GPS; tap Allow. From then on the radar map, the weather, the drive times and the best move all follow where you are, and the app remembers your last area so the next launch starts in the right place.

Tap the area under the app name (or open Settings) to choose something else:

- **My location** (the default) builds a market around the device. If you are within about 45 miles of Seattle you get the hand-tuned one.
- **Seattle** is the hand-tuned market: 21 named zones, real staging spots, more than thirty venues and Sea-Tac's carrier mix.
- **Another city** lets you search any US city of 5,000 people or more.

If location is declined or unavailable, the app says so and shows the last area the device was in, or Seattle–Tacoma.

Outside Seattle the market is generated on the device from data bundled with the app (`src/lib/regions`):

- **Zones** are towns and neighbourhoods from a US gazetteer (`src/data/us-places.json`, built from GeoNames by `npm run places`). Dense metros zoom in to neighbourhoods; small ones zoom out to surrounding towns. The radar puts you at the centre with true compass bearings.
- **Airport** is the best commercial airport within 50 miles from a table of about a hundred, with flight volume sized to it. Areas with no airport simply have no flight screens.
- **Venues** are the NFL, MLB, NBA, NHL and MLS stadiums and arenas, with home games in season and touring shows, plus a generic bar district and convention centre for larger cities.
- **Times** are shown in the area's own time zone.

Building your area never sends your location anywhere: nothing is looked up online, and the HTTP API only serves the Seattle market. Two things do go out. The weather lookup sends your position rounded to about three miles to Open-Meteo, and the radar's street map loads its map pieces from OpenFreeMap, which can therefore tell which part of the map is on screen. A generated market is coarser than Seattle's. Staging spots are town centres and the venues themselves, and local clubs, theatres and college venues are not included.

## What is on each screen

The layout follows the screen. Phones get one topic per tab with a bottom tab bar. Tablets and computers get a side rail and a full-width dashboard: the Overview shows the best move, radar, heat grid, flight waves and next dismissals together, and the other sections spread into columns.

| Tab | What it answers |
| --- | --- |
| **Radar** (Overview on wide screens) | The best move right now (zone, peak multiplier, when to leave, one-tap navigation) and a surge radar drawn on a street map of where you are (see below). Drag the slider or press play to move through the next three hours. A ring around a blip is the peak coming within the hour. |
| **Heat grid** | Surge multiplier for 21 zones, from Federal Way to Shoreline and West Seattle to Redmond, in 15-minute steps. Tap a cell for demand, driver capacity and what is driving it. |
| **Flights** | Ride requests by touchdown time against the same riders at the curb 20 to 35 minutes later, upcoming waves with a leave-by time, and the arrivals feeding them. **Rides to the airport** shows how many riders are leaving home for Sea-Tac and which neighbourhoods they start in. |
| **Events** | Each venue's estimated dismissal time, its egress curve and where to stage. Filter to clubs and late night for closing-time rushes at the nightclubs, live-music rooms and showgirls clubs. |
| **Stage** | Quick-launch navigation to staging spots, ordered by the best opportunity from where you are. Switch to **Hotels** for the larger hotels ranked by expected pickups this hour, plus a map search for every hotel in a zone. Opens Google Maps, Waze or Apple Maps. |
| **Weather** | Live forecast for your area and what it means for driving. See [Weather](#weather). |

Settings holds the navigation app, whether drive times start from the Tukwila base or your location (kept on the device), and a simulation clock for rehearsing moments such as Friday at 10:30 PM or Saturday bar close.

## Refreshing

Pull the page down from the top on a phone or tablet, or press the refresh button in the header on any device. A chip drops in, spins while the forecast and the weather reload, and confirms with a tick as the fresh numbers settle into place. A refresh also checks whether a newer version of the app has been published and, if so, reloads into it, so there is no need to close and reopen the app after an update. The gesture lives in `src/components/RefreshIndicator.tsx`.

## The radar map

The radar is a real street map (OpenFreeMap, drawn from OpenStreetMap data) centred on the driver.

- **You** are the pulsing dot. Dashed rings mark 5 and 10 miles from you.
- **Zones** are the round marks, coloured low to high, each with its surge multiplier or ride requests. A star marks the best move, and the map opens framed around you, the zones near you and that best move.
- **Small dots** are zones too close together to label at the current zoom. Zoom in, or tap one.
- **Buttons**: centre on me, show every zone, zoom in and out. On a touch screen one finger scrolls the page and two fingers move the map.

The map needs a connection (and WebGL). Without one, the radar falls back to the original sketch, which lays the zones out by compass direction and works offline. The code is in `src/components/RadarMap.tsx`, with the framing and decluttering maths in `src/lib/mapview.ts`.

## High and low at a glance

Every zone is coloured on one ramp: cool blue is low, through violet and red, to bright yellow for the highest. The **Surge / Demand** switch on the radar and heat grid chooses what the colour means: the price multiplier, or how busy a zone is compared with the busiest one. Each mark also carries its number and a Low, Medium, High or Very high level, so nothing depends on colour alone.

## Weather

The **Weather** tab shows the live forecast for where you are from [Open-Meteo](https://open-meteo.com/): conditions now, the next 24 hours hour by hour, the coming days, and what it means for driving (rain about to start, snow, ice, strong wind, fog, heat). A marker appears on the tab when the next few hours call for a change of plan.

This is the one feed in the app that is real rather than simulated. It is shown as information only: the simulated surge numbers do not take weather into account. With location on, the forecast follows the driver: it is for the neighbourhood you are in and is looked up again once you have moved about two miles. Otherwise it is for the chosen city or the area's base. To fetch it, the app sends that position, rounded to about three miles, to Open-Meteo.

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
- **Rides to the airport** (`src/lib/sim/departures.ts`). The mirror image: each departure pulls riders out of neighbourhoods and hotels 90 to 170 minutes before take-off, split across zones by where travellers stay. The pre-dawn bank is the big one.
- **Venues** (`src/lib/sim/events.ts`). Over thirty real venues with their programming patterns (season, weekday, start time, capacity), including live-music rooms such as The Showbox and Neumos. Clubs and showgirls clubs (Q, Trinity, Ora, Kremwerk, Supernova, Showgirls Seattle, Dream Girls at SoDo, Kittens Cabaret) are modelled differently: a trickle that builds to a rush at last call. Dismissal is scheduled end plus overtime noise. Egress is a gamma-shaped outflow that takes longer to clear for bigger crowds, and part of it spills into neighbouring zones as riders walk out of the pickup geofence.
- **Everyday demand** (`src/lib/sim/organic.ts`). Commute, midday, evening, nightlife and bar-close curves per zone, with a day-level swing and noise. This is the history the forecaster reads.
- **Forecast** (`src/lib/forecast`). Eight days of 15-minute history per zone go to TimesFM as the target, with arrivals, airport-bound rides and egress demand as covariates known into the future. Demand against driver capacity gives the multiplier, a saturating curve capped at 3.5×. Drivers under-respond to weekend nightlife, chase events a step late, and at the airport roll over from one step to the next, so surge shows up at the leading edge of a wave.
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
| `GET /api/snapshot` | Everything below, plus the rides-to-the-airport feed, in one payload. This is what the app polls every minute. |
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
| Arrivals and departures schedule | FlightAware AeroAPI, Cirium or the Port of Seattle feed | `flightsForDay` in `sim/flights.ts`, `departuresForDay` in `sim/departures.ts` |
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
src/lib            Engine: sim/, forecast/, regions/, recommend.ts, time and geo helpers
src/data           Bundled US gazetteer (generated)
src/lib/client     Browser stores (clock, settings, tab) and the snapshot poller
public             Service worker, offline page, icons
services/timesfm   Python sidecar for the real model
scripts            Icon and gazetteer generators, GitHub Pages deploy
```
