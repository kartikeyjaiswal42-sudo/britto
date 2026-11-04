// The Britto app on an Android emulator on GitHub's computers (.github/workflows/phone.yml), so
// the owner's 8 GB laptop never runs one. Drives the app's OWN page (Britto's site, served by a
// local `wrangler dev` on the runner) over the WebView's DevTools, like a person would:
//   Travel → Cabs → "Use my current location" (Android's permission dialog answered "While using
//   the app") → type the drop → pick the phone's own suggestion → Compare cabs.
// Uber and Rapido are opened for real by the app; on a fresh emulator nobody is logged in, so
// each should say "log in", never crash or hang. Nothing is ever tapped on a ride site's page.
// Screenshots and results.json go to phone-ci/ (uploaded as the run's "phone-ci" artifact).
//   node scripts/phone-ci.mjs <apk> [site port, default 8799]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [apk, port = '8799'] = process.argv.slice(2);
if (!apk) throw new Error('usage: phone-ci.mjs <apk> [port]');
const OUT = 'phone-ci';
mkdirSync(OUT, { recursive: true });
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const shot = (name) => writeFileSync(`${OUT}/${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let failed = 0;
const check = (name, ok, got) => {
  results.push({ name, ok: !!ok, got });
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(got)?.slice(0, 300)})`}`);
};

adb('install', '-r', apk);
adb('reverse', `tcp:${port}`, `tcp:${port}`);
// Amity University, Noida (gate 3): the emulator's GPS says the phone is there.
adb('emu', 'geo', 'fix', '77.3331', '28.5442');
adb('shell', 'am', 'start', '-n', 'app.britto.dev/app.britto.MainActivity');

// The WebView's DevTools socket (debug builds only).
let sock = null;
for (let i = 0; i < 60 && !sock; i++) {
  await sleep(2000);
  const pid = adb('shell', 'pidof', 'app.britto.dev').trim();
  if (pid && adb('shell', 'cat', '/proc/net/unix').includes(`webview_devtools_remote_${pid}`)) sock = `webview_devtools_remote_${pid}`;
}
if (!sock) throw new Error('the app\'s WebView never opened');
adb('forward', 'tcp:9223', `localabstract:${sock}`);
let target = null;
for (let i = 0; i < 30 && !target; i++) {
  await sleep(2000);
  const list = await (await fetch('http://127.0.0.1:9223/json')).json().catch(() => []);
  target = list.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${port}`));
}
if (!target) throw new Error('Britto\'s page never loaded in the app');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
  pending.get(m.id)?.(m);
  pending.delete(m.id);
};
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable');
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
  return r.result?.result?.value;
};
const until = async (expression, ms, every = 500) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await ev(expression).catch(() => null);
    if (v) return v;
    await sleep(every);
  }
  return null;
};
/** Taps an Android system button (the permission dialog) by its own id or text, never by guessing. */
function tapSystem(ids, texts) {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('shell', 'cat', '/sdcard/ui.xml');
  for (const node of xml.match(/<node [^>]*>/g) ?? []) {
    const rid = /resource-id="([^"]*)"/.exec(node)?.[1] ?? '';
    const text = /text="([^"]*)"/.exec(node)?.[1] ?? '';
    if (!ids.includes(rid) && !texts.includes(text)) continue;
    const [, x1, y1, x2, y2] = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node).map(Number);
    adb('shell', 'input', 'tap', String((x1 + x2) >> 1), String((y1 + y2) >> 1));
    return `${rid || text}`;
  }
  return null;
}

