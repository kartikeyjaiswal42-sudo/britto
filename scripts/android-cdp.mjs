// Drive the Britto app's WebViews on an Android device/emulator over the DevTools protocol
// (debug builds are debuggable, so each WebView exposes a devtools socket). Used to test the
// real app on Android (HISTORY 2026-10-29). First forward the socket:
//   adb forward tcp:9223 localabstract:$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | sort -u | tail -1)
// then:
//   node scripts/android-cdp.mjs 9223 targets
//   node scripts/android-cdp.mjs 9223 eval <url-substring> '<js expression>'
//   node scripts/android-cdp.mjs 9223 nav <url-substring> <url>
//   node scripts/android-cdp.mjs 9223 save <url-substring> <file>   (the same bytes as the app's "Save page")
// Every command gives up after 25 s (a page that never answers must not hang a test).
import { writeFileSync } from 'node:fs';

const [port, cmd, match = '', arg] = process.argv.slice(2);
setTimeout(() => { console.log('TIMEOUT (the page did not answer in 25 s)'); process.exit(3); }, 25_000);

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
if (cmd === 'targets') {
  for (const t of targets) console.log(`${t.type}\t${t.url.slice(0, 120)}\t${(t.title ?? '').slice(0, 40)}`);
  process.exit(0);
}
const t = targets.find((x) => x.type === 'page' && x.url.includes(match));
if (!t) { console.log(`no page target matching "${match}"`); process.exit(2); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
const send = (method, params = {}) => new Promise((resolve) => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return `EXCEPTION ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`;
  return r.result?.result?.value;
};

if (cmd === 'eval') {
  const v = await evaluate(arg);
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
} else if (cmd === 'nav') {
  console.log(JSON.stringify((await send('Page.navigate', { url: arg })).result));
} else if (cmd === 'save') {
  // StoreActivity.savePage(): "<!-- saved by the Britto app from URL -->\n" + documentElement.outerHTML
  const html = await evaluate('document.documentElement.outerHTML');
  writeFileSync(arg, `<!-- saved by the Britto app from ${t.url.replace(/--/g, '')} -->\n${html}`);
  console.log(`${html.length} chars from ${t.url.slice(0, 100)} -> ${arg}`);
} else {
  console.log('usage: targets | eval <match> <js> | nav <match> <url> | save <match> <file>');
}
ws.close();
process.exit(0);
