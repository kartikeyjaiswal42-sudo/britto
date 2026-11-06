// The app's fare reader (android/js/fares.ts, built exactly as the app's britto-fares.js is) run in
// a real Chrome on saved travel pages, each served at its own address with the page's own scripts
// off and nothing else fetched. core/fares.test.ts checks the rules on whole pages; this checks
// what the app really hands them: the cards alone, the page's words when the cards show no price
// (a logged-out Uber, 2026-11-04), and the trip boxes of a ride typed on its own page (Rapido).
//   PW_DIR=<playwright-core dir> node scripts/fares-reader.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require(process.env.PW_DIR ?? 'playwright-core'); } catch { return require('playwright'); } })();

const out = await build({
  entryPoints: [join(ROOT, 'android/js/fares.ts')], bundle: true, format: 'iife', globalName: '__brittoFares',
  target: 'es2020', legalComments: 'none', logLevel: 'warning', write: false,
});
const engine = out.outputFiles[0].text;
const recipes = JSON.parse(readFileSync(join(ROOT, 'web/fares.json'), 'utf8')).recipes;
const recipe = (site) => recipes.find((r) => r.site === site);
const fixture = (name) => {
  const html = readFileSync(join(ROOT, 'test/fixtures', name), 'utf8');
  return { html, url: /^<!-- saved by the Britto app[^>]*? from (\S+)/.exec(html)[1] };
};

let pass = 0;
let fail = 0;
const check = (name, ok, got) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(got).slice(0, 300)})`}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 412, height: 915 } });
/** The app's own call (FareRunner.java / StoreActivity.java), on `html` served at `url`. */
async function readAt(url, html, site, before) {
  const page = await context.newPage();
  await page.route('**/*', (route) => (route.request().url() === url ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : route.abort()));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (before) await page.evaluate(before);
  const json = await page.evaluate(`(function(){${engine};return __brittoFares.read(${JSON.stringify(recipe(site))},{});})()`);
  await page.close();
  return JSON.parse(json);
}

try {
  const loggedOut = fixture('fares-uber-logged-out-list-2026-11-04.html');
  const r1 = await readAt(loggedOut.url, loggedOut.html, 'uber');
  check('Uber logged out on its ride list (rides, no prices): "log in", not "no fares"', r1.status === 'login' && !r1.error, r1);

  const uber = fixture('fares-uber-cp-del-t3-2026-11-04-list.html');
  const r2 = await readAt(uber.url, uber.html, 'uber');
  check('Uber logged in: its nine rides, cheapest ₹164.61', r2.status === 'fares' && r2.rows.length === 9 && r2.cheapest === 16461, r2);

  const rapido = fixture('fares-rapido-amity-sector18-2026-11-04-list.html');
  const boxes = `(() => { for (const [ph, v] of [['Enter pickup location here', 'Gate no. 3, Amity Rd, Sector 125, Noida'], ['Enter drop location here', 'Noida Sector 18 Metro Station']]) { const i = document.createElement('input'); i.className = 'form-control location-ip'; i.placeholder = ph; document.body.prepend(i); i.value = v; } document.body.prepend(...[...document.querySelectorAll('input.location-ip')].reverse()); })()`;
  const r3 = await readAt(rapido.url, rapido.html, 'rapido', boxes);
  check('Rapido: its four ride types, Auto ₹162 the cheapest (Parcel is a delivery: left out)', r3.status === 'fares' && r3.rows.length === 4 && r3.rows[0].label === 'Auto' && r3.cheapest === 16200, r3);
  check('Rapido: the trip its boxes hold, pickup then drop', JSON.stringify(r3.places) === JSON.stringify(['Gate no. 3, Amity Rd, Sector 125, Noida', 'Noida Sector 18 Metro Station']), r3.places);

  const home = '<html><body><h1>Welcome to Rapido!</h1><p>Book your hassle-free trip with Rapido</p><input class="form-control location-ip" placeholder="Enter pickup location here"><input class="form-control location-ip" placeholder="Enter drop location here"></body></html>';
  const r4 = await readAt('https://m.rapido.bike/home', home, 'rapido');
  check('Rapido before a trip is entered: "enter the trip", empty boxes', r4.status === 'ask' && JSON.stringify(r4.places) === '["",""]', r4);

  // Entering the trip (android/js/fill.ts) on a stand-in for Rapido's page: its real box and
  // search placeholders, its real ride list (the fixture's cards), suggestions that appear only
  // after a key is released (as on Rapido, measured), and a Book button that counts presses.
  const cardsHtml = rapido.html.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '');
  const standIn = (dropPlaces, asButtons = false, prior = false) => `<html><body>
