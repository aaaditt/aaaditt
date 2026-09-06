#!/usr/bin/env node
// Renders assets/pulse.svg — a 24-hour commit-rhythm dial plus live activity.
// Derived from public push events (~last 300), converted to the local timezone.
// The NOW strip at the bottom comes from data/now.json — the one hand-written
// signal on the page, so "currently building X" is never stale by accident.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { C, esc, ago, stamp } from './palette.mjs';

const LOGIN = process.env.GH_LOGIN || 'aaaditt';
const TOKEN = process.env.GITHUB_TOKEN;
const TZ = Number(process.env.TZ_OFFSET ?? 4);          // Dubai, UTC+4
const TZ_LABEL = process.env.TZ_LABEL || 'gulf standard time';
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'assets/pulse.svg';
const NOW = existsSync('data/now.json') ? JSON.parse(readFileSync('data/now.json', 'utf8')) : {};

async function events() {
  if (process.argv.includes('--mock'))
    return JSON.parse(readFileSync(process.argv[process.argv.indexOf('--mock') + 1], 'utf8'));
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(`https://api.github.com/users/${LOGIN}/events/public?per_page=100&page=${page}`,
      { headers: TOKEN ? { Authorization: `bearer ${TOKEN}` } : {} });
    if (!r.ok) break;
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) break;
    out.push(...j);
    if (j.length < 100) break;
  }
  return out;
}

function analyse(ev) {
  const push = ev.filter(e => e.type === 'PushEvent');
  const hours = new Array(24).fill(0);
  const weekAgo = Date.now() - 7 * 864e5;
  let weekCommits = 0; const weekRepos = new Set();
  for (const e of push) {
    const n = e.payload?.distinct_size ?? e.payload?.size ?? 1;
    const t = new Date(e.created_at);
    hours[(t.getUTCHours() + TZ + 24) % 24] += n;
    if (t.getTime() >= weekAgo) { weekCommits += n; weekRepos.add(e.repo.name); }
  }
  // best contiguous 4-hour window (wraps midnight)
  let bs = 0, bi = 0;
  for (let i = 0; i < 24; i++) {
    const s = hours[i] + hours[(i + 1) % 24] + hours[(i + 2) % 24] + hours[(i + 3) % 24];
    if (s > bs) { bs = s; bi = i; }
  }
  const last = push[0];
  return {
    hours, weekCommits, weekRepos: weekRepos.size,
    peak: [bi, (bi + 4) % 24],
    lastRepo: last ? last.repo.name.split('/')[1] : null,
    lastAgo: last ? ago(last.created_at) : null,
    total: push.length,
  };
}

