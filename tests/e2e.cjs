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
    check((await pv.locator('body').getAttribute('class')) === 't-bold', 'preview shows the chosen theme');
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
    check((await vp.locator('body').getAttribute('class')) === 't-bold', 'published page uses the chosen theme');
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
    await ig.waitForSelector('#save-status.ok', { timeout: 10000 }).catch(() => {});
    await ig.waitForTimeout(1500);
    await ig.reload();
    await ig.waitForSelector('.cover-box img');
    check(await ig.isVisible('.avatar-box img'), 'images persist after reload');
    await ig.setInputFiles('#cover-file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await ig.waitForSelector('.toast.error >> text=JPG, PNG or WebP');
    check(true, 'non-image file refused with a plain message');
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
    await ig.click('.sheet >> text=Keep editing');
    await ig.waitForSelector('.sheet', { state: 'detached' });
    for (const theme of ['bold', 'elegant']) {
      await ig.click(`[data-theme="${theme}"]`);
      await ig.waitForTimeout(2200); // autosave
      await pub.goto(liveUrl);
      const ok = await pub.$$eval('.hero img', (els) => els.length === 2 && els.every((i) => i.complete && i.naturalWidth > 0));
      const noOverflow = await pub.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      check(ok && noOverflow, `${theme} theme shows both images with no horizontal overflow`);
      await shot(pub, `after-13-storefront-images-${theme}-phone`, true);
    }
    await pub.close();

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
