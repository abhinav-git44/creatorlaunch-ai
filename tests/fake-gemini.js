// TEST-ONLY stand-in for the Gemini REST API, so the test suite can exercise success and
// failure paths (timeouts, 429s, malformed JSON, vague input) without a real key.
// Production code never uses this: it is only reachable by pointing GEMINI_BASE_URL at it.
import http from 'node:http';

const counters = new Map();
const once = (k) => { const n = (counters.get(k) || 0) + 1; counters.set(k, n); return n === 1; };

function sampleProduct(n, format = 'ebook', price = 523) {
  return {
    title: `Sample product ${n}`,
    format,
    priceInr: price,
    priceRationale: 'Low enough for a follower to buy on impulse.',
    shortDescription: `A short pitch for product ${n}.`,
    description: '<b>Bold</b> details about what is inside. <script>alert(1)</script>',
    benefits: ['First benefit', 'Second benefit', 'Third benefit'],
    ctaLabel: 'Get it now',
  };
}

function respond(schema, prompt, imageText = '') {
  const props = Object.keys(schema?.properties || {});
  if (props.includes('profileReading')) {
    const unreadable = imageText.includes('UNREADABLE');
    const handle = (imageText.match(/HANDLE:([a-z0-9._]+)/) || [])[1] || 'riya.fit';
    return {
      profileReading: unreadable
        ? { readable: false, handleSeen: '', audienceSize: 'unknown', summary: '' }
        : { readable: true, handleSeen: handle, audienceSize: 'mid', summary: 'Fitness creator posting 15-minute home workouts and desk-posture fixes for working women; bio mentions online coaching.' },
      ...respond({ properties: { products: {} } }, prompt),
    };
  }
  if (props.includes('products')) {
    return {
      inputQuality: prompt.includes('FAKE_VAGUE') ? 'needs_more_detail' : 'ok',
      clarifyingQuestion: prompt.includes('FAKE_VAGUE') ? 'Who do you mainly help, and with what?' : '',
      creator: { displayName: 'Model Name', headline: 'Helping busy people get fit at home', bio: 'I teach short home workouts.', niche: 'Fitness' },
      theme: { style: 'bold', accent: 'coral' },
      products: [sampleProduct(1, 'ebook', 523), sampleProduct(2, 'one_on_one_call', 99999), sampleProduct(3, 'cohort_course', 10)],
    };
  }
  if (props.includes('bio')) return { headline: prompt.includes('What we read in screenshots') ? 'Profile-aware headline' : 'A brand new headline', bio: 'A brand new bio.' };
  if (props.includes('priceRationale') && props.length === 2) return { priceInr: 777, priceRationale: 'Fresh rationale.' };
  return sampleProduct(9, 'template_pack', 349);
}

