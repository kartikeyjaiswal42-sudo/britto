// End-to-end proof against the REAL Worker: local (`node scripts/prove.mjs`, throwaway D1,
// wrangler dev in its own process group) or deployed (`node scripts/prove.mjs --live <url>`,
// read-mostly: it adds at most two products and never touches the database directly).
// It makes one real request to amazon.in per run (the product being tracked).
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configFromServed } from '../core/recipe.ts';
import { bundledReader } from '../readers/index.ts';
import { STORE_IDS } from '../core/stores.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const live = process.argv.includes('--live');
const AMAZON = 'https://www.amazon.in/Cello-Butterflow-Simply-Ball-Pen/dp/B09X5DK382/ref=sr_1_5?crid=ABC&keywords=pen&tag=junk-21';
const KEY = 'amazon:B09X5DK382';

let pass = 0;
let failCount = 0;
const skipped = [];
function check(name, ok, detail = '') {
  if (ok) pass++;
  else failCount++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${detail}` : ''}`);
}
/** A check that could not run here: NOT verified, and said so (never counted as passed). */
function skip(name, why) {
  skipped.push(name);
  console.log(`SKIP  ${name}  — NOT verified: ${why}`);
}

async function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

let base;
let child;
let state;
if (live) {
  base = process.argv[process.argv.indexOf('--live') + 1]?.replace(/\/$/, '');
  if (!base?.startsWith('https://')) throw new Error('usage: prove.mjs --live https://…');
} else {
  state = mkdtempSync(join(tmpdir(), 'britto-prove-'));
  execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--local', '--persist-to', state, '--file', 'api/schema.sql'], { cwd: ROOT, stdio: 'ignore' });
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  // READER_MEMO_MS 0: a D1 reader override is seen at once (production keeps a config 60 s).
  child = spawn(WRANGLER, ['dev', '--local', '--persist-to', state, '--port', String(port), '--ip', '127.0.0.1', '--test-scheduled', '--show-interactive-dev-session=false', '--var', 'READER_MEMO_MS:0'], {
    cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const until = Date.now() + 60_000;
  for (;;) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
    if (Date.now() > until) { console.log(log); throw new Error('wrangler dev did not start'); }
    await new Promise((r) => setTimeout(r, 500));
  }
}
const stop = () => {
  if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } }
  if (state) rmSync(state, { recursive: true, force: true });
};
process.on('SIGINT', () => { stop(); process.exit(130); });

