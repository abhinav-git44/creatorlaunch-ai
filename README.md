# CreatorLaunch AI

Turn a creator's short description (or Instagram username) into a ready-to-publish storefront: an AI-written bio, 2–4 product ideas with India-appropriate INR pricing, product copy, and a mobile landing page at a public, shareable URL.

Built as the SuperProfile *AI Storefront Generator* take-home (PM, AI-native 0→1).

- **Live app:** `https://<your-project>.vercel.app`
- **Decision doc:** [`DECISION_DOC.md`](DECISION_DOC.md)
- **Loom script:** [`LOOM_SCRIPT.md`](LOOM_SCRIPT.md)

## What it does

1. **Create** (`/`): the creator describes what they do and who they help (or gives an Instagram username plus a line about their content), and can optionally pick a niche, audience size and language (English, Hinglish or Hindi).
2. **Generate**: one Gemini call returns structured JSON: bio, theme, 2–4 products (format, INR price plus a one-line "why this price", pitch, benefits and description). The server validates and sanitises it and applies pricing guardrails before anything reaches the browser.
3. **Edit** (`/edit/:id`): every field is editable, with autosave and a live phone or desktop preview. AI can regenerate just the bio, one product, one price, add a product, or redo the whole store. Every AI change can be undone.
4. **Publish**: the creator picks a link (`/s/your-name`) and can copy it, share it on WhatsApp or use the phone's share sheet. The public page is server-rendered, so it loads fast and shows a proper link preview on WhatsApp.

## Tech stack (and why it's this small)

| Layer | Choice |
|---|---|
| Frontend | Plain HTML, CSS and ES modules, no build step |
| API | Vercel Node serverless functions in `/api` |
| AI | Google Gemini REST API with structured JSON output (`responseSchema`) and server-side validation |
| Storage | Supabase Postgres via its REST API, called only from the server with the service-role key |
| Hosting | Vercel |

The project has **zero npm dependencies**. Nothing needs installing or building, deploys are just "push", and the shared module (`public/assets/shared.js`) runs in both the browser and the server, so the two always agree on what a valid store is. The trade-offs are in the decision doc.

```
api/            serverless endpoints (generate, stores, store, regenerate, publish, page, health)
lib/            server code: Gemini client, prompts, AI ops, Supabase/file storage, slugs, HTTP helpers
public/         static app: index.html (create), edit.html (editor), assets/*
  assets/shared.js   schema, validation, sanitising, pricing guardrails, input checks (browser + server)
  assets/render.js   storefront renderer (public page + editor preview use the same code)
supabase/schema.sql  tables + RLS
tests/          API tests (node:test), browser e2e (Playwright), test-only fake Gemini
dev-server.js   local server that mimics Vercel routing
```

## Run locally

Requires Node 20+.

```bash
cp .env.example .env        # add your GEMINI_API_KEY
npm run dev                 # http://localhost:3000
```

Without `SUPABASE_URL`, local dev stores data in `.data/db.json`. That's fine for trying it out, and it's refused on Vercel.

## Deploy (about 10 minutes)

1. **Gemini key:** create one at <https://aistudio.google.com/apikey>.
2. **Supabase:** create a project, open **SQL Editor**, paste and run `supabase/schema.sql`. Copy the **Project URL** and the **service_role** key (Project Settings → API).
3. **GitHub:** push this folder to a new repository.
4. **Vercel:** *Add New → Project*, import the repo, set Framework Preset to **Other**, leave the build command empty. Under *Environment Variables*, add:

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | your Gemini key |
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `GEMINI_MODEL` | optional, defaults to `gemini-3.5-flash-lite` |
   | `PUBLIC_BASE_URL` | optional, e.g. `https://creatorlaunch.vercel.app` |

5. Deploy, then open `/api/health`. It should return `"ok": true` and `"storage": "supabase"`.
6. On your phone: create a store, publish it, and open the link in a private tab.

## Tests

```bash
npm test                    # 27 API tests: real handlers + storage, fake LLM for failure cases
# Browser e2e on phone + desktop viewports (screenshots in tests/screens/):
npm i --no-save playwright && npx playwright install chromium && node tests/e2e.cjs
```

The fake LLM (`tests/fake-gemini.js`) exists only so the tests can force timeouts, 429s, 5xx errors, malformed JSON, schema-breaking output and vague input. The app itself never uses it: production calls Gemini, and if `GEMINI_API_KEY` is missing it says so instead of making anything up.

Covered: empty, one-word, gibberish, Hinglish and Hindi input; invalid Instagram usernames; vague input leading to a clarifying question; AI timeout, rate limit, 5xx, malformed JSON and a rejected schema; pricing guardrails; section-only regeneration; edit-key access control; invalid edits never overwriting saved data; slug collisions, reserved and custom slugs; idempotent publish; unpublish and republish; XSS stripping; the public page reflecting saved edits; no horizontal scroll on a phone.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/generate` | creator input → validated storefront JSON (not saved yet) |
| POST | `/api/stores` | save an accepted draft → `{ id, editKey }` |
| GET/PATCH | `/api/stores/:id` | load / autosave (header `x-edit-key`) |
| POST | `/api/regenerate` | `target`: `all`, `bio`, `product`, `price` or `add_product`; returns only that section |
| POST/DELETE | `/api/stores/:id/publish` | publish (idempotent, picks a unique slug) / unpublish |
| GET | `/s/:slug` | public storefront (server-rendered) |
| GET | `/api/health` | config status (no secrets) |

## Security notes and known limitations

- **No accounts in v1.** Whoever has the private edit link (store UUID plus a 192-bit key, stored only as a SHA-256 hash) can edit. Losing the link means losing edit access. Phone OTP login is the first thing to add.
- **Rate limiting is per-instance and in-memory:** good enough to stop accidents and casual abuse, not a determined attacker. The upgrade is a shared store such as Upstash.
- **Instagram profiles are not read.** Instagram blocks automated access and scraping is against its terms. The username is used for the store link and an Instagram button, and the AI is told explicitly that it has no profile data, so it never invents follower counts or posts.
- **No checkout.** The buy button explains this (and points buyers to the creator's Instagram when there is one), so it is never a dead end.
- **AI prices are starting suggestions** inside fixed per-format bands. They are not market data, and the UI labels them that way.
- Published pages are CDN-cached for 30 seconds, so edits appear on the live page within about 30 seconds.

## How AI coding tools were used

See the "How I built it" section of the decision doc.
