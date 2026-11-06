// Compare prices (product page) in a real Chrome: the page as the Britto app shows it, with a
// stand-in for the app's bridge (SiteBridgeCore compareFares / compareStatus) whose readings are
// made by the REAL reader (core/shop.ts) on the cards saved from each store's own search page,
// plus rows built from the test product's own title (one the same product, one a different pack
// size) so the same/not-same labels are checked on a product the local database holds.
//   PW_DIR=<playwright-core dir> node scripts/shop-browser.mjs [base url, default http://127.0.0.1:8787] [product key]
// The one-usual-price check needs a product whose usual price differs from its middle price
// (production's amazon:B01INWEX9U, copied into the LOCAL database: HISTORY 2026-11-06).
// Needs a local `wrangler dev` with the schema and the product tracked (scripts/browser.mjs notes).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readShop } from '../core/shop.ts';
import { quantities, searchWordsFor } from '../web/match.js';
import { shopSearchUrl, storesFor } from '../web/shop.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_DIR ?? 'playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const key = process.argv[3] ?? 'amazon:B09X5DK382';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `  (${String(detail).slice(0, 300)})`}`);
};

const product = await fetch(`${base}/api/products/${encodeURIComponent(key)}`).then((r) => r.json());
const title = product.product?.title;
const here = product.stats?.current ?? product.product?.stats?.current ?? null;
if (!title) throw new Error(`${key} is not tracked on ${base}: track it first`);
const { recipes } = JSON.parse(readFileSync(new URL('../web/shops.json', import.meta.url), 'utf8'));
const want = storesFor(title, recipes, 'amazon');
const fixture = (name) => readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8');
const real = (store, file) => readShop(recipes.find((r) => r.store === store), fixture(file), 'https://www.' + (store === 'reliancedigital' ? 'reliancedigital.in/products' : `${store}.com/search`) + '?q=x').rows;
// Flipkart: its real cards, plus the product itself ₹20 cheaper; Snapdeal: the same line in another
// pack size (must NOT be called the same product); Croma: a person check; the rest: real cards.
// The product's name and pack size, so "same" is the same pack and "other" a DIFFERENT one
// (a pen set sold as a pack of 10 must not be offered a pack of 10 as the other size).
const name = searchWordsFor(title);
const pack = [...(quantities(title).get('count') ?? [])][0] ?? 25;
const otherPack = pack === 10 ? 25 : 10;
const readings = {
  flipkart: { status: 'listed', rows: [...real('flipkart', 'shop-flipkart-boat-airdopes-141-2026-11-06-cards.html'), { title: `${name}, Pack of ${pack}`, price: (here ?? 30_000) - 2_000, mrp: 30_000, image: 'https://rukminim2.flixcart.com/image/412/494/x.jpeg', link: 'https://www.flipkart.com/cello-butterflow/p/itm123?pid=TEST' }] },
  snapdeal: { status: 'listed', rows: [{ title: `${name}, Pack of ${otherPack}`, price: 9_900, mrp: null, image: null, link: 'https://www.snapdeal.com/product/cello/1' }, ...real('snapdeal', 'shop-snapdeal-steam-iron-2026-11-06-cards.html')] },
  croma: { status: 'check', rows: [] },
  reliancedigital: { status: 'listed', rows: real('reliancedigital', 'shop-reliancedigital-boat-airdopes-141-2026-11-06-cards.html') },
  tatacliq: { status: 'listed', rows: real('tatacliq', 'shop-tatacliq-boat-airdopes-141-2026-11-06-cards.html') },
  meesho: { status: 'listed', rows: real('meesho', 'shop-meesho-steam-iron-2026-11-06-cards.html') },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ua = (v) => `Mozilla/5.0 (Linux; Android 14; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 BrittoApp/${v}`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua('0.8.0') });
  await ctx.addInitScript((readings) => {
    window.__asked = [];
    let polls = 0;
    let job = null;
    window.BrittoBridge = {
      onmessage: null,
      postMessage(data) {
        const { id, msg } = JSON.parse(data);
        window.__asked.push(msg);
        let reply = null;
        if (msg.type === 'compareFares') { job = msg.sites; polls = 0; reply = { ok: true, job: 'j1' }; }
        if (msg.type === 'compareStatus' && job) {
          polls++;
          // First answer: half the stores done; the next: all of them (as FareJob reports).
          const sites = job.map((s, i) => (polls > 1 || i < 3 ? { id: s.id, state: 'done', ...readings[s.id] } : { id: s.id, state: 'loading', status: 'loading' }));
          reply = { ok: true, job: 'j1', done: sites.every((s) => s.state === 'done'), sites };
        }
        if (msg.type === 'compareStop') reply = { ok: true };
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id, reply }) }), 20);
      },
    };
  }, readings);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/p/${encodeURIComponent(key)}`, { waitUntil: 'networkidle' });
  // ONE usual price on the page (6 Nov: the tile said ₹100 "median" while the sale check said
  // "20% below its usual ₹125"): the tile shows the sale check's, or the middle price so far.
  const usualTile = await page.locator('.stats > div', { hasText: 'Usual price' }).innerText().catch(() => '');
  const usualWant = product.product?.sale?.usualPrice ?? product.product?.stats?.median;
  const fmt = (p) => `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const usualSale = product.product?.sale?.usualPrice;
  if (usualSale == null || usualSale === product.product?.stats?.median) console.log('SKIP the one-usual-price check: this product cannot tell the two apart (NOT verified); run with amazon:B01INWEX9U seeded');
  else check('the product page shows one usual price, the sale check\'s (not the plain middle price)', usualTile.includes(fmt(usualWant)) && !/median/i.test(await page.locator('#app').innerText()), `${usualTile} vs ${usualWant}`);
  // The price scale (design v5): today's price placed between the lowest and highest seen.
  const st = product.product?.stats ?? {};
  if (st.lowest && st.highest && st.current != null && st.highest.price > st.lowest.price) {
    const want = ((st.current - st.lowest.price) / (st.highest.price - st.lowest.price)) * 100;
    const got = await page.locator('.price-scale .scale-dot').evaluate((d) => parseFloat(d.style.left)).catch(() => null);
    const label = await page.locator('.price-scale').getAttribute('aria-label').catch(() => '');
    check(`the price scale puts today at ${want.toFixed(1)}% between lowest and highest, and says so in words`, got != null && Math.abs(got - want) < 0.11 && label.includes(fmt(st.current)) && label.includes(fmt(st.lowest.price)) && label.includes(fmt(st.highest.price)), `${got} vs ${want} · ${label}`);
  } else check('no price scale without a range of prices', (await page.locator('.price-scale').count()) === 0);
  const run = page.locator('#shop-run');
  await run.waitFor({ timeout: 10_000 }).catch(() => {});
  check(`in the app (0.8.0): "Check prices on ${want.length} stores"`, (await run.count()) === 1 && (await run.innerText()) === `Check prices on ${want.length} stores`, await run.count() ? await run.innerText() : 'no button');
  // The page tells the app its bar colours on every load ('bars'); a compare is asked only on a tap.
  const compareAsks = (p) => p.evaluate(() => window.__asked.filter((m) => /^compare/.test(m.type)).length);
  check('…and no compare is asked of the app before the shopper taps it', (await compareAsks(page)) === 0);
  await run.click();
  await page.waitForFunction(() => window.__asked.some((m) => m.type === 'compareStatus'));
  const asked = await page.evaluate(() => window.__asked.find((m) => m.type === 'compareFares'));
  const words = (await page.locator('#compare').innerText()).match(/search for “([^”]+)”/)?.[1];
  check('…the app is asked to open each store\'s own search for the product, with that store\'s recipe', !!asked && JSON.stringify(asked.sites.map((s) => [s.id, s.url, s.recipe.store])) === JSON.stringify(want.map((r) => [r.store, shopSearchUrl(r, words), r.store])), JSON.stringify(asked?.sites.map((s) => s.url)));
  await page.waitForFunction(() => /Checked|Prices as each store/.test(document.querySelector('#compare')?.innerText ?? '') && !/Checking prices on your phone/.test(document.querySelector('#compare')?.innerText ?? ''), null, { timeout: 15_000 });
  const rows = await page.locator('#compare .shop-out .shop-row').evaluateAll((lis) => lis.map((li) => ({ store: li.dataset.store, kind: li.dataset.kind ?? null, status: li.dataset.status, text: li.innerText.replace(/\s+/g, ' ') })));
  const fk = rows.find((r) => r.store === 'flipkart');
  check('Flipkart: the same product, its price and how much less it is', fk?.kind === 'same' && /Same product/.test(fk.text) && fk.text.includes('₹20 less'), JSON.stringify(fk));
  const sd = rows.find((r) => r.store === 'snapdeal');
  check(`Snapdeal: the pack of ${otherPack} is NOT called the same product (this one is a pack of ${pack})`, sd != null && sd.kind !== 'same' && !/Same product/.test(sd.text), JSON.stringify(sd));
  check('Croma: its person check is said, with a way to open it', /asks if you are a person/.test(rows.find((r) => r.store === 'croma')?.text ?? '') && (await page.locator('#compare .shop-row[data-store=croma] a').count()) === 1);
  check('Reliance Digital / Tata CLiQ / Meesho (no pen in their saved pages): "no matching product"', ['reliancedigital', 'tatacliq', 'meesho'].every((s) => /no matching product/.test(rows.find((r) => r.store === s)?.text ?? '')), JSON.stringify(rows.map((r) => [r.store, r.text.slice(0, 60)])));
  check('…the same product comes first', rows[0]?.store === 'flipkart', rows.map((r) => r.store).join());
  const best = await page.locator('#compare .shop-best').innerText().catch(() => '');
  check('the summary names the cheaper store', /Cheaper elsewhere/.test(best) && /on Flipkart/.test(best) && /₹20 less than on Amazon\.in/.test(best), best);
  const href = await page.locator('#compare .shop-row[data-store=flipkart] a.shop-link').getAttribute('href');
  check('…tapping it opens that product on Flipkart', href === 'https://www.flipkart.com/cello-butterflow/p/itm123?pid=TEST', href);
  const images = await page.locator('#compare .shop-row img').evaluateAll((imgs) => imgs.map((i) => i.src));
  check('photos come from the stores\' own image servers only', images.length > 0 && images.every((u) => /^https:\/\/(rukminim2\.flixcart\.com|cdn\.jiostore\.online|img\.tatacliq\.com|images\.meesho\.com|[a-z0-9]+\.sdlcdn\.com)\//.test(u)), images.join(' '));
  if (process.env.SHOT) { await page.locator('#compare').scrollIntoViewIfNeeded(); await page.locator('#compare').screenshot({ path: process.env.SHOT }); }
  await page.evaluate(() => window.scrollTo(500, 0));
  check('no horizontal scroll at 390 px', (await page.evaluate(() => window.scrollX)) === 0);

  // Kept on the phone for 6 hours: shown at once on the next visit, without asking the app.
  const again = await ctx.newPage();
  again.on('pageerror', (e) => errors.push(String(e)));
  await again.goto(`${base}/p/${encodeURIComponent(key)}`, { waitUntil: 'networkidle' });
  await again.waitForSelector('#compare .shop-row', { timeout: 10_000 }).catch(() => {});
  check('next visit: the last check is shown at once, marked as when it was checked', /Checked .* on this phone/.test(await again.locator('#compare').innerText()) && (await again.locator('#compare .shop-row[data-kind=same]').count()) === 1
    && (await compareAsks(again)) === 0 && (await again.locator('#shop-run').innerText()) === 'Check again');
  check('no script errors and no blocked images', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // A phone's browser (no app): no button, the way to get prices from the other stores is said.
  const web = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const wp = await web.newPage();
  await wp.goto(`${base}/p/${encodeURIComponent(key)}`, { waitUntil: 'networkidle' });
  await wp.waitForSelector('#compare h2', { timeout: 10_000 }).catch(() => {});
  const wtext = await wp.locator('#compare').innerText().catch(() => '');
  check('in a browser: no compare button; says the app reads the other stores, and links to it', (await wp.locator('#shop-run').count()) === 0 && /Britto Android app reads each store/.test(wtext) && (await wp.locator('#compare a[href="/app"]').count()) === 1, wtext.slice(0, 200));
  check('…the store searches are still there for doing it yourself', (await wp.locator('#compare .shop-more .store-chip').count()) >= 5);
  await web.close();

  // The search page in the app: the other stores' own results, read on the phone.
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua('0.8.0') });
  await sctx.addInitScript((readings) => {
    window.__asked = [];
    let job = null;
    window.BrittoBridge = {
      onmessage: null,
      postMessage(data) {
        const { id, msg } = JSON.parse(data);
        window.__asked.push(msg);
        let reply = null;
        if (msg.type === 'compareFares') { job = msg.sites; reply = { ok: true, job: 'j2' }; }
        if (msg.type === 'compareStatus' && job) reply = { ok: true, job: 'j2', done: true, sites: job.map((s) => ({ id: s.id, state: 'done', ...readings[s.id] })) };
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id, reply }) }), 20);
      },
    };
  }, readings);
  const sp = await sctx.newPage();
  sp.on('pageerror', (e) => errors.push(String(e)));
  await sp.goto(`${base}/search?q=cello%20pen`, { waitUntil: 'networkidle' });
  const go = sp.locator('#shop-search-run');
  await go.waitFor({ timeout: 10_000 }).catch(() => {});
  check('search page in the app: "Search N more stores", nothing asked before the tap', (await go.count()) === 1 && /^Search \d more stores$/.test(await go.innerText()) && (await compareAsks(sp)) === 0);
  await go.click();
  await sp.waitForSelector('#other-stores .store-results[data-store=flipkart] .shop-card', { timeout: 10_000 }).catch(() => {});
  const searched = await sp.evaluate(() => window.__asked.find((m) => m.type === 'compareFares')?.sites.map((s) => s.url));
  check('…each store\'s own search for the typed words', !!searched && searched.every((u) => /cello(%20|-)pen/i.test(u)), JSON.stringify(searched));
  const fkCards = await sp.locator('#other-stores .store-results[data-store=flipkart] .shop-card').count();
  check('…Flipkart\'s results listed with their prices', fkCards === Math.min(8, readings.flipkart.rows.length) && /₹799/.test(await sp.locator('#other-stores .store-results[data-store=flipkart]').innerText()), String(fkCards));
  check('…every store section says it is done (data-state), not just its last status', (await sp.locator('#other-stores .store-results').evaluateAll((x) => x.every((e) => e.dataset.state === 'done'))));
  check('…Croma says it asks if you are a person', /asks if you are a person/.test(await sp.locator('#other-stores .store-results[data-store=croma]').innerText().catch(() => '')));
  await sp.evaluate(() => window.scrollTo(500, 0));
  check('…no horizontal scroll', (await sp.evaluate(() => window.scrollX)) === 0);
  await sctx.close();

  // An older app (0.7.0) cannot read store pages: it is told to update, not shown a dead button.
  const old = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua('0.7.0') });
  const op = await old.newPage();
  await op.goto(`${base}/p/${encodeURIComponent(key)}`, { waitUntil: 'networkidle' });
  await op.waitForSelector('#compare h2', { timeout: 10_000 }).catch(() => {});
  check('app 0.7.0: "Update the Britto app", no button', (await op.locator('#shop-run').count()) === 0 && /Update the Britto app/.test(await op.locator('#compare').innerText().catch(() => '')));
  await old.close();
} finally {
  await browser.close();
}
console.log(`\n${failed ? `${failed} FAILED` : 'all passed'}`);
process.exit(failed ? 1 : 0);
