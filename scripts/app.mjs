// The Android app's moving parts, without a phone:
//   1. the release APK (if built: cd android && ./gradlew assembleRelease): what it asks for and holds;
//   2. the page reader the app injects (android/js/inject.ts), running in real Chromium at a
//      phone's width, talking through the app's REAL bridge code (BridgeCore.java + Api.java,
//      compiled for a computer by ./gradlew bridgeHarnessLibs) to a real local Worker + D1.
// What this cannot check: Android's WebView itself, the activities, Back, share, Downloads.
// Those need a phone (HISTORY.md, "Waiting for the owner").
//   node scripts/app.mjs        (needs: npm ci, and ./gradlew bridgeHarnessLibs in android/)
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { confirmIdentity, readPage } from '../core/interpret.ts';
import { STORES, STORE_IDS, parseProductLink } from '../core/stores.ts';
import { SERVICES } from '../core/services.ts';
import { bundledReader } from '../readers/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require(process.env.PW_DIR ?? 'playwright-core'); } catch { return require('playwright'); } })();
const fx = (name) => readFileSync(join(ROOT, 'test/fixtures', name), 'utf8');
const VERSION = /versionName = "([^"]+)"/.exec(readFileSync(join(ROOT, 'android/app/build.gradle.kts'), 'utf8'))[1];

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${detail}` : ''}`);
};