<div id="home"><h1>Welcome to Rapido!</h1><p>Book your hassle-free trip with Rapido</p>
<input class="form-control location-ip" placeholder="Enter pickup location here">
<input class="form-control location-ip" placeholder="Enter drop location here"></div>
<div id="p0" hidden><input placeholder="Enter pickup location"><div class="suggestion-result"></div></div>
<div id="p1" hidden><input placeholder="Enter drop location"><div class="suggestion-result"></div></div>
<div id="fares" ${prior ? '' : 'hidden'}>${cardsHtml}</div>
<button class="next-button" id="book">Book Bike</button>
<script>
  window.booked = 0; window.buttonTaps = 0;
  document.getElementById('book').onclick = () => { window.booked++; };
  const boxes = document.querySelectorAll('#home input');
  const places = [['Amity Road, Sector 44, Noida, Uttar Pradesh', 'Amity University Noida Gate No. 3, Amity Road, Sector 125, Noida'], ${JSON.stringify(dropPlaces)}];
  if (${prior}) { boxes[0].value = 'Botanical Garden Metro, Noida'; boxes[1].value = 'DLF Mall of India, Noida'; }
  boxes.forEach((b, i) => b.addEventListener('click', () => { document.getElementById('p' + i).hidden = false; }));
  [0, 1].forEach((i) => {
    const panel = document.getElementById('p' + i);
    panel.querySelector('input').addEventListener('keyup', () => setTimeout(() => {
      const list = panel.querySelector('.suggestion-result');
      list.innerHTML = places[i].map((t) => (${asButtons ? 'i === 1' : 'false'} ? '<button><div class="location-item">' + t + '</div></button>' : '<div class="location-item">' + t + '</div>')).join('');
      list.querySelectorAll('.location-item').forEach((it) => it.addEventListener('click', () => {
        if (it.closest('button')) window.buttonTaps++;
        boxes[i].value = it.textContent; panel.hidden = true; list.innerHTML = '';
        if (boxes[0].value && boxes[1].value) { document.getElementById('fares').hidden = false; document.querySelector('#home h1').hidden = true; document.querySelector('#home p').hidden = true; }
      }));
    }, 300));
  });
