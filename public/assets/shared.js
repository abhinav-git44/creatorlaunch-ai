// Shared, dependency-free module used by BOTH the browser and the serverless API.
// Holds the content schema, validation, sanitisation, pricing guardrails and input checks,
// so the client and server can never disagree about what a valid storefront is.

export const LANGUAGES = {
  en: 'English',
  hinglish: 'Hinglish',
  hi: 'Hindi',
};

export const AUDIENCE_SIZES = {
  starting: 'Just starting (under 5K)',
  small: '5K – 20K',
  mid: '20K – 100K',
  large: '100K+',
};

// Product formats the AI may choose from. Each has an INR price band used as a
// deterministic guardrail on top of the model's suggestion.
export const FORMATS = {
  ebook: { label: 'Ebook / PDF guide', min: 49, max: 999, unit: '' },
  template_pack: { label: 'Template pack', min: 99, max: 1999, unit: '' },
  recorded_course: { label: 'Recorded course', min: 299, max: 4999, unit: '' },
  cohort_course: { label: 'Live cohort course', min: 999, max: 14999, unit: '' },
  live_webinar: { label: 'Live webinar / workshop', min: 49, max: 999, unit: '' },
  one_on_one_call: { label: '1:1 session', min: 299, max: 4999, unit: '' },
  community: { label: 'Paid community', min: 99, max: 1499, unit: '/month' },
  membership: { label: 'Membership', min: 99, max: 1999, unit: '/month' },
};

export const THEMES = {
  minimal: 'Modern Minimal',
  bold: 'Creator Bold',
  elegant: 'Elegant Premium',
};

export const ACCENTS = {
  indigo: '#5B4BDB',
  coral: '#E4572E',
  emerald: '#0F8A68',
  saffron: '#C97A00',
  rose: '#D6336C',
  ocean: '#1F6FEB',
  plum: '#7A3E9D',
  charcoal: '#2B2B2B',
};

export const LIMITS = {
  displayName: 60,
  headline: 90,
  bio: 450,
  niche: 40,
  title: 80,
  priceRationale: 180,
  shortDescription: 170,
  description: 650,
  benefit: 100,
  ctaLabel: 32,
  clarifyingQuestion: 220,
};

export const MAX_PRICE = 100000;

// ---------------------------------------------------------------- sanitising

// Strip anything that could become markup or script, collapse whitespace, cap length.
export function cleanText(value, max, { multiline = false } = {}) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  s = s.replace(/<[^>]*>/g, ''); // drop tags
  s = s.replace(/[<>]/g, ''); // drop stray angle brackets
  s = s.replace(/javascript:/gi, '');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (multiline) {
    s = s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/g, ' ');
  }
  s = s.trim();
  if (max && s.length > max) {
    s = s.slice(0, max);
    const lastSpace = s.lastIndexOf(' ');
    if (lastSpace > max * 0.7) s = s.slice(0, lastSpace);
    s = s.replace(/[\s,;:–-]+$/, '') + '…';
  }
  return s;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------- pricing

// Indian price points people are used to seeing on creator products.
const PRICE_POINTS = [
  49, 79, 99, 149, 199, 249, 299, 349, 399, 499, 599, 699, 799, 999, 1199, 1499, 1999,
  2499, 2999, 3499, 3999, 4999, 5999, 6999, 7999, 9999, 11999, 14999, 19999, 24999,
  29999, 39999, 49999,
];

export function snapToPricePoint(n) {
  let best = PRICE_POINTS[0];
  for (const p of PRICE_POINTS) {
    if (Math.abs(p - n) < Math.abs(best - n)) best = p;
  }
  return best;
}

// Guardrail for AI-suggested prices: keep inside the format's band, then snap to a
// familiar price point. Returns { price, adjusted }.
export function guardPrice(rawPrice, format) {
  const band = FORMATS[format] || { min: 49, max: 4999 };
  let n = Number(rawPrice);
  if (!Number.isFinite(n) || n <= 0) n = band.min * 3;
  const clamped = Math.min(Math.max(n, band.min), band.max);
  let snapped = snapToPricePoint(clamped);
  if (snapped < band.min || snapped > band.max) snapped = Math.round(clamped);
  return { price: snapped, adjusted: snapped !== Math.round(n) };
}

