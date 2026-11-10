// The deal score on the product page, in REAL Chrome against a real local Worker:
//   PW_DIR=<playwright-core dir> node scripts/score-browser.mjs
// A throwaway local D1 is given three MADE-UP price histories (a real drop, a price that never
// moved, a hike then a "drop") plus one too new to score. The checks read what is DRAWN: the
// number, the three parts and their points, the bar's computed width, and that the parts shown
// add up to the score shown. Nothing is fetched from any store.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testConfig } from './test-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require(process.env.PW_DIR ?? 'playwright-core'); } catch { return require('playwright'); } })();

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${detail}` : ''}`);
};

const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const API = `http://127.0.0.1:${port}`;
const state = mkdtempSync(join(tmpdir(), 'britto-score-'));
const cfg = testConfig();
execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--config', cfg, '--local', '--persist-to', state, '--file', 'api/schema.sql'], { cwd: ROOT, stdio: 'ignore' });
const d1 = (sql) => execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--config', cfg, '--local', '--persist-to', state, '--json', '--command', sql], { cwd: ROOT, encoding: 'utf8' });

const DAY = 86_400_000;
const now = Date.now();
// key, title, [daysAgo, paise][] oldest first. Same shapes as core/core.test.ts "score:" tests.
const seeded = [
  ['myntra:4100001', 'Made-up shirt with a real drop', [[41, 100000], [1, 80000]]],
  ['myntra:4100002', 'Made-up shirt whose price never moved', [[30, 30500]]],
  ['myntra:4100003', 'Made-up shirt raised before its sale', [[63, 100000], [13, 130000], [1, 99900]]],
  ['myntra:4100004', 'Made-up shirt first seen three days ago', [[3, 50000]]],
];
for (const [key, title, pts] of seeded) {
  const pid = key.split(':')[1];
  const last = pts[pts.length - 1][1];
  d1(`INSERT INTO products (key, store, pid, url, title, created_at, last_checked_at, price, in_stock) VALUES ('${key}', 'myntra', '${pid}', 'https://www.myntra.com/${pid}', '${title}', ${now - pts[0][0] * DAY}, ${now}, ${last}, 1)`);
  d1(`INSERT INTO prices (key, at, price, mrp, in_stock, source) VALUES ${pts.map(([ago, p]) => `('${key}', ${now - ago * DAY}, ${p}, null, 1, 'server')`).join(', ')}`);
}

const worker = spawn(WRANGLER, ['dev', '--config', cfg, '--local', '--persist-to', state, '--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false'], { cwd: ROOT, detached: true, stdio: 'ignore' });
let browser;
try {
  for (const until = Date.now() + 60_000; ;) {
    try { if ((await fetch(`${API}/api/health`)).ok) break; } catch { /* starting */ }
    if (Date.now() > until) throw new Error('wrangler dev did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  console.log(`browser: ${browser.version()}`);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  /** What the product page draws for the score. */
  const drawn = async (key) => {
    await page.goto(`${API}/p/${encodeURIComponent(key)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.verdict h2');
    return page.evaluate(() => {
      const el = document.querySelector('.deal-score');
      if (!el) return null;
      const bar = el.querySelector('.score-bar');
      const fill = el.querySelector('.score-fill');
      return {
        attr: el.getAttribute('data-score'),
        num: el.querySelector('.score-num')?.firstChild?.textContent ?? null,
        head: el.querySelector('.score-head strong')?.textContent ?? el.querySelector('strong')?.textContent ?? null,
        band: [...el.classList].filter((c) => c !== 'deal-score').join(' '),
        parts: [...el.querySelectorAll('.score-parts li')].map((li) => ({ id: li.getAttribute('data-part'), label: li.firstElementChild.textContent, pts: li.querySelector('.pts').textContent })),
        fillShare: bar && fill ? fill.getBoundingClientRect().width / bar.getBoundingClientRect().width : null,
        fillColor: fill ? getComputedStyle(fill).backgroundColor : null,
        text: el.innerText,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
  };
  const points = (d) => d.parts.map((p) => Number(/^(\d+) of (\d+)$/.exec(p.pts)?.[1]));
  const maxes = (d) => d.parts.map((p) => Number(/^(\d+) of (\d+)$/.exec(p.pts)?.[2]));
  const sum = (a) => a.reduce((n, x) => n + x, 0);

  const drop = await drawn('myntra:4100001');
  check('real drop: the page shows 99 and "Great deal"', drop?.num === '99' && /Great deal/.test(drop.head ?? ''), JSON.stringify(drop));
  check('…with its three parts and their points: 50, 34, 15', drop && points(drop).join() === '50,34,15' && maxes(drop).join() === '50,35,15', JSON.stringify(drop?.parts));
  check('…the parts shown add up to the number shown', drop && sum(points(drop)) === Number(drop.num));
  check('…each part carries its own numbers', drop && /20% below its usual price \(₹1,000\)/.test(drop.parts[0].label) && /cost more than today 98% of the time/.test(drop.parts[1].label), JSON.stringify(drop?.parts));
  check('…the bar is filled to 99% of its width (measured)', drop && Math.abs(drop.fillShare - 0.99) < 0.01, String(drop?.fillShare));
  check('…and the page does not scroll sideways at 390 px', drop && drop.overflow === false);

  const flat = await drawn('myntra:4100002');
  check('a price that never moved: 40, "Fair price", not a deal', flat?.num === '40' && /Fair price/.test(flat.head ?? '') && points(flat).join() === '25,0,15', JSON.stringify(flat));
  check('…its bar is 40% wide and a different colour from the great deal\'s', flat && Math.abs(flat.fillShare - 0.40) < 0.01 && flat.fillColor !== drop?.fillColor, `${flat?.fillShare} ${flat?.fillColor} vs ${drop?.fillColor}`);

  const hike = await drawn('myntra:4100003');
  check('raised before its sale: 59, under the "good" line, and the page says why', hike?.num === '59' && points(hike).join() === '25,34,0' && /Raised to ₹1,300 on .* before this "drop"/.test(hike.parts[2].label), JSON.stringify(hike));
  check('…the parts shown add up to the number shown', hike && sum(points(hike)) === Number(hike.num));

  const young = await drawn('myntra:4100004');
  check('three days of prices: no score is drawn at all (the verdict already says too early)', young === null, JSON.stringify(young));
  check('…and the verdict says so', /Too early to judge/.test(await page.locator('.verdict h2').innerText()));

  const apiView = await (await fetch(`${API}/api/products/${encodeURIComponent('myntra:4100004')}`)).json();
  check('the API gives that product score null with no parts, never a guess', apiView.product?.score?.score === null && apiView.product.score.parts.length === 0, JSON.stringify(apiView.product?.score));
  check('no script error on any of the four pages', errors.length === 0, errors.join(' | '));
} finally {
  await browser?.close().catch(() => {});
  try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ }
  rmSync(state, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
