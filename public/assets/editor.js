import { api, ApiError, toast, openSheet, askInstruction, confirmSheet, saveEditKey, getEditKey, copyText } from './ui.js';
import { FORMATS, ACCENTS, accentLight, LANGUAGES, TONES, LIMITS, MAX_PRICE, escapeHtml as e, formatInr, typicalRange, cleanUrl, cleanWhatsapp, cleanEmail, normaliseLinks, normaliseTheme, assetUrl, MAX_TESTIMONIALS, TESTIMONIAL_SOURCES, shortId } from './shared.js';
import { TEMPLATES, TEMPLATE_IDS, FONTS, SECTIONS, applyTemplate, normaliseSections } from './templates.js';
import { galleryHtml, mountGallery, thumbUrl } from './gallery.js';
import { track, setEditKey } from './analytics.js';
import { renderStorefront } from './render.js';

const $ = (s, root = document) => root.querySelector(s);
const app = $('#app');

// ---------------------------------------------------------------- state

const id = location.pathname.split('/').filter(Boolean)[1] || '';
const hashKey = new URLSearchParams(location.hash.slice(1)).get('k');
const key = hashKey || getEditKey(id);
if (hashKey) saveEditKey(id, hashKey);
if (key) setEditKey(key);

let store = null; // { id, status, slug, input, content, ... }
let content = null; // working copy the creator edits
let savedJson = ''; // last content the server confirmed
let saveTimer = null;
let saving = false;
let saveFailed = false;
const busy = new Set(); // sections currently regenerating

const clone = (o) => JSON.parse(JSON.stringify(o));
const dirty = () => JSON.stringify(content) !== savedJson;

// ---------------------------------------------------------------- load

async function load() {
  if (!id || !key) return showFatal('This edit link is missing its private key.', 'Open the link you got when you created the store (on the same phone or browser), or start a new store.');
  try {
    store = await api(`/api/stores/${encodeURIComponent(id)}`, { key });
  } catch (err) {
    if (err.status === 404) return showFatal('We couldn\'t find this store.', 'The link may be incomplete, or it was made on another device.');
    return showFatal('We couldn\'t load your store.', err.message, true);
  }
  content = clone(store.content);
  content.links = content.links || { whatsapp: '', instagram: store.input?.handle || '', website: '', email: '' };
  content.tone = content.tone || store.input?.tone || 'friendly';
  content.theme = normaliseTheme(content.theme);
  savedJson = JSON.stringify(content);
  app.setAttribute('aria-busy', 'false');
  $('#bottom-bar').hidden = false;
  $('#publish-top').disabled = false;
  renderAll();
  setStatus();
  updatePreview(true);
  if (sessionStorage.getItem(`cl_welcomed_${id}`) !== '1') {
    toast('Your store is ready. Edit anything, then tap Publish.');
    try { sessionStorage.setItem(`cl_welcomed_${id}`, '1'); } catch { /* ignore */ }
  }
}

function showFatal(title, sub, retry = false) {
  app.setAttribute('aria-busy', 'false');
  app.innerHTML = `<div class="center-state"><h1>${e(title)}</h1><p>${e(sub)}</p>
    <div class="row" style="justify-content:center">${retry ? '<button class="btn btn-primary" id="reload">Try again</button>' : ''}<a class="btn btn-secondary" href="/">Create a new store</a></div></div>`;
  $('#reload')?.addEventListener('click', () => location.reload());
}

// ---------------------------------------------------------------- render

function publishedBar() {
  if (store.status !== 'published' || !store.slug) {
    return `<div class="note"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg><span><strong>Draft, only you can see this</strong>Check the details, then tap Publish to get your link. Bookmark this page to come back and edit; don't share its address.</span></div>`;
  }
  const url = `${location.origin}/s/${store.slug}`;
  return `<div class="published-bar">
    <div class="eyebrow live">● Live</div>
    <a class="url" href="${e(url)}" target="_blank" rel="noopener">${e(url.replace(/^https?:\/\//, ''))}</a>
    <div class="hint">Edits go live automatically, within about 30 seconds.</div>
    <div class="row">
      <button type="button" class="btn btn-secondary" data-action="copy-link">Copy link</button>
      <a class="btn btn-secondary" href="https://wa.me/?text=${encodeURIComponent(`Check out my store: ${url}`)}" target="_blank" rel="noopener">WhatsApp</a>
      <button type="button" class="btn btn-ghost" data-action="unpublish">Unpublish</button>
    </div>
  </div>`;
}

