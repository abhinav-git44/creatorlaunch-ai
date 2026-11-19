// Browser end-to-end run (Playwright, phone + desktop viewports) against the dev server with
// the test-only fake LLM. Saves screenshots to tests/screens/.
// Run: npm i -D playwright && npx playwright install chromium && node tests/e2e.cjs
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screens');
const PORT = 3998;
const BASE = `http://localhost:${PORT}`;

function check(cond, msg) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { startFakeGemini } = await import(path.join(__dirname, 'fake-gemini.js'));
  const fake = await startFakeGemini(0);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-e2e-'));
  const server = spawn(process.execPath, ['dev-server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), GEMINI_API_KEY: 'test', GEMINI_BASE_URL: `http://localhost:${fake.address().port}`, LLM_TIMEOUT_MS: '1500', DATA_DIR: dataDir, DEV_LOG: '0', SUPABASE_URL: '', VERCEL: '' },
  });
  await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('running at') && r()));

  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));

  try {
    console.log('Create flow (phone)');
    await page.goto(BASE + '/');
    await page.screenshot({ path: path.join(SHOTS, '01-create-phone.png'), fullPage: true });

    await page.click('#submit');
    check(await page.isVisible('#e-description'), 'empty submit shows a field error, no AI call');

    await page.fill('#description', 'asdfgh qwerty');
    await page.fill('#name', 'Test');
    await page.click('#submit');
    check((await page.textContent('#e-description')).includes('random keys'), 'gibberish is caught with guidance');

    await page.click('[data-mode="instagram"]');
    await page.fill('#handle', 'bad..handle');
    await page.click('#submit');
    check(await page.isVisible('#e-handle'), 'invalid Instagram username is caught');
    await page.screenshot({ path: path.join(SHOTS, '02-instagram-errors-phone.png'), fullPage: true });
    await page.fill('#handle', '');
    await page.click('[data-mode="describe"]');

    // Slow AI: shows the failure card with retry, input preserved
    await page.fill('#description', 'I teach yoga to office workers FAKE_TIMEOUT');
    await page.click('#submit');
    await page.waitForSelector('#failed:not([hidden])', { timeout: 15000 });
    await page.screenshot({ path: path.join(SHOTS, '03-ai-timeout-phone.png'), fullPage: true });
    check((await page.textContent('#failed-msg')).includes('longer than usual'), 'AI timeout shows friendly retry state');
    await page.click('#back');
    check((await page.inputValue('#description')).includes('yoga'), 'creator input is preserved after a failure');

    await page.click('[data-example="fitness"]');
    await page.click('#submit');
    await page.waitForURL(/\/edit\//, { timeout: 15000 });
    await page.waitForSelector('[data-pid]');
    check(page.url().includes('#k='), 'editor opened with private edit key');
    await page.screenshot({ path: path.join(SHOTS, '04-editor-phone.png'), fullPage: true });

    console.log('Editor (phone)');
    const firstPrice = page.locator('[data-pf="priceInr"]').first();
    await firstPrice.fill('299');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved', null, { timeout: 8000 });
    check(true, 'price edit autosaves');

    await firstPrice.fill('');
    await page.waitForTimeout(1200);
    check((await page.textContent('#save-status')).startsWith('Not saved'), 'empty price blocks saving with a clear status');
    await firstPrice.fill('299');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved', null, { timeout: 8000 });

    await page.click('[data-action="regen-bio"]');
    await page.waitForSelector('.sheet');
    await page.screenshot({ path: path.join(SHOTS, '05-regenerate-sheet-phone.png') });
    await page.click('.sheet [data-go]');
    await page.waitForSelector('.toast >> text=New headline');
    check((await page.inputValue('[data-bind="creator.headline"]')) === 'A brand new headline', 'bio regeneration updates only the profile');
    check((await firstPrice.inputValue()) === '299', 'regeneration kept the edited price');
    await page.click('.toast button');
    check((await page.inputValue('[data-bind="creator.headline"]')) !== 'A brand new headline', 'undo restores the previous bio');

    const titlesBefore = await page.locator('[data-pf="title"]').evaluateAll((els) => els.map((e) => e.value));
    await page.locator('[data-action="regen-product"]').nth(1).click();
    await page.click('.sheet [data-go]');
    await page.waitForSelector('.toast >> text=New product idea');
    const titlesAfter = await page.locator('[data-pf="title"]').evaluateAll((els) => els.map((e) => e.value));
    check(titlesAfter[0] === titlesBefore[0] && titlesAfter[2] === titlesBefore[2] && titlesAfter[1] !== titlesBefore[1], 'single-product regeneration changes only that product');

    await page.locator('[data-action="regen-product"]').first().click();
    await page.fill('.sheet #ins', 'FAKE_BADJSON_ALWAYS');
    await page.click('.sheet [data-go]');
    await page.waitForSelector('.toast.error');
    check((await page.textContent('.toast.error')).includes('unchanged'), 'failed regeneration keeps current content and says so');

    await page.click('[data-theme="elegant"]');
    await page.click('#bottom-bar [data-action="preview"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS, '06-preview-phone.png') });
    await page.click('.preview-overlay [data-close]');

    console.log('Publish');
    await page.click('#publish-bottom');
    await page.waitForSelector('.sheet #slug');
    check((await page.inputValue('.sheet #slug')) === 'riya-sharma', 'slug suggested from creator name');
    await page.click('.sheet [data-go]');
    await page.waitForSelector('text=Your store is live!');
    await page.screenshot({ path: path.join(SHOTS, '07-published-phone.png') });
    const url = await page.locator('.sheet .sub a').getAttribute('href');
    check(url.endsWith('/s/riya-sharma'), `public URL returned: ${url}`);
    await page.click('.sheet [data-x]');

    console.log('Public page in a separate session');
    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    const vp = await visitor.newPage();
    vp.on('pageerror', (e) => errors.push(e.message));
    const resp = await vp.goto(url);
    check(resp.status() === 200, 'public page loads without the edit key');
    await vp.screenshot({ path: path.join(SHOTS, '08-public-store-phone.png'), fullPage: true });
    check((await vp.content()).includes('₹299'), 'edited price shows on the published page');
    await vp.locator('[data-buy]').first().click();
    check(await vp.isVisible('.note.show'), 'buy button explains checkout instead of dead-ending');
    const overflow = await vp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, 'no horizontal scrolling on a phone');

    console.log('Desktop editor');
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dp = await desk.newPage();
    dp.on('pageerror', (e) => errors.push(e.message));
    await dp.goto(page.url());
    await dp.waitForSelector('[data-pid]');
    await dp.waitForTimeout(700);
    await dp.screenshot({ path: path.join(SHOTS, '09-editor-desktop.png') });
    const dv = await desk.newPage();
    await dv.goto(url);
    await dv.screenshot({ path: path.join(SHOTS, '10-public-store-desktop.png'), fullPage: true });

    const missing = await desk.newPage();
    await missing.goto(BASE + '/edit/00000000-0000-0000-0000-000000000000');
    await missing.waitForSelector('.center-state');
    check(true, 'editor without a key shows a friendly dead-end page');

    check(errors.length === 0, `no browser errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    console.log('\nAll browser checks passed.');
  } catch (err) {
    console.error(err.message);
    await page.screenshot({ path: path.join(SHOTS, 'failure.png'), fullPage: true }).catch(() => {});
    if (errors.length) console.error('Browser errors:', errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
    fake.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