function render(a) {
  const W = 1000, H = 300, PAD = 40;
  const CX = 152, CY = 176, R0 = 32, RMAX = 74;
  const max = Math.max(1, ...a.hours);
  const pad2 = n => String(n).padStart(2, '0');
  const now = stamp(TZ);

  const bars = a.hours.map((v, h) => {
    const ang = (h * 15 - 90) * Math.PI / 180;
    const len = R0 + 6 + (v / max) * (RMAX - R0 - 6);
    const x1 = CX + Math.cos(ang) * R0, y1 = CY + Math.sin(ang) * R0;
    const x2 = CX + Math.cos(ang) * len, y2 = CY + Math.sin(ang) * len;
    const t = v / max;
    const col = v === 0 ? C.line : t > .66 ? C.accent : t > .33 ? C.accentDeep : C.accentDim;
    return `<line class="bar" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="7" stroke-linecap="round" style="animation-delay:${(0.25 + h * 0.022).toFixed(2)}s"/>`;
  }).join('');

  const ticks = [[0, '00'], [6, '06'], [12, '12'], [18, '18']].map(([h, lb]) => {
    const ang = (h * 15 - 90) * Math.PI / 180, r = RMAX + 16;
    return `<text class="mono dim" x="${(CX + Math.cos(ang) * r).toFixed(1)}" y="${(CY + Math.sin(ang) * r + 4).toFixed(1)}" font-size="10" text-anchor="middle">${lb}</text>`;
  }).join('');

  const cols = [
    ['LAST PUSH', a.lastRepo ? (a.lastRepo.length > 15 ? a.lastRepo.slice(0, 14) + '…' : a.lastRepo) : '—', a.lastAgo || 'no recent pushes'],
    ['THIS WEEK', `${a.weekCommits} commits`, a.weekRepos ? `across ${a.weekRepos} repo${a.weekRepos > 1 ? 's' : ''}` : 'quiet week'],
    ['PEAK WINDOW', `${pad2(a.peak[0])}–${pad2(a.peak[1])}`, TZ_LABEL],
  ].map(([lb, val, sub], i) => {
    const x = 300 + i * 228;
    return `<g class="col" style="animation-delay:${(0.45 + i * 0.1).toFixed(2)}s">`
      + `<text class="mono dim" x="${x}" y="132" font-size="10" letter-spacing="2">${lb}</text>`
      + `<text class="mono bone" x="${x}" y="164" font-size="19">${esc(val)}</text>`
      + `<text class="mono dim" x="${x}" y="186" font-size="11.5">${esc(sub)}</text></g>`;
  }).join('');

  // ---- the NOW strip: hand-written truth, refreshed with everything else ----
  const rows = [
    NOW.building && ['building', NOW.building],
    NOW.learning && ['learning', NOW.learning],
    NOW.open_to && ['open to', NOW.open_to],
  ].filter(Boolean).slice(0, 3);

  const nowStrip = rows.map(([k, v], i) => `<g class="col" style="animation-delay:${(0.8 + i * 0.08).toFixed(2)}s">`
    + `<text class="mono accent" x="300" y="${228 + i * 22}" font-size="11.5">&#9656;</text>`
    + `<text class="mono dim" x="316" y="${228 + i * 22}" font-size="11.5">${esc(k)}</text>`
    + `<text class="mono bone" x="${316 + 9 * 8}" y="${228 + i * 22}" font-size="11.5">${esc(v)}</text></g>`).join('');

  const status = esc(NOW.status || 'ON AIR');
  const statusW = status.length * 7.8 + 26;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Commit rhythm and recent activity — last push ${esc(a.lastAgo || 'unknown')}, ${a.weekCommits} commits this week">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${C.bone}" fill-opacity="0.05"/></pattern>
  <style>
    .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
    .bone{fill:${C.bone}}.accent{fill:${C.accent}}.dim{fill:${C.dim}}
    .hd,.col{opacity:0;animation:up .55s cubic-bezier(.16,.9,.2,1) both}
    @keyframes up{0%{opacity:0;transform:translateY(9px)}100%{opacity:1;transform:translateY(0)}}
    .hd{animation-delay:.05s}
    .bar{opacity:0;transform-box:fill-box;transform-origin:center;animation:grow .5s cubic-bezier(.2,1.2,.4,1) both}
    @keyframes grow{0%{opacity:0;transform:scale(.2)}100%{opacity:1;transform:scale(1)}}
    .live{animation:bl 1.6s steps(1,end) infinite}
    @keyframes bl{0%,55%{opacity:1}55.01%,100%{opacity:.15}}
    @media (prefers-reduced-motion: reduce){
      .hd,.col,.bar{animation:none!important;opacity:1;transform:none}.live{animation:none}
    }
  </style>
</defs>
<rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="16" fill="url(#dots)"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="${C.line}"/>

<g class="hd">
  <text class="mono accent" x="${PAD}" y="52" font-size="13" letter-spacing="5">PULSE</text>
  <rect x="${(PAD + 74).toFixed(0)}" y="38" width="${statusW.toFixed(0)}" height="20" rx="6" fill="${C.accent}" fill-opacity="0.10" stroke="${C.accent}" stroke-opacity="0.45"/>
  <circle class="live" cx="${(PAD + 86).toFixed(0)}" cy="48" r="3.4" fill="${C.accent}"/>
  <text class="mono accent" x="${(PAD + 96).toFixed(0)}" y="52" font-size="10" letter-spacing="1.6">${status}</text>
  <text class="mono dim" x="${W - PAD}" y="52" font-size="12" text-anchor="end">synced ${now.hhmm} gst &#183; ${a.total} recent pushes</text>
  <rect x="${PAD}" y="70" width="${W - PAD * 2}" height="1" fill="${C.line}"/>
</g>

<circle cx="${CX}" cy="${CY}" r="${R0 - 6}" fill="none" stroke="${C.line}"/>
${bars}${ticks}
<text class="mono dim" x="${CX}" y="${CY - 4}" font-size="9" letter-spacing="1.6" text-anchor="middle">WHEN I</text>
<text class="mono accent" x="${CX}" y="${CY + 12}" font-size="12" letter-spacing="1.6" text-anchor="middle">SHIP</text>

<rect x="268" y="104" width="1" height="${(H - 104 - 26).toFixed(0)}" fill="${C.line}"/>
${cols}
<rect x="300" y="202" width="${W - PAD - 300}" height="1" fill="${C.line}"/>
${nowStrip}
</svg>`;
}

mkdirSync('assets', { recursive: true });
writeFileSync(OUT, render(analyse(await events())));
console.log('wrote', OUT);
