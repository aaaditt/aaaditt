#!/usr/bin/env node
// Renders assets/stats.svg from live GitHub data.
// In CI: needs GITHUB_TOKEN + GH_LOGIN. Locally: `node build-stats.mjs --mock mock.json`.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const LOGIN = process.env.GH_LOGIN || 'aaaditt';
const OUT = resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'assets/stats.svg');

const QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      totalCommitContributions
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount weekday } }
      }
    }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false){
      totalCount
      nodes{ stargazerCount languages(first:12, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } }
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
  if (j.errors || !j.data || !j.data.user) {
    console.error('\nGitHub API rejected the request.');
    console.error(JSON.stringify(j.errors || j, null, 2));
    console.error('\nFix: create a classic PAT with the read:user scope, save it as a');
    console.error('repository secret named PROFILE_TOKEN, then re-run this workflow.\n');
    process.exit(1);
  }
  const u = j.data.user;
  const days = u.contributionsCollection.contributionCalendar.weeks
    .flatMap(w => w.contributionDays).map(d => ({ date: d.date, count: d.contributionCount }));
  const langTotals = new Map();
  for (const repo of u.repositories.nodes)
    for (const e of repo.languages.edges) {
      const k = e.node.name;
      const p = langTotals.get(k) || { size: 0, color: e.node.color };
      p.size += e.size; langTotals.set(k, p);
    }
  return {
    days,
    total: u.contributionsCollection.contributionCalendar.totalContributions,
    repos: u.repositories.totalCount,
    langs: [...langTotals].map(([name, v]) => ({ name, size: v.size, color: v.color }))
                          .sort((a, b) => b.size - a.size),
  };
}

function mock() {
  const m = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--mock') + 1], 'utf8'));
  const start = new Date(m.start + 'T00:00:00Z');
  const days = m.levels.map((l, i) => {
    const d = new Date(start.getTime() + i * 864e5);
    return { date: d.toISOString().slice(0, 10), count: [0, 1, 3, 6, 11][l] };
  });
  return { days, total: m.total, repos: m.repos, langs: m.langs };
}

// ---------- helpers ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CW = 0.6; // monospace advance ratio

function streaks(days) {
  let cur = 0, best = 0, run = 0;
  for (const d of days) { if (d.count > 0) { run++; if (run > best) best = run; } else run = 0; }
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].count > 0) cur++; else break; }
  return { cur, best };
}

function levelOf(count, scale) {
  if (count <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / scale) * 4)));
}

