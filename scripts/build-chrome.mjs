#!/usr/bin/env node
// Renders the two pieces of page furniture: assets/hero.svg and assets/divider.svg.
// Both were hand-written before; generating them means the accent colour, the
// rotating taglines and the timecode all come from one place.
//
//   node scripts/build-chrome.mjs
//
// The timecode in the letterbox is real: HH:MM:SS is the moment this file was
// built (gulf standard time) and the frame field genuinely advances 24 times a
// second, which is what the 24FPS stamp next to it has always claimed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { C, esc, stamp } from './palette.mjs';

const SITE = JSON.parse(readFileSync('data/site.json', 'utf8'));
const TZ = Number(process.env.TZ_OFFSET ?? 4);
const now = stamp(TZ);
const PORTRAIT = existsSync('data/portrait.json')
  ? JSON.parse(readFileSync('data/portrait.json', 'utf8')) : null;

// ---------------------------------------------------------------- portrait
// The avatar, rebuilt out of the same little rounded squares the contribution
// heatmap is made of: one cell per source pixel, sized and lit by how dark that
// pixel was, sky dropped entirely. It develops in on a diagonal, like a print
// coming up in a tray. Geometry is solved from the figure's bounding box so a
// new avatar lands in the same place without anyone touching these numbers.
function portrait(p, headY, centreX) {
  const { rows, w, h } = PORTRAIT;
  const ox = centreX - (w / 2) * p;
  const oy = headY;

  // Stored values run 1 (lightest source pixel) to 15 (darkest). Read as a
  // positive — light skin bright, dark hoodie recessive — the face survives;
  // read as a negative it flattens into a silhouette. So: positive, with the
  // range stretched across the figure's own min and max rather than 1..15,
  // which is what stops the whole thing turning into one flat mass.
  const vals = rows.flatMap(row => [...row].map(ch => parseInt(ch, 16)).filter(v => v > 0));
  const lo = Math.min(...vals), hi = Math.max(...vals);

  // Six ink levels. Quantising lets every cell of one level in one diagonal band
  // share a single <path> — ~2000 squares in about 50KB instead of 200KB, and the
  // band is what the develop animation fades in, so the picture still comes up
  // across the frame rather than all at once.
  const SZ = [0.34, 0.47, 0.60, 0.73, 0.87, 1.00];
  const FILL = [C.accentDim, C.accentDeep, C.accentDeep, C.accent, C.accent, C.accentHot];
  const OP = ['.48', '.60', '.72', '.84', '.94', '1'];
  const BANDS = 22;
  const groups = new Map();

  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const v = parseInt(row[c], 16);
      if (v === 0) continue;                                  // sky: prints nothing
      // Read as a positive — lit skin bright, hoodie in shadow — so the face
      // survives; a negative flattens the whole thing into a hooded silhouette.
      // The gamma lifts the mid-tones so the body still has mass under the face.
      const t = Math.pow(1 - (v - lo) / Math.max(1, hi - lo), 0.72);
      const tone = Math.min(5, Math.floor(t * 5.999));
      const band = Math.min(BANDS - 1, Math.round((r + c) / (rows.length + row.length - 2) * (BANDS - 1)));
      const size = SZ[tone] * p * 0.96;
      const off = (p - size) / 2;
      const x = (ox + c * p + off).toFixed(1), y = (oy + r * p + off).toFixed(1);
      const s = size.toFixed(1);
      const key = `${tone}:${band}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(`M${x} ${y}h${s}v${s}h-${s}z`);
    }
  });

  const paths = [...groups].map(([key, d]) => {
    const [tone, band] = key.split(':').map(Number);
    return `<path class="px b${band}" fill="${FILL[tone]}" fill-opacity="${OP[tone]}" d="${d.join('')}"/>`;
  }).join('');

  const bucketCss = Array.from({ length: BANDS }, (_, b) =>
    `.b${b}{animation-delay:${(0.35 + b * 0.055).toFixed(2)}s}`).join('');

  return {
    svg: paths,
    css: `.px{opacity:0;animation:dev .7s ease-out both}
    @keyframes dev{0%{opacity:0}100%{opacity:1}}
    ${bucketCss}`,
    left: ox,
    right: ox + w * p,
    bottom: oy + h * p,
  };
}

// ---------------------------------------------------------------- hero
// The wordmark is drawn, not typed — five stroked paths spelling AADIT, each one
// dash-offset so it draws itself on load. Coordinates are hand-fitted to the name.
const WORDMARK = `
  <g id="wordmark">
    <path pathLength="1" d="M6 140L50 4L94 140M26 96H74"/>
    <path pathLength="1" transform="translate(124,0)" d="M6 140L50 4L94 140M26 96H74"/>
    <path pathLength="1" transform="translate(248,0)" d="M20 6H52C84 6 96 36 96 72C96 108 84 138 52 138H20Z"/>
    <path pathLength="1" transform="translate(372,0)" d="M20 6V138"/>
    <path pathLength="1" transform="translate(436,0)" d="M8 10H92M50 10V138"/>
  </g>`;

function hero() {
  const W = 1200, H = 460, MID = W / 2;
  const FS = 20, ADV = FS * 0.6;                 // monospace advance at 20px
  const lines = SITE.taglines;
  const N = lines.length, DWELL = 3.6, T = N * DWELL;
  const pct = s => (s / T * 100).toFixed(2);
  const typePct = pct(1.15);                      // how long a line takes to type
  const outA = pct(DWELL - 0.55), outB = pct(DWELL - 0.25);

  // With a portrait in frame the whole type block moves right and goes ragged-left;
  // without one the hero falls back to the centred title card it used to be.
  const por = PORTRAIT ? portrait(3.43, 148, 306) : null;
  const TX = 441;                                  // left edge of the type block
  const geom = lines.map(t => {
    const w = t.length * ADV;
    return { t, w, x: por ? TX : +(MID - w / 2).toFixed(1), chars: t.length };
  });

  const clips = geom.map((g, i) =>
    `<clipPath id="c${i}"><rect class="clip r${i}" x="${g.x}" y="334" width="${(g.w + 15).toFixed(0)}" height="34"/></clipPath>`
  ).join('\n  ');

  const lineCss = geom.map((g, i) => {
    const delay = (2.35 + i * DWELL).toFixed(2);
    return `.ln${i}{animation:slot ${T}s linear ${delay}s infinite}
    .r${i}{animation:ty${i} ${T}s steps(${g.chars},end) ${delay}s infinite}
    .cg${i}{animation:cur${i} ${T}s steps(${g.chars},end) ${delay}s infinite}
    @keyframes ty${i}{0%{transform:scaleX(0)}${typePct}%{transform:scaleX(1)}100%{transform:scaleX(1)}}
    @keyframes cur${i}{0%{transform:translateX(0)}${typePct}%{transform:translateX(${g.w}px)}100%{transform:translateX(${g.w}px)}}`;
  }).join('\n    ');

  const lineSvg = geom.map((g, i) => `<g class="line ln${i}">
  <g clip-path="url(#c${i})"><text class="mono bone" x="${g.x}" y="356" font-size="${FS}">${esc(g.t)}</text></g>
  <g class="cg${i}"><rect class="curbar" x="${g.x}" y="338" width="11" height="23"/></g>
</g>`).join('\n');

  // The frame field of the timecode: 24 values, one second per cycle. Really 24fps.
  const frames = Array.from({ length: 25 }, (_, i) =>
    `<text class="mono dim" x="1031" y="${437 + i * 20}" font-size="12">${String(i % 24).padStart(2, '0')}</text>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(SITE.name)} — full-stack developer and UI/UX designer, BITS Pilani Dubai">
