import { api, ApiError, saveEditKey, savedStores, forgetStore, confirmSheet, openSheet } from './ui.js';
import { track } from './analytics.js';
import { checkCreatorInput, checkHandle, AUDIENCE_SIZES, escapeHtml } from './shared.js';
import { TEMPLATES, applyTemplate } from './templates.js';
import { galleryHtml, mountGallery, dataUrlFor, thumbUrl } from './gallery.js';
import { sampleContent, SAMPLE_IMAGES } from './template-samples.js';

const $ = (s) => document.querySelector(s);
const NICHES = ['Fitness', 'Finance', 'Cooking', 'Exam prep', 'Design', 'Astrology', 'Fashion & beauty', 'Career & skills', 'Other'];
const EXAMPLES = {
  fitness: {
    name: 'Riya Sharma', niche: 'Fitness', audienceSize: 'small', language: 'en',
    description: 'I\'m a certified yoga and fitness coach. I post 15-minute home workouts for working women who sit all day and have back pain. Most of my followers are 25–40.',
  },
  finance: {
    name: 'Arjun Mehta', niche: 'Finance', audienceSize: 'mid', language: 'en',
    description: 'I\'m a CA who explains personal finance simply: saving tax, budgeting and starting SIPs, for people in their first job. I make Reels in simple English.',
  },
  exam: {
    name: 'Neha Verma', niche: 'Exam prep', audienceSize: 'mid', language: 'hinglish',
    description: 'Main SSC CGL ki tayari karwati hoon. Daily maths tricks aur previous year questions ke Reels banati hoon, mostly Hindi medium students ke liye.',
  },
};

const state = { mode: 'describe', niche: '', audienceSize: '', language: 'en', tone: 'friendly' };
let pending = null; // last generation result, kept so a failed save never loses it
let shots = []; // { mime, data (base64), url (data URL for the thumbnail) } — kept in memory only
let controller = null;
let timer = null;

// ---------------------------------------------------------------- render controls

function pressed(group, attr, value) {
  group.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
}

function buildChips() {
  const n = $('#niches');
  n.innerHTML = '';
  for (const label of NICHES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label; b.dataset.niche = label;
    b.setAttribute('aria-pressed', 'false');
    n.appendChild(b);
  }
  const a = $('#audience');
  a.innerHTML = '';
  for (const [k, label] of Object.entries(AUDIENCE_SIZES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label; b.dataset.size = k;
    b.setAttribute('aria-pressed', 'false');
    a.appendChild(b);
  }
}

function setMode(mode) {
  state.mode = mode;
  pressed(document.querySelector('.segmented'), 'data-mode', mode);
  $('#ig-block').hidden = mode !== 'instagram';
  $('#name-optional').hidden = mode !== 'instagram';
  $('#desc-label').textContent = mode === 'instagram'
    ? (shots.length ? 'Anything to add? (optional with screenshots)' : 'What do you post about, and who follows you?')
    : 'What do you do, and who do you help?';
  saveDraft();
}

function syncControls() {
  pressed($('#niches'), 'data-niche', state.niche);
  pressed($('#audience'), 'data-size', state.audienceSize);
  pressed($('#language'), 'data-lang', state.language);
  pressed($('#tone'), 'data-tone', state.tone);
  $('#counter').textContent = `${$('#description').value.length}/600`;
}

// ---------------------------------------------------------------- draft persistence

function readInput() {
  return {
    mode: state.mode,
    name: $('#name').value,
    handle: $('#handle').value,
    description: $('#description').value,
    niche: state.niche,
    audienceSize: state.audienceSize,
    language: state.language,
    tone: state.tone,
  };
}
function saveDraft() {
  try { sessionStorage.setItem('cl_draft', JSON.stringify(readInput())); } catch { /* ignore */ }
}
function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem('cl_draft') || 'null');
    if (!d) return;
    $('#name').value = d.name || '';
    $('#handle').value = d.handle || '';
    $('#description').value = d.description || '';
    Object.assign(state, { niche: d.niche || '', audienceSize: d.audienceSize || '', language: d.language || 'en', tone: d.tone || 'friendly' });
    setMode(d.mode === 'instagram' ? 'instagram' : 'describe');
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- errors

