# Sell Sphere: Brand Guide

**Name:** Sell Sphere (always two words, both capitalised). Never "CreatorLaunch AI", "CreatorKart", "SellSphere" or "Sellsphere".
**Tagline:** Create. Monetize. Grow.
**Supporting line:** From expertise to income. In minutes.
**Browser title (home):** Sell Sphere – Create. Monetize. Grow.
**Positioning:** an AI-powered creator commerce platform that turns a creator's knowledge, expertise and audience into digital products and a professional storefront.
**Personality:** premium, intelligent, minimal, trustworthy, creator-first.

## Logo

| Asset | File | Status |
|---|---|---|
| Primary horizontal (icon + wordmark) | `public/brand/sell-sphere-logo.svg` | **Pending: waiting for the approved reference image** |
| Dark-background variant (default in the app) | `public/brand/sell-sphere-logo-dark.svg` | Pending |
| Icon only (bag + orbit) | `public/brand/sell-sphere-icon.svg` | Pending |
| Favicon | `public/brand/favicon.svg` | **Temporary** gold "S" tile, to be replaced by the icon |

Until the approved logo arrives, the header and footer show the **text wordmark** "Sell Sphere" in Space Grotesk 700. No emoji or invented mark stands in for the logo. Once supplied, the approved logo (gold shopping bag with an upward arrow, orbital ring, small sparkle, wordmark) replaces the `.logo-word` span with an `<img>` in three places: `public/index.html` (header and footer), `public/edit.html`, `public/admin.html`.

Logo rules: keep proportions, no stretching, no added glow, clear space at least the height of the bag's handle on every side, minimum height 24 px in the UI.

## Colour tokens (`public/assets/app.css`, `:root`)

| Token | Value | Use |
|---|---|---|
| `--brand-gold` | `#FFB301` | Primary actions only (one per view where possible) |
| `--brand-gold-hover` | `#FFC233` | Primary button hover |
| `--brand-champagne` | `#FFD87A` | Links, active chips, focus ring, small accents |
| `--background` | `#090B12` | Page background |
| `--surface` / `--surface-glass` | `#1B1D2A` / 72% | Cards and panels (glass: 20 px blur) |
| `--surface-elevated` | `#2A2E3F` | Modals, toasts, selected segments |
| `--text-primary` | `#F8FAFC` | Main text |
| `--text-secondary` | `#A1A1AA` | Hints, descriptions, labels of secondary importance |
| `--text-muted` | `#71717A` | Placeholders and decoration only (fails AA for body text on surfaces) |
| `--border-subtle` | `rgba(255,216,122,.18)` | Glass card borders |
| `--border-neutral` / `--border-strong` | white 10% / 20% | Dividers / inputs |
| `--success` `--warning` `--error` | `#22C55E` `#F59E0B` `#EF4444` | Status; error *text* uses `#F87171` for contrast |

Rules: dark dominates, gold is rare. Headings and icons stay off-white unless they're the single accent in a block. Components use tokens, never their own hex values. Older names (`--primary`, `--muted`, …) remain as aliases of the new tokens so existing markup keeps working.

**Contrast (WCAG 2.1, computed on solid colours):** primary text on background 18.8:1; secondary text on surface 6.5:1 (5.2:1 on elevated surfaces); gold button label (`#090B12` on `#FFB301`) 11.0:1; champagne on surface 12.2:1; error text `#F87171` on surface 6.0:1; success on surface 7.3:1. All pass AA (4.5:1) for body text. Muted `#71717A` on surface is 3.5:1, which is why it is kept to placeholders.

## Typography

**Space Grotesk** 400 / 500 / 600 / 700 for everything in the app (loaded from Google Fonts). Hindi text falls back to Noto Sans Devanagari / the system font, since Space Grotesk has no Devanagari.

| Element | Weight | Size / line height |
|---|---|---|
| Hero | 700 | 56/64 desktop, scales down to 36 on phones (`clamp`) |
| H1 | 700 | 40/48 (≥30 on phones) |
| H2 | 600 | 32/40 (≥24 on phones) |
| H3 | 600 | 24/32 |
| H4 (card titles) | 600 | 20/28 |
| Large body | 400 | 18/28 |
| Body | 400 | 16/24 |
| Small | 400 | 14/20 |
| Caption / eyebrow | 400–600 | 12/18 (eyebrows are the only uppercase text) |
| Buttons | 600 | 15/20 |

## Shape, depth, motion

Card radius 18, modal 22, button and input 12, pills 999. Spacing on an 8 px grid. Glass = 72% surface + 20 px backdrop blur + subtle gold border; used for cards, top bar and bottom bar only. Shadows low to medium. Motion: 150–220 ms ease-out on hover, focus, sheets and toasts; tiles lift 2 px on hover. Everything is disabled under `prefers-reduced-motion`.

## Where the brand applies

- **Sell Sphere surfaces** (dark theme): home/create flow, generating, clarify and error states, editor, publish sheet, admin metrics, the "store not found" page.
- **Creator storefronts** (`/s/:slug`) keep the creator's own theme (Minimal, Bold, Elegant) and accent colour. They carry a small "Made with Sell Sphere" footer link back to the home page, and nothing else from the dashboard theme.
- **Not applicable:** there are no login, signup, password-reset, dashboard or email screens in this product (no accounts by design; see the decision doc §4), so none were invented for the rebrand.

## Follow-ups

1. Add the approved logo files and swap the wordmark for the logo `<img>` (above).
2. Self-host Space Grotesk (woff2, latin + latin-ext) to drop the Google Fonts request and tighten the CSP back to `'self'`.
3. Add an `og:image` (1200×630) once the logo exists.
4. Point the **Watch demo** button at the Loom: set its `href` in `public/index.html` and remove the two `hidden` attributes.