<defs>
  <linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.bg0}"/><stop offset="0.55" stop-color="${C.bg3}"/><stop offset="1" stop-color="${C.bg2}"/>
  </linearGradient>
  <radialGradient id="wash" cx="0.5" cy="0.5" r="0.62">
    <stop offset="0" stop-color="${C.accent}" stop-opacity="0.18"/>
    <stop offset="0.55" stop-color="${C.accent}" stop-opacity="0.05"/>
    <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="fade" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff" stop-opacity="0.85"/>
    <stop offset="0.6" stop-color="#fff" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <mask id="gridmask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>

  <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
    <path d="M48 0V48H0" fill="none" stroke="${C.bone}" stroke-opacity="0.075" stroke-width="1"/>
  </pattern>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
    <rect width="4" height="2" fill="#000" fill-opacity="0.22"/>
  </pattern>

  <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="1"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>

  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
${WORDMARK}
  <mask id="nameMask">
    <g transform="${por ? `translate(${TX},172) scale(0.82)` : 'translate(346,150) scale(0.95)'}" fill="none" stroke="#fff" stroke-width="11.5"
       stroke-linecap="round" stroke-linejoin="round"><use href="#wordmark"/></g>
  </mask>

  <clipPath id="tcF"><rect x="1031" y="421" width="16" height="20"/></clipPath>
  ${clips}

  <style>
    .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
    .bone{fill:${C.bone}}.accent{fill:${C.accent}}.dim{fill:${C.dim}}

    .lb{fill:#000}
    .lbT{transform-box:fill-box;transform-origin:top;animation:lbO 1.15s cubic-bezier(.16,.9,.2,1) both}
    .lbB{transform-box:fill-box;transform-origin:bottom;animation:lbO 1.15s cubic-bezier(.16,.9,.2,1) both}
    @keyframes lbO{0%{transform:scaleY(3.9)}100%{transform:scaleY(1)}}

    .wm{fill:none;stroke:${C.bone};stroke-width:11.5;stroke-linecap:round;stroke-linejoin:round}
    .wm path{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.25s cubic-bezier(.4,0,.2,1) both}
    @keyframes draw{to{stroke-dashoffset:0}}
    .wm path:nth-child(1){animation-delay:.45s}
    .wm path:nth-child(2){animation-delay:.58s}
    .wm path:nth-child(3){animation-delay:.71s}
    .wm path:nth-child(4){animation-delay:.84s}
    .wm path:nth-child(5){animation-delay:.97s}
    .nameglow{animation:glowin 1.6s ease-out 1.5s both}
    @keyframes glowin{0%{filter:drop-shadow(0 0 0 rgba(${C.accentRGB},0))}100%{filter:drop-shadow(0 0 26px rgba(${C.accentRGB},.34))}}

    .swp{animation:swp 9.5s cubic-bezier(.35,0,.25,1) 2.1s infinite}
    @keyframes swp{0%{transform:translateX(-300px)}17%{transform:translateX(1300px)}100%{transform:translateX(1300px)}}

    .rule{transform-box:fill-box;transform-origin:center;animation:rule .9s cubic-bezier(.16,.9,.2,1) 1.8s both}
    @keyframes rule{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}

    .fadeup{animation:fadeup .8s cubic-bezier(.16,.9,.2,1) both}
    @keyframes fadeup{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}
    .d1{animation-delay:1.3s}.d3{animation-delay:1.75s}

    .clip{transform-box:fill-box;transform-origin:left center}
    .line{opacity:0}
    ${lineCss}
    @keyframes slot{0%{opacity:1}${outA}%{opacity:1}${outB}%{opacity:0}100%{opacity:0}}
    .curbar{fill:${C.accent};animation:blink 1s steps(1,end) infinite}
    @keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:.15}}

    .rec{animation:rec 1.6s steps(1,end) infinite}
    @keyframes rec{0%,55%{opacity:1}55.01%,100%{opacity:.12}}
    .ff{animation:roll 1s steps(24,end) infinite}
    @keyframes roll{0%{transform:translateY(0)}100%{transform:translateY(-480px)}}

    .grain{animation:flick .5s steps(2,end) infinite}
    @keyframes flick{0%{opacity:.055}100%{opacity:.085}}

    ${por ? por.css : ''}

    @media (prefers-reduced-motion: reduce){
      .wm path,.lbT,.lbB,.rule,.fadeup,.line,.clip,.swp,.grain,.ff,.rec,.curbar,.nameglow{animation:none!important}
      .wm path{stroke-dashoffset:0}
      .line{opacity:0}.ln0{opacity:1}
      .swp{opacity:0}
      .px{animation:none!important;opacity:1;transform:none}
    }
  </style>