function clearErrors() {
  for (const f of ['handle', 'name', 'description', 'screenshots', 'ownAccount']) {
    $(`#e-${f}`).hidden = true;
    $(`#f-${f}`)?.classList.remove('invalid');
  }
  $('#form-error').hidden = true;
}
function showErrors(errors) {
  let first = null;
  for (const [f, msg] of Object.entries(errors)) {
    const el = $(`#e-${f}`);
    if (!el) continue;
    el.textContent = msg; el.hidden = false;
    $(`#f-${f}`)?.classList.add('invalid');
    first = first || $(`#${f}`) || (f === 'ownAccount' ? $('#own-account') : null);
  }
  first?.focus();
}

// ---------------------------------------------------------------- views

function show(view) {
  for (const id of ['form', 'generating', 'clarify', 'failed']) $(`#${id}`).hidden = id !== view;
  $('#hero').hidden = view !== 'form';
  $('#my-stores').hidden = view !== 'form' || !savedStores().length;
  document.querySelectorAll('.land').forEach((el) => { el.hidden = view !== 'form'; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelector('.home-nav .nav-cta')?.toggleAttribute('hidden', view !== 'form');
}

function startTimer() {
  const start = Date.now();
  $('#elapsed').textContent = '';
  timer = setInterval(() => {
    const s = Math.round((Date.now() - start) / 1000);
    $('#elapsed').textContent = s < 15 ? `${s}s` : `${s}s · taking a little longer than usual, hang on`;
  }, 1000);
}
function stopTimer() { clearInterval(timer); }

let lastAction = null;
function fail(message, action) {
  lastAction = action;
  $('#failed-msg').textContent = message;
  show('failed');
  $('#retry').focus();
}

// ---------------------------------------------------------------- generate + save

async function generate(extra = '') {
  clearErrors();
  const input = readInput();
  const useShots = state.mode === 'instagram' && shots.length > 0;
  input.ownAccount = useShots ? $('#own-account').checked : undefined;
  if (extra) input.description = `${input.description.trim()}\n${extra.trim()}`.slice(0, 600);
  const check = checkCreatorInput(input, { hasScreenshots: useShots });
  if (!check.ok) { show('form'); showErrors(check.errors); return; }
  if (extra) { $('#description').value = input.description; saveDraft(); }

  track('creator_input_submitted', { meta: { mode: check.value.mode, language: check.value.language, tone: check.value.tone, niche: check.value.niche, audienceSize: check.value.audienceSize, hasHandle: Boolean(check.value.handle) } });
  $('#generating h2').textContent = useShots ? 'Reading your profile and building your store…' : 'Building your store…';
  show('generating');
  startTimer();
  controller = new AbortController();
  try {
    const body = { input };
    if (useShots) body.images = shots.map(({ mime, data }) => ({ mime, data }));
    const result = await api('/api/generate', { method: 'POST', body, timeoutMs: 70000, signal: controller.signal });
    if (result.profileRead?.readable) {
      try { sessionStorage.setItem('cl_profile_read', JSON.stringify(result.profileRead)); } catch { /* ignore */ }
    }
    pending = result;
    if (result.inputQuality === 'needs_more_detail' && result.clarifyingQuestion) {
      $('#clarify-q').textContent = result.clarifyingQuestion;
      $('#clarify-answer').value = '';
      show('clarify');
      $('#clarify-answer').focus();
      return;
    }
    await saveAndOpen();
  } catch (err) {
    if (err.status === -1) { show('form'); return; } // cancelled
    if (err.status === 422 && err.data?.fields) { show('form'); showErrors(err.data.fields); return; }
    fail(err.message, () => generate(extra));
  } finally {
    stopTimer();
    controller = null;
  }
}

async function saveAndOpen() {
  show('generating');
  try {
    // A template the creator picked overrides the one the AI suggested. Their content is untouched.
    const content = chosenTemplate ? { ...pending.content, theme: applyTemplate(pending.content.theme, chosenTemplate) } : pending.content;
    const { id, editKey } = await api('/api/stores', { method: 'POST', body: { input: pending.input, content } });
    try { sessionStorage.removeItem('cl_template'); } catch { /* ignore */ }
    saveEditKey(id, editKey);
    try { sessionStorage.removeItem('cl_draft'); } catch { /* ignore */ }
    location.href = `/edit/${id}#k=${encodeURIComponent(editKey)}`;
  } catch (err) {
    if (err instanceof ApiError) fail(`${err.message} Your generated store is kept; tap Try again to save it.`, saveAndOpen);
    else throw err;
  }
}

// ---------------------------------------------------------------- screenshots

// Downscale in the browser (≤1280px, JPEG) so uploads stay small and fast on mobile data.
function loadShot(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Use JPG, PNG or WebP screenshots.'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('That image is too large.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Couldn\'t read that image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Couldn\'t read that image.'));
      img.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', 0.82);
        resolve({ mime: 'image/jpeg', data: url.split(',')[1], url });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderShots() {
  const box = $('#shots');
  box.innerHTML = '';
  shots.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'shot';
    const img = document.createElement('img');
    img.src = s.url; img.alt = `Screenshot ${i + 1}`;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '×'; b.setAttribute('aria-label', `Remove screenshot ${i + 1}`);
    b.onclick = () => { shots.splice(i, 1); renderShots(); };
    d.append(img, b);
    box.appendChild(d);
  });
  $('#own-wrap').hidden = shots.length === 0;
  $('.shot-pick').textContent = shots.length >= 3 ? 'Maximum 3 screenshots' : shots.length ? '+ Add another screenshot' : '+ Add screenshots (up to 3)';
  $('.shot-pick').classList.toggle('disabled', shots.length >= 3);
  setMode(state.mode);
}

