// POST   /api/stores/:id/publish — save latest content, pick a unique slug, go live. Idempotent.
// DELETE /api/stores/:id/publish — unpublish (the slug is kept so republishing reuses the link).
import { handler, allowMethods, readJson, sendJson, sendError, getQuery, HttpError } from '../lib/http.js';
import { db, DbError } from '../lib/db.js';
import { loadEditableStore } from '../lib/stores.js';
import { findFreeSlug, checkSlug, slugify } from '../lib/slug.js';
import { normaliseContent, ValidationError } from '../public/assets/shared.js';

function publicUrl(req, slug) {
  const host = process.env.PUBLIC_BASE_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  return `${host.replace(/\/$/, '')}/s/${slug}`;
}

export default handler(async (req, res) => {
  if (!allowMethods(req, res, ['POST', 'DELETE'])) return;
  const { id } = getQuery(req);
  const store = await loadEditableStore(req, id);

  if (req.method === 'DELETE') {
    await db.update(store.id, { status: 'draft' });
    return sendJson(res, 200, { status: 'draft', slug: store.slug });
  }

  const body = await readJson(req);

  // 1. Validate + save the latest content the creator sees.
  let content = store.content;
  if (body.content) {
    try {
      content = normaliseContent(body.content, { source: 'user' });
    } catch (err) {
      if (err instanceof ValidationError) return sendError(res, 422, `Fix this before publishing: ${err.message}.`);
      throw err;
    }
  }
  if (!content.products.length) return sendError(res, 422, 'Add at least one product before publishing.');

  // 2. Work out the slug: requested > existing > generated from handle/name.
  let slug = store.slug;
  if (body.slug) {
    const wanted = slugify(body.slug);
    const problem = checkSlug(wanted);
    if (problem) return sendError(res, 422, problem, { field: 'slug' });
    if (wanted !== store.slug && (await db.slugTaken(wanted, store.id))) {
      const suggestion = await findFreeSlug(wanted, (s) => db.slugTaken(s, store.id));
      return sendError(res, 409, `/${wanted} is taken. How about /${suggestion}?`, { field: 'slug', suggestion });
    }
    slug = wanted;
  }
  if (!slug) {
    slug = await findFreeSlug(store.input.handle || content.creator.displayName, (s) => db.slugTaken(s, store.id));
  }

  // 3. Publish (retry once with a fresh slug if two creators race for the same one).
  const patch = { content, slug, status: 'published', published_at: store.published_at || new Date().toISOString() };
  let updated;
  try {
    updated = await db.update(store.id, patch);
  } catch (err) {
    if (!(err instanceof DbError) || err.code !== 'conflict') throw err;
    if (body.slug) throw new HttpError(409, 'Someone just took that link. Try another.', { field: 'slug' });
    patch.slug = await findFreeSlug(`${slug}-x`, (s) => db.slugTaken(s, store.id));
    updated = await db.update(store.id, patch);
  }

  return sendJson(res, 200, {
    status: 'published',
    slug: updated.slug,
    url: publicUrl(req, updated.slug),
    publishedAt: updated.published_at,
  });
});
