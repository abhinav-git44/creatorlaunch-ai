// Behaviour for the public storefront (/s/:slug) and the editor preview. Loaded as an external
// module so the page can run under a strict Content-Security-Policy (no inline scripts).
import { track } from './analytics.js';

const body = document.body;
const slug = body.dataset.slug || '';
const live = body.dataset.mode === 'public' && slug;

if (live) {
  let viewKey = '';
  try { viewKey = `cl_viewed_${slug}`; } catch { /* ignore */ }
  let seen = false;
  try { seen = sessionStorage.getItem(viewKey) === '1'; sessionStorage.setItem(viewKey, '1'); } catch { /* ignore */ }
  if (!seen) track('storefront_viewed', { slug, meta: { theme: body.dataset.theme } });
}

document.addEventListener('click', (ev) => {
  const cta = ev.target.closest('[data-cta]');
  if (cta) {
    const destination = cta.dataset.cta;
    if (live) track('product_cta_clicked', { slug, meta: { destination, format: cta.dataset.format, position: Number(cta.dataset.position) || 0 } });
    if (destination === 'info') {
      const note = document.getElementById(`note-${cta.dataset.pid}`);
      if (note) {
        const open = note.classList.toggle('show');
        cta.setAttribute('aria-expanded', String(open));
      }
    }
    return;
  }
  const copy = ev.target.closest('[data-copy]');
  if (copy) {
    const url = copy.dataset.copy;
    const done = () => { copy.textContent = 'Link copied ✓'; };
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.share({ url, title: document.title }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(done, () => showUrl(copy, url));
    } else {
      showUrl(copy, url);
    }
  }
});

function showUrl(el, url) {
  const input = document.createElement('input');
  input.value = url;
  input.readOnly = true;
  input.className = 'copy-fallback';
  input.setAttribute('aria-label', 'Store link');
  el.replaceWith(input);
  input.select();
}