</defs>

<rect width="${W}" height="${H}" fill="url(#bgg)"/>
<rect width="${W}" height="${H}" fill="url(#wash)"/>
<g mask="url(#gridmask)"><rect width="${W}" height="${H}" fill="url(#grid)"/></g>
<rect width="${W}" height="${H}" fill="url(#scan)"/>

<g stroke="${C.bone}" stroke-opacity=".26" stroke-width="1.5" fill="none" class="fadeup d1">
  <path d="M34 100 V84 H50"/><path d="M1166 100 V84 H1150"/>
  <path d="M34 376 V392 H50"/><path d="M1166 376 V392 H1150"/>
</g>

${por ? `${por.svg}
<g class="fadeup d3">
  <text class="mono dim" x="${por.left.toFixed(0)}" y="${(148 - 22).toFixed(0)}" font-size="9.5" letter-spacing="2.6">SUBJECT 01</text>
  <rect x="${por.left.toFixed(0)}" y="${(148 - 16).toFixed(0)}" width="26" height="1" fill="${C.accent}" opacity=".7"/>
</g>` : ''}

<g class="fadeup d1">
  <text class="mono accent" x="${por ? TX : MID}" y="${por ? 150 : 128}" font-size="12" letter-spacing="6.5"${por ? '' : ' text-anchor="middle"'}>${esc(SITE.kicker)}</text>
