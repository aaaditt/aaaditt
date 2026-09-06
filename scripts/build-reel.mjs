#!/usr/bin/env node
// Renders assets/reel.svg — the contribution year as a twelve-frame film strip.
//
// One frame per month, each frame holding that month's days as a mini calendar.
// The gate steps frame to frame the way a projector advances film, the sprockets
// scroll, and the caption under the strip changes with the frame on screen.
//
//   node scripts/build-reel.mjs                 # live, needs GITHUB_TOKEN
//   node scripts/build-reel.mjs --mock mock.json
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { C, HEAT, esc, stamp } from './palette.mjs';

const LOGIN = process.env.GH_LOGIN || 'aaaditt';
const TZ = Number(process.env.TZ_OFFSET ?? 4);
const OUT = resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'assets/reel.svg');

const QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount } }
      }
    }
  }
}`;

async function live() {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const j = await r.json();
  if (j.errors || !j.data?.user) {
    console.error('GitHub API rejected the request.');
    console.error(JSON.stringify(j.errors || j, null, 2));
    console.error('Fix: classic PAT with read:user, saved as the PROFILE_TOKEN secret.');
    process.exit(1);
  }
  const cal = j.data.user.contributionsCollection.contributionCalendar;
  return {
    total: cal.totalContributions,
    days: cal.weeks.flatMap(w => w.contributionDays)
      .map(d => ({ date: d.date, count: d.contributionCount })),
  };
}

function mock() {
  const m = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--mock') + 1], 'utf8'));
  const start = new Date(m.start + 'T00:00:00Z');
  const days = m.levels.map((l, i) => ({
    date: new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10),
    count: [0, 1, 3, 6, 11][l],
  }));
  return { total: m.total, days };
}

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

function months(days) {
  const by = new Map();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(d);
  }
  return [...by.entries()].sort(([a], [b]) => a < b ? -1 : 1).slice(-12)
    .map(([key, list]) => {
      const [y, m] = key.split('-').map(Number);
      const total = list.reduce((s, d) => s + d.count, 0);
      const peak = list.reduce((b, d) => d.count > (b?.count ?? 0) ? d : b, null);
      return { key, year: y, month: m, label: MON[m - 1], days: list, total, peak };
    });
}

function streaks(days) {
  let best = 0, run = 0;
  for (const d of days) { if (d.count > 0) { run++; if (run > best) best = run; } else run = 0; }
  return best;
}

function render(data) {
  const W = 1000, PAD = 40, IN = W - PAD * 2;
  const ms = months(data.days);
  const N = ms.length;

  // ---- geometry ----
  const PITCH = IN / N, FW = PITCH - 8;
  const CELL = 6.6, CGAP = 1.5, CP = CELL + CGAP;
  const GRIDW = 7 * CP - CGAP, GX = (FW - GRIDW) / 2;

  const STRIP_TOP = 88, SPR = 16, FRAME_TOP = STRIP_TOP + SPR + 8;
  const LABEL_Y = FRAME_TOP + 16, GRID_Y = FRAME_TOP + 24;
  const FH = 24 + 6 * CP - CGAP + 20;
  const FRAME_BOT = FRAME_TOP + FH, STRIP_BOT = FRAME_BOT + 8 + SPR;
  const CAP_Y = STRIP_BOT + 32, FOOT_Y = CAP_Y + 26;
  const H = FOOT_Y + 20;

  // ---- scale: 90th percentile of active days, so one huge day can't flatten the year
  const nz = data.days.map(d => d.count).filter(c => c > 0).sort((a, b) => a - b);
  const scale = Math.max(1, nz[Math.floor(nz.length * 0.9)] || 1);
  const level = c => c <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((c / scale) * 4)));

  const CYCLE = N * 1.15;                       // seconds for a full pass of the reel
  const slotPct = (100 / N).toFixed(3);

  // ---- frames ----
  const frames = ms.map((mo, i) => {
    const fx = PAD + i * PITCH;
    const first = new Date(Date.UTC(mo.year, mo.month - 1, 1)).getUTCDay();
    const isNow = i === N - 1;

    const cells = mo.days.map(d => {
      const dom = Number(d.date.slice(8, 10));
      const idx = first + dom - 1;
      const cx = fx + GX + (idx % 7) * CP;
      const cy = GRID_Y + Math.floor(idx / 7) * CP;
      const delay = (0.25 + i * 0.045 + (idx % 7) * 0.012).toFixed(2);
      return `<rect class="cell" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${CELL}" height="${CELL}" rx="1.5" fill="${HEAT[level(d.count)]}" style="animation-delay:${delay}s"/>`;
    }).join('');

    return `<g class="fr" style="animation-delay:${(0.12 + i * 0.05).toFixed(2)}s">
  <rect x="${fx.toFixed(1)}" y="${FRAME_TOP}" width="${FW.toFixed(1)}" height="${FH.toFixed(1)}" rx="4" fill="${C.bg2}" stroke="${C.line}"/>
  <text class="mono ${isNow ? 'accent' : 'pt'}" x="${(fx + 8).toFixed(1)}" y="${LABEL_Y}" font-size="10" letter-spacing="1.4">${mo.label}</text>
  <text class="mono faint" x="${(fx + FW - 8).toFixed(1)}" y="${LABEL_Y}" font-size="8.5" text-anchor="end">${String(i + 1).padStart(2, '0')}</text>
  ${cells}
  <text class="mono ${mo.total ? 'dim' : 'faint'}" x="${(fx + FW / 2).toFixed(1)}" y="${(FRAME_BOT - 7).toFixed(1)}" font-size="9.5" text-anchor="middle">${mo.total || '—'}</text>
</g>`;
  }).join('\n');

  // ---- the gate: one frame lit at a time, stepping like a projector ----
  const gates = ms.map((_, i) => {
    const fx = PAD + i * PITCH;
    return `<rect class="gate" x="${fx.toFixed(1)}" y="${FRAME_TOP}" width="${FW.toFixed(1)}" height="${FH.toFixed(1)}" rx="4" fill="${C.accent}" fill-opacity="0.06" stroke="${C.accent}" style="animation-delay:${(i * (CYCLE / N)).toFixed(2)}s"/>`;
  }).join('');

  // ---- captions, one per frame, in step with the gate ----
  const caps = ms.map((mo, i) => {
    const txt = mo.total
      ? `${mo.label} ${mo.year} · ${mo.total} contribution${mo.total === 1 ? '' : 's'} · busiest day the ${ord(Number(mo.peak.date.slice(8, 10)))} (${mo.peak.count})`
      : `${mo.label} ${mo.year} · dark month — no footage`;
    return `<text class="mono dim cap" x="${PAD + 16}" y="${CAP_Y}" font-size="12.5" style="animation-delay:${(i * (CYCLE / N)).toFixed(2)}s">${esc(txt)}</text>`;
  }).join('');

  // ---- sprocket holes, advancing one perforation per frame ----
  // Drawn well past the right edge so the strip still reads as continuous after
  // it has crawled N perforations to the left over one cycle.
  const holes = [];
  for (let x = -28; x < W + 28 * (N + 2); x += 28) {
    for (const y of [STRIP_TOP + 4, STRIP_BOT - SPR + 4])
      holes.push(`<rect x="${x}" y="${y}" width="11" height="8" rx="2.5" fill="#000" stroke="${C.line2}" stroke-width="0.7"/>`);
  }

  const longest = streaks(data.days);
  const now = stamp(TZ);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="A year of contributions as a twelve-frame film strip — ${data.total} contributions, longest streak ${longest} days">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${C.bone}" fill-opacity="0.05"/></pattern>
  <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.accent}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${C.accentHot}" stop-opacity="0.30"/>
    <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="strip"><rect x="0" y="${STRIP_TOP}" width="${W}" height="${STRIP_BOT - STRIP_TOP}"/></clipPath>
  <style>
    .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
    .bone{fill:${C.bone}}.accent{fill:${C.accent}}.dim{fill:${C.dim}}.pt{fill:${C.pt}}.faint{fill:${C.faint}}
    .hd,.ft{opacity:0;animation:rise .55s cubic-bezier(.16,.9,.2,1) both}
    @keyframes rise{0%{opacity:0;transform:translateY(9px)}100%{opacity:1;transform:translateY(0)}}
    .hd{animation-delay:.05s}.ft{animation-delay:.7s}
    .fr{opacity:0;animation:rise .5s cubic-bezier(.16,.9,.2,1) both}
    .cell{opacity:0;transform-box:fill-box;transform-origin:center;animation:pop .42s cubic-bezier(.2,1.3,.4,1) both}
    @keyframes pop{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}

    /* the projector gate — each frame lit for one slot of the cycle */
    .gate{opacity:0;animation:gate ${CYCLE}s steps(1,end) 1.1s infinite}
    @keyframes gate{0%{opacity:1}${slotPct}%{opacity:0}100%{opacity:0}}
    .cap{opacity:0;animation:gate ${CYCLE}s steps(1,end) 1.1s infinite}

    /* sprockets advance one perforation per frame — N discrete jumps per cycle */
    .spr{animation:advance ${CYCLE}s steps(${N},end) 1.1s infinite}
    @keyframes advance{0%{transform:translateX(0)}100%{transform:translateX(-${28 * N}px)}}

    .sheen{animation:sheen ${(CYCLE * 1.5).toFixed(1)}s cubic-bezier(.4,0,.3,1) 2s infinite}
    @keyframes sheen{0%{transform:translateX(-320px);opacity:0}6%{opacity:1}
      55%{transform:translateX(${W}px);opacity:1}62%{opacity:0}100%{transform:translateX(${W}px);opacity:0}}
    .rec{animation:bl 1.6s steps(1,end) infinite}
    @keyframes bl{0%,55%{opacity:1}55.01%,100%{opacity:.15}}

    @media (prefers-reduced-motion: reduce){
      .hd,.ft,.fr,.cell{animation:none!important;opacity:1;transform:none}
      .gate,.spr,.sheen,.rec{animation:none}
      .gate{opacity:0}.cap{animation:none;opacity:0}.cap:last-of-type{opacity:1}
    }
  </style>
