// End-to-end API tests: runs the real dev server + real handlers + file storage, with the
// LLM replaced by tests/fake-gemini.js. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startFakeGemini } from './fake-gemini.js';

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
let fake; let server; let dataDir;
let ipCounter = 1;

before(async () => {
  fake = await startFakeGemini(0);
  dataDir = mkdtempSync(path.join(tmpdir(), 'cl-test-'));
  server = spawn(process.execPath, ['dev-server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      GEMINI_API_KEY: 'test-key',
      GEMINI_BASE_URL: `http://localhost:${fake.address().port}`,
      LLM_TIMEOUT_MS: '1500',
      DATA_DIR: dataDir,
      DEV_LOG: '0',
      METRICS_TOKEN: 'test-metrics-token-1234567890',
      SUPABASE_URL: '',
      VERCEL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); });
    server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
});
after(() => { server?.kill(); fake?.close(); rmSync(dataDir, { recursive: true, force: true }); });

async function call(p, { method = 'GET', body, key, ip, session, headers = {}, redirect } = {}) {
  const res = await fetch(BASE + p, {
    method,
    redirect: redirect || 'follow',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || `10.0.0.${ipCounter++}`, ...(key ? { 'x-edit-key': key } : {}), ...(session ? { 'x-session-id': session } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, headers: res.headers };
}

const input = (over = {}) => ({
  mode: 'describe', name: 'Riya Sharma', handle: '', niche: 'Fitness', audienceSize: 'small', language: 'en',
  description: 'I teach 15 minute home workouts to working women with back pain.', ...over,
});

async function makeStore(over, session) {
  const g = await call('/api/generate', { method: 'POST', body: { input: input(over) }, session });
  assert.equal(g.status, 200, g.text);
  const s = await call('/api/stores', { method: 'POST', body: { input: g.json.input, content: g.json.content }, session });
  assert.equal(s.status, 201, s.text);
  return { ...s.json, content: g.json.content };
}

// ------------------------------------------------------------------ generation

test('health reports AI configured and file storage', async () => {
  const r = await call('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ai.configured, true);
  assert.equal(r.json.storage, 'file');
  assert.ok(!JSON.stringify(r.json).includes('test-key'), 'never leaks the key');
});

test('generate returns validated content with pricing guardrails and sanitised text', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input() } });
  assert.equal(r.status, 200, r.text);
  const c = r.json.content;
  assert.equal(c.creator.displayName, 'Riya Sharma', 'creator name wins over model rewrite');
  assert.equal(c.products.length, 3);
  assert.equal(c.products[0].priceInr, 499, 'ebook 523 snaps to 499');
  assert.equal(c.products[1].priceInr, 4999, '1:1 call 99999 clamps to band max');
  assert.equal(c.products[2].priceInr, 999, 'cohort 10 clamps to band min');
  for (const p of c.products) {
    assert.ok(!p.description.includes('<'), 'no markup survives');
    assert.match(p.id, /^[a-z0-9]{8}$/);
  }
  assert.equal(c.theme.style, 'bold');
  assert.equal(r.json.inputQuality, 'ok');
});

test('empty description is rejected before any AI call', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: '' }) } });
  assert.equal(r.status, 422);
  assert.ok(r.json.error.fields.description);
});

test('gibberish and one-word descriptions are rejected with guidance', async () => {
  for (const description of ['asdfghjkl qwerty', 'zzzzzzzzzz', 'fitness']) {
    const r = await call('/api/generate', { method: 'POST', body: { input: input({ description }) } });
    assert.equal(r.status, 422, description);
    assert.ok(r.json.error.fields.description.length > 20);
  }
});

test('Hinglish and Hindi descriptions are accepted', async () => {
  for (const description of ['Main SSC CGL ki tayari karwati hoon, maths tricks sikhati hoon', 'मैं घर पर योग सिखाती हूँ, कामकाजी महिलाओं के लिए']) {
    const r = await call('/api/generate', { method: 'POST', body: { input: input({ description, language: 'hinglish' }) } });
    assert.equal(r.status, 200, description);
  }
});

test('invalid Instagram handle is rejected; valid handle is normalised and never "analysed"', async () => {
  const bad = await call('/api/generate', { method: 'POST', body: { input: input({ mode: 'instagram', handle: 'bad..handle!!' }) } });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.error.fields.handle);
  const ok = await call('/api/generate', { method: 'POST', body: { input: input({ mode: 'instagram', name: '', handle: 'https://instagram.com/Riya.Fit/' }) } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.input.handle, 'riya.fit');
});