</g>

<g class="nameglow">
  <g class="wm" transform="${por ? `translate(${TX},172) scale(0.82)` : 'translate(346,150) scale(0.95)'}"><use href="#wordmark"/></g>
</g>
<g mask="url(#nameMask)" style="mix-blend-mode:screen">
  <g class="swp"><rect x="0" y="140" width="240" height="160" fill="url(#sweep)" opacity=".85"/></g>
</g>

<rect class="rule" x="${por ? TX : 490}" y="308" width="${por ? 200 : 220}" height="2" fill="${C.accent}"/>

${lineSvg}

<rect class="grain" width="${W}" height="${H}" filter="url(#grain)" opacity=".07" style="mix-blend-mode:overlay"/>

<rect class="lb lbT" x="0" y="0" width="${W}" height="58"/>
<rect class="lb lbB" x="0" y="402" width="${W}" height="58"/>

<g class="fadeup d3">
  <circle class="rec" cx="66" cy="434" r="5" fill="${C.accent}"/>
  <text class="mono dim" x="80" y="438" font-size="12" letter-spacing="2.5">REC</text>
  <text class="mono dim" x="128" y="438" font-size="12" letter-spacing="2.5">24FPS &#183; 2.39:1</text>
  <text class="mono dim" x="944" y="438" font-size="12">TC ${now.hhmmss}:</text>
  <g clip-path="url(#tcF)"><g class="ff">${frames}</g></g>
</g>
</svg>`;
}

// ---------------------------------------------------------------- divider
function divider() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 28" width="1000" height="28" role="img" aria-label="">
<defs>
  <linearGradient id="ln" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.accent}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${C.line3}" stop-opacity="1"/>
    <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="pl" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.accent}" stop-opacity="0"/>
    <stop offset="0.55" stop-color="${C.accent}" stop-opacity="1"/>
    <stop offset="1" stop-color="${C.accentHot}" stop-opacity="0"/>
  </linearGradient>
  <style>
    .pulse{animation:run 5.5s cubic-bezier(.45,0,.35,1) infinite}
    @keyframes run{0%{transform:translateX(-260px);opacity:0}8%{opacity:1}
                   62%{transform:translateX(1000px);opacity:1}70%{opacity:0}
                   100%{transform:translateX(1000px);opacity:0}}
    .dot{animation:bl 1.4s ease-in-out infinite}
    @keyframes bl{0%,100%{opacity:.25}50%{opacity:1}}
    @media (prefers-reduced-motion: reduce){.pulse{display:none}.dot{animation:none}}
  </style>
</defs>
<rect x="0" y="13" width="1000" height="1" fill="url(#ln)"/>
<g class="pulse"><rect x="0" y="12.5" width="260" height="2" fill="url(#pl)"/></g>
<circle class="dot" cx="500" cy="14" r="2.5" fill="${C.accent}"/>
</svg>`;
}

mkdirSync('assets', { recursive: true });
writeFileSync('assets/hero.svg', hero());
writeFileSync('assets/divider.svg', divider());
console.log('wrote assets/hero.svg + assets/divider.svg');
