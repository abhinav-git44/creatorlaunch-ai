# Loom walkthrough script (target 7:30, hard stop 10:00)

**Before recording**
- Chrome window 1: https://creatorlaunch-ai1.vercel.app in DevTools device mode at **iPhone 12 Pro (390×844)**.
- Window 2: a private/incognito window, empty, for opening the public link "as a buyer".
- Tab 3: `DECISION_DOC.pdf`. Tab 4: `docs/AI_EVALUATION.md` on GitHub.
- Clear site data first (DevTools → Application → Clear storage).
- Have this ready to paste: *"Main gym trainer hoon Indore mein. Beginners ke liye fat loss aur muscle gain ke Reels banata hoon, desi diet ke saath."*
- If Gemini is slow on the day, the app retries and switches model by itself. If you see "Try again", that is the real failure path, so narrate it ("this is the edge case I designed for") and tap it.

---

**0:00–0:40 · Problem (say this over the create screen)**
"New creators land on an empty store and stall. Building the page isn't the blocker; three decisions they've never made are: what to sell, what to charge, what to say. Sell Sphere makes those three decisions for them, shows its reasons, and leaves one job: adjust and publish, in the first session."

**0:40–1:40 · Onboarding (screen: `/`)**
1. Tap **Use my Instagram**. "Pasting a profile link can't work: Instagram blocks automated access and scraping is against its terms. So the creator uploads screenshots of their own profile." Add 1–2 screenshots **of your own account** (not someone else's), tick **This is my account**. Optionally generate here and show the "Built from your Instagram screenshots" note in the editor, then come back. "Official Instagram login is on my two-week roadmap."
2. Back to **Describe yourself**. Type name *Arjun*, paste the Hinglish text, pick **Fitness**, **20K–100K**, **Hinglish**, voice **Friendly**.
3. Tap **Generate my store**. While waiting: "One structured Gemini call. Every field is validated on the server, prices are kept inside a band for each format, and duplicate ideas are rejected before anything reaches this screen. No fake progress bar, because it's one call."

**1:40–3:20 · Editor: why these products and prices (screen: `/edit/…`)**
4. Scroll the products. "Three different formats doing three different jobs, and a ladder starting with an entry offer under ₹500, because price-sensitive followers buy on impulse first. Audience size changes the mix."
5. Point at **Why ₹…?** and **Typical for this format**. "Every price has a reason a first-time seller understands, plus the normal range. It's a suggestion, not market data, and the UI says so."
6. Change product 1's price, and watch the status change to **Saved**.
7. Tap **↻ New idea** on product 2 and type *"something live"*. "Only that product changes. My edited price on product 1 is untouched." Tap **Undo** in the toast, then do it again and keep it.
8. Tap **Rewrite with AI** on the profile, then show the new Hinglish headline.

**3:20–4:20 · Where buyers go + look**
9. In **Where buyers go**, type a WhatsApp number. Under product 1 → **More details**, paste a payment link (e.g. `rzp.io/l/demo`). "There's no fake checkout. Buttons go to the creator's payment link first, then a pre-filled WhatsApp message, then Instagram. No dead ends."
10. Switch theme **Bold → Elegant** and open **Preview**. "Three genuinely different layouts, not just colours."
11. Tap a different **language**, show the confirmation dialog, and **Cancel**. "Full rewrites always ask first."

**4:20–5:20 · Publish + buyer view**
12. Tap **Publish**, keep the suggested link, publish. Show copy, WhatsApp and share.
13. Paste the link into the **incognito window**. "A server-rendered page, fast on a phone, proper WhatsApp preview. Same edits, same theme." Tap product 1's button (opens the payment link), then product 2's (opens WhatsApp with the product pre-filled).

**5:20–6:10 · Edge cases (live)**
14. New tab `/`: type `asdfgh qwerty` → caught before any AI call, with an example. Type `I make content online` → the AI asks **one** clarifying question, with **Use this draft** as the escape hatch.
15. Back in the editor: **Unpublish** → confirm → refresh the incognito tab (within about 30s) → "not live". Republish → same link works.
16. One sentence on what's tested: "46 API tests and 53 browser checks cover timeouts, overloads, malformed AI output, duplicate links, XSS, wrong edit keys and seven screen sizes."

**6:10–7:10 · Decisions (PDF on screen)**
17. Flow + the rejected main screen (tap-to-edit) and why.
18. Cut list: checkout, accounts, scraping, AI images, fake progress.
19. Metrics: "Primary is **first-session publishing rate**: sessions that publish ÷ sessions that start onboarding, with sessions expiring after 30 idle minutes. It's instrumented with privacy-safe events. Target +30% relative in a 50/50 test. Secondary: median time to first publish. Guardrail: 14-day first sale, which needs order data, so I don't fake it."
20. AI eval (tab 4): "30 creators across 12 niches, run against production with real Gemini, with an automated rubric. I report what it measured, including the failures from Gemini overload."

**7:10–7:40 · Close**
"I made the product calls and used Claude as my coding agent, reviewing and running everything. Live testing caught real issues: Gemini overload, which led to a fallback model, and CDN caching that delayed unpublish, which I fixed. With two more weeks: the official Instagram API, prices calibrated on SuperProfile's sales data, and helping creators actually make the product they just listed."