test('vague input returns a clarifying question instead of a silent bad store', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I make content online FAKE_VAGUE' }) } });
  assert.equal(r.status, 200);
  assert.equal(r.json.inputQuality, 'needs_more_detail');
  assert.ok(r.json.clarifyingQuestion.length > 5);
});

test('malformed AI JSON is retried once and then succeeds', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_BADJSON_ONCE' }) } });
  assert.equal(r.status, 200, r.text);
});

test('AI 5xx is retried once and then succeeds', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_500_ONCE' }) } });
  assert.equal(r.status, 200, r.text);
});

test('persistently malformed AI output becomes a friendly retryable error', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_BADJSON_ALWAYS' }) } });
  assert.equal(r.status, 502);
  assert.equal(r.json.error.code, 'bad_output');
  assert.match(r.json.error.message, /Try again/);
});

test('AI output that breaks the schema (1 product) is never passed through', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_ONE_PRODUCT' }) } });
  assert.equal(r.status, 502);
});

test('if the model rejects the response schema, we retry without it and still validate', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_400_SCHEMA' }) } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.content.products[0].priceInr, 499);
});

test('when the primary model is overloaded (503) we fall back to the second model and succeed', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_503_PRIMARY' }) } });
  assert.equal(r.status, 200, r.text);
});

test('primary overloaded + fallback hanging: we switch back to the primary and succeed', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_503_SLOW_FALLBACK' }) } });
  assert.equal(r.status, 200, r.text);
});

test('if every model is overloaded, retries are exhausted and the creator gets a calm retry message', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_503_ALL' }) } });
  assert.equal(r.status, 502);
  assert.equal(r.json.error.code, 'unavailable');
  assert.equal(r.json.error.retryable, true);
});

test('AI rate limit maps to 429 with a calm message', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_429' }) } });
  assert.equal(r.status, 429);
  assert.equal(r.json.error.code, 'rate_limited');
});

test('slow AI times out cleanly', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_TIMEOUT' }) } });
  assert.equal(r.status, 504);
  assert.equal(r.json.error.code, 'timeout');
});

test('our own rate limit stops runaway generation from one IP', async () => {
  const ip = '192.168.50.50';
  let last;
  for (let i = 0; i < 11; i++) last = await call('/api/generate', { method: 'POST', body: { input: input() }, ip });
  assert.equal(last.status, 429);
});

// ------------------------------------------------------------------ stores + editing

test('store is only readable with its edit key', async () => {
  const { id, editKey } = await makeStore();
  assert.equal((await call(`/api/stores/${id}`)).status, 404);
  assert.equal((await call(`/api/stores/${id}`, { key: 'wrong' })).status, 404);
  assert.equal((await call('/api/stores/not-a-uuid', { key: editKey })).status, 404);
  const ok = await call(`/api/stores/${id}`, { key: editKey });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'draft');
  assert.ok(!('edit_key_hash' in ok.json), 'hash never leaves the server');
});

test('edited price persists; invalid edits are rejected without touching saved data', async () => {
  const { id, editKey, content } = await makeStore();
  content.products[0].priceInr = 349;
  content.products[0].title = 'My <b>edited</b> title';
  const p = await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content } });
  assert.equal(p.status, 200, p.text);
  const after1 = await call(`/api/stores/${id}`, { key: editKey });
  assert.equal(after1.json.content.products[0].priceInr, 349, 'creator price kept exactly (no guardrail on edits)');
  assert.equal(after1.json.content.products[0].title, 'My edited title');

  const broken = structuredClone(content);
  broken.products[0].priceInr = -5;
  assert.equal((await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: broken } })).status, 422);
  broken.products = [];
  assert.equal((await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: broken } })).status, 422);
  const after2 = await call(`/api/stores/${id}`, { key: editKey });
  assert.equal(after2.json.content.products[0].priceInr, 349);
});

