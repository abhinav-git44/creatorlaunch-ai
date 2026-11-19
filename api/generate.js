// POST /api/generate — creator details in, validated storefront content out.
// Does not save anything: the client saves via POST /api/stores once the creator accepts
// the draft, so a "needs more detail" result never creates an abandoned store.
import { handler, allowMethods, readJson, sendJson, sendError, rateLimit, sessionIdFrom } from '../lib/http.js';
import { track } from '../lib/events.js';
import { generateStorefront } from '../lib/ai.js';
import { friendlyLlmError } from '../lib/llm.js';
import { db } from '../lib/db.js';
import { checkCreatorInput, cleanText } from '../public/assets/shared.js';

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  const body = await readJson(req);
  const check = checkCreatorInput(body.input);
  if (!check.ok) return sendError(res, 422, 'Please check your details.', { fields: check.errors });

  await rateLimit(req, 'generate', { limit: 10, windowMs: 10 * 60 * 1000 });
  const sessionId = sessionIdFrom(req);
  await track('generation_started', { sessionId, meta: { kind: 'storefront', language: check.value.language } });

  const instruction = cleanText(body.instruction, 200);
  try {
    const result = await generateStorefront(check.value, instruction);
    await db.logGeneration({ kind: 'storefront', model: result.model, status: 'ok', latency_ms: result.ms, attempts: result.attempts });
    await track('generation_completed', { sessionId, meta: { kind: 'storefront', ms: result.ms, attempts: result.attempts, model: result.model, products: result.data.content.products.length, quality: result.data.inputQuality } });
    if (result.data.inputQuality === 'needs_more_detail') await track('clarification_requested', { sessionId });
    return sendJson(res, 200, {
      input: check.value,
      content: result.data.content,
      inputQuality: result.data.inputQuality,
      clarifyingQuestion: result.data.clarifyingQuestion,
    });
  } catch (err) {
    await db.logGeneration({ kind: 'storefront', model: null, status: 'error', error_code: err.code || 'unknown', latency_ms: err.ms || null });
    await track('generation_failed', { sessionId, meta: { kind: 'storefront', code: err.code || 'unknown', ms: err.ms || null } });
    const f = friendlyLlmError(err);
    return sendError(res, f.status, f.message, { code: err.code || 'unknown', retryable: f.status !== 503 && f.status !== 422 });
  }
});
