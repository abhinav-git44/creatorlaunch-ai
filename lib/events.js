// Privacy-conscious product analytics. Every event has: id (also the de-duplication key),
// name, anonymous session id, optional store id / slug, a small whitelisted metadata object and
// a timestamp. No IPs, user agents, names, descriptions, edit keys or free text are stored.
import { createHash, randomUUID } from 'node:crypto';
import { db } from './db.js';

// name -> allowed metadata keys
export const EVENT_SCHEMA = {
  // client (browser) events
  onboarding_started: ['mode'],
  creator_input_submitted: ['mode', 'language', 'tone', 'niche', 'audienceSize', 'hasHandle'],
  store_edited: ['fields'],
  price_changed: ['format', 'from', 'to'],
  store_previewed: ['device'],
  template_selected: ['template', 'where'],
  store_link_copied: ['where'],
  storefront_viewed: ['theme'],
  product_cta_clicked: ['destination', 'format', 'position'],
  // server events
  generation_started: ['kind', 'language'],
  generation_completed: ['kind', 'ms', 'attempts', 'model', 'products', 'quality'],
  generation_failed: ['kind', 'code', 'ms'],
  clarification_requested: [],
  store_created: ['products', 'language', 'theme'],
  product_regenerated: ['kind'],
  store_regenerated: ['kind'],
  store_published: ['products', 'aiSuggested', 'aiEdited', 'theme', 'hasBuyLink', 'hasWhatsapp', 'onboardingSession', 'republish'],
  store_unpublished: [],
  image_added: ['kind', 'source'],
  cover_generated: ['ms', 'model'],
  cover_generation_failed: ['code', 'ms'],
};

export const CLIENT_EVENTS = new Set([
  'onboarding_started', 'creator_input_submitted', 'store_edited', 'price_changed', 'store_previewed',
  'store_link_copied', 'storefront_viewed', 'product_cta_clicked', 'template_selected',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanMeta(name, meta) {
  const allowed = EVENT_SCHEMA[name] || [];
  const out = {};
  if (!meta || typeof meta !== 'object') return out;
  for (const k of allowed) {
    const v = meta[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.replace(/[^\w\s.:,/-]/g, '').slice(0, 40);
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').map((x) => x.replace(/[^\w.-]/g, '').slice(0, 24)).slice(0, 8);
  }
  return out;
}

// Deterministic id from a natural key, so the same real-world thing is counted once.
export function stableId(...parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

export function buildEvent(name, { id, sessionId = null, storeId = null, slug = null, meta = {} } = {}) {
  if (!EVENT_SCHEMA[name]) return null;
  return {
    id: id || randomUUID(),
    name,
    session_id: sessionId && UUID_RE.test(sessionId) ? sessionId.toLowerCase() : null,
    store_id: storeId && UUID_RE.test(storeId) ? storeId : null,
    slug: slug && /^[a-z0-9-]{3,40}$/.test(slug) ? slug : null,
    meta: cleanMeta(name, meta),
  };
}

// Server-side tracking: best-effort, never throws, never blocks the creator's flow on failure.
export async function track(name, opts) {
  const ev = buildEvent(name, opts);
  if (ev) await db.insertEvents([ev]);
}
