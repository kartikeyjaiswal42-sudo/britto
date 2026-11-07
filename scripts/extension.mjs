// The extension in a REAL Chromium browser, against a real local Worker:
//   PW_DIR=<playwright-core dir> node scripts/extension.mjs [--browser <chromium-based executable>]
// Google Chrome 137+ refuses --load-extension, so this uses Brave (Chromium) on the Mac, and
// Playwright's own Chromium (Chrome for Testing) where Brave is not installed (cloud sessions).
// Store pages are the SAVED fixtures served at their real addresses; every other request
// is aborted, so the test never contacts Amazon, Flipkart or Myntra.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { confirmIdentity, readPage } from '../core/interpret.ts';
import { parseProductLink } from '../core/stores.ts';
import { bundledReader } from '../readers/index.ts';
import { testConfig } from './test-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const require = createRequire(import.meta.url);
const pw = (() => { try { return require(process.env.PW_DIR ?? 'playwright-core'); } catch { return require('playwright'); } })();
const { chromium } = pw;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BROWSER = arg('--browser', existsSync(BRAVE) ? BRAVE : chromium.executablePath());
const fx = (name) => readFileSync(join(ROOT, 'test/fixtures', name), 'utf8');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${detail}` : ''}`);
};

const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const API = `http://127.0.0.1:${port}`;
const state = mkdtempSync(join(tmpdir(), 'britto-ext-'));
const EXT_VERSION = JSON.parse(readFileSync(join(ROOT, 'extension/static/manifest.json'), 'utf8')).version;
const extDir = join(state, 'ext');
const profile = join(state, 'profile');
execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--config', testConfig(), '--local', '--persist-to', join(state, 'd1'), '--file', 'api/schema.sql'], { cwd: ROOT, stdio: 'ignore' });
execFileSync('node', ['scripts/build-ext.mjs', '--api', API, '--out', extDir, '--test'], { cwd: ROOT, stdio: 'ignore' });
// READER_MEMO_MS 0: a config written to D1 is served at once (production keeps one 60 s).
const worker = spawn(WRANGLER, ['dev', '--config', testConfig(), '--local', '--persist-to', join(state, 'd1'), '--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false', '--var', 'READER_MEMO_MS:0'], { cwd: ROOT, detached: true, stdio: 'ignore' });
for (const until = Date.now() + 60_000; ;) {
  try { if ((await fetch(`${API}/api/health`)).ok) break; } catch { /* starting */ }
  if (Date.now() > until) throw new Error('wrangler dev did not start');
  await new Promise((r) => setTimeout(r, 500));
}
const api = async (path) => { const r = await fetch(API + path); return { status: r.status, body: await r.json().catch(() => null) }; };
const d1 = (sql) => JSON.parse(execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--config', testConfig(), '--local', '--persist-to', join(state, 'd1'), '--json', '--command', sql], { cwd: ROOT, encoding: 'utf8' }))[0].results;
const AMAZON = bundledReader('amazon');

/** Parity (BLUEPRINT §22): what the extension read in the browser vs Node on the saved page. */
const parity = [];
async function recordParity(page, url) {
  const host = page.locator('britto-panel');
  const reading = JSON.parse((await host.getAttribute('data-reading')) ?? 'null');
  const link = parseProductLink(url).link;
  const cfg = bundledReader(link.store).config;
  const node = confirmIdentity(link.store, link.pid, readPage(cfg, PAGES.get(url), url), cfg.reportsPid);
  const fields = ['status', 'price', 'mrp', 'inStock', 'pid', 'title', 'image', 'rule', 'offers'];
  const diffs = fields.filter((k) => !isDeepStrictEqual(reading?.[k], node[k])).map((k) => `${k}: browser ${JSON.stringify(reading?.[k])} vs node ${JSON.stringify(node[k])}`);
  parity.push({ url, diffs });
}

// A product page Flipkart might serve, built by hand: Flipkart refuses our server, so we have
// no real one yet. Used only to check the "cannot read this page" path and the save button.
const FLIPKART_SYNTH = '<!doctype html><html><head><title>Phone</title><script type="application/ld+json">{"@type":"Product","name":"Test Phone","offers":{"price":"9999","availability":"https://schema.org/InStock"}}</script></head><body><h1>Test Phone</h1></body></html>';
const PAGES = new Map([
  ['https://www.amazon.in/Cello-Butterflow/dp/B09X5DK382', fx('amazon-cello-25pens-instock.html')],
  ['https://www.amazon.in/dp/B09N3ZNHTY', fx('amazon-boat-variant-unavailable.html')],
  ['https://www.amazon.in/s?k=pen', '<!doctype html><html><body><h1>Search results</h1></body></html>'],
  ['https://www.myntra.com/tshirts/hrx/x/1700944/buy', fx('myntra-instock.html')],
  // The identity trap: the address names 999999 but the page still shows 1700944.
  ['https://www.myntra.com/tshirts/hrx/x/999999/buy', fx('myntra-instock.html')],
  ['https://www.flipkart.com/test-phone/p/itm0000000000001', FLIPKART_SYNTH],
  ['https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4', fx('flipkart-blocked-e002.html')],
]);

let context;
let aborted = 0;
try {
  // Playwright adds --disable-extensions by default, which silently wins over --load-extension
  // (the first attempt hung for 180 s on it). Headless Brave runs extensions.
  context = await chromium.launchPersistentContext(profile, {
    executablePath: BROWSER,
    headless: true,
    timeout: 30_000,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    acceptDownloads: true,
  });
  const apiCalls = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(API)) {
      apiCalls.push(`${route.request().method()} ${url}`);
      return route.continue();
    }
    if (url.startsWith('chrome-extension://')) return route.continue();
    const page = PAGES.get(url);
    if (page) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    aborted++;
    return route.abort();
  });

  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
  check('the extension loaded (service worker running)', !!sw);
  const extId = sw.url().split('/')[2];
  const contentJs = readFileSync(join(extDir, 'content.js'), 'utf8');
  check('the content script ships the interpreter but no store recipe', contentJs.includes('identity-mismatch') && !/corePriceDisplay_desktop_feature_div|pdpData\.price|productTitle/.test(contentJs));

  const page = await context.newPage();
  const panel = () => page.locator('britto-panel');
  const panelText = async () => (await panel().count()) ? panel().locator('.box').innerText() : '';
  const waitPanel = async (re, ms = 20_000) => {
    const until = Date.now() + ms;
    let t = '';
    while (Date.now() < until) { t = await panelText().catch(() => ''); if (re.test(t)) return t; await page.waitForTimeout(250); }
    return t;
  };

  // 1. Amazon, in stock, product unknown to Britto: the extension's report creates it.
  await page.goto('https://www.amazon.in/Cello-Butterflow/dp/B09X5DK382');
  let t = await waitPanel(/₹265/);
  check('Amazon page: panel shows ₹265 read in the browser', /₹265/.test(t), t.slice(0, 200));
  check('…with the M.R.P. and the honest "too early" verdict', /M\.R\.P\.\s*₹299/.test(t) && /Too early to judge/.test(t), t.slice(0, 300));
  check('…and draws the chart', (await panel().locator('svg.chart path.line').getAttribute('d'))?.startsWith('M') === true);
  let v = await api('/api/products/amazon%3AB09X5DK382');
  check('the reading reached Britto as an extension report', v.body?.product?.points?.length === 1 && v.body.product.points[0].source === 'extension' && v.body.product.points[0].price === 26500, JSON.stringify(v.body?.product?.points));
  await recordParity(page, 'https://www.amazon.in/Cello-Butterflow/dp/B09X5DK382');
  // Offers (BLUEPRINT §15): shown from this page, on this screen only; never sent to Britto.
  check('…and the offers this page shows (3 cards)', /Offers on this page/.test(t) && /Bank Offer: Upto ₹1,000\.00 discount on select Credit Cards/.test(t)
    && (await panel().locator('.offers .small').count()) === 3, t.slice(0, 600));
  check('…which stay on the shopper\'s screen: nothing stored, nothing shown to others', d1(`SELECT COUNT(*) AS n FROM product_offers`)[0].n === 0 && v.body?.product?.offers === null, JSON.stringify(v.body?.product?.offers));
  const used = d1(`SELECT source, config_version, reader_version, outcome, n FROM reader_health WHERE store = 'amazon'`);
  check(`…read with the config the server served (reader health: extension, bundled version, ${EXT_VERSION})`, used.some((r) => r.source === 'extension' && r.config_version === AMAZON.version && r.reader_version === EXT_VERSION && r.outcome === 'priced'), JSON.stringify(used));
  const shots = arg('--shots', null);
  if (shots) {
    await panel().locator('.box').screenshot({ path: join(shots, 'panel-amazon-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await panel().locator('.box').screenshot({ path: join(shots, 'panel-amazon-dark.png') });
    await page.emulateMedia({ colorScheme: 'light' });
  }
  const href = await panel().locator('a.go', { hasText: 'Full history' }).getAttribute('href');
  check('"Full history on Britto" links to the product page', href === `${API}/p/amazon%3AB09X5DK382`, href ?? '');
  const bell = await panel().locator('a.go', { hasText: 'Set a price alert' }).getAttribute('href');
  check('"Set a price alert" opens the alert box on the product page', bell === `${API}/p/amazon%3AB09X5DK382#alert`, bell ?? '');

  // 2. Reload: the same reading is not sent again, the panel still shows.
  await page.reload();
  t = await waitPanel(/₹265/);
  v = await api('/api/products/amazon%3AB09X5DK382');
  check('reload shows the panel without writing again', /₹265/.test(t) && v.body?.product?.points?.length === 1);

  // 3. Unavailable Amazon page.
  await page.goto('https://www.amazon.in/dp/B09N3ZNHTY');
  t = await waitPanel(/Out of stock/);
  check('unavailable Amazon item reads "Out of stock"', /Out of stock/.test(t) && /Not available to buy/.test(t), t.slice(0, 200));
  await recordParity(page, 'https://www.amazon.in/dp/B09N3ZNHTY');

  // 4. Not a product page: no panel at all.
  await page.goto('https://www.amazon.in/s?k=pen');
  await page.waitForTimeout(2000);
  check('no panel on a search page', (await panel().count()) === 0);

  // 5. Myntra (our server cannot read it): the extension is the source.
  await page.goto('https://www.myntra.com/tshirts/hrx/x/1700944/buy');
  t = await waitPanel(/₹305/);
  check('Myntra page: panel shows ₹305', /₹305/.test(t) && /M\.R\.P\.\s*₹699/.test(t), t.slice(0, 200));
  await recordParity(page, 'https://www.myntra.com/tshirts/hrx/x/1700944/buy');
  v = await api('/api/products/myntra%3A1700944');
  check('Myntra product now has its first price, from the extension', v.body?.product?.stats?.current === 30500 && v.body.product.pending === null);

  // 6. The identity trap: URL says 999999, page shows 1700944.
  await page.goto('https://www.myntra.com/tshirts/hrx/x/999999/buy');
  t = await waitPanel(/cannot read the price/);
  check('a page showing ANOTHER product is not read as this one', /cannot read the price/.test(t), t.slice(0, 200));
  v = await api('/api/products/myntra%3A999999');
  check('…and nothing was filed under the wrong product', v.status === 404, JSON.stringify(v.body));

  // 7. Flipkart: reader not verified yet -> honest message + save button that downloads the page.
  await page.goto('https://www.flipkart.com/test-phone/p/itm0000000000001');
  t = await waitPanel(/cannot read the price/);
  check('Flipkart page: says it cannot read the price yet (reader not verified)', /cannot read the price/.test(t), t.slice(0, 200));
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10_000 }),
    panel().locator('button', { hasText: 'Save this page' }).click(),
  ]);
  check('"Save this page" downloads the page as a file', /^britto-page-flipkart-\d+\.html$/.test(download.suggestedFilename()), download.suggestedFilename());
  v = await api('/api/products/flipkart%3Aitm0000000000001');
  check('…and no price was sent for it', v.status === 404 || v.body?.product?.points?.length === 0, JSON.stringify(v.body?.product?.points ?? v.body));

  await page.goto('https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4');
  t = await waitPanel(/did not load properly/);
  check('Flipkart error page: says the page did not load properly', /did not load properly/.test(t), t.slice(0, 200));

  await recordParity(page, 'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4');
  for (const p of parity) check(`parity: the browser reads ${p.url.slice(12, 60)} exactly as Node does`, p.diffs.length === 0, p.diffs.join('; '));

  // 8. Readers are data (rule 3): a bad config written to the server's D1 changes what the
  // extension does on its next page, with no rebuild and no reinstall; removing it restores it.
  const bad = { ...AMAZON.config, revision: 7, domRecipe: { ...AMAZON.config.domRecipe, price: [{ selector: ['#corePriceDisplay_desktop_feature_div', '.no-such-price'], attribute: 'textContent' }] } };
  d1(`INSERT INTO reader_configs (store, device, created_at, json) VALUES ('amazon', 'desktop', ${Date.now()}, '${JSON.stringify(bad).replaceAll("'", "''")}')`);
  const badVersion = (await api('/api/config/reader?store=amazon')).body?.version ?? '';
  await page.goto('https://www.amazon.in/Cello-Butterflow/dp/B09X5DK382');
  t = await waitPanel(/cannot read the price/);
  check('a broken config on the server: the extension says it cannot read the page (no rebuild)', /amazon\.desktop\.r7\./.test(badVersion) && /cannot read the price/.test(t), `${badVersion} | ${t.slice(0, 160)}`);
  let tele = [];
  for (let i = 0; i < 20 && !tele.length; i++) {
    tele = d1(`SELECT source, outcome, n FROM reader_health WHERE store = 'amazon' AND config_version = '${badVersion}'`);
    if (!tele.length) await page.waitForTimeout(250);
  }
  check('…and its telemetry names the broken config (unrecognised, from the extension)', tele.some((r) => r.source === 'extension' && r.outcome === 'unrecognised'), JSON.stringify(tele));
  d1(`DELETE FROM reader_configs`);
  await page.goto('https://www.amazon.in/Cello-Butterflow/dp/B09X5DK382');
  t = await waitPanel(/₹265/);
  check('…removing it: the next page reads ₹265 again', /₹265/.test(t), t.slice(0, 160));

  // 9. The popup.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  const popupText = await popup.locator('body').innerText();
  check('popup says exactly what is sent', /What Britto sends/.test(popupText) && /Never your cookies/.test(popupText));
  check('popup links to the Britto site', (await popup.locator('#site').getAttribute('href')) === API);

  // 10. Spend Lens (BLUEPRINT §13): orders are kept in this browser only. The calls the service
  // worker made for the product pages above must have been seen here, or "none" would prove nothing.
  check('the service worker\'s calls to Britto are visible to this test', apiCalls.length > 0, String(apiCalls.length));
  const MADE_UP = [
    { store: 'amazon', orderId: 'TEST-403-111', date: '2026-10-29', total: 176327, items: ['made-up order'] },
    { store: 'amazon', orderId: 'TEST-403-222', date: '2026-10-03', total: 26500, items: [] },
  ];
  const callsBefore = apiCalls.length;
  const saved = await popup.evaluate((orders) => chrome.runtime.sendMessage({ type: 'saveOrders', store: 'amazon', orders }), MADE_UP);
  check('saveOrders keeps made-up orders in this browser', saved?.ok === true && saved.kept === 2, JSON.stringify(saved));
  check('…and nothing about them went to Britto', apiCalls.length === callsBefore, apiCalls.slice(callsBefore).join(' | '));
  const odd = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'saveOrders', store: 'flipkart', orders: [{ store: 'amazon', orderId: 'X', date: '2026-10-01', total: 1, items: [] }] }).catch(() => 'dropped'));
  check('…an order for another store is dropped without an answer', odd === undefined || odd === 'dropped', JSON.stringify(odd));
  await popup.reload();
  check('the popup sums them on this computer', /₹2,028\.27 on 2 orders/.test(await popup.locator('#spend').innerText()), await popup.locator('#spend').innerText());
  await popup.click('#spend-clear');
  check('…and "Delete" removes them', /Deleted/.test(await popup.locator('#spend').innerText()) && (await popup.evaluate(() => chrome.storage.local.get('spend:orders')))['spend:orders'] === undefined);

  check('store assets were blocked, not fetched (the test never contacts a store)', aborted > 0, String(aborted));
} finally {
  await context?.close().catch(() => {});
  try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ }
  rmSync(state, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