const j = async (path, init) => {
  const res = await fetch(base + path, { redirect: 'manual', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, body, text, headers: res.headers };
};
const post = (url) => j('/api/products', { method: 'POST', body: JSON.stringify({ url }) });
const d1 = (sql) => JSON.parse(execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--local', '--persist-to', state, '--json', '--command', sql], { cwd: ROOT, encoding: 'utf8' }))[0].results;

try {
  console.log(`Proving ${base}${live ? ' (live)' : ' (local wrangler dev)'}`);

  const health = await j('/api/health');
  check('health answers JSON', health.status === 200 && health.body?.ok === true);

  const home = await j('/');
  check('home page is the app shell', home.status === 200 && home.text.includes('id="app"'));
  check('home page carries the CSP', (home.headers.get('content-security-policy') ?? '').includes("script-src 'self'"), home.headers.get('content-security-policy') ?? 'no CSP header');

  // ---- Amazon: real fetch, real row
  const first = await post(AMAZON);
  const p = first.body?.product;
  check('Amazon link with tracking junk is tracked under its ASIN', [200, 201].includes(first.status) && p?.key === KEY, `${first.status} ${first.text.slice(0, 200)}`);
  check('the server read a real price (integer paise > 0) or says exactly why not',
    (Number.isInteger(p?.stats?.current) && p.stats.current > 0) || typeof p?.pending === 'string', JSON.stringify(p?.stats));
  // Amazon may refuse a network (it refused this cloud container's with a 503 on 2026-10-26).
  // Rule 1: we never work around that; the checks that need a real price say NOT verified.
  const amazonPriced = Number.isInteger(p?.stats?.current);
  const amazonWhy = `Amazon did not give this network a price (${p?.pending ?? 'no answer'})`;
  if (amazonPriced) {
    check('title came from the page', /Cello/i.test(p.title ?? ''), p.title);
    check('one price point recorded', p.points.length >= 1 && p.points.at(-1).source === 'server');
    check('a brand-new product is "too early", never a confident call', p.verdict.kind === 'too_early' && p.sale.status === 'too_early');
    console.log(`       read: ${p.title?.slice(0, 50)}… ₹${p.stats.current / 100} (M.R.P. ₹${(p.stats.currentMrp ?? 0) / 100})`);
    checkStoredOffers('amazon', KEY, p);
  } else {
    for (const n of ['title came from the page', 'one price point recorded', 'a brand-new product is "too early"', 'amazon: offers shown are what our server read on the page']) skip(n, amazonWhy);
  }

  const again = await post('amazon.in/dp/B09X5DK382');
  check('the same product again is not re-created', again.status === 200 && again.body?.created === false);

  const view = await j(`/api/products/${encodeURIComponent(KEY)}`);
  check('product view by key', view.status === 200 && view.body?.product?.key === KEY);

  /** Offers shown = offers our server read and stored (locally the table is checked too). */
  function checkStoredOffers(store, key, v) {
    const items = v.offers?.items.map(({ votes, ...o }) => o) ?? null;
    const stored = live ? undefined : d1(`SELECT json FROM product_offers WHERE key = '${key}'`)[0];
    check(`${store}: offers shown are what our server read on the page (or none, when it shows none)`,
      (items ?? []).every((o) => o.title && o.text && (o.code === null || /^[A-Za-z0-9_-]{3,30}$/.test(o.code)))
        && (live || (items === null ? !stored : JSON.stringify(items) === stored?.json)), JSON.stringify(v.offers));
    console.log(`       offers on the page: ${items?.length ?? 0}${items?.some((o) => o.code) ? ` (codes: ${items.filter((o) => o.code).map((o) => o.code).join(', ')})` : ''}`);
  }

  // ---- one real read per other server-readable store (BLUEPRINT §22), through the Worker
  for (const [store, url] of [
    ['vijaysales', 'https://www.vijaysales.com/p/222878/morphy-richards-digital-5-litres-air-fryer-with-adjustable-time-temperature-control-8-pre-set-menus-black'],
    ['reliancedigital', 'https://www.reliancedigital.in/product/philips-bt342115-beard-trimmer-for-men-moiojw-10047748'],
    ['nykaa', 'https://www.nykaa.com/carbamide-forte-multivitamin-for-men/p/1003586'],
    ['shopclues', 'https://www.shopclues.com/ank-hub-portable-foldable-electric-mini-iron-with-quick-heating-153656207.html'],
  ]) {
    const r = await post(url);
    const v = r.body?.product;
    if (store === 'reliancedigital') {
      // Refuses Cloudflare's network (HTTP 403 live, 2026-10-27) while answering the same bot
      // elsewhere: tracked like Flipkart, its prices from shoppers' pages, never server-fetched.
      check('reliancedigital: tracked, never fetched by our server (it refuses Cloudflare)', r.status < 300 && v?.points?.length === 0 && /does not let our server read/.test(v?.pending ?? ''), JSON.stringify({ status: r.status, pending: v?.pending }));
      continue;
    }
    const priced = Number.isInteger(v?.stats?.current) && v.stats.current > 0;
    if (priced) {
      check(`${store}: the server read a real price from the page`, v.key.startsWith(`${store}:`) && v.points.at(-1)?.source === 'server' && typeof v.title === 'string', JSON.stringify(v?.stats));
      console.log(`       read: ${v.title?.slice(0, 50)}… ₹${v.stats.current / 100}${v.stats.currentMrp ? ` (M.R.P. ₹${v.stats.currentMrp / 100})` : ''}`);
      if (store === 'shopclues') checkStoredOffers(store, v.key, v);
    } else if (v?.stats?.inStock === false) {
      check(`${store}: the server read the page (out of stock now)`, v.points.at(-1)?.source === 'server');
    } else {
      skip(`${store}: the server read a real price from the page`, `${store} did not give this network a price (${v?.pending ?? r.status})`);
    }
  }

  // ---- reader configs (BLUEPRINT §6.3): served, cached by version, checkable by the client
  const AMAZON_VERSION = bundledReader('amazon').version;
  const cfg = await j('/api/config/reader?store=amazon&device=desktop&v=0.3.0');
  const served = configFromServed(cfg.body);
  check('reader config for Amazon is served and passes the client\'s own check', cfg.status === 200 && served.ok && served.version === cfg.body.version, `${cfg.status} ${JSON.stringify(served.ok ? served.version : served.errors)}`);
  if (!live) check('…it is the bundled reader (no override yet)', cfg.body?.version === AMAZON_VERSION, `${cfg.body?.version} vs ${AMAZON_VERSION}`);
  // Cloudflare marks the ETag weak when it compresses the reply (measured live 2026-10-27:
  // brotli → W/"…", uncompressed and 304 → "…"); the server accepts either form back.
  const strong = (etag) => (etag ?? '').replace(/^W\//, '');
  check('…ETag is the version, cacheable for 10 minutes', strong(cfg.headers.get('etag')) === `"${cfg.body?.version}"` && /public, max-age=600/.test(cfg.headers.get('cache-control') ?? ''), `${cfg.headers.get('etag')} | ${cfg.headers.get('cache-control')}`);
  const again304 = await fetch(`${base}/api/config/reader?store=amazon`, { headers: { 'if-none-match': cfg.headers.get('etag') ?? '' } });
  check('…asking again with If-None-Match gets 304 and no body', again304.status === 304 && (await again304.text()) === '' && strong(again304.headers.get('etag')) === strong(cfg.headers.get('etag')), `${again304.status} ${again304.headers.get('etag')}`);
  const stale = await fetch(`${base}/api/config/reader?store=amazon`, { headers: { 'if-none-match': '"amazon.desktop.r0.000000000000"' } });
  check('…an old version gets the full config', stale.status === 200 && (await stale.json()).version === cfg.body?.version, String(stale.status));
  const byNumber = await j('/api/config/reader?store=1');
  check('a store may be named by its number (amazon = 1)', byNumber.status === 200 && byNumber.body?.version === cfg.body?.version && byNumber.body?.storeNumber === 1);
  const mobile = await j('/api/config/reader?store=nykaa&device=mobile');
  check('no mobile recipe yet: the desktop one is served, flagged deviceFallback', mobile.status === 200 && mobile.body?.device === 'desktop' && mobile.body?.features?.deviceFallback === true && configFromServed(mobile.body).ok, JSON.stringify(mobile.body?.features));
  const amazonMobile = await j('/api/config/reader?store=amazon&device=mobile');
  check('Amazon\'s phone reader is served to the app as its own recipe (no desktop fallback)', amazonMobile.status === 200 && amazonMobile.body?.device === 'mobile' && !amazonMobile.body?.features?.deviceFallback && configFromServed(amazonMobile.body).ok, `${amazonMobile.status} ${amazonMobile.body?.version}`);
  const fkMobile = await j('/api/config/reader?store=flipkart&device=mobile');
  check('Flipkart\'s phone reader is served verified (the app reads Flipkart; checked on 2 real phone pages)', fkMobile.status === 200 && fkMobile.body?.device === 'mobile' && typeof fkMobile.body?.verified === 'string' && configFromServed(fkMobile.body).ok, `${fkMobile.status} ${fkMobile.body?.version} ${fkMobile.body?.verified}`);
  check('Flipkart\'s reader is served unverified (clients read nothing from it)', (await j('/api/config/reader?store=2')).body?.verified === null);
  check('unknown store is 404 no_reader', (await j('/api/config/reader?store=ebay')).body?.error?.code === 'no_reader' && (await j('/api/config/reader?store=999')).status === 404);
  check('a bad device is 400', (await j('/api/config/reader?store=amazon&device=tablet')).body?.error?.code === 'bad_device');

  // ---- refused stores: tracked, never fetched, honest pending text
  const fk = await post('https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=x');
  check('Flipkart product is tracked without a server fetch', [200, 201].includes(fk.status) && fk.body?.product?.points?.length === 0);
  check('…and says prices come from the extension', /extension/i.test(fk.body?.product?.pending ?? ''), fk.body?.product?.pending);

  // ---- extension reports (POST /api/observations)
  const observe = (url, observed, ip) => j('/api/observations', {
    method: 'POST', body: JSON.stringify({ url, observed }), headers: ip ? { 'cf-connecting-ip': ip } : {},
  });
  const MYNTRA = 'https://www.myntra.com/tshirts/hrx/x/1700944/buy';
  const shirt = { status: 'priced', title: 'HRX Men Yellow Printed T-shirt', image: 'https://assets.myntassets.com/h_480,q_90,w_360/v1/x.jpg', price: 30500, mrp: 69900 };
  if (!live) {
    const o1 = await observe(MYNTRA, shirt, '10.0.0.1');
    check('first extension report creates the product and is accepted', o1.status === 200 && o1.body?.recorded === 'accept' && o1.body?.product?.stats?.current === 30500, o1.text.slice(0, 200));
    check('…recorded as an extension reading', o1.body?.product?.points?.at(-1)?.source === 'extension' && o1.body?.product?.pending === null);
    const o2 = await observe(MYNTRA, shirt, '10.0.0.1');
    check('the same report again is skipped (no write)', o2.body?.recorded === 'skip', o2.text.slice(0, 120));
    const forged = { ...shirt, price: 1000, mrp: null };
    const h1 = await observe(MYNTRA, forged, '10.0.0.1');
    check('a 40%+ move (₹305 → ₹10) is held, not shown', h1.body?.recorded === 'hold' && h1.body?.product?.stats?.current === 30500, h1.text.slice(0, 160));
    const h2 = await observe(MYNTRA, forged, '10.0.0.1');
    check('…the same network cannot confirm itself', h2.body?.recorded === 'hold');
    const h3 = await observe(MYNTRA, forged, '10.0.0.2');
    const differentReporters = h3.body?.recorded === 'accept';
    check('…a second network seeing the same price confirms it', differentReporters && h3.body?.product?.stats?.current === 1000, h3.text.slice(0, 160));
    check('held reports are cleared once confirmed', d1(`SELECT COUNT(*) AS n FROM reports WHERE key = 'myntra:1700944'`)[0].n === 0);
    const withOffers = await observe('https://www.myntra.com/tshirts/hrx/x/3200001/buy', { ...shirt, offers: [{ title: 'Bank Offer', text: 'Call 99999 99999 for 90% off', count: null, code: 'SCAM90' }] }, '10.0.0.5');
    check('offers sent by a client are never stored or shown (on an ACCEPTED report)', withOffers.body?.recorded === 'accept' && withOffers.body?.product?.offers === null
      && d1(`SELECT COUNT(*) AS n FROM product_offers WHERE key = 'myntra:3200001'`)[0].n === 0, withOffers.text.slice(0, 160));

    if (!amazonPriced) skip('extension report on Amazon: accepted, cannot rename, queues a server re-check', amazonWhy);
    if (amazonPriced) {
      const amz = await observe('https://www.amazon.in/dp/B09X5DK382', { status: 'priced', title: 'HACKED TITLE', image: null, price: p.stats.current - 500, mrp: p.stats.currentMrp }, '10.0.0.3');
      check('extension report on Amazon is accepted (small change)', amz.body?.recorded === 'accept', amz.text.slice(0, 160));
      check('…but cannot rename the product', amz.body?.product?.title === p.title, amz.body?.product?.title);
      check('…and queues a server re-check (server has the last word)', d1(`SELECT last_attempt_at FROM products WHERE key = '${KEY}'`)[0].last_attempt_at === null);
    }
  }
  if (!live) {
    // ---- which config read it: recorded with every reading (§5 rule 5) and every telemetry report (§20)
    const MYNTRA_VERSION = bundledReader('myntra').version;
    const withVersion = await j('/api/observations', { method: 'POST', body: JSON.stringify({ url: MYNTRA, observed: { ...shirt, price: 1000, mrp: null }, configVersion: MYNTRA_VERSION, readerVersion: '0.3.0' }), headers: { 'cf-connecting-ip': '10.0.0.4' } });
    check('an extension report may say which config and version read it', withVersion.status === 200, withVersion.text.slice(0, 160));
    const healthRows = d1(`SELECT source, config_version, reader_version, outcome, n FROM reader_health WHERE store = 'myntra'`);
    check('…and reader health counts it under that config', healthRows.some((r) => r.source === 'extension' && r.config_version === MYNTRA_VERSION && r.reader_version === '0.3.0' && r.outcome === 'priced' && r.n === 1), JSON.stringify(healthRows));
    const badVersion = await j('/api/observations', { method: 'POST', body: JSON.stringify({ url: MYNTRA, observed: shirt, configVersion: '<script>' }) });
    check('…a malformed version is refused, naming the field', badVersion.status === 422 && /configVersion/.test(badVersion.body?.error?.message ?? ''), badVersion.text.slice(0, 160));
    const FK_VERSION = bundledReader('flipkart').version;
    const tel = await j('/api/telemetry', { method: 'POST', body: JSON.stringify({ feature: 'read', store: 2, outcome: 'unrecognised', configVersion: FK_VERSION, readerVersion: '0.3.0' }) });
    check('telemetry: "could not read this page" is counted (202)', tel.status === 202 && tel.body?.ok === true, tel.text.slice(0, 160));
    const tel2 = await j('/api/telemetry', { method: 'POST', body: JSON.stringify({ feature: 'read', store: 'flipkart', outcome: 'unrecognised', configVersion: FK_VERSION, readerVersion: '0.3.0', html: '<html>…' }) });
    check('…a second one adds to the same hourly row', tel2.status === 202 && d1(`SELECT n FROM reader_health WHERE store = 'flipkart' AND outcome = 'unrecognised'`)[0]?.n === 2);
    check('…and no page content is stored anywhere', d1(`SELECT COUNT(*) AS n FROM reader_health WHERE config_version LIKE '%<%' OR reader_version LIKE '%<%'`)[0].n === 0);
    check('telemetry refuses unknown outcomes and stores', (await j('/api/telemetry', { method: 'POST', body: JSON.stringify({ feature: 'read', store: 2, outcome: 'priced' }) })).status === 422
      && (await j('/api/telemetry', { method: 'POST', body: JSON.stringify({ feature: 'read', store: 'ebay', outcome: 'blocked' }) })).status === 422);
    const health = await j('/api/health/readers');
    const hAmazon = health.body?.stores?.find((x) => x.store === 'amazon');
    const hFk = health.body?.stores?.find((x) => x.store === 'flipkart');
    check('reader health: the server\'s own Amazon read is counted under the bundled config', hAmazon?.bySource?.server >= 1 && hAmazon?.byConfigVersion?.[AMAZON_VERSION] >= 1, JSON.stringify(hAmazon));
    check('…Flipkart shows 2 unrecognised of 2 (rate 1)', hFk?.reads === 2 && hFk?.byOutcome?.unrecognised === 2 && hFk?.failRate === 1, JSON.stringify(hFk));
    check('…the config log saw the bundled Amazon version', health.body?.configs?.some((c) => c.version === AMAZON_VERSION && c.origin === 'bundled'), JSON.stringify(health.body?.configs));
  }
  const badObs = await observe(MYNTRA, { status: 'priced', price: 305.5 });
  check('a report with fractional paise is refused', badObs.status === 422 && badObs.body?.error?.code === 'bad_observation');
  const badStatus = await observe(MYNTRA, { status: 'blocked' });
  check('a report that is not priced/unavailable is refused', badStatus.body?.error?.code === 'bad_observation');
  check('a report for an unsupported site is refused', (await observe('https://www.amazon.com/dp/B09X5DK382', shirt)).body?.error?.code === 'unsupported_store');

  // ---- refusals
  check('amazon.com is refused', (await post('https://www.amazon.com/dp/B09X5DK382')).body?.error?.code === 'unsupported_store');
  check('look-alike host is refused', (await post('https://amazon.in.evil.example/dp/B09X5DK382')).body?.error?.code === 'unsupported_store');
  check('a search page is not a product', (await post('https://www.amazon.in/s?k=pen')).body?.error?.code === 'not_a_product');
  const bad = await j('/api/products', { method: 'POST', body: '{nope' });
  check('bad JSON is a 400', bad.status === 400 && bad.body?.error?.code === 'bad_json');
  check('unknown product is 404 not_tracked', (await j('/api/products/amazon%3AB000000000')).body?.error?.code === 'not_tracked');
  check('malformed key is 400', (await j('/api/products/amazon%3Ax')).status === 400);
  check('unknown API route is JSON 404', (await j('/api/nope')).body?.error?.code === 'not_found');

  // ---- search, lists, stores
  if (!amazonPriced) skip('search finds it by title words', amazonWhy);
  if (amazonPriced) {
    const s = await j('/api/search?q=cello%20butterflow');
    check('search finds it by title words', s.body?.results?.some((r) => r.key === KEY), s.text.slice(0, 200));
  }
  check('search with only punctuation returns nothing, not an error', (await j('/api/search?q=%22%2A%29')).body?.results?.length === 0);
  const stores = await j('/api/stores');
  check('stores list carries the measured lines', stores.body?.stores?.length === STORE_IDS.length && stores.body.stores.every((s) => s.measured.length > 20));
  check('…and each store\'s number and https front page (Super Browse opens it)', stores.body?.stores?.every((s) => Number.isInteger(s.num) && /^https:\/\/[^/]+\/$/.test(s.home) && s.hosts.includes(new URL(s.home).hostname)), JSON.stringify(stores.body?.stores?.map((s) => [s.num, s.home])));
  check('…and one service per sector (rides, flights, hotels) for the app\'s Super Browse', JSON.stringify(stores.body?.services?.map((s) => s.sector)) === JSON.stringify(['ride', 'flight', 'hotel']) && stores.body.services.every((s) => s.hosts.includes(new URL(s.home).hostname)), JSON.stringify(stores.body?.services?.map((s) => s.id)));
  check('recent and deals answer', (await j('/api/recent')).status === 200 && (await j('/api/deals')).status === 200);
  const rh = await j('/api/health/readers');
  check('reader health answers for every store', rh.status === 200 && rh.body?.stores?.length === STORE_IDS.length && Array.isArray(rh.body?.warnings), rh.text.slice(0, 200));

  // ---- grocery compare (BLUEPRINT §12): computed from the shopper's own quotes, one address.
  // The quotes here are MADE UP (no grocery reader is verified yet); nothing is stored.
  const gp = await j('/api/grocery/platforms');
  check('grocery platforms are listed with what was measured', gp.status === 200 && gp.body?.platforms?.length === 8 && gp.body.platforms.every((p) => p.measured.length > 5));
  const quote = (platform, title, price, extra = {}) => ({ platform, address: '110001', title, brand: 'Amul', pack: null, price, mrp: null, inStock: true, at: Date.now(), ...extra });
  const gc = await j('/api/grocery/compare', { method: 'POST', body: JSON.stringify({ address: '110001', ref: { item: 'Amul Butter 500 g', brand: 'Amul', pack: '500 g' },
    quotes: [quote('blinkit', 'Amul Butter 500 g', 28500), quote('zepto', 'Amul Butter 500 g', 27900), quote('jiomart', 'Amul Butter 500 g', 25000, { address: '400001' })] }) });
  check('grocery compare: cheapest same item for THIS address; another address left out, said why', gc.status === 200 && gc.body?.comparison?.best === 'zepto'
    && gc.body.comparison.leftOut.some((l) => l.platform === 'jiomart' && /another delivery address/.test(l.reason)) && gc.body.comparison.rows[0].unitPrice.per === '100 g', gc.text.slice(0, 200));
  const gb = await j('/api/grocery/basket', { method: 'POST', body: JSON.stringify({ address: '110001', delivery: { blinkit: 2500 }, items: [
    { ref: { item: 'Amul Butter 500 g', brand: 'Amul', pack: '500 g' }, quotes: [quote('blinkit', 'Amul Butter 500 g', 28500), quote('zepto', 'Amul Butter 500 g', 27900)] },
    { ref: { item: 'Amul Taaza Milk 1 L', brand: 'Amul', pack: '1 L' }, quotes: [quote('blinkit', 'Amul Taaza Milk 1 L', 7400), quote('zepto', 'Amul Taaza Milk 500 ml', 3800)] },
  ] }) });
  check('grocery basket: complete basket first, delivery added only where read, nothing swapped', gb.status === 200 && gb.body?.totals?.[0]?.platform === 'blinkit' && gb.body.totals[0].total === 38400
    && gb.body.totals[1].missing.length === 1, gb.text.slice(0, 200));
  check('grocery compare refuses a missing address and bad quotes', (await j('/api/grocery/compare', { method: 'POST', body: JSON.stringify({ ref: { item: 'x' }, quotes: [] }) })).body?.error?.code === 'bad_address'
    && (await j('/api/grocery/compare', { method: 'POST', body: JSON.stringify({ address: '1', ref: { item: 'x' }, quotes: [quote('amazon', 'x', 100)] }) })).body?.error?.code === 'bad_quotes');

  // ---- "britto/<link>" prefix
  const pre = await j('/https://www.amazon.in/dp/B09X5DK382?tag=x');
  check('prefix form redirects to the product page', pre.status === 302 && pre.headers.get('location')?.endsWith('/p/amazon%3AB09X5DK382?add=1'), `${pre.status} ${pre.headers.get('location')}`);
  const pre2 = await j('/www.myntra.com/tshirts/x/y/1700944/buy');
  check('prefix form without https:// works too', pre2.status === 302 && pre2.headers.get('location')?.includes('/p/myntra%3A1700944'));
  const pg = await j(`/p/${encodeURIComponent(KEY)}`);
  check('/p/<key> serves the app', pg.status === 200 && pg.text.includes('id="app"'), `${pg.status} ${pg.headers.get('location') ?? ''}`);
  for (const path of ['/deals', '/stores', '/search?q=pen', '/browse', '/grocery', '/travel']) {
    const r = await j(path);
    check(`${path} serves the app`, r.status === 200 && r.text.includes('id="app"'), `${r.status} ${r.headers.get('location') ?? ''}`);
  }
  const bot = await j('/bot');
  check('/bot explains the crawler', bot.status === 200 && bot.text.includes('BrittoBot'), `${bot.status} ${bot.headers.get('location') ?? ''}`);
  const js = await j('/app.js');
  check('static files are served by name', js.status === 200 && js.text.includes('productPage'));
  check('a missing file is a plain 404, not the app', (await j('/nope.js')).status === 404);

  if (!live) {
    // ---- the scheduled re-check, through the real cron handler
    d1(`UPDATE products SET last_attempt_at = 1, last_checked_at = 1 WHERE key = '${KEY}'`);
    const sched = await fetch(`${base}/__scheduled?cron=*/5+*+*+*+*`);
    await sched.text();
    let row;
    for (let i = 0; i < 40; i++) {
      row = d1(`SELECT last_attempt_at, last_checked_at, last_status, fail_count FROM products WHERE key = '${KEY}'`)[0];
      if (row.last_attempt_at > 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    check('cron re-checked the overdue Amazon product', row.last_attempt_at > 1, JSON.stringify(row));
    const last = d1(`SELECT price, source FROM prices WHERE key = '${KEY}' ORDER BY at DESC LIMIT 1`)[0];
    if (amazonPriced) check('after an extension report, the server\'s own reading is the latest point', last?.source === 'server' && last.price === p.stats.current, JSON.stringify(last));
    else skip('after an extension report, the server\'s own reading is the latest point', amazonWhy);
    // ---- a D1 hot-fix (scripts/publish-reader.mjs): same recipe as revision 99. The dry run
    // must pass; the endpoint and the next server read must use it; clearing it goes back.
    const r99 = { ...bundledReader('amazon').config, revision: 99 };
    const candidate = join(state, 'amazon-r99.json');
    writeFileSync(candidate, JSON.stringify(r99, null, 2));
    let published = true;
    try { execFileSync('node', ['scripts/publish-reader.mjs', candidate, '--local', state], { cwd: ROOT, stdio: 'ignore' }); } catch { published = false; }
    check('publish-reader: a candidate that reads every saved page correctly is published', published);
    const r99served = await j('/api/config/reader?store=amazon');
    const R99 = r99served.body?.version ?? '';
    check('…the endpoint serves it at once (new version, new ETag)', /^amazon\.desktop\.r99\./.test(R99) && r99served.headers.get('etag') === `"${R99}"` && configFromServed(r99served.body).ok, R99);
    const broken = { ...r99, revision: 100, domRecipe: { ...r99.domRecipe, price: [{ selector: ['#corePriceDisplay_desktop_feature_div'], attribute: 'textContent' }] } };
    writeFileSync(candidate, JSON.stringify(broken));
    let refused = false;
    try { execFileSync('node', ['scripts/publish-reader.mjs', candidate, '--local', state], { cwd: ROOT, stdio: 'ignore' }); } catch { refused = true; }
    check('…a candidate that misreads a saved page is NOT published', refused && d1(`SELECT COUNT(*) AS n FROM reader_configs`)[0].n === 1);
    d1(`INSERT INTO reader_configs (store, device, created_at, json) VALUES ('amazon', 'desktop', ${Date.now() + 1000}, '{"schema":1,"store":"amazon","nonsense":true}')`);
    check('…an invalid newer row in D1 is skipped, never half-used', (await j('/api/config/reader?store=amazon')).body?.version === R99);

    // Second cron run on an unchanged page: write-on-change means zero new rows.
    const before = d1(`SELECT COUNT(*) AS n FROM prices WHERE key = '${KEY}'`)[0].n;
    d1(`UPDATE products SET last_attempt_at = 1 WHERE key = '${KEY}'`);
    await (await fetch(`${base}/__scheduled?cron=*/5+*+*+*+*`)).text();
    let row2;
    for (let i = 0; i < 40; i++) {
      row2 = d1(`SELECT last_attempt_at, last_status FROM products WHERE key = '${KEY}'`)[0];
      if (row2.last_attempt_at > 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const after = d1(`SELECT COUNT(*) AS n FROM prices WHERE key = '${KEY}'`)[0].n;
    check('an unchanged price adds no new row (write-on-change)', row2.last_attempt_at > 1 && (after === before || row2.last_status !== 'priced'), `${before} -> ${after} rows, status ${row2.last_status}`);
    const r99rows = d1(`SELECT source, outcome, n FROM reader_health WHERE store = 'amazon' AND config_version = '${R99}'`);
    check('…that server read used the hot-fix (reader health names revision 99)', r99rows.some((r) => r.source === 'server' && r.n >= 1), JSON.stringify(r99rows));
    check('…and the config log recorded it as a D1 override', d1(`SELECT origin FROM config_log WHERE version = '${R99}'`)[0]?.origin === 'd1');
    execFileSync('node', ['scripts/publish-reader.mjs', '--clear', 'amazon.desktop', '--local', state], { cwd: ROOT, stdio: 'ignore' });
    check('clearing the override serves the bundled reader again', (await j('/api/config/reader?store=amazon')).body?.version === AMAZON_VERSION);
    const fkRow = d1(`SELECT last_attempt_at FROM products WHERE key LIKE 'flipkart:%'`)[0];
    check('cron never fetches a store that refused us', fkRow.last_attempt_at == null, JSON.stringify(fkRow));

    // ---- deals filters and look-alikes, on MADE-UP rows in this throwaway local D1 only
    const now = Date.now();
    d1(`INSERT INTO products (key, store, pid, url, title, created_at, last_checked_at, price, in_stock, real_pct, sale_status) VALUES
      ('myntra:3100001', 'myntra', '3100001', 'https://www.myntra.com/3100001', 'HRX Men Yellow Printed Cotton T-shirt', ${now}, ${now}, 30000, 1, 0.25, 'real_drop'),
      ('myntra:3100002', 'myntra', '3100002', 'https://www.myntra.com/3100002', 'HRX Men Blue Printed Cotton T-shirt', ${now}, ${now}, 25000, 1, 0.08, 'real_drop'),
      ('myntra:3100003', 'myntra', '3100003', 'https://www.myntra.com/3100003', 'Roadster Women Printed Floral Dress', ${now}, ${now}, 10000, 1, null, 'no_real_drop'),
      ('nykaa:3100004', 'nykaa', '3100004', 'https://www.nykaa.com/x/p/3100004', 'Lakme Kajal', ${now}, ${now}, 20000, 1, 0.4, 'real_drop')`);
    d1(`INSERT INTO prices (key, at, price, mrp, in_stock, source) VALUES ('myntra:3100001', ${now - 50 * 86_400_000}, 40000, null, 1, 'server'), ('myntra:3100001', ${now - 86_400_000}, 30000, null, 1, 'server'), ('myntra:3100001', ${now - 200 * 86_400_000}, 99900, null, 1, 'server')`);
    const dAll = await j('/api/deals');
    check('deals: biggest real drop first, M.R.P. plays no part', dAll.body?.results?.map((r) => r.key).join() === 'nykaa:3100004,myntra:3100001,myntra:3100002', dAll.text.slice(0, 200));
    const dFil = await j('/api/deals?store=myntra&min=20');
    check('deals: filtered by store and by the smallest real drop', dFil.body?.results?.map((r) => r.key).join() === 'myntra:3100001', dFil.text.slice(0, 200));
    check('…each deal carries its last 90 days for a sparkline (older points left out)', dFil.body?.results?.[0]?.spark?.map((p) => p.price).join() === '40000,30000', JSON.stringify(dFil.body?.results?.[0]?.spark));
    check('deals: a bad filter is a 400', (await j('/api/deals?min=2')).body?.error?.code === 'bad_min' && (await j('/api/deals?store=ebay')).body?.error?.code === 'bad_store');
    d1(`INSERT INTO product_offers (key, at, json) VALUES ('myntra:3100001', ${now - 3_600_000}, '[{"title":"Bank Offer","text":"10% off with a made-up card","count":null}]'),
      ('myntra:3100002', ${now - 4 * 86_400_000}, '[{"title":"Old","text":"read four days ago","count":null}]')`);
    const fresh = (await j(`/api/products/${encodeURIComponent('myntra:3100001')}`)).body?.product?.offers;
    check('offers: the last server read is shown with when it was read', fresh?.at === now - 3_600_000 && fresh?.items?.[0]?.title === 'Bank Offer', JSON.stringify(fresh));
    check('…and offers read more than 3 days ago are not shown', (await j(`/api/products/${encodeURIComponent('myntra:3100002')}`)).body?.product?.offers === null);
    // Coupon votes (BLUEPRINT §15) on a MADE-UP code in this throwaway D1.
    d1(`UPDATE product_offers SET json = '[{"title":"10% off","text":"Use code BRITTOTEST10","count":null,"code":"BRITTOTEST10"}]' WHERE key = 'myntra:3100001'`);
    const vote = (body, ip) => j('/api/coupons/vote', { method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': ip } });
    const v1 = await vote({ store: 'myntra', code: 'BRITTOTEST10', worked: true }, '10.0.1.1');
    const v2 = await vote({ store: 'myntra', code: 'BRITTOTEST10', worked: false }, '10.0.1.1');
    const v3 = await vote({ store: 'myntra', code: 'BRITTOTEST10', worked: true }, '10.0.1.2');
    check('coupon votes: one per network (a second vote replaces the first), counted "N of M"', v1.body?.votes?.worked === 1 && v1.body.votes.total === 1
      && v2.body?.votes?.worked === 0 && v2.body.votes.total === 1 && v3.body?.votes?.worked === 1 && v3.body.votes.total === 2, [v1, v2, v3].map((x) => x.text).join(' | '));
    const shown = (await j(`/api/products/${encodeURIComponent('myntra:3100001')}`)).body?.product?.offers?.items?.[0];
    check('…shown with the code on the product', shown?.code === 'BRITTOTEST10' && shown?.votes?.worked === 1 && shown.votes.total === 2, JSON.stringify(shown));
    const unknown = await vote({ store: 'myntra', code: 'FREE100', worked: true }, '10.0.1.3');
    const elsewhere = await vote({ store: 'nykaa', code: 'BRITTOTEST10', worked: true }, '10.0.1.3');
    check('…a vote never brings in a code our server did not read on that store\'s page', unknown.status === 404 && unknown.body?.error?.code === 'unknown_code' && elsewhere.status === 404, `${unknown.status} ${elsewhere.status}`);
    const badVotes = await Promise.all([{ store: 'myntra', code: 'BRITTOTEST10', worked: 'yes' }, { store: 'ebay', code: 'BRITTOTEST10', worked: true }, { store: 'myntra', code: '<b>x</b>', worked: true }].map((b) => vote(b, '10.0.1.4')));
    check('…and a malformed vote is refused', badVotes.every((r) => r.status === 422 && r.body?.error?.code === 'bad_vote'), badVotes.map((r) => r.status).join());
    check('…nothing written for refused votes', d1(`SELECT COUNT(*) AS n FROM coupon_votes`)[0].n === 2);
    const sim = await j(`/api/products/${encodeURIComponent('myntra:3100001')}/similar`);
    const simKeys = sim.body?.results?.map((r) => r.key) ?? [];
    check('look-alikes: cheaper, in stock, sharing title words; not itself, not unrelated items', sim.status === 200 && simKeys.includes('myntra:3100002') && !simKeys.includes('myntra:3100001') && !simKeys.includes('myntra:3100003')
      && sim.body.results.every((r) => r.price < 30000 && r.inStock) && /not the same product/.test(sim.body?.basis ?? ''), sim.text.slice(0, 200));
    check('look-alikes of an untracked product: 404', (await j(`/api/products/${encodeURIComponent('myntra:3199999')}/similar`)).status === 404);

    // ---- rate limit on adding new products (Myntra ids: no fetch is made for them)
    let lastStatus = 0;
    let allowed = 6; // amazon + vijaysales + reliancedigital + nykaa + shopclues + flipkart above (the Myntra report came from another network: its own limit)
    for (let i = 0; allowed < 30 && i < 40; i++) {
      lastStatus = (await post(`https://www.myntra.com/${1000001 + i}`)).status;
      if (lastStatus === 201) allowed++;
    }
    const over = await post('https://www.myntra.com/2000001');
    check('the 31st new product in an hour is refused', allowed === 30 && over.status === 429 && over.body?.error?.code === 'rate_limited', `${allowed} allowed, then ${over.status}`);
    check('…but already-tracked products still open', (await post('amazon.in/dp/B09X5DK382')).status === 200);
  }
} finally {
  stop();
}

console.log(`\n${pass} passed, ${failCount} failed${skipped.length ? `, ${skipped.length} NOT verified here (SKIP above)` : ''}`);
process.exit(failCount ? 1 : 0);
