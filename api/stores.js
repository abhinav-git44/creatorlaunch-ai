// POST /api/stores — save an accepted draft. Returns the store id and its secret edit key.
import { handler, allowMethods, readJson, sendJson, sendError, rateLimit, newEditKey, hashKey, sessionIdFrom } from '../lib/http.js';
import { track, stableId } from '../lib/events.js';
import { db } from '../lib/db.js';
import { checkCreatorInput, normaliseContent, ValidationError } from '../public/assets/shared.js';

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  await rateLimit(req, 'create-store', { limit: 20, windowMs: 10 * 60 * 1000 });
  const body = await readJson(req);

  const check = checkCreatorInput(body.input);
  if (!check.ok) return sendError(res, 422, 'Please check your details.', { fields: check.errors });

  let content;
  try {
    content = normaliseContent(body.content, { source: 'user' });
  } catch (err) {
    if (err instanceof ValidationError) return sendError(res, 422, `This storefront isn't complete: ${err.message}.`);
    throw err;
  }

  const editKey = newEditKey();
  const sessionId = sessionIdFrom(req);
  // The onboarding session is kept with the store so "time to first publish" can be measured
  // even if the creator publishes later, in a new session.
  const store = await db.create({ edit_key_hash: hashKey(editKey), input: { ...check.value, sessionId }, content });
  await track('store_created', { id: stableId('created', store.id), sessionId, storeId: store.id, meta: { products: content.products.length, language: content.language, theme: content.theme.style } });
  return sendJson(res, 201, { id: store.id, editKey });
});