export function formatInr(price, format) {
  const n = Number(price) || 0;
  if (n === 0) return 'Free';
  const unit = FORMATS[format]?.unit || '';
  return '₹' + n.toLocaleString('en-IN') + unit;
}

// ---------------------------------------------------------------- ids

export function shortId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// ---------------------------------------------------------------- validation

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}
export { ValidationError };

function requireText(obj, key, max, opts) {
  const v = cleanText(obj?.[key], max, opts);
  if (!v) throw new ValidationError(`Missing ${key}`);
  return v;
}

// Validate + normalise a single product. `source` is 'ai' (apply pricing guardrails)
// or 'user' (respect the creator's own price, only enforce sanity limits).
export function normaliseProduct(p, { source = 'ai' } = {}) {
  if (!p || typeof p !== 'object') throw new ValidationError('Product is not an object');
  const format = FORMATS[p.format] ? p.format : null;
  if (!format) throw new ValidationError(`Unsupported format: ${p.format}`);

  let price;
  let priceAdjusted = false;
  if (source === 'ai') {
    const g = guardPrice(p.priceInr, format);
    price = g.price;
    priceAdjusted = g.adjusted;
  } else {
    const n = Math.round(Number(p.priceInr));
    if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE) {
      throw new ValidationError(`Price must be between 0 and ${MAX_PRICE}`);
    }
    price = n;
  }

  const benefitsRaw = Array.isArray(p.benefits) ? p.benefits : [];
  const benefits = benefitsRaw
    .map((b) => cleanText(b, LIMITS.benefit))
    .filter(Boolean)
    .slice(0, 5);
  if (source === 'ai' && benefits.length < 2) throw new ValidationError('Product needs 2+ benefits');

  return {
    id: typeof p.id === 'string' && /^[a-z0-9]{4,16}$/.test(p.id) ? p.id : shortId(),
    title: requireText(p, 'title', LIMITS.title),
    format,
    priceInr: price,
    priceRationale: cleanText(p.priceRationale, LIMITS.priceRationale),
    shortDescription: requireText(p, 'shortDescription', LIMITS.shortDescription),
    description: cleanText(p.description, LIMITS.description, { multiline: true }),
    benefits,
    ctaLabel: cleanText(p.ctaLabel, LIMITS.ctaLabel) || 'Get it now',
    ...(priceAdjusted ? { priceGuarded: true } : {}),
  };
}

export function normaliseCreator(c) {
  if (!c || typeof c !== 'object') throw new ValidationError('Creator missing');
  return {
    displayName: requireText(c, 'displayName', LIMITS.displayName),
    headline: requireText(c, 'headline', LIMITS.headline),
    bio: requireText(c, 'bio', LIMITS.bio, { multiline: true }),
    niche: cleanText(c.niche, LIMITS.niche),
  };
}

export function normaliseTheme(t) {
  return {
    style: THEMES[t?.style] ? t.style : 'minimal',
    accent: ACCENTS[t?.accent] ? t.accent : 'indigo',
  };
}

// Full storefront content. AI output must have 2–4 products; creator edits may
// go down to 1 (they can delete a product they don't like).
export function normaliseContent(raw, { source = 'ai' } = {}) {
  if (!raw || typeof raw !== 'object') throw new ValidationError('Content is not an object');
  const products = Array.isArray(raw.products) ? raw.products : [];
  const minProducts = source === 'ai' ? 2 : 1;
  if (products.length < minProducts) throw new ValidationError(`Need at least ${minProducts} products`);
  if (products.length > 4) throw new ValidationError('At most 4 products');
  const seen = new Set();
  const normalisedProducts = products.map((p) => {
    const np = normaliseProduct(p, { source });
    if (seen.has(np.id)) np.id = shortId();
    seen.add(np.id);
    return np;
  });
  return {
    creator: normaliseCreator(raw.creator),
    theme: normaliseTheme(raw.theme),
    language: LANGUAGES[raw.language] ? raw.language : 'en',
    products: normalisedProducts,
  };
}

