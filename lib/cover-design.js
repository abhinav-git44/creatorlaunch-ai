// "Designed" AI cover, used when no Gemini image model is available to this API key (e.g. a
// free-tier key with no image quota). The text model reads the creator's description, name and
// niche and picks a palette, a layout and a subject motif; this file draws that as an SVG
// banner (1600×600). No text, no faces, nothing that can impersonate anyone.
import { ACCENTS } from '../public/assets/shared.js';

// Simple 24×24 line icons, one per kind of creator.
export const MOTIFS = {
  paintbrush: 'M14 4l6 6-8.5 8.5a3 3 0 0 1-2.1.9H6v-3.4a3 3 0 0 1 .9-2.1zM12 6l6 6M6 19.4c-1.2 0-2.5-.6-3-1.9 1.5 0 2-1.2 2-2.3',
  dumbbell: 'M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 11h5',
  chart: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7M17 7h3v3',
  leaf: 'M5 19C5 10 11 4 20 4c0 9-6 15-15 15zM5 19l8-8',
  bowl: 'M3 11h18a9 9 0 0 1-18 0zM8 7c0-1.5 1-2 1-3M12 7c0-1.5 1-2 1-3M16 7c0-1.5 1-2 1-3',
  laptop: 'M5 5h14v10H5zM2 19h20M10 9l-2 2 2 2M14 9l2 2-2 2',
  camera: 'M4 7h4l2-3h4l2 3h4v12H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  heart: 'M12 20s-8-4.6-8-10.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8C20 15.4 12 20 12 20z',
  star: 'M12 3l2.6 5.8 6.4.7-4.8 4.3 1.4 6.2L12 16.9 6.4 20l1.4-6.2L3 9.5l6.4-.7z',
  shirt: 'M8 3l4 3 4-3 5 4-3 4-2-1v11H8V10l-2 1-3-4z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  briefcase: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z',
};
export const LAYOUTS = ['waves', 'orbs', 'arcs', 'grid'];

const HEX = /^#[0-9a-fA-F]{6}$/;
const S = (type, extra = {}) => ({ type, ...extra });

export const COVER_DESIGN_SCHEMA = S('OBJECT', {
  properties: {
    background: S('STRING', { description: 'Base background colour, hex like #1E293B' }),
    colors: S('ARRAY', { items: S('STRING'), description: 'Exactly 3 accent colours, hex' }),
    motif: S('STRING', { enum: Object.keys(MOTIFS) }),
    layout: S('STRING', { enum: LAYOUTS }),
    mood: S('STRING', { description: 'Up to 6 words describing the feel' }),
  },
  required: ['background', 'colors', 'motif', 'layout'],
});

export function coverDesignPrompt(input, content) {
  const c = content?.creator || {};
  const about = String(input.description || input.profileNotes || c.bio || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const accent = ACCENTS[content?.theme?.accent] || ACCENTS.indigo;
  return [
    'Design the colour palette and composition for a wide cover banner on this creator\'s online store.',
    `What they do and who they help, in their own words: """${about}"""`,
    `Creator name (context only): ${c.displayName || input.name || ''}`,
    `Niche: ${c.niche || input.niche || 'not given'}`,
    `The store's accent colour is ${accent}; the palette must sit well next to it.`,
    'Pick: a background colour; 3 accent colours that feel like the subject (e.g. watercolour → soft washes; fitness → energetic; finance → calm, trustworthy);',
    `the motif that best represents what they teach (${Object.keys(MOTIFS).join(', ')}); and a layout (${LAYOUTS.join(', ')}).`,
    'Keep it premium and calm, with enough contrast for white line art on top.',
  ].join('\n');
}

export function validateCoverDesign(raw) {
  const background = HEX.test(raw?.background) ? raw.background : null;
  const colors = Array.isArray(raw?.colors) ? raw.colors.filter((x) => HEX.test(x)).slice(0, 3) : [];
  if (!background || colors.length < 2) throw new Error('bad palette');
  while (colors.length < 3) colors.push(colors[0]);
  return {
    background,
    colors,
    motif: MOTIFS[raw.motif] ? raw.motif : 'sparkle',
    layout: LAYOUTS.includes(raw.layout) ? raw.layout : 'orbs',
    mood: String(raw.mood || '').slice(0, 60),
  };
}

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// Seeded random so the same design always draws the same picture.
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
}

export function renderCoverSvg(d, seed = 7) {
  const W = 1600; const H = 600;
  const [c1, c2, c3] = d.colors;
  const light = lum(d.background) > 0.45;
  const line = light ? 'rgba(20,20,30,.78)' : 'rgba(255,255,255,.88)';
  const faint = light ? 'rgba(20,20,30,.16)' : 'rgba(255,255,255,.16)';
  const r = rng(seed);
  const icon = MOTIFS[d.motif];
  const parts = [];

  // soft colour fields (blurred) – the base of every layout
  const orbs = d.layout === 'orbs' ? 5 : 3;
  for (let i = 0; i < orbs; i++) {
    const col = [c1, c2, c3][i % 3];
    const cx = Math.round(W * (0.35 + 0.6 * r()));
    const cy = Math.round(H * (0.1 + 0.8 * r()));
    const rad = Math.round(170 + 200 * r());
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${col}" opacity="${(0.55 + 0.3 * r()).toFixed(2)}" filter="url(#b)"/>`);
  }
  if (d.layout === 'waves') {
    for (let i = 0; i < 4; i++) {
      const y = 330 + i * 46; const a = 40 + i * 10;
      parts.push(`<path d="M-20 ${y} C 300 ${y - a}, 600 ${y + a}, 900 ${y} S 1400 ${y - a}, 1640 ${y}" fill="none" stroke="${[c1, c2, c3][i % 3]}" stroke-width="${10 - i * 2}" opacity=".55" stroke-linecap="round"/>`);
    }
  } else if (d.layout === 'arcs') {
    for (let i = 0; i < 5; i++) parts.push(`<circle cx="1320" cy="300" r="${120 + i * 70}" fill="none" stroke="${faint}" stroke-width="2"/>`);
  } else if (d.layout === 'grid') {
    for (let x = 820; x <= 1600; x += 60) for (let y = 30; y <= 600; y += 60) parts.push(`<circle cx="${x}" cy="${y}" r="2.4" fill="${faint}"/>`);
  }
  // scattered small motifs (left and top, away from the lower middle where the avatar sits)
  for (let i = 0; i < 7; i++) {
    const x = Math.round(60 + r() * 640); const y = Math.round(40 + r() * 220);
    const s = (1.6 + r() * 1.6).toFixed(2); const rot = Math.round(-25 + 50 * r());
    parts.push(`<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" opacity=".22"><path d="${icon}" fill="none" stroke="${line}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  }
  // hero motif on the right
  parts.push(`<g transform="translate(1180 120) scale(15)"><path d="${icon}" fill="none" stroke="${line}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/></g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${d.background}"/><stop offset="1" stop-color="${d.background}" stop-opacity=".88"/></linearGradient>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="${d.background}"/>
<rect width="${W}" height="${H}" fill="url(#g)"/>
${parts.join('\n')}
</svg>`;
}
