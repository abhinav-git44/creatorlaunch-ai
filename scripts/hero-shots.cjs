// Regenerates the home page hero images from the real app: the creator dashboard
// (public/brand/hero-dashboard.jpg) and a published storefront (public/brand/hero-store.jpg),
// using a fictional sample creator. Needs the dev server running on PORT (default 4517) with a
// throwaway DATA_DIR, and Playwright:  node scripts/hero-shots.cjs
const path = require('node:path');
const { chromium } = require('playwright');
const B = `http://localhost:${process.env.PORT || 4517}`;
const OUT = path.join(__dirname, '..', 'public', 'brand');

(async () => {
  const S = await import('../public/assets/template-samples.js');
  const T = await import('../public/assets/templates.js');
  const c0 = S.SAMPLE_CREATORS.cook;
  const content = { creator: { ...c0.creator }, links: { ...c0.links }, products: c0.products.map((p) => ({ ...p })), theme: T.applyTemplate({}, 'lifestyle'), language: 'en', tone: 'friendly', testimonials: [] };
  delete content.creator.cover; // the sample cover is a data-only key; upload it for real below
  const post = (p, body, key) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-edit-key': key } : {}) }, body: JSON.stringify(body) }).then((r) => r.json());
  const s = await post('/api/stores', { input: { mode: 'describe', name: 'Meera Shah', description: 'I cook wholesome Gujarati thalis for busy working mothers and share weekly meal plans.', language: 'en', tone: 'friendly' }, content });
  const fs = require('node:fs');
  const cover = fs.readFileSync(path.join(OUT, 'examples', 'cooking.jpg')).toString('base64');
  const asset = await post(`/api/stores/${s.id}/assets`, { kind: 'cover', mime: 'image/jpeg', data: cover }, s.editKey);
  await fetch(`${B}/api/stores/${s.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-edit-key': s.editKey }, body: JSON.stringify({ content: { ...content, creator: { ...content.creator, cover: asset.id } } }) });
  await post(`/api/stores/${s.id}/publish`, { slug: 'meera-shah' }, s.editKey);

  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await desk.goto(`${B}/edit/${s.id}#k=${encodeURIComponent(s.editKey)}`);
  await desk.waitForSelector('#sec-overview .dash-row');
  await desk.waitForTimeout(1500);
  await desk.evaluate(() => {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    // No numbers in marketing images: hide the stat tiles rather than show sample figures.
    document.querySelectorAll('.dash-stats, .dash-hint').forEach((x) => { x.style.display = 'none'; });
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) walk.currentNode.nodeValue = walk.currentNode.nodeValue.replace(/localhost:\d+/g, 'creatorlaunch-ai1.vercel.app').replace(/ · \d+ taps? \(30 days\)/, '');
  });
  await desk.screenshot({ path: path.join(OUT, 'hero-dashboard.jpg'), type: 'jpeg', quality: 78 });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.goto(`${B}/s/meera-shah`);
  await phone.waitForTimeout(800);
  // Show the offers (format, price, button) rather than repeat the header the laptop already shows.
  await phone.evaluate(() => window.scrollTo(0, document.querySelector('#o-h').getBoundingClientRect().top + window.scrollY - 24));
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: path.join(OUT, 'hero-store.jpg'), type: 'jpeg', quality: 76 });
  await browser.close();
  for (const f of ['hero-dashboard.jpg', 'hero-store.jpg']) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024), 'KB');
})();
