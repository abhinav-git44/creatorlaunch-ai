// POST /api/events — browser analytics events (batched, best-effort, de-duplicated).
// Store-scoped editor events are only linked to a store when the caller holds its edit key;
// public storefront events are linked by slug. Views are counted once per session per day.
import { handler, allowMethods, readJson, sendJson, sendError, rateLimit, sessionIdFrom, keyMatches, isUuid } from '../lib/http.js';
import { db } from '../lib/db.js';
import { buildEvent, CLIENT_EVENTS, stableId } from '../lib/events.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  await rateLimit(req, 'events', { limit: 120, windowMs: 10 * 60 * 1000 });
  const body = await readJson(req);
  const list = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
  if (!list.length) return sendError(res, 400, 'No events.');

  const sessionId = sessionIdFrom(req);
  if (!sessionId) return sendError(res, 400, 'Missing session.');

  // Verify edit-key ownership once per store id mentioned in the batch.
  const storeOk = new Map();
  const ownsStore = async (id) => {
    if (!isUuid(id)) return false;
    if (!storeOk.has(id)) {
      const s = await db.get(id).catch(() => null);
      storeOk.set(id, Boolean(s && keyMatches(req.headers['x-edit-key'], s.edit_key_hash)));
    }
    return storeOk.get(id);
  };
  const slugStore = new Map();
  const publishedStoreId = async (slug) => {
    if (!slug || !/^[a-z0-9-]{3,40}$/.test(slug)) return null;
    if (!slugStore.has(slug)) {
      const s = await db.getPublishedBySlug(slug).catch(() => null);
      slugStore.set(slug, s?.id || null);
    }
    return slugStore.get(slug);
  };

  const rows = [];
  const day = new Date().toISOString().slice(0, 10);
  for (const raw of list) {
    if (!raw || !CLIENT_EVENTS.has(raw.name)) continue;
    let id = UUID_RE.test(String(raw.id || '')) ? String(raw.id).toLowerCase() : null;
    if (!id) continue;
    let storeId = null;
    let slug = null;
    if (raw.storeId && (await ownsStore(raw.storeId))) storeId = raw.storeId;
    if (raw.name === 'storefront_viewed' || raw.name === 'product_cta_clicked') {
      slug = raw.slug;
      storeId = await publishedStoreId(slug);
      if (!storeId) continue; // only count real, published stores
      if (raw.name === 'storefront_viewed') id = stableId('view', sessionId, slug, day);
    }
    if (raw.name === 'onboarding_started') id = stableId('onboarding', sessionId);
    const ev = buildEvent(raw.name, { id, sessionId, storeId, slug, meta: raw.meta });
    if (ev) rows.push(ev);
  }
  await db.insertEvents(rows);
  return sendJson(res, 202, { accepted: rows.length });
});
