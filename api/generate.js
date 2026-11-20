// POST /api/generate — creator details (and optionally 1–3 screenshots of their own Instagram
// profile) in, validated storefront content out. Nothing is saved here: the client saves via
// POST /api/stores once the creator accepts the draft. Screenshots are sent to Gemini for this one
// request only; we keep a short text summary of what was read, never the images.
import { handler, allowMethods, readJson, sendJson, sendError, rateLimit, sessionIdFrom } from '../lib/http.js';
import { track } from '../lib/events.js';
import { generateStorefront } from '../lib/ai.js';
import { friendlyLlmError } from '../lib/llm.js';
import { parseImages } from '../lib/images.js';
import { db } from '../lib/db.js';
import { checkCreatorInput, cleanText, HANDLE_RE } from '../public/assets/shared.js';

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  const body = await readJson(req, { maxBytes: 4 * 1024 * 1024 });
  const images = parseImages(body.images);
  // profileNotes can only come from our own reading of screenshots, never from the client.
  const check = checkCreatorInput({ ...(body.input || {}), profileNotes: '' }, { hasScreenshots: images.length > 0 });
  if (!check.ok) return sendError(res, 422, 'Please check your details.', { fields: check.errors });
  const input = { ...check.value, profileNotes: '' }; // profile notes only ever come from our own reading
  delete input.fromScreenshots;

  await rateLimit(req, 'generate', { limit: 10, windowMs: 10 * 60 * 1000 });
  const sessionId = sessionIdFrom(req);
  const kind = images.length ? 'storefront_screenshots' : 'storefront';
  await track('generation_started', { sessionId, meta: { kind, language: input.language } });

  const instruction = cleanText(body.instruction, 200);
  try {
    const result = await generateStorefront(input, instruction, images);
    const { profile } = result.data;
    if (profile) {
      if (!profile.readable) {
        // Couldn't see a profile. Only continue if the creator also described themselves.
        if (!input.description) {
          await track('generation_failed', { sessionId, meta: { kind, code: 'screenshots_unreadable', ms: result.ms } });
          return sendError(res, 422, 'We couldn\'t read an Instagram profile in those screenshots.', {
            code: 'screenshots_unreadable',
            fields: { screenshots: 'Use a clear screenshot of your profile page with the bio visible, or describe yourself below instead.' },
          });
        }
      } else {
        if (profile.handleSeen && HANDLE_RE.test(profile.handleSeen)) {
          if (input.handle && input.handle !== profile.handleSeen) {
            await track('generation_failed', { sessionId, meta: { kind, code: 'handle_mismatch', ms: result.ms } });
            return sendError(res, 422, `These screenshots show @${profile.handleSeen}, but you entered @${input.handle}.`, {
              code: 'handle_mismatch',
              fields: { handle: `The screenshots are of @${profile.handleSeen}. Use screenshots of your own account.` },
            });
          }
          input.handle = profile.handleSeen;
          result.data.content.links.instagram = profile.handleSeen;
        }
        if (!input.audienceSize && profile.audienceSize) input.audienceSize = profile.audienceSize;
        input.profileNotes = profile.summary;
        input.fromScreenshots = true;
      }
    }
    await db.logGeneration({ kind, model: result.model, status: 'ok', latency_ms: result.ms, attempts: result.attempts });
    await track('generation_completed', { sessionId, meta: { kind, ms: result.ms, attempts: result.attempts, model: result.model, products: result.data.content.products.length, quality: result.data.inputQuality } });
    if (result.data.inputQuality === 'needs_more_detail') await track('clarification_requested', { sessionId });
    return sendJson(res, 200, {
      input,
      content: result.data.content,
      inputQuality: result.data.inputQuality,
      clarifyingQuestion: result.data.clarifyingQuestion,
      profileRead: profile ? { readable: profile.readable, handle: profile.handleSeen || null, summary: profile.readable ? profile.summary : '' } : null,
    });
  } catch (err) {
    await db.logGeneration({ kind, model: null, status: 'error', error_code: err.code || 'unknown', latency_ms: err.ms || null });
    await track('generation_failed', { sessionId, meta: { kind, code: err.code || 'unknown', ms: err.ms || null } });
    const f = friendlyLlmError(err);
    return sendError(res, f.status, f.message, { code: err.code || 'unknown', retryable: f.status !== 503 && f.status !== 422 });
  }
});
