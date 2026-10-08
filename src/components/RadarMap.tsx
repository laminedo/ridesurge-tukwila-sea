'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowUp, LocateFixed, Minus, Plus, Scan, Star } from 'lucide-react';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtMult } from '@/lib/format';
import { heatColor, heatInk, type Metric } from '@/lib/heat';
import { boundsOf, crowdedAt, nearbyPlaces, ringAround } from '@/lib/mapview';
import type { LatLng, Zone, ZoneId, ZoneStep } from '@/lib/types';
import { risingTo, type View } from '@/lib/view';
import { useRegion } from './RegionContext';
import { cx, heatOf } from './ui';

type MapLibre = typeof import('maplibre-gl');

/** Dark street map from OpenFreeMap: free to use, no account, built on OpenStreetMap. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
/** Give up on the map and fall back to the sketch radar when the style has not arrived by then. */
const LOAD_TIMEOUT_MS = 15_000;
/** Range rings around the driver, in miles. */
const RINGS = [5, 10];
const BLIP_PX = 42;
/** Room kept around the framed zones, so blips clear the map's buttons and credit line. */
const FRAME = { top: 40, bottom: 52, left: 40, right: 58 };

function ringData(centre: LatLng): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: RINGS.map((miles) => ({
      type: 'Feature',
      properties: { label: `${miles} mi` },
      geometry: { type: 'LineString', coordinates: ringAround(centre, miles) },
    })),
  };
}

/** Tints the stock style to the app's surfaces and adds the range rings. */
function dress(map: MapLibreMap, centre: LatLng) {
  if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', '#0a1019');
  if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#0d2136');
  map.addSource('rings', { type: 'geojson', data: ringData(centre) });
  map.addLayer({
    id: 'rings',
    type: 'line',
    source: 'rings',
    paint: { 'line-color': '#35d6c0', 'line-opacity': 0.5, 'line-width': 1, 'line-dasharray': [4, 4] },
  });
  map.addLayer({
    id: 'ring-labels',
    type: 'symbol',
    source: 'rings',
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 320, 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
    paint: { 'text-color': '#35d6c0', 'text-halo-color': '#05080c', 'text-halo-width': 1.5 },
  });
}

/** One zone on the map: a full blip when there is room, a plain heat dot when its neighbours crowd it. */
function MapBlip({
  zone,
  steps,
  sel,
  metric,
  maxDemand,
  compact,
  here,
  best,
  onZone,
}: {
  zone: Zone;
  steps: ZoneStep[];
  sel: number;
  metric: Metric;
  maxDemand: number;
  compact: boolean;
  here: boolean;
  best: boolean;
  onZone: (zone: ZoneId) => void;
}) {
  const current = steps[sel];
  const rising = risingTo(steps, sel);
  const { heat, label, level } = heatOf(current, metric, maxDemand);
  const size = compact ? 16 : BLIP_PX;

  return (
    <button
      type="button"
      onClick={() => onZone(zone.id)}
      aria-label={`${zone.name}: ${level.toLowerCase()}, ${metric === 'surge' ? fmtMult(current.mult) : `${current.demand} requests per 15 minutes`}${rising ? `, surge rising to ${fmtMult(rising)} within the hour` : ''}${best ? ', best move right now' : ''}`}
      title={zone.name}
      style={{
        width: size,
        height: size,
        background: heatColor(heat),
        color: heatInk(heat),
        // A gap in the map's colour, then (if rising) a ring in the colour of what is coming.
        boxShadow: `0 0 0 2px #05080c${rising ? `, 0 0 0 ${compact ? 4 : 5}px ${heatColor(rising)}` : ''}`,
      }}
      className={cx(
        'relative flex flex-col items-center justify-center rounded-full transition-[background-color,box-shadow] duration-300 active:brightness-125',
        // A crowded dot keeps a finger-sized target around it.
        compact && 'before:absolute before:-inset-2.5 before:rounded-full',
      )}
    >
      {!compact && (
        <>
          <span className="text-[9px] font-semibold leading-none tracking-wide opacity-85">{zone.code}</span>
          <span className="mt-px text-[13px] font-semibold leading-none tabular-nums">{label}</span>
          {rising && (
            <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-fg text-plane">
              <ArrowUp className="size-2.5" strokeWidth={3.5} aria-hidden />
            </span>
          )}
          {here && (
            <span className="absolute -bottom-1 -left-1 flex size-3.5 items-center justify-center rounded-full bg-accent text-accent-ink">
              <LocateFixed className="size-2.5" strokeWidth={2.5} aria-hidden />
            </span>
          )}
          {best && (
            <span className="absolute -left-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-fg text-plane">
              <Star className="size-2.5" fill="currentColor" strokeWidth={0} aria-hidden />
            </span>
          )}
        </>
      )}
    </button>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-xl border border-line-2 bg-plane/85 text-fg backdrop-blur-sm active:bg-raised"
    >
      {children}
    </button>
  );
}

