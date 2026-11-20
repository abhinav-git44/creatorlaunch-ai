# AI Evaluation

**What was run:** 30 creator descriptions (`evals/cases.json`) sent to **production** `/api/generate`, so this is the real Gemini call plus the real validation and guardrails, exactly as a creator gets it. Date: 20 Nov 2026 (UTC). Model: `gemini-3.5-flash-lite` primary with the `gemini-3.6-flash` fallback. Calls were spaced to respect the app's own rate limit (10 per 10 min). Raw per-case rows: `evals/run1-rows.txt`, `evals/run2-rows.txt`.

**Who scored it:** an automated rubric (`scripts/eval-score.mjs`) plus a qualitative read of the outputs by the builder with Claude's help. **There were no independent human raters.** Treat the numbers as a regression baseline, not proof of quality.

## Dataset (30 cases)

12 niche areas: fitness (3), yoga (2), personal finance (3), cooking (3), exam prep (3), fashion (2), beauty (2), astrology (2), design (2), language teaching (3), career coaching (2), small-business consulting (2), plus **1 deliberately vague control** ("I make content online…"). Languages: 19 English, 7 Hinglish, 2 Hindi (Devanagari), 1 control. Audience sizes: just starting, 5–20K, 20–100K, 100K+ are all represented. Voices: friendly, expert, professional.

## Rubric (each dimension 0–1; case score = mean × 100)

| # | Dimension | Automated check |
|---|---|---|
| 1 | Niche relevance | ≥3 of the case's subject keywords appear anywhere in the store (2 → 0.75, 1 → 0.4) |
| 2 | Product relevance | Share of products whose title, pitch or description mentions the creator's subject |
| 3 | Product diversity | Distinct formats ÷ products |
| 4 | Price plausibility | All prices inside their format band (0.5) + an entry offer ≤₹499 (0.25) + top price ≥2× the lowest (0.25) |
| 5 | Description quality | Pitch ≥30 chars, description ≥80 chars, ≥2 benefits, per product |
| 6 | Audience alignment | Small audience → has a high-touch offer; 100K+ → has a scalable offer; mid → both kinds |
| 7 | Factual safety | No guarantee, "100%", cure, invented follower/student counts, years of experience, certifications, testimonials or ratings, weight-loss numbers or income promises **not present in the input** |
| 8 | Language quality | English → no Devanagari; Hindi → ≥50% Devanagari in the bio; Hinglish → Roman script with ≥3 common Hindi function words |

Plus two **cross-store checks** (`scripts/eval-report.mjs`) the per-case rubric can't see: *template repetition* (do all stores share one shape?) and *price-reason language* (does the reason use the store's language?).

## Results: run 1 (prompt v2, production commit `3e23a52`)

RESULTS_RUN1

## Findings

FINDINGS

## What changed because of the evaluation

CHANGES

## How to re-run

```bash
BASE_URL=https://creatorlaunch-ai1.vercel.app node scripts/eval.mjs      # ~33 min (respects the rate limit)
node scripts/eval-report.mjs evals/results-<timestamp>.json             # aggregates + cross-store checks
```
Evaluation calls send no session id, so they never count towards the activation metrics.
