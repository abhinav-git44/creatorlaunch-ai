// Minimal Gemini client (REST, no SDK) with timeouts, limited retries and typed errors.
// Every response is parsed and passed through a caller-supplied validator before it is
// returned, so unvalidated model output never reaches the browser.

export class LlmError extends Error {
  constructor(code, message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'LlmError';
    this.code = code; // not_configured | timeout | rate_limited | unavailable | bad_output | bad_request | blocked
    this.status = status;
    this.retryable = retryable;
  }
}

export function llmConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    // Used when the primary model is overloaded (503) or rate-limited (429). Set to "none" to disable.
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL === 'none' ? '' : (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash'),
    baseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, ''),
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 25000,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(t);
}

async function callOnce({ system, prompt, schema, temperature, useSchema, model, timeoutMs, images = [] }, cfg) {
  const url = `${cfg.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const generationConfig = { responseMimeType: 'application/json', maxOutputTokens: 4096 };
  if (useSchema) generationConfig.responseSchema = schema;
  // Gemini 3.x ignores (and will later reject) sampling params and thinkingBudget, so only
  // send them to the 2.x models that use them.
  if (/^gemini-2\./.test(model)) generationConfig.temperature = temperature;
  if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  // Gemini 3 Flash models think at MEDIUM by default (Flash-Lite at MINIMAL). Copywriting doesn't
  // need deep reasoning, so ask for MINIMAL to keep latency inside the request budget.
  if (/^gemini-3/.test(model) && !/flash-lite/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
  // The schema also goes in the prompt, so output stays structured even without responseSchema.
  const fullPrompt = `${prompt}\n\nReturn ONLY a JSON object matching this schema:\n${JSON.stringify(schema)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || cfg.timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: fullPrompt }, ...images.map((img) => ({ inlineData: img }))] }],
        generationConfig,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new LlmError('timeout', 'The AI took too long to respond.', { retryable: true });
    const e = new LlmError('unavailable', 'Could not reach the AI service.', { retryable: true });
    e.cause = err;
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new LlmError('rate_limited', 'The AI is busy right now.', { status: 429, retryable: true });
  if (res.status >= 500) throw new LlmError('unavailable', 'The AI service is having trouble.', { status: res.status, retryable: true });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[llm] request rejected', res.status, detail.slice(0, 300));
    if (res.status === 400 && useSchema) {
      // e.g. a newer model rejecting part of the schema: retry once without responseSchema.
      throw new LlmError('bad_request', 'The AI rejected the request format.', { status: 400, retryable: true });
    }
    throw new LlmError('unavailable', 'The AI request was rejected.', { status: res.status, retryable: false });
  }

  const data = await res.json().catch(() => null);
  if (data?.promptFeedback?.blockReason) {
    throw new LlmError('blocked', 'The AI declined this request.', { retryable: false });
  }
  const cand = data?.candidates?.[0];
  if (!cand) throw new LlmError('bad_output', 'The AI returned nothing.', { retryable: true });
  if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
    throw new LlmError('blocked', 'The AI declined this request.', { retryable: false });
  }
  const text = (cand.content?.parts || [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  try {
    return extractJson(text);
  } catch {
    throw new LlmError('bad_output', 'The AI returned malformed output.', { retryable: true });
  }
}

/**
 * Call the model and validate. Retries (max `attempts`) on timeouts, 429/5xx, malformed JSON
 * or output that fails validation. Never returns unvalidated output.
 */
export async function generateValidated({ system, prompt, schema, validate, temperature = 0.8, attempts = 3, images = [] }) {
  const cfg = llmConfig();
  if (!cfg.apiKey) throw new LlmError('not_configured', 'AI is not configured on this server (GEMINI_API_KEY missing).');

  const started = Date.now();
  let lastErr;
  let useSchema = true;
  let model = cfg.model;
  for (let i = 0; i < attempts; i++) {
    try {
      // Each attempt gets the normal timeout, or whatever is left of the ~52s function budget.
      // The fallback gets a shorter cap so a slow fallback can't eat the whole budget.
      const cap = model === cfg.model ? cfg.timeoutMs : Math.min(cfg.timeoutMs, 20000);
      const timeoutMs = Math.min(cap, Math.max(5000, 52000 - (Date.now() - started)));
      const raw = await callOnce({ system, prompt, schema, temperature, useSchema, model, timeoutMs, images }, cfg);
      try {
        return { data: validate(raw), model, attempts: i + 1, ms: Date.now() - started };
      } catch (vErr) {
        console.warn('[llm] validation failed:', vErr.message);
        throw new LlmError('bad_output', 'The AI output did not pass validation.', { retryable: true });
      }
    } catch (err) {
      if (err instanceof LlmError) lastErr = err;
      else { lastErr = new LlmError('unavailable', err.message, { retryable: true }); lastErr.cause = err; }
      if (lastErr.code === 'bad_request') useSchema = false;
      // Provider overloaded or rate-limited: switch to the fallback model for the next attempt.
      // Overloaded, rate-limited or hanging: try the other model next (primary ↔ fallback).
      const overloaded = lastErr.code === 'unavailable' || lastErr.code === 'rate_limited' || lastErr.code === 'timeout';
      if (overloaded && cfg.fallbackModel) {
        const next = model === cfg.model ? cfg.fallbackModel : cfg.model; // alternate primary ↔ fallback
        console.warn('[llm] switching model', JSON.stringify({ from: model, to: next, code: lastErr.code, status: lastErr.status || null }));
        model = next;
      }
      const elapsed = Date.now() - started;
      const budgetLeft = 52000 - elapsed; // stay under the 60s function limit
      if (!lastErr.retryable || i === attempts - 1 || budgetLeft < 8000) break;
      // Back off longer when the provider says it is overloaded.
      await sleep(lastErr.code === 'rate_limited' || lastErr.code === 'unavailable' ? 1200 * (i + 1) : 300);
    }
  }
  lastErr.ms = Date.now() - started;
  // Operational log: error class + message only (never the prompt, the key or creator text).
  console.error('[llm] failed', JSON.stringify({ code: lastErr.code, status: lastErr.status || null, model, ms: lastErr.ms, detail: String(lastErr.cause?.message || lastErr.message).slice(0, 200) }));
  throw lastErr;
}

// Friendly, non-technical message for each failure type, with what the creator can do next.
export function friendlyLlmError(err) {
  switch (err?.code) {
    case 'not_configured':
      return { status: 503, message: 'The AI isn\'t switched on for this site yet. Please try again later.' };
    case 'timeout':
      return { status: 504, message: 'The AI is taking longer than usual. Your details are saved here, so just tap Try again.' };
    case 'rate_limited':
      return { status: 429, message: 'Lots of creators are building right now. Wait a few seconds and tap Try again.' };
    case 'blocked':
      return { status: 422, message: 'The AI couldn\'t write about this topic. Try describing your work a little differently.' };
    case 'bad_output':
      return { status: 502, message: 'The AI gave us something we couldn\'t use. Tap Try again; it usually works the second time.' };
    default:
      return { status: 502, message: 'We couldn\'t reach the AI just now. Tap Try again in a moment.' };
  }
}

// ---------------------------------------------------------------- image generation (AI cover)
// Gemini's native image models answer generateContent with an inlineData image part. Which ones a
// key may use depends on its tier, so we try a short list and remember the first that works.
let workingImageModel = '';
let imageModelsDownUntil = 0; // set when every image model refuses (e.g. a free-tier key with no image quota)
export const imageModelsDown = () => Date.now() < imageModelsDownUntil;
export function imageModels() {
  const fromEnv = (process.env.GEMINI_IMAGE_MODEL || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = fromEnv.length ? fromEnv : ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'];
  return workingImageModel && list.includes(workingImageModel) ? [workingImageModel, ...list.filter((m) => m !== workingImageModel)] : list;
}

async function imageOnce(model, prompt, aspectRatio, timeoutMs, cfg) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new LlmError('timeout', 'The AI took too long to draw your cover.', { retryable: true });
    throw new LlmError('unavailable', 'Could not reach the AI service.', { retryable: true });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    const detail = await res.text().catch(() => '');
    console.warn('[image] 429', model, detail.replace(/\s+/g, ' ').slice(0, 240));
    throw new LlmError('rate_limited', 'The AI is busy right now.', { status: 429, retryable: true });
  }
  if (res.status >= 500) throw new LlmError('unavailable', 'The AI service is having trouble.', { status: res.status, retryable: true });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[image] request rejected', res.status, model, detail.slice(0, 300));
    // 404 = this key can't use that model; 400 = model doesn't accept this config. Try the next one.
    throw new LlmError('unavailable', 'The AI image request was rejected.', { status: res.status, retryable: true });
  }
  const data = await res.json().catch(() => null);
  if (data?.promptFeedback?.blockReason) throw new LlmError('blocked', 'The AI declined this request.');
  const cand = data?.candidates?.[0];
  if (cand?.finishReason && /SAFETY|PROHIBITED|IMAGE_SAFETY|BLOCKLIST/.test(cand.finishReason)) throw new LlmError('blocked', 'The AI declined this request.');
  const part = (cand?.content?.parts || []).find((p) => p.inlineData?.data || p.inline_data?.data);
  const inline = part?.inlineData || part?.inline_data;
  if (!inline) throw new LlmError('bad_output', 'The AI returned no image.', { retryable: true });
  const mime = inline.mimeType || inline.mime_type || 'image/png';
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw new LlmError('bad_output', 'The AI returned an unexpected file.', { retryable: true });
  return { mime, data: inline.data };
}

