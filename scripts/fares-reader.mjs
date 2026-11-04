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
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
