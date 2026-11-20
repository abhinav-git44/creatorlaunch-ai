// GET  /api/assets/:id          — serve a profile picture or cover image (public, immutable)
// POST /api/stores/:id/assets   — upload one (needs x-edit-key); returns { id, url }
import { createHash } from 'node:crypto';
import { handler, allowMethods, readJson, sendJson, sendError, getQuery, rateLimit, sessionIdFrom } from '../lib/http.js';
import { db } from '../lib/db.js';
import { loadEditableStore } from '../lib/stores.js';
import { parseAssetUpload, DB_KIND } from '../lib/images.js';
import { track } from '../lib/events.js';
import { ASSET_ID_RE, assetUrl } from '../public/assets/shared.js';

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const q = getQuery(req);

  if (req.method === 'GET') {
    if (!ASSET_ID_RE.test(String(q.id || ''))) return sendError(res, 404, 'Image not found.');
    const row = await db.getAsset(q.id);
    if (!row) return sendError(res, 404, 'Image not found.');
    const bytes = Buffer.from(row.data, 'base64');
    res.statusCode = 200;
    res.setHeader('content-type', row.mime);
    res.setHeader('content-length', String(bytes.length));
    // Content-addressed: the bytes behind an id never change.
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-security-policy', "default-src 'none'; sandbox");
    return res.end(bytes);
  }

  const store = await loadEditableStore(req, q.store);
  await rateLimit(req, 'asset', { limit: 30, windowMs: 10 * 60 * 1000 });
  const body = await readJson(req, { maxBytes: 1.4 * 1024 * 1024 });
  const { kind, mime, bytes, source } = parseAssetUpload(body);
  const id = createHash('sha256').update(store.id).update(':').update(bytes).digest('hex').slice(0, 40);
  await db.insertAsset({ id, store_id: store.id, kind: DB_KIND[kind], source, mime, bytes: bytes.length, data: bytes.toString('base64') });
  await track('image_added', { sessionId: sessionIdFrom(req), storeId: store.id, meta: { kind, source } });
  return sendJson(res, 201, { id, url: assetUrl(id) });
});