/**
 * The radar on a real street map, centred on the driver. Zones are HTML marks
 * on top of the map, so they stay buttons a screen reader can reach.
 */
export function RadarMap({
  view,
  sel,
  metric,
  origin,
  live,
  hereZoneId,
  bestZoneId,
  onZone,
  onFail,
}: {
  view: View;
  sel: number;
  metric: Metric;
  /** Where the driver is, or where drive times start from when the device's position is not in use. */
  origin: LatLng;
  /** True when `origin` is a GPS fix. */
  live: boolean;
  hereZoneId: ZoneId;
  bestZoneId: ZoneId | undefined;
  onZone: (zone: ZoneId) => void;
  /** Called when the map cannot be shown (no connection, no WebGL), so the caller can draw the sketch radar. */
  onFail: () => void;
}) {
  const { info } = useRegion();
  const zones = info.zones;
  const container = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<{ map: MapLibreMap; gl: MapLibre } | null>(null);
  const [zoom, setZoom] = useState(10);
  // Once the driver moves the map themselves it stops following them, until they tap "my area".
  const touched = useRef(false);

  const fail = useEffectEvent(onFail);
  const startAt = useEffectEvent(() => origin);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    let loaded = false;
    const timer = setTimeout(() => {
      if (!loaded && !cancelled) fail();
    }, LOAD_TIMEOUT_MS);

    void import('maplibre-gl')
      .then((module) => {
        if (cancelled || !container.current) return;
        const gl = module.default;
        const centre = startAt();
        const created = new gl.Map({
          container: container.current,
          style: STYLE_URL,
          center: [centre.lng, centre.lat],
          zoom: 10,
          minZoom: 5,
          maxZoom: 16,
          attributionControl: false,
          // One finger scrolls the page; two fingers (or Ctrl + wheel) move the map.
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        map = created;
        created.touchZoomRotate.disableRotation();
        created.keyboard.disableRotation();
        created.on('error', () => {
          // Before the style is in, an error means there is no map to show. Later ones are single tiles.
          if (!loaded && !cancelled) fail();
        });
        // The stock style names a texture its sprite sheet does not carry; a blank stands in for it.
        created.on('styleimagemissing', ({ id }) => {
          if (!created.hasImage(id)) created.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
        });
        created.once('load', () => {
          if (cancelled) return;
          loaded = true;
          dress(created, centre);
          setZoom(created.getZoom());
          setCtx({ map: created, gl });
        });
        created.on('zoom', () => setZoom(Math.round(created.getZoom() * 10) / 10));
        const byHand = (event: { originalEvent?: unknown }) => {
          if (event.originalEvent) touched.current = true;
        };
        created.on('dragstart', byHand);
        created.on('zoomstart', byHand);
      })
      .catch(() => {
        if (!cancelled) fail();
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      map?.remove();
    };
  }, []);

  /* ---------- Camera ---------- */

  // The driver, the zones around them, and the recommended zone even when it is further out.
  const local = useMemo(() => {
    const best = zones.find((zone) => zone.id === bestZoneId);
    return boundsOf([origin, ...nearbyPlaces(origin, zones), ...(best ? [best] : [])]);
  }, [origin, zones, bestZoneId]);
  // Rounded, so the camera only follows real movement and not GPS jitter.
  const localKey = local ? local.flat().map((n) => n.toFixed(2)).join(',') : '';
  const map = ctx?.map;

  const fit = (bounds: ReturnType<typeof boundsOf>, animate = true) => {
    if (map && bounds) map.fitBounds(bounds, { padding: FRAME, maxZoom: 13, duration: animate ? 600 : 0 });
  };
  const fitLocal = useEffectEvent((animate: boolean) => fit(local, animate));

  useEffect(() => {
    // A new market always starts framed around the driver.
    touched.current = false;
  }, [info.id]);

  useEffect(() => {
    if (map && !touched.current) fitLocal(false);
  }, [map, localKey, info.id]);

  /* ---------- Range rings and the driver's own mark ---------- */

  const originLat = Math.round(origin.lat * 2000) / 2000;
  const originLng = Math.round(origin.lng * 2000) / 2000;
  const me = useMemo(() => (ctx ? document.createElement('div') : null), [ctx]);

  useEffect(() => {
    if (!ctx || !me) return;
    const marker = new ctx.gl.Marker({ element: me }).setLngLat([originLng, originLat]).addTo(ctx.map);
    const wrapper = marker.getElement();
    wrapper.removeAttribute('aria-label');
    // A GPS fix sits on top of everything; a start point that is only an assumption stays under the blips.
    wrapper.style.zIndex = live ? '40' : '10';
    (ctx.map.getSource('rings') as GeoJSONSource | undefined)?.setData(ringData({ lat: originLat, lng: originLng }));
    return () => {
      marker.remove();
    };
  }, [ctx, me, originLat, originLng, live]);

  /* ---------- Zone marks ---------- */

  const slots = useMemo(() => (ctx ? zones.map((zone) => ({ zone, el: document.createElement('div') })) : []), [ctx, zones]);
  const markers = useRef(new Map<ZoneId, Marker>());

  useEffect(() => {
    if (!ctx) return;
    const placed = markers.current;
    for (const { zone, el } of slots) {
      const marker = new ctx.gl.Marker({ element: el }).setLngLat([zone.lng, zone.lat]).addTo(ctx.map);
      // The button inside carries the name; the wrapper should stay silent.
      marker.getElement().removeAttribute('aria-label');
      placed.set(zone.id, marker);
    }
    return () => {
      placed.forEach((marker) => marker.remove());
      placed.clear();
    };
  }, [ctx, slots]);

  // Who keeps a full blip when zones crowd: the recommended zone, then the driver's own, then hottest first.
  const priority = useMemo(() => {
    const heat = (zone: Zone) => heatOf(view.byZone[zone.id][sel], metric, view.maxDemand).heat;
    const pinned = (zone: Zone) => (zone.id === bestZoneId ? 2 : zone.id === hereZoneId ? 1 : 0);
    return [...zones].sort((a, b) => pinned(b) - pinned(a) || heat(b) - heat(a));
  }, [zones, view, sel, metric, bestZoneId, hereZoneId]);
  const crowded = useMemo(() => crowdedAt(priority, zoom, BLIP_PX + 6), [priority, zoom]);

  useEffect(() => {
    // Full blips sit above dots, and hotter above cooler.
    const rank = new Map(priority.map((zone, i) => [zone.id, i]));
    markers.current.forEach((marker, id) => {
      marker.getElement().style.zIndex = String((crowded.has(id) ? 0 : 20) + Math.max(0, 19 - (rank.get(id) ?? 19)));
    });
  }, [slots, priority, crowded]);

  return (
    <div className="relative mx-auto mt-3 aspect-square w-full max-w-[520px] overflow-hidden rounded-2xl border border-line-2 bg-[#0a1019] md:aspect-auto md:min-h-[380px] md:max-w-none md:flex-1">
      {/* The map library's stylesheet sets its own `position` on this element, so the fill is forced. */}
      <div ref={container} className="absolute! inset-0" role="region" aria-label={`Map of ${info.name} with demand by zone`} />

      {!ctx && <p className="absolute inset-0 flex items-center justify-center text-[12px] text-fg-3">Loading the map…</p>}

      {slots.map(({ zone, el }) =>
        createPortal(
          <MapBlip
            zone={zone}
            steps={view.byZone[zone.id]}
            sel={sel}
            metric={metric}
            maxDemand={view.maxDemand}
            compact={crowded.has(zone.id)}
            here={zone.id === hereZoneId}
            best={zone.id === bestZoneId}
            onZone={onZone}
          />,
          el,
          zone.id,
        ),
      )}

      {me &&
        createPortal(
          live ? (
            <span role="img" aria-label="You are here" className="relative flex size-3.5 items-center justify-center">
              {/* A ring, not a fill, so the pulse never washes out the zone the driver is sitting in. */}
              <span className="you-pulse absolute size-3.5 rounded-full border-2 border-accent" aria-hidden />
              <span className="relative size-3.5 rounded-full border-2 border-fg bg-accent" />
            </span>
          ) : (
            <span role="img" aria-label="Drive times start here" className="block size-3.5 rounded-full border-2 border-accent bg-plane" />
          ),
          me,
        )}

      {ctx && (
        <>
          <div className="absolute right-2 top-2 z-50 flex flex-col gap-1.5">
            <MapButton
              label={live ? 'Centre on my location' : 'Centre on my area'}
              onClick={() => {
                touched.current = false;
                fit(local);
              }}
            >
              <LocateFixed className="size-[18px] text-accent" aria-hidden />
            </MapButton>
            <MapButton
              label="Show every zone"
              onClick={() => {
                touched.current = true;
                fit(boundsOf(zones));
              }}
            >
              <Scan className="size-[18px]" aria-hidden />
            </MapButton>
          </div>
          <div className="absolute bottom-2 right-2 z-50 flex flex-col gap-1.5">
            <MapButton
              label="Zoom in"
              onClick={() => {
                touched.current = true;
                ctx.map.zoomIn();
              }}
            >
              <Plus className="size-[18px]" aria-hidden />
            </MapButton>
            <MapButton
              label="Zoom out"
              onClick={() => {
                touched.current = true;
                ctx.map.zoomOut();
              }}
            >
              <Minus className="size-[18px]" aria-hidden />
            </MapButton>
          </div>
          <p className="absolute bottom-1 left-1 z-50 rounded bg-plane/75 px-1.5 py-0.5 text-[9px] leading-tight text-fg-3">
            <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>
            {' © '}
            <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a>
            {' · data © '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
          </p>
        </>
      )}
    </div>
  );
}