test('regenerating the bio returns only the bio and saves nothing', async () => {
  const { id, editKey, content } = await makeStore();
  const r = await call('/api/regenerate', { method: 'POST', key: editKey, body: { id, target: 'bio', content } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(Object.keys(r.json).sort(), ['creator', 'target']);
  assert.equal(r.json.creator.headline, 'A brand new headline');
  const stored = await call(`/api/stores/${id}`, { key: editKey });
  assert.equal(stored.json.content.creator.headline, content.creator.headline);
});

test('regenerating one product keeps its id and returns only that product', async () => {
  const { id, editKey, content } = await makeStore();
  const target = content.products[1];
  const r = await call('/api/regenerate', { method: 'POST', key: editKey, body: { id, target: 'product', productId: target.id, content } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.product.id, target.id);
  assert.equal(r.json.product.format, 'template_pack');
  assert.ok(!r.json.content);
});

test('price regeneration goes through the guardrail', async () => {
  const { id, editKey, content } = await makeStore();
  const r = await call('/api/regenerate', { method: 'POST', key: editKey, body: { id, target: 'price', productId: content.products[0].id, content } });
  assert.equal(r.status, 200);
  assert.equal(r.json.price.priceInr, 799, '777 snaps to 799 for an ebook');
});

test('add_product is refused at 4 products; failed regeneration says content is unchanged', async () => {
  const { id, editKey, content } = await makeStore();
  const four = structuredClone(content);
  four.products.push({ ...content.products[0], id: 'extra001' });
  const r = await call('/api/regenerate', { method: 'POST', key: editKey, body: { id, target: 'add_product', content: four } });
  assert.equal(r.status, 400);
  const f = await call('/api/regenerate', { method: 'POST', key: editKey, body: { id, target: 'bio', content, instruction: 'FAKE_BADJSON_ALWAYS' } });
  assert.equal(f.status, 502);
  assert.match(f.json.error.message, /unchanged/);
  assert.equal((await call('/api/regenerate', { method: 'POST', key: 'nope', body: { id, target: 'bio' } })).status, 404);
});

// ------------------------------------------------------------------ publishing

test('publish creates a public page, is idempotent, and reflects later edits', async () => {
  const { id, editKey, content } = await makeStore({ name: 'Publish Tester' });
  const p1 = await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: { content } });
  assert.equal(p1.status, 200, p1.text);
  assert.equal(p1.json.slug, 'publish-tester');
  assert.ok(p1.json.url.endsWith('/s/publish-tester'));
  const p2 = await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: { content } });
  assert.equal(p2.json.slug, 'publish-tester', 'repeat publish keeps the same link');
  assert.equal(p2.json.publishedAt, p1.json.publishedAt);

  const page = await call('/s/publish-tester');
  assert.equal(page.status, 200);
  assert.match(page.text, /Publish Tester/);
  assert.match(page.text, /₹499/);
  assert.ok(!page.text.includes('<script>alert'), 'AI text is escaped/sanitised');

  content.products[0].title = 'Freshly edited title';
  await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content } });
  assert.match((await call('/s/publish-tester')).text, /Freshly edited title/);
});

test('slug collisions get a unique link; taken or reserved custom links are explained', async () => {
  const a = await makeStore({ name: 'Same Name' });
  const b = await makeStore({ name: 'Same Name' });
  const pa = await call(`/api/stores/${a.id}/publish`, { method: 'POST', key: a.editKey, body: {} });
  const pb = await call(`/api/stores/${b.id}/publish`, { method: 'POST', key: b.editKey, body: {} });
  assert.equal(pa.json.slug, 'same-name');
  assert.equal(pb.json.slug, 'same-name-2');

  const c = await makeStore({ name: 'Third Person' });
  const taken = await call(`/api/stores/${c.id}/publish`, { method: 'POST', key: c.editKey, body: { slug: 'same-name' } });
  assert.equal(taken.status, 409);
  assert.equal(taken.json.error.suggestion, 'same-name-3');
  const reserved = await call(`/api/stores/${c.id}/publish`, { method: 'POST', key: c.editKey, body: { slug: 'admin' } });
  assert.equal(reserved.status, 422);
  const custom = await call(`/api/stores/${c.id}/publish`, { method: 'POST', key: c.editKey, body: { slug: 'my-custom-link' } });
  assert.equal(custom.json.slug, 'my-custom-link');
});

test('unpublish takes the page offline; republishing keeps the link', async () => {
  const { id, editKey } = await makeStore({ name: 'Offline Test' });
  await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: {} });
  assert.equal((await call('/s/offline-test')).status, 200);
  assert.equal((await call(`/api/stores/${id}/publish`, { method: 'DELETE', key: editKey })).status, 200);
  const gone = await call('/s/offline-test');
  assert.equal(gone.status, 404);
  assert.match(gone.text, /isn&#39;t live/);
  const back = await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: {} });
  assert.equal(back.json.slug, 'offline-test');
});

