# Hiring-manager simulation (Head of Product & Design lens)

Self-assessment against the brief's rubric. It is an estimate made by the builder with Claude's help, **not** a reviewer's score.

| Area (weight) | Estimate | Why (evidence) | Remaining weakness |
|---|---|---|---|
| Problem thinking & judgement (30) | **26** | Framed as three decisions plus a buyer next step; description-first input; ≤₹499 entry-offer ladder; audience-size rules; buyer destinations instead of a fake checkout; explicit cut list; metric definitions implemented (`lib/metrics.js`) | Personas and pricing bands are assumptions, with no user research or sales data |
| Execution (25) | **22** | Live on Vercel + Supabase; real-AI journey verified on production; 39 API tests + 49 browser checks; overload fallback; RLS verified live | Gemini overload still produces "Try again" when both models are down; no accounts |
| UX & UI craft (20) | **17** | Mobile-first editor with reasons, ranges, undo and confirmations; three distinct public layouts; AA colours; 7-viewport no-overflow checks | Not tested with real creators; no Lighthouse run in this environment |
| AI usage quality (10) | **9** | Schema + server validation, distinctness, price guardrails, clarifying question, separate regeneration prompts, 30-case eval on production | Automated rubric only; no human ratings yet |
| Communication (15) | **13** | 3-page decision doc, precise metric definitions, honest limits, Loom script tied to real flows | The Loom recording itself is still to be made |
| **Total** | **≈87 / 100** | Baseline v1 self-estimate ≈ 76 | |

## 15 hard questions, with suggested answers

1. **Why not scrape Instagram? Isn't that the "magic"?** It's blocked and against Instagram's terms, so it would fail exactly when demoed. Two lines of description carry the decisive signal (skill + audience). The magic is the decisions, not reading the profile. The next step is the *official* Instagram API with the creator's consent, A/B tested against description-only on publish rate.
2. **What's the one metric?** First-session publishing rate: sessions with a publish ÷ sessions with `onboarding_started`, with a 30-minute idle expiry. It's instrumented now. "Within 24h" is a broader metric that I'd report alongside, not interchangeably.
3. **Why +30%?** It's a proposal sized for a 2-week 50/50 test to detect, not a promise. I'd re-size it once I see the real baseline and traffic; with a low baseline, the detectable lift is what matters.
4. **How do you know the products are good?** Layered: prompt rules, schema and distinctness validation, a 30-creator eval on production with an 8-dimension rubric, and in production the *material-edit rate* (how much creators change AI suggestions before publishing). Next is human ratings on 100 cases.
5. **Hallucinations?** The prompt forbids invented followers, credentials, testimonials and results. The eval scans every output for guarantee, number, credential and review patterns not present in the input. Prices are clamped server-side whatever the model says. The bio is first-person from the creator's own facts, and they review before publishing.
6. **Why these price bands?** They're my judgement of Indian creator-market norms (e.g. ebooks ₹49–₹999, 1:1 ₹299–₹4,999), used as guardrails, not as the price. The first two-week task is replacing them with SuperProfile's real price/conversion data by niche and format.
7. **Isn't a ≤₹499 entry product under-pricing experts?** It's one offer of 2–4; the ladder still includes premium options, and "more premium" is a one-tap instruction. The hypothesis is that the first sale drives activation; the guardrail metric would catch it if this hurt revenue.
8. **Why no checkout?** SuperProfile already has payments, so rebuilding them proves nothing. Buttons route to a real next step (payment link, then pre-filled WhatsApp, then Instagram), which is how many micro-creators sell today. No fake checkout, no dead ends.
9. **What did you cut and why?** Accounts, checkout, scraping, AI images, a marketing site, version history and a fake progress bar. Each was either not on the activation path or would have needed fabrication.
10. **Security without accounts?** Edit links are UUID + 192-bit key, stored hashed, kept in the URL fragment (never logged). RLS on with no policies (anon sees 0 rows, verified live); strict CSP; URL validation; shared rate limits. The accepted risk is a lost link, and OTP is next.
11. **How does it scale?** Stateless functions, Postgres, CDN-cached public pages (≤30s staleness). The scaling risk is LLM cost and availability, handled by rate limits, a cheap primary model, a fallback model and backoff. At scale I'd add a queue and per-creator quotas.
12. **What happened when Gemini went down during your build?** Logs showed 503s on the primary model. I added an alternate model with backoff and budget-aware timeouts, plus a test for exhaustion. When both models are down, the creator sees a calm "Try again" with their input kept. That's the right failure mode.
13. **Differentiation vs. Linktree/Stan/Topmate templates?** Templates give a blank page with nicer fonts. This decides *what to sell and at what price* for an Indian audience, in Hinglish if needed, and wires buyers to WhatsApp. That's the actual blocker.
14. **The two-week roadmap: what's first and why?** Pricing calibrated on SuperProfile data, because it improves every store and every price reason. Then the official Instagram API (a sharper niche). Then the "make this product" helper, since that's the next stall after publishing.
15. **What would change after real user testing?** I expect: more creators want to *start from their existing offer* (an "I already sell X" path); price edits concentrate in high-touch formats (bands too low or too high); and Hindi users want the editor UI in Hindi too. I'd watch the material-edit rate per field to prioritise.
