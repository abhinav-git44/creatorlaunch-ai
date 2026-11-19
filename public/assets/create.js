import { api, ApiError, saveEditKey, lastStore } from './ui.js';
import { checkCreatorInput, checkHandle, AUDIENCE_SIZES } from './shared.js';

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

const state = { mode: 'describe', niche: '', audienceSize: '', language: 'en' };
let pending = null; // last generation result, kept so a failed save never loses it
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
  $('#desc-label').textContent = mode === 'instagram' ? 'What do you post about, and who follows you?' : 'What do you do, and who do you help?';
  saveDraft();
}

function syncControls() {
  pressed($('#niches'), 'data-niche', state.niche);
  pressed($('#audience'), 'data-size', state.audienceSize);
  pressed($('#language'), 'data-lang', state.language);
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
    Object.assign(state, { niche: d.niche || '', audienceSize: d.audienceSize || '', language: d.language || 'en' });
    setMode(d.mode === 'instagram' ? 'instagram' : 'describe');
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- errors

function clearErrors() {
  for (const f of ['handle', 'name', 'description']) {
    $(`#e-${f}`).hidden = true;
    $(`#f-${f}`).classList.remove('invalid');
  }
  $('#form-error').hidden = true;
}
function showErrors(errors) {
  let first = null;
  for (const [f, msg] of Object.entries(errors)) {
    const el = $(`#e-${f}`);
    if (!el) continue;
    el.textContent = msg; el.hidden = false;
    $(`#f-${f}`).classList.add('invalid');
    first = first || $(`#${f}`);
  }
  first?.focus();
}

// ---------------------------------------------------------------- views

function show(view) {
  for (const id of ['form', 'generating', 'clarify', 'failed']) $(`#${id}`).hidden = id !== view;
  $('#hero').hidden = view !== 'form';
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  if (extra) input.description = `${input.description.trim()}\n${extra.trim()}`.slice(0, 600);
  const check = checkCreatorInput(input);
  if (!check.ok) { show('form'); showErrors(check.errors); return; }
  if (extra) { $('#description').value = input.description; saveDraft(); }

  show('generating');
  startTimer();
  controller = new AbortController();
  try {
    const result = await api('/api/generate', { method: 'POST', body: { input }, timeoutMs: 70000, signal: controller.signal });
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
    const { id, editKey } = await api('/api/stores', { method: 'POST', body: { input: pending.input, content: pending.content } });
    saveEditKey(id, editKey);
    try { sessionStorage.removeItem('cl_draft'); } catch { /* ignore */ }
    location.href = `/edit/${id}#k=${encodeURIComponent(editKey)}`;
  } catch (err) {
    if (err instanceof ApiError) fail(`${err.message} Your generated store is kept; tap Try again to save it.`, saveAndOpen);
    else throw err;
  }
}

// ---------------------------------------------------------------- wire up

buildChips();
loadDraft();
syncControls();

const last = lastStore();
if (last) {
  const c = $('#continue');
  c.hidden = false;
  c.href = `/edit/${last.id}#k=${encodeURIComponent(last.key)}`;
}

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
