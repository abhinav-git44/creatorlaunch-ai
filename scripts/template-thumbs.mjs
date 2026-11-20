// Regenerates the gallery thumbnails (public/templates/<id>.jpg) from the real renderer, using the
// fictional sample creators. Run after changing a template's look:
//   node scripts/template-thumbs.mjs      (needs Playwright: npm i --no-save playwright)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const { renderStorefront } = await import(path.join(pub, 'assets/render.js'));
const { TEMPLATE_IDS, applyTemplate } = await import(path.join(pub, 'assets/templates.js'));
const { sampleContent, SAMPLE_IMAGES } = await import(path.join(pub, 'assets/template-samples.js'));
const { chromium } = createRequire(path.join(root, 'package.json'))('playwright');

const images = Object.fromEntries(Object.entries(SAMPLE_IMAGES).map(([k, p]) => [k, `data:image/jpeg;base64,${fs.readFileSync(path.join(pub, p)).toString('base64')}`]));
fs.mkdirSync(path.join(pub, 'templates'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 });
for (const id of TEMPLATE_IDS) {
  const html = renderStorefront(sampleContent(id, applyTemplate({}, id)), { mode: 'public', assetSrc: (k) => images[k] || '' })
    .replace('<script type="module" src="/assets/store.js"></script>', '');
  await page.setContent(html, { waitUntil: 'load' });
  const out = path.join(pub, 'templates', `${id}.jpg`);
  await page.screenshot({ path: out, type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: 390, height: 520 } });
  console.log(id, Math.round(fs.statSync(out).size / 1024), 'KB');
}
await browser.close();
