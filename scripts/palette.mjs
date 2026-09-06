// The one place the look of this profile is defined.
// Every generated asset imports from here — change the accent once, the whole
// page follows on the next refresh.

export const C = {
  // ink
  bone:  '#f2ede4',
  pt:    '#ded8ce',
  body:  '#a9a5ae',
  dim:   '#8d8a93',
  faint: '#6f6c76',

  // surfaces
  bg0:   '#0b0b0e',
  bg1:   '#0c0c10',
  bg2:   '#08080a',
  bg3:   '#101014',
  panel: '#15151a',
  line:  '#22222a',
  line2: '#2b2b34',
  line3: '#3a3a46',

  // accent — electric azure. cool, high-chroma, reads at a glance on near-black.
  accent:     '#4da3ff',
  accentHot:  '#8cc6ff',
  accentDeep: '#2f7ad1',
  accentDim:  '#1f5896',
  accentDark: '#14304f',
  accentRGB:  '77,163,255',
};

// Sequential ramp for contribution magnitude (empty → hottest).
// One hue, monotonic lightness — the only correct encoding for a magnitude scale.
export const HEAT = [C.panel, C.accentDark, C.accentDim, C.accentDeep, C.accent];

// Categorical slots for the language bar, in fixed order.
// Validated on the #0c0c10 surface: adjacent CVD ΔE 13.2, normal-vision ΔE 16.0,
// all six inside the dark lightness band and above the chroma floor.
// Order is the colourblind-safety mechanism — re-run the validator before reordering.
export const CAT = ['#3f97f5', '#14a89b', '#c98500', '#d55181', '#8b7fe8', '#3fa95f'];

// ---------- shared SVG furniture ----------

export const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const MONO = `font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace`;

export const INK = `.mono{${MONO}}
    .bone{fill:${C.bone}}.accent{fill:${C.accent}}.dim{fill:${C.dim}}.body{fill:${C.body}}`;

export const CHROME = () => `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${C.bone}" fill-opacity="0.05"/></pattern>`;

export const PLATE = (w, h, r = 16) =>
  `<rect width="${w}" height="${h}" rx="${r}" fill="url(#bg)"/>`
+ `<rect width="${w}" height="${h}" rx="${r}" fill="url(#dots)"/>`
+ `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r}" fill="none" stroke="${C.line}"/>`;

// A card header: accent label on the left, dim status on the right, hairline under.
export const HEADER = (label, status, W, PAD = 40) => `<g class="hd">
  <text class="mono accent" x="${PAD}" y="52" font-size="13" letter-spacing="5">${esc(label)}</text>
  <text class="mono dim" x="${W - PAD}" y="52" font-size="12" text-anchor="end">${status}</text>
  <rect x="${PAD}" y="70" width="${W - PAD * 2}" height="1" fill="${C.line}"/>
</g>`;

// Time helpers shared by the live cards.
export const ago = iso => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  const d = Math.floor(m / 1440);
  return d === 1 ? 'yesterday' : `${d}d ago`;
};

export const stamp = (tzOffset = 4) => {
  const t = new Date(Date.now() + tzOffset * 3600e3);
  const p = n => String(n).padStart(2, '0');
  return {
    date: t.toISOString().slice(0, 10),
    hhmm: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`,
    hhmmss: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`,
  };
};