$('#shot-input').addEventListener('change', async (e) => {
  $('#e-screenshots').hidden = true;
  const files = [...e.target.files].slice(0, 3 - shots.length);
  for (const f of files) {
    try { shots.push(await loadShot(f)); } catch (err) { $('#e-screenshots').textContent = err.message; $('#e-screenshots').hidden = false; }
  }
  e.target.value = '';
  renderShots();
});

// ---------------------------------------------------------------- wire up

buildChips();
loadDraft();
syncControls();

// ---------------------------------------------------------------- my stores
// Lists every store this browser has an edit link for. Each is loaded with its own key, so the
// list shows the real name, status and link; stores that no longer open can be removed.
function ago(ts) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (!Number.isFinite(d) || d < 0) return '';
  if (d < 90) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.round(d / 86400)} days ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function storeCard(s, data, problem) {
  const editHref = `/edit/${s.id}#k=${encodeURIComponent(s.key)}`;
  if (problem) {
    return `<article class="ms-card ms-bad" data-sid="${s.id}"><div class="ms-thumb ms-blank" aria-hidden="true">?</div>
      <div class="ms-body"><h3>${problem === 'gone' ? 'This store can\'t be opened' : 'Couldn\'t load this store'}</h3>
      <p class="ms-meta">${problem === 'gone' ? 'It may have been deleted, or its saved link is no longer valid.' : 'Check your connection and reload the page.'}</p>
      <div class="ms-actions">${problem === 'gone' ? '' : `<a class="btn btn-secondary" href="${editHref}">Try opening</a>`}<button type="button" class="btn btn-ghost" data-forget>Remove from list</button></div></div></article>`;
  }
  const c = data.content || {};
  const live = data.status === 'published' && data.slug;
  const style = TEMPLATES[c.theme?.style] ? c.theme.style : 'minimal';
  return `<article class="ms-card" data-sid="${s.id}">
    <img class="ms-thumb" src="${thumbUrl(style)}" alt="" width="390" height="520" loading="lazy">
    <div class="ms-body">
      <div class="ms-top"><h3>${escapeHtml(c.creator?.displayName || 'Untitled store')}</h3><span class="ms-status ${live ? 'live' : 'draft'}">${live ? 'Live' : 'Draft'}</span></div>
      <p class="ms-headline">${escapeHtml(c.creator?.headline || '')}</p>
      <p class="ms-meta">${(c.products || []).length} products · ${escapeHtml(TEMPLATES[style].name)}${data.updatedAt ? ` · edited ${ago(data.updatedAt)}` : ''}${live ? ` · /s/${escapeHtml(data.slug)}` : ''}</p>
      <div class="ms-actions">
        <a class="btn btn-primary" href="${editHref}">Edit</a>
        ${live ? `<a class="btn btn-secondary" href="/s/${encodeURIComponent(data.slug)}" target="_blank" rel="noopener">View live</a>` : ''}
        <button type="button" class="btn btn-ghost" data-forget>Remove from list</button>
      </div>
    </div></article>`;
}

