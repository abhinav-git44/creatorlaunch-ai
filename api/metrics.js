// GET /api/metrics?days=30 — internal activation report. Disabled unless METRICS_TOKEN is set;
// requires header x-admin-token. Returns only aggregates, never raw events.
import { timingSafeEqual } from 'node:crypto';
import { handler, allowMethods, sendJson, sendError, getQuery } from '../lib/http.js';
import { db } from '../lib/db.js';
import { computeMetrics } from '../lib/metrics.js';

function tokenOk(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given)); const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  const expected = process.env.METRICS_TOKEN || '';
  if (expected.length < 16) return sendError(res, 404, 'Metrics are not enabled on this deployment.');
  if (!tokenOk(req.headers['x-admin-token'], expected)) return sendError(res, 401, 'Wrong or missing admin token.');
  const days = Math.min(Math.max(parseInt(getQuery(req).days, 10) || 30, 1), 90);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const events = await db.listEvents(from.toISOString());
  return sendJson(res, 200, { generatedAt: to.toISOString(), ...computeMetrics(events, { from: from.toISOString(), to: to.toISOString() }) });
});
