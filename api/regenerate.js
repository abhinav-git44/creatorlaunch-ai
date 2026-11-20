// POST /api/regenerate — regenerate ONE part of a store and return only that part.
// The client sends its current (possibly unsaved) content so the AI sees the creator's edits,
// and merges the returned section itself. Nothing is written here, so a failed regeneration
// can never overwrite saved content.
import { handler, allowMethods, readJson, sendJson, sendError, rateLimit, HttpError, sessionIdFrom } from '../lib/http.js';
import { track } from '../lib/events.js';
import { loadEditableStore } from '../lib/stores.js';
import { db } from '../lib/db.js';
import { generateStorefront, regenerateBio, regenerateProduct, regeneratePrice, tidyTestimonial } from '../lib/ai.js';
import { friendlyLlmError } from '../lib/llm.js';
import { normaliseContent, cleanText, LANGUAGES, ValidationError } from '../public/assets/shared.js';

const TARGETS = ['all', 'bio', 'product', 'price', 'add_product', 'testimonial'];

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  const body = await readJson(req);
  const store = await loadEditableStore(req, body.id);
  await rateLimit(req, 'regenerate', { limit: 30, windowMs: 10 * 60 * 1000 });
  const sessionId = sessionIdFrom(req);

  const target = TARGETS.includes(body.target) ? body.target : null;
  if (!target) return sendError(res, 400, 'Unknown regenerate target.');
  const instruction = cleanText(body.instruction, 200);

  // Tidy a real customer message the creator pasted. Never creates a testimonial from nothing.
  if (target === 'testimonial') {
    const raw = cleanText(body.raw, 1200, { multiline: true });
    if (raw.length < 15) return sendError(res, 422, 'Paste the customer\'s actual message first (at least a sentence), then tap Tidy up.');
    try {
      const result = await tidyTestimonial(raw, { name: cleanText(body.name, 60), language: store.content?.language || store.input?.language });
      await db.logGeneration({ store_id: store.id, kind: 'testimonial_tidy', model: result.model, status: 'ok', latency_ms: result.ms, attempts: result.attempts });
      return sendJson(res, 200, { quote: result.data });
    } catch (err) {
      await db.logGeneration({ store_id: store.id, kind: 'testimonial_tidy', status: 'error', error_code: err.code || 'unknown', latency_ms: err.ms || null });
      if (err.code === 'bad_output') return sendError(res, 422, 'The AI couldn\'t tidy this without changing its meaning. It\'s fine to use the message as it is.');
      const f = friendlyLlmError(err);
      return sendError(res, f.status, f.message);
    }
  }

  let content;
  try {
    content = body.content ? normaliseContent(body.content, { source: 'user' }) : store.content;
  } catch (err) {
    if (err instanceof ValidationError) content = store.content;
    else throw err;
  }
  const language = LANGUAGES[body.language] ? body.language : content.language || store.input.language;
  const tone = ['friendly', 'expert', 'professional'].includes(body.tone) ? body.tone : content.tone || store.input.tone;
  const input = { ...store.input, language, tone };

  const product = body.productId ? content.products.find((p) => p.id === body.productId) : null;
  if ((target === 'product' || target === 'price') && !product) throw new HttpError(404, 'That product no longer exists.');
  if (target === 'add_product' && content.products.length >= 4) throw new HttpError(400, 'A store can have up to 4 products.');

  try {
    let result;
    let payload;
    if (target === 'all') {
      result = await generateStorefront(input, instruction);
      // Keep the creator's own contact links and payment links are product-specific (dropped).
      result.data.content.links = content.links || result.data.content.links;
      payload = { content: result.data.content };
    } else if (target === 'bio') {
      result = await regenerateBio(input, content, instruction);
      payload = { creator: result.data };
    } else if (target === 'product' || target === 'add_product') {
      result = await regenerateProduct(input, content, target === 'product' ? product : null, instruction);
      payload = { product: result.data };
    } else {
      result = await regeneratePrice(input, content, product, instruction);
      payload = { price: result.data, productId: product.id };
    }
    await db.logGeneration({ store_id: store.id, kind: target, model: result.model, status: 'ok', latency_ms: result.ms, attempts: result.attempts });
    await track(['product', 'price', 'add_product'].includes(target) ? 'product_regenerated' : 'store_regenerated', { sessionId, storeId: store.id, meta: { kind: target } });
    await track('generation_completed', { sessionId, storeId: store.id, meta: { kind: target, ms: result.ms, attempts: result.attempts, model: result.model } });
    return sendJson(res, 200, { target, ...payload });
  } catch (err) {
    await db.logGeneration({ store_id: store.id, kind: target, status: 'error', error_code: err.code || 'unknown', latency_ms: err.ms || null });
    await track('generation_failed', { sessionId, storeId: store.id, meta: { kind: target, code: err.code || 'unknown', ms: err.ms || null } });
    const f = friendlyLlmError(err);
    return sendError(res, f.status, `${f.message} Your current version is unchanged.`, { code: err.code || 'unknown' });
  }
});
