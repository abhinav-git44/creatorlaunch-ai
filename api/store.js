// GET   /api/stores/:id  — load a store for editing (needs x-edit-key)
// PATCH /api/stores/:id  — autosave edited content (needs x-edit-key)
import { handler, allowMethods, readJson, sendJson, sendError, getQuery } from '../lib/http.js';
import { db } from '../lib/db.js';
import { loadEditableStore, publicStoreView } from '../lib/stores.js';
import { normaliseContent, ValidationError, LANGUAGES } from '../public/assets/shared.js';

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return;
  const { id } = getQuery(req);
  const store = await loadEditableStore(req, id);

  if (req.method === 'GET') return sendJson(res, 200, publicStoreView(store));

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
