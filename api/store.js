// GET   /api/stores/:id  — load a store for editing (needs x-edit-key)
// GET   /api/stores/:id?stats=1 — the creator's own numbers for the dashboard (needs x-edit-key)
// PATCH /api/stores/:id  — autosave edited content (needs x-edit-key)
import { handler, allowMethods, readJson, sendJson, sendError, getQuery } from '../lib/http.js';
import { db } from '../lib/db.js';
import { loadEditableStore, publicStoreView } from '../lib/stores.js';
import { normaliseContent, ValidationError, LANGUAGES } from '../public/assets/shared.js';

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return;
  const { id } = getQuery(req);
  const store = await loadEditableStore(req, id);

  if (req.method === 'GET') {
    if (getQuery(req).stats) return sendJson(res, 200, await storeStats(store));
    return sendJson(res, 200, publicStoreView(store));
  }

  const body = await readJson(req);
  let content;
  try {
    content = normaliseContent(body.content, { source: 'user' });
  } catch (err) {
    if (err instanceof ValidationError) return sendError(res, 422, `Couldn't save: ${err.message}.`);
    throw err;
  }
  const input = { ...store.input, language: LANGUAGES[content.language] ? content.language : store.input.language };
  const updated = await db.update(store.id, { content, input });
  return sendJson(res, 200, { updatedAt: updated.updated_at, content });
});

// Views (one per visitor per day) and buy-button taps on the published page, from the same
// privacy-safe events the admin metrics use. Real counts only; zero until the store is live.
async function storeStats(store) {
  const now = Date.now();
  const since30 = new Date(now - 30 * 864e5).toISOString();
  const since7 = new Date(now - 7 * 864e5).toISOString();
  let rows = [];
  let available = true;
  try { rows = await db.storeEvents(store.id, since30); } catch { available = false; }
  const out = { available, views7: 0, views30: 0, taps7: 0, taps30: 0, tapsByProduct: {}, tapsByDestination: {} };
  for (const r of rows) {
    const recent = r.created_at >= since7;
    if (r.name === 'storefront_viewed') { out.views30 += 1; if (recent) out.views7 += 1; }
    if (r.name === 'product_cta_clicked') {
      out.taps30 += 1; if (recent) out.taps7 += 1;
      const pid = r.meta?.pid;
      if (typeof pid === 'string' && /^[a-z0-9]{4,16}$/.test(pid)) out.tapsByProduct[pid] = (out.tapsByProduct[pid] || 0) + 1;
      const d = r.meta?.destination;
      if (typeof d === 'string') out.tapsByDestination[d] = (out.tapsByDestination[d] || 0) + 1;
    }
  }
  return out;
}
