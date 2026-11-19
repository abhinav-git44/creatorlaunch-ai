// POST /api/stores — save an accepted draft. Returns the store id and its secret edit key.
import { handler, allowMethods, readJson, sendJson, sendError, rateLimit, newEditKey, hashKey } from '../lib/http.js';
import { db } from '../lib/db.js';
import { checkCreatorInput, normaliseContent, ValidationError } from '../public/assets/shared.js';

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  rateLimit(req, 'create-store', { limit: 20, windowMs: 10 * 60 * 1000 });
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
  const store = await db.create({ edit_key_hash: hashKey(editKey), input: check.value, content });
  return sendJson(res, 201, { id: store.id, editKey });
});