function fieldInput(path, label, value, { max, multiline = false, rows = 3, hint = '' } = {}) {
  const idAttr = `f-${path.replace(/\W/g, '-')}`;
  const control = multiline
    ? `<textarea id="${idAttr}" data-bind="${path}" rows="${rows}" maxlength="${max}">${e(value)}</textarea>`
    : `<input id="${idAttr}" type="text" data-bind="${path}" maxlength="${max}" value="${e(value)}">`;
  return `<div class="field"><label for="${idAttr}">${label}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

// ---------------------------------------------------------------- profile picture + cover

const ICON_SPARK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/></svg>';

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '★';
}

function imagesBlock() {
  const c = content.creator;
  const cover = assetUrl(c.cover);
  const avatar = assetUrl(c.avatar);
  const drawing = busy.has('cover');
  const uploading = (k) => busy.has(`up-${k}`);
  return `<div class="media">
    <div class="field" id="f-cover">
      <span class="label">Cover image <span class="optional">(optional)</span></span>
      <div class="cover-box${drawing ? ' drawing' : ''}">
        ${cover ? `<img src="${e(cover)}" alt="Your cover image">` : ''}
        ${drawing ? '<div class="cover-state"><span class="spin"></span>Creating a cover from what you do… up to 20 seconds</div>'
          : !cover ? '<div class="cover-state">No cover yet. Upload one, or let AI draw one for you.</div>' : ''}
        ${cover && c.coverAi ? '<span class="ai-badge">AI-generated</span>' : ''}
      </div>
      <div class="media-actions">
        <label class="btn btn-secondary" for="cover-file" ${drawing || uploading('cover') ? 'aria-disabled="true"' : ''}>${uploading('cover') ? '<span class="spin"></span>Uploading…' : cover ? 'Replace' : 'Upload cover'}</label>
        <input type="file" id="cover-file" class="sr-only" accept="image/jpeg,image/png,image/webp" data-upload="cover" ${drawing ? 'disabled' : ''}>
        <button type="button" class="btn btn-secondary" data-action="gen-cover" ${drawing || uploading('cover') ? 'disabled' : ''}>${ICON_SPARK}${cover && c.coverAi ? 'Try another' : 'Generate with AI'}</button>
        ${cover && !drawing ? '<button type="button" class="btn btn-ghost" data-action="remove-cover">Remove</button>' : ''}
      </div>
      <p class="hint">A wide image (about 3:1) works best. No image? AI can draw one from your name and what you told us you do and who you help.</p>
    </div>
    <div class="field" id="f-avatar">
      <span class="label">Profile picture <span class="optional">(optional)</span></span>
      <div class="avatar-edit">
        <div class="avatar-box">${avatar ? `<img src="${e(avatar)}" alt="Your profile picture">` : `<span aria-hidden="true">${e(initialsOf(c.displayName))}</span>`}</div>
        <div class="media-actions">
          <label class="btn btn-secondary" for="avatar-file">${uploading('avatar') ? '<span class="spin"></span>Uploading…' : avatar ? 'Change photo' : 'Upload photo'}</label>
          <input type="file" id="avatar-file" class="sr-only" accept="image/jpeg,image/png,image/webp" data-upload="avatar">
          ${avatar ? '<button type="button" class="btn btn-ghost" data-action="remove-avatar">Remove</button>' : ''}
        </div>
      </div>
      <p class="hint">${avatar ? 'Shown in a circle at the top of your store.' : 'Without a photo, your store shows your initials.'} Use a photo you own.</p>
    </div>
  </div>`;
}

// Read an image (File or data URL), centre-crop it to w×h and return JPEG base64. Runs in the
// browser so uploads stay small (avatar ~40 KB, cover ~150 KB) and EXIF location data is dropped.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('unreadable'));
    img.src = src;
  });
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('unreadable'));
    r.readAsDataURL(file);
  });
}
async function cropToJpeg(src, w, h, quality) {
  const img = await loadImage(src);
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale; const sh = h / scale;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}
const SIZES = { avatar: [512, 512, 0.86], cover: [1600, 600, 0.82], product: [1200, 675, 0.82] };

// The preview iframe is sandboxed (no same-origin), so it can't load /api/assets/…; hand it
// data: URLs instead. Freshly uploaded images are cached straight away; older ones are fetched once.
const assetCache = new Map();
function previewAsset(assetId) {
  if (!assetId) return '';
  const hit = assetCache.get(assetId);
  if (typeof hit === 'string') return hit;
  if (!hit) {
    assetCache.set(assetId, fetch(assetUrl(assetId)).then((r) => (r.ok ? r.blob() : null)).then((b) => b && new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(b);
    })).then((url) => { if (url) { assetCache.set(assetId, url); updatePreview(true); } else assetCache.delete(assetId); }).catch(() => assetCache.delete(assetId)));
  }
  return '';
}

async function uploadImage(kind, src, source = 'upload') {
  const [w, h, q] = SIZES[kind];
  const data = await cropToJpeg(src, w, h, q);
  const res = await api(`/api/stores/${encodeURIComponent(id)}/assets`, { method: 'POST', key, timeoutMs: 30000, body: { kind, mime: 'image/jpeg', data, source } });
  assetCache.set(res.id, `data:image/jpeg;base64,${data}`);
  return res.id;
}

function setImage(kind, assetId, { ai = false } = {}) {
  if (assetId) content.creator[kind] = assetId;
  else delete content.creator[kind];
  if (kind === 'cover') { if (assetId && ai) content.creator.coverAi = true; else delete content.creator.coverAi; }
  renderAll(); updatePreview(); scheduleSave();
}
function snapshotImages() {
  const { avatar, cover, coverAi } = content.creator;
  return { avatar, cover, coverAi };
}
function restoreImages(prev) {
  for (const k of ['avatar', 'cover', 'coverAi']) { if (prev[k]) content.creator[k] = prev[k]; else delete content.creator[k]; }
  renderAll(); updatePreview(); scheduleSave();
}

async function onPickProductImage(input) {
  const pid = input.closest('[data-pid]')?.dataset.pid;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !pid) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Use a JPG, PNG or WebP image.', { type: 'error' }); return; }
  if (file.size > 15 * 1024 * 1024) { toast('That image is over 15 MB. Try a smaller one.', { type: 'error' }); return; }
  const section = `up-product-${pid}`;
  if (busy.has(section)) return;
  busy.add(section); renderAll();
  try {
    const assetId = await uploadImage('product', await fileToDataUrl(file));
    busy.delete(section);
    const p = content.products.find((x) => x.id === pid);
    if (!p) { renderAll(); return; } // product deleted while uploading
    const prev = p.cover;
    p.cover = assetId;
    renderAll(); updatePreview(); scheduleSave();
    toast('Product image added.', { action: prev ? () => setProductImage(pid, prev) : undefined });
  } catch (err) {
    busy.delete(section); renderAll();
    toast(err instanceof ApiError ? err.message : 'We couldn\'t read that image. Try another one.', { type: 'error' });
  }
}

function setProductImage(pid, assetId) {
  const p = content.products.find((x) => x.id === pid);
  if (!p) return;
  if (assetId) p.cover = assetId; else delete p.cover;
  renderAll(); updatePreview(); scheduleSave();
}

function removeProductImage(pid) {
  const p = content.products.find((x) => x.id === pid);
  if (!p?.cover) return;
  const prev = p.cover;
  setProductImage(pid, '');
  toast('Product image removed.', { action: () => setProductImage(pid, prev) });
}

async function onPickImage(input) {
  const kind = input.dataset.upload;
  if (kind === 'product') return onPickProductImage(input);
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Use a JPG, PNG or WebP image.', { type: 'error' }); return; }
  if (file.size > 15 * 1024 * 1024) { toast('That image is over 15 MB. Try a smaller one.', { type: 'error' }); return; }
  const section = `up-${kind}`;
  if (busy.has(section)) return;
  busy.add(section); renderAll();
  const prev = snapshotImages();
  try {
    const assetId = await uploadImage(kind, await fileToDataUrl(file));
    busy.delete(section);
    setImage(kind, assetId);
    toast(kind === 'cover' ? 'Cover image added.' : 'Profile picture added.', { action: prev[kind] ? () => restoreImages(prev) : undefined });
  } catch (err) {
    busy.delete(section); renderAll();
    toast(err instanceof ApiError ? err.message : 'We couldn\'t read that image. Try another one.', { type: 'error' });
  }
}

async function generateCover() {
  if (busy.has('cover')) return;
  const prev = snapshotImages();
  await withBusy('cover', async () => {
    const res = await api(`/api/stores/${encodeURIComponent(id)}/cover`, { method: 'POST', key, timeoutMs: 70000, body: { content: validateLocal().length ? undefined : content } });
    const assetId = await uploadImage('cover', `data:${res.image.mime};base64,${res.image.data}`, 'ai');
    content.creator.cover = assetId;
    content.creator.coverAi = true;
    const msg = res.style === 'design' ? 'AI designed a cover from what you do.' : 'AI drew a cover from what you do.';
    toast(`${msg} Keep it, try another, or upload your own.`, { action: () => restoreImages(prev) });
  });
}

function snapshotImagesOf(c) {
  const out = {};
  for (const k of ['avatar', 'cover', 'coverAi']) if (c.creator[k]) out[k] = c.creator[k];
  return out;
}

function removeImage(kind) {
  const prev = snapshotImages();
  setImage(kind, '');
  toast(kind === 'cover' ? 'Cover removed.' : 'Profile picture removed.', { action: () => restoreImages(prev) });
}

function profileCard() {
  const c = content.creator;
  return `<section class="card" id="sec-bio" ${busy.has('bio') ? 'aria-busy="true"' : ''}>
    <div class="card-head"><h2>Your profile</h2>
      <button type="button" class="btn btn-ghost" data-action="regen-bio" ${busy.has('bio') ? 'disabled' : ''}>${busy.has('bio') ? '<span class="spin"></span>Rewriting…' : '↻ Rewrite with AI'}</button>
    </div>
    ${store.input?.profileNotes ? `<div class="profile-read"><b>Built from your Instagram screenshots${store.input.handle ? ` (@${e(store.input.handle)})` : ''}</b>${e(store.input.profileNotes)}</div>` : ''}
    ${imagesBlock()}
    ${fieldInput('creator.displayName', 'Name on your store', c.displayName, { max: LIMITS.displayName })}
    ${fieldInput('creator.headline', 'Headline', c.headline, { max: LIMITS.headline, hint: 'One line on what you help people do.' })}
    ${fieldInput('creator.bio', 'Bio', c.bio, { max: LIMITS.bio, multiline: true, rows: 4 })}
    ${fieldInput('creator.niche', 'Niche tag', c.niche, { max: LIMITS.niche })}
  </section>`;
}

// Optional cover image per product, uploaded by the creator and shown at the top of its card.
function productImageBlock(p) {
  const pid = e(p.id);
  const src = assetUrl(p.cover);
  const uploading = busy.has(`up-product-${p.id}`);
  return `<div class="field" id="pi-${pid}">
    <span class="label">Product image <span class="optional">(optional)</span></span>
    <div class="pimg-box">
      ${src ? `<img src="${e(src)}" alt="Image for ${e(p.title)}">` : '<div class="cover-state">No image yet. A cover makes this product stand out on your store.</div>'}
    </div>
    <div class="media-actions">
      <label class="btn btn-secondary" for="pf-${pid}" ${uploading ? 'aria-disabled="true"' : ''}>${uploading ? '<span class="spin"></span>Uploading…' : src ? 'Replace image' : 'Upload image'}</label>
      <input type="file" id="pf-${pid}" class="sr-only" accept="image/jpeg,image/png,image/webp" data-upload="product" ${uploading ? 'disabled' : ''}>
      ${src && !uploading ? '<button type="button" class="btn btn-ghost" data-action="remove-pimg">Remove</button>' : ''}
    </div>
    <p class="hint">Shown at the top of this product. A wide image (16:9) works best. Use an image you own.</p>
  </div>`;
}

function productCard(p, i) {
  const formats = Object.entries(FORMATS).map(([k, f]) => `<option value="${k}" ${k === p.format ? 'selected' : ''}>${e(f.label)}</option>`).join('');
  const isBusy = busy.has(p.id);
  const unit = FORMATS[p.format]?.unit;
  return `<article class="product ${isBusy ? 'busy' : ''}" data-pid="${e(p.id)}" ${isBusy ? 'aria-busy="true"' : ''}>
    <div class="product-top">
      <span class="product-num">Product ${i + 1}${isBusy ? ' · <span class="spin" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-1px"></span> working…' : ''}</span>
      <span>
        <button type="button" class="btn btn-ghost" data-action="regen-product">↻ New idea</button>
        <button type="button" class="btn btn-danger" data-action="delete-product" aria-label="Delete product ${i + 1}">Delete</button>
      </span>
    </div>
    ${productImageBlock(p)}
    <div class="field"><label for="t-${e(p.id)}">Title</label><input id="t-${e(p.id)}" type="text" data-pf="title" maxlength="${LIMITS.title}" value="${e(p.title)}"></div>
    <div class="field"><label for="fm-${e(p.id)}">Format</label><select id="fm-${e(p.id)}" data-pf="format">${formats}</select></div>
    <div class="field">
      <label for="pr-${e(p.id)}">Price in ₹${unit ? ` <span class="optional">(${unit.replace('/', 'per ')})</span>` : ''}</label>
      <div class="price-row">
        <div class="prefix-input"><span>₹</span><input id="pr-${e(p.id)}" type="number" inputmode="numeric" min="0" max="${MAX_PRICE}" step="1" data-pf="priceInr" value="${e(p.priceInr)}"></div>
        <button type="button" class="btn btn-secondary" data-action="regen-price">↻ Suggest</button>
      </div>
      <div class="hint">Typical for this format: ${e(typicalRange(p.format))}. It's your call.</div>
      ${p.priceRationale ? `<div class="rationale"><b>Why ${e(formatInr(p.priceInr, p.format))}?</b> ${e(p.priceRationale)} <span class="ai-tag">AI suggestion</span></div>` : ''}
    </div>
    <div class="field"><label for="sd-${e(p.id)}">One-line pitch</label><textarea id="sd-${e(p.id)}" data-pf="shortDescription" rows="2" maxlength="${LIMITS.shortDescription}">${e(p.shortDescription)}</textarea></div>
    <div class="field"><label for="bn-${e(p.id)}">What buyers get <span class="optional">(one per line)</span></label><textarea id="bn-${e(p.id)}" data-pf="benefits" rows="3">${e((p.benefits || []).join('\n'))}</textarea></div>
    <details class="more"><summary>More details</summary>
      <div class="field" style="margin-top:10px"><label for="ds-${e(p.id)}">Full description</label><textarea id="ds-${e(p.id)}" data-pf="description" rows="4" maxlength="${LIMITS.description}">${e(p.description)}</textarea></div>
      <div class="field"><label for="cta-${e(p.id)}">Button text</label><input id="cta-${e(p.id)}" type="text" data-pf="ctaLabel" maxlength="${LIMITS.ctaLabel}" value="${e(p.ctaLabel)}"></div>
      <div class="field"><label for="buy-${e(p.id)}">Payment link <span class="optional">(optional)</span></label><input id="buy-${e(p.id)}" type="url" inputmode="url" autocapitalize="off" spellcheck="false" data-pf="buyUrl" maxlength="${LIMITS.url}" placeholder="https://rzp.io/l/… or your SuperProfile link" value="${e(p.buyUrl || '')}"><div class="hint">If set, the button opens this page. Otherwise buyers are sent to your WhatsApp or Instagram.</div></div>
    </details>
  </article>`;
}

function productsCard() {
  const n = content.products.length;
  return `<section class="card" id="sec-products">
    <div class="card-head"><h2>What you'll sell <span class="optional">(${n}/4)</span></h2></div>
    <p class="hint" style="margin:-6px 0 14px">Prices are AI starting points for Indian buyers. Change anything.</p>
    ${content.products.map(productCard).join('')}
    ${n < 4 ? `<button type="button" class="btn btn-secondary btn-block" style="margin-top:14px" data-action="add-product" ${busy.has('add') ? 'disabled' : ''}>${busy.has('add') ? '<span class="spin"></span>Thinking of another idea…' : '+ Suggest another product'}</button>` : ''}
  </section>`;
}

// ---------------------------------------------------------------- testimonials
// Creator-written only. "Tidy up with AI" cleans a real message the creator pasted; it never
// writes one from nothing. A testimonial shows on the store only after the creator ticks consent.

const tidySuggest = new Map(); // testimonial id -> AI-tidied text waiting for "Use this"

function testimonialItem(t, i, n) {
  const tid = e(t.id);
  const live = t.consent && t.quote && t.name;
  const sugg = tidySuggest.get(t.id);
  const tidying = busy.has(`t-${t.id}`);
  const sources = Object.entries(TESTIMONIAL_SOURCES).map(([k, v]) => `<option value="${k}" ${t.source === k ? 'selected' : ''}>${v}</option>`).join('');
  return `<div class="tst" data-tid="${tid}">
    <div class="product-top">
      <span class="product-num">Testimonial ${i + 1} · <span class="${live ? 'tst-live' : 'tst-hidden'}">${live ? 'Shown on your store' : 'Hidden until complete and confirmed'}</span></span>
      <span class="row" style="gap:2px;flex-wrap:nowrap">
        <button type="button" class="btn btn-ghost" data-action="t-up" aria-label="Move testimonial ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn btn-ghost" data-action="t-down" aria-label="Move testimonial ${i + 1} down" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn btn-danger" data-action="t-delete" aria-label="Delete testimonial ${i + 1}">Delete</button>
      </span>
    </div>
    <div class="field">
      <label for="t-quote-${tid}">What they said</label>
      <textarea id="t-quote-${tid}" data-tf="quote" rows="3" maxlength="${LIMITS.testimonialQuote}" placeholder="Paste their real message, e.g. a WhatsApp reply after your class">${e(t.quote)}</textarea>
      <div class="media-actions" style="margin-top:8px">
        <button type="button" class="btn btn-secondary" data-action="t-tidy" ${tidying || !t.quote ? 'disabled' : ''}>${tidying ? '<span class="spin"></span>Tidying…' : `${ICON_SPARK}Tidy up with AI`}</button>
        <span class="hint" style="margin:0">Fixes spelling and trims it. Never adds anything they didn't say.</span>
      </div>
      ${sugg ? `<div class="tidy"><b>AI-tidied version</b><p>${e(sugg)}</p><div class="row"><button type="button" class="btn btn-primary" data-action="t-use">Use this</button><button type="button" class="btn btn-secondary" data-action="t-keep">Keep the original</button></div></div>` : ''}
    </div>
    <div class="t-grid">
      <div class="field"><label for="t-name-${tid}">Their name</label><input id="t-name-${tid}" type="text" data-tf="name" maxlength="${LIMITS.testimonialName}" value="${e(t.name)}" placeholder="e.g. Asha"></div>
      <div class="field"><label for="t-detail-${tid}">Detail <span class="optional">(optional)</span></label><input id="t-detail-${tid}" type="text" data-tf="detail" maxlength="${LIMITS.testimonialDetail}" value="${e(t.detail || '')}" placeholder="e.g. Student, Pune"></div>
    </div>
    <div class="field"><label for="t-source-${tid}">Where it came from <span class="optional">(only you see this)</span></label><select id="t-source-${tid}" data-tf="source"><option value="">Choose…</option>${sources}</select></div>
    <label class="check"><input type="checkbox" id="t-consent-${tid}" data-tf="consent" ${t.consent ? 'checked' : ''}><span>This is a real message from this person, and they're happy for me to show it on my store.</span></label>
  </div>`;
}

function testimonialsCard() {
  const list = content.testimonials || [];
  const n = list.length;
  const first = content.products[0]?.title || 'my class';
  const ask = `Hi! Thank you for joining ${first}. Would you share 2–3 lines about what it was like for you? I'd love to show it on my store page with your first name. No pressure at all!`;
  return `<section class="card" id="sec-testimonials">
    <div class="card-head"><h2>Testimonials <span class="optional">(${n}/${MAX_TESTIMONIALS})</span></h2></div>
    <p class="hint" style="margin:-6px 0 14px">Real words from people you've helped build trust fast. Add them yourself; they appear under your products once you confirm each one.</p>
    ${list.map((t, i) => testimonialItem(t, i, n)).join('')}
    ${!n ? '<div class="note"><span><strong>No testimonials yet</strong>Paste a message a student or client sent you, or ask a few of them for one.</span></div>' : ''}
    <div class="row" style="margin-top:14px">
      ${n < MAX_TESTIMONIALS ? '<button type="button" class="btn btn-secondary" data-action="t-add">+ Add a testimonial</button>' : ''}
      <a class="btn btn-ghost" href="https://wa.me/?text=${encodeURIComponent(ask)}" target="_blank" rel="noopener">Ask for one on WhatsApp</a>
    </div>
  </section>`;
}

