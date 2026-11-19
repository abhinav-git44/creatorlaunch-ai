// Prompts and Gemini response schemas. One prompt for the full storefront and one per
// regeneration target, so a section regenerate only ever returns that section.
import { FORMATS, ACCENTS, THEMES, AUDIENCE_SIZES, LANGUAGES, LIMITS, TONES } from '../public/assets/shared.js';

const formatList = Object.entries(FORMATS)
  .map(([k, f]) => `- ${k}: ${f.label}, typical ₹${f.min}–₹${f.max}${f.unit}`)
  .join('\n');

export const SYSTEM_PROMPT = `You are a senior creator-economy strategist at an Indian creator-commerce platform.
You turn what a creator tells you into a storefront that can sell on day one. You answer three
questions for them: what to sell, what to charge, and what to say.

Who you're writing for: Indian micro-creators (5K–100K followers) and independent experts.
Their buyers are price-sensitive Indian followers who pay by UPI on their phones.

Rules for WHAT TO SELL:
- Every product must come directly from a skill, topic or audience the creator actually described.
  If you can't connect a product to their words, don't suggest it.
- Products must be clearly different from each other: different formats AND different jobs for the buyer
  (e.g. a quick-win PDF, a guided programme, personal help). Never two ebooks, never two near-identical titles.
- Each product must be something this creator could realistically make and deliver within a week or two,
  alone, with a phone and a laptop. No apps, no physical goods, no certifications they don't have.
- Ladder the offers: one low-cost entry product (₹49–₹499) a follower can buy on impulse, then at least one
  higher-value offer.
- Audience size changes the mix:
  under 5K or not given → high-touch offers convert best (1:1 sessions, small live cohorts, workshops);
  5K–20K → one digital product + one live or high-touch offer;
  20K–100K → scalable digital products (templates, recorded course) + one premium offer;
  100K+ → low-cost digital products at scale + community or membership.
- Allowed formats and their usual INR bands (stay inside them):
${formatList}

Rules for WHAT TO CHARGE:
- Whole rupees, familiar Indian price points (99, 149, 199, 299, 499, 999, 1499, 1999, 2999, 4999...).
- Weigh: the format's band, how much work delivery takes (live time costs more than a PDF), how valuable
  the outcome is to the buyer, and what this audience can afford (students and early-career buyers pay less;
  working professionals and business owners pay more).
- priceRationale: ONE plain sentence a first-time seller would understand: who it's priced for and why.
  Do NOT repeat the number. Never claim market data, competitor prices or platform sales data.

Rules for WHAT TO SAY:
- Write like the creator talking to their followers, in first person for the bio. Specific, warm, no hype,
  no emojis, no ALL CAPS.
- Use ONLY facts the creator gave. Never invent follower counts, years of experience, certifications,
  awards, client numbers, testimonials, reviews or results.
- Never promise guaranteed outcomes, income, returns, cures, marks or ranks, or weight-loss numbers.
  Finance: education only, no stock tips or investment advice. Health and fitness: no medical claims.
  Astrology: guidance and readings only, no guaranteed predictions.
- Keep within the length limits.

Language:
- "en": simple Indian English.
- "hinglish": Hindi-English mix in Roman script, the way Indian creators write captions
  (e.g. "Ghar baithe fit raho, sirf 20 minute mein").
- "hi": Hindi in Devanagari, keeping common English words (course, PDF, live, session) as they are.

Voice:
- "friendly": warm and conversational, like a big sibling.
- "expert": confident and precise, teaches with authority (still no invented credentials).
- "professional": polished and concise, suited to consultants and working professionals.

Input quality:
- If the description is too vague to name a real skill AND audience, or it is nonsense, set inputQuality to
  "needs_more_detail", write ONE short friendly clarifyingQuestion, and still return your best-effort storefront.
- Otherwise set inputQuality to "ok" and clarifyingQuestion to "".`;

// ---------------------------------------------------------------- Gemini schemas
// Gemini's responseSchema is an OpenAPI subset. We still validate everything server-side.

const S = (type, extra = {}) => ({ type, ...extra });

const productSchema = S('OBJECT', {
  properties: {
    title: S('STRING', { description: `Product name, max ${LIMITS.title} chars` }),
    format: S('STRING', { enum: Object.keys(FORMATS) }),
    priceInr: S('INTEGER', { description: 'Price in whole rupees' }),
    priceRationale: S('STRING', { description: `One sentence, max ${LIMITS.priceRationale} chars, no number` }),
    shortDescription: S('STRING', { description: `One-line hook, max ${LIMITS.shortDescription} chars` }),
    description: S('STRING', { description: `2–4 sentences: what they get and who it's for, max ${LIMITS.description} chars` }),
    benefits: S('ARRAY', { items: S('STRING'), minItems: 2, maxItems: 4 }),
    ctaLabel: S('STRING', { description: 'Button text, 2–4 words' }),
  },
  required: ['title', 'format', 'priceInr', 'priceRationale', 'shortDescription', 'description', 'benefits', 'ctaLabel'],
  propertyOrdering: ['title', 'format', 'priceInr', 'priceRationale', 'shortDescription', 'description', 'benefits', 'ctaLabel'],
});

const creatorSchema = S('OBJECT', {
  properties: {
    displayName: S('STRING'),
    headline: S('STRING', { description: `What they help people do, max ${LIMITS.headline} chars` }),
    bio: S('STRING', { description: `First person, max 3 sentences, max ${LIMITS.bio} chars` }),
    niche: S('STRING', { description: 'One or two words, e.g. "Fitness"' }),
  },
  required: ['displayName', 'headline', 'bio', 'niche'],
  propertyOrdering: ['displayName', 'headline', 'bio', 'niche'],
});

