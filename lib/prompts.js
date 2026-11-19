// Prompts and Gemini response schemas. One prompt for the full storefront and one per
// regeneration target, so a section regenerate only ever returns that section.
import { FORMATS, ACCENTS, THEMES, AUDIENCE_SIZES, LANGUAGES, LIMITS } from '../public/assets/shared.js';

const formatList = Object.entries(FORMATS)
  .map(([k, f]) => `- ${k}: ${f.label}, typical ₹${f.min}–₹${f.max}${f.unit}`)
  .join('\n');

export const SYSTEM_PROMPT = `You are a senior creator-economy strategist at an Indian creator-commerce platform.
You turn what a creator tells you into a storefront that can sell on day one.

Who you're writing for: Indian micro-creators and independent experts. Their buyers are
price-sensitive Indian followers who usually pay by UPI, and they buy on their phones.

Rules for product ideas:
- Every product must come directly from the creator's stated skills and audience. Nothing generic.
- Mix price levels: include at least one low-cost entry product (₹49–₹499) so a follower can
  buy without thinking twice, plus one higher-value offer.
- Smaller audiences (under 20K) convert better on high-touch offers (1:1 sessions, small cohorts);
  larger audiences can scale low-cost digital products (ebooks, templates, recorded courses).
- Use only these formats, and stay inside their usual price bands:
${formatList}

Rules for pricing:
- Prices are whole rupees and use familiar Indian price points (99, 199, 299, 499, 999, 1499, 2999...).
- priceRationale is one short, plain sentence a first-time seller would understand
  (who it's priced for and why). Do NOT repeat the number itself in the rationale.

Rules for writing:
- Write like the creator talking to their followers: warm, specific, confident. No hype, no emojis.
- Never promise guaranteed results, income, returns, cures or weight-loss numbers.
  Finance creators: education only, no investment advice. Health creators: no medical claims.
- Never invent follower counts, testimonials, awards, credentials or statistics the creator didn't give.
- Keep within the length limits. The bio is in first person and at most 3 short sentences.

Language:
- "en": simple Indian English.
- "hinglish": Hindi-English mix written in Roman script, the way Indian creators write captions
  (e.g. "Ghar baithe fit raho, sirf 20 minute mein").
- "hi": Hindi in Devanagari, keeping common English words (course, PDF, live) as they are.

Input quality:
- If the description is too vague to name a real skill or audience, or it's nonsense,
  set inputQuality to "needs_more_detail", write ONE friendly clarifyingQuestion, and still return
  your best-effort storefront.
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
  lines.push(`In their own words: """${input.description}"""`);
  return lines.join('\n');
}

export function storefrontPrompt(input, instruction) {
  return `Create a storefront for this creator.

${describeCreator(input)}
${instruction ? `\nExtra instruction from the creator: """${instruction}"""\n` : ''}
Return 3 products unless the creator clearly needs only 2 or would benefit from 4.
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
Language: ${input.language}.`;
}

export function productPrompt(input, content, currentProduct, instruction) {
  const others = content.products.filter((p) => !currentProduct || p.id !== currentProduct.id);
  return `${currentProduct ? 'Replace ONE product idea' : 'Suggest ONE new product idea'} for this creator's storefront.

${describeCreator(input)}

Other products already in the store (do NOT duplicate their idea or format):
${JSON.stringify(others.map((p) => ({ title: p.title, format: p.format, priceInr: p.priceInr })))}
${currentProduct ? `\nThe product being replaced (suggest something clearly different):\n${JSON.stringify({ title: currentProduct.title, format: currentProduct.format })}` : ''}
${instruction ? `\nCreator's instruction: """${instruction}"""` : ''}
Language: ${input.language}.`;
}

export function pricePrompt(input, content, product, instruction) {
  return `Suggest a price in INR for ONE product, and a one-sentence rationale.

${describeCreator(input)}

Product: ${JSON.stringify({ title: product.title, format: product.format, shortDescription: product.shortDescription, currentPrice: product.priceInr })}
Other products in the store: ${JSON.stringify(content.products.filter((p) => p.id !== product.id).map((p) => ({ title: p.title, priceInr: p.priceInr })))}
${instruction ? `\nCreator's instruction: """${instruction}"""` : ''}
Language for the rationale: ${input.language}.`;
}