function testimonialById(el) {
  const tid = el.closest('[data-tid]')?.dataset.tid;
  const list = content.testimonials || [];
  const idx = list.findIndex((t) => t.id === tid);
  return { tid, idx, list, t: list[idx] };
}

function onTestimonialEdit(target) {
  const { t } = testimonialById(target);
  if (!t) return;
  const f = target.dataset.tf;
  const wasLive = !!(t.consent && t.quote && t.name);
  if (f === 'consent') { if (target.checked) t.consent = true; else delete t.consent; }
  else if (f === 'source') { if (target.value) t.source = target.value; else delete t.source; }
  else t[f] = target.value;
  if (f === 'quote') tidySuggest.delete(t.id);
  const isLive = !!(t.consent && t.quote && t.name);
  scheduleSave(); updatePreview();
  // Update in place (no full re-render) so typing never loses the cursor.
  const item = target.closest('[data-tid]');
  if (f === 'quote') { item.querySelector('.tidy')?.remove(); const b = item.querySelector('[data-action="t-tidy"]'); if (b) b.disabled = !t.quote; }
  if (wasLive !== isLive) {
    const st = item.querySelector('.tst-live, .tst-hidden');
    if (st) { st.className = isLive ? 'tst-live' : 'tst-hidden'; st.textContent = isLive ? 'Shown on your store' : 'Hidden until complete and confirmed'; }
  }
}

