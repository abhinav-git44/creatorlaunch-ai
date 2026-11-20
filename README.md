# Sell Sphere

**Create. Monetize. Grow.** From expertise to income. In minutes.

Turn a creator's short description (or screenshots of their own Instagram profile) into a ready-to-publish storefront: an AI-written bio, 2–4 distinct product ideas with India-appropriate INR pricing and a reason for each price, product copy, and a mobile landing page at a public, shareable URL with buttons that actually reach the creator.

Built for the SuperProfile *AI Storefront Generator* take-home (PM, AI-native 0→1). The product was first called CreatorLaunch AI; the repo and the Vercel project keep that original name.

- **Live app:** https://creatorlaunch-ai1.vercel.app
- **Decision doc:** [`DECISION_DOC.md`](DECISION_DOC.md) · [PDF](DECISION_DOC.pdf)
- **Loom script:** [`LOOM_SCRIPT.md`](LOOM_SCRIPT.md)
- **Evidence:** [Test report](docs/TEST_REPORT.md) · [Security review](docs/SECURITY_REVIEW.md) · [AI evaluation](docs/AI_EVALUATION.md) · [Baseline audit](docs/BASELINE_AUDIT.md) · [Visual audit](docs/VISUAL_AUDIT.md) · [Submission checklist](docs/FINAL_SUBMISSION_CHECKLIST.md) · [Brand guide](docs/BRAND.md)

## What it does

1. **Describe** (`/`): two lines about what you teach and who it's for, or 1–3 screenshots of your own Instagram profile, which the AI reads for bio, audience size and post themes (screenshots aren't stored; you confirm it's your account). Optional niche, audience size, language (English / Hinglish / हिंदी) and voice (friendly / expert / professional). Instagram is never scraped or logged in to (it blocks automated access, so a pasted profile link can't work), and the page says so.
2. **Generate**: one Gemini call returns structured JSON: bio, theme, 2–4 products, each with a format, an INR price, a one-line "why this price", a pitch, benefits and a description. The server validates every field, strips markup, rejects duplicate or single-format sets, and keeps each price inside its format's band, snapped to familiar Indian price points. Vague input gets one clarifying question.
3. **Edit** (`/edit/:id`): every field is editable with autosave, and each price shows the typical range for its format. AI can regenerate the bio, one product, one price, add a product, or redo the whole store; every AI change can be undone, and full rewrites ask first. **Where buyers go**: WhatsApp number, Instagram, website, and an optional payment link per product.
4. **Publish**: pick `/s/your-name` and share via copy, WhatsApp or the phone's share sheet. The public page is server-rendered with three genuinely different themes. Its buttons go to the payment link, then a pre-filled WhatsApp enquiry, then Instagram, then the website. There's no fake checkout and no dead ends.
5. **Measure** (`/admin`, token-gated): first-session publishing rate, median time to publish, generation success, material-edit rate, views and CTA clicks, all from privacy-safe events.

## Architecture

| Layer | Choice |
|---|---|
| Frontend | Plain HTML, CSS and ES modules, no build step (`public/`) |
| API | Vercel Node serverless functions (`api/`) |
| AI | Gemini REST: structured output (`responseSchema`), server-side validation, retries, fallback model on overload |
| Storage | Supabase Postgres via REST, server-only service key, RLS on with no policies |
| Analytics | `events` table: anonymous session ids, de-duplicated, whitelisted metadata |
| Hosting | Vercel (CSP + security headers in `vercel.json`) |

**Zero npm dependencies.** `public/assets/shared.js` (schema, validation, sanitising, pricing guardrails, link validation) runs in both the browser and the server, and `public/assets/render.js` renders both the editor preview and the public page.

```
api/            generate · stores · store · regenerate · publish · page (/s/:slug) · events · metrics · health
lib/            llm (Gemini client) · prompts · ai · db (Supabase / local file) · events · metrics · http · slug · stores
public/         index.html (create) · edit.html (editor) · admin.html (metrics) · assets/*
supabase/       schema.sql (idempotent) · metrics.sql (reporting queries)
tests/          api.test.js (46) · e2e.cjs (53 browser checks) · fake-gemini.js (test-only)
evals/          cases.json (30 creators) · results-*.json      scripts/  eval.mjs · eval-score.mjs
docs/           audit, security, test report, AI evaluation, visual audit, checklist
```

## Setup

Requires Node 20+. No `npm install` is needed to run the app.

```bash
cp .env.example .env      # add GEMINI_API_KEY (and Supabase vars for production-like runs)
npm run dev               # http://localhost:3000 (uses .data/db.json when SUPABASE_URL is empty)
```

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | <https://aistudio.google.com/apikey> |
| `SUPABASE_URL` | prod | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | legacy `service_role` JWT **or** new `sb_secret_…` key. Server only. |
| `PUBLIC_BASE_URL` | recommended | canonical URL for share links, e.g. `https://creatorlaunch-ai1.vercel.app` |
| `GEMINI_MODEL` | no | default `gemini-3.5-flash-lite` |
| `GEMINI_FALLBACK_MODEL` | no | default `gemini-3.6-flash`; `none` disables |
| `METRICS_TOKEN` | no | ≥16 random chars; enables `/api/metrics` and `/admin` |
| `LLM_TIMEOUT_MS` | no | per-attempt timeout, default 25000 |

**Supabase:** create a project, open **SQL Editor**, run `supabase/schema.sql`. It is idempotent, so re-run it after upgrading. Reporting queries are in `supabase/metrics.sql`.

**Deploy (Vercel):** import the repo, set Framework Preset to **Other**, leave the build command empty, add the variables above, deploy, then check `/api/health` returns `"ok": true, "storage": "supabase"`.

## Tests

```bash
npm test                  # 46 API tests: real handlers + storage; fake LLM only for forced failures
npm i --no-save playwright && npx playwright install chromium
node tests/e2e.cjs        # 53 browser checks: full journey, edge cases, 3 themes × 7 viewports
BASE_URL=https://creatorlaunch-ai1.vercel.app node scripts/eval.mjs   # 30-case real-model evaluation
```

`tests/fake-gemini.js` exists only so tests can force timeouts, 429/503, malformed or empty output, schema rejections and duplicate products. The app itself never uses it. Real-model behaviour is covered by the live smoke checks and the evaluation (see the docs).

## Security and limitations (short version, full detail in docs/SECURITY_REVIEW.md)

- **No accounts:** the private edit link (UUID + 192-bit key, stored hashed, kept in the URL fragment) is the credential. Lose it and you lose edit access. Phone OTP login is next on the roadmap.
- **No checkout:** buttons go to the creator's own payment link, WhatsApp, Instagram or website, and the UI never claims payment processing.
- **Instagram is never scraped:** the AI sees only screenshots the creator uploads (checked by magic bytes, max 3, not stored) after ticking "this is my account"; a typed handle that doesn't match the screenshot is refused. Official Instagram login is on the roadmap.
- **AI prices are suggestions** inside fixed per-format bands, not market or SuperProfile sales data.
- **Rate limits** are shared across instances via Postgres (fixed windows), falling back to per-instance memory if the database is unreachable.
- **Public pages are CDN-cached for 30s**, so edits appear live within about 30 seconds.
- **The 14-day first-sale guardrail metric** can't be computed without order data and is reported as such.

## How AI coding tools were used

Product decisions (scope, input strategy, pricing guardrails, regeneration model, metrics) are mine. Claude was the coding agent for implementation and tests; I reviewed and ran everything. Details are in the decision doc.