export function startFakeGemini(port = 0) {
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const json = JSON.parse(body || '{}');
    const prompt = json.contents?.[0]?.parts?.[0]?.text || '';
    if (!req.headers['x-goog-api-key']) { res.writeHead(403); return res.end('{}'); }
    // Gemini 3.x-style strictness: sampling params must not be sent to 3.x models.
    if (/gemini-3/.test(req.url) && json.generationConfig?.temperature !== undefined) { res.writeHead(400); return res.end('{"error":{"message":"temperature not supported"}}'); }
    if (prompt.includes('FAKE_400_SCHEMA') && json.generationConfig?.responseSchema) { res.writeHead(400); return res.end('{"error":{"message":"Invalid schema"}}'); }
    // Image generation (AI cover): answer with a small real PNG. Markers in the prompt force failures.
    if (json.generationConfig?.responseModalities?.includes('IMAGE')) {
      if (prompt.includes('FAKE_IMG_404')) { res.writeHead(404); return res.end('{"error":{"message":"model not found"}}'); }
      if (/gemini-3\.1-flash-image\b(?!-)/.test(req.url) && !req.url.includes('preview') && process.env.FAKE_IMG_FIRST_MISSING === '1') { res.writeHead(404); return res.end('{}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (prompt.includes('FAKE_IMG_BLOCK')) return res.end(JSON.stringify({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }));
      globalThis.__lastImagePrompt = prompt;
      return res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAACoAAAASCAIAAACiiNvMAAAFcUlEQVR4nAXBEexCQQDA4aPov90WRRdF7UGUvEVRJ1nbb4uio6wdRMllUU+i4JZFR1HbQZRcFLUnUfAWZff/PiEELcGfoC3oCLqCnqAvGAiGgpFgLJgIpoKZYC5YCIxgKVgJ1oKNYCvYCfaCg+AoOAnOgiC4CK6Cm+AueAiegpfgLfgIvoKfIAuEkLQkf5K2pCPpSnqSvmQgGUpGkrFkIplKZpK5ZCExkqVkJVlLNpKtZCfZSw6So+QkOUuC5CK5Sm6Su+QheUpekrfkI/lKfpIsEULRUvwp2oqOoqvoKfqKgWKoGCnGioliqpgp5oqFwiiWipVirdgotoqdYq84KI6Kk+KsCIqL4qq4Ke6Kh+KpeCneio/iq/gpskKIglbBX0G7oFPQLegV9AsGBcOCUcG4YFIwLZgVzAsWBaZgWbAqWBdsCrYFu4J9waHgWHAqOBeEgkvBteBWcC94FDwLXgXvgk/Bt+BXkAuEKGmV/JW0Szol3ZJeSb9kUDIsGZWMSyYl05JZybxkUWJKliWrknXJpmRbsivZlxxKjiWnknNJKLmUXEtuJfeSR8mz5FXyLvmUfEt+JblECE1L86dpazqarqan6WsGmqFmpBlrJpqpZqaZaxYao1lqVpq1ZqPZanaaveagOWpOmrMmaC6aq+amuWsemqfmpXlrPpqv5qfJGiGgBX/Qhg50oQd9GMAQRjCGCUxhBnNYgIElrGANG9jCDvZwgCOc4AwBLnCFG9zhAU94wRs+8IUfZBDC0DL8GdqGjqFr6Bn6hoFhaBgZxoaJYWqYGeaGhcEYloaVYW3YGLaGnWFvOBiOhpPhbAiGi+FquBnuhofhaXgZ3oaP4Wv4GbJBCEvL8mdpWzqWrqVn6VsGlqFlZBlbJpapZWaZWxYWY1laVpa1ZWPZWnaWveVgOVpOlrMlWC6Wq+VmuVselqflZXlbPpav5WfJFiEcLcefo+3oOLqOnqPvGDiGjpFj7Jg4po6ZY+5YOIxj6Vg51o6NY+vYOfaOg+PoODnOjuC4OK6Om+PueDiejpfj7fg4vo6fIzuEqGhV/FW0KzoV3YpeRb9iUDGsGFWMKyYV04pZxbxiUWEqlhWrinXFpmJbsavYVxwqjhWninNFqLhUXCtuFfeKR8Wz4lXxrvhUfCt+FblCCE/L8+dpezqerqfn6XsGnqFn5Bl7Jp6pZ+aZexYe41l6Vp61Z+PZenaevefgOXpOnrMneC6eq+fmuXsenqfn5Xl7Pp6v5+fJHiECrcBfoB3oBLqBXqAfGASGgVFgHJgEpoFZYB5YBExgGVgF1oFNYBvYBfaBQ+AYOAXOgRC4BK6BW+AeeASegVfgHfgEvoFfIAeEiLQif5F2pBPpRnqRfmQQGUZGkXFkEplGZpF5ZBExkWVkFVlHNpFtZBfZRw6RY+QUOUdC5BK5Rm6Re+QReUZekXfkE/lGfpEcESLRSvwl2olOopvoJfqJQWKYGCXGiUlimpgl5olFwiSWiVVindgktoldYp84JI6JU+KcCIlL4pq4Je6JR+KZeCXeiU/im/glckKImlbNX027plPTrenV9GsGNcOaUc24ZlIzrZnVzGsWNaZmWbOqWddsarY1u5p9zaHmWHOqOdeEmkvNteZWc6951DxrXjXvmk/Nt+ZXk2uEaGg1/DW0GzoN3YZeQ79h0DBsGDWMGyYN04ZZw7xh0WAalg2rhnXDpmHbsGvYNxwajg2nhnNDaLg0XBtuDfeGR8Oz4dXwbvg0fBt+DblBiEwr85dpZzqZbqaX6WcGmWFmlBlnJplpZpaZZxYZk1lmVpl1ZpPZZnaZfeaQOWZOmXMmZC6Za+aWuWcemWfmlXlnPplv5pfJmX/cuvmalvNLTgAAAABJRU5ErkJggg==' } }] } }] }));
    }
    // Testimonial tidy-up: echo the original, cleaned. FAKE_TIDY_INVENT adds a result that wasn't there.
    if (prompt.includes('Turn it into a short testimonial')) {
      const orig = (prompt.match(/Original message: """([\s\S]*?)"""/) || [])[1] || '';
      let quote = orig.replace(/^(hi|hello|hey)[^a-z]*(ma'?am|sir|di|didi)?[,! ]*/i, '').replace(/FAKE_TIDY_INVENT/g, '').trim();
      quote = quote.charAt(0).toUpperCase() + quote.slice(1);
      if (orig.includes('FAKE_TIDY_INVENT')) quote += ' I lost 12 kg in 30 days!';
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ quote }) }] } }] }));
    }
    // AI cover fallback: palette + motif design (text model).
    if (prompt.includes('Design the colour palette')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      const design = { background: '#1E293B', colors: ['#F59E0B', '#38BDF8', '#F472B6'], motif: 'paintbrush', layout: 'waves', mood: 'calm creative weekend' };
      return res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(design) }] } }] }));
    }
    if (!json.generationConfig?.responseSchema) {
      const m = prompt.match(/matching this schema:\n([\s\S]+)$/);
      json.generationConfig = { ...json.generationConfig, responseSchema: m ? JSON.parse(m[1]) : {} };
    }

    if (prompt.includes('FAKE_TIMEOUT')) { await new Promise((r) => setTimeout(r, 5000)); }
    if (prompt.includes('FAKE_429')) { res.writeHead(429); return res.end('{}'); }
    if (prompt.includes('FAKE_503_PRIMARY') && /gemini-3\.5-flash-lite/.test(req.url)) { res.writeHead(503); return res.end('{"error":{"message":"The model is overloaded."}}'); }
    if (prompt.includes('FAKE_503_ALL')) { res.writeHead(503); return res.end('{}'); }
    // Primary overloaded once, fallback hangs, primary recovers: the real pattern seen in production logs.
    if (prompt.includes('FAKE_503_SLOW_FALLBACK')) {
      if (/gemini-3\.6-flash/.test(req.url)) { await new Promise((r) => setTimeout(r, 4000)); res.writeHead(504); return res.end('{}'); }
      if (once('503slow')) { res.writeHead(503); return res.end('{}'); }
    }
    if (prompt.includes('FAKE_500_ONCE') && once('500')) { res.writeHead(500); return res.end('{}'); }
    if (prompt.includes('FAKE_BADJSON_ONCE') && once('bad')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"creator": {' }] }, finishReason: 'MAX_TOKENS' }] }));
    }
    if (prompt.includes('FAKE_BADJSON_ALWAYS')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }));
    }
    if (prompt.includes('FAKE_EMPTY')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }));
    }
    if (prompt.includes('FAKE_DUP')) {
      const out = respond(json.generationConfig?.responseSchema, prompt);
      out.products[1] = { ...out.products[0] };
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
    }
    if (prompt.includes('FAKE_ONE_PRODUCT')) {
      const out = respond(json.generationConfig?.responseSchema, prompt);
      out.products = out.products.slice(0, 1);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
    }
    const imageText = (json.contents?.[0]?.parts || []).filter((p) => p.inlineData).map((p) => Buffer.from(p.inlineData.data, 'base64').toString('latin1')).join(' ');
    const out = respond(json.generationConfig?.responseSchema, prompt, imageText);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(out) + '\n```' }] }, finishReason: 'STOP' }] }));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFakeGemini(Number(process.env.PORT) || 4010);
  console.log('fake gemini on', s.address().port);
}