// ---- 1. the APK
const APK = join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk');
const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'android-sdk'), join(homedir(), 'Library/Android/sdk')].find((d) => d && existsSync(join(d, 'build-tools')));
if (existsSync(APK) && sdk) {
  const tools = join(sdk, 'build-tools', readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1));
  const badging = execFileSync(join(tools, 'aapt2'), ['dump', 'badging', APK], { encoding: 'utf8' });
  check('APK: package app.britto, version as in build.gradle.kts', badging.includes(`package: name='app.britto'`) && badging.includes(`versionName='${VERSION}'`), badging.split('\n')[0]);
  check('APK: Android 10+ (minSdk 29), targets Android 16 (36)', /minSdkVersion:'29'/.test(badging) && /targetSdkVersion:'36'/.test(badging));
  const perms = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]);
  check('APK: asks for the internet and nothing else (plus AndroidX\'s own signature permission)', isDeepStrictEqual(perms.filter((p) => !p.endsWith('.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION')), ['android.permission.INTERNET']), perms.join(', '));
  const manifest = execFileSync(join(tools, 'aapt2'), ['dump', 'xmltree', '--file', 'AndroidManifest.xml', APK], { encoding: 'utf8' });
  const store = manifest.slice(manifest.indexOf('"app.britto.StoreActivity"'), manifest.indexOf('"app.britto.StoreActivity"') + 400);
  check('APK: Super Browse cannot be opened by other apps (StoreActivity not exported)', /exported\(0x01010010\)=false/.test(store));
  // CONFIG_UI_MODE = 0x200. Handling it ourselves left the system bars in the old theme after a
  // light/dark switch (seen on an emulator: white status icons on a light strip); both screens
  // save and restore their page, so Android may simply recreate them.
  const changes = [...manifest.matchAll(/configChanges\(0x0101001f\)=0x([0-9a-f]+)/g)].map((m) => parseInt(m[1], 16));
  check('APK: a light/dark switch recreates the screens (no activity handles uiMode itself)', changes.length === 2 && changes.every((c) => (c & 0x200) === 0), changes.map((c) => c.toString(16)).join(', '));
  check('APK: "Share -> Britto" accepts shared text', /android\.intent\.action\.SEND/.test(manifest) && /mimeType\(0x01010026\)="text\/plain"/.test(manifest));
  const reader = execFileSync('unzip', ['-p', APK, 'assets/britto-reader.js'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  check('APK: the page reader is inside, talks to production, ships no store recipe', reader.includes('https://britto.amitynoidalibrary.workers.dev') && reader.includes('identity-mismatch') && !/corePriceDisplay_desktop_feature_div|pdpData\.price|productTitle/.test(reader));
  check('APK: its shadow root is closed (the test build\'s is open)', reader.includes('"closed"') && !reader.includes('mode: "open"'));
  const stores = JSON.parse(execFileSync('unzip', ['-p', APK, 'assets/stores.json'], { encoding: 'utf8' }));
  const shops = stores.filter((s) => !s.service);
  check('APK: store hosts are core/stores.ts\'s', isDeepStrictEqual(shops.map((s) => s.id), STORE_IDS) && shops.every((s) => isDeepStrictEqual(s.hosts, STORES[s.id].hosts)));
  check('APK: one service per sector opens in the app (core/services.ts), marked as a service', isDeepStrictEqual(stores.filter((s) => s.service).map((s) => [s.id, s.hosts]), SERVICES.map((s) => [s.id, s.hosts])));
} else {
  console.log(`SKIP  APK checks — NOT verified: no ${existsSync(APK) ? 'Android SDK' : 'APK'} (cd android && ./gradlew assembleRelease)`);
}

// ---- 2. the page reader in Chromium, through the app's real bridge code
const HARNESS = join(ROOT, 'android/app/build/bridge-harness');
if (!existsSync(join(HARNESS, 'classes/app/britto/HarnessMain.class'))) throw new Error('build the bridge harness first: cd android && ./gradlew bridgeHarnessLibs');
const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const API = `http://127.0.0.1:${port}`;
const state = mkdtempSync(join(tmpdir(), 'britto-app-'));
const d1dir = join(state, 'd1');
execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--local', '--persist-to', d1dir, '--file', 'api/schema.sql'], { cwd: ROOT, stdio: 'ignore' });
execFileSync('node', ['scripts/build-app-assets.mjs', '--out', join(state, 'assets'), '--site', API, '--test'], { cwd: ROOT, stdio: 'ignore' });
const READER_JS = readFileSync(join(state, 'assets/britto-reader.js'), 'utf8');
const worker = spawn(WRANGLER, ['dev', '--local', '--persist-to', d1dir, '--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false', '--var', 'READER_MEMO_MS:0'], { cwd: ROOT, detached: true, stdio: 'ignore' });
for (const until = Date.now() + 60_000; ;) {
  try { if ((await fetch(`${API}/api/health`)).ok) break; } catch { /* starting */ }
  if (Date.now() > until) throw new Error('wrangler dev did not start');
  await new Promise((r) => setTimeout(r, 500));
}
const api = async (path) => { const r = await fetch(API + path); return { status: r.status, body: await r.json().catch(() => null) }; };
const d1 = (sql) => JSON.parse(execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--local', '--persist-to', d1dir, '--json', '--command', sql], { cwd: ROOT, encoding: 'utf8' }))[0].results;

const libs = readdirSync(join(HARNESS, 'libs')).map((f) => join(HARNESS, 'libs', f));
const java = spawn('java', [`-Dbritto.site=${API}`, `-Dbritto.version=${VERSION}`, `-Dbritto.stores=${STORE_IDS.join(',')}`, '-cp', [join(HARNESS, 'classes'), ...libs].join(':'), 'app.britto.HarnessMain'], { stdio: ['pipe', 'pipe', 'ignore'] });
const routes = new Map(); // harness id -> { page, id }
let nextId = 0;
let dropped = 0;
createInterface({ input: java.stdout }).on('line', (line) => {
  const out = JSON.parse(line);
  if (out.dropped) { dropped++; return; }
  const to = routes.get(out.id);
  routes.delete(out.id);
  // What WebView's JavaScriptReplyProxy.postMessage does: an event on the page's BrittoBridge.
  to?.page.evaluate(([data]) => window.BrittoBridge?.onmessage?.({ data }), [JSON.stringify({ id: to.id, reply: out.reply })]).catch(() => {});
});

// Store pages are the SAVED fixtures at their real addresses; nothing reaches a real store.
const FLIPKART_SYNTH = '<!doctype html><html><head><title>Phone</title><meta name="viewport" content="width=device-width, initial-scale=1"><script type="application/ld+json">{"@type":"Product","name":"Test Phone","offers":{"price":"9999","availability":"https://schema.org/InStock"}}</script></head><body><h1>Test Phone</h1></body></html>';
const PAGES = new Map([
  // Amazon pages as a phone gets them (saved with the app's own "Save page" on Android).
  ['https://www.amazon.in/Cello-Butterflow/dp/B09X5DK382', fx('amazon-mobile-cello-25pens-noship.html')],
  ['https://www.amazon.in/dp/B0CHX1W1XY', fx('amazon-mobile-iphone15-unavailable.html')],
  ['https://www.amazon.in/s?k=pen', '<!doctype html><html><body><h1>Search results</h1></body></html>'],
  ['https://www.myntra.com/tshirts/hrx/x/1700944/buy', fx('myntra-instock.html')],
  ['https://www.myntra.com/tshirts/hrx/x/999999/buy', fx('myntra-instock.html')],
  ['https://www.flipkart.com/test-phone/p/itm0000000000001', FLIPKART_SYNTH],
  ['https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4', fx('flipkart-blocked-e002.html')],
  ['https://pay.example/checkout', '<!doctype html><html><body><h1>Pay</h1></body></html>'],
]);
const ORIGINS = STORE_IDS.flatMap((id) => STORES[id].hosts.map((h) => `https://${h}`));

let browser;
let aborted = 0;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.route('**/*', (route) => {
    const page = PAGES.get(route.request().url());
    if (page) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    aborted++;
    return route.abort();
  });
  // What StoreActivity sets up: WebView creates BrittoBridge and runs the reader at document
  // start, in the stores' https origins only.
  await context.exposeBinding('__brittoNative', ({ page }, data) => {
    let env = null;
    try { env = JSON.parse(data); } catch { /* not JSON: the Java side must drop it */ }
    if (!env || typeof env !== 'object' || !Number.isInteger(env.id)) {
      java.stdin.write(`${JSON.stringify(String(data)).slice(1, -1)}\n`); // the raw text, on one line
      return;
    }
    const id = ++nextId;
    routes.set(id, { page, id: env.id });
    java.stdin.write(`${JSON.stringify({ ...env, id })}\n`);
  });
  await context.addInitScript(({ origins, js }) => {
    if (!origins.includes(location.origin)) return;
    window.BrittoBridge = { onmessage: null, postMessage(data) { window.__brittoNative(String(data)); } };
    (0, eval)(js);
  }, { origins: ORIGINS, js: READER_JS });

  const page = await context.newPage();
  const panel = () => page.locator('britto-panel');
  const panelText = async () => (await panel().count()) ? panel().locator('.box').innerText() : '';
  const waitPanel = async (re, ms = 20_000) => {
    const until = Date.now() + ms;
    let t = '';
    while (Date.now() < until) { t = await panelText().catch(() => ''); if (re.test(t)) return t; await page.waitForTimeout(250); }
    return t;
  };
  const parity = [];
  const recordParity = async (url) => {
    const reading = JSON.parse((await panel().getAttribute('data-reading')) ?? 'null');
    const link = parseProductLink(url).link;
    // The reader the app is served: the store's phone recipe, else the desktop one (deviceFallback).
    const cfg = (bundledReader(link.store, 'mobile') ?? bundledReader(link.store)).config;
    const node = confirmIdentity(link.store, link.pid, readPage(cfg, PAGES.get(url), url), cfg.reportsPid);
    const diffs = ['status', 'price', 'mrp', 'inStock', 'pid', 'title', 'image', 'rule', 'offers'].filter((k) => !isDeepStrictEqual(reading?.[k], node[k]));
    parity.push({ url, diffs: diffs.map((k) => `${k}: app ${JSON.stringify(reading?.[k])} vs node ${JSON.stringify(node[k])}`) });
  };

  check('the injected reader ships no store recipe', READER_JS.includes('identity-mismatch') && !/corePriceDisplay_desktop_feature_div|pdpData\.price|productTitle/.test(READER_JS));

  // Amazon, in stock, unknown to Britto: the app's report creates it.
  await page.goto('https://www.amazon.in/Cello-Butterflow/dp/B09X5DK382');
  let t = await waitPanel(/₹265/);
  check('Amazon page in the app: the panel shows ₹265 read from the page', /₹265/.test(t) && /M\.R\.P\.\s*₹299/.test(t), t.slice(0, 200));
  await recordParity('https://www.amazon.in/Cello-Butterflow/dp/B09X5DK382');
  let v = await api('/api/products/amazon%3AB09X5DK382');
  check('the reading reached Britto through the app\'s Java bridge', v.body?.product?.points?.length === 1 && v.body.product.points[0].price === 26500, JSON.stringify(v.body?.product?.points));
  const amazonVersion = bundledReader('amazon', 'mobile').version;
  let rows = d1(`SELECT source, config_version, reader_version, outcome, n FROM reader_health WHERE store = 'amazon'`);
  check(`…counted as the app (source app, reader app-${VERSION}, the served phone config)`, rows.some((r) => r.source === 'app' && r.reader_version === `app-${VERSION}` && r.config_version === amazonVersion && r.outcome === 'priced' && r.n === 1), JSON.stringify(rows));

  // Injected twice (a store that reloads its scripts, or the older-WebView path): one panel, one report.
  await page.evaluate((js) => (0, eval)(js), READER_JS);
  await page.waitForTimeout(2500);
  rows = d1(`SELECT n FROM reader_health WHERE store = 'amazon' AND source = 'app'`);
  check('a second injection on the same page adds no panel and no report', (await panel().count()) === 1 && rows.reduce((a, r) => a + r.n, 0) === 1, JSON.stringify(rows));

  await page.goto('https://www.amazon.in/dp/B0CHX1W1XY');
  t = await waitPanel(/Out of stock/);
  check('unavailable Amazon item reads "Out of stock"', /Out of stock/.test(t), t.slice(0, 200));
  await recordParity('https://www.amazon.in/dp/B0CHX1W1XY');

  await page.goto('https://www.amazon.in/s?k=pen');
  await page.waitForTimeout(2000);
  check('no panel on a search page', (await panel().count()) === 0);

  await page.goto('https://www.myntra.com/tshirts/hrx/x/1700944/buy');
  t = await waitPanel(/₹305/);
  check('Myntra page in the app: ₹305', /₹305/.test(t), t.slice(0, 200));
  await recordParity('https://www.myntra.com/tshirts/hrx/x/1700944/buy');

  await page.goto('https://www.myntra.com/tshirts/hrx/x/999999/buy');
  t = await waitPanel(/cannot read the price/);
  v = await api('/api/products/myntra%3A999999');
  check('a page showing ANOTHER product is not filed under this one', /cannot read the price/.test(t) && v.status === 404, `${t.slice(0, 120)} | ${v.status}`);

  await page.goto('https://www.flipkart.com/test-phone/p/itm0000000000001');
  t = await waitPanel(/cannot read the price/);
  check('Flipkart (reader not verified): says so, and points to the app\'s own "Save page" button', /cannot read the price/.test(t) && /Press "Save page" at the top/.test(t) && (await panel().locator('button', { hasText: 'Save this page' }).count()) === 0, t.slice(0, 240));
  // A page laid out for phones (viewport meta), as real store pages on a phone are. The saved
  // Amazon pages are DESKTOP layouts, which a phone shows zoomed out, panel included.
  const box = await panel().locator('.box').boundingBox();
  check('…the panel fits a 390 px phone screen (on a page laid out for phones)', box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, JSON.stringify(box));
  let tele = [];
  for (let i = 0; i < 20 && !tele.length; i++) {
    tele = d1(`SELECT source, outcome, reader_version FROM reader_health WHERE store = 'flipkart' AND source = 'app'`);
    if (!tele.length) await page.waitForTimeout(250);
  }
  check('…and its telemetry is counted as the app\'s (unrecognised)', tele.some((r) => r.outcome === 'unrecognised' && r.reader_version === `app-${VERSION}`), JSON.stringify(tele));

  await page.goto('https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4');
  t = await waitPanel(/did not load properly/);
  check('Flipkart error page: "did not load properly"', /did not load properly/.test(t), t.slice(0, 160));
  await recordParity('https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4');
  for (const p of parity) check(`parity: the app reads ${p.url.slice(12, 60)} exactly as Node does`, p.diffs.length === 0, p.diffs.join('; '));

  // The page's own scripts can reach BrittoBridge too: it answers only the reader's messages.
  const before = dropped;
  await page.evaluate(() => {
    window.BrittoBridge.postMessage(JSON.stringify({ id: 99, msg: { type: 'captureFixture', url: location.href, html: '<html>' } }));
    window.BrittoBridge.postMessage(JSON.stringify({ id: 100, msg: { type: 'postObservation', url: location.href, configVersion: '<x>', observed: { status: 'priced', price: 1 } } }));
    window.BrittoBridge.postMessage('not json');
  });
  for (let i = 0; i < 20 && dropped < before + 3; i++) await page.waitForTimeout(100);
  check('the bridge drops messages that are not the reader\'s (3 of 3)', dropped === before + 3, `${dropped - before} dropped`);

  await page.goto('https://pay.example/checkout');
  check('a page outside the stores gets neither the reader nor the bridge', (await page.evaluate(() => typeof window.BrittoBridge)) === 'undefined' && (await panel().count()) === 0);
  check('store assets were blocked, not fetched (the test never contacts a store)', aborted > 0, String(aborted));
} finally {
  await browser?.close().catch(() => {});
  java.kill();
  try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ }
  rmSync(state, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
