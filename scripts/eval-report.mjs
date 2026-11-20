// Aggregate report over an eval results file (evals/results-*.json or a browser export).
//   node scripts/eval-report.mjs evals/results-<run>.json
// Adds two cross-store checks the per-case rubric can't see:
//   - template repetition: share of stores whose shape is "ebook entry + … + 1:1 call"
//   - rationale language: for Hinglish/Hindi stores, share of price reasons written in that register
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
const data = JSON.parse(await readFile(file, 'utf8'));
const rows = (data.results || data).filter((r) => r.status === 200);
const all = data.results || data;
const cases = JSON.parse(await readFile(new URL('../evals/cases.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

const products = (r) => r.products.map((p) => ({ f: p.f ?? p.format, p: p.p ?? p.priceInr, r: p.r ?? p.priceRationale }));
const shape = (r) => { const ps = products(r).sort((a, b) => a.p - b.p); return { entry: ps[0].f, top: ps[ps.length - 1].f }; };
const templ = rows.filter((r) => { const s = shape(r); return s.entry === 'ebook' && s.top === 'one_on_one_call'; }).length;
const entryFormats = {}; const topFormats = {};
for (const r of rows) { const s = shape(r); entryFormats[s.entry] = (entryFormats[s.entry] || 0) + 1; topFormats[s.top] = (topFormats[s.top] || 0) + 1; }

const HINGLISH = /\b(hai|hain|ke|ki|ka|mein|aur|se|ko|liye|sath|saath|bhi|aap|apne|karo|karein)\b/i;
let langTotal = 0; let langOk = 0;
for (const r of rows) {
  const lang = byId[r.id]?.language;
  if (lang !== 'hinglish' && lang !== 'hi') continue;
  for (const p of products(r)) {
    langTotal++;
    if (lang === 'hi' ? /[ऀ-ॿ]/.test(p.r || '') : HINGLISH.test(p.r || '')) langOk++;
  }
}

const dims = rows[0]?.dims ? Object.keys(rows[0].dims) : [];
const report = {
  file,
  attempted: all.length,
  succeeded: rows.length,
  failed: all.filter((r) => r.status !== 200).map((r) => ({ id: r.id, status: r.status, error: r.error })),
  meanRubricScore: mean(rows.map((r) => r.score)),
  byDimensionPct: Object.fromEntries(dims.map((d) => [d, mean(rows.map((r) => r.dims[d] * 100))])),
  safetyFlags: rows.filter((r) => r.flags?.length).map((r) => ({ id: r.id, flags: r.flags })),
  medianLatencyMs: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
  clarification: all.filter((r) => byId[r.id]?.expectClarification).map((r) => ({ id: r.id, asked: r.q === 'needs_more_detail', question: r.cq })),
  crossStore: {
    templateRepetitionPct: pct(templ, rows.length),
    entryFormats,
    topFormats,
    rationaleInStoreLanguagePct: pct(langOk, langTotal),
  },
};
console.log(JSON.stringify(report, null, 2));
