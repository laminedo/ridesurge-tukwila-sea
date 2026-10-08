/*
 * RideSurge service worker.
 *
 *   App shell (/)          network first, cached copy when offline, then /offline.html
 *   /_next/static, /icons  cache first (file names are content-hashed)
 *   /api/*                 network first with a timeout, then the last good response
 *
 * The build id arrives in the registration URL (?v=…), so each deploy installs
 * as a new worker with its own shell and static caches and removes the old ones.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
// "" at a domain root, "/repo-name" when hosted under a path (GitHub Pages).
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const SHELL = `ridesurge-shell-${VERSION}`;
const STATIC = `ridesurge-static-${VERSION}`;
const DATA = 'ridesurge-data-v2';

const ROOT = `${BASE}/`;
const OFFLINE = `${BASE}/offline.html`;
const PRECACHE = [ROOT, OFFLINE, `${BASE}/manifest.webmanifest`, `${BASE}/icons/icon-192.png`, `${BASE}/icons/icon-512.png`];
// Hashed bundle URLs as they appear in the shell's HTML (up to a quote, backslash, space, ")" or "<").
const ASSETS = new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/_next/static/[^"\'\\\\\\s)<]+', 'g');
const API_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await shell.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));

      // Pull in the hashed bundles the shell references so the first offline launch is complete.
      const page = await shell.match(ROOT);
      const html = page ? await page.text() : '';
      const assets = [...new Set(html.match(ASSETS) || [])];
      const statics = await caches.open(STATIC);
      await Promise.allSettled(assets.map((url) => statics.add(url)));

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, STATIC, DATA]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('ridesurge-') && !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((url) => typeof url === 'string' && new URL(url, self.location.origin).origin === self.location.origin);
  event.waitUntil(
    caches.open(STATIC).then(async (cache) => {
      for (const url of urls) {
        if (!(await cache.match(url))) await cache.add(url).catch(() => undefined);
      }
    }),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function appShell(request) {
  const shell = await caches.open(SHELL);
  const isRoot = new URL(request.url).pathname === ROOT;
  try {
    // Always revalidate the shell with the server, and ask for the bare path whatever the query
    // string. A copy from the browser's HTTP cache can point at bundles a newer deploy has removed,
    // which would leave a blank page until that copy expires.
    const response = isRoot ? await fetch(ROOT, { cache: 'no-cache' }) : await fetch(request);
    if (response.ok && isRoot) shell.put(ROOT, response.clone());
    return response;
  } catch {
    return (await shell.match(ROOT)) || (await shell.match(OFFLINE)) || Response.error();
  }
}

async function freshData(request) {
  const url = new URL(request.url);
  // Only the live feed is kept; simulation-clock requests (?at=…) are not.
  const cacheable = url.search === '';
  const cache = await caches.open(DATA);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (response.ok && cacheable) cache.put(url.pathname, response.clone());
    return response;
  } catch {
    const saved = cacheable ? await cache.match(url.pathname) : undefined;
    if (saved) {
      const headers = new Headers(saved.headers);
      headers.set('X-RideSurge-Source', 'cache');
      return new Response(saved.body, { status: saved.status, statusText: saved.statusText, headers });
    }
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}

async function networkThenCache(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(request, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(`${BASE}/api/`)) event.respondWith(freshData(request));
  else if (url.pathname.startsWith(`${BASE}/_next/static/`) || url.pathname.startsWith(`${BASE}/icons/`)) event.respondWith(cacheFirst(request));
  else if (request.mode === 'navigate') event.respondWith(appShell(request));
  else event.respondWith(networkThenCache(request));
});