test('unknown or malformed store links show a friendly page, never an error dump', async () => {
  for (const p of ['/s/does-not-exist', '/s/%3Cscript%3E', '/s/ab']) {
    const r = await call(p);
    assert.equal(r.status, 404);
    assert.match(r.text, /Create your own store/);
  }
});

test('script injection in creator input is stripped everywhere', async () => {
  const { id, editKey, content } = await makeStore({ name: 'Evil <script>alert(1)</script> Name' });
  const got = await call(`/api/stores/${id}`, { key: editKey });
  assert.ok(!got.json.content.creator.displayName.includes('<'));
  await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: { content } });
  const page = await call(`/s/${(await call(`/api/stores/${id}`, { key: editKey })).json.slug}`);
  assert.ok(!page.text.includes('<script>alert(1)'));
});

test('static pages and clean URLs are served', async () => {
  assert.equal((await call('/')).status, 200);
  const edit = await call('/edit/00000000-0000-0000-0000-000000000000');
  assert.equal(edit.status, 200);
  assert.match(edit.text, /editor\.js/);
  assert.equal((await call('/api/nope')).status, 404);
  assert.equal((await call('/api/generate')).status, 405);
});

// ------------------------------------------------------------------ v2: AI validation additions

test('empty model output is treated as a failure, never as an empty store', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_EMPTY' }) } });
  assert.equal(r.status, 502);
  assert.equal(r.json.error.code, 'bad_output');
});

test('AI output with duplicate product ideas is rejected (retried, then a friendly error)', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ description: 'I teach yoga to office workers FAKE_DUP' }) } });
  assert.equal(r.status, 502);
});

test('generated products carry a hidden AI snapshot and the handle becomes the Instagram destination', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: input({ mode: 'instagram', handle: 'riya.fit' }) } });
  assert.equal(r.status, 200);
  assert.equal(r.json.content.links.instagram, 'riya.fit');
  assert.equal(r.json.content.products[0].ai.priceInr, 499);
  assert.equal(r.json.content.tone, 'friendly');
});

// ------------------------------------------------------------------ v2: buyer destinations (CTA)

test('payment links and WhatsApp numbers are validated; unsafe links are refused', async () => {
  const { id, editKey, content } = await makeStore();
  for (const bad of ['javascript:alert(1)', 'https://user:pass@evil.com', 'http://localhost:3000/x', 'not a url at all']) {
    const c = structuredClone(content);
    c.products[0].buyUrl = bad;
    const r = await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: c } });
    assert.equal(r.status, 422, bad);
  }
  const badWa = structuredClone(content);
  badWa.links = { whatsapp: '12345' };
  assert.equal((await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: badWa } })).status, 422);

  const good = structuredClone(content);
  good.products[0].buyUrl = 'rzp.io/l/yoga-guide';
  good.links = { whatsapp: '+91 98765 43210', instagram: '@Riya.Fit', website: 'https://riya.example.com' };
  const ok = await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: good } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.content.products[0].buyUrl, 'https://rzp.io/l/yoga-guide');
  assert.deepEqual(ok.json.content.links, { whatsapp: '919876543210', instagram: 'riya.fit', website: 'https://riya.example.com/' });
});

test('public page routes each button to a real destination and opens external links safely', async () => {
  const { id, editKey, content } = await makeStore({ name: 'Cta Tester' });
  content.products[0].buyUrl = 'https://rzp.io/l/abc';
  content.links = { whatsapp: '9876543210', instagram: '', website: '' };
  await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: { content } });
  const page = (await call('/s/cta-tester')).text;
  assert.match(page, /href="https:\/\/rzp\.io\/l\/abc" target="_blank" rel="noopener noreferrer nofollow" data-cta="payment_link"/);
  assert.match(page, /href="https:\/\/wa\.me\/919876543210\?text=[^"]+"[^>]*data-cta="whatsapp"/);
  assert.ok(!/data-cta="info"/.test(page), 'no dead-end buttons when a destination exists');
  assert.match(page, /<link rel="canonical" href="http:\/\/localhost:\d+\/s\/cta-tester">/);
  assert.match(page, /<meta property="og:title"/);
  assert.match(page, /<meta name="twitter:card" content="summary">/);
  assert.match(page, /<script type="module" src="\/assets\/store\.js"><\/script>/);
  assert.ok(!/<script>/.test(page), 'no inline scripts (CSP-compatible)');
});

// ------------------------------------------------------------------ v2: security headers + routing