function testimonialAction(action, el) {
  if (action === 't-add') {
    content.testimonials = content.testimonials || [];
    if (content.testimonials.length >= MAX_TESTIMONIALS) return;
    const t = { id: shortId(), quote: '', name: '', detail: '' };
    content.testimonials.push(t);
    renderAll();
    document.getElementById(`t-quote-${t.id}`)?.focus();
    return;
  }
  const { idx, list, t } = testimonialById(el);
  if (!t) return;
  if (action === 't-delete') {
    const [removed] = list.splice(idx, 1);
    renderAll(); updatePreview(); scheduleSave();
    if (removed.quote || removed.name) toast('Testimonial deleted.', { action: () => { list.splice(Math.min(idx, list.length), 0, removed); renderAll(); updatePreview(); scheduleSave(); } });
  } else if (action === 't-up' || action === 't-down') {
    const j = action === 't-up' ? idx - 1 : idx + 1;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    renderAll(); updatePreview(); scheduleSave();
  } else if (action === 't-tidy') {
    withBusy(`t-${t.id}`, async () => {
      const res = await regenerate(`t-${t.id}`, { target: 'testimonial', raw: t.quote, name: t.name });
      tidySuggest.set(t.id, res.quote);
    });
  } else if (action === 't-use') {
    const prev = t.quote;
    t.quote = tidySuggest.get(t.id) || t.quote;
    tidySuggest.delete(t.id);
    renderAll(); updatePreview(); scheduleSave();
    toast('Tidied version used.', { action: () => { t.quote = prev; renderAll(); updatePreview(); scheduleSave(); } });
  } else if (action === 't-keep') {
    tidySuggest.delete(t.id);
    renderAll();
  }
}

function linksCard() {
  const l = content.links || {};
  return `<section class="card" id="sec-links">
    <div class="card-head"><h2>Where buyers go</h2></div>
    <p class="hint" style="margin:-6px 0 14px">There's no checkout in this prototype, so tell us how buyers should reach you. Buttons use a product's payment link first, then WhatsApp, then Instagram.</p>
    <div class="field"><label for="l-whatsapp">WhatsApp number <span class="optional">(recommended)</span></label><input id="l-whatsapp" type="tel" inputmode="tel" autocomplete="tel" data-link="whatsapp" maxlength="20" placeholder="98765 43210" value="${e(l.whatsapp ? `+${l.whatsapp}` : '')}"></div>
    <div class="field"><label for="l-instagram">Instagram username</label><div class="prefix-input"><span>@</span><input id="l-instagram" type="text" autocapitalize="off" spellcheck="false" data-link="instagram" maxlength="40" value="${e(l.instagram || '')}"></div></div>
    <div class="field"><label for="l-website">Website or other link <span class="optional">(optional)</span></label><input id="l-website" type="url" inputmode="url" autocapitalize="off" spellcheck="false" data-link="website" maxlength="${LIMITS.url}" placeholder="https://" value="${e(l.website || '')}"></div>
    <div class="field" style="margin-bottom:0"><label for="l-email">Contact email <span class="optional">(optional, shown on your store)</span></label><input id="l-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" data-link="email" maxlength="120" placeholder="you@example.com" value="${e(l.email || '')}"></div>
  </section>`;
}

