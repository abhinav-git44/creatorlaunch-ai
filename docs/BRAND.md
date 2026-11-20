# Sell Sphere: Brand Guide

**Name:** Sell Sphere (always two words, both capitalised). Never "CreatorLaunch AI", "CreatorKart", "SellSphere" or "Sellsphere".
**Tagline:** Create. Monetize. Grow.
**Supporting line:** From expertise to income. In minutes.
**Browser title (home):** Sell Sphere – Create. Monetize. Grow.
**Positioning:** an AI-powered creator commerce platform that turns a creator's knowledge, expertise and audience into digital products and a professional storefront.
**Personality:** premium, intelligent, minimal, trustworthy, creator-first.

## Logo

The approved logo (gold shopping bag, upward growth arrow, orbital ring, four-point sparkle, "Sell" + gold "Sphere" wordmark, tagline) is traced to SVG from the reference image in `docs/brand/logo-reference.jpg`. The traced paths are shared by every variant, so the mark is identical everywhere.

| Asset | File | Use |
|---|---|---|
| Horizontal logo, dark backgrounds (primary) | `public/brand/sell-sphere-logo-dark.svg` | Off-white "Sell", gold "Sphere", tagline with gold rules |
| Horizontal logo, light backgrounds | `public/brand/sell-sphere-logo.svg` | Near-black "Sell", deeper gold "Sphere" so it reads on white |
| Icon only (bag + orbit + sparkle) | `public/brand/sell-sphere-icon.svg` | App header, footer, error page, compact spaces |
| Favicon | `public/brand/favicon.svg` | Icon on a tight square canvas |
| iPhone home-screen icon | `public/brand/apple-touch-icon.png` (180×180) | Icon on the dark background |
| Social share image | `public/brand/og-image.png` (1200×630) | `og:image` / `twitter:image` on the home page |

**In the app**, the header and footer use the icon SVG plus a live HTML wordmark ("Sell" off-white, "Sphere" gold gradient) set in Space Grotesk 700, so the text stays crisp and matches the UI font. The standalone horizontal SVGs contain real text (font stack: Space Grotesk, Poppins, Montserrat, system sans); a design tool without those fonts will substitute one, so convert the text to outlines before sending the files to print.

Logo rules: keep proportions, never stretch or recolour the mark, no added glow (the reference's glow is dropped on purpose), clear space at least the height of the bag's handle on every side, minimum icon height 24 px.

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
- **Logo placement:** header (all app pages), home footer, "store not found" page, favicon, home-screen icon, social share image.
- **Not applicable:** there are no login, signup, password-reset, dashboard or email screens in this product (no accounts by design; see the decision doc §4), so none were invented for the rebrand.

## Follow-ups

1. Self-host Space Grotesk (woff2, latin + latin-ext) to drop the Google Fonts request and tighten the CSP back to `'self'`.
2. Point the **Watch demo** button at the Loom: set its `href` in `public/index.html` and remove the two `hidden` attributes.
