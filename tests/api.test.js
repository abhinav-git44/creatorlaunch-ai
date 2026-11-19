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

async function call(p, { method = 'GET', body, key, ip } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || `10.0.0.${ipCounter++}`, ...(key ? { 'x-edit-key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

const input = (over = {}) => ({
  mode: 'describe', name: 'Riya Sharma', handle: '', niche: 'Fitness', audienceSize: 'small', language: 'en',
  description: 'I teach 15 minute home workouts to working women with back pain.', ...over,
});

async function makeStore(over) {
  const g = await call('/api/generate', { method: 'POST', body: { input: input(over) } });
  assert.equal(g.status, 200, g.text);
  const s = await call('/api/stores', { method: 'POST', body: { input: g.json.input, content: g.json.content } });
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
    assert.match(r.text, /Build your own store/);
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