// ---------------------------------------------------------------- template + look
// Step 1 of the flow: pick one of 10 free templates (or keep the one the AI picked), then
// customise it. Switching only changes content.theme, so profile, products, images, links and
// testimonials are never touched, and every switch can be undone.

function templateCard() {
  const th = content.theme;
  const tpl = TEMPLATES[th.style] || TEMPLATES.minimal;
  const dark = tpl.backgrounds[th.background]?.dark;
  const strip = TEMPLATE_IDS.map((tid) => `<button type="button" class="tpl-mini" data-theme="${tid}" aria-pressed="${th.style === tid}" title="${e(TEMPLATES[tid].name)}"><img src="${thumbUrl(tid)}" alt="" width="390" height="520" loading="lazy"><span>${e(TEMPLATES[tid].name)}</span></button>`).join('');
  const bgs = Object.entries(tpl.backgrounds).map(([k, b]) => `<button type="button" class="bg-opt" data-bg="${k}" aria-pressed="${th.background === k}"><span class="bg-sw" style="background:${b.page};color:${b.ink}">Aa</span>${e(b.label)}</button>`).join('');
  const accents = Object.entries(ACCENTS).map(([k, hex]) => `<button type="button" class="accent-dot" data-accent="${k}" aria-pressed="${th.accent === k}" style="background:${dark ? accentLight(hex) : hex}" aria-label="${k} accent colour"></button>`).join('');
  const fonts = tpl.fonts.map((f) => `<button type="button" data-font="${f}" aria-pressed="${th.font === f}" style="font-family:${e(FONTS[f].stack)}">${e(FONTS[f].label)}</button>`).join('');
  const secs = th.sections.order.map((k, i, a) => {
    const hidden = th.sections.hidden.includes(k);
    return `<li class="sec-row${hidden ? ' off' : ''}" data-sec="${k}">
      <span class="sec-name">${e(SECTIONS[k])}${k === 'products' ? ' <span class="optional">(always shown)</span>' : ''}</span>
      <span class="sec-ctrl">
        <button type="button" class="icon-btn" data-sec-move="up" ${i === 0 ? 'disabled' : ''} aria-label="Move ${e(SECTIONS[k])} up">↑</button>
        <button type="button" class="icon-btn" data-sec-move="down" ${i === a.length - 1 ? 'disabled' : ''} aria-label="Move ${e(SECTIONS[k])} down">↓</button>
        ${k === 'products' ? '' : `<label class="switch"><input type="checkbox" data-sec-toggle ${hidden ? '' : 'checked'}><span>${hidden ? 'Hidden' : 'Shown'}</span></label>`}
      </span></li>`;
  }).join('');
  return `<section class="card" id="sec-template">
    <div class="card-head"><h2>Template <span class="optional">· all 10 free</span></h2>
      <button type="button" class="btn btn-secondary" data-action="browse-templates">Browse all templates</button></div>
    <div class="tpl-current"><img src="${thumbUrl(th.style)}" alt="" width="390" height="520"><div><b>${e(tpl.name)}</b><span>For ${e(tpl.audience.charAt(0).toLowerCase() + tpl.audience.slice(1))}. Switching keeps your profile, products, images and links.</span></div></div>
    <div class="tpl-strip" role="group" aria-label="Switch template">${strip}</div>
    <div class="field" style="margin-top:16px"><span class="label">Background</span><div class="bg-opts" role="group" aria-label="Background">${bgs}</div></div>
    <div class="field"><span class="label">Accent colour</span><div class="accents" role="group" aria-label="Accent colour">${accents}</div></div>
    ${tpl.fonts.length > 1 ? `<div class="field"><span class="label">Heading font</span><div class="segmented wrap-seg" role="group" aria-label="Heading font">${fonts}</div></div>` : ''}
    <div class="field" style="margin-bottom:0"><span class="label">Sections</span>
      <ul class="sec-list">${secs}</ul>
      <p class="hint">Your header (photo, name, headline, bio) always comes first.</p></div>
  </section>`;
}

function setTheme(mutator) {
  mutator(content.theme);
  content.theme.sections = normaliseSections(content.theme.sections);
  renderAll(); updatePreview(); scheduleSave();
}

function switchTemplate(tid) {
  if (!TEMPLATES[tid] || content.theme.style === tid) return;
  const prev = clone(content.theme);
  content.theme = applyTemplate(content.theme, tid);
  track('template_selected', { storeId: id, meta: { template: tid, where: 'editor' } });
  renderAll(); updatePreview(true); scheduleSave();
  toast(`Now using ${TEMPLATES[tid].name}. Your content is unchanged.`, { key: 'template', action: () => { content.theme = prev; renderAll(); updatePreview(); scheduleSave(); } });
}

function openTemplateGallery() {
  openSheet((sheet, close) => {
    sheet.classList.add('sheet-wide');
    sheet.setAttribute('aria-label', 'Choose your storefront template');
    sheet.innerHTML = `<div class="tpv-head"><div><h3>Choose Your Storefront Template</h3><p class="sub">Pick your style. Add your products. Launch your store. Previews use your own profile and products.</p></div>
      <button type="button" class="btn btn-secondary" data-close>Close</button></div>${galleryHtml({ current: content.theme.style, prefix: 'eg' })}`;
    sheet.querySelector('[data-close]').onclick = close;
    mountGallery(sheet.querySelector('[data-gallery]'), {
      onUse: (tid) => { close(); switchTemplate(tid); },
      previewContent: (tid) => ({ ...content, theme: applyTemplate(content.theme, tid) }),
      assetSrc: previewAsset,
    });
  });
}

function lookCard() {
  const langs = Object.entries(LANGUAGES).map(([k, label]) => `<button type="button" data-lang="${k}" aria-pressed="${content.language === k}">${k === 'hi' ? 'हिंदी' : e(label)}</button>`).join('');
  return `<section class="card" id="sec-look">
    <div class="card-head"><h2>Language &amp; voice</h2></div>
    <div class="field" style="margin-bottom:0">
      <span class="label">Language</span>
      <div class="segmented" style="margin-bottom:8px" role="group" aria-label="Language">${langs}</div>
    </div>
    <div class="field" style="margin-top:14px;margin-bottom:0">
      <span class="label">Voice</span>
      <div class="segmented" style="margin-bottom:8px" role="group" aria-label="Voice">${Object.entries(TONES).map(([k, label]) => `<button type="button" data-tone="${k}" aria-pressed="${content.tone === k}">${e(label)}</button>`).join('')}</div>
      <p class="hint" style="margin-top:0">Changing language or voice rewrites your whole store (we'll ask first, and you can undo).</p>
    </div>
  </section>`;
}

function startOverCard() {
  return `<section class="card" id="sec-all">
    <div class="card-head"><h2>Not quite right?</h2></div>
    <p class="hint" style="margin-top:-6px">Get a completely fresh set of ideas, bio and prices. You can undo it.</p>
    <button type="button" class="btn btn-secondary btn-block" data-action="regen-all" ${busy.has('all') ? 'disabled' : ''}>${busy.has('all') ? '<span class="spin"></span>Rebuilding your store…' : '↻ Regenerate the whole store'}</button>
  </section>`;
}

function renderAll() {
  const active = document.activeElement?.id;
  app.innerHTML = publishedBar() + templateCard() + profileCard() + productsCard() + testimonialsCard() + linksCard() + lookCard() + startOverCard();
  if (active) document.getElementById(active)?.focus();
  validateLocal();
}

// ---------------------------------------------------------------- local validation