</script></body></html>`;
  const live = await browser.newContext({ viewport: { width: 412, height: 915 } });
  async function fillAt(html, trip) {
    const page = await live.newPage();
    const url = 'https://m.rapido.bike/home';
    await page.route('**/*', (route) => (route.request().url() === url ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : route.abort()));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    let stage = '';
    const stages = [];
    let r = null;
    for (let i = 0; i < 40; i++) {
      r = JSON.parse(await page.evaluate(`(function(){${engine};return __brittoFares.read(${JSON.stringify(recipe('rapido'))},${JSON.stringify({ trip, stage })});})()`));
      if (r.stage && r.stage !== stage) stages.push(r.stage);
      stage = r.stage ?? stage;
      if (r.status === 'fares' || stage === 'failed') break;
      await page.waitForTimeout(400);
    }
    const taps = await page.evaluate('({ booked: window.booked, buttonTaps: window.buttonTaps, boxes: [...document.querySelectorAll("#home input")].map((b) => b.value) })');
    await page.close();
    return { r, stages, ...taps };
  }
  const trip = { pickup: 'Amity University Noida', drop: 'Noida Sector 18 Metro Station' };
  const ok = await fillAt(standIn(['Noida Sector 18 Metro Station, Captain Vijyant Thapar Marg, Noida', 'Sector 18, Noida, Uttar Pradesh']), trip);
  check('Rapido filled like a person: pickup, then drop, then its ride list read', ok.r?.status === 'fares' && ok.r.rows.length === 4 && ok.stages.at(-1) === 'done' && ok.stages.includes('pickup-typed-0') && ok.stages.includes('drop-open-0'), ok);
  check('the suggestion that names the place is picked, not simply the first one', ok.boxes[0] === 'Amity University Noida Gate No. 3, Amity Road, Sector 125, Noida' && ok.boxes[1].startsWith('Noida Sector 18 Metro Station'), ok.boxes);
  check('the trip read back from its boxes for the Britto page', ok.r?.places?.[0] === ok.boxes[0] && ok.r?.places?.[1] === ok.boxes[1], ok.r?.places);
  check('Book was never pressed', ok.booked === 0, ok.booked);
  const prior = await fillAt(standIn(['Noida Sector 18 Metro Station, Captain Vijyant Thapar Marg, Noida'], false, true), trip);
  check('an earlier trip\'s fares on screen are not taken: the trip is entered first', prior.r?.status === 'fares' && prior.stages.includes('pickup-typed-0') && prior.r?.places?.[0]?.startsWith('Amity University Noida') && prior.booked === 0, prior);
  const none = await fillAt(standIn(['Greater Noida West, Gaur City', 'Ghaziabad Railway Station']), trip);
  check('no listed place matches the drop: Britto stops (ask), Book never pressed', none.r?.status === 'ask' && none.r?.stage === 'failed' && /none of the site's places matched/.test(none.r?.failed) && none.booked === 0, none);
  const asButtons = await fillAt(standIn(['Noida Sector 18 Metro Station, Captain Vijyant Thapar Marg, Noida'], true), trip);
  check('a matching suggestion inside a button is never tapped: Britto stops', asButtons.buttonTaps === 0 && asButtons.booked === 0 && asButtons.r?.stage === 'failed' && /drop: refused to tap it/.test(asButtons.r?.failed ?? '') && asButtons.boxes[0] !== '', asButtons);
  const plain = await readAt(rapido.url, rapido.html, 'rapido');
  check('without a trip, the ride list is read as before (no filling)', plain.status === 'fares' && plain.stage === undefined, plain);
  await live.close();

  // Shop compare (app 0.8.0): the same bundled reader on each store's saved search cards, served
  // at that store's own search address, reading the LIVE page's cards (querySelectorAll, as on the
  // phone), must give exactly what the engine gives on the saved file (core/shop.test.ts).
  const { readShop } = await import('../core/shop.ts');
  const shops = JSON.parse(readFileSync(join(ROOT, 'web/shops.json'), 'utf8')).recipes;
  const SHOP_PAGES = [
    ['flipkart', 'shop-flipkart-boat-airdopes-141-2026-11-06-cards.html', 'https://www.flipkart.com/search?q=boat%20airdopes%20141'],
    ['myntra', 'shop-myntra-levis-t-shirt-2026-11-06-cards.html', 'https://www.myntra.com/levis%20t%20shirt'],
    ['croma', 'shop-croma-boat-airdopes-141-2026-11-06-cards.html', 'https://www.croma.com/searchB?q=boat%20airdopes%20141%3Arelevance&text=boat%20airdopes%20141'],
    ['ajio', 'shop-ajio-levis-t-shirt-2026-11-06-cards.html', 'https://www.ajio.com/search/?text=levis%20t%20shirt'],
    ['meesho', 'shop-meesho-steam-iron-2026-11-06-cards.html', 'https://www.meesho.com/search?q=steam%20iron'],
    ['reliancedigital', 'shop-reliancedigital-boat-airdopes-141-2026-11-06-cards.html', 'https://www.reliancedigital.in/products?q=boat%20airdopes%20141'],
    ['tatacliq', 'shop-tatacliq-boat-airdopes-141-2026-11-06-cards.html', 'https://www.tatacliq.com/search/?searchCategory=all&text=boat%20airdopes%20141'],
    ['nykaa', 'shop-nykaa-cetaphil-face-wash-2026-11-06-cards.html', 'https://www.nykaa.com/search/result/?q=cetaphil%20face%20wash'],
    ['snapdeal', 'shop-snapdeal-steam-iron-2026-11-06-cards.html', 'https://www.snapdeal.com/search?keyword=steam%20iron'],
  ];
  for (const [store, file, url] of SHOP_PAGES) {
    const shopRecipe = shops.find((r) => r.store === store);
    const html = readFileSync(join(ROOT, 'test/fixtures', file), 'utf8');
    const page = await context.newPage();
    await page.route('**/*', (route) => (route.request().url() === url ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : route.abort()));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const got = JSON.parse(await page.evaluate(`(function(){${engine};return __brittoFares.read(${JSON.stringify(shopRecipe)},{});})()`));
    await page.close();
    const want = readShop(shopRecipe, html, url);
    check(`shop: ${store}'s search page read in the app's reader as on the saved file (${want.rows.length} products)`, got.status === 'listed' && JSON.stringify(got) === JSON.stringify(want),
      { status: got.status, first: got.rows?.[0], want: want.rows[0] });
  }
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