async function renderMyStores() {
  const list = savedStores().slice(0, 20);
  const sec = $('#my-stores');
  const cont = $('#continue');
  cont.hidden = !list.length;
  if (list.length) cont.textContent = `My stores (${list.length})`;
  sec.hidden = !list.length;
  if (!list.length) return;
  $('#ms-list').innerHTML = list.map((s) => `<article class="ms-card ms-loading" data-sid="${s.id}"><div class="ms-thumb ms-blank"></div><div class="ms-body"><h3>Loading…</h3></div></article>`).join('');
  await Promise.all(list.map(async (s) => {
    let html;
    try {
      const data = await api(`/api/stores/${encodeURIComponent(s.id)}`, { key: s.key, timeoutMs: 15000 });
      html = storeCard(s, data);
    } catch (err) {
      html = storeCard(s, null, err instanceof ApiError && err.status === 404 ? 'gone' : 'offline');
    }
    const el = document.querySelector(`#ms-list [data-sid="${s.id}"]`);
    if (el) el.outerHTML = html;
  }));
}

$('#ms-list').addEventListener('click', async (ev) => {
  if (!ev.target.closest('[data-forget]')) return;
  const sid = ev.target.closest('[data-sid]').dataset.sid;
  const yes = await confirmSheet({ title: 'Remove this store from the list?', sub: 'This only forgets it on this device. The store itself (and its live page, if published) is not deleted. Keep its Edit link if you want to open it again.', confirmLabel: 'Remove from list' });
  if (!yes) return;
  forgetStore(sid);
  renderMyStores();
});
renderMyStores();

document.querySelector('.segmented').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (b) setMode(b.dataset.mode);
});
$('#niches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-niche]');
  if (!b) return;
  state.niche = state.niche === b.dataset.niche ? '' : b.dataset.niche;
  syncControls(); saveDraft();
});
$('#audience').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]');
  if (!b) return;
  state.audienceSize = state.audienceSize === b.dataset.size ? '' : b.dataset.size;
  syncControls(); saveDraft();
});
$('#language').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  state.language = b.dataset.lang;
  syncControls(); saveDraft();
});
document.querySelectorAll('[data-example]').forEach((b) => b.addEventListener('click', () => {
  const ex = EXAMPLES[b.dataset.example];
  $('#name').value = ex.name;
  $('#description').value = ex.description;
  Object.assign(state, { niche: ex.niche, audienceSize: ex.audienceSize, language: ex.language });
  setMode('describe');
  syncControls(); clearErrors();
}));
$('#tone').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tone]');
  if (!b) return;
  state.tone = b.dataset.tone;
  syncControls(); saveDraft();
});
// "Onboarding started" = the creator's first real interaction with the form (not a page bounce).
let started = false;
const markStarted = () => {
  if (started) return;
  started = true;
  track('onboarding_started', { meta: { mode: state.mode } });
};
$('#form').addEventListener('input', markStarted, { once: true });
$('#form').addEventListener('click', (e) => { if (e.target.closest('button')) markStarted(); });
$('#description').addEventListener('input', () => { syncControls(); saveDraft(); });
$('#name').addEventListener('input', saveDraft);
$('#handle').addEventListener('input', saveDraft);
$('#handle').addEventListener('blur', () => {
  if (!$('#handle').value.trim()) return;
  const h = checkHandle($('#handle').value);
  $('#e-handle').hidden = h.ok;
  $('#f-handle').classList.toggle('invalid', !h.ok);
  if (!h.ok) $('#e-handle').textContent = h.message;
  else $('#handle').value = h.handle;
});

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (controller) return; // prevent double submit
  generate();
});
$('#cancel').addEventListener('click', () => controller?.abort());
$('#retry').addEventListener('click', () => lastAction?.());
$('#back').addEventListener('click', () => show('form'));
$('#clarify-go').addEventListener('click', () => {
  const a = $('#clarify-answer').value.trim();
  if (!a) { $('#clarify-answer').focus(); return; }
  generate(a);
});
$('#clarify-skip').addEventListener('click', () => saveAndOpen());

// "Create my store" buttons on the home page jump to the form and focus the first field.
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-go-create]');
  if (!a) return;
  ev.preventDefault();
  document.getElementById('create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.querySelector('#form:not([hidden]) #name')?.focus({ preventScroll: true }), 450);
});


