#!/usr/bin/env node
// Rebuilds data/portrait.json from the live GitHub avatar.
//
//   npm i --no-save sharp && node scripts/build-portrait.mjs
//
// The hero reads that file and prints the halftone; this script only decides
// what the grid says. Change your avatar, run this, and the hero follows.
// Without sharp installed it exits quietly, so CI keeps the committed grid
// rather than failing the whole refresh over a picture.
import { writeFileSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'aaaditt';
const SRC = `https://avatars.githubusercontent.com/${LOGIN}?s=460`;
const N = 84;                      // sampling grid before cropping to the figure

let sharp;
try { ({ default: sharp } = await import('sharp')); }
catch {
  console.log('sharp not installed — keeping the committed portrait grid.');
  console.log('to regenerate: npm i --no-save sharp && node scripts/build-portrait.mjs');
  process.exit(0);
}

const res = await fetch(SRC);
if (!res.ok) { console.error(`avatar fetch failed: ${res.status}`); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());

const { data } = await sharp(buf)
  .resize(N, N, { fit: 'fill' })
  .flatten({ background: '#ffffff' })   // in case the avatar carries transparency
  .raw().toBuffer({ resolveWithObject: true });

// One value per cell: 0 means background, 1..15 is how dark that pixel was.
// The background test is written for a light, blue-ish backdrop (sky, or a plain
// light card) — anything light and blue-leaning, plus anything near-white, drops
// out so the figure prints alone on the dark hero.
const val = i => {
  const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const background = (b > r + 22 && lum > 145) || lum > 234;
  return background ? 0 : Math.max(1, Math.min(15, Math.round((255 - lum) / 255 * 14) + 1));
};

let x0 = N, y0 = N, x1 = -1, y1 = -1;
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (val(y * N + x)) {
  if (x < x0) x0 = x; if (x > x1) x1 = x;
  if (y < y0) y0 = y; if (y > y1) y1 = y;
}
if (x1 < 0) { console.error('the whole avatar read as background — check the test above'); process.exit(1); }

const rows = [];
for (let y = y0; y <= y1; y++) {
  let s = '';
  for (let x = x0; x <= x1; x++) s += val(y * N + x).toString(16);
  rows.push(s);
}

writeFileSync('data/portrait.json', JSON.stringify({
  _comment: 'Halftone of the GitHub avatar, already cropped to the figure. One hex digit per cell: 0 = background (prints nothing), 1-15 = how dark that pixel was, so ink coverage reads like a real halftone. Regenerate with scripts/build-portrait.mjs.',
  source: SRC,
  sampled: N,
  w: rows[0].length,
  h: rows.length,
  rows,
}, null, 1) + '\n');

console.log(`wrote data/portrait.json — ${rows[0].length}x${rows.length} cells from ${SRC}`);
