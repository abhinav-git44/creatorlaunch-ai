// Browser helpers: API calls with timeouts, toasts, bottom sheets, edit-key storage.
import { sessionId } from './analytics.js';

export class ApiError extends Error {
  constructor(message, { status = 0, data = {} } = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, key, timeoutMs = 20000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const onAbort = () => controller.abort('cancel');
  signal?.addEventListener('abort', onAbort);
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'x-edit-key': key } : {}), 'x-session-id': sessionId() },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    if (signal?.aborted) throw new ApiError('Cancelled', { status: -1 });
    if (controller.signal.aborted) throw new ApiError('This is taking too long. Check your connection and try again.', { status: 0 });
    throw new ApiError('You seem to be offline. Check your connection and try again.', { status: 0 });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    throw new ApiError(data?.error?.message || 'Something went wrong. Please try again.', { status: res.status, data: data?.error || {} });
  }
  return data;
}

// ---------------------------------------------------------------- toasts

let toastBox;
// key: a toast with the same key replaces the previous one (e.g. repeated template switches).
export function toast(message, { type = 'info', action, actionLabel, duration = 4500, key = '' } = {}) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    toastBox.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastBox);
  }
  if (key) toastBox.querySelectorAll(`[data-key="${key}"]`).forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  if (key) el.dataset.key = key;
  const text = document.createElement('span');
  text.className = 'grow';
  text.textContent = message;
  el.appendChild(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = actionLabel || 'Undo';
    b.onclick = () => { action(); el.remove(); };
    el.appendChild(b);
  }
  toastBox.appendChild(el);
  setTimeout(() => el.remove(), action ? Math.max(duration, 7000) : duration);
}

// ---------------------------------------------------------------- sheet (modal)

export function openSheet(build) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  backdrop.appendChild(sheet);
  const previouslyFocused = document.activeElement;
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    previouslyFocused?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      // keep keyboard focus inside the dialog
      const f = [...sheet.querySelectorAll('a[href],button:not([disabled]),input,textarea,select')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  build(sheet, close);
  document.body.appendChild(backdrop);
  (sheet.querySelector('[autofocus]') || sheet.querySelector('input,textarea,button'))?.focus();
  return close;
}

// Ask for an optional instruction before an AI regeneration.
export function askInstruction({ title, sub, placeholder, confirmLabel = 'Regenerate' }) {
  return new Promise((resolve) => {
    openSheet((sheet, close) => {
      sheet.innerHTML = `
        <h3></h3><p class="sub"></p>
        <div class="field">
          <label for="ins">Anything you'd like changed? <span class="optional">(optional)</span></label>
          <input id="ins" type="text" maxlength="200" autofocus>
        </div>
        <div class="row"><button type="button" class="btn btn-secondary" data-x>Cancel</button><button type="button" class="btn btn-primary" data-go></button></div>`;
      sheet.querySelector('h3').textContent = title;
      sheet.querySelector('.sub').textContent = sub;
      const input = sheet.querySelector('#ins');
      input.placeholder = placeholder || 'e.g. make it shorter, more Hinglish, cheaper';
      sheet.querySelector('[data-go]').textContent = confirmLabel;
      const done = (v) => { close(); resolve(v); };
      sheet.querySelector('[data-x]').onclick = () => done(null);
      sheet.querySelector('[data-go]').onclick = () => done(input.value.trim());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value.trim()); });
    });
  });
}

// Plain yes/no confirmation for destructive actions.
export function confirmSheet({ title, sub, confirmLabel = 'Continue', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    openSheet((sheet, close) => {
      sheet.innerHTML = `<h3></h3><p class="sub"></p><div class="row"><button type="button" class="btn btn-secondary" data-x></button><button type="button" class="btn btn-primary" data-go autofocus></button></div>`;
      sheet.querySelector('h3').textContent = title;
      sheet.querySelector('.sub').textContent = sub;
      sheet.querySelector('[data-x]').textContent = cancelLabel;
      sheet.querySelector('[data-go]').textContent = confirmLabel;
      sheet.querySelector('[data-x]').onclick = () => { close(); resolve(false); };
      sheet.querySelector('[data-go]').onclick = () => { close(); resolve(true); };
    });
  });
}

// ---------------------------------------------------------------- edit keys (no accounts in v1)

const KEYS = 'cl_edit_keys';
export function saveEditKey(id, key) {
  try {
    const all = JSON.parse(localStorage.getItem(KEYS) || '{}');
    all[id] = { key, at: Date.now() };
    localStorage.setItem(KEYS, JSON.stringify(all));
  } catch { /* private mode */ }
}
export function getEditKey(id) {
  try { return JSON.parse(localStorage.getItem(KEYS) || '{}')[id]?.key || null; } catch { return null; }
}
export function lastStore() {
  try {
    const all = Object.entries(JSON.parse(localStorage.getItem(KEYS) || '{}'));
    all.sort((a, b) => b[1].at - a[1].at);
    return all[0] ? { id: all[0][0], key: all[0][1].key } : null;
  } catch { return null; }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
