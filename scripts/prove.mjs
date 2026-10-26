// End-to-end proof against the REAL Worker: local (`node scripts/prove.mjs`, throwaway D1,
// wrangler dev in its own process group) or deployed (`node scripts/prove.mjs --live <url>`,
// read-mostly: it adds at most two products and never touches the database directly).
// It makes one real request to amazon.in per run (the product being tracked).
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const live = process.argv.includes('--live');
const AMAZON = 'https://www.amazon.in/Cello-Butterflow-Simply-Ball-Pen/dp/B09X5DK382/ref=sr_1_5?crid=ABC&keywords=pen&tag=junk-21';
const KEY = 'amazon:B09X5DK382';

let pass = 0;
let failCount = 0;
function check(name, ok, detail = '') {
  if (ok) pass++;
  else failCount++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${detail}` : ''}`);
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
  child = spawn(WRANGLER, ['dev', '--local', '--persist-to', state, '--port', String(port), '--ip', '127.0.0.1', '--test-scheduled', '--show-interactive-dev-session=false'], {
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
  if (Number.isInteger(p?.stats?.current)) {
    check('title came from the page', /Cello/i.test(p.title ?? ''), p.title);
    check('one price point recorded', p.points.length >= 1 && p.points.at(-1).source === 'server');
    check('a brand-new product is "too early", never a confident call', p.verdict.kind === 'too_early' && p.sale.status === 'too_early');
    console.log(`       read: ${p.title?.slice(0, 50)}… ₹${p.stats.current / 100} (M.R.P. ₹${(p.stats.currentMrp ?? 0) / 100})`);
  } else {
    console.log(`       NOT priced: ${p?.pending}`);
  }

  const again = await post('amazon.in/dp/B09X5DK382');
  check('the same product again is not re-created', again.status === 200 && again.body?.created === false);

  const view = await j(`/api/products/${encodeURIComponent(KEY)}`);
  check('product view by key', view.status === 200 && view.body?.product?.key === KEY);

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

    if (Number.isInteger(p?.stats?.current)) {
      const amz = await observe('https://www.amazon.in/dp/B09X5DK382', { status: 'priced', title: 'HACKED TITLE', image: null, price: p.stats.current - 500, mrp: p.stats.currentMrp }, '10.0.0.3');
      check('extension report on Amazon is accepted (small change)', amz.body?.recorded === 'accept', amz.text.slice(0, 160));
      check('…but cannot rename the product', amz.body?.product?.title === p.title, amz.body?.product?.title);
      check('…and queues a server re-check (server has the last word)', d1(`SELECT last_attempt_at FROM products WHERE key = '${KEY}'`)[0].last_attempt_at === null);
    }
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
  if (Number.isInteger(p?.stats?.current)) {
    const s = await j('/api/search?q=cello%20butterflow');
    check('search finds it by title words', s.body?.results?.some((r) => r.key === KEY), s.text.slice(0, 200));
  }
  check('search with only punctuation returns nothing, not an error', (await j('/api/search?q=%22%2A%29')).body?.results?.length === 0);
  const stores = await j('/api/stores');
  check('stores list carries the measured lines', stores.body?.stores?.length === 3 && stores.body.stores.every((s) => s.measured.length > 20));
  check('recent and deals answer', (await j('/api/recent')).status === 200 && (await j('/api/deals')).status === 200);

  // ---- "britto/<link>" prefix
  const pre = await j('/https://www.amazon.in/dp/B09X5DK382?tag=x');
  check('prefix form redirects to the product page', pre.status === 302 && pre.headers.get('location')?.endsWith('/p/amazon%3AB09X5DK382?add=1'), `${pre.status} ${pre.headers.get('location')}`);
  const pre2 = await j('/www.myntra.com/tshirts/x/y/1700944/buy');
  check('prefix form without https:// works too', pre2.status === 302 && pre2.headers.get('location')?.includes('/p/myntra%3A1700944'));
  const pg = await j(`/p/${encodeURIComponent(KEY)}`);
  check('/p/<key> serves the app', pg.status === 200 && pg.text.includes('id="app"'), `${pg.status} ${pg.headers.get('location') ?? ''}`);
  for (const path of ['/deals', '/stores', '/search?q=pen']) {
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
    check('after an extension report, the server\'s own reading is the latest point', last.source === 'server' && last.price === p.stats.current, JSON.stringify(last));
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
    const fkRow = d1(`SELECT last_attempt_at FROM products WHERE key LIKE 'flipkart:%'`)[0];
    check('cron never fetches a store that refused us', fkRow.last_attempt_at == null, JSON.stringify(fkRow));

    // ---- rate limit on adding new products (Myntra ids: no fetch is made for them)
    let lastStatus = 0;
    let allowed = 2; // amazon + flipkart above (the Myntra report came from another network: its own limit)
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

console.log(`\n${pass} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
