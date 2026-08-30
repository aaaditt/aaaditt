#!/usr/bin/env node
// Renders assets/pulse.svg — a 24-hour commit-rhythm dial plus live activity.
// Derived from public push events (~last 300), converted to the local timezone.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'aaaditt';
const TOKEN = process.env.GITHUB_TOKEN;
const TZ = Number(process.env.TZ_OFFSET ?? 4);          // Dubai, UTC+4
const TZ_LABEL = process.env.TZ_LABEL || 'gulf standard time';
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'assets/pulse.svg';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  const d = Math.floor(m / 1440);
  return d === 1 ? 'yesterday' : `${d}d ago`;
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
  const W = 1000, H = 280, PAD = 40;
  const CX = 152, CY = 176, R0 = 32, RMAX = 74;
  const max = Math.max(1, ...a.hours);
  const pad2 = n => String(n).padStart(2, '0');

  const bars = a.hours.map((v, h) => {
    const ang = (h * 15 - 90) * Math.PI / 180;
    const len = R0 + 6 + (v / max) * (RMAX - R0 - 6);
    const x1 = CX + Math.cos(ang) * R0, y1 = CY + Math.sin(ang) * R0;
    const x2 = CX + Math.cos(ang) * len, y2 = CY + Math.sin(ang) * len;
    const t = v / max;
    const col = v === 0 ? '#22222a' : t > .66 ? '#ff5a1f' : t > .33 ? '#c2591f' : '#8a4520';
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Commit rhythm and recent activity">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c0c10"/><stop offset="1" stop-color="#08080a"/></linearGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#f2ede4" fill-opacity="0.05"/></pattern>
  <style>
    .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
    .bone{fill:#f2ede4}.amber{fill:#ff5a1f}.dim{fill:#8d8a93}
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
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="#22222a"/>

<g class="hd">
  <text class="mono amber" x="${PAD}" y="52" font-size="13" letter-spacing="5">PULSE</text>
  <circle class="live" cx="${(W - PAD - `live \u00b7 ${a.total} recent pushes`.length * 7.2 - 13).toFixed(0)}" cy="48" r="4" fill="#ff5a1f"/>
  <text class="mono dim" x="${W - PAD}" y="52" font-size="12" text-anchor="end">live &#183; ${a.total} recent pushes</text>
  <rect x="${PAD}" y="70" width="${W - PAD * 2}" height="1" fill="#22222a"/>
</g>

<circle cx="${CX}" cy="${CY}" r="${R0 - 6}" fill="none" stroke="#22222a"/>
${bars}${ticks}
<text class="mono dim" x="${CX}" y="${CY - 4}" font-size="9" letter-spacing="1.6" text-anchor="middle">WHEN I</text>
<text class="mono amber" x="${CX}" y="${CY + 12}" font-size="12" letter-spacing="1.6" text-anchor="middle">SHIP</text>

<rect x="268" y="104" width="1" height="126" fill="#22222a"/>
${cols}
<text class="mono dim" x="300" y="230" font-size="11.5">&#9656; currently building a cinematic portfolio</text>
</svg>`;
}

mkdirSync('assets', { recursive: true });
writeFileSync(OUT, render(analyse(await events())));
console.log('wrote', OUT);