function validateLocal() {
  const problems = [];
  const mark = (el, bad) => el?.classList.toggle('invalid', bad);
  const c = content.creator;
  for (const [k, label] of [['displayName', 'name'], ['headline', 'headline'], ['bio', 'bio']]) {
    const bad = !String(c[k] || '').trim();
    mark(document.querySelector(`[data-bind="creator.${k}"]`), bad);
    if (bad) problems.push(`Add your ${label}`);
  }
  const l = content.links || {};
  for (const [k, fn, label] of [['whatsapp', (v) => cleanWhatsapp(v), 'WhatsApp number'], ['website', (v) => cleanUrl(v, 'Website link'), 'Website link'], ['email', (v) => cleanEmail(v), 'email']]) {
    let bad = false;
    try { fn(l[k]); } catch (err) { bad = true; problems.push(err.message || `Check your ${label}`); }
    mark(document.querySelector(`[data-link="${k}"]`), bad);
  }
  const igBad = Boolean(l.instagram) && !/^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/.test(String(l.instagram).replace(/^@/, '').toLowerCase());
  mark(document.querySelector('[data-link="instagram"]'), igBad);
  if (igBad) problems.push('Instagram username can only use letters, numbers, dots and underscores');
  content.products.forEach((p, i) => {
    const card = document.querySelector(`[data-pid="${CSS.escape(p.id)}"]`);
    let badUrl = false;
    try { cleanUrl(p.buyUrl, `Product ${i + 1} payment link`); } catch (err) { badUrl = true; problems.push(err.message); }
    mark(card?.querySelector('[data-pf="buyUrl"]'), badUrl);
    const badTitle = !String(p.title || '').trim();
    const badShort = !String(p.shortDescription || '').trim();
    const price = Number(p.priceInr);
    const badPrice = p.priceInr === '' || !Number.isFinite(price) || price < 0 || price > MAX_PRICE || !Number.isInteger(price);
    mark(card?.querySelector('[data-pf="title"]'), badTitle);
    mark(card?.querySelector('[data-pf="shortDescription"]'), badShort);
    mark(card?.querySelector('[data-pf="priceInr"]'), badPrice);
    if (badTitle) problems.push(`Product ${i + 1} needs a title`);
    if (badShort) problems.push(`Product ${i + 1} needs a one-line pitch`);
    if (badPrice) problems.push(`Product ${i + 1} needs a price between ₹0 and ₹${MAX_PRICE.toLocaleString('en-IN')} (whole rupees)`);
  });
  return problems;
}

// ---------------------------------------------------------------- save

function setStatus() {
  const el = $('#save-status');
  el.className = 'save-status';
  if (saving) { el.textContent = 'Saving…'; return; }
  const problems = validateLocal();
  if (problems.length) { el.textContent = `Not saved: ${problems[0]}`; el.classList.add('error'); return; }
  if (saveFailed) { el.innerHTML = 'Not saved · <button class="link-btn" id="retry-save" style="color:inherit">Retry</button>'; el.classList.add('error'); $('#retry-save').onclick = () => save(); return; }
  if (dirty()) { el.textContent = 'Unsaved changes'; return; }
  el.textContent = 'Saved'; el.classList.add('ok');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 900);
  setStatus();
}

async function save() {
  clearTimeout(saveTimer);
  if (saving) { saveTimer = setTimeout(save, 600); return; }
  if (!dirty()) { saveFailed = false; setStatus(); return true; }
  if (validateLocal().length) { setStatus(); return false; }
  saving = true; setStatus();
  const snapshot = JSON.stringify(content);
  const before = savedJson ? JSON.parse(savedJson) : null;
  try {
    await api(`/api/stores/${encodeURIComponent(id)}`, { method: 'PATCH', body: { content: JSON.parse(snapshot) }, key });
    savedJson = snapshot;
    saveFailed = false;
    trackEdits(before, JSON.parse(snapshot));
    return true;
  } catch (err) {
    saveFailed = true;
    if (err.status === 422) toast(err.message, { type: 'error' });
    return false;
  } finally {
    saving = false;
    setStatus();
    if (dirty() && !saveFailed) scheduleSave();
  }
}

// Analytics: which areas changed (no content is sent), and price changes for the pricing metric.
let lastEditEvent = 0;
function trackEdits(before, after) {
  if (!before) return;
  const fields = [];
  if (JSON.stringify(before.creator) !== JSON.stringify(after.creator)) fields.push('profile');
  if (JSON.stringify(before.links) !== JSON.stringify(after.links)) fields.push('links');
  if (JSON.stringify(before.theme) !== JSON.stringify(after.theme)) fields.push('theme');
  const prevById = Object.fromEntries((before.products || []).map((p) => [p.id, p]));
  for (const p of after.products) {
    const q = prevById[p.id];
    if (!q) continue;
    if (Number(q.priceInr) !== Number(p.priceInr)) track('price_changed', { storeId: id, meta: { format: p.format, from: Number(q.priceInr), to: Number(p.priceInr) } });
    if (q.title !== p.title || q.shortDescription !== p.shortDescription || q.description !== p.description || JSON.stringify(q.benefits) !== JSON.stringify(p.benefits) || q.buyUrl !== p.buyUrl) {
      if (!fields.includes('products')) fields.push('products');
    }
  }
  if (fields.length && Date.now() - lastEditEvent > 60000) {
    lastEditEvent = Date.now();
    track('store_edited', { storeId: id, meta: { fields } });
  }
}

window.addEventListener('beforeunload', (ev) => {
  if (dirty() || saving) { ev.preventDefault(); ev.returnValue = ''; }
});

// ---------------------------------------------------------------- preview

let previewTimer = null;
function updatePreview(now = false) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const frames = [$('#preview'), $('#preview-mobile')].filter(Boolean);
    let html;
    try {
      // Half-typed links shouldn't render as broken buttons in the preview.
      const safeUrl = (u) => { try { return cleanUrl(u); } catch { return ''; } };
      const view = { ...content, links: normaliseLinks(content.links, { strict: false }), products: content.products.map((p) => ({ ...p, buyUrl: safeUrl(p.buyUrl) })) };
      html = renderStorefront(view, { handle: store.input?.handle || '', slug: store.slug || '', baseUrl: location.origin, assetSrc: previewAsset, mode: 'preview', published: store.status === 'published' });
    } catch { return; }
    for (const f of frames) {
      if (f.offsetParent === null && f.id === 'preview') continue; // desktop pane hidden on mobile
      let y = 0;
      try { y = f.contentWindow?.scrollY || 0; } catch { /* ignore */ }
      f.onload = () => { try { f.contentWindow.scrollTo(0, y); } catch { /* ignore */ } };
      f.srcdoc = html;
    }
  }, now ? 0 : 350);
}

function openMobilePreview() {
  const overlay = document.createElement('div');
  overlay.className = 'preview-overlay';
  overlay.innerHTML = `<div class="preview-head"><strong>Preview</strong><button type="button" class="btn btn-secondary" data-close>Close</button></div><iframe id="preview-mobile" title="Store preview" sandbox="allow-scripts allow-popups"></iframe>`;
  document.body.appendChild(overlay);
  track('store_previewed', { storeId: id, meta: { device: 'phone' } });
  overlay.querySelector('[data-close]').onclick = () => overlay.remove();
  overlay.querySelector('[data-close]').focus();
  updatePreview(true);
}

// ---------------------------------------------------------------- edits

