// High-level AI operations. Each one: build prompt -> call Gemini with a response schema ->
// validate + sanitise + apply pricing guardrails -> return. Retries live in llm.js.
import { generateValidated } from './llm.js';
import {
  SYSTEM_PROMPT, STOREFRONT_SCHEMA, STOREFRONT_WITH_PROFILE_SCHEMA, BIO_SCHEMA, PRODUCT_SCHEMA, PRICE_SCHEMA,
  storefrontPrompt, bioPrompt, productPrompt, pricePrompt,
} from './prompts.js';
import {
  normaliseContent, normaliseProduct, cleanText, guardPrice, LIMITS, ValidationError, LANGUAGES,
} from '../public/assets/shared.js';

function fallbackName(input) {
  return input.name || (input.handle ? input.handle.replace(/[._]+/g, ' ') : 'Creator');
}

export async function generateStorefront(input, instruction = '', images = []) {
  return generateValidated({
    system: SYSTEM_PROMPT,
    prompt: storefrontPrompt(input, instruction, { screenshots: images.length }),
    schema: images.length ? STOREFRONT_WITH_PROFILE_SCHEMA : STOREFRONT_SCHEMA,
    temperature: 0.8,
    images,
    validate: (raw) => {
      let profile = null;
      if (images.length) {
        const r = raw?.profileReading;
        if (!r || typeof r.readable !== 'boolean') throw new ValidationError('Missing profileReading');
        profile = {
          readable: r.readable,
          handleSeen: String(r.handleSeen || '').replace(/^@/, '').toLowerCase().slice(0, 30),
          audienceSize: ['starting', 'small', 'mid', 'large'].includes(r.audienceSize) ? r.audienceSize : '',
          summary: cleanText(r.summary, LIMITS.profileNotes, { multiline: true }),
        };
      }
      if (raw?.creator && !cleanText(raw.creator.displayName)) raw.creator.displayName = fallbackName(input);
      // Respect the creator's own name over the model's rewrite of it.
      if (raw?.creator && input.name) raw.creator.displayName = input.name;
      const content = normaliseContent({ ...raw, language: input.language, tone: input.tone }, { source: 'ai' });
      // The Instagram handle (if given) becomes the default place buyers can reach the creator.
      if (input.handle) content.links.instagram = input.handle;
      const needsMore = raw.inputQuality === 'needs_more_detail';
      return {
        content,
        profile,
        inputQuality: needsMore ? 'needs_more_detail' : 'ok',
        clarifyingQuestion: needsMore ? cleanText(raw.clarifyingQuestion, LIMITS.clarifyingQuestion) : '',
      };
    },
  });
}

export async function regenerateBio(input, content, instruction = '') {
  return generateValidated({
    system: SYSTEM_PROMPT,
    prompt: bioPrompt(input, content, instruction),
    schema: BIO_SCHEMA,
    temperature: 0.95,
    validate: (raw) => {
      const headline = cleanText(raw?.headline, LIMITS.headline);
      const bio = cleanText(raw?.bio, LIMITS.bio, { multiline: true });
      if (!headline || !bio) throw new ValidationError('Empty bio/headline');
      return { headline, bio };
    },
  });
}

export async function regenerateProduct(input, content, currentProduct, instruction = '') {
  return generateValidated({
    system: SYSTEM_PROMPT,
    prompt: productPrompt(input, content, currentProduct, instruction),
    schema: PRODUCT_SCHEMA,
    temperature: 0.95,
    validate: (raw) => {
      const p = normaliseProduct(raw, { source: 'ai' });
      if (currentProduct) p.id = currentProduct.id; // keep position + identity
      return p;
    },
  });
}

export async function regeneratePrice(input, content, product, instruction = '') {
  return generateValidated({
    system: SYSTEM_PROMPT,
    prompt: pricePrompt(input, content, product, instruction),
    schema: PRICE_SCHEMA,
    temperature: 0.6,
    validate: (raw) => {
      const { price } = guardPrice(raw?.priceInr, product.format);
      const priceRationale = cleanText(raw?.priceRationale, LIMITS.priceRationale);
      if (!priceRationale) throw new ValidationError('Missing rationale');
      return { priceInr: price, priceRationale };
    },
  });
}

// ---------------------------------------------------------------- testimonial tidy-up
// Cleans up a REAL message the creator pasted (e.g. a WhatsApp reply from a student). It may fix
// spelling, trim and reorder for readability; it must not add praise, claims, results or numbers
// that aren't in the original. The guard below rejects output with new numbers or that grew.
const TIDY_SCHEMA = { type: 'OBJECT', properties: { quote: { type: 'STRING' } }, required: ['quote'] };
const numbersIn = (s) => new Set((String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));

export function checkTidy(raw, quote) {
  const q = cleanText(quote, LIMITS.testimonialQuote, { multiline: true }).replace(/^["“”']+|["“”']+$/g, '').trim();
  if (q.length < 8) throw new ValidationError('Empty testimonial');
  if (q.length > Math.max(raw.length + 30, 60)) throw new ValidationError('Tidy-up grew the message');
  const orig = numbersIn(raw);
  for (const n of numbersIn(q)) if (!orig.has(n)) throw new ValidationError('Tidy-up added a number');
  return q;
}

export async function tidyTestimonial(raw, { name = '', language = 'en' } = {}) {
  const prompt = [
    'A customer sent this REAL message to a creator. Turn it into a short testimonial for the creator\'s store page.',
    `Original message: """${raw}"""`,
    name ? `Customer's name (do not add it to the text): ${name}` : '',
    'Rules:',
    '- Keep their meaning, their voice and their language (English, Hinglish or Hindi as written).',
    '- You may fix spelling and grammar, remove greetings, emojis, filler and anything off-topic, and shorten.',
    '- Do NOT add anything that is not in the original: no new praise, claims, results, numbers, timeframes or details.',
    '- Do not use quotation marks. At most 300 characters. First person, as the customer.',
    `Store language hint: ${LANGUAGES[language] || 'English'}`,
  ].filter(Boolean).join('\n');
  return generateValidated({
    system: 'You edit customer messages faithfully. You never invent or exaggerate.',
    prompt,
    schema: TIDY_SCHEMA,
    attempts: 2,
    validate: (out) => checkTidy(raw, out?.quote),
  });
}