test('security headers: strict CSP on public pages and the app; slugs are case-insensitive', async () => {
  const { id, editKey } = await makeStore({ name: 'Header Check' });
  await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: {} });
  const pub = await call('/s/header-check');
  assert.match(pub.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(pub.headers.get('content-security-policy'), /default-src 'none'/);
  const app = await call('/');
  assert.match(app.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(app.headers.get('x-content-type-options'), 'nosniff');
  const upper = await call('/s/Header-Check', { redirect: 'manual' });
  assert.equal(upper.status, 301);
  assert.equal(upper.headers.get('location'), '/s/header-check');
});

// ------------------------------------------------------------------ v2: analytics + metrics

const sid = () => crypto.randomUUID();

test('events need a session, are de-duplicated, and store events need the edit key', async () => {
  const s = sid();
  assert.equal((await call('/api/events', { method: 'POST', body: { events: [{ id: sid(), name: 'onboarding_started' }] } })).status, 400, 'no session → rejected');
  const ev = { id: sid(), name: 'onboarding_started', meta: { mode: 'describe', secret: 'drop-me' } };
  const a = await call('/api/events', { method: 'POST', session: s, body: { events: [ev, ev, { id: sid(), name: 'not_a_real_event' }] } });
  assert.equal(a.status, 202);
  assert.equal(a.json.accepted, 2, 'unknown event names are dropped');
  const { id } = await makeStore();
  const noKey = await call('/api/events', { method: 'POST', session: s, body: { events: [{ id: sid(), name: 'store_previewed', storeId: id }] } });
  assert.equal(noKey.status, 202);
});

test('metrics endpoint is locked down', async () => {
  assert.equal((await call('/api/metrics')).status, 401);
  assert.equal((await call('/api/metrics', { headers: { 'x-admin-token': 'wrong-token-wrong-token-xx' } })).status, 401);
});

test('funnel metrics follow the documented definitions (first session publish, time to publish, material edits)', async () => {
  const before = (await call('/api/metrics', { headers: { 'x-admin-token': 'test-metrics-token-1234567890' } })).json;
  const s1 = sid(); const s2 = sid();
  // Session 1: starts, generates, publishes in the same session, editing 1 AI product materially.
  await call('/api/events', { method: 'POST', session: s1, body: { events: [{ id: sid(), name: 'onboarding_started' }] } });
  const st = await makeStore({ name: 'Metric One' }, s1);
  const c = structuredClone(st.content);
  c.products[0].title = 'Totally different title I wrote';
  await call(`/api/stores/${st.id}/publish`, { method: 'POST', key: st.editKey, session: s1, body: { content: c } });
  await call(`/api/stores/${st.id}/publish`, { method: 'POST', key: st.editKey, session: s1, body: { content: c } }); // repeat click
  // Session 2: starts but never publishes.
  await call('/api/events', { method: 'POST', session: s2, body: { events: [{ id: sid(), name: 'onboarding_started' }, { id: sid(), name: 'onboarding_started' }] } });
  // Public views: same session twice the same day counts once.
  const v = sid();
  for (let i = 0; i < 2; i++) await call('/api/events', { method: 'POST', session: v, body: { events: [{ id: sid(), name: 'storefront_viewed', slug: 'metric-one' }] } });
  await call('/api/events', { method: 'POST', session: v, body: { events: [{ id: sid(), name: 'product_cta_clicked', slug: 'metric-one', meta: { destination: 'instagram' } }] } });

  const after = (await call('/api/metrics', { headers: { 'x-admin-token': 'test-metrics-token-1234567890' } })).json;
  const d = (k) => after.counts[k] - before.counts[k];
  assert.equal(d('onboardingStarts'), 2, 'two eligible sessions (duplicate start in s2 ignored)');
  assert.equal(d('firstPublishes'), 1, 'repeat publish not double-counted');
  assert.equal(d('storefrontViews'), 1, 'view de-duplicated per session per day');
  assert.equal(d('productCtaClicks'), 1);
  assert.ok(after.rates.medianMinutesToFirstPublish !== null);
  assert.ok(after.rates.aiMaterialEditRatePct > 0);
  assert.match(after.notCalculated.fourteenDayFirstSaleRate, /order/);
  assert.match(after.dataSource, /no demo/);
});

test('full regeneration keeps the creator\'s contact links', async () => {
  const { id, editKey, content } = await makeStore();
  content.links = { whatsapp: '9876543210' };
  await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content } });
  const r = await call('/api/regenerate', { method: 'POST', key: editKey, body: { id, target: 'all', content } });
  assert.equal(r.status, 200);
  assert.equal(r.json.content.links.whatsapp, '919876543210');
});

