// Renders the app icons from one SVG source. Run with `npm run icons` after changing the artwork.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BG = '#05080c';
const TEAL = '#35d6c0';

/** Radar mark on a 512 grid. `scale` shrinks it into the maskable safe zone. */
const mark = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="172" fill="none" stroke="${TEAL}" stroke-opacity=".32" stroke-width="12"/>
    <circle cx="256" cy="256" r="100" fill="none" stroke="${TEAL}" stroke-opacity=".55" stroke-width="12"/>
    <path d="M256 256V84A172 172 0 0 1 404.96 170Z" fill="${TEAL}" fill-opacity=".24"/>
    <path d="M256 256 404.96 170" stroke="${TEAL}" stroke-width="16" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="20" fill="${TEAL}"/>
    <circle cx="336" cy="150" r="34" fill="#f9c22e"/>
    <circle cx="168" cy="330" r="20" fill="#d9532b"/>
  </g>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${BG}"/>${mark(0.92)}</svg>`;
const fullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BG}"/>${mark(scale)}</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer();

await mkdir('public/icons', { recursive: true });
await writeFile('public/icons/icon-192.png', await png(rounded, 192));
await writeFile('public/icons/icon-512.png', await png(rounded, 512));
await writeFile('public/icons/maskable-512.png', await png(fullBleed(0.66), 512));
// Next.js file conventions: favicon and the iOS home-screen icon.
await writeFile('src/app/apple-icon.png', await png(fullBleed(0.8), 180));
await writeFile('src/app/icon.svg', rounded);

console.log('Icons written to public/icons and src/app.');
