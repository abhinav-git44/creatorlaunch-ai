// Small HTTP helpers that work both on Vercel's Node runtime and in the local dev server.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DbError } from './db.js';

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function sendError(res, status, message, extra = {}) {
  sendJson(res, status, { error: { message, ...extra } });
}

export function getQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  const u = new URL(req.url, 'http://local');
  return Object.fromEntries(u.searchParams.entries());
}

const MAX_BODY = 64 * 1024;

export async function readJson(req, { maxBytes = MAX_BODY } = {}) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const s = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (s.length > maxBytes) throw new HttpError(413, 'Request too large');
    try {
      return s ? JSON.parse(s) : {};
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function allowMethods(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('allow', methods.join(', '));
    sendError(res, 405, 'Method not allowed');
    return false;
  }
  return true;
}

// Wrap a handler so unexpected errors become a clean JSON response, never a stack trace.
export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) return sendError(res, err.status, err.message, err.extra);
      if (err instanceof DbError) {
        console.error('[api] db error', err.code, err.message);
        if (err.code === 'not_configured') return sendError(res, 503, 'Storage isn\'t set up on this server yet.');
        return sendError(res, 503, 'We couldn\'t save right now. Your changes are still on this screen; try again in a moment.');
      }
      console.error('[api] unexpected error', err);
      return sendError(res, 500, 'Something went wrong on our side. Please try again.');
    }
  };
}

// ---------------------------------------------------------------- edit keys
// No accounts in this MVP: whoever has the edit link (store id + secret key) can edit.
// We store only a SHA-256 hash of the key.

export function newEditKey() {
  return randomBytes(24).toString('base64url');
}
export function hashKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}
export function keyMatches(key, hash) {
  if (!key || !hash) return false;
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => UUID_RE.test(String(s || ''));

// ---------------------------------------------------------------- client identity

// Vercel sets x-real-ip to the connecting client; x-forwarded-for's first entry can be supplied
// by the client, so it is only a fallback (local dev).
export function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
}

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Anonymous analytics session id sent by the browser (random UUID, no personal data).
export function sessionIdFrom(req) {
  const s = String(req.headers['x-session-id'] || '');
  return SESSION_RE.test(s) ? s.toLowerCase() : null;
}

// ---------------------------------------------------------------- rate limiting
// Shared across serverless instances via a Postgres counter (supabase/schema.sql →
// hit_rate_limit). If that store is unavailable (e.g. migration not run yet) we fall back to a
// per-instance in-memory counter so the app keeps working. IPs are hashed before storage.

const buckets = new Map();
function memoryHit(key, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
  return hits.length;
}

export async function rateLimit(req, name, { limit, windowMs }) {
  const ipHash = createHash('sha256').update(`rl|${clientIp(req)}`).digest('hex').slice(0, 24);
  const bucket = `${name}:${ipHash}`;
  const windowSeconds = Math.round(windowMs / 1000);
  let hits;
  try {
    const { db } = await import('./db.js');
    hits = await db.hitRateLimit(bucket, windowSeconds);
    if (!Number.isFinite(hits)) throw new Error('bad count');
  } catch {
    hits = memoryHit(bucket, windowMs);
  }
  if (hits > limit) {
    const retryAfter = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
    throw new HttpError(429, `You're going a bit fast. Try again in ${retryAfter} seconds.`, { retryAfter });
  }
}