// ------------------------------------------------------------------ v3: Instagram screenshot import

const png = (text = '') => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`fake-png ${text} `.padEnd(200, '.'))]).toString('base64');
const igInput = (over = {}) => ({ mode: 'instagram', name: '', handle: '', description: '', language: 'en', tone: 'friendly', ownAccount: true, ...over });

test('screenshots alone build a store: handle, audience size and profile notes come from the reading; images are not stored', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: igInput(), images: [{ mime: 'image/png', data: png('HANDLE:riya.fit') }] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.profileRead.readable, true);
  assert.equal(r.json.input.handle, 'riya.fit');
  assert.equal(r.json.input.audienceSize, 'mid');
  assert.match(r.json.input.profileNotes, /home workouts/);
  assert.equal(r.json.content.links.instagram, 'riya.fit');
  const s = await call('/api/stores', { method: 'POST', body: { input: r.json.input, content: r.json.content } });
  assert.equal(s.status, 201, s.text);
  const got = await call(`/api/stores/${s.json.id}`, { key: s.json.editKey });
  assert.match(got.json.input.profileNotes, /home workouts/);
  assert.ok(!JSON.stringify(got.json).includes('fake-png'), 'screenshot data is never stored');
  // later regenerations still see the profile reading
  const b = await call('/api/regenerate', { method: 'POST', key: s.json.editKey, body: { id: s.json.id, target: 'bio', content: r.json.content } });
  assert.equal(b.json.creator.headline, 'Profile-aware headline');
});

test('screenshots require confirming they are your own account', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: igInput({ ownAccount: false }), images: [{ mime: 'image/png', data: png() }] } });
  assert.equal(r.status, 422);
  assert.ok(r.json.error.fields.ownAccount);
});

test('unreadable screenshots: clear error without a description; fall back to the description when there is one', async () => {
  const a = await call('/api/generate', { method: 'POST', body: { input: igInput(), images: [{ mime: 'image/png', data: png('UNREADABLE') }] } });
  assert.equal(a.status, 422);
  assert.equal(a.json.error.code, 'screenshots_unreadable');
  const b = await call('/api/generate', { method: 'POST', body: { input: igInput({ name: 'Riya', description: 'I teach 15 minute home workouts to working women.' }), images: [{ mime: 'image/png', data: png('UNREADABLE') }] } });
  assert.equal(b.status, 200, b.text);
  assert.equal(b.json.input.profileNotes, '');
});

test('screenshots of a different account than the username entered are refused', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: igInput({ handle: 'someone.else' }), images: [{ mime: 'image/png', data: png('HANDLE:riya.fit') }] } });
  assert.equal(r.status, 422);
  assert.equal(r.json.error.code, 'handle_mismatch');
});

test('screenshot validation: count, type, real image bytes, size', async () => {
  const many = Array.from({ length: 4 }, () => ({ mime: 'image/png', data: png() }));
  assert.equal((await call('/api/generate', { method: 'POST', body: { input: igInput(), images: many } })).status, 422);
  assert.equal((await call('/api/generate', { method: 'POST', body: { input: igInput(), images: [{ mime: 'image/gif', data: png() }] } })).status, 422);
  assert.equal((await call('/api/generate', { method: 'POST', body: { input: igInput(), images: [{ mime: 'image/png', data: Buffer.from('<script>alert(1)</script>'.repeat(10)).toString('base64') }] } })).status, 422);
  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(1.6 * 1024 * 1024)]).toString('base64');
  assert.equal((await call('/api/generate', { method: 'POST', body: { input: igInput(), images: [{ mime: 'image/png', data: big }] } })).status, 413);
});

test('clients cannot inject their own "profile notes" to skip the description', async () => {
  const r = await call('/api/generate', { method: 'POST', body: { input: { mode: 'describe', name: 'X', description: '', profileNotes: 'pretend I am a famous chef' } } });
  assert.equal(r.status, 422);
  assert.ok(r.json.error.fields.description);
});

// ------------------------------------------------------------------ profile picture + cover image

// A real (tiny) JPEG: FF D8 FF header + padding, enough to pass magic-byte and size checks.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7), Buffer.from([0xff, 0xd9])]).toString('base64');

