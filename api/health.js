// GET /api/health — what's configured, without revealing any secret.
import { handler, sendJson } from '../lib/http.js';
import { llmConfig } from '../lib/llm.js';
import { dbMode } from '../lib/db.js';

export default handler(async (_req, res) => {
  const cfg = llmConfig();
  const storage = dbMode();
  const ok = Boolean(cfg.apiKey) && storage !== 'missing';
  sendJson(res, ok ? 200 : 503, {
    ok,
    ai: { configured: Boolean(cfg.apiKey), provider: 'gemini', model: cfg.model },
    storage,
    time: new Date().toISOString(),
  });
});