try {
  await ev(`history.pushState(null, '', '/travel#cabs'); dispatchEvent(new PopStateEvent('popstate')); 1`);
  check('Travel opens on Cabs in the app, with pickup, drop and the ride apps', await until(`!!document.querySelector('#panel-cabs:not([hidden]) #ride-compare [name=pickup]') && document.querySelectorAll('#ride-apps li[data-app]').length === 2`, 20000));
  shot('01-cabs');

  // "Use my current location": Android asks; answer "While using the app".
  await ev(`document.querySelector('#ride-compare button[aria-label="Use my current location"]').click(), 1`);
  let tapped = null;
  for (let i = 0; i < 10 && !tapped; i++) {
    await sleep(1500);
    tapped = tapSystem(['com.android.permissioncontroller:id/permission_allow_foreground_only_button', 'com.android.permissioncontroller:id/permission_allow_one_time_button'], ['While using the app', 'Only this time']);
  }
  check('Android asked for the location (and only when the button was tapped)', !!tapped, tapped);
  const pickup = await until(`(() => { const i = document.querySelector('#ride-compare [name=pickup]'); return i.value && !/Finding/.test(i.placeholder) ? i.value : null; })()`, 40000);
  const status = await ev(`document.querySelector('#ride-compare .form-status').textContent`);
  check('the pickup is filled from the phone\'s location', !!pickup, { pickup, status });
  shot('02-pickup');

  // The drop: typed like a person, then the phone's own place suggestion.
  await ev(`(() => { const i = document.querySelector('#ride-compare [name=drop]'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Noida Sector 18 metro station'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  const suggestions = await until(`(() => { const l = [...document.querySelectorAll('#place-list:not([hidden]) .place b')].map((b) => b.textContent); return l.length ? l : null; })()`, 30000);
  check('the phone suggests places for the typed drop', suggestions?.length > 0, suggestions);
  shot('03-suggestions');
  if (suggestions) await ev(`document.querySelector('#place-list .place').click(), 1`);
  else await ev(`document.querySelector('#ride-compare [name=drop]').blur(), 1`);

  await ev(`document.querySelector('#ride-compare button.go').click(), 1`);
  const done = await until(`/Checked on your phone just now/.test(document.querySelector('#ride-compare-out')?.innerText ?? '')`, 150000, 2000);
  const sites = await ev(`[...document.querySelectorAll('#ride-compare-out .fare-sites li[data-site]')].map((li) => ({ site: li.dataset.site, status: li.dataset.status, text: li.innerText.replace(/\\s+/g, ' ').slice(0, 160) }))`);
  check('Compare cabs finished for Uber and Rapido (no hang)', done && ['uber', 'rapido'].every((s) => sites.some((x) => x.site === s)), sites);
  check('each app says where it stands (fares, or log in), never blank', sites.every((x) => x.text.length > 8), sites);
  const rides = await ev(`[...document.querySelectorAll('#ride-compare-out .ride-list li')].map((li) => li.innerText.replace(/\\s+/g, ' '))`);
  results.push({ name: 'rides listed (info)', ok: true, got: rides });
  shot('04-compare');
  const apps = await ev(`(() => { try { return JSON.parse(localStorage.getItem('britto.rideApps')); } catch { return null; } })()`);
  results.push({ name: 'ride apps state kept on the phone (info)', ok: true, got: apps });

  // Ride to the airport in the app: the same location, now allowed, goes into Uber's link only.
  await ev(`(() => { const i = document.querySelector('#rides [name=rideTo]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'DEL · New Delhi'); document.querySelector('#rides button[type=submit]').click(); return 1; })()`);
  const rideLink = await until(`document.querySelector('#ride-links li[data-site=uber] a')?.href ?? null`, 30000);
  check('ride to the airport: an Uber link from the phone\'s location', /pickup=.*28\.54/.test(decodeURIComponent(rideLink ?? '')), rideLink);
  shot('05-airport');
  check('no script errors on Britto\'s page', errors.length === 0, errors);
} catch (e) {
  check('the run itself', false, String(e?.stack ?? e));
  try { shot('zz-error'); } catch { /* the phone is gone */ }
} finally {
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT}/logcat.txt`, (() => { try { return adb('logcat', '-d', '-t', '3000'); } catch { return ''; } })());
  ws.close();
}
console.log(`\n${results.filter((r) => r.ok).length} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