function render(data) {
  const W = 1000, PAD = 40, IN = W - PAD * 2;
  const { cur, best } = streaks(data.days);
  const nz = data.days.map(d => d.count).filter(c => c > 0).sort((a, b) => a - b);
  const scale = Math.max(1, nz[Math.floor(nz.length * 0.9)] || 1);
  const langs = data.langs.slice(0, 6);
  const langTotal = data.langs.reduce((s, l) => s + l.size, 0) || 1;
  const shown = langs.reduce((s, l) => s + l.size, 0);
  const otherPct = Math.max(0, 100 - (shown / langTotal) * 100);

  const RAMP = ['#15151a', '#4a2a18', '#8a4520', '#c2591f', '#ff5a1f'];
  // warm ramp keeps the language bar on-theme instead of GitHub's stock blues
  const LRAMP = ['#ff5a1f', '#ff8c42', '#e0a458', '#c9b8a0', '#8d8a93', '#55535c'];

  // ---- metric tiles ----
  const tiles = [
    [String(data.total), 'CONTRIBUTIONS · 1Y', false],
    [String(cur), 'CURRENT STREAK', true],
    [String(best), 'LONGEST STREAK', false],
    [String(data.repos), 'PUBLIC REPOS', false],
    [String(data.langs.length), 'LANGUAGES USED', false],
  ];
  const TW = IN / tiles.length;
  const tileSvg = tiles.map(([v, label, hot], i) => {
    const x = PAD + i * TW, d = 0.18 + i * 0.09;
    return `<g class="tile" style="animation-delay:${d.toFixed(2)}s">`
      + (i ? `<rect x="${(x - 14).toFixed(1)}" y="98" width="1" height="52" fill="#22222a"/>` : '')
      + `<text class="mono ${hot ? 'amber' : 'bone'}" x="${x.toFixed(1)}" y="130" font-size="30">${v}</text>`
      + `<text class="mono dim" x="${x.toFixed(1)}" y="152" font-size="10.5" letter-spacing="1.6">${label}</text></g>`;
  }).join('');

  // ---- heatmap ----
  // group into weeks starting Sunday
  const weeks = [];
  let wk = new Array(7).fill(null);
  for (const d of data.days) {
    const wd = new Date(d.date + 'T00:00:00Z').getUTCDay();
    wk[wd] = d;
    if (wd === 6) { weeks.push(wk); wk = new Array(7).fill(null); }
  }
  if (wk.some(Boolean)) weeks.push(wk);
  const NW = weeks.length;
  const PITCH = IN / NW, CELL = Math.min(13.5, PITCH - 3.2), HY = 236;
  const cells = weeks.map((week, wi) => week.map((d, di) => {
    if (!d) return '';
    const lv = levelOf(d.count, scale);
    const x = PAD + wi * PITCH, y = HY + di * (CELL + 3.4);
    const delay = (0.30 + wi * 0.011 + di * 0.02).toFixed(2);
    return `<rect class="cell" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${CELL.toFixed(1)}" height="${CELL.toFixed(1)}" rx="2.6" fill="${RAMP[lv]}" style="animation-delay:${delay}s"/>`;
  }).join('')).join('');
  const HBOT = HY + 7 * (CELL + 3.4) - 3.4;

  const legend = RAMP.map((c, i) =>
    `<rect x="${W - PAD - 107 + i * 15}" y="200" width="11" height="11" rx="2.4" fill="${c}"/>`).join('');

  // ---- language bar ----
  const BARY = HBOT + 92, BARH = 16;
  let acc = 0;
  const segs = langs.map((l, i) => {
    const w = (l.size / langTotal) * IN, x = PAD + acc; acc += w;
    return `<rect x="${x.toFixed(1)}" y="${BARY}" width="${Math.max(0, w).toFixed(1)}" height="${BARH}" fill="${LRAMP[i % LRAMP.length]}"/>`;
  }).join('') + `<rect x="${(PAD + acc).toFixed(1)}" y="${BARY}" width="${Math.max(0, IN - acc).toFixed(1)}" height="${BARH}" fill="#2b2b34"/>`;

  const LEGY = BARY + 48;
  let lx = PAD;
  const langLegend = langs.map((l, i) => {
    const pct = ((l.size / langTotal) * 100).toFixed(1) + '%';
    const label = `${l.name} ${pct}`;
    const wpx = 18 + label.length * 13 * CW;
    const g = `<g class="lg" style="animation-delay:${(0.75 + i * 0.07).toFixed(2)}s">`
      + `<circle cx="${(lx + 5).toFixed(1)}" cy="${LEGY - 4}" r="4.5" fill="${LRAMP[i % LRAMP.length]}"/>`
      + `<text class="mono bone" x="${(lx + 17).toFixed(1)}" y="${LEGY}" font-size="13">${esc(l.name)}</text>`
      + `<text class="mono dim" x="${(lx + 17 + (l.name.length + 1) * 13 * CW).toFixed(1)}" y="${LEGY}" font-size="13">${pct}</text></g>`;
    lx += wpx + 16;
    return g;
  }).join('');

  const H = LEGY + 34;
  const synced = new Date().toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="GitHub statistics for ${esc(LOGIN)}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c0c10"/><stop offset="1" stop-color="#08080a"/></linearGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#f2ede4" fill-opacity="0.05"/></pattern>
  <linearGradient id="scanl" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ff5a1f" stop-opacity="0"/><stop offset="0.5" stop-color="#ff5a1f" stop-opacity="0.5"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="barclip"><rect x="${PAD}" y="${BARY}" width="${IN}" height="${BARH}" rx="${BARH / 2}"/></clipPath>
  <clipPath id="barwipe"><rect class="wipe" x="${PAD}" y="${BARY}" width="${IN}" height="${BARH}"/></clipPath>
  <style>
    .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
    .bone{fill:#f2ede4}.amber{fill:#ff5a1f}.dim{fill:#8d8a93}
    .hd,.tile,.lg,.sec{opacity:0;animation:rise .55s cubic-bezier(.16,.9,.2,1) both}
    @keyframes rise{0%{opacity:0;transform:translateY(9px)}100%{opacity:1;transform:translateY(0)}}
    .hd{animation-delay:.05s}
    .cell{opacity:0;transform-box:fill-box;transform-origin:center;animation:pop .42s cubic-bezier(.2,1.3,.4,1) both}
    @keyframes pop{0%{opacity:0;transform:scale(.35)}100%{opacity:1;transform:scale(1)}}
    .wipe{transform-box:fill-box;transform-origin:left center;animation:wipe .95s cubic-bezier(.2,.85,.25,1) .62s both}
    @keyframes wipe{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
    .scan{animation:scan 8s cubic-bezier(.4,0,.3,1) 1.3s infinite}
    @keyframes scan{0%{transform:translateY(-24px);opacity:0}5%{opacity:1}24%{transform:translateY(${(H - 60).toFixed(0)}px);opacity:1}29%{opacity:0}100%{transform:translateY(${(H - 60).toFixed(0)}px);opacity:0}}
    @media (prefers-reduced-motion: reduce){
      .hd,.tile,.lg,.sec,.cell{animation:none!important;opacity:1;transform:none}
      .wipe{animation:none;transform:none}.scan{display:none}
    }
  </style>
</defs>
<rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="16" fill="url(#dots)"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="#22222a"/>

<g class="hd">
  <text class="mono amber" x="${PAD}" y="52" font-size="13" letter-spacing="5">TELEMETRY</text>
  <text class="mono dim" x="${W - PAD}" y="52" font-size="12" text-anchor="end">auto-synced ${synced}</text>
  <rect x="${PAD}" y="70" width="${IN}" height="1" fill="#22222a"/>
</g>

<g class="scan"><rect x="${PAD}" y="80" width="${IN}" height="2" fill="url(#scanl)"/></g>

${tileSvg}

<rect x="${PAD}" y="178" width="${IN}" height="1" fill="#22222a"/>
<g class="sec" style="animation-delay:.26s">
  <text class="mono dim" x="${PAD}" y="210" font-size="11" letter-spacing="2.2">CONTRIBUTION HEATMAP &#183; PAST YEAR</text>
  <text class="mono dim" x="${W - PAD - 115}" y="210" font-size="10.5" text-anchor="end">less</text>
  ${legend}
  <text class="mono dim" x="${W - PAD}" y="210" font-size="10.5" text-anchor="end">more</text>
</g>
${cells}

<rect x="${PAD}" y="${HBOT + 34}" width="${IN}" height="1" fill="#22222a"/>
<g class="sec" style="animation-delay:.58s">
  <text class="mono dim" x="${PAD}" y="${HBOT + 66}" font-size="11" letter-spacing="2.2">LANGUAGES BY BYTES</text>
  <text class="mono dim" x="${W - PAD}" y="${HBOT + 66}" font-size="10.5" text-anchor="end">${otherPct > 0.5 ? '+' + otherPct.toFixed(0) + '% other' : ''}</text>
</g>
<g clip-path="url(#barclip)"><g clip-path="url(#barwipe)">${segs}</g></g>
${langLegend}
</svg>`;
}

function placeholder() {
  const W = 1000, H = 150, PAD = 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Stats card awaiting first sync">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c0c10"/><stop offset="1" stop-color="#08080a"/></linearGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#f2ede4" fill-opacity="0.05"/></pattern>
  <style>
    .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
    .dim{fill:#8d8a93}.amber{fill:#ff5a1f}
    .pulse{animation:p 1.5s ease-in-out infinite}
    @keyframes p{0%,100%{opacity:.25}50%{opacity:1}}
    @media (prefers-reduced-motion: reduce){.pulse{animation:none}}
  </style>
</defs>
<rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="16" fill="url(#dots)"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="#22222a"/>
<text class="mono amber" x="${PAD}" y="52" font-size="13" letter-spacing="5">TELEMETRY</text>
<rect x="${PAD}" y="70" width="${W - PAD * 2}" height="1" fill="#22222a"/>
<circle class="pulse" cx="${PAD + 6}" cy="104" r="5" fill="#ff5a1f"/>
<text class="mono dim" x="${PAD + 20}" y="109" font-size="14">awaiting first sync &#8212; run the "refresh stats card" workflow</text>
</svg>`;
}

const data = process.argv.includes('--placeholder') ? null
           : process.argv.includes('--mock') ? mock() : await live();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, data ? render(data) : placeholder());
console.log('wrote', OUT);