// ---------------------------------------------------------------- template gallery (step 1)
// Optional: pick a template before generating. Without one, the AI picks a template that suits
// the niche. Either way the creator can switch in the editor without losing anything.
let chosenTemplate = '';
try { chosenTemplate = TEMPLATES[sessionStorage.getItem('cl_template')] ? sessionStorage.getItem('cl_template') : ''; } catch { /* ignore */ }

function syncTemplatePick() {
  const t = TEMPLATES[chosenTemplate];
  $('#tpl-pick-img').hidden = !t;
  if (t) $('#tpl-pick-img').src = thumbUrl(chosenTemplate);
  $('#tpl-pick-name').textContent = t ? t.name : 'Picked for you';
  $('#tpl-pick-sub').textContent = t ? 'Your store will be built in this template. You can switch any time.' : 'AI chooses one of 10 free templates to suit your niche. You can switch any time.';
  $('#tpl-pick-browse').textContent = t ? 'Change' : 'Browse templates';
  $('#tpl-pick-clear').hidden = !t;
}

function chooseTemplate(id) {
  chosenTemplate = TEMPLATES[id] ? id : '';
  try { if (chosenTemplate) sessionStorage.setItem('cl_template', chosenTemplate); else sessionStorage.removeItem('cl_template'); } catch { /* ignore */ }
  syncTemplatePick();
  if (chosenTemplate) {
    track('template_selected', { meta: { template: chosenTemplate, where: 'home' } });
    document.getElementById('create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.querySelector('#form:not([hidden]) #name')?.focus({ preventScroll: true }), 450);
  }
}

// "Browse templates" in the create form opens the gallery in a sheet (no separate home section).
const sampleSrc = (k) => dataUrlFor(SAMPLE_IMAGES[k]);
function openHomeGallery() {
  Object.keys(SAMPLE_IMAGES).forEach((k) => sampleSrc(k)); // warm up so previews show images
  openSheet((sheet, close) => {
    sheet.classList.add('sheet-wide');
    sheet.setAttribute('aria-label', 'Choose your storefront template');
    sheet.innerHTML = `<div class="tpv-head"><div><h3>Choose a template</h3><p class="sub">All 10 are free. Previews use fictional example creators; your store is filled with your own details.</p></div>
      <button type="button" class="btn btn-secondary" data-close>Close</button></div>${galleryHtml({ current: chosenTemplate, prefix: 'hg' })}`;
    sheet.querySelector('[data-close]').onclick = close;
    mountGallery(sheet.querySelector('[data-gallery]'), {
      onUse: (tid) => { close(); chooseTemplate(tid); },
      previewContent: (tid) => sampleContent(tid, applyTemplate({}, tid)),
      assetSrc: sampleSrc,
      useLabel: 'Use this template',
    });
  });
}
$('#tpl-pick-browse').addEventListener('click', openHomeGallery);
$('#tpl-pick-clear').addEventListener('click', () => chooseTemplate(''));
syncTemplatePick();


// ---------------------------------------------------------------- log in / sign up (preview only)
// Accounts aren't built yet. The buttons say so plainly instead of leading to a dead end, and
// point to what works today: no sign-up, stores saved on this device, a private edit link each.
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-auth]');
  if (!b) return;
  const mine = savedStores().length;
  openSheet((sheet, close) => {
    sheet.setAttribute('aria-label', 'Log in or sign up');
    sheet.innerHTML = `<h3>Log in / Sign up: accounts are coming soon</h3>
      <p class="sub">You don't need an account to use Sell Sphere today. Create your store in about a minute; it's saved on this device, and each store has a private edit link you can bookmark to edit from anywhere.</p>
      <p class="sub" style="margin-top:-6px">Accounts (log in on any device, see all your stores in one place) are on the roadmap.</p>
      <div class="row">${mine ? '<a class="btn btn-secondary" href="#my-stores" data-auth-close>My stores</a>' : '<button type="button" class="btn btn-secondary" data-auth-close>Close</button>'}<a class="btn btn-primary" href="#create" data-go-create data-auth-close autofocus>Create my store</a></div>`;
    sheet.querySelectorAll('[data-auth-close]').forEach((x) => x.addEventListener('click', close));
  });
});