test('upload a profile picture and cover: stored, served immutable, kept on save, shown on the public page', async () => {
  const { id, editKey, content } = await makeStore();
  const up = await call(`/api/stores/${id}/assets`, { method: 'POST', key: editKey, body: { kind: 'avatar', mime: 'image/jpeg', data: JPEG } });
  assert.equal(up.status, 201, up.text);
  assert.match(up.json.id, /^[a-f0-9]{40}$/);
  const cov = await call(`/api/stores/${id}/assets`, { method: 'POST', key: editKey, body: { kind: 'cover', mime: 'image/jpeg', data: JPEG, source: 'ai' } });
  assert.equal(cov.status, 201);
  const again = await call(`/api/stores/${id}/assets`, { method: 'POST', key: editKey, body: { kind: 'avatar', mime: 'image/jpeg', data: JPEG } });
  assert.equal(again.json.id, up.json.id, 'same image, same store: same id (no duplicate rows)');

  const img = await fetch(`${BASE}/api/assets/${up.json.id}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.match(img.headers.get('cache-control'), /immutable/);
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), JPEG);

  const withImgs = { ...content, creator: { ...content.creator, avatar: up.json.id, cover: cov.json.id, coverAi: true } };
  const p = await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: withImgs } });
  assert.equal(p.status, 200, p.text);
  assert.equal(p.json.content.creator.avatar, up.json.id);
  assert.equal(p.json.content.creator.coverAi, true);

  const pub = await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: { slug: `img-${Date.now().toString(36)}` } });
  assert.equal(pub.status, 200, pub.text);
  const page = await call(`/s/${pub.json.slug}`);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes(`/api/assets/${up.json.id}`), 'avatar on the page');
  assert.ok(page.text.includes(`/api/assets/${cov.json.id}`), 'cover on the page');
  assert.match(page.text, /og:image" content="http[^"]+\/api\/assets\//, 'cover becomes the share image');
});

test('image ids that are not ours are dropped on save; bad uploads are refused', async () => {
  const { id, editKey, content } = await makeStore();
  const bad = { ...content, creator: { ...content.creator, avatar: '../../etc/passwd', cover: 'javascript:alert(1)' } };
  const p = await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: bad } });
  assert.equal(p.status, 200);
  assert.equal(p.json.content.creator.avatar, undefined);
  assert.equal(p.json.content.creator.cover, undefined);

  const post = (body, key = editKey) => call(`/api/stores/${id}/assets`, { method: 'POST', key, body });
  assert.equal((await post({ kind: 'avatar', mime: 'image/jpeg', data: JPEG }, 'wrong-key')).status, 404, 'needs the edit key');
  assert.equal((await post({ kind: 'banner', mime: 'image/jpeg', data: JPEG })).status, 422, 'unknown kind');
  assert.equal((await post({ kind: 'avatar', mime: 'image/svg+xml', data: Buffer.from('<svg onload=alert(1)>').toString('base64') })).status, 422, 'no SVG');
  assert.equal((await post({ kind: 'avatar', mime: 'image/png', data: JPEG })).status, 422, 'bytes must match the type');
  const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(420 * 1024)]).toString('base64');
  assert.equal((await post({ kind: 'avatar', mime: 'image/jpeg', data: huge })).status, 413, 'avatar size cap');
  assert.equal((await fetch(`${BASE}/api/assets/${'0'.repeat(40)}`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/assets/not-an-id`)).status, 404);
});