// ---------------------------------------------------------------- input checks

export const HANDLE_RE = /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/;

export function normaliseHandle(raw) {
  let h = String(raw || '').trim();
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '');
  h = h.replace(/^@+/, '').toLowerCase();
  return h;
}

export function checkHandle(raw) {
  const h = normaliseHandle(raw);
  if (!h) return { ok: false, handle: '', message: 'Enter your Instagram username, like @fitwithriya.' };
  if (!HANDLE_RE.test(h)) {
    return {
      ok: false,
      handle: h,
      message: 'That doesn\'t look like an Instagram username. Use letters, numbers, dots or underscores (max 30).',
    };
  }
  return { ok: true, handle: h };
}

const KEYBOARD_RUNS = ['qwert', 'asdfg', 'zxcvb', 'yuiop', 'hjkl', 'sdfgh', 'dfghj', 'fghjk', 'wasd'];

// Cheap first-pass check before spending an LLM call. Deliberately lenient so
// Hinglish ("main fitness coach hu") and Hindi (Devanagari) both pass; the LLM
// does a second, smarter quality check.
export function checkDescription(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return { ok: false, reason: 'empty', message: 'Tell us a little about what you do, so the AI has something to work with.' };
  }
  const words = text.split(/\s+/).filter(Boolean);
  const hasDevanagari = /[ऀ-ॿ]/.test(text);
  const latin = text.toLowerCase().replace(/[^a-z]/g, '');

  if (!hasDevanagari) {
    if (/(.)\1{4,}/.test(latin)) {
      return { ok: false, reason: 'gibberish', message: 'That looks like random keys. Describe what you do in a sentence, like "I teach home workouts to busy moms".' };
    }
    const vowels = (latin.match(/[aeiouy]/g) || []).length;
    if (latin.length >= 6 && vowels / latin.length < 0.18) {
      return { ok: false, reason: 'gibberish', message: 'We couldn\'t make sense of that. Describe what you do in a sentence, like "I teach home workouts to busy moms".' };
    }
    const mash = KEYBOARD_RUNS.some((r) => latin.includes(r));
    if (mash && words.length < 4) {
      return { ok: false, reason: 'gibberish', message: 'That looks like random keys. Describe what you do in a sentence, like "I teach home workouts to busy moms".' };
    }
  }
  if (words.length < 3 || text.length < 12) {
    return {
      ok: false,
      reason: 'too_short',
      message: 'Add a little more detail: what you do, and who you help. For example: "Yoga teacher helping desk workers fix back pain".',
    };
  }
  return { ok: true };
}

// Validate the onboarding payload (shared by the form and /api/generate).
export function checkCreatorInput(input) {
  const errors = {};
  const out = {
    mode: input?.mode === 'instagram' ? 'instagram' : 'describe',
    name: cleanText(input?.name, LIMITS.displayName),
    handle: '',
    description: cleanText(input?.description, 600, { multiline: true }),
    niche: cleanText(input?.niche, LIMITS.niche),
    audienceSize: AUDIENCE_SIZES[input?.audienceSize] ? input.audienceSize : '',
    language: LANGUAGES[input?.language] ? input.language : 'en',
  };
  if (out.mode === 'instagram' || input?.handle) {
    const h = checkHandle(input?.handle);
    if (!h.ok && out.mode === 'instagram') errors.handle = h.message;
    if (h.ok) out.handle = h.handle;
  }
  const d = checkDescription(out.description);
  if (!d.ok) errors.description = d.message;
  if (!out.name && !out.handle) errors.name = 'Add your name (or your Instagram username) so we can put it on your store.';
  return { ok: Object.keys(errors).length === 0, errors, value: out };
}
