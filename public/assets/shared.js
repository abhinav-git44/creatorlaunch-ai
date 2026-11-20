// Shared, dependency-free module used by BOTH the browser and the serverless API.
// Holds the content schema, validation, sanitisation, pricing guardrails and input checks,
// so the client and server can never disagree about what a valid storefront is.

export const LANGUAGES = {
  en: 'English',
  hinglish: 'Hinglish',
  hi: 'Hindi',
};

export const TONES = {
  friendly: 'Friendly',
  expert: 'Expert',
  professional: 'Professional',
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

// All accents meet WCAG AA (≥4.5:1) for white text and on the Elegant theme's cream background.
export const ACCENTS = {
  indigo: '#5B4BDB',
  coral: '#C2410C',
  emerald: '#0B7A5C',
  saffron: '#9C5A00',
  rose: '#BE1E5A',
  ocean: '#1A62D6',
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
  url: 300,
  profileNotes: 700,
  testimonialQuote: 400,
  testimonialName: 60,
  testimonialDetail: 60,
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

// ---------------------------------------------------------------- links

// External links creators add (payment pages, websites). Only absolute http(s) URLs with a
// real hostname; no credentials, no javascript:/data: schemes. Returns '' for empty input and
// throws ValidationError for anything unsafe.
export function cleanUrl(value, label = 'Link') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let u;
  try { u = new URL(withScheme); } catch { throw new ValidationError(`${label} isn't a valid web address`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ValidationError(`${label} must start with https://`);
  if (u.username || u.password) throw new ValidationError(`${label} can't contain a username or password`);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) throw new ValidationError(`${label} needs a real domain, like rzp.io`);
  const out = u.toString();
  if (out.length > LIMITS.url) throw new ValidationError(`${label} is too long`);
  return out;
}

// Indian mobile numbers (10 digits starting 6–9) get the 91 country code; other
// international numbers are accepted as 11–15 digits. Returns digits only, or ''.
export function cleanWhatsapp(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  if (!/^[1-9][0-9]{10,14}$/.test(digits)) throw new ValidationError('WhatsApp number should be a 10-digit Indian mobile number (or include the country code)');
  return digits;
}

export function whatsappLink(number, text) {
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
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

export function typicalRange(format) {
  const f = FORMATS[format];
  if (!f) return '';
  return `₹${f.min.toLocaleString('en-IN')}–₹${f.max.toLocaleString('en-IN')}${f.unit}`;
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

  const title = requireText(p, 'title', LIMITS.title);
  const shortDescription = requireText(p, 'shortDescription', LIMITS.shortDescription);
  const product = {
    id: typeof p.id === 'string' && /^[a-z0-9]{4,16}$/.test(p.id) ? p.id : shortId(),
    title,
    format,
    priceInr: price,
    priceRationale: cleanText(p.priceRationale, LIMITS.priceRationale),
    shortDescription,
    description: cleanText(p.description, LIMITS.description, { multiline: true }),
    benefits,
    ctaLabel: cleanText(p.ctaLabel, LIMITS.ctaLabel) || 'Get it now',
    buyUrl: source === 'user' ? cleanUrl(p.buyUrl, 'Payment link') : '',
    ...(priceAdjusted ? { priceGuarded: true } : {}),
  };
  // Snapshot of what the AI suggested, kept so we can measure how much creators change
  // AI output before publishing (the "material edit" quality metric). Never rendered.
  if (source === 'ai') {
    product.ai = { title, format, priceInr: price, shortDescription };
  } else if (p.ai && typeof p.ai === 'object' && FORMATS[p.ai.format]) {
    product.ai = {
      title: cleanText(p.ai.title, LIMITS.title),
      format: p.ai.format,
      priceInr: Math.max(0, Math.min(MAX_PRICE, Math.round(Number(p.ai.priceInr)) || 0)),
      shortDescription: cleanText(p.ai.shortDescription, LIMITS.shortDescription),
    };
  }
  return product;
}

export function normaliseLinks(l, { strict = true } = {}) {
  const links = { whatsapp: '', instagram: '', website: '' };
  if (!l || typeof l !== 'object') return links;
  const attempt = (fn) => { try { return fn(); } catch (err) { if (strict) throw err; return ''; } };
  links.whatsapp = attempt(() => cleanWhatsapp(l.whatsapp));
  links.website = attempt(() => cleanUrl(l.website, 'Website link'));
  const h = normaliseHandle(l.instagram);
  if (h) {
    if (HANDLE_RE.test(h)) links.instagram = h;
    else if (strict) throw new ValidationError('Instagram username can only use letters, numbers, dots and underscores');
  }
  return links;
}

const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim();

// Profile picture and cover image are stored separately (store_assets) and referenced by id.
// Ids are content hashes, so anything that isn't exactly 40 lowercase hex chars is dropped.
export const ASSET_ID_RE = /^[a-f0-9]{40}$/;
export const cleanAssetId = (v) => (typeof v === 'string' && ASSET_ID_RE.test(v) ? v : '');
export const assetUrl = (id, baseUrl = '') => (ASSET_ID_RE.test(String(id || '')) ? `${baseUrl}/api/assets/${id}` : '');

export function normaliseCreator(c) {
  if (!c || typeof c !== 'object') throw new ValidationError('Creator missing');
  const out = {
    displayName: requireText(c, 'displayName', LIMITS.displayName),
    headline: requireText(c, 'headline', LIMITS.headline),
    bio: requireText(c, 'bio', LIMITS.bio, { multiline: true }),
    niche: cleanText(c.niche, LIMITS.niche),
  };
  const avatar = cleanAssetId(c.avatar);
  const cover = cleanAssetId(c.cover);
  if (avatar) out.avatar = avatar;
  if (cover) { out.cover = cover; if (c.coverAi === true) out.coverAi = true; }
  return out;
}

export function normaliseTheme(t) {
  return {
    style: THEMES[t?.style] ? t.style : 'minimal',
    accent: ACCENTS[t?.accent] ? t.accent : 'indigo',
  };
}

// ---------------------------------------------------------------- testimonials
// Only ever written by the creator (typed in, or a real message they pasted and had AI tidy).
// The AI never invents testimonials, and one shows on the store only once the creator confirms
// it's a real message shared with permission (consent: true).
export const MAX_TESTIMONIALS = 6;
export const TESTIMONIAL_SOURCES = { whatsapp: 'WhatsApp', instagram: 'Instagram', email: 'Email', in_person: 'In person', other: 'Other' };

export function normaliseTestimonials(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const t of list.slice(0, MAX_TESTIMONIALS)) {
    if (!t || typeof t !== 'object') continue;
    const quote = cleanText(t.quote, LIMITS.testimonialQuote, { multiline: true });
    const name = cleanText(t.name, LIMITS.testimonialName);
    if (!quote && !name) continue; // an empty draft
    let id = /^[a-z0-9]{4,16}$/i.test(String(t.id || '')) ? String(t.id) : shortId();
    if (seen.has(id)) id = shortId();
    seen.add(id);
    const item = { id, quote, name, detail: cleanText(t.detail, LIMITS.testimonialDetail) };
    if (TESTIMONIAL_SOURCES[t.source]) item.source = t.source;
    if (t.consent === true) item.consent = true;
    out.push(item);
  }
  return out;
}

// What the public page shows: complete, consented testimonials only.
export const visibleTestimonials = (content) => (content?.testimonials || []).filter((t) => t.consent && t.quote && t.name);

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
  if (source === 'ai') {
    // Reject sets a creator couldn't sell side by side: duplicate ideas or one format repeated.
    const titles = new Set(normalisedProducts.map((p) => normTitle(p.title)));
    if (titles.size < normalisedProducts.length) throw new ValidationError('Duplicate product ideas');
    const formats = new Set(normalisedProducts.map((p) => p.format));
    if (formats.size < 2) throw new ValidationError('All products use the same format');
  }
  return {
    creator: normaliseCreator(raw.creator),
    theme: normaliseTheme(raw.theme),
    language: LANGUAGES[raw.language] ? raw.language : 'en',
    tone: TONES[raw.tone] ? raw.tone : 'friendly',
    links: normaliseLinks(raw.links, { strict: source === 'user' }),
    products: normalisedProducts,
    // AI output never carries testimonials; only the creator's own saves do.
    ...(source === 'user' && Array.isArray(raw.testimonials) ? { testimonials: normaliseTestimonials(raw.testimonials) } : {}),
  };
}

// ---------------------------------------------------------------- AI-quality metric

function tokenSet(s) {
  return new Set(String(s || '').toLowerCase().split(/[^a-z0-9\u0900-\u097f]+/).filter((w) => w.length > 2));
}
function jaccard(a, b) {
  const A = tokenSet(a); const B = tokenSet(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

// A product counts as "materially edited" when, compared with the AI's version, the creator
// changed its title or format, moved its price by more than 10%, or rewrote its one-line pitch
// (word overlap below 60%). Typos and small tweaks don't count.
export function materialEdits(products) {
  let suggested = 0; let edited = 0;
  for (const p of products || []) {
    if (!p.ai) continue;
    suggested++;
    const priceMove = p.ai.priceInr > 0 ? Math.abs(Number(p.priceInr) - p.ai.priceInr) / p.ai.priceInr : (Number(p.priceInr) > 0 ? 1 : 0);
    const changed = normTitle(p.title) !== normTitle(p.ai.title)
      || p.format !== p.ai.format
      || priceMove > 0.10
      || jaccard(p.shortDescription, p.ai.shortDescription) < 0.6;
    if (changed) edited++;
  }
  return { suggested, edited };
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
// opts.hasScreenshots: Instagram screenshots are attached to this request, so the description
// becomes optional (the AI reads the profile instead) but the creator must confirm ownership.
export function checkCreatorInput(input, { hasScreenshots = false } = {}) {
  const errors = {};
  const out = {
    mode: input?.mode === 'instagram' ? 'instagram' : 'describe',
    name: cleanText(input?.name, LIMITS.displayName),
    handle: '',
    description: cleanText(input?.description, 600, { multiline: true }),
    niche: cleanText(input?.niche, LIMITS.niche),
    audienceSize: AUDIENCE_SIZES[input?.audienceSize] ? input.audienceSize : '',
    language: LANGUAGES[input?.language] ? input.language : 'en',
    tone: TONES[input?.tone] ? input.tone : 'friendly',
    // Short text summary of what the AI read in the creator's own profile screenshots (set by the
    // server after reading them; the images themselves are never stored).
    profileNotes: cleanText(input?.profileNotes, LIMITS.profileNotes, { multiline: true }),
  };
  if (out.profileNotes) out.fromScreenshots = true;
  if (out.mode === 'instagram' || input?.handle) {
    const h = checkHandle(input?.handle);
    const handleTyped = String(input?.handle || '').trim() !== '';
    // With screenshots the username can come from the image, so it is only required if typed wrong.
    if (!h.ok && out.mode === 'instagram' && (handleTyped || !hasScreenshots)) errors.handle = h.message;
    if (h.ok) out.handle = h.handle;
  }
  const profileSource = hasScreenshots || Boolean(out.profileNotes);
  if (!profileSource || out.description) {
    const d = checkDescription(out.description);
    // With screenshots, a short extra note is fine; only reject clear gibberish.
    if (!d.ok && (!profileSource || d.reason === 'gibberish')) errors.description = d.message;
  }
  if (hasScreenshots && input?.ownAccount !== true) {
    errors.ownAccount = 'Please confirm these screenshots are of your own Instagram account.';
  }
  if (!out.name && !out.handle && !profileSource) errors.name = 'Add your name (or your Instagram username) so we can put it on your store.';
  return { ok: Object.keys(errors).length === 0, errors, value: out };
}
