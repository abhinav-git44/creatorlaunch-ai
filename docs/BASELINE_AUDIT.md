# Baseline Audit (before the upgrade pass)

**Audited:** commit `baseline` (the version deployed at https://creatorlaunch-ai1.vercel.app on 19 Nov 2026), checked against the SuperProfile brief (`PM_Assignment_AI_Storefront_Generator.pdf`).
**Baseline evidence:** `npm test` gave 27 passed / 0 failed; `node tests/e2e.cjs` gave all browser checks passed (run locally against the fake LLM). One manual live smoke test on production passed: generate, edit price, regenerate one product, publish, open the public page.

No code was changed before this audit was written.

## 1. Compliance matrix (brief requirements)

| # | Requirement (brief §) | Implementation | Evidence | Status | Weakness | Improvement | Priority | Verify by |
|---|---|---|---|---|---|---|---|---|
| R1 | Input: IG handle and/or description, clear fallback when the handle can't be read (§4) | Description is the main input; the handle is validated and never scraped; an in-form note explains this | `public/index.html` `#ig-block`, `shared.js checkHandle`, `prompts.js describeCreator` | ✅ Met | The fallback is honest but the handle adds little value beyond the link | Use the handle as the default WhatsApp/Instagram CTA destination | P2 | E2E |
| R2 | AI bio (§4) | One Gemini call; `normaliseCreator` | `lib/ai.js`, `shared.js` | ✅ Met | No tone control | Add a "Voice" option to the prompt (friendly / expert / professional) | P3 | API test |
| R3 | 2–4 products with format + INR price (§4) | Schema enum + count 2–4 + per-format bands + price-point snapping | `prompts.js STOREFRONT_SCHEMA`, `shared.js guardPrice` | ✅ Met | **Products aren't checked for distinctness** (duplicate titles or all-same-format pass); the creator can't see the typical range | Reject duplicate titles / single-format sets and retry; show the typical range in the editor | P1 | API test |
| R4 | Description per product (§4) | `shortDescription`, `description`, `benefits` | `shared.js normaliseProduct` | ✅ Met | – | – | – | – |
| R5 | Rendered page with public shareable URL (§4) | `/s/:slug`, server-rendered | `api/page.js`, `render.js` | ✅ Met | **All three themes use the same layout** (different colours and fonts only); desktop is a narrow single column; no canonical URL, favicon or Twitter meta | Give each theme a genuinely different layout; 2-column product grid on desktop; complete the meta tags | P1 | Screenshots, HTML assertions |
| R6 | Edit any field; regenerate the whole page or one part (§4) | Editor with autosave; regenerate bio, product, price, add or all; undo | `editor.js` | ✅ Met | **Switching language regenerates the whole store with no confirmation** (undo exists, but it is still a surprise) | Confirm before every full-store rewrite | P1 | E2E |
| R7 | Works well on mobile (§4) | Mobile-first CSS; no-overflow check at 390px | `app.css`, `e2e.cjs` | ✅ Partly | Only 390px and 1440px tested; sheets have no focus trap | Test 7 viewports; trap focus inside sheets | P1 | E2E viewport loop |
| R8 | Handle bad / empty / ambiguous inputs, slow or failed LLM (§5) | Input check, clarifying question, retry, typed errors | `shared.js checkDescription`, `llm.js`, tests 3–14 | ✅ Met | Empty model output (no parts) is handled but untested | Add the test | P2 | API test |
| R9 | Real LLM calls, no mocks (§5) | Gemini REST; the fake is test-only | `llm.js`, `tests/fake-gemini.js` | ✅ Met (live smoke passed) | No repeatable real-model quality evaluation | Build an eval set + harness; run it against production | P1 | `AI_EVALUATION.md` |
| R10 | Live public link (§5) | Vercel + Supabase | `/api/health` → ok | ✅ Met | – | – | – | Live checks |
| D1 | Decision doc, incl. flow, alternative, decisions, not-built, AI, metrics, GTM, 2 weeks (§6) | `DECISION_DOC.md/pdf`, 3 pages | file | ✅ Met | **The primary metric mixes "first session" with "within 24h"** – these are different metrics | Define both precisely; make first-session the primary | P0 | Doc review |
| D2 | Metrics with "how you would measure them" (§6, §7 15%) | Doc says "from created_at / published_at" | `schema.sql` | ⚠️ Weak | **Can't be measured as written**: onboarding starts are never recorded, so there's no denominator, and there are no sessions | Privacy-safe event table + anonymous session id + reporting endpoint | P0 | API test + live query |
| D3 | Loom shows at least one edge case (§6) | Script covers gibberish and vague input | `LOOM_SCRIPT.md` | ✅ Met | Must be updated for the new features | Rewrite to match the final build | P2 | – |
| D4 | Repo + README with setup (§6) | README | file | ✅ Met | README still says "service_role key" only (new `sb_secret_` keys are supported in code); no E2E setup details | Update | P2 | – |

## 2. Confirmed defects (found by reading code or running it)

| ID | Defect | Where | Severity |
|---|---|---|---|
| CD-1 | Primary metric definition is inconsistent (first session vs 24h) | `DECISION_DOC.md` §6 | High (Communication, 15%) |
| CD-2 | No denominator for activation metrics (onboarding starts not recorded) | `supabase/schema.sql`, no events | High |
| CD-3 | Editor language switch triggers a full-store rewrite without confirmation | `editor.js` (`#sec-look [data-lang]` handler calls `regenAll({ ask:false })`) | Medium |
| CD-4 | AI output can contain duplicate or near-identical products and still pass validation | `shared.js normaliseContent` | Medium |
| CD-5 | Public page has no canonical URL, favicon, `twitter:` tags or `og:site_name` | `render.js` | Medium |
| CD-6 | Inline `<script>` on the public page makes a strict Content-Security-Policy impossible; no CSP is sent anywhere | `render.js`, `vercel.json` | Medium |
| CD-7 | Bottom-sheet dialogs don't trap focus (keyboard users can tab behind the modal) | `ui.js openSheet` | Low |
| CD-8 | `/s/Riya-Sharma` (uppercase) returns 404 instead of redirecting to the lowercase slug | `api/page.js` | Low |
| CD-9 | README deploy step names only the legacy `service_role` key | `README.md` | Low |

## 3. Potential risks (not observed failing, but plausible)

| ID | Risk | Where | Likelihood / impact |
|---|---|---|---|
| PR-1 | Rate limiting is per-instance and in memory, so separate serverless instances don't share counts | `lib/http.js rateLimit` | Medium / Medium (cost abuse on the Gemini key) |
| PR-2 | The client IP comes from the first `x-forwarded-for` entry; `x-real-ip` (set by Vercel) is more trustworthy | `lib/http.js` | Low / Low |
| PR-3 | The published URL in the publish response is built from `x-forwarded-host` if `PUBLIC_BASE_URL` is unset (host-header influence) | `api/publish.js` | Low (mitigated: `PUBLIC_BASE_URL` now set in Vercel) |
| PR-4 | Supabase RLS is enabled with no policies; correct, but never verified against the live project with the anon key | `schema.sql` | Low / High |
| PR-5 | Newer Gemini models may reject `responseSchema` features | `llm.js` | Mitigated (falls back to the prompt-embedded schema; tested) |
| PR-6 | Store CTA is an explanation only when there's no handle; buyers have no next step | `render.js` | High impact on the "no dead ends" criterion |

## 4. UX weaknesses

- **Public page:** themes differ only in colour and font; there's no social or contact row; on desktop the products sit in one narrow column; price and CTA are the same size in every theme.
- **Editor:** the creator can't see a typical price range when changing a price; there's no place to say where buyers should go (payment link, WhatsApp).
- **Generation wait:** honest (no fake progress). Keep it that way; a 7-stage fake progress bar would contradict the brief's "never a broken / misleading page" spirit.

## 5. Missing test coverage

Unpublish → republish in the browser; editing title and description; theme persistence; CTA destinations; copy-link; XSS through the UI; missing or invalid edit key through the UI; viewports 360, 430, 768, 1024 and 1920; empty model output; duplicate-product rejection; event de-duplication; metrics endpoint auth.

## 6. Priority plan

P0: CD-1, CD-2 (metrics + events). P1: CD-3, CD-4, CD-5, PR-6 (CTA destinations), theme compositions, PR-1 (shared rate limit), 7-viewport tests, real AI evaluation. P2: CD-6, CD-7, CD-8, CD-9, README and Loom refresh. Deliberately **not** doing: a fake multi-stage progress bar, framework migration, accounts and checkout (out of scope per the brief).
