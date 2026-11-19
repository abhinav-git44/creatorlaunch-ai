// High-level AI operations. Each one: build prompt -> call Gemini with a response schema ->
// validate + sanitise + apply pricing guardrails -> return. Retries live in llm.js.
import { generateValidated } from './llm.js';
import {
  SYSTEM_PROMPT, STOREFRONT_SCHEMA, BIO_SCHEMA, PRODUCT_SCHEMA, PRICE_SCHEMA,
  storefrontPrompt, bioPrompt, productPrompt, pricePrompt,
} from './prompts.js';
import {
  normaliseContent, normaliseProduct, cleanText, guardPrice, LIMITS, ValidationError,
} from '../public/assets/shared.js';

function fallbackName(input) {
  return input.name || (input.handle ? input.handle.replace(/[._]+/g, ' ') : 'Creator');
}

export async function generateStorefront(input, instruction = '') {
  return generateValidated({
    system: SYSTEM_PROMPT,
    prompt: storefrontPrompt(input, instruction),
    schema: STOREFRONT_SCHEMA,
    temperature: 0.8,
    validate: (raw) => {
      if (raw?.creator && !cleanText(raw.creator.displayName)) raw.creator.displayName = fallbackName(input);
      // Respect the creator's own name over the model's rewrite of it.
      if (raw?.creator && input.name) raw.creator.displayName = input.name;
      const content = normaliseContent({ ...raw, language: input.language, tone: input.tone }, { source: 'ai' });
      // The Instagram handle (if given) becomes the default place buyers can reach the creator.
      if (input.handle) content.links.instagram = input.handle;
      const needsMore = raw.inputQuality === 'needs_more_detail';
      return {
        content,
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
