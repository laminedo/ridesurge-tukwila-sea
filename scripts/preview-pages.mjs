// Serves the static export in out/ under the same path GitHub Pages uses, for a local check.
// Run `npm run build:pages` first, then `npm run preview:pages`.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const BASE = process.env.PAGES_BASE_PATH ?? '/ridesurge-tukwila-sea';
const PORT = Number(process.env.PORT ?? 3212);
const ROOT = join(process.cwd(), 'out');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (!pathname.startsWith(`${BASE}/`)) {
    response.writeHead(302, { Location: `${BASE}/` }).end();
    return;
  }
  // Resolve inside out/ only; a trailing slash means the directory's index.
  let file = join(ROOT, normalize(decodeURIComponent(pathname.slice(BASE.length))));
  if (!file.startsWith(ROOT)) file = join(ROOT, '404.html');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  const found = existsSync(file);
  response.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[extname(found ? file : '.html')] ?? 'application/octet-stream' });
  createReadStream(found ? file : join(ROOT, '404.html')).pipe(response);
}).listen(PORT, () => console.log(`Static site at http://localhost:${PORT}${BASE}/`));