function onEdit(target) {
  const link = target.dataset.link;
  if (link) content.links = { ...(content.links || {}), [link]: link === 'instagram' ? target.value.trim().replace(/^@/, '') : target.value.trim() };
  const bind = target.dataset.bind;
  if (bind) {
    const [, k] = bind.split('.');
    content.creator[k] = target.value;
  }
  const pf = target.dataset.pf;
  if (pf) {
    const pid = target.closest('[data-pid]')?.dataset.pid;
    const p = content.products.find((x) => x.id === pid);
    if (!p) return;
    if (pf === 'benefits') p.benefits = target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    else if (pf === 'priceInr') {
      p.priceInr = target.value === '' ? '' : Number(target.value);
      delete p.priceRationale; // the AI's reasoning no longer applies to a price the creator chose
      delete p.priceGuarded;
      const r = target.closest('.field').querySelector('.rationale');
      if (r) r.remove();
    } else p[pf] = pf === 'buyUrl' ? target.value.trim() : target.value;
    if (pf === 'format') { scheduleSave(); updatePreview(); renderAll(); return; }
  }
  scheduleSave();
  updatePreview();
}

app.addEventListener('input', (ev) => {
  if (ev.target.matches('[data-tf]') && ev.target.type !== 'checkbox' && ev.target.tagName !== 'SELECT') { onTestimonialEdit(ev.target); return; }
  if (ev.target.matches('[data-bind],[data-pf],[data-link]')) onEdit(ev.target);
});
app.addEventListener('change', (ev) => {
  if (ev.target.matches('input[type=file][data-upload]')) { onPickImage(ev.target); return; }
  if (ev.target.matches('input[data-sec-toggle]')) {
    const key = ev.target.closest('[data-sec]').dataset.sec;
    const show = ev.target.checked;
    setTheme((th) => { th.sections.hidden = show ? th.sections.hidden.filter((k) => k !== key) : [...th.sections.hidden, key]; });
    document.querySelector(`[data-sec="${key}"] input[data-sec-toggle]`)?.focus();
    return;
  }
  if (ev.target.matches('input[type=checkbox][data-tf], select[data-tf]')) { onTestimonialEdit(ev.target); return; }
  if (ev.target.matches('select[data-pf]')) onEdit(ev.target);
});

// ---------------------------------------------------------------- AI regeneration

async function regenerate(section, body) {
  return api('/api/regenerate', {
    method: 'POST',
    key,
    timeoutMs: 70000,
    body: { id, content: validateLocal().length ? undefined : content, ...body },
  });
}

async function withBusy(section, fn) {
  if (busy.has(section)) return;
  busy.add(section);
  renderAll();
  let ok = false;
  try {
    await fn();
    ok = true;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : 'Something went wrong. Your store is unchanged.', { type: 'error' });
  } finally {
    busy.delete(section);
    renderAll();
    updatePreview();
    scheduleSave();
  }
  return ok;
}

async function regenBio() {
  const instruction = await askInstruction({ title: 'Rewrite your profile', sub: 'AI will write a fresh headline and bio. Your products stay as they are.', placeholder: 'e.g. more personal, mention I\'m a mom of two' });
  if (instruction === null) return;
  await withBusy('bio', async () => {
    const res = await regenerate('bio', { target: 'bio', instruction });
    const prev = { headline: content.creator.headline, bio: content.creator.bio };
    const { avatar: _a, cover: _c, coverAi: _ai, ...written } = res.creator;
    Object.assign(content.creator, written);
    toast('New headline and bio written.', { action: () => { Object.assign(content.creator, prev); renderAll(); updatePreview(); scheduleSave(); } });
  });
}

async function regenProduct(pid) {
  const p = content.products.find((x) => x.id === pid);
  if (!p) return;
  const instruction = await askInstruction({ title: 'Swap this product idea', sub: `AI will replace "${p.title}" with a different idea. Other products stay as they are.`, placeholder: 'e.g. something live, or a cheaper starter product' });
  if (instruction === null) return;
  await withBusy(pid, async () => {
    const res = await regenerate(pid, { target: 'product', productId: pid, instruction });
    const idx = content.products.findIndex((x) => x.id === pid);
    if (idx === -1) return;
    const prev = clone(content.products[idx]);
    content.products[idx] = res.product;
    toast(prev.cover ? 'New product idea added. Its old image was removed; upload one that fits.' : 'New product idea added.', { action: () => { const i = content.products.findIndex((x) => x.id === pid); if (i !== -1) content.products[i] = prev; renderAll(); updatePreview(); scheduleSave(); } });
  });
}

async function regenPrice(pid) {
  await withBusy(pid, async () => {
    const res = await regenerate(pid, { target: 'price', productId: pid });
    const p = content.products.find((x) => x.id === pid);
    if (!p) return;
    const prev = { priceInr: p.priceInr, priceRationale: p.priceRationale };
    Object.assign(p, res.price);
    toast(`Suggested price: ${formatInr(p.priceInr, p.format)}`, { action: () => { Object.assign(p, prev); renderAll(); updatePreview(); scheduleSave(); } });
  });
}

async function addProduct() {
  if (content.products.length >= 4) return;
  await withBusy('add', async () => {
    const res = await regenerate('add', { target: 'add_product' });
    if (content.products.length >= 4) return;
    content.products.push(res.product);
    toast('Added a new product idea.', { action: () => { content.products = content.products.filter((x) => x.id !== res.product.id); renderAll(); updatePreview(); scheduleSave(); } });
  });
}

function deleteProduct(pid) {
  if (content.products.length <= 1) { toast('Your store needs at least one product.', { type: 'error' }); return; }
  const idx = content.products.findIndex((x) => x.id === pid);
  if (idx === -1) return;
  const [removed] = content.products.splice(idx, 1);
  renderAll(); updatePreview(); scheduleSave();
  toast(`Deleted "${removed.title}".`, { action: () => { content.products.splice(Math.min(idx, content.products.length), 0, removed); renderAll(); updatePreview(); scheduleSave(); } });
}

async function regenAll({ language, tone, ask = true } = {}) {
  let instruction = '';
  if (ask) {
    instruction = await askInstruction({ title: 'Regenerate the whole store?', sub: 'This replaces your profile and all products with fresh ideas. You can undo right after.', placeholder: 'e.g. more premium, focus on beginners', confirmLabel: 'Regenerate everything' });
    if (instruction === null) return false;
  }
  return withBusy('all', async () => {
    const res = await regenerate('all', { target: 'all', instruction, language: language || content.language, tone: tone || content.tone });
    const prev = clone(content);
    // Keep the creator's chosen name, look and contact links; replace the AI-written parts.
    content = { ...res.content, creator: { ...res.content.creator, displayName: content.creator.displayName, ...snapshotImagesOf(content) }, theme: content.theme, links: content.links, testimonials: content.testimonials };
    toast(language ? `Store rewritten in ${LANGUAGES[language]}.` : tone ? `Store rewritten in a ${TONES[tone].toLowerCase()} voice.` : 'Fresh store generated.', { action: () => { content = prev; renderAll(); updatePreview(); scheduleSave(); } });
  });
}

// ---------------------------------------------------------------- publish

