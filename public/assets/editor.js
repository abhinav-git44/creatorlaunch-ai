import { api, ApiError, toast, openSheet, askInstruction, saveEditKey, getEditKey, copyText } from './ui.js';
import { FORMATS, THEMES, ACCENTS, LANGUAGES, LIMITS, MAX_PRICE, escapeHtml as e, formatInr } from './shared.js';
import { renderStorefront } from './render.js';

const $ = (s, root = document) => root.querySelector(s);
const app = $('#app');

// ---------------------------------------------------------------- state

const id = location.pathname.split('/').filter(Boolean)[1] || '';
const hashKey = new URLSearchParams(location.hash.slice(1)).get('k');
const key = hashKey || getEditKey(id);
if (hashKey) saveEditKey(id, hashKey);

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
    return `<div class="note"><span aria-hidden="true">✏️</span><span><strong>Draft, only you can see this</strong>Check the details, then tap Publish to get your link. Bookmark this page to come back and edit; don't share its address.</span></div>`;
  }
  const url = `${location.origin}/s/${store.slug}`;
  return `<div class="published-bar">
    <div class="eyebrow" style="color:#11612F">● Live</div>
    <a class="url" href="${e(url)}" target="_blank" rel="noopener">${e(url.replace(/^https?:\/\//, ''))}</a>
    <div class="hint" style="color:#2f6b43">Edits go live automatically, within about 30 seconds.</div>
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

function profileCard() {
  const c = content.creator;
  return `<section class="card" id="sec-bio" ${busy.has('bio') ? 'aria-busy="true"' : ''}>
    <div class="card-head"><h2>Your profile</h2>
      <button type="button" class="btn btn-ghost" data-action="regen-bio" ${busy.has('bio') ? 'disabled' : ''}>${busy.has('bio') ? '<span class="spin"></span>Rewriting…' : '↻ Rewrite with AI'}</button>
    </div>
    ${fieldInput('creator.displayName', 'Name on your store', c.displayName, { max: LIMITS.displayName })}
    ${fieldInput('creator.headline', 'Headline', c.headline, { max: LIMITS.headline, hint: 'One line on what you help people do.' })}
    ${fieldInput('creator.bio', 'Bio', c.bio, { max: LIMITS.bio, multiline: true, rows: 4 })}
    ${fieldInput('creator.niche', 'Niche tag', c.niche, { max: LIMITS.niche })}
  </section>`;
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
    <div class="field"><label for="t-${e(p.id)}">Title</label><input id="t-${e(p.id)}" type="text" data-pf="title" maxlength="${LIMITS.title}" value="${e(p.title)}"></div>
    <div class="field"><label for="fm-${e(p.id)}">Format</label><select id="fm-${e(p.id)}" data-pf="format">${formats}</select></div>
    <div class="field">
      <label for="pr-${e(p.id)}">Price in ₹${unit ? ` <span class="optional">(${unit.replace('/', 'per ')})</span>` : ''}</label>
      <div class="price-row">
        <div class="prefix-input"><span>₹</span><input id="pr-${e(p.id)}" type="number" inputmode="numeric" min="0" max="${MAX_PRICE}" step="1" data-pf="priceInr" value="${e(p.priceInr)}"></div>
        <button type="button" class="btn btn-secondary" data-action="regen-price">↻ Suggest</button>
      </div>
      ${p.priceRationale ? `<div class="rationale"><b>Why ${e(formatInr(p.priceInr, p.format))}?</b> ${e(p.priceRationale)} <span class="ai-tag">AI suggestion</span></div>` : ''}
    </div>
    <div class="field"><label for="sd-${e(p.id)}">One-line pitch</label><textarea id="sd-${e(p.id)}" data-pf="shortDescription" rows="2" maxlength="${LIMITS.shortDescription}">${e(p.shortDescription)}</textarea></div>
    <div class="field"><label for="bn-${e(p.id)}">What buyers get <span class="optional">(one per line)</span></label><textarea id="bn-${e(p.id)}" data-pf="benefits" rows="3">${e((p.benefits || []).join('\n'))}</textarea></div>
    <details class="more"><summary>More details</summary>
      <div class="field" style="margin-top:10px"><label for="ds-${e(p.id)}">Full description</label><textarea id="ds-${e(p.id)}" data-pf="description" rows="4" maxlength="${LIMITS.description}">${e(p.description)}</textarea></div>
      <div class="field"><label for="cta-${e(p.id)}">Button text</label><input id="cta-${e(p.id)}" type="text" data-pf="ctaLabel" maxlength="${LIMITS.ctaLabel}" value="${e(p.ctaLabel)}"></div>
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

function lookCard() {
  const themes = Object.entries(THEMES).map(([k, label]) => `<button type="button" class="theme-opt" data-theme="${k}" aria-pressed="${content.theme.style === k}" style="--acc:${ACCENTS[content.theme.accent]}"><div class="theme-swatch swatch-${k}"></div>${e(label)}</button>`).join('');
  const accents = Object.entries(ACCENTS).map(([k, hex]) => `<button type="button" class="accent-dot" data-accent="${k}" aria-pressed="${content.theme.accent === k}" style="background:${hex}" aria-label="${k} colour"></button>`).join('');
  const langs = Object.entries(LANGUAGES).map(([k, label]) => `<button type="button" data-lang="${k}" aria-pressed="${content.language === k}">${k === 'hi' ? 'हिंदी' : e(label)}</button>`).join('');
  return `<section class="card" id="sec-look">
    <div class="card-head"><h2>Look &amp; language</h2></div>
    <span class="label">Style</span>
    <div class="themes">${themes}</div>
    <div class="accents" role="group" aria-label="Accent colour">${accents}</div>
    <div class="field" style="margin-top:18px;margin-bottom:0">
      <span class="label">Language</span>
      <div class="segmented" style="margin-bottom:8px" role="group" aria-label="Language">${langs}</div>
      <p class="hint" style="margin-top:0">Changing this rewrites your whole store in that language (you can undo).</p>
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
  app.innerHTML = publishedBar() + profileCard() + productsCard() + lookCard() + startOverCard();
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
  content.products.forEach((p, i) => {
    const card = document.querySelector(`[data-pid="${CSS.escape(p.id)}"]`);
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
  try {
    await api(`/api/stores/${encodeURIComponent(id)}`, { method: 'PATCH', body: { content: JSON.parse(snapshot) }, key });
    savedJson = snapshot;
    saveFailed = false;
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
      html = renderStorefront(content, { handle: store.input?.handle || '', slug: store.slug || '', baseUrl: location.origin, mode: 'preview', published: store.status === 'published' });
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
  overlay.querySelector('[data-close]').onclick = () => overlay.remove();
  overlay.querySelector('[data-close]').focus();
  updatePreview(true);
}

// ---------------------------------------------------------------- edits

function onEdit(target) {
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
    } else p[pf] = target.value;
  }
  scheduleSave();
  updatePreview();
}

