// The storefront template library: one central list, shared by the server (validation, rendering,
// the AI prompt), the editor and the home page gallery. Ids are stable and stored in
// content.theme.style, so existing stores keep their look (minimal / bold / elegant were the
// original three). All templates are free. Their CSS lives in render.js, keyed by the same ids.
//
// Each template has:
//   backgrounds – the page backgrounds that suit its design. Each sets the page colour, text
//                 colours and card surface, so dark and light variants both stay readable.
//   fonts       – heading typefaces it supports (system fonts only: the public page's security
//                 policy allows no web fonts, and system fonts load instantly on any phone).
//   defaults    – what a store gets when the creator picks the template.

export const FONTS = {
  sans: { label: 'Clean sans', stack: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari",Helvetica,Arial,sans-serif' },
  serif: { label: 'Classic serif', stack: 'Georgia,"Iowan Old Style","Times New Roman","Noto Serif Devanagari",serif' },
  rounded: { label: 'Friendly rounded', stack: 'ui-rounded,"SF Pro Rounded","Nunito","Varela Round","Arial Rounded MT Bold","Noto Sans Devanagari",system-ui,sans-serif' },
  condensed: { label: 'Bold condensed', stack: '"Avenir Next Condensed","Roboto Condensed","Arial Narrow","Noto Sans Devanagari",Arial,sans-serif' },
  mono: { label: 'Typewriter mono', stack: 'ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,"Noto Sans Devanagari",monospace' },
};

// bg: page, surface: cards, ink: main text, muted: secondary text, line: borders, dark: true if light text.
const bg = (label, page, surface, ink, muted, line, dark = false) => ({ label, page, surface, ink, muted, line, dark });

export const TEMPLATES = {
  minimal: {
    name: 'Modern Minimal',
    audience: 'Professional creators and consultants',
    description: 'A centred profile and a calm card grid. Nothing competes with your offers.',
    categories: ['minimal', 'professional'],
    backgrounds: {
      mist: bg('Mist', '#F6F7F9', '#FFFFFF', '#15161A', '#4A4D57', '#E7E8EC'),
      white: bg('White', '#FFFFFF', '#F7F8FA', '#15161A', '#4A4D57', '#E4E6EB'),
      sand: bg('Sand', '#F7F3EC', '#FFFFFF', '#1B1814', '#55504A', '#E8E1D5'),
    },
    fonts: ['sans', 'serif', 'rounded'],
    defaults: { accent: 'indigo', background: 'mist', font: 'sans' },
  },
  bold: {
    name: 'Creator Bold',
    audience: 'Influencers, comedians and entertainers',
    description: 'A full-colour header, sticker prices and chunky cards with offset shadows.',
    categories: ['creative'],
    backgrounds: {
      cream: bg('Cream', '#FFFBF5', '#FFFFFF', '#111111', '#333333', '#111111'),
      lemon: bg('Lemon', '#FFF7D6', '#FFFFFF', '#111111', '#333333', '#111111'),
      white: bg('White', '#FFFFFF', '#FFFFFF', '#111111', '#333333', '#111111'),
    },
    fonts: ['sans', 'rounded', 'condensed'],
    defaults: { accent: 'coral', background: 'cream', font: 'sans' },
  },
  elegant: {
    name: 'Elegant Premium',
    audience: 'Coaches, authors and premium experts',
    description: 'Editorial and quiet: serif type, hairline rules and numbered offers.',
    categories: ['premium'],
    backgrounds: {
      linen: bg('Linen', '#F6F1E9', '#F6F1E9', '#2A2420', '#5A4E44', '#DDD0BE'),
      ivory: bg('Ivory', '#FBFAF6', '#FBFAF6', '#22201C', '#57524A', '#E3DDD2'),
      stone: bg('Stone', '#EEECE8', '#EEECE8', '#24221F', '#55514B', '#D3CFC7'),
    },
    fonts: ['serif', 'sans'],
    defaults: { accent: 'saffron', background: 'linen', font: 'serif' },
  },
  fitness: {
    name: 'Fitness & Wellness',
    audience: 'Fitness trainers, yoga and nutrition creators',
    description: 'High-energy: a dark split header, condensed headlines and program cards with a colour bar.',
    categories: ['fitness'],
    backgrounds: {
      carbon: bg('Carbon', '#0F1412', '#18201D', '#F2F5F3', '#AEB8B3', '#2A3430', true),
      chalk: bg('Chalk', '#F3F5F2', '#FFFFFF', '#121614', '#4B544F', '#DCE2DE'),
      mint: bg('Mint', '#E9F5EE', '#FFFFFF', '#0F1A14', '#45554C', '#CFE3D7'),
    },
    fonts: ['condensed', 'sans', 'rounded'],
    defaults: { accent: 'emerald', background: 'carbon', font: 'condensed' },
  },
  edupro: {
    name: 'EduPro',
    audience: 'Educators, teachers and course creators',
    description: 'A course catalogue: a clear header strip and course cards with price and button side by side.',
    categories: ['education', 'professional'],
    backgrounds: {
      paper: bg('Paper', '#FFFFFF', '#FFFFFF', '#14213D', '#4A5570', '#E2E7F0'),
      notebook: bg('Notebook', '#FBFAF4', '#FFFFFF', '#1A2238', '#4D566B', '#E4E1D3'),
      sky: bg('Sky', '#EEF4FF', '#FFFFFF', '#13203B', '#45526D', '#D6E2F7'),
    },
    fonts: ['sans', 'rounded', 'serif'],
    defaults: { accent: 'ocean', background: 'paper', font: 'sans' },
  },
  studio: {
    name: 'Creative Studio',
    audience: 'Designers, photographers and artists',
    description: 'Portfolio-style: an oversized name, image-first tiles and understated text links.',
    categories: ['creative'],
    backgrounds: {
      gallery: bg('Gallery white', '#FAFAF7', '#F0EFEA', '#141414', '#5E5E5A', '#DDDCD5'),
      clay: bg('Clay', '#EFE7DD', '#E5DACB', '#1E1915', '#5B5148', '#D4C7B6'),
      ink: bg('Ink', '#121212', '#1D1D1D', '#F4F4F1', '#A9A9A3', '#2E2E2E', true),
    },
    fonts: ['sans', 'serif', 'mono'],
    defaults: { accent: 'charcoal', background: 'gallery', font: 'sans' },
  },
  authority: {
    name: 'Business Authority',
    audience: 'Entrepreneurs and business consultants',
    description: 'Boardroom-clean: a deep header band and offers laid out like a pricing table.',
    categories: ['professional', 'premium'],
    backgrounds: {
      slate: bg('Slate', '#F3F5F8', '#FFFFFF', '#0E1A2B', '#4A5668', '#DCE1E8'),
      white: bg('White', '#FFFFFF', '#F6F8FB', '#0E1A2B', '#4A5668', '#DFE4EB'),
      graphite: bg('Graphite', '#11161E', '#1A212C', '#EEF2F7', '#A7B1BF', '#2A3442', true),
    },
    fonts: ['sans', 'serif'],
    defaults: { accent: 'ocean', background: 'slate', font: 'serif' },
  },
  lifestyle: {
    name: 'Lifestyle & Beauty',
    audience: 'Fashion, beauty and lifestyle creators',
    description: 'Soft and airy: an arched portrait, italic headings and rounded shop cards.',
    categories: ['lifestyle'],
    backgrounds: {
      blush: bg('Blush', '#FBF1EF', '#FFFFFF', '#2B1E1E', '#6A5452', '#F0DCD8'),
      cream: bg('Cream', '#FAF6EE', '#FFFFFF', '#28221A', '#64594B', '#EBE2D2'),
      lilac: bg('Lilac', '#F4F0FA', '#FFFFFF', '#241D30', '#5E5470', '#E2DAEF'),
    },
    fonts: ['serif', 'rounded', 'sans'],
    defaults: { accent: 'rose', background: 'blush', font: 'serif' },
  },
  spotlight: {
    name: 'Creator Spotlight',
    audience: 'Comedians, musicians and speakers',
    description: 'On stage: a spotlit header, a poster-sized name and offers styled as tickets.',
    categories: ['creative'],
    backgrounds: {
      stage: bg('Stage', '#0E0B16', '#1A1526', '#F6F3FF', '#B3ACC8', '#2E2741', true),
      neon: bg('Night blue', '#0A0F1F', '#141B31', '#F1F5FF', '#A9B4D0', '#26304C', true),
      daylight: bg('Daylight', '#FFF8EC', '#FFFFFF', '#1C1408', '#5E5340', '#EADFC9'),
    },
    fonts: ['condensed', 'sans', 'serif'],
    defaults: { accent: 'plum', background: 'stage', font: 'condensed' },
  },
  elite: {
    name: 'Elite Gold',
    audience: 'Premium experts, mentors and high-ticket offers',
    description: 'Dark glassmorphism with gold accents, soft glows and frosted cards.',
    categories: ['premium'],
    backgrounds: {
      onyx: bg('Onyx', '#07080D', 'rgba(255,255,255,.05)', '#F7F4EC', '#B6B0A2', 'rgba(255,214,140,.18)', true),
      midnight: bg('Midnight', '#0A0F1F', 'rgba(255,255,255,.05)', '#F3F4F8', '#AEB3C2', 'rgba(255,214,140,.18)', true),
      espresso: bg('Espresso', '#130E0A', 'rgba(255,255,255,.05)', '#F8F1E7', '#BCAE9D', 'rgba(255,214,140,.18)', true),
    },
    fonts: ['serif', 'sans'],
    defaults: { accent: 'gold', background: 'onyx', font: 'serif' },
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

export const TEMPLATE_CATEGORIES = {
  all: 'All', minimal: 'Minimal', professional: 'Professional', creative: 'Creative',
  education: 'Education', fitness: 'Fitness', lifestyle: 'Lifestyle', premium: 'Premium',
};

// Sections below the header, in the order the creator chose. Products can move but not hide:
// a store with no offers isn't a store.
export const SECTIONS = { products: 'Products', testimonials: 'Testimonials', contact: 'Contact' };
export const DEFAULT_SECTIONS = { order: ['products', 'testimonials', 'contact'], hidden: [] };

export function normaliseSections(s) {
  const order = [];
  for (const k of Array.isArray(s?.order) ? s.order : []) if (SECTIONS[k] && !order.includes(k)) order.push(k);
  for (const k of DEFAULT_SECTIONS.order) if (!order.includes(k)) order.push(k);
  const hidden = (Array.isArray(s?.hidden) ? s.hidden : []).filter((k, i, a) => SECTIONS[k] && k !== 'products' && a.indexOf(k) === i);
  return { order, hidden };
}

// Apply a template to an existing theme: switch the style and take the template's background,
// font and accent. Creator content (profile, products, images, links, testimonials) is never
// touched, and the section order the creator chose is kept.
export function applyTemplate(theme, id) {
  const t = TEMPLATES[id] || TEMPLATES.minimal;
  return { style: TEMPLATES[id] ? id : 'minimal', ...t.defaults, sections: normaliseSections(theme?.sections) };
}

export function matchesFilter(id, { category = 'all', query = '' } = {}) {
  const t = TEMPLATES[id];
  if (!t) return false;
  if (category !== 'all' && !t.categories.includes(category)) return false;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [t.name, t.audience, t.description, ...t.categories.map((c) => TEMPLATE_CATEGORIES[c])].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
