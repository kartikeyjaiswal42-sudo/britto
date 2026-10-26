// Live proof of browser notifications: real Chrome subscribes on the DEPLOYED site through
// Google's push service, the production Worker signs and encrypts a test message with its
// secret VAPID key, and the page's service worker receives it. Then it cleans up after
// itself (the subscription through the API; the empty test owner row through D1).
//
//   PW_DIR=<playwright-core dir> node scripts/push-live.mjs https://britto.amitynoidalibrary.workers.dev
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!base.startsWith('https://')) throw new Error('usage: push-live.mjs https://…');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_DIR ?? 'playwright-core');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${String(detail).slice(0, 300)}` : ''}`);
};

const profile = mkdtempSync(join(tmpdir(), 'britto-live-push-'));
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
let token = null;
try {
  await ctx.grantPermissions(['notifications'], { origin: base });
  const page = await ctx.newPage();
  await page.goto(`${base}/alerts`, { waitUntil: 'networkidle' });
  const cfg = await page.evaluate(() => fetch('/api/config').then((r) => r.json()));
  check('the live site has push switched on', typeof cfg.push?.publicKey === 'string', JSON.stringify(cfg));

  // Register this browser and subscribe it, exactly as the page's button does.
  const sub = await page.evaluate(async (publicKey) => {
    const reg = await fetch('/api/me', { method: 'POST' }).then((r) => r.json());
    localStorage.setItem('britto.device', reg.token);
    const sw = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
    const s = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const saved = await fetch('/api/me/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${reg.token}` },
      body: JSON.stringify({ subscription: s.toJSON() }),
    }).then((r) => r.json());
    return { token: reg.token, host: new URL(s.endpoint).host, push: saved.me?.push };
  }, cfg.push.publicKey);
  token = sub.token;
  check('real Chrome subscribed through Google\'s push service, and the site saved it', sub.host === 'fcm.googleapis.com' && sub.push === 1, JSON.stringify({ ...sub, token: undefined }));

  const arrived = page.evaluate(() => new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'britto-push') resolve(e.data.message); });
    setTimeout(() => resolve(null), 45_000);
  }));
  const sent = await page.evaluate((t) => fetch('/api/me/test', { method: 'POST', headers: { authorization: `Bearer ${t}` } }).then((r) => r.json()), token);
  const msg = await arrived;
  check('the production Worker\'s push was accepted by Google', sent.result?.push?.sent === 1, JSON.stringify(sent));
  check('…and arrived in the browser, decrypted, with the alerts link', msg?.title === 'Britto test' && msg.url === `${base}/alerts`, JSON.stringify(msg));

  const off = await page.evaluate(async (t) => {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const s = await reg.pushManager.getSubscription();
    const res = await fetch('/api/me/push', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
      body: JSON.stringify({ subscription: s.toJSON() }),
    }).then((r) => r.json());
    await s.unsubscribe();
    return res.me?.push;
  }, token);
  check('cleanup: the test subscription is removed', off === 0, String(off));
} finally {
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
  if (token) {
    // The test owner has no alerts and no channels left; remove the row itself too.
    const hash = createHash('sha256').update(token).digest('hex');
    execFileSync(join(ROOT, 'node_modules/.bin/wrangler'), ['d1', 'execute', 'britto', '--remote', '--command', `DELETE FROM owners WHERE token_hash = '${hash}' AND telegram_chat IS NULL AND NOT EXISTS (SELECT 1 FROM alerts WHERE owner = owners.id)`], { cwd: ROOT, stdio: 'ignore' });
    const left = JSON.parse(execFileSync(join(ROOT, 'node_modules/.bin/wrangler'), ['d1', 'execute', 'britto', '--remote', '--json', '--command', `SELECT COUNT(*) AS n FROM owners WHERE token_hash = '${hash}'`], { cwd: ROOT, encoding: 'utf8' }))[0].results[0].n;
    check('cleanup: the test owner row is gone from the live database', left === 0, String(left));
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