app.addEventListener('input', (ev) => {
  if (ev.target.matches('[data-bind],[data-pf]')) onEdit(ev.target);
});
app.addEventListener('change', (ev) => {
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
    Object.assign(content.creator, res.creator);
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
    toast('New product idea added.', { action: () => { const i = content.products.findIndex((x) => x.id === pid); if (i !== -1) content.products[i] = prev; renderAll(); updatePreview(); scheduleSave(); } });
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

async function regenAll({ language, ask = true } = {}) {
  let instruction = '';
  if (ask) {
    instruction = await askInstruction({ title: 'Regenerate the whole store?', sub: 'This replaces your profile and all products with fresh ideas. You can undo right after.', placeholder: 'e.g. more premium, focus on beginners', confirmLabel: 'Regenerate everything' });
    if (instruction === null) return false;
  }
  return withBusy('all', async () => {
    const res = await regenerate('all', { target: 'all', instruction, language: language || content.language });
    const prev = clone(content);
    // Keep the creator's chosen name and look; replace the AI-written parts.
    content = { ...res.content, creator: { ...res.content.creator, displayName: content.creator.displayName }, theme: content.theme };
    toast(language ? `Store rewritten in ${LANGUAGES[language]}.` : 'Fresh store generated.', { action: () => { content = prev; renderAll(); updatePreview(); scheduleSave(); } });
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
    sheet.innerHTML = `<div style="text-align:center;font-size:40px" aria-hidden="true">🎉</div>
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
    $('[data-copy]', sheet).onclick = async (ev) => { if (await copyText(url)) ev.target.textContent = 'Copied ✓'; };
    $('[data-share]', sheet)?.addEventListener('click', () => navigator.share({ title: content.creator.displayName, url }).catch(() => {}));
    $('[data-x]', sheet).onclick = close;
  });
}

async function unpublish() {
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
      case 'publish': return publishSheet();
      case 'unpublish': return unpublish();
      case 'preview': return content && openMobilePreview();
      case 'copy-link': return copyText(`${location.origin}/s/${store.slug}`).then((ok) => toast(ok ? 'Link copied' : 'Couldn\'t copy. Long-press the link instead.'));
      default: return undefined;
    }
  }
  const theme = t.closest('[data-theme]')?.dataset.theme;
  if (theme) { content.theme.style = theme; renderAll(); updatePreview(); scheduleSave(); return undefined; }
  const accent = t.closest('[data-accent]')?.dataset.accent;
  if (accent) { content.theme.accent = accent; renderAll(); updatePreview(); scheduleSave(); return undefined; }
  const lang = t.closest('#sec-look [data-lang]')?.dataset.lang;
  if (lang && lang !== content.language) {
    const prevLang = content.language;
    content.language = lang;
    renderAll();
    regenAll({ language: lang, ask: false }).then((ok) => {
      if (!ok) { content.language = prevLang; renderAll(); scheduleSave(); }
    });
    return undefined;
  }
  const device = t.closest('[data-device]')?.dataset.device;
  if (device) {
    document.querySelectorAll('[data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === device)));
    $('#preview-pane').classList.toggle('desktop', device === 'desktop');
  }
  return undefined;
});

window.addEventListener('resize', () => updatePreview());
load();