</defs>
<rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="16" fill="url(#dots)"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="${C.line}"/>

<g class="hd">
  <text class="mono accent" x="${PAD}" y="52" font-size="13" letter-spacing="5">THE REEL</text>
  <circle class="rec" cx="${PAD + 124}" cy="48" r="3.5" fill="${C.accent}"/>
  <text class="mono dim" x="${W - PAD}" y="52" font-size="12" text-anchor="end">${N} frames &#183; ${data.total} contributions &#183; cut ${now.date}</text>
  <rect x="${PAD}" y="70" width="${IN}" height="1" fill="${C.line}"/>
</g>

<!-- the strip runs edge to edge, as if it carried on past the card -->
<g clip-path="url(#strip)">
  <rect x="0" y="${STRIP_TOP}" width="${W}" height="${STRIP_BOT - STRIP_TOP}" fill="${C.panel}" fill-opacity="0.55"/>
  <rect x="0" y="${STRIP_TOP}" width="${W}" height="0.8" fill="${C.line2}"/>
  <rect x="0" y="${STRIP_BOT - 0.8}" width="${W}" height="0.8" fill="${C.line2}"/>
  <g class="spr">${holes.join('')}</g>
  <g class="sheen"><rect x="0" y="${STRIP_TOP}" width="320" height="${STRIP_BOT - STRIP_TOP}" fill="url(#glow)"/></g>
</g>

${frames}
${gates}
${caps}

<g class="ft">
  <text class="mono faint" x="${PAD}" y="${CAP_Y}" font-size="12.5">&#9656;</text>
  <text class="mono dim" x="${W - PAD}" y="${FOOT_Y}" font-size="11" text-anchor="end" letter-spacing="1.4">LONGEST TAKE ${longest} DAYS &#183; RUNTIME ${data.days.length} DAYS</text>
  <text class="mono faint" x="${PAD}" y="${FOOT_Y}" font-size="11" letter-spacing="1.4">EVERY FRAME IS A DAY. EVERY DAY IS A COMMIT OR IT ISN'T.</text>
</g>
</svg>`;
}

const data = process.argv.includes('--mock') ? mock() : await live();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, render(data));
console.log('wrote', OUT);
