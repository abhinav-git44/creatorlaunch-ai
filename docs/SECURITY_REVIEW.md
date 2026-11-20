# Security Review

**Scope:** Sell Sphere (formerly CreatorLaunch AI) v2 (this repo) as deployed on Vercel with Supabase Postgres. **Method:** code review of every endpoint and module, automated tests (`tests/api.test.js`, `tests/e2e.cjs`), and direct checks against the live Supabase project on 19 Nov 2026.

**Threat model.** There are no user accounts. Attackers are (a) anonymous internet users hitting the API, (b) a visitor to a public storefront, and (c) someone who gets hold of a store's edit link. Assets: creators' unpublished drafts, the integrity of published pages, the Gemini key and its spend, and the Supabase service key.

## Findings and status

| # | Area | Risk | Severity | Status / remediation | Verified by |
|---|---|---|---|---|---|
| 1 | Edit authorisation | Anyone with the store UUID could edit | High if broken | Every read or write needs `x-edit-key`; only a SHA-256 hash is stored and compared in constant time; a wrong key and an unknown id give the same 404 (no probing). The key travels in the URL **fragment**, so it never reaches server logs or `Referer` (the editor also sends `no-referrer`). | API test *store is only readable with its edit key*; E2E *invalid edit key: refused* |
| 2 | Secrets | Service-role / Gemini key exposure | Critical if broken | Keys are read only on the server (`lib/db.js`, `lib/llm.js`). `/api/health` reports only whether they are configured; logs never include keys, prompts or creator text. `.env` is git-ignored. | API test *health… never leaks the key*; `grep` of `public/` for env names finds none |
| 3 | Database access | Public reads of drafts via Supabase's REST API with the anon key | High | RLS is enabled on `stores`, `events`, `generations` and `rate_limits` with **zero policies**; the app uses the service key server-side only. Checked live: impersonating the `anon` role in the production database returned **0** stores, events and generations (an admin sees the real rows). `hit_rate_limit()` execute is revoked from `public`, `anon` and `authenticated`. | Live SQL check (`set local role anon`), see TEST_REPORT §4 |
| 4 | XSS (stored) | Creator or AI text rendered as HTML | High | Two layers: `cleanText` strips tags, angle brackets and `javascript:` on save, and `escapeHtml` escapes every value at render time. Public pages ship **no inline script**, so a strict CSP (`script-src 'self'`, `default-src 'none'`) can be used. | API test *script injection… stripped*; E2E XSS payload through the UI; CSP header test |
| 5 | Open redirect / unsafe links | Payment and website links could be `javascript:`, `data:`, credentialed or internal URLs | Medium | `cleanUrl` allows only absolute `http(s)` with a real dotted hostname: no credentials, no localhost, max 300 chars. Links render with `rel="noopener noreferrer nofollow"` and `target=_blank`. WhatsApp numbers are reduced to digits. | API test *payment links… unsafe links are refused*; E2E |
| 6 | SQL injection | Query strings built for PostgREST | Medium | No SQL is built from user input; ids are UUID-validated and slugs regex-validated before use, and all values pass through `encodeURIComponent` into PostgREST filters. The only SQL function takes typed parameters. | Code review (`lib/db.js`) |
| 7 | Abuse of the LLM key (cost) | Scripted generation | Medium | Rate limits per hashed IP: generate 10 / 10 min, regenerate 30, create-store 20, events 120. **Shared across serverless instances** through a Postgres counter (`hit_rate_limit`), falling back to per-instance memory only if the database is unreachable. The client IP comes from `x-real-ip` (set by Vercel), not the spoofable first `x-forwarded-for` hop. | API test *our own rate limit stops runaway generation* |
| 8 | Request size / malformed input | Memory exhaustion, crashes | Low | Bodies are capped at 64 KB; JSON parse errors give a 400; content is fully re-validated (types, lengths, counts) on every write. | API tests (invalid edits, 413 path in `readJson`) |
| 9 | Error leakage | Stack traces or provider errors shown to users | Low | `handler()` turns any unexpected error into a generic message; AI errors map to plain-language messages. Detailed causes go only to server logs. | Code review; API tests on 5xx/429/timeout |
| 10 | Clickjacking / framing | App framed by another site | Low | `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` on the app; `frame-ancestors 'self'` on public pages. | API test *security headers* |
| 11 | CORS | Cross-site API calls | Low | No CORS headers are sent, so browsers block cross-origin reads; writes that need `x-edit-key` trigger a preflight that fails cross-origin. | Code review |
| 12 | Analytics privacy | Collecting personal data | Low | Events hold an anonymous random session id, event name, store id/slug and whitelisted short metadata. No IP, user agent, name, description or key. Views are de-duplicated per session per day. | API test *events need a session, are de-duplicated…* |
| 13 | Metrics endpoint | Exposing business data | Low | Off unless `METRICS_TOKEN` (≥16 chars) is set; constant-time token check; returns aggregates only. | API test *metrics endpoint is locked down* |
| 14 | Slug handling | Path tricks, reserved routes | Low | Strict regex, reserved list (`api`, `admin`, `edit`…), DB check constraint, case-insensitive redirect. | API tests (reserved, collision, uppercase) |
| 15 | Preview iframe | Preview content scripting the editor | Low | The preview runs in `sandbox="allow-scripts allow-popups"` (no same-origin), loads no scripts, and contains escaped content only. | E2E preview step |

