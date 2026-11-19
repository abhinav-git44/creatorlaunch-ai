import { shortId } from '../public/assets/shared.js';

const RESERVED = new Set([
  'api', 'admin', 'edit', 's', 'assets', 'login', 'signup', 'settings', 'help', 'about',
  'store', 'stores', 'new', 'create', 'preview', 'superprofile', 'cosmofeed', 'null', 'undefined',
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function slugify(text) {
  const s = String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');
  return s;
}

export function checkSlug(slug) {
  if (!SLUG_RE.test(slug)) return 'Use 3–40 lowercase letters, numbers or hyphens.';
  if (RESERVED.has(slug)) return 'That link is reserved. Try another.';
  return null;
}

// Pick a free slug: base, base-2 … base-5, then base-<random>.
export async function findFreeSlug(base, isTaken) {
  let root = slugify(base);
  if (!root || root.length < 3 || RESERVED.has(root)) root = root ? `${root}-store` : 'creator-store';
  if (root.length < 3) root = 'creator-store';
  const candidates = [root, `${root}-2`, `${root}-3`, `${root}-4`, `${root}-5`];
  for (const c of candidates) {
    if (!(await isTaken(c))) return c;
  }
  return `${root.slice(0, 30)}-${shortId().slice(0, 5)}`;
}