function publishSheet() {
  if (validateLocal().length) { toast(validateLocal()[0], { type: 'error' }); return; }
  const suggestion = store.slug || (store.input?.handle || content.creator.displayName || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  openSheet((sheet, close) => {
    sheet.innerHTML = `<h3>${store.status === 'published' ? 'Update your link' : 'Publish your store'}</h3>
      <p class="sub">Pick your link. You can share it on Instagram, WhatsApp, anywhere.</p>
      <div class="field" id="slug-field">
        <label for="slug">Your store link</label>
        <div class="slug-input"><span>${e(location.host)}/s/</span><input id="slug" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="40" autofocus></div>
        <div class="field-error" id="slug-error" hidden></div>
      </div>
      <div class="row"><button type="button" class="btn btn-secondary" data-x>Cancel</button><button type="button" class="btn btn-primary" data-go>Publish now</button></div>`;
    const input = $('#slug', sheet);
    input.value = suggestion.length >= 3 ? suggestion : '';
    const go = $('[data-go]', sheet);
    $('[data-x]', sheet).onclick = close;
    const showErr = (m) => { const el = $('#slug-error', sheet); el.textContent = m; el.hidden = !m; $('#slug-field', sheet).classList.toggle('invalid', Boolean(m)); };
    input.addEventListener('input', () => {
      input.value = input.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-');
      showErr('');
    });
    const submit = async () => {
      const slug = input.value.replace(/^-|-$/g, '');
      if (slug && !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return showErr('Use 3–40 lowercase letters, numbers or hyphens.');
      go.disabled = true; go.innerHTML = '<span class="spin"></span>Publishing…';
      try {
        clearTimeout(saveTimer);
        const res = await api(`/api/stores/${encodeURIComponent(id)}/publish`, { method: 'POST', key, body: { content, slug: slug || undefined } });
        savedJson = JSON.stringify(content);
        saveFailed = false;
        store.status = 'published';
        store.slug = res.slug;
        close();
        renderAll(); setStatus(); updatePreview();
        shareSheet(res.url);
      } catch (err) {
        go.disabled = false; go.textContent = 'Publish now';
        if (err.data?.suggestion) { input.value = err.data.suggestion; showErr(err.message); }
        else if (err.data?.field === 'slug') showErr(err.message);
        else showErr(err.message);
      }
    };
    go.onclick = submit;
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); });
  });
}

function shareSheet(url) {
  openSheet((sheet, close) => {
    sheet.innerHTML = `<div class="done-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h3 style="text-align:center">Your store is live!</h3>
      <p class="sub" style="text-align:center;word-break:break-all"><a href="${e(url)}" target="_blank" rel="noopener">${e(url)}</a></p>
      <div style="display:grid;gap:10px">
        <button type="button" class="btn btn-primary btn-block" data-copy>Copy link</button>
        <a class="btn btn-secondary btn-block" href="https://wa.me/?text=${encodeURIComponent(`I just launched my store! ${url}`)}" target="_blank" rel="noopener">Share on WhatsApp</a>
        ${navigator.share ? '<button type="button" class="btn btn-secondary btn-block" data-share>More sharing options</button>' : ''}
        <a class="btn btn-secondary btn-block" href="${e(url)}" target="_blank" rel="noopener">Open my store</a>
        <button type="button" class="btn btn-ghost" data-x>Keep editing</button>
      </div>
      <p class="hint" style="text-align:center">Tip: put this link in your Instagram bio.</p>`;
    $('[data-copy]', sheet).onclick = async (ev) => { track('store_link_copied', { storeId: id, meta: { where: 'share_sheet' } }); if (await copyText(url)) ev.target.textContent = 'Copied ✓'; };
    $('[data-share]', sheet)?.addEventListener('click', () => navigator.share({ title: content.creator.displayName, url }).catch(() => {}));
    $('[data-x]', sheet).onclick = close;
  });
}

async function unpublish() {
  const yes = await confirmSheet({ title: 'Take your store offline?', sub: 'Your link will show "not live" until you publish again. Your content and link are kept.', confirmLabel: 'Unpublish' });
  if (!yes) return;
  try {
    await api(`/api/stores/${encodeURIComponent(id)}/publish`, { method: 'DELETE', key });
    store.status = 'draft';
    renderAll();
    toast('Your store is offline. Publish again any time; your link is kept.');
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

// ---------------------------------------------------------------- clicks

document.addEventListener('click', (ev) => {
  const t = ev.target;
  const action = t.closest('[data-action]')?.dataset.action;
  const pid = t.closest('[data-pid]')?.dataset.pid;
  if (action) {
    if (!content && action !== 'preview') return;
    switch (action) {
      case 'regen-bio': return regenBio();
      case 'regen-product': return regenProduct(pid);
      case 'regen-price': return regenPrice(pid);
      case 'delete-product': return deleteProduct(pid);
      case 'add-product': return addProduct();
      case 'regen-all': return regenAll();
      case 'gen-cover': return generateCover();
      case 'browse-templates': return openTemplateGallery();
      case 't-add': case 't-delete': case 't-up': case 't-down': case 't-tidy': case 't-use': case 't-keep': return testimonialAction(action, t);
      case 'remove-cover': return removeImage('cover');
      case 'remove-avatar': return removeImage('avatar');
      case 'remove-pimg': return removeProductImage(pid);
      case 'publish': return publishSheet();
      case 'unpublish': return unpublish();
      case 'preview': return content && openMobilePreview();
      case 'copy-link': track('store_link_copied', { storeId: id, meta: { where: 'editor' } }); return copyText(`${location.origin}/s/${store.slug}`).then((ok) => toast(ok ? 'Link copied' : 'Couldn\'t copy. Long-press the link instead.'));
      default: return undefined;
    }
  }
  const theme = t.closest('[data-theme]')?.dataset.theme;
  if (theme) { switchTemplate(theme); return undefined; }
  const accent = t.closest('[data-accent]')?.dataset.accent;
  if (accent) { setTheme((th) => { th.accent = accent; }); return undefined; }
  const bgId = t.closest('[data-bg]')?.dataset.bg;
  if (bgId) { setTheme((th) => { th.background = bgId; }); return undefined; }
  const font = t.closest('[data-font]')?.dataset.font;
  if (font) { setTheme((th) => { th.font = font; }); return undefined; }
  const move = t.closest('[data-sec-move]')?.dataset.secMove;
  if (move) {
    const key = t.closest('[data-sec]').dataset.sec;
    setTheme((th) => {
      const o = th.sections.order; const i = o.indexOf(key); const j = move === 'up' ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < o.length) [o[i], o[j]] = [o[j], o[i]];
    });
    document.querySelector(`[data-sec="${key}"] [data-sec-move="${move}"]:not([disabled])`)?.focus();
    return undefined;
  }
  const lang = t.closest('#sec-look [data-lang]')?.dataset.lang;
  if (lang && lang !== content.language) {
    confirmSheet({ title: `Rewrite your store in ${LANGUAGES[lang]}?`, sub: 'Your bio and products will be rewritten by AI. Your name, look and contact links stay. You can undo right after.', confirmLabel: 'Rewrite store' }).then((yes) => {
      if (!yes) return;
      const prevLang = content.language;
      content.language = lang;
      renderAll();
      regenAll({ language: lang, ask: false }).then((ok) => {
        if (!ok) { content.language = prevLang; renderAll(); scheduleSave(); }
      });
    });
    return undefined;
  }
  const tone = t.closest('#sec-look [data-tone]')?.dataset.tone;
  if (tone && tone !== content.tone) {
    confirmSheet({ title: `Switch to a ${TONES[tone].toLowerCase()} voice?`, sub: 'AI rewrites your bio and products in the new voice. You can undo right after.', confirmLabel: 'Rewrite store' }).then((yes) => {
      if (!yes) return;
      const prevTone = content.tone;
      content.tone = tone;
      renderAll();
      regenAll({ tone, ask: false }).then((ok) => {
        if (!ok) { content.tone = prevTone; renderAll(); scheduleSave(); }
      });
    });
    return undefined;
  }
  const device = t.closest('[data-device]')?.dataset.device;
  if (device) {
    document.querySelectorAll('[data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === device)));
    track('store_previewed', { storeId: id, meta: { device } });
    $('#preview-pane').classList.toggle('desktop', device === 'desktop');
  }
  return undefined;
});

window.addEventListener('resize', () => updatePreview());
load();