### Fonts (Sell Sphere rebrand)
- The app pages load Space Grotesk from Google Fonts. The app CSP allows only `https://fonts.googleapis.com` (styles) and `https://fonts.gstatic.com` (font files); scripts stay `'self'` only. Public storefronts don't load Google Fonts and keep `default-src 'none'`.
- Trade-off: each visit to the app sends the visitor's IP to Google. Self-hosting the font file removes that; it's listed in `docs/BRAND.md` as a follow-up.

### Instagram screenshot import
- Max 3 images, ≤1.5 MB each, request ≤4 MB; type checked by **magic bytes** (JPEG/PNG/WebP), not by the declared MIME type. Resized in the browser before upload.
- Images are sent to Gemini once and **never stored or logged**; only the AI's short text summary (≤700 chars) is saved with the store.
- The creator must tick "This is my account". If a typed handle doesn't match the handle read from the screenshot, generation is refused (422), which limits building a store from someone else's profile. It can't prove ownership; official Instagram login (roadmap) would.
- The client can't inject `profileNotes`: input checks run with it cleared, and it's set only from the model's reading.

### Profile pictures and cover images
- Upload needs the store's edit key; max 30 uploads per 10 min per visitor; avatar ≤400 KB, cover ≤900 KB; JPEG/PNG/WebP only, checked by **magic bytes**. SVG uploads are refused (script risk).
- The browser re-encodes every upload to JPEG before sending, which also drops EXIF data such as GPS location.
- Images are served from `/api/assets/<id>` (id = sha256 of store id + bytes) with `nosniff`, `content-security-policy: default-src 'none'; sandbox` and an immutable cache. Ids in saved content must be exactly 40 hex chars; anything else is dropped on save, so content can't point at other URLs.
- AI covers: the prompt forbids text, logos and recognisable faces and uses the name as context only. The fallback "designed" cover is an SVG generated by our own code (no text, scripts or external references; covered by a test) and converted to JPEG in the browser before upload.
- Accepted risk: uploaded images aren't moderated. Creators must use photos they own (stated in the editor); a report/takedown path is needed before a public launch.


Product images use the same upload endpoint (`kind: "product"`, ≤700 KB, same type and magic-byte checks) and are stored as `kind = 'cover'` rows, so no schema change was needed. A product's image id is only kept from the creator's own saves (`source: 'user'`); AI output can never set one, and anything that isn't a 40-hex id is dropped.
### Testimonials
- Stored only from the creator's own saves (`source: 'user'`); AI generation output can never contain them. Text is stripped of markup and escaped on render; max 6, 400 characters each.
- Public only when complete **and** the creator ticks "a real message, shared with permission". The "where it came from" field is never rendered.
- AI tidy-up needs a pasted message of at least 15 characters and is rejected if the output adds a number the customer didn't write or grows by more than 30 characters (tested with a fake model that invents "12 kg in 30 days").

## Accepted risks (documented, not fixed in v1)

- **Edit link = full edit rights.** Whoever has the link can edit, and a lost link means lost access. Mitigation in v2 roadmap: phone OTP login with links bound to an account.
- **Fixed-window rate limiting** allows short bursts at window edges, which is fine for cost control at this scale.
- **CSP keeps `style-src 'unsafe-inline'`** because storefront themes are inline CSS. Scripts are fully restricted, which is what matters for XSS.
- **Supabase default table grants** remain for `anon`; access is denied by RLS rather than by revoking grants (verified live). Revoking grants as well would be belt-and-braces.

## Environment checklist (production)

`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `sb_secret_…`) set as **Secret** in Vercel; `PUBLIC_BASE_URL` set; optional `METRICS_TOKEN` (random, ≥32 chars) to enable `/admin`; `supabase/schema.sql` run (idempotent).