export const STOREFRONT_SCHEMA = S('OBJECT', {
  properties: {
    inputQuality: S('STRING', { enum: ['ok', 'needs_more_detail'] }),
    clarifyingQuestion: S('STRING'),
    creator: creatorSchema,
    theme: S('OBJECT', {
      properties: {
        style: S('STRING', { enum: Object.keys(THEMES) }),
        accent: S('STRING', { enum: Object.keys(ACCENTS) }),
      },
      required: ['style', 'accent'],
    }),
    products: S('ARRAY', { items: productSchema, minItems: 2, maxItems: 4 }),
  },
  required: ['inputQuality', 'clarifyingQuestion', 'creator', 'theme', 'products'],
  propertyOrdering: ['inputQuality', 'clarifyingQuestion', 'creator', 'theme', 'products'],
});

export const BIO_SCHEMA = S('OBJECT', {
  properties: {
    headline: S('STRING'),
    bio: S('STRING'),
  },
  required: ['headline', 'bio'],
});

export const PRODUCT_SCHEMA = productSchema;

export const PRICE_SCHEMA = S('OBJECT', {
  properties: {
    priceInr: S('INTEGER'),
    priceRationale: S('STRING'),
  },
  required: ['priceInr', 'priceRationale'],
});

// ---------------------------------------------------------------- prompt builders

export function describeCreator(input) {
  const lines = [];
  if (input.name) lines.push(`Name: ${input.name}`);
  if (input.handle) {
    lines.push(`Instagram: @${input.handle} (we could NOT read the profile; use only what's written below)`);
  }
  if (input.niche) lines.push(`Niche they picked: ${input.niche}`);
  if (input.audienceSize) lines.push(`Audience size: ${AUDIENCE_SIZES[input.audienceSize]}`);
  else lines.push('Audience size: not given (assume a small, growing audience)');
  lines.push(`Language for the store: ${input.language} (${LANGUAGES[input.language] || 'English'})`);
  lines.push(`Voice: ${input.tone || 'friendly'} (${TONES[input.tone] || 'Friendly'})`);
  lines.push(`In their own words: """${input.description}"""`);
  return lines.join('\n');
}

export function storefrontPrompt(input, instruction) {
  return `Create a storefront for this creator.

${describeCreator(input)}
${instruction ? `\nExtra instruction from the creator: """${instruction}"""\n` : ''}
Return 3 products unless the creator clearly needs only 2 or would benefit from 4.
Before answering, check: every product traces back to their words; formats are all different; there is an
entry product at ₹499 or less; prices sit inside each format's band; no invented facts.
displayName: use their name if given, otherwise a clean version of their handle.
Pick the theme style and accent colour that suit their niche.`;
}

function compactStore(content) {
  return JSON.stringify({
    creator: { displayName: content.creator.displayName, headline: content.creator.headline },
    products: content.products.map((p) => ({ title: p.title, format: p.format, priceInr: p.priceInr })),
  });
}

export function bioPrompt(input, content, instruction) {
  return `Rewrite ONLY the headline and bio for this creator's storefront. Make it noticeably different
from the current version${instruction ? ', following the creator\'s instruction' : ''}.

${describeCreator(input)}

Current store (for context, keep it consistent with these products):
${compactStore(content)}

Current headline: """${content.creator.headline}"""
Current bio: """${content.creator.bio}"""
${instruction ? `\nCreator's instruction: """${instruction}"""` : ''}
Use only facts from their description. Language: ${input.language}. Voice: ${input.tone || 'friendly'}.`;
}

export function productPrompt(input, content, currentProduct, instruction) {
  const others = content.products.filter((p) => !currentProduct || p.id !== currentProduct.id);
  return `${currentProduct ? 'Replace ONE product idea' : 'Suggest ONE new product idea'} for this creator's storefront.

${describeCreator(input)}

Other products already in the store (do NOT duplicate their idea or format):
${JSON.stringify(others.map((p) => ({ title: p.title, format: p.format, priceInr: p.priceInr })))}
${currentProduct ? `\nThe product being replaced (suggest something clearly different):\n${JSON.stringify({ title: currentProduct.title, format: currentProduct.format })}` : ''}
${instruction ? `\nCreator's instruction: """${instruction}"""` : ''}
The new product must be deliverable by this creator alone within a week or two, and its price must sit inside its
format's band. Language: ${input.language}. Voice: ${input.tone || 'friendly'}.`;
}

export function pricePrompt(input, content, product, instruction) {
  return `Suggest a price in INR for ONE product, and a one-sentence rationale.

${describeCreator(input)}

Product: ${JSON.stringify({ title: product.title, format: product.format, shortDescription: product.shortDescription, currentPrice: product.priceInr })}
Other products in the store: ${JSON.stringify(content.products.filter((p) => p.id !== product.id).map((p) => ({ title: p.title, priceInr: p.priceInr })))}
${instruction ? `\nCreator's instruction: """${instruction}"""` : ''}
Stay inside the ${product.format} band (${FORMATS[product.format] ? `₹${FORMATS[product.format].min}–₹${FORMATS[product.format].max}${FORMATS[product.format].unit}` : 'its usual range'}).
Weigh delivery effort, buyer value and what this audience can afford. Language for the rationale: ${input.language}.`;
}
