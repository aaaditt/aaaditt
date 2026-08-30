#!/usr/bin/env node
// Renders the project cards and contact chips from data/projects.json.
// Works with or without a token — star counts are best-effort.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const CFG = JSON.parse(readFileSync('data/projects.json', 'utf8'));
const OWNER = process.env.GH_LOGIN || CFG.owner;
const TOKEN = process.env.GITHUB_TOKEN;
mkdirSync('assets', { recursive: true });

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CHROME = (w, h) => `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c0c10"/><stop offset="1" stop-color="#08080a"/></linearGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#f2ede4" fill-opacity="0.05"/></pattern>`;
const PLATE = (w, h, r = 14) =>
  `<rect width="${w}" height="${h}" rx="${r}" fill="url(#bg)"/>`
+ `<rect width="${w}" height="${h}" rx="${r}" fill="url(#dots)"/>`
+ `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r}" fill="none" stroke="#22222a"/>`;
const FONT = `.mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
    .bone{fill:#f2ede4}.amber{fill:#ff5a1f}.dim{fill:#8d8a93}.body{fill:#a9a5ae}`;

// deterministic 5x5 glyph from the project name — every card gets its own mark
function glyph(name, x, y) {
  let h = 2166136261;
  for (const ch of name) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let out = '', k = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++, k++) {
    if (!((h >>> (k % 32)) & 1)) continue;
    const op = 0.22 + ((h >>> (k % 24)) & 7) / 14;
    out += `<rect x="${x + c * 9}" y="${y + r * 9}" width="4.4" height="4.4" rx="1.1" fill="#ff5a1f" opacity="${op.toFixed(2)}" class="gd" style="animation-delay:${(0.5 + k * 0.014).toFixed(2)}s"/>`;
  }
  return out;
}

function wrap(text, maxChars, maxLines) {
  const words = text.split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur.trim());
  if (lines.length === maxLines) {
    const used = lines.join(' ').length;
    if (used < text.length - 1) lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,;:]?$/, '') + '…';
  }
  return lines.slice(0, maxLines);
}

async function repoMeta(repo) {
  try {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${repo}`,
      { headers: TOKEN ? { Authorization: `bearer ${TOKEN}` } : {} });
    if (!r.ok) return {};
    const j = await r.json();
    return { stars: j.stargazers_count, lang: j.language };
  } catch { return {}; }
}

// ---------- project card ----------
function projectCard(p, i, meta) {
  const W = 480, H = 200, PAD = 24, CW = 0.6;
  const idx = String(i + 1).padStart(2, '0');
  const lines = wrap(p.blurb, 56, 3);
  const desc = lines.map((l, n) =>
    `<text class="mono body" x="${PAD}" y="${112 + n * 19}" font-size="12.5">${esc(l)}</text>`).join('');

  let cx = PAD;
  const chips = p.stack.map((s, n) => {
    const tw = s.length * 11 * CW, w = tw + 20;
    const g = `<g class="chip" style="animation-delay:${(0.42 + n * 0.06).toFixed(2)}s">`
      + `<rect x="${cx.toFixed(0)}" y="164" width="${w.toFixed(0)}" height="22" rx="7" fill="#15151a" stroke="#2b2b34"/>`
      + `<text class="mono dim" x="${(cx + 10).toFixed(0)}" y="179" font-size="11">${esc(s)}</text></g>`;
    cx += w + 7; return g;
  }).join('');

  const stars = meta.stars ? `<text class="mono dim" x="${W - PAD}" y="179" font-size="11" text-anchor="end">&#9733; ${meta.stars}</text>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(p.name)} — ${esc(p.blurb)}">
<defs>${CHROME(W, H)}
  <style>
    ${FONT}
    .up{opacity:0;animation:up .5s cubic-bezier(.16,.9,.2,1) both}
    @keyframes up{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
    .t1{animation-delay:.06s}.t2{animation-delay:.14s}.t3{animation-delay:.22s}
    .chip{opacity:0;animation:up .45s cubic-bezier(.16,.9,.2,1) both}
    .gd{opacity:0;animation:gd .5s ease-out both}
    @keyframes gd{to{opacity:1}}
    .ul{transform-box:fill-box;transform-origin:left;animation:ul .6s cubic-bezier(.16,.9,.2,1) .3s both}
    @keyframes ul{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
    @media (prefers-reduced-motion: reduce){
      .up,.chip,.gd,.ul{animation:none!important;opacity:1;transform:none}
    }
  </style>
</defs>
${PLATE(W, H)}
${glyph(p.name, W - PAD - 40, 30)}
<g class="up t1"><text class="mono amber" x="${PAD}" y="46" font-size="10" letter-spacing="3">${idx}</text></g>
<g class="up t2"><text class="mono bone" x="${PAD}" y="78" font-size="18">${esc(p.name)}</text></g>
<rect class="ul" x="${PAD}" y="88" width="46" height="2" fill="#ff5a1f"/>
<g class="up t3">${desc}</g>
${chips}
${stars}
</svg>`;
}

// ---------- contact chip ----------
function contactChip(label) {
  const CW = 0.6, FS = 12, w = Math.round(label.length * FS * CW + 46), h = 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
<defs>${CHROME(w, h)}
  <style>
    ${FONT}
    .d{animation:bl 2.2s ease-in-out infinite}
    @keyframes bl{0%,100%{opacity:.45}50%{opacity:1}}
    @media (prefers-reduced-motion: reduce){.d{animation:none}}
  </style>
</defs>
${PLATE(w, h, 9)}
<circle class="d" cx="17" cy="${h / 2}" r="3.6" fill="#ff5a1f"/>
<text class="mono bone" x="28" y="${h / 2 + 4.5}" font-size="${FS}" letter-spacing="1.4">${esc(label)}</text>
</svg>`;
}

// ---------- run ----------
const metas = await Promise.all(CFG.projects.map(p => repoMeta(p.repo)));
CFG.projects.forEach((p, i) => {
  writeFileSync(`assets/proj-${i + 1}.svg`, projectCard(p, i, metas[i]));
});
CFG.contact.forEach(c => {
  writeFileSync(`assets/chip-${c.label.toLowerCase()}.svg`, contactChip(c.label));
});

// first-run placeholders so the README is never broken before the first sync
const holding = (title, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${h}" width="1000" height="${h}" role="img" aria-label="${title} awaiting first sync">
<defs>${CHROME(1000, h)}<style>${FONT}
 .p{animation:p 1.5s ease-in-out infinite}@keyframes p{0%,100%{opacity:.25}50%{opacity:1}}
 @media (prefers-reduced-motion: reduce){.p{animation:none}}</style></defs>
${PLATE(1000, h, 16)}
<text class="mono amber" x="40" y="48" font-size="13" letter-spacing="5">${title}</text>
<circle class="p" cx="46" cy="82" r="5" fill="#ff5a1f"/>
<text class="mono dim" x="60" y="87" font-size="14">awaiting first sync &#8212; run the "refresh profile" workflow</text>
</svg>`;

if (!existsSync('assets/pulse.svg')) writeFileSync('assets/pulse.svg', holding('PULSE', 120));
if (!existsSync('assets/stats.svg')) writeFileSync('assets/stats.svg', holding('TELEMETRY', 120));

console.log(`wrote ${CFG.projects.length} project cards + ${CFG.contact.length} chips`);
