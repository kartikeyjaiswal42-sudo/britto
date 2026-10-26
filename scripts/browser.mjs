// Real-Chrome check of the web app: `PW_DIR=<playwright-core dir> node scripts/browser.mjs <url>`.
// Expects a server that already tracks amazon:B09X5DK382 (run scripts/prove.mjs's steps or
// add it on the page). Asserts on what is RENDERED (text, computed style, scroll position),
// not on markup.
import { createRequire } from 'node:module';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!base) throw new Error('usage: browser.mjs <url>');
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require(process.env.PW_DIR ?? 'playwright-core'); } catch { return require('playwright'); } })();

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${detail}` : ''}`);
};

// Google Chrome on the Mac; where it is not installed (cloud sessions), Playwright's own
// Chromium (Chrome for Testing).
const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
console.log(`browser: ${browser.version()}`);
try {
  for (const [label, viewport, scheme] of [['desktop light', { width: 1280, height: 900 }, 'light'], ['phone dark', { width: 390, height: 844 }, 'dark']]) {
    console.log(`— ${label}`);
    const ctx = await browser.newContext({ viewport, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    // A console "Failed to load resource" carries no URL, so record failing responses by URL.
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

    await page.goto(base + '/', { waitUntil: 'networkidle' });
    check('home renders its headline', (await page.locator('h1').first().innerText()).includes('real price'));
    check('recently tracked shows the product card', await page.locator('.card .title', { hasText: 'Cello' }).count() > 0);

    // Paste the link the way a shopper would.
    await page.fill('.track input', 'https://www.amazon.in/dp/B09X5DK382?tag=x');
    await page.click('.track button');
    await page.waitForURL(/\/p\/amazon%3AB09X5DK382|\/p\/amazon:B09X5DK382/, { timeout: 30_000 });
    await page.waitForSelector('.big-price');
    const price = await page.locator('.big-price').innerText();
    check('product page shows a rupee price', /^₹[\d,]+(\.\d\d)?$/.test(price), price);
    check('M.R.P. shown struck through', await page.locator('.mrp s').count() === 1);
    check('verdict is "too early" for a new product', (await page.locator('.verdict h2').first().innerText()).startsWith('Too early'));
    const pathD = await page.locator('svg.chart path.line').getAttribute('d');
    check('chart draws a line', typeof pathD === 'string' && pathD.startsWith('M'), pathD ?? 'none');
    const pathBox = await page.locator('svg.chart path.line').boundingBox();
    check('chart line is visible (has width)', (pathBox?.width ?? 0) > 50, JSON.stringify(pathBox));
    const stroke = await page.locator('svg.chart path.line').evaluate((n) => getComputedStyle(n).stroke);
    check('chart line has a colour', stroke !== 'none' && stroke !== '', stroke);
    check('"Open on Amazon.in" links to the clean product URL', (await page.locator('a.button').getAttribute('href')) === 'https://www.amazon.in/dp/B09X5DK382');

    // No sideways scrolling: try to scroll right and see whether anything moved.
    await page.evaluate(() => window.scrollTo(500, 0));
    check('no horizontal scroll', (await page.evaluate(() => window.scrollX)) === 0);

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(`${scheme} theme background applied`, scheme === 'dark' ? bg === 'rgb(18, 19, 21)' : bg === 'rgb(247, 246, 242)', bg);

    // The prefix trick in a real browser.
    await page.goto(`${base}/https://www.amazon.in/Cello/dp/B09X5DK382/ref=x`, { waitUntil: 'networkidle' });
    check('"site/<amazon link>" opens the product page', page.url().includes('/p/amazon') && (await page.locator('.big-price').count()) === 1, page.url());

    await page.goto(base + '/stores', { waitUntil: 'networkidle' });
    check('stores page lists the measured status', (await page.locator('table.stores tbody tr').count()) === 4);

    await page.goto(base + '/browse', { waitUntil: 'networkidle' });
    const tiles = await page.locator('a.store-tile').evaluateAll((as) => as.map((a) => [a.dataset.store, a.getAttribute('href')]));
    check('Super Browse lists every store with its front page', JSON.stringify(tiles) === JSON.stringify([['amazon', 'https://www.amazon.in/'], ['flipkart', 'https://www.flipkart.com/'], ['myntra', 'https://www.myntra.com/'], ['vijaysales', 'https://www.vijaysales.com/']]), JSON.stringify(tiles));
    const tileBox = await page.locator('a.store-tile').first().boundingBox();
    check('…tiles are large enough to tap (≥ 44 px tall)', (tileBox?.height ?? 0) >= 44, JSON.stringify(tileBox));
    check('…the header links to it ("Shop")', (await page.locator('.top nav a', { hasText: 'Shop' }).getAttribute('href')) === '/browse');

    await page.goto(base + '/search?q=cello', { waitUntil: 'networkidle' });
    check('search page finds it', await page.locator('.card .title', { hasText: 'Cello' }).count() > 0);

    check('no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
