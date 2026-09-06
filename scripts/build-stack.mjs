#!/usr/bin/env node
// Renders assets/stack.svg from data/stack.json.
// Adding a tool is a one-line edit to the JSON — the layout solves itself.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { C, esc } from './palette.mjs';

const S = JSON.parse(readFileSync('data/stack.json', 'utf8'));
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'assets/stack.svg';

const W = 1000, PAD = 40, COL = 232, PITCH = 62;
const FS = 15, ADV = FS * 0.6, GAP = 10;

let delay = 0.28;
const rows = S.groups.map((g, gi) => {
  const top = 96 + gi * PITCH;
  const label = `<g class="rw" style="animation-delay:${(0.15 + gi * 0.13).toFixed(2)}s">`
    + `<rect x="${PAD}" y="${top + 9}" width="3" height="16" fill="${C.accent}" opacity=".85"/>`
    + `<text class="mono lbl" x="${PAD + 14}" y="${top + 23}" font-size="12" letter-spacing="1.6">${esc(g.label)}</text></g>`;

  let x = COL;
  const pills = g.items.map(it => {
    const w = Math.round(it.name.length * ADV * 1.0 + 44);
    delay += 0.055;
    const p = `<g class="pill" style="animation-delay:${delay.toFixed(2)}s">`
      + `<rect x="${x}" y="${top}" width="${w}" height="34" rx="9" fill="${C.panel}" stroke="${C.line2}"/>`
      + `<circle cx="${x + 15}" cy="${top + 17}" r="4" fill="${it.color}"/>`
      + `<text class="mono pt" x="${x + 27}" y="${top + 22}" font-size="${FS}">${esc(it.name)}</text></g>`;
    x += w + GAP;
    return p;
  }).join('');

  return label + pills;
}).join('\n');

const modules = S.groups.reduce((n, g) => n + g.items.length, 0);
const FOOT = 96 + S.groups.length * PITCH - 6;
const H = FOOT + 56;
const noteW = PAD + S.note.length * 13 * 0.6;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Tech stack — ${modules} tools across ${S.groups.length} groups">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/>
  </linearGradient>
  <linearGradient id="scanl" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.accent}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${C.accent}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
  </linearGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="1" fill="${C.bone}" fill-opacity="0.05"/>
  </pattern>
  <style>
    .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
    .lbl{fill:${C.dim}}.pt{fill:${C.pt}}.accent{fill:${C.accent}}.dim{fill:${C.faint}}
    .pill,.rw,.hd{opacity:0;animation:in .55s cubic-bezier(.16,.9,.2,1) both}
    @keyframes in{0%{opacity:0;transform:translateY(9px)}100%{opacity:1;transform:translateY(0)}}
    .hd{animation-delay:.05s}
    .scan{animation:scan 7s cubic-bezier(.4,0,.3,1) 1.1s infinite}
    @keyframes scan{0%{transform:translateY(-30px);opacity:0}4%{opacity:1}
      26%{transform:translateY(${(H - 30).toFixed(0)}px);opacity:1}30%{opacity:0}100%{transform:translateY(${(H - 30).toFixed(0)}px);opacity:0}}
    .cur{fill:${C.accent};animation:bl 1s steps(1,end) infinite}
    @keyframes bl{0%,50%{opacity:1}50.01%,100%{opacity:.12}}
    @media (prefers-reduced-motion: reduce){
      .pill,.rw,.hd{animation:none!important;opacity:1}
      .scan{display:none} .cur{animation:none}
    }
  </style>
</defs>
<rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="16" fill="url(#dots)"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="${C.line}"/>

<g class="hd">
  <text class="mono accent" x="${PAD}" y="52" font-size="13" letter-spacing="5">THE STACK</text>
  <text class="mono dim" x="${W - PAD}" y="52" font-size="12" text-anchor="end">${modules} modules loaded</text>
  <rect x="${PAD}" y="70" width="${W - PAD * 2}" height="1" fill="${C.line}"/>
</g>

<g class="scan"><rect x="${PAD}" y="80" width="${W - PAD * 2}" height="2" fill="url(#scanl)"/></g>

${rows}

<rect x="${PAD}" y="${FOOT}" width="${W - PAD * 2}" height="1" fill="${C.line}"/>
<text class="mono dim" x="${PAD}" y="${FOOT + 28}" font-size="13">${esc(S.note)}</text>
<rect class="cur" x="${noteW.toFixed(0)}" y="${FOOT + 16}" width="9" height="16"/>
</svg>`;

mkdirSync('assets', { recursive: true });
writeFileSync(OUT, svg);
console.log('wrote', OUT, `(${modules} modules)`);
