// POST /api/stores/:id/cover — draw a cover image with AI from the creator's own description
// ("What do you do, and who do you help?"), name and niche. Needs x-edit-key.
// Returns the image to the browser, which crops/compresses it and uploads it like any other
// cover (POST /api/stores/:id/assets), so the creator can look at it before keeping it.
import { handler, allowMethods, readJson, sendJson, sendError, getQuery, rateLimit, sessionIdFrom } from '../lib/http.js';
import { db } from '../lib/db.js';
import { loadEditableStore } from '../lib/stores.js';
import { generateImage, generateValidated, imageModelsDown, friendlyLlmError } from '../lib/llm.js';
import { COVER_DESIGN_SCHEMA, coverDesignPrompt, validateCoverDesign, renderCoverSvg } from '../lib/cover-design.js';
import { coverPrompt } from '../lib/prompts.js';
import { track } from '../lib/events.js';
import { normaliseContent } from '../public/assets/shared.js';

function friendlyCoverError(err) {
  if (err?.code === 'blocked') return { status: 422, message: 'The AI couldn\'t draw a cover for this topic. Upload your own image instead.' };
  if (err?.code === 'timeout') return { status: 504, message: 'Drawing your cover took too long. Tap Generate again, or upload your own image.' };
  if (err?.code === 'rate_limited' || err?.code === 'unavailable') return { status: 503, message: 'AI cover images aren\'t available right now. Upload your own image, or try again in a minute.' };
  return friendlyLlmError(err);
}

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  const { id } = getQuery(req);
  const store = await loadEditableStore(req, id);
  await rateLimit(req, 'cover', { limit: 5, windowMs: 10 * 60 * 1000 });
  const body = await readJson(req);
  let content = store.content;
  try { if (body.content) content = normaliseContent(body.content, { source: 'user' }); } catch { /* fall back to the saved store */ }

  const about = String(store.input?.description || store.input?.profileNotes || content?.creator?.bio || '').trim();
  if (about.length < 10) return sendError(res, 422, 'Add a line about what you do and who you help, then try again.');

  const sessionId = sessionIdFrom(req);
  const started = Date.now();
  let photoErr = null;
  // 1) A drawn, photo-style cover from a Gemini image model (needs a key with image quota).
  if (!imageModelsDown()) {
    try {
      const img = await generateImage({ prompt: coverPrompt(store.input || {}, content), aspectRatio: '21:9' });
      await db.logGeneration({ store_id: store.id, kind: 'cover', model: img.model, status: 'ok', latency_ms: img.ms, attempts: 1 });
      await track('cover_generated', { sessionId, storeId: store.id, meta: { ms: img.ms, model: img.model } });
      return sendJson(res, 200, { image: { mime: img.mime, data: img.data }, model: img.model, style: 'photo' });
    } catch (err) {
      photoErr = err;
      if (err.code === 'not_configured') {
        const f = friendlyCoverError(err);
        return sendError(res, f.status, f.message);
      }
    }
  }
  // 2) Fallback: the text model designs the cover (palette, layout, motif) and we draw it.
  try {
    const out = await generateValidated({
      system: 'You are a brand designer. Answer only with the requested JSON.',
      prompt: coverDesignPrompt(store.input || {}, content),
      schema: COVER_DESIGN_SCHEMA,
      validate: validateCoverDesign,
      attempts: 2,
    });
    const seed = [...String(store.id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) ^ Date.now();
    const svg = renderCoverSvg(out.data, seed);
    const ms = Date.now() - started;
    await db.logGeneration({ store_id: store.id, kind: 'cover_design', model: out.model, status: 'ok', latency_ms: ms, attempts: out.attempts });
    await track('cover_generated', { sessionId, storeId: store.id, meta: { ms, model: `design:${out.model}` } });
    return sendJson(res, 200, { image: { mime: 'image/svg+xml', data: Buffer.from(svg).toString('base64') }, model: out.model, style: 'design', design: out.data });
  } catch (err) {
    const e = photoErr && photoErr.code === 'blocked' ? photoErr : err;
    e.ms = Date.now() - started;
    await db.logGeneration({ store_id: store.id, kind: 'cover', status: 'error', error_code: e.code || 'unknown', latency_ms: e.ms });
    await track('cover_generation_failed', { sessionId, storeId: store.id, meta: { code: e.code || 'unknown', ms: e.ms } });
    const f = friendlyCoverError(e);
    return sendError(res, f.status, f.message);
  }
});