test('AI cover: built from the description and name, returns an image; needs a description; failures are plain', async () => {
  const { id, editKey } = await makeStore({ description: 'I teach watercolour painting to college students who want a calm weekend hobby.' });
  const r = await call(`/api/stores/${id}/cover`, { method: 'POST', key: editKey, body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.image.mime, 'image/png');
  assert.ok(Buffer.from(r.json.image.data, 'base64').subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  assert.ok(globalThis.__lastImagePrompt.includes('watercolour painting'), 'uses what they do');
  assert.ok(globalThis.__lastImagePrompt.includes('Riya Sharma'), 'uses the name as context');
  assert.match(globalThis.__lastImagePrompt, /no text, letters/i, 'no lettering');
  assert.match(globalThis.__lastImagePrompt, /No recognisable faces/i, 'no likeness of the creator');

  assert.equal((await call(`/api/stores/${id}/cover`, { method: 'POST', key: 'nope', body: {} })).status, 404, 'needs the edit key');

  const blocked = await makeStore({ description: 'FAKE_IMG_BLOCK I teach something the image model refuses to draw.' });
  const b = await call(`/api/stores/${blocked.id}/cover`, { method: 'POST', key: blocked.editKey, body: {} });
  assert.equal(b.status, 200, 'image model refused the topic: falls back to a designed cover');
  assert.equal(b.json.style, 'design');

  const missing = await makeStore({ description: 'FAKE_IMG_404 I teach guitar to beginners who want to play songs fast.' });
  const m = await call(`/api/stores/${missing.id}/cover`, { method: 'POST', key: missing.editKey, body: {} });
  assert.equal(m.status, 200, 'no image model available: the text AI designs the cover instead');
  assert.equal(m.json.style, 'design');
  assert.equal(m.json.image.mime, 'image/svg+xml');
  const svg = Buffer.from(m.json.image.data, 'base64').toString();
  assert.match(svg, /^<svg[^>]+width="1600" height="600"/);
  assert.ok(svg.includes('#1E293B') && svg.includes('#F59E0B'), 'uses the palette the AI picked');
  assert.ok(!/<script|<text|<foreignObject|href=/i.test(svg), 'no script, text or external references');
});

test('AI cover is rate limited per visitor', async () => {
  const { id, editKey } = await makeStore();
  const ip = '10.9.9.9';
  let last;
  for (let i = 0; i < 6; i++) last = await call(`/api/stores/${id}/cover`, { method: 'POST', key: editKey, body: {}, ip });
  assert.equal(last.status, 429);
});

// ------------------------------------------------------------------ testimonials

test('testimonials: creator-written, saved and cleaned; only confirmed ones are public; AI never adds them', async () => {
  const { id, editKey, content } = await makeStore();
  assert.equal(content.testimonials, undefined, 'generation never invents testimonials');
  const testimonials = [
    { id: 'tA1', quote: 'The <b>15-minute</b> routines fixed my back pain.<script>x</script>', name: 'Asha', detail: 'Teacher, Pune', source: 'whatsapp', consent: true },
    { id: 'tB2', quote: 'Not confirmed yet', name: 'Ravi' },
    { id: 'tC3', quote: '', name: '' },
    { quote: 'Confirmed but no name', name: '', consent: true },
  ];
  const p = await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: { ...content, testimonials } } });
  assert.equal(p.status, 200, p.text);
  const saved = p.json.content.testimonials;
  assert.equal(saved.length, 3, 'empty drafts dropped');
  assert.equal(saved[0].quote, 'The 15-minute routines fixed my back pain.x', 'markup stripped');
  assert.equal(saved[0].consent, true);
  assert.equal(saved[1].consent, undefined);

  const pub = await call(`/api/stores/${id}/publish`, { method: 'POST', key: editKey, body: { slug: `tst-${Date.now().toString(36)}` } });
  const page = await call(`/s/${pub.json.slug}`);
  assert.ok(page.text.includes('What people say'));
  assert.ok(page.text.includes('Asha') && page.text.includes('Teacher, Pune'));
  assert.ok(!page.text.includes('Not confirmed yet'), 'unconfirmed testimonial is not public');
  assert.ok(!page.text.includes('Confirmed but no name'), 'incomplete testimonial is not public');
  assert.ok(!page.text.includes('whatsapp</'), 'source is private');

  const many = Array.from({ length: 9 }, (_, i) => ({ quote: `Quote ${i}`, name: `N${i}`, consent: true }));
  const p2 = await call(`/api/stores/${id}`, { method: 'PATCH', key: editKey, body: { content: { ...content, testimonials: many } } });
  assert.equal(p2.json.content.testimonials.length, 6, 'capped at 6');
});

test('testimonial tidy-up: needs a real pasted message, keeps meaning, refuses invented claims', async () => {
  const { id, editKey } = await makeStore();
  const tidy = (raw) => call('/api/regenerate', { method: 'POST', key: editKey, body: { id, target: 'testimonial', raw, name: 'Asha' } });
  const ok = await tidy('hi maam your 15 min routines realy helped my back pain, thank you so much');
  assert.equal(ok.status, 200, ok.text);
  assert.match(ok.json.quote, /^Your 15 min routines/);
  assert.ok(!/\d/.test(ok.json.quote.replace('15', '')), 'no new numbers');

  const empty = await tidy('great');
  assert.equal(empty.status, 422, 'refuses to write one from almost nothing');
  assert.match(empty.json.error.message, /actual message/);

  const invented = await tidy('FAKE_TIDY_INVENT the classes were fun and I feel much better now');
  assert.equal(invented.status, 422, 'output with a number the customer never said is rejected');
  assert.match(invented.json.error.message, /without changing its meaning/);
});
