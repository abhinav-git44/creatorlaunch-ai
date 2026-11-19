// GET /s/:slug (rewritten to /api/page?slug=…) — the public storefront, server-rendered so it
// loads fast on phones and shows a proper preview card when shared on WhatsApp.
import { handler, getQuery } from '../lib/http.js';
import { db } from '../lib/db.js';
import { renderStorefront, renderNotFound } from '../public/assets/render.js';

function sendHtml(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', cache);
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(html);
}

export default handler(async (req, res) => {
  const { slug } = getQuery(req);
  if (!slug || !/^[a-z0-9-]{3,40}$/.test(slug)) {
    return sendHtml(res, 404, renderNotFound(), 'no-store');
  }
  let store;
  try {
    store = await db.getPublishedBySlug(slug);
  } catch (err) {
    console.error('[page] lookup failed', err.message);
    return sendHtml(res, 503, renderNotFound('We couldn\'t load this store right now.'), 'no-store');
  }
  if (!store) return sendHtml(res, 404, renderNotFound(), 'no-store');

  let html;
  try {
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
    html = renderStorefront(store.content, { handle: store.input?.handle || '', slug: store.slug, baseUrl: baseUrl.replace(/\/$/, '') });
  } catch (err) {
    console.error('[page] render failed for', slug, err.message);
    return sendHtml(res, 500, renderNotFound('This store has a problem we\'re fixing.'), 'no-store');
  }
  // Short CDN cache: edits show up within ~30s, repeat visits stay fast.
  sendHtml(res, 200, html, 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
});