export async function generateImage({ prompt, aspectRatio = '21:9' }) {
  const cfg = llmConfig();
  if (!cfg.apiKey) throw new LlmError('not_configured', 'AI is not configured on this server (GEMINI_API_KEY missing).');
  const started = Date.now();
  const budget = Number(process.env.IMAGE_BUDGET_MS) || 50000;
  let lastErr;
  for (const model of imageModels()) {
    const left = budget - (Date.now() - started);
    if (left < 6000) break;
    try {
      const img = await imageOnce(model, prompt, aspectRatio, Math.min(left, 40000), cfg);
      workingImageModel = model;
      return { ...img, model, ms: Date.now() - started };
    } catch (err) {
      lastErr = err instanceof LlmError ? err : new LlmError('unavailable', err.message, { retryable: true });
      console.warn('[image] model failed', JSON.stringify({ model, code: lastErr.code, status: lastErr.status || null }));
      if (!lastErr.retryable) break;
    }
  }
  lastErr = lastErr || new LlmError('timeout', 'The AI took too long to draw your cover.', { retryable: true });
  if (lastErr.code === 'rate_limited' || lastErr.code === 'unavailable') imageModelsDownUntil = Date.now() + 10 * 60 * 1000;
  lastErr.ms = Date.now() - started;
  throw lastErr;
}
