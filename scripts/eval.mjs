// Runs the 30-case evaluation against a deployed CreatorLaunch AI (real Gemini, real validation).
//   BASE_URL=https://creatorlaunch-ai1.vercel.app node scripts/eval.mjs
// Options (env): DELAY_MS (default 65000; the deployed generate endpoint allows 10 per 10 min per IP),
//                ONLY=id1,id2 to run a subset.
// Writes evals/results-<timestamp>.json and prints a summary. Nothing is saved to the app's database
// (/api/generate does not create stores) and no analytics session is sent, so evals never touch metrics.
import { readFile, writeFile } from 'node:fs/promises';
import { scoreCase } from './eval-score.mjs';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
if (!BASE) { console.error('Set BASE_URL to the deployed app.'); process.exit(1); }
const DELAY = Number(process.env.DELAY_MS ?? 65000);
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const cases = JSON.parse(await readFile(new URL('../evals/cases.json', import.meta.url))).filter((c) => !only.length || only.includes(c.id));

const results = [];
for (const [i, c] of cases.entries()) {
  const t0 = Date.now();
  const input = { mode: 'describe', name: 'Eval Creator', description: c.description, niche: c.niche, audienceSize: c.audienceSize, language: c.language, tone: c.tone };
  let row;
  try {
    const res = await fetch(`${BASE}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) });
    const body = await res.json();
    if (!res.ok) row = { id: c.id, status: res.status, error: body?.error?.code || 'error', ms: Date.now() - t0 };
    else {
      const out = { headline: body.content.creator.headline, bio: body.content.creator.bio, products: body.content.products };
      row = { id: c.id, status: 200, ms: Date.now() - t0, inputQuality: body.inputQuality, ...scoreCase(c, out), sample: { headline: out.headline, products: out.products.map((p) => [p.format, p.priceInr, p.title]) } };
    }
  } catch (err) {
    row = { id: c.id, status: 0, error: err.message, ms: Date.now() - t0 };
  }
  results.push(row);
  console.log(`${String(i + 1).padStart(2)}/${cases.length} ${c.id.padEnd(9)} ${row.status} ${row.score ?? row.error} ${row.flags?.length ? 'FLAGS: ' + row.flags.join(',') : ''}`);
  if (i < cases.length - 1) await new Promise((r) => setTimeout(r, DELAY));
}

const ok = results.filter((r) => r.status === 200 && r.score !== undefined);
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const dims = ok.length ? Object.keys(ok[0].dims) : [];
const summary = {
  runAt: new Date().toISOString(), base: BASE, cases: cases.length, succeeded: ok.length,
  meanScore: mean(ok.map((r) => r.score)),
  byDimension: Object.fromEntries(dims.map((d) => [d, mean(ok.map((r) => r.dims[d] * 100))])),
  medianLatencyMs: ok.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(ok.length / 2)] ?? null,
  flagged: ok.filter((r) => r.flags.length).map((r) => ({ id: r.id, flags: r.flags })),
};
await writeFile(new URL(`../evals/results-${Date.now()}.json`, import.meta.url), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
