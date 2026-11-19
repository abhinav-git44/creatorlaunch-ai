// Automated scoring for one generated storefront (see AI_EVALUATION.md for the rubric).
// Pure function with no imports, so the same source can also run inside a browser.
// Each dimension scores 0–1; the case score is their mean × 100.
export function scoreCase(c, out) {
  const FORMAT_BANDS = { ebook: [49, 999], template_pack: [99, 1999], recorded_course: [299, 4999], cohort_course: [999, 14999], live_webinar: [49, 999], one_on_one_call: [299, 4999], community: [99, 1499], membership: [99, 1999] };
  const HIGH_TOUCH = ['one_on_one_call', 'cohort_course', 'live_webinar'];
  const SCALABLE = ['ebook', 'template_pack', 'recorded_course', 'community', 'membership'];
  const products = out.products || [];
  const text = (s) => String(s || '').toLowerCase();
  const all = text([out.headline, out.bio, ...products.flatMap((p) => [p.title, p.shortDescription, p.description, ...(p.benefits || [])])].join(' '));
  const input = text(c.description);
  const kw = (c.keywords || []).map(text);
  const hits = (s) => kw.filter((k) => text(s).includes(k)).length;

  const r = {};
  // 1. Niche relevance: does the store talk about the creator's actual subject?
  const h = hits(all);
  r.nicheRelevance = kw.length ? (h >= 3 ? 1 : h === 2 ? 0.75 : h === 1 ? 0.4 : 0) : 1;
  // 2. Product relevance: each product mentions the creator's subject.
  r.productRelevance = kw.length && products.length ? products.filter((p) => hits(`${p.title} ${p.shortDescription} ${p.description}`) > 0).length / products.length : 1;
  // 3. Diversity: different formats per product.
  r.diversity = products.length ? new Set(products.map((p) => p.format)).size / products.length : 0;
  // 4. Price plausibility: inside the format band, and at least one entry offer ≤ ₹499.
  const inBand = products.every((p) => FORMAT_BANDS[p.format] && p.priceInr >= FORMAT_BANDS[p.format][0] && p.priceInr <= FORMAT_BANDS[p.format][1]);
  const entry = products.some((p) => p.priceInr > 0 && p.priceInr <= 499);
  const ladder = Math.max(...products.map((p) => p.priceInr)) >= 2 * Math.min(...products.map((p) => p.priceInr));
  r.pricePlausibility = (inBand ? 0.5 : 0) + (entry ? 0.25 : 0) + (ladder ? 0.25 : 0);
  // 5. Description quality: substantive pitch, description and benefits.
  r.descriptionQuality = products.length ? products.filter((p) => String(p.shortDescription || '').length >= 30 && String(p.description || '').length >= 80 && (p.benefits || []).length >= 2).length / products.length : 0;
  // 6. Audience alignment with the audience-size rule in the prompt.
  const fmts = products.map((p) => p.format);
  const size = c.audienceSize || 'starting';
  if (size === 'starting' || size === 'small') r.audienceAlignment = fmts.some((f) => HIGH_TOUCH.includes(f)) ? 1 : 0;
  else if (size === 'large') r.audienceAlignment = fmts.some((f) => SCALABLE.includes(f)) ? 1 : 0;
  else r.audienceAlignment = (fmts.some((f) => SCALABLE.includes(f)) ? 0.5 : 0) + (fmts.some((f) => HIGH_TOUCH.includes(f) || f === 'membership' || f === 'community') ? 0.5 : 0);
  // 7. Factual safety: no guarantees, invented numbers, credentials or reviews not in the input.
  const flags = [];
  const rules = [
    [/guarante/, 'guarantee'], [/\b100\s?%/, '100%'], [/\bassured\b/, 'assured'], [/\bcure[sd]?\b/, 'cure'],
    [/\b\d[\d,.]*\s?(k|lakh|lakhs|million|\+)?\s+(followers|students|clients|subscribers|customers|members)\b/, 'invented audience numbers'],
    [/\b\d+\+?\s+years?\b/, 'years claim'], [/testimonial|5[- ]star|★|rated\s+\d/, 'reviews/testimonials'],
    [/\b(lose|losing)\s+\d+\s?(kg|kgs|kilos)\b/, 'weight-loss number'], [/\b(double|triple)\s+your\s+(money|income)\b/, 'income promise'],
  ];
  for (const [re, label] of rules) {
    if (re.test(all) && !re.test(input)) flags.push(label);
  }
  if (/\bcertified\b/.test(all) && !/\bcertified|certification\b/.test(input)) flags.push('certification not in input');
  r.factualSafety = flags.length ? 0 : 1;
  // 8. Language quality: the requested script/register is used.
  const bio = `${out.headline || ''} ${out.bio || ''}`;
  const dev = (bio.match(/[ऀ-ॿ]/g) || []).length;
  const latin = (bio.match(/[A-Za-z]/g) || []).length;
  if (c.language === 'hi') r.languageQuality = dev / Math.max(1, dev + latin) >= 0.5 ? 1 : 0;
  else if (c.language === 'hinglish') {
    const hindiWords = (text(`${bio} ${products.map((p) => p.shortDescription).join(' ')}`).match(/\b(hai|hain|ke|ki|ka|mein|aur|se|ko|apne|apni|sikho|seekho|karo|karein|liye|sath|saath|bhi|hoon|hum|aap)\b/g) || []).length;
    r.languageQuality = dev === 0 && hindiWords >= 3 ? 1 : hindiWords >= 1 ? 0.5 : 0;
  } else r.languageQuality = dev === 0 ? 1 : 0;

  const dims = Object.values(r);
  return { id: c.id, score: Math.round((dims.reduce((a, b) => a + b, 0) / dims.length) * 1000) / 10, dims: r, flags };
}
