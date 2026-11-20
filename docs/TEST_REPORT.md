# Test Report

Every result below was produced by actually running the command or check; nothing is estimated. Dates are 19–20 Nov 2026.

## 1. Environments

| Name | What | Used for |
|---|---|---|
| **Local** | Node v22.23.5, `dev-server.js` (mirrors Vercel routing and headers), file storage, **test-only fake Gemini** | Deterministic API and browser tests, including forced AI failures |
| **Preview** | Vercel preview of branch `v2-upgrade`, real Gemini, real Supabase | Pre-merge live checks |
| **Production** | https://creatorlaunch-ai1.vercel.app (`main` @ `e61638f`), real Gemini, real Supabase | Live verification and AI evaluation |

## 2. Automated suites (local)

| Suite | Command | Result |
|---|---|---|
| JavaScript syntax | `node --check` on all 32 source files | **32 / 32 OK** |
| API tests | `npm test` (`node --test tests/*.test.js`) | **39 passed, 0 failed** (≈30 s) |
| Browser E2E | `node tests/e2e.cjs` (Playwright + Chromium) | **49 checks passed, 0 failed** (log: `docs/e2e-run.log`) |
| Secret scan | `grep -rnE "GEMINI_API_KEY\|SUPABASE_SERVICE_ROLE_KEY\|sb_secret" public/` | **No matches** (no secret names in browser code) |
| Deploy config | `vercel.json` parsed as JSON; rewrites and headers mirrored by the dev server and exercised by tests | **Valid** |

**API tests cover:** health without leaking secrets; generation with pricing guardrails and sanitising; empty, gibberish, one-word, Hinglish and Hindi input; invalid and normalised Instagram usernames; vague input leading to a clarifying question; malformed JSON retry; 5xx retry; persistent malformed output; schema-breaking output; **empty model output**; **duplicate product ideas rejected**; schema-rejection fallback; **primary-model 503 → fallback model**; **retry exhaustion**; 429; timeout; own rate limit; edit-key access control; persistence of edits; invalid edits never overwriting saved data; section-only regeneration (bio, product, price); add-product limit; failure message keeping content; publish idempotency; slug collision, reserved and custom slugs; unpublish and republish; friendly 404s; XSS stripping; static routes; **payment-link and WhatsApp validation (javascript:, credentials, localhost refused)**; **CTA routing with `noopener`, canonical/OG/Twitter tags, no inline scripts**; **CSP and security headers, case-insensitive slug redirect**; **events: session required, de-duplication, store events need the key**; **metrics endpoint locked**; **funnel maths matches the documented definitions** (first-session publish, repeat publish counted once, views de-duplicated, material edits); **full regeneration keeps contact links**.

**Browser E2E covers (phone 390×844 unless noted):** the brief's 22-step journey: landing → describe → generate (fake LLM) → bio and 2–4 products present → edit title, price and pitch → autosave → regenerate one product → others unchanged (including my edits) → undo → failed regeneration keeps content → theme change → preview → publish → **Copy link puts the URL on the clipboard** → open in an **independent browser context** → saved edits visible → payment-link CTA + WhatsApp CTA + `noopener` → view and click events sent → unpublish (confirm) → 404 → republish → 200. Plus: empty input, gibberish, invalid username, never claims Instagram data, AI timeout, invalid AI JSON, input preserved after failure, invalid price blocks save, unsafe payment link refused, language-rewrite confirmation + cancel, keyboard focus trap, duplicate slug with suggestion, XSS through the UI, missing and invalid edit key, **3 themes × 7 viewports (360×800 → 1920×1080) with no horizontal overflow**, create and editor screens at all 7 viewports, and **zero console errors or unexpected dialogs**.

## 3. Live checks (real Gemini + Supabase)

| Check | Environment | Result |
|---|---|---|
| `/api/health` | Production | `ok: true`, `storage: supabase`, model `gemini-3.5-flash-lite` |
| Full journey via API: onboarding event → **generate (Hinglish fitness)** → save → edit title/price/payment link/WhatsApp/theme → **regenerate one product** → **regenerate bio** → reload → publish → public page | Production | Generate **200 in 8.1 s**: 3 distinct formats (ebook ₹299, template pack ₹699, 1:1 ₹1,499). Regenerated product kept its id and changed idea; new Hinglish headline; edits persisted; public page 200 with edited title, ₹249, Elegant theme, payment link, WhatsApp link, canonical on the production domain, no inline script. Total 26 s |
| Unpublish → wait 32 s → public URL | Production | **404** (both requests); republish → 200, same link |
| Persistence, unsafe link (422), idempotent publish, CSP header, uppercase redirect, wrong/no key (404), metrics disabled without token (404) | Preview | All as expected (hand-written store content, not AI, used for this infrastructure check) |
| CDN after unpublish | Preview | First request served **STALE** (age 37 s, old 30 s cache), next **404** → cache shortened to `s-maxage=10, stale-while-revalidate=20` (≤30 s) and re-verified on production above |
| Gemini overload | Preview/Production logs | Real **HTTP 503** from `gemini-3.5-flash-lite` observed → added fallback model, LOW thinking on 3.x Flash, alternating retries with backoff, budget-aware timeouts. When both models are overloaded, the creator gets the friendly 502 "Try again" (observed live, which is the designed failure path) |

## 4. Database security (live Supabase, SQL editor)

| Check | Result |
|---|---|
| `schema.sql` (idempotent migration) | "Success. No rows returned" |
| RLS enabled on `stores`, `events` | true, true |
| Policies on app tables | **0** (deny by default) |
| `anon` can execute `hit_rate_limit()` | **false** (service_role: true) |
| `set local role anon; select count(*) …` (rolled back) | stores **0**, events **0**, generations **0**, while an admin sees the real rows |

## 5. Bugs found by testing and fixed

1. **Supabase `return=minimal` inserts were parsed as JSON**, so every event and generation log was recorded as failed (a v1 bug too) → parse only non-empty bodies. Found in Vercel runtime logs.
2. **Gemini 503 overload** → fallback model with alternating retries and backoff.
3. **Fallback model (3.6 Flash) exceeded 25 s** at default MEDIUM thinking → `thinkingLevel: "low"`, budget-aware timeouts.
4. **A per-attempt timeout floor overrode the configured timeout** → caught by the E2E timeout step, fixed.
5. **The sandboxed preview iframe couldn't load the storefront module (CORS)** → the preview no longer loads scripts.
6. **Unpublished page still served from CDN** → shorter cache, documented ≤30 s.

## 6. Known limitations of this testing

- Real-model tests are smoke tests plus the 30-case evaluation (`AI_EVALUATION.md`). The deterministic suites use a fake model by design and do not measure AI quality.
- **Lighthouse is not installed in this environment**, so no Lighthouse scores are claimed. Checks done instead: semantic landmarks (`header`, `main`, `nav`, `section`, `article`, h1–h3), AA colour contrast (computed), focus-visible styles, focus trap, `prefers-reduced-motion`, no inline scripts, single small CSS block per page.
- Browser E2E runs locally against the fake LLM; production UI was verified via the API journey and the earlier manual production run, not a full Playwright run against production.
