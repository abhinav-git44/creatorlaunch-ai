import { db } from './db.js';
import { HttpError, isUuid, keyMatches } from './http.js';

// Load a store the caller is allowed to edit (store id + matching edit key).
export async function loadEditableStore(req, id) {
  if (!isUuid(id)) throw new HttpError(404, 'We couldn\'t find that store.');
  const key = req.headers['x-edit-key'];
  const store = await db.get(id);
  // Same response for "no such store" and "wrong key", so ids can't be probed.
  if (!store || !keyMatches(key, store.edit_key_hash)) {
    throw new HttpError(404, 'We couldn\'t find that store, or this link is missing its edit key.');
  }
  return store;
}

export function publicStoreView(store) {
  return {
    id: store.id,
    status: store.status,
    slug: store.slug,
    input: store.input,
    content: store.content,
    publishedAt: store.published_at,
    updatedAt: store.updated_at,
  };
}
