// Real-Chrome check of the web app: `PW_DIR=<playwright-core dir> node scripts/browser.mjs <url>`.
// Expects a server that already tracks amazon:B09X5DK382 (run scripts/prove.mjs's steps or
// add it on the page). Asserts on what is RENDERED (text, computed style, scroll position),
// not on markup.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { STORES, STORE_IDS } from '../core/stores.ts';
import { airportIndex, flightSearch, hotelSearch, rideSearch, todayIST } from '../web/travel.js';

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
    // A made-up location (Connaught Place, New Delhi), given only to this browser for the ride check.
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, permissions: ['geolocation'], geolocation: { latitude: 28.6315, longitude: 77.2167 } });
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

    // Offers (BLUEPRINT §15) on a view whose offers are MADE UP in this browser only (the real
    // server stores offers only from its own reads of a store page).
    const productApi = /\/api\/products\/amazon(%3A|:)B09X5DK382$/;
    await page.route(productApi, async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.product.offers = { at: Date.now() - 2 * 3_600_000, items: [
        { title: 'Bank Offer', text: 'Upto ₹1,000.00 discount <img src=x onerror="document.title=1"> on select Credit Cards', count: '27 offers', code: null, votes: null },
        { title: 'Cashback', text: 'Upto ₹7.00 cashback as Amazon Pay Balance', count: null, code: null, votes: null },
        { title: 'Get flat 10 Percent off', text: 'Use Code "SAVE10" Min. Cart Value ₹199', count: null, code: 'SAVE10', votes: { worked: 3, total: 4 } },
      ] };
      await route.fulfill({ response: res, json: body });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#offers li');
    const offerItems = await page.locator('#offers li').allInnerTexts();
    check('offers: each listed as the store page put it, markup shown as text, never run', offerItems.length === 3 && offerItems[0].startsWith('Bank Offer Upto ₹1,000.00 discount <img')
      && offerItems[0].endsWith('· 27 offers') && (await page.locator('#offers img').count()) === 0, JSON.stringify(offerItems));
    const offerNote = await page.locator('#offers p').innerText();
    check('…with when they were read, and that Britto does not check them', /showed them 2 h ago/.test(offerNote) && /does not check offers/.test(offerNote), offerNote);
    const coupon = page.locator('#offers .coupon');
    check('a coupon code: shown with Copy, and what shoppers said', (await coupon.count()) === 1 && (await coupon.locator('code').innerText()) === 'SAVE10'
      && /Worked for 3 of 4 shoppers/.test(await coupon.innerText()), await coupon.innerText().catch(() => 'none'));
    let voteSent = null;
    await page.route('**/api/coupons/vote', async (route) => { voteSent = route.request().postDataJSON(); await route.fulfill({ json: { votes: { worked: 4, total: 5 } } }); });
    await coupon.getByRole('button', { name: 'It worked' }).click();
    await page.waitForFunction(() => /Thanks/.test(document.querySelector('#offers .coupon .votes')?.textContent ?? ''));
    check('…"It worked" sends store, code and the answer, then shows the new count', JSON.stringify(voteSent) === '{"store":"amazon","code":"SAVE10","worked":true}'
      && /Worked for 4 of 5 shoppers/.test(await coupon.locator('.votes').innerText()) && await coupon.getByRole('button', { name: 'It did not' }).isDisabled(), JSON.stringify(voteSent));
    const couponBox = await coupon.boundingBox();
    check('…and the coupon row fits the screen', couponBox != null && couponBox.x >= 0 && couponBox.x + couponBox.width <= viewport.width, JSON.stringify(couponBox));
    await page.unroute('**/api/coupons/vote');
    await page.unroute(productApi);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.big-price');
    check('…and no offers section when none were read', (await page.locator('#offers').count()) === 0);

    // No sideways scrolling: try to scroll right and see whether anything moved.
    await page.evaluate(() => window.scrollTo(500, 0));
    check('no horizontal scroll', (await page.evaluate(() => window.scrollX)) === 0);

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(`${scheme} theme background applied`, scheme === 'dark' ? bg === 'rgb(18, 19, 21)' : bg === 'rgb(247, 246, 242)', bg);

    // The prefix trick in a real browser.
    await page.goto(`${base}/https://www.amazon.in/Cello/dp/B09X5DK382/ref=x`, { waitUntil: 'networkidle' });
    check('"site/<amazon link>" opens the product page', page.url().includes('/p/amazon') && (await page.locator('.big-price').count()) === 1, page.url());

    await page.goto(base + '/stores', { waitUntil: 'networkidle' });
    check('stores page lists the measured status', (await page.locator('table.stores tbody tr').count()) === STORE_IDS.length);

    await page.goto(base + '/browse', { waitUntil: 'networkidle' });
    const tiles = await page.locator('a.store-tile').evaluateAll((as) => as.map((a) => [a.dataset.store, a.getAttribute('href')]));
    check('Super Browse lists every store with its front page', JSON.stringify(tiles) === JSON.stringify(STORE_IDS.map((id) => [id, STORES[id].home])), JSON.stringify(tiles));
    const tileBox = await page.locator('a.store-tile').first().boundingBox();
    check('…tiles are large enough to tap (≥ 44 px tall)', (tileBox?.height ?? 0) >= 44, JSON.stringify(tileBox));
    check('…the header links to it ("Shop")', (await page.locator('.top nav a', { hasText: 'Shop' }).getAttribute('href')) === '/browse');

    await page.goto(base + '/search?q=cello', { waitUntil: 'networkidle' });
    check('search page finds it', await page.locator('.card .title', { hasText: 'Cello' }).count() > 0);

    // Sale events on the chart, drawn by the site's own chart.js in this browser: a band only
    // when the end date is known, a dashed start marker when it is not (never a guessed band).
    const marks = await page.evaluate(async () => {
      const { drawChart } = await import('/chart.js');
      const host = document.createElement('div');
      host.style.width = '600px';
      document.body.append(host);
      const day = 86_400_000;
      const t0 = Date.parse('2026-10-01T00:00:00Z');
      drawChart(host, {
        points: [{ at: t0, price: 50000, mrp: null, inStock: true, source: 'server' }, { at: t0 + 10 * day, price: 45000, mrp: null, inStock: true, source: 'server' }],
        stats: { lastCheckedAt: t0 + 20 * day, lowest: null },
        saleEvents: [{ title: 'Ended sale', from: t0 + 2 * day, to: t0 + 5 * day }, { title: 'Open sale', from: t0 + 12 * day, to: null }],
      }, 0);
      const r = { bands: host.querySelectorAll('rect.sale-band').length, starts: host.querySelectorAll('line.sale-start').length,
        labels: [...host.querySelectorAll('text.sale-label')].map((t) => t.textContent), stroke: getComputedStyle(host.querySelector('line.sale-start')).stroke };
      host.remove();
      return r;
    });
    check('sale events: a band for an ended sale, a start marker for one with no end date', marks.bands === 1 && marks.starts === 1 && marks.labels.join('|') === 'Ended sale|Open sale' && marks.stroke !== 'none', JSON.stringify(marks));

    // Travel (BLUEPRINT §14): links built on the device by web/travel.js, the same code as here.
    const toBritto = [];
    page.on('request', (r) => { if (r.url().startsWith(base)) toBritto.push(`${r.url()} ${r.postData() ?? ''}`); });
    await page.goto(base + '/travel', { waitUntil: 'networkidle' });
    const airportRows = JSON.parse(readFileSync(new URL('../web/airports.json', import.meta.url), 'utf8')).airports;
    const airports = airportIndex(airportRows);
    const ridesData = JSON.parse(readFileSync(new URL('../web/rides.json', import.meta.url), 'utf8'));
    const when = new Date(Date.parse(`${todayIST()}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    const later = new Date(Date.parse(`${when}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
    check('travel page: flights, hotels and rides; the airport list loaded', (await page.locator('form.travel-form').count()) === 3 && (await page.locator('#airport-list option').count()) === airportRows.length);
    await page.fill('#flights [name=from]', 'DEL · New Delhi');
    await page.fill('#flights [name=to]', 'del');
    await page.click('#flights button[type=submit]');
    check('…the same airport twice is refused, said plainly', /same airport/.test(await page.locator('#flight-links').innerText()));
    await page.fill('#flights [name=to]', 'BOM · Mumbai');
    await page.fill('#flights [name=depart]', when);
    await page.click('#flights button[type=submit]');
    const want = flightSearch({ from: 'DEL', to: 'BOM', depart: when, adults: 1, cabin: 'economy' }, airports);
    const got = await page.locator('#flight-links li').evaluateAll((lis) => lis.map((li) => [li.dataset.site, li.querySelector('a').href, li.querySelector('a').textContent, li.querySelector('span').textContent]));
    check('…flights: every site, the link web/travel.js builds, checked ones first', want.ok && JSON.stringify(got.map((g) => [g[0], g[1]])) === JSON.stringify(want.links.map((l) => [l.id, l.url])), JSON.stringify(got.slice(0, 3)));
    check('…each link says how far it was checked', got[0][2] === 'Search on Cleartrip' && /checked on the site/.test(got[0][3]) && /documentation/.test(got[1][3])
      && got.some((g) => g[0] === 'makemytrip' && /Not checked yet/.test(g[3])) && got.some((g) => g[0] === 'indigo' && g[2] === 'Open IndiGo' && /enter your trip there/.test(g[3])), JSON.stringify(got.map((g) => g[3])));
    check('…and every link opens in a new tab without telling the site where you came from', (await page.locator('#flight-links a').evaluateAll((as) => as.every((a) => a.target === '_blank' && /noreferrer/.test(a.rel)))));
    await page.fill('#hotels [name=city]', 'Goa');
    await page.fill('#hotels [name=checkIn]', when);
    await page.fill('#hotels [name=checkOut]', later);
    await page.click('#hotels button[type=submit]');
    const hotelWant = hotelSearch({ city: 'Goa', checkIn: when, checkOut: later, adults: 2 });
    check('…hotels: Cleartrip with the city, dates and guests', hotelWant.ok && (await page.locator('#hotel-links li[data-site=cleartrip] a').getAttribute('href')) === hotelWant.links[0].url);
    await page.fill('#rides [name=rideTo]', 'DEL · New Delhi');
    await page.click('#rides button[type=submit]');
    await page.waitForSelector('#ride-links li');
    const rideWant = rideSearch({ to: 'DEL', pickup: { lat: 28.6315, lng: 77.2167 } }, airports, ridesData.uber);
    check('…ride to the airport: the Uber link from this browser\'s location (pre-filled only if Uber reads DEL as the airport)', rideWant.ok
      && (await page.locator('#ride-links li[data-site=uber] a').getAttribute('href')) === rideWant.links[0].url, rideWant.ok ? rideWant.links[0].url : '');
    check('…and the location never went to Britto', toBritto.length > 0 && !toBritto.some((u) => /28\.63|77\.21/.test(u)), toBritto.filter((u) => /28\.63|77\.21/.test(u)).join(' '));
    await page.evaluate(() => window.scrollTo(500, 0));
    check('…no horizontal scroll on the travel page', (await page.evaluate(() => window.scrollX)) === 0);
    const appCtx = await browser.newContext({ viewport, colorScheme: scheme, userAgent: `${await page.evaluate(() => navigator.userAgent)} BrittoApp/0.1.0` });
    const appPage = await appCtx.newPage();
    await appPage.goto(base + '/travel', { waitUntil: 'networkidle' });
    await appPage.fill('#rides [name=rideTo]', 'DEL · New Delhi');
    await appPage.click('#rides button[type=submit]');
    check('…inside the Britto app (no location permission): says to use the phone\'s browser for rides', /does not ask for your location/.test(await appPage.locator('#ride-links').innerText()) && (await appPage.locator('#ride-links a').count()) === 0);
    await appCtx.close();

    check('no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
