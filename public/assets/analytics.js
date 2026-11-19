// Anonymous, privacy-conscious analytics for the browser.
// Session = random UUID kept in localStorage; a new one starts after 30 minutes of inactivity.
// Events are batched and sent with keepalive so clicks that navigate away are still recorded.
const KEY = 'cl_session';
const IDLE_MS = 30 * 60 * 1000;

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let memorySession = null;
export function sessionId() {
  const now = Date.now();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    const id = s && now - s.last < IDLE_MS ? s.id : uuid();
    localStorage.setItem(KEY, JSON.stringify({ id, last: now }));
    return id;
  } catch {
    memorySession = memorySession || uuid();
    return memorySession;
  }
}

let queue = [];
let timer = null;
let editKey = null;

export function setEditKey(k) { editKey = k; }

export function track(name, { meta, storeId, slug } = {}) {
  queue.push({ id: uuid(), name, meta, storeId, slug });
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

export function flush() {
  clearTimeout(timer);
  if (!queue.length) return;
  const events = queue.splice(0, 20);
  try {
    fetch('/api/events', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', 'x-session-id': sessionId(), ...(editKey ? { 'x-edit-key': editKey } : {}) },
      body: JSON.stringify({ events }),
    }).catch(() => {});
  } catch { /* analytics must never break the page */ }
  if (queue.length) flush();
}

addEventListener('pagehide', flush);
