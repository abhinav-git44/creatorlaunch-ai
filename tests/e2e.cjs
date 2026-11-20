// Browser end-to-end run (Playwright) against the dev server with the TEST-ONLY fake LLM.
// Covers the full creator journey, edge cases and 7 viewports. Screenshots → tests/screens/.
// Run: npm i --no-save playwright && npx playwright install chromium && node tests/e2e.cjs
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screens');
const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
let passed = 0;

function check(cond, msg) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const waitSaved = (page) => page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved', null, { timeout: 10000 });

(async () => {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const { startFakeGemini } = await import(path.join(__dirname, 'fake-gemini.js'));
  const fake = await startFakeGemini(0);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-e2e-'));
  const server = spawn(process.execPath, ['dev-server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), GEMINI_API_KEY: 'test', GEMINI_BASE_URL: `http://localhost:${fake.address().port}`, LLM_TIMEOUT_MS: '1500', DATA_DIR: dataDir, DEV_LOG: '0', SUPABASE_URL: '', VERCEL: '', METRICS_TOKEN: '' },
  });
  await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('running at') && r()));

  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
    p.on('dialog', (d) => { errors.push(`unexpected dialog: ${d.message()}`); d.dismiss(); });
  };
  const phoneCtx = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const phone = await browser.newContext({ ...phoneCtx, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await phone.newPage();
  watch(page);
  const eventsSeen = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/events')) { try { eventsSeen.push(...JSON.parse(r.postData()).events.map((e) => e.name)); } catch { /* ignore */ } } });

  try {
    // ------------------------------------------------------------ 1. onboarding + edge cases
    console.log('1. Onboarding and input edge cases (phone 390×844)');
    await page.goto(BASE + '/');
    await shot(page, 'after-01-create-phone', true);
    await page.click('#submit');
    check(await page.isVisible('#e-description'), 'empty input: field error shown, no AI call');
    await page.fill('#name', 'Test');
    await page.fill('#description', 'asdfgh qwerty');
    await page.click('#submit');
    check((await page.textContent('#e-description')).includes('random keys'), 'gibberish: caught with an example of what to write');
    await page.click('[data-mode="instagram"]');
    await page.fill('#handle', 'bad..handle');
    await page.click('#submit');
    check(await page.isVisible('#e-handle'), 'invalid Instagram username: caught');
    check((await page.textContent('#ig-block')).includes("don't log in to or scrape Instagram"), 'never implies Instagram is logged into or scraped');
    await page.fill('#handle', '');
    await page.click('[data-mode="describe"]');
    await page.fill('#description', 'I teach yoga to office workers FAKE_TIMEOUT');
    await page.click('#submit');
    await page.waitForSelector('#failed:not([hidden])', { timeout: 15000 });
    await shot(page, 'after-03-ai-timeout-phone');
    check((await page.textContent('#failed-msg')).includes('longer than usual'), 'AI timeout: friendly retry state');
    await page.click('#back');
    check((await page.inputValue('#description')).includes('yoga'), 'input preserved after a failure');
    await page.fill('#description', 'I teach yoga to office workers FAKE_BADJSON_ALWAYS');
    await page.click('#submit');
    await page.waitForSelector('#failed:not([hidden])', { timeout: 15000 });
    check((await page.textContent('#failed-msg')).includes('Try again'), 'invalid AI JSON: friendly retry state');
    await page.click('#back');

    // ------------------------------------------------------------ 2. generate → editor
    console.log('2. Generate and validate the draft');
    await page.click('[data-example="fitness"]');
    await page.click('[data-tone="expert"]');
    await page.click('#submit');
    await page.waitForURL(/\/edit\//, { timeout: 15000 });
    await page.waitForSelector('[data-pid]');
    const editorUrl = page.url();
    check(editorUrl.includes('#k='), 'editor opened with the private edit key in the URL fragment');
    check((await page.inputValue('[data-bind="creator.bio"]')).length > 10, 'creator bio generated');
    const nProducts = await page.locator('[data-pid]').count();
    check(nProducts >= 2 && nProducts <= 4, `2–4 products generated (${nProducts})`);
    check((await page.textContent('#sec-products')).includes('Typical for this format'), 'typical INR range shown next to each price');
    await shot(page, 'after-04-editor-phone', true);

    // ------------------------------------------------------------ 3. edits
    console.log('3. Edit title, price, description');
    const card = (i) => page.locator('[data-pid]').nth(i);
    await card(0).locator('[data-pf="title"]').fill('My Edited Desk Relief Guide');
    await card(0).locator('[data-pf="priceInr"]').fill('249');
    await card(0).locator('[data-pf="shortDescription"]').fill('Ten minutes a day to undo eight hours of sitting.');
    await waitSaved(page);
    check(true, 'title, price and pitch edits autosaved');
    await card(0).locator('[data-pf="priceInr"]').fill('');
    await page.waitForTimeout(1200);
    check((await page.textContent('#save-status')).startsWith('Not saved'), 'invalid (empty) price blocks saving with a clear reason');
    await card(0).locator('[data-pf="priceInr"]').fill('249');
    await waitSaved(page);

    // ------------------------------------------------------------ 4. regenerate one product + undo
    console.log('4. Regenerate one product, verify isolation, undo');
    const titles = () => page.locator('[data-pf="title"]').evaluateAll((els) => els.map((e) => e.value));
    const before = await titles();
    await page.locator('[data-action="regen-product"]').nth(1).click();
    await page.waitForSelector('.sheet');
    await shot(page, 'after-05-regenerate-sheet-phone');
    await page.click('.sheet [data-go]');
    await page.waitForSelector('.toast >> text=New product idea');
    const after = await titles();
    check(after[1] !== before[1], 'product 2 replaced');
    check(after[0] === before[0] && after[2] === before[2], 'unrelated products unchanged (incl. my edited title)');
    check((await card(0).locator('[data-pf="priceInr"]').inputValue()) === '249', 'my edited price survived the regeneration');
    await page.click('.toast >> text=Undo');
    check((await titles())[1] === before[1], 'undo restores the previous product');
    await waitSaved(page);

    // failed regeneration keeps content
    await page.locator('[data-action="regen-product"]').first().click();
    await page.fill('.sheet #ins', 'FAKE_BADJSON_ALWAYS');
    await page.click('.sheet [data-go]');
    await page.waitForSelector('.toast.error');
    check((await page.textContent('.toast.error')).includes('unchanged'), 'API failure on regenerate: content kept, message says so');
    check((await titles())[0] === 'My Edited Desk Relief Guide', 'content really unchanged after the failure');

    // full-store rewrite needs confirmation
    await page.locator('#sec-look [data-lang="hinglish"]').click();
    await page.waitForSelector('.sheet >> text=Rewrite your store');
    check(true, 'language switch asks for confirmation before rewriting');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    check(await page.evaluate(() => Boolean(document.activeElement.closest('.sheet'))), 'keyboard focus stays trapped inside the dialog');
    await page.click('.sheet [data-x]');
    check((await page.locator('#sec-look [data-lang="en"]').getAttribute('aria-pressed')) === 'true', 'cancel leaves the language unchanged');

    // ------------------------------------------------------------ 5. buyer destinations + theme
    console.log('5. Buyer destinations, theme, preview');
    await page.fill('[data-link="whatsapp"]', '98765 43210');
    await card(0).locator('details.more summary').click();
    await card(0).locator('[data-pf="buyUrl"]').fill('javascript:alert(1)');
    await page.waitForTimeout(1200);
    check((await page.textContent('#save-status')).includes('payment link'), 'unsafe payment link is rejected before saving');
    await card(0).locator('[data-pf="buyUrl"]').fill('https://rzp.io/l/desk-relief');
    await page.click('[data-theme="bold"]');
    await waitSaved(page);
    check(true, 'WhatsApp number, payment link and theme saved');
    await page.click('#bottom-bar [data-action="preview"]');
    await page.waitForTimeout(700);
    await shot(page, 'after-06-preview-bold-phone');
    const pv = page.frameLocator('#preview-mobile');
    check((await pv.locator('body').getAttribute('data-theme')) === 'bold', 'preview shows the chosen theme');
    await page.click('.preview-overlay [data-close]');

    // ------------------------------------------------------------ 6. publish, copy, open independently
    console.log('6. Publish, copy URL, open in an independent browser context');
    await page.click('#publish-bottom');
    await page.waitForSelector('.sheet #slug');
    check((await page.inputValue('.sheet #slug')) === 'riya-sharma', 'link suggested from the creator name');
    await page.click('.sheet [data-go]');
    await page.waitForSelector('text=Your store is live!');
    await shot(page, 'after-07-published-phone');
    const url = await page.locator('.sheet .sub a').getAttribute('href');
    await page.click('.sheet [data-copy]');
    await page.waitForTimeout(300);
    check((await page.evaluate(() => navigator.clipboard.readText())) === url, `Copy link puts the public URL on the clipboard (${url})`);
    await page.click('.sheet [data-x]');

    const visitorCtx = await browser.newContext(phoneCtx);
    const vp = await visitorCtx.newPage();
    watch(vp);
    const visitorEvents = [];
    vp.on('request', (r) => { if (r.url().endsWith('/api/events')) { try { visitorEvents.push(...JSON.parse(r.postData()).events.map((e) => e.name)); } catch { /* ignore */ } } });
    check((await vp.goto(url)).status() === 200, 'public page loads in a fresh context without the edit key');
    await shot(vp, 'after-08-public-bold-phone', true);
    const html = await vp.content();
    check(html.includes('My Edited Desk Relief Guide') && html.includes('₹249'), 'saved title and price appear publicly');
    check((await vp.locator('body').getAttribute('data-theme')) === 'bold', 'published page uses the chosen theme');
    const firstCta = vp.locator('[data-cta]').first();
    check((await firstCta.getAttribute('href')) === 'https://rzp.io/l/desk-relief', 'product 1 button opens the payment link');
    check((await firstCta.getAttribute('rel')).includes('noopener'), 'external links open safely (noopener)');
    check((await vp.locator('[data-cta]').nth(1).getAttribute('href')).startsWith('https://wa.me/919876543210'), 'product 2 button opens a WhatsApp enquiry');
    const [popup] = await Promise.all([vp.waitForEvent('popup', { timeout: 5000 }).catch(() => null), firstCta.click()]);
    if (popup) await popup.close();
    await vp.waitForTimeout(800);
    check(visitorEvents.includes('storefront_viewed') && visitorEvents.includes('product_cta_clicked'), 'view and CTA click are tracked');
    check(await noOverflow(vp), 'no horizontal scroll on the public page');

    // ------------------------------------------------------------ 7. unpublish / republish
    console.log('7. Unpublish and republish');
    await page.click('[data-action="unpublish"]');
    await page.click('.sheet [data-go]');
    await page.waitForSelector('.toast >> text=offline');
    const gone = await (await browser.newContext()).newPage();
    check((await gone.goto(url)).status() === 404, 'unpublished page is no longer public (404)');
    await page.click('#publish-bottom');
    await page.waitForSelector('.sheet #slug');
    await page.click('.sheet [data-go]');
    await page.waitForSelector('text=Your store is live!');
    await page.click('.sheet [data-x]');
    check((await gone.goto(url)).status() === 200, 'republished page works again at the same link');
    check(eventsSeen.includes('onboarding_started') && eventsSeen.includes('creator_input_submitted') && eventsSeen.includes('store_previewed'), 'onboarding, submit and preview events sent');

    // ------------------------------------------------------------ 8. other edge cases
    console.log('8. Duplicate slug, XSS, missing/invalid edit key');
    const p2 = await phone.newPage();
    watch(p2);
    await p2.goto(BASE + '/');
    await p2.fill('#name', 'Riya Sharma <img src=x onerror=alert(1)>');
    await p2.fill('#description', 'I teach <script>alert(1)</script> home workouts to working women');
    await p2.click('#submit');
    await p2.waitForURL(/\/edit\//, { timeout: 15000 });
    await p2.waitForSelector('[data-pid]');
    check(!(await p2.inputValue('[data-bind="creator.displayName"]')).includes('<'), 'XSS payload in the name is stripped');
    await p2.click('#publish-bottom');
    await p2.waitForSelector('.sheet #slug');
    await p2.fill('.sheet #slug', 'riya-sharma');
    await p2.click('.sheet [data-go]');
    await p2.waitForSelector('.sheet #slug-error:not([hidden])');
    check((await p2.textContent('.sheet #slug-error')).includes('taken'), 'duplicate link: explained, with a free suggestion');
    check((await p2.inputValue('.sheet #slug')) === 'riya-sharma-2', 'suggested free link pre-filled');
    await p2.click('.sheet [data-go]');
    await p2.waitForSelector('text=Your store is live!');
    const xssPage = await (await browser.newContext()).newPage();
    watch(xssPage);
    await xssPage.goto(BASE + '/s/riya-sharma-2');
    check(!(await xssPage.content()).includes('onerror=alert'), 'no injected markup on the public page');

    const noKey = await (await browser.newContext()).newPage();
    await noKey.goto(editorUrl.split('#')[0]);
    await noKey.waitForSelector('.center-state');
    check((await noKey.textContent('.center-state')).includes('missing its private key'), 'missing edit key: friendly explanation');
    await noKey.goto(editorUrl.split('#')[0] + '#k=not-the-right-key');
    await noKey.reload();
    await noKey.waitForSelector('.center-state');
    check((await noKey.textContent('.center-state')).includes("couldn't find"), 'invalid edit key: refused without revealing the store');

    // ------------------------------------------------------------ 9. themes + viewports
    console.log('9. Themes and 7 viewports');
    const viewports = [[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
    for (const theme of ['minimal', 'bold', 'elegant']) {
      await page.click(`[data-theme="${theme}"]`);
      await waitSaved(page);
      await page.waitForTimeout(400);
      for (const [w, h] of viewports) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 768 });
        const p = await ctx.newPage();
        watch(p);
        await p.goto(url);
        if (!(await noOverflow(p))) throw new Error(`FAILED: horizontal overflow on ${theme} at ${w}×${h}`);
        if ((w === 390 || w === 1440)) await shot(p, `after-public-${theme}-${w}`, true);
        await ctx.close();
      }
      check(true, `${theme} theme: no horizontal overflow at 360, 390, 430, 768, 1024, 1440, 1920`);
    }
    for (const [w, h] of viewports) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 768 });
      const p = await ctx.newPage();
      watch(p);
      await p.goto(BASE + '/');
      const okCreate = await noOverflow(p);
      await p.goto(editorUrl);
      await p.waitForSelector('[data-pid]');
      const okEdit = await noOverflow(p);
      if (w === 1440) await shot(p, 'after-09-editor-desktop');
      if (w === 768) await shot(p, 'after-editor-tablet');
      await ctx.close();
      if (!okCreate || !okEdit) throw new Error(`FAILED: overflow on app screens at ${w}×${h}`);
    }
    check(true, 'create + editor screens: no horizontal overflow at all 7 viewports');

    // ------------------------------------------------------------ 10. Instagram screenshot import
    console.log('10. Instagram screenshot import');
    const mock = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
    await mock.setContent(`<body style="font-family:sans-serif;margin:0;padding:16px"><b style="font-size:20px">riya.fit</b>
      <div style="display:flex;gap:24px;margin:16px 0"><div style="width:80px;height:80px;border-radius:50%;background:#e4572e"></div>
      <div><b>214</b> posts</div><div><b>38.2K</b> followers</div><div><b>301</b> following</div></div>
      <b>Riya | Desk-job back pain coach</b><p>15-min home workouts for working women 🧘‍♀️<br>DM "BACK" for 1:1 coaching</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px">${'<div style="aspect-ratio:1;background:#ddd"></div>'.repeat(9)}</div></body>`);
    const screenshot = await mock.screenshot({ type: 'png' });
    await mock.context().close();
    const ig = await phone.newPage();
    watch(ig);
    await ig.goto(BASE + '/');
    await ig.click('[data-mode="instagram"]');
    await ig.setInputFiles('#shot-input', { name: 'profile.png', mimeType: 'image/png', buffer: screenshot });
    await ig.waitForSelector('.shot img');
    check(await ig.isVisible('#own-wrap'), 'screenshot thumbnail shown with the "my own account" confirmation');
    check((await ig.textContent('#desc-label')).includes('optional'), 'description becomes optional once a screenshot is added');
    await ig.click('#submit');
    check(await ig.isVisible('#e-ownAccount'), 'cannot generate from screenshots without confirming account ownership');
    await shot(ig, 'after-11-instagram-screenshot-phone', true);
    await ig.check('#own-account');
    await ig.click('#submit');
    await ig.waitForURL(/\/edit\//, { timeout: 15000 });
    await ig.waitForSelector('.profile-read');
    check((await ig.textContent('.profile-read')).includes('@riya.fit'), 'editor shows what was read from the screenshots (username taken from the image)');
    await shot(ig, 'after-12-editor-from-screenshots-phone');

    // ------------------------------------------------------------ 11. Profile picture + cover image
    console.log('11. Profile picture and cover image');
    await ig.setInputFiles('#avatar-file', { name: 'me.png', mimeType: 'image/png', buffer: screenshot });
    await ig.waitForSelector('.avatar-box img');
    check(await ig.isVisible('[data-action="remove-avatar"]'), 'profile picture uploaded (cropped in the browser) and shown in the editor');
    await ig.waitForSelector('.toast >> text=Profile picture added');
    await ig.click('[data-action="gen-cover"]');
    await ig.waitForSelector('.cover-box img', { timeout: 20000 });
    check(await ig.isVisible('.ai-badge'), 'AI cover drawn from the description and labelled "AI-generated"');
    await ig.click('.toast >> text=Undo');
    await ig.waitForSelector('.cover-box img', { state: 'detached' });
    check(true, 'undo removes the AI cover');
    await ig.setInputFiles('#cover-file', { name: 'cover.png', mimeType: 'image/png', buffer: screenshot });
    await ig.waitForSelector('.cover-box img');
    check(!(await ig.isVisible('.ai-badge')), 'uploaded cover replaces it, without the AI label');
    await ig.click('#bottom-bar [data-action="preview"]');
    const pf = await (await ig.waitForSelector('#preview-mobile')).contentFrame();
    await pf.waitForSelector('.hero img');
    await ig.waitForTimeout(800);
    const pimgs = await pf.$$eval('.hero img', (els) => els.map((i) => i.complete && i.naturalWidth > 0));
    check(pimgs.length === 2 && pimgs.every(Boolean), 'live preview (sandboxed) shows the cover and the profile picture');
    await ig.keyboard.press('Escape');
    await ig.click('.preview-overlay .preview-head button').catch(() => {});
    await ig.waitForSelector('#preview-mobile', { state: 'detached' }).catch(() => {});
    await ig.waitForSelector('#save-status.ok', { timeout: 10000 }).catch(() => {});
    await ig.waitForTimeout(1500);
    await ig.reload();
    await ig.waitForSelector('.cover-box img');
    check(await ig.isVisible('.avatar-box img'), 'images persist after reload');
    await ig.setInputFiles('#cover-file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await ig.waitForSelector('.toast.error >> text=JPG, PNG or WebP');
    check(true, 'non-image file refused with a plain message');

    // Product image: upload on the first product, check preview, remove + undo.
    const firstPid = await ig.getAttribute('#sec-products .product', 'data-pid');
    await ig.setInputFiles(`#pf-${firstPid}`, { name: 'product.png', mimeType: 'image/png', buffer: screenshot });
    await ig.waitForSelector(`#pi-${firstPid} .pimg-box img`);
    check(await ig.isVisible(`#pi-${firstPid} [data-action="remove-pimg"]`), 'product image uploaded and shown on that product in the editor');
    check((await ig.$$('.pimg-box img')).length === 1, 'other products stay without an image');
    await ig.click(`#pi-${firstPid} [data-action="remove-pimg"]`);
    await ig.waitForSelector(`#pi-${firstPid} .pimg-box img`, { state: 'detached' });
    await ig.click('.toast >> text=Undo');
    await ig.waitForSelector(`#pi-${firstPid} .pimg-box img`);
    check(true, 'removing a product image can be undone');
    await ig.click('#bottom-bar [data-action="preview"]');
    const pf2 = await (await ig.waitForSelector('#preview-mobile')).contentFrame();
    await pf2.waitForSelector(`#p-${firstPid} .pimg img`);
    await ig.waitForTimeout(600);
    check(await pf2.$eval(`#p-${firstPid} .pimg img`, (i) => i.complete && i.naturalWidth > 0), 'live preview shows the product image');
    await ig.keyboard.press('Escape');
    await ig.click('.preview-overlay .preview-head button').catch(() => {});
    await ig.waitForSelector('#preview-mobile', { state: 'detached' }).catch(() => {});
    await ig.waitForSelector('#save-status.ok', { timeout: 10000 }).catch(() => {});
    await ig.waitForTimeout(1500);
    await ig.click('#bottom-bar [data-action="publish"]');
    await ig.waitForSelector('.sheet');
    await ig.fill('.sheet input', `pics-${Date.now().toString(36)}`);
    await ig.click('.sheet >> text=Publish now');
    await ig.waitForSelector('text=Your store is live!');
    const liveUrl = await ig.getAttribute('.sheet a[href*="/s/"]', 'href');
    const pub = await phone.newPage();
    watch(pub);
    await pub.goto(liveUrl);
    const imgs = await pub.$$eval('.hero img', (els) => els.map((i) => i.complete && i.naturalWidth > 0));
    check(imgs.length === 2 && imgs.every(Boolean), 'public storefront shows the cover and the profile picture');
    check(await pub.$eval(`#p-${firstPid} .pimg img`, (i) => i.complete && i.naturalWidth > 0).catch(() => false), 'public storefront shows the product image on that product');
    await ig.click('.sheet >> text=Keep editing');
    await ig.waitForSelector('.sheet', { state: 'detached' });
    for (const theme of ['bold', 'elegant']) {
      await ig.click(`[data-theme="${theme}"]`);
      await ig.waitForTimeout(2200); // autosave
      await pub.goto(liveUrl);
      const ok = await pub.$$eval('.hero img', (els) => els.length === 2 && els.every((i) => i.complete && i.naturalWidth > 0));
      const pok = await pub.$eval(`#p-${firstPid} .pimg img`, (i) => i.complete && i.naturalWidth > 0).catch(() => false);
      check(pok, `${theme} theme shows the product image`);
      const noOverflow = await pub.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      check(ok && noOverflow, `${theme} theme shows both images with no horizontal overflow`);
      await shot(pub, `after-13-storefront-images-${theme}-phone`, true);
    }
    await pub.close();

    // ------------------------------------------------------------ 12. Testimonials
    console.log('12. Testimonials');
    await ig.click('[data-action="t-add"]');
    const tq = await ig.waitForSelector('#sec-testimonials textarea[data-tf="quote"]');
    check(await ig.evaluate(() => document.activeElement?.dataset.tf === 'quote'), 'adding a testimonial focuses its text box');
    await tq.type('hi maam your 15 min routines realy helped my back pain thank you');
    await ig.fill('#sec-testimonials input[data-tf="name"]', 'Asha');
    await ig.fill('#sec-testimonials input[data-tf="detail"]', 'Teacher, Pune');
    check((await ig.textContent('#sec-testimonials .tst-hidden')).includes('Hidden'), 'not shown on the store until confirmed');
    await ig.click('[data-action="t-tidy"]');
    await ig.waitForSelector('.tidy');
    check((await ig.textContent('.tidy p')).startsWith('Your 15 min routines'), 'AI tidy-up suggests a cleaned version of the real message, side by side');
    await ig.click('[data-action="t-use"]');
    check((await ig.inputValue('#sec-testimonials textarea[data-tf="quote"]')).startsWith('Your 15 min'), 'tidied version applied (undo available)');
    await ig.check('#sec-testimonials input[data-tf="consent"]');
    await ig.waitForSelector('#sec-testimonials .tst-live');
    check(true, 'ticking consent marks it "Shown on your store"');
    await ig.waitForTimeout(2200);
    const tp = await phone.newPage();
    watch(tp);
    await tp.goto(liveUrl);
    const tText = await tp.textContent('.testimonials');
    check(tText.includes('Asha') && tText.includes('Teacher, Pune') && tText.includes('Your 15 min'), 'public storefront shows the confirmed testimonial');
    await ig.uncheck('#sec-testimonials input[data-tf="consent"]');
    await ig.waitForTimeout(2200);
    await tp.goto(liveUrl);
    check(!(await tp.$('.testimonials')), 'unticking consent removes it from the public page');
    await shot(ig, 'after-14-testimonials-editor-phone');
    await tp.close();

    // ------------------------------------------------------------ 13. Template library
    console.log('13. Template library (10 free templates)');
    const home = await (await browser.newContext(phoneCtx)).newPage();
    watch(home);
    await home.goto(BASE + '/#templates');
    await home.waitForSelector('#home-gallery .tpl-card');
    check((await home.$$('#home-gallery .tpl-card')).length === 10, 'home gallery lists 10 templates');
    check((await home.$$('#home-gallery .tpl-card .tpl-free')).length === 10, 'every template is labelled Free');
    const thumbsOk = await home.$$eval('#home-gallery .tpl-thumb img', async (imgs) => {
      await Promise.all(imgs.map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
      return imgs.every((i) => i.naturalWidth > 0);
    });
    check(thumbsOk, 'all 10 thumbnails load');
    await home.click('#home-gallery [data-gfilter="fitness"]');
    check((await home.$$('#home-gallery .tpl-card:not([hidden])')).length === 1, 'filter: Fitness shows the fitness template');
    await home.click('#home-gallery [data-gfilter="premium"]');
    const premium = await home.$$eval('#home-gallery .tpl-card:not([hidden])', (els) => els.map((x) => x.dataset.tid));
    check(premium.includes('elite') && premium.includes('elegant'), 'filter: Premium includes Elite Gold and Elegant Premium');
    await home.click('#home-gallery [data-gfilter="all"]');
    await home.fill('#home-gallery [data-gsearch]', 'yoga');
    check((await home.$$eval('#home-gallery .tpl-card:not([hidden])', (els) => els.map((x) => x.dataset.tid))).join() === 'fitness', 'search "yoga" finds Fitness & Wellness');
    await home.fill('#home-gallery [data-gsearch]', 'zzzz');
    check(await home.isVisible('#home-gallery [data-gempty]'), 'search with no match shows a way back');
    await home.click('#home-gallery [data-gclear]');
    check((await home.$$('#home-gallery .tpl-card:not([hidden])')).length === 10, 'clear shows all 10 again');
    await home.click('#home-gallery [data-tid="spotlight"] [data-gaction="preview"]');
    await home.waitForSelector('.sheet .tpv-stage iframe');
    const tpv = home.frameLocator('.sheet .tpv-stage iframe');
    check((await tpv.locator('body').getAttribute('data-theme')) === 'spotlight' && (await tpv.locator('.card').count()) > 0, 'preview renders a full storefront in that template');
    check((await tpv.locator('.name').textContent()).includes('Rohan'), 'home preview uses a fictional example creator');
    await home.click('.sheet [data-dev="desktop"]');
    check((await home.getAttribute('.sheet .tpv-stage', 'class')).includes('tpv-desktop'), 'preview switches to desktop width');
    await home.click('.sheet [data-use]');
    await home.waitForSelector('.sheet', { state: 'detached' });
    check((await home.textContent('#tpl-pick-name')) === 'Creator Spotlight', 'Use this template: chosen template shown in the create form');
    await home.click('#tpl-pick-clear');
    check((await home.textContent('#tpl-pick-name')) === 'Picked for you', '"Let AI pick" clears the choice');
    await home.click('#home-gallery [data-tid="fitness"] [data-gaction="use"]');
    await home.fill('#name', 'Asha Rao');
    await home.fill('#description', 'I teach yoga and simple strength routines to women over 40 who work from home and want to feel stronger.');
    await home.click('#submit');
    await home.waitForURL(/\/edit\//, { timeout: 20000 });
    await home.waitForSelector('#sec-template');
    check((await home.getAttribute('#sec-template [data-theme="fitness"]', 'aria-pressed')) === 'true', 'store is built in the template picked before generating');
    const pf3 = home.frameLocator('#preview-mobile, #preview').first();
    await home.click('#bottom-bar [data-action="preview"]');
    await home.waitForSelector('#preview-mobile');
    await home.waitForTimeout(600);
    check((await home.frameLocator('#preview-mobile').locator('body').getAttribute('data-theme')) === 'fitness', 'AI products populate the chosen template in the preview');
    check((await home.frameLocator('#preview-mobile').locator('.card').count()) >= 2, 'AI-generated products render as cards');
    await home.click('.preview-overlay [data-close]');
    void pf3;

    // Missing required info: placeholder in the preview, publishing blocked.
    const bioBefore = await home.inputValue('[data-bind="creator.bio"]');
    await home.fill('[data-bind="creator.bio"]', '');
    await home.click('#bottom-bar [data-action="preview"]');
    await home.waitForSelector('#preview-mobile');
    await home.waitForTimeout(700);
    check((await home.frameLocator('#preview-mobile').locator('.ph').first().textContent()).includes('Needed to publish'), 'missing bio: editable placeholder marked "Needed to publish"');
    await home.click('.preview-overlay [data-close]');
    await home.fill('[data-bind="creator.bio"]', bioBefore);

    // Switch through all 10 in the editor: content kept, saved, rendered.
    const titlesBefore = await home.$$eval('#sec-products [data-pf="title"]', (els) => els.map((x) => x.value));
    for (const tid of ['minimal', 'bold', 'elegant', 'fitness', 'edupro', 'studio', 'authority', 'lifestyle', 'spotlight', 'elite']) {
      await home.click(`#sec-template [data-theme="${tid}"]`);
      await home.waitForTimeout(250);
    }
    const titlesAfter = await home.$$eval('#sec-products [data-pf="title"]', (els) => els.map((x) => x.value));
    check(JSON.stringify(titlesBefore) === JSON.stringify(titlesAfter), 'switching through all 10 templates keeps every product');
    check((await home.textContent('.tpl-current b')) === 'Elite Gold', 'current template shown in the editor');
    await home.click('.toast >> text=Undo');
    check((await home.getAttribute('#sec-template [data-theme="spotlight"]', 'aria-pressed')) === 'true', 'template switch can be undone');
    // Gallery inside the editor: preview with the creator's own content, then use.
    await home.click('[data-action="browse-templates"]');
    await home.waitForSelector('.sheet [data-gallery]');
    check((await home.$$('.sheet .tpl-card')).length === 10 && (await home.isVisible('.sheet .tpl-card.current[data-tid="spotlight"]')), 'editor gallery marks the template in use');
    await home.click('.sheet [data-tid="authority"] [data-gaction="preview"]');
    await home.waitForSelector('.sheet .tpv-stage iframe');
    check((await home.frameLocator('.sheet .tpv-stage iframe').locator('.name').first().textContent()).includes('Asha Rao'), 'editor preview shows the creator\'s own profile in the template');
    await home.click('.sheet [data-use]');
    await home.waitForSelector('.sheet', { state: 'detached' });
    check((await home.getAttribute('#sec-template [data-theme="authority"]', 'aria-pressed')) === 'true', 'Use this template from the editor gallery');
    // Customise: background, accent, font, section order + visibility.
    await home.click('#sec-template [data-bg="graphite"]');
    await home.click('#sec-template [data-accent="emerald"]');
    await home.click('#sec-template [data-font="sans"]');
    await home.click('#sec-template [data-sec="contact"] [data-sec-move="up"]');
    await home.click('#sec-template [data-sec="contact"] [data-sec-move="up"]');
    await home.uncheck('#sec-template [data-sec="testimonials"] input[data-sec-toggle]');
    await home.fill('[data-link="email"]', 'asha@example.com');
    await home.waitForTimeout(300);
    await waitSaved(home);
    await home.reload();
    await home.waitForSelector('#sec-template');
    const persisted = {
      tpl: await home.getAttribute('#sec-template [data-theme="authority"]', 'aria-pressed'),
      bg: await home.getAttribute('#sec-template [data-bg="graphite"]', 'aria-pressed'),
      acc: await home.getAttribute('#sec-template [data-accent="emerald"]', 'aria-pressed'),
      font: await home.getAttribute('#sec-template [data-font="sans"]', 'aria-pressed'),
      first: await home.getAttribute('#sec-template .sec-row:first-child', 'data-sec'),
      hidden: await home.isChecked('#sec-template [data-sec="testimonials"] input[data-sec-toggle]'),
    };
    check(persisted.tpl === 'true' && persisted.bg === 'true' && persisted.acc === 'true' && persisted.font === 'true' && persisted.first === 'contact' && !persisted.hidden, 'template, background, accent, font and section settings persist after refresh');
    // Publish and check the public page at phone and desktop size.
    await home.click('#bottom-bar [data-action="publish"]');
    await home.waitForSelector('.sheet');
    await home.fill('.sheet input', `tpl-${Date.now().toString(36)}`);
    await home.click('.sheet >> text=Publish now');
    await home.waitForSelector('text=Your store is live!');
    const tplUrl = await home.getAttribute('.sheet a[href*="/s/"]', 'href');
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const v = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      watch(v);
      await v.goto(tplUrl);
      const ok = await v.evaluate(() => ({
        theme: document.body.dataset.theme,
        dark: document.body.classList.contains('dark'),
        contactFirst: document.querySelector('main > section')?.classList.contains('contact'),
        email: Boolean(document.querySelector('a[href="mailto:asha@example.com"]')),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        cards: document.querySelectorAll('.card').length,
      }));
      check(ok.theme === 'authority' && ok.dark && ok.contactFirst && ok.email && !ok.overflow && ok.cards >= 2, `published storefront renders the customised template at ${w}px`);
      await shot(v, `after-14-template-authority-${w}`, true);
    }
    // Every template on the public page at phone and desktop: renders, no sideways scroll.
    await home.click('.sheet >> text=Keep editing');
    await home.waitForSelector('.sheet', { state: 'detached' });
    const pubPhone = await (await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true })).newPage();
    const pubDesk = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    watch(pubPhone); watch(pubDesk);
    for (const tid of ['minimal', 'bold', 'elegant', 'fitness', 'edupro', 'studio', 'authority', 'lifestyle', 'spotlight', 'elite']) {
      await home.click(`#sec-template [data-theme="${tid}"]`);
      await home.waitForTimeout(300);
      await waitSaved(home);
      let good = true;
      for (const v of [pubPhone, pubDesk]) {
        await v.goto(`${tplUrl}?t=${tid}`);
        const r = await v.evaluate(() => ({ theme: document.body.dataset.theme, overflow: document.documentElement.scrollWidth > window.innerWidth, ctas: document.querySelectorAll('.cta').length }));
        good = good && r.theme === tid && !r.overflow && r.ctas >= 2;
      }
      check(good, `${tid}: public page renders on phone (360px) and desktop (1440px) with no overflow`);
    }

    // ------------------------------------------------------------ 14. My stores
    console.log('14. My stores (home page list of stores made in this browser)');
    const fresh = await (await browser.newContext(phoneCtx)).newPage();
    watch(fresh);
    await fresh.goto(BASE + '/');
    check(await fresh.isHidden('#my-stores') && await fresh.isHidden('#continue'), 'no stores in this browser: no list, no button');
    await home.evaluate(() => {
      const all = JSON.parse(localStorage.getItem('cl_edit_keys') || '{}');
      all['00000000-0000-4000-8000-000000000000'] = { key: 'not-a-real-key', at: 1 };
      localStorage.setItem('cl_edit_keys', JSON.stringify(all));
    });
    await home.goto(BASE + '/');
    await home.waitForSelector('#my-stores:not([hidden]) .ms-card:not(.ms-loading)');
    await home.waitForFunction(() => !document.querySelector('#ms-list .ms-loading'));
    check((await home.textContent('#continue')).startsWith('My stores ('), 'header shows a "My stores" button with the count');
    const ms = home.locator('#ms-list .ms-card', { hasText: 'Asha Rao' });
    check(await ms.count() === 1, 'the store made earlier is listed with its name');
    check((await ms.locator('.ms-status').textContent()) === 'Live' && (await ms.locator('.ms-meta').textContent()).includes('Elite Gold'), 'shows Live status and its template');
    const viewHref = await ms.locator('text=View live').getAttribute('href');
    check(viewHref.startsWith('/s/tpl-'), 'View live links to the public page');
    const bad = home.locator('#ms-list .ms-bad');
    check((await bad.count()) === 1 && (await bad.textContent()).includes("can't be opened"), 'a saved link that no longer works is explained, not broken');
    await bad.locator('[data-forget]').click();
    await home.click('.sheet [data-go], .sheet .btn-primary');
    await home.waitForFunction(() => !document.querySelector('#ms-list .ms-bad'));
    check(true, 'Remove from list forgets it (after confirming)');
    await ms.getByRole('link', { name: 'Edit', exact: true }).click();
    await home.waitForURL(/\/edit\//);
    await home.waitForSelector('#sec-template');
    check((await home.inputValue('[data-bind="creator.displayName"]')) === 'Asha Rao', 'Edit opens that store in the editor');
    await home.goto(BASE + '/');
    await home.waitForSelector('#ms-list .ms-card:not(.ms-loading)');
    check(await home.isVisible('#ms-list .ms-card >> text=Asha Rao'), 'store still listed (removing one entry only forgets that one)');
    const msOverflow = await home.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!msOverflow, 'My stores fits the phone screen');
    await home.locator('#my-stores').screenshot({ path: path.join(SHOTS, 'after-15-my-stores-phone.png') });

    // ------------------------------------------------------------ 15. Stores saved before templates
    console.log('15. Stores saved before the template update still open');
    const legacyId = home.url().match(/\/edit\/([^#]+)/)?.[1] || (await home.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cl_edit_keys') || '{}'))[0]));
    const legacyKey = await home.evaluate((sid) => JSON.parse(localStorage.getItem('cl_edit_keys'))[sid].key, legacyId);
    const dbFile = path.join(dataDir, 'db.json');
    const dbj = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    const lrow = dbj.stores.find((x) => x.id === legacyId);
    lrow.content.theme = { style: 'bold', accent: 'rose' };
    delete lrow.content.links.email;
    fs.writeFileSync(dbFile, JSON.stringify(dbj));
    const legacy = await (await browser.newContext(phoneCtx)).newPage();
    watch(legacy);
    await legacy.goto(`${BASE}/edit/${legacyId}#k=${encodeURIComponent(legacyKey)}`);
    await legacy.waitForSelector('#sec-template', { timeout: 10000 });
    check((await legacy.getAttribute('#sec-template [data-theme="bold"]', 'aria-pressed')) === 'true' && await legacy.isVisible('[data-link="email"]'), 'an old-format store opens in the editor with its template kept');

    check(errors.length === 0, `no browser errors or unexpected dialogs${errors.length ? ': ' + errors.join(' | ') : ''}`);
    console.log(`\nAll browser checks passed (${passed}).`);
  } catch (err) {
    console.error(err.message);
    await page.screenshot({ path: path.join(SHOTS, 'failure.png'), fullPage: true }).catch(() => {});
    if (errors.length) console.error('Browser errors:', errors);
    console.error(`Passed before failure: ${passed}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
    fake.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
