// End-to-end proof of alerts (S3) against the REAL Worker in wrangler dev, a throwaway D1, a
// fake Telegram Bot API and a fake push service. The fake push service DECRYPTS every message
// with the subscribing browser's private key and checks the VAPID signature, so "a push was
// sent" means a browser could have read it. Makes one real request to amazon.in.
//
//   node scripts/alerts.mjs                      API checks
//   PW_DIR=<playwright-core dir> node scripts/alerts.mjs --browser    + real Chrome (UI, real FCM push)
import { spawn, execFileSync } from 'node:child_process';
import { createDecipheriv, createECDH, createHash, createPublicKey, hkdfSync, randomBytes, verify, webcrypto } from 'node:crypto';
import { createServer as createHttp } from 'node:http';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const TOKEN = '123456:TEST-token-for-a-fake-telegram';
const BLOCKED_CHAT = 403403;
const MYNTRA = 'https://www.myntra.com/tshirts/hrx/x/1700944/buy';
const SHIRT = 'myntra:1700944';
const AMAZON = 'https://www.amazon.in/dp/B09X5DK382';

let pass = 0;
let failCount = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : failCount++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${String(detail).slice(0, 300)}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(200);
  }
}
async function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// ---------------------------------------------------------------- fake Telegram Bot API
const tgCalls = [];
const tg = createHttp((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? '');
    const payload = body ? JSON.parse(body) : {};
    tgCalls.push({ token: m?.[1], method: m?.[2], body: payload });
    res.setHeader('content-type', 'application/json');
    if (m?.[1] !== TOKEN) return res.end(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }));
    if (m[2] === 'getMe') return res.end(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: 'BrittoTestBot' } }));
    if (m[2] === 'sendMessage' && payload.chat_id === BLOCKED_CHAT) return res.end(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }));
    res.end(JSON.stringify({ ok: true, result: true }));
  });
});
const sentTo = (chat, from = 0) => tgCalls.slice(from).filter((c) => c.method === 'sendMessage' && c.body.chat_id === chat);

// ---------------------------------------------------------------- fake push service
const pushes = [];
const push = createHttp((req, res) => {
  const chunks = [];
  req.on('data', (d) => chunks.push(d));
  req.on('end', () => {
    pushes.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    res.statusCode = req.url === '/push/gone' ? 410 : 201;
    res.end();
  });
});

/** A browser's side of a subscription, and decryption written with node:crypto. */
function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { ecdh, auth: randomBytes(16) };
}
function decrypt(body, { ecdh, auth }) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ikm = Buffer.from(hkdfSync('sha256', ecdh.computeSecret(asPublic), auth, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const data = body.subarray(21 + idlen);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, plain.length - 1).toString('utf8'));
}
function vapidOk(header, publicKey, audience) {
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header ?? '');
  if (!m || m[4] !== publicKey) return false;
  const raw = Buffer.from(publicKey, 'base64url');
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(raw.subarray(1, 33)), y: b64url(raw.subarray(33)) }, format: 'jwk' });
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
  return claims.aud === audience && claims.exp > Date.now() / 1000 && verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url'));
}

// ---------------------------------------------------------------- the Worker
const [port, tgPort, pushPort] = [await freePort(), await freePort(), await freePort()];
await new Promise((r) => tg.listen(tgPort, '127.0.0.1', r));
await new Promise((r) => push.listen(pushPort, '127.0.0.1', r));
const base = `http://127.0.0.1:${port}`;
const pushOrigin = `http://127.0.0.1:${pushPort}`;

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const VAPID_PUBLIC = b64url(await webcrypto.subtle.exportKey('raw', pair.publicKey));
const VAPID_JWK = JSON.stringify(await webcrypto.subtle.exportKey('jwk', pair.privateKey));

const state = mkdtempSync(join(tmpdir(), 'britto-alerts-'));
const envFile = join(state, 'test.env');
writeFileSync(envFile, [
  `SITE_URL=${base}`,
  `TELEGRAM_BOT_TOKEN=${TOKEN}`,
  `TELEGRAM_API=http://127.0.0.1:${tgPort}`,
  `VAPID_PUBLIC_KEY=${VAPID_PUBLIC}`,
  `VAPID_PRIVATE_JWK='${VAPID_JWK}'`,
  `PUSH_TEST_ORIGIN=${pushOrigin}`,
].join('\n'));
execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--local', '--persist-to', state, '--file', 'api/schema.sql'], { cwd: ROOT, stdio: 'ignore' });
const child = spawn(WRANGLER, ['dev', '--local', '--persist-to', state, '--port', String(port), '--ip', '127.0.0.1', '--test-scheduled', '--env-file', envFile, '--show-interactive-dev-session=false'], {
  cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });
const stop = () => {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
  tg.close();
  push.close();
  rmSync(state, { recursive: true, force: true });
};
process.on('SIGINT', () => { stop(); process.exit(130); });
if (!(await until(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, 60_000))) {
  console.log(log);
  stop();
  throw new Error('wrangler dev did not start');
}

const api = async (path, { method = 'GET', body, token, ip } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const d1 = (sql) => JSON.parse(execFileSync(WRANGLER, ['d1', 'execute', 'britto', '--local', '--persist-to', state, '--json', '--command', sql], { cwd: ROOT, encoding: 'utf8' }))[0].results;
const SECRET = createHash('sha256').update(`britto-webhook:${TOKEN}`).digest('hex').slice(0, 48);
let updateId = 1;
const hook = (update, secret = SECRET) => fetch(`${base}/api/telegram/webhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
  body: JSON.stringify({ update_id: updateId++, ...update }),
});
const say = async (chat, text) => { const from = tgCalls.length; await hook({ message: { message_id: updateId, chat: { id: chat, type: 'private' }, text } }); return sentTo(chat, from).map((c) => c.body); };
const press = async (chat, data) => {
  const from = tgCalls.length;
  await hook({ callback_query: { id: `cb${updateId}`, from: { id: chat }, message: { message_id: 1, chat: { id: chat, type: 'private' } }, data } });
  return tgCalls.slice(from);
};
const observe = (url, observed, ip) => api('/api/observations', { method: 'POST', body: { url, observed }, ip });
const buttons = (m) => (m?.reply_markup?.inline_keyboard ?? []).flat();
const shirt = (price) => ({ status: 'priced', title: 'HRX Men Yellow Printed T-shirt', image: null, price, mrp: 69900 });

try {
  console.log(`Proving alerts on ${base} (local wrangler dev, fake Telegram :${tgPort}, fake push :${pushPort})`);

  // ---- A. channels switch themselves on
  const cfg = await api('/api/config');
  check('config names the bot and the push key', cfg.body?.telegram?.bot === 'BrittoTestBot' && cfg.body?.push?.publicKey === VAPID_PUBLIC && cfg.body?.maxAlerts === 50, JSON.stringify(cfg.body));
  const setHook = tgCalls.find((c) => c.method === 'setWebhook');
  check('the bot\'s webhook was registered with a secret derived from the token', setHook?.body?.url === `${base}/api/telegram/webhook` && setHook.body.secret_token === SECRET && setHook.body.allowed_updates?.includes('callback_query'), JSON.stringify(setHook?.body));
  await api('/api/config');
  check('…once (the second request reads it from D1)', tgCalls.filter((c) => c.method === 'getMe').length === 1);
  check('a webhook call with the wrong secret is refused', (await hook({ message: { chat: { id: 1, type: 'private' }, text: '/start' } }, 'wrong')).status === 401);
  check('…and one with no secret', (await hook({ message: { chat: { id: 1, type: 'private' }, text: '/start' } }, null)).status === 401);
  check('…and neither reached the bot', sentTo(1).length === 0);

  // ---- B. the bot, from a phone (chat 555)
  const hi = await say(555, '/start');
  check('/start explains what to send', /Send me a product link/.test(hi[0]?.text ?? ''), hi[0]?.text);
  const first = await say(555, `Look at this ${MYNTRA}`);
  check('a Myntra link inside a sentence is understood, honestly with no price yet', /Myntra · No price yet/.test(first[0]?.text ?? '') && /extension/i.test(first[0]?.text ?? ''), first[0]?.text);
  check('…offering "tell me the first price"', buttons(first[0]).some((b) => b.callback_data === `s|${SHIRT}`), JSON.stringify(buttons(first[0])));
  check('the first extension report is accepted', (await observe(MYNTRA, shirt(30500), '10.1.0.1')).body?.recorded === 'accept');
  const second = await say(555, MYNTRA);
  check('now the bot shows ₹305 and the M.R.P.', /Myntra · ₹305 \(M\.R\.P\. ₹699\)/.test(second[0]?.text ?? ''), second[0]?.text);
  check('…and too early to judge', /Too early to judge/.test(second[0]?.text ?? ''), second[0]?.text);
  const b2 = buttons(second[0]).map((b) => b.callback_data ?? b.url);
  check('…with alert buttons: any drop, below ₹289, below ₹274, and the history page', b2.includes(`d|${SHIRT}`) && b2.includes(`b|28900|${SHIRT}`) && b2.includes(`b|27400|${SHIRT}`) && b2.includes(`${base}/p/myntra%3A1700944`), JSON.stringify(b2));
  const pressed = await press(555, `d|${SHIRT}`);
  check('pressing "any price drop" answers the button', pressed.some((c) => c.method === 'answerCallbackQuery' && c.body.text === 'Alert set'));
  check('…and confirms in the chat', pressed.some((c) => c.method === 'sendMessage' && /Alert set: HRX .*any price drop/.test(c.body.text)), JSON.stringify(pressed.map((c) => c.body.text)));
  const list = await say(555, '/alerts');
  check('/alerts lists it with a remove button', /any price drop \(now ₹305\)/.test(list[0]?.text ?? '') && buttons(list[0]).some((b) => /^x\|/.test(b.callback_data)), list[0]?.text);
  check('chit-chat gets the help text', /Send me a product link/.test((await say(555, 'hello'))[0]?.text ?? ''));
  check('an unsupported store is named, not ignored', /We support Amazon\.in, Flipkart, Myntra/.test((await say(555, 'https://www.amazon.com/dp/B09X5DK382'))[0]?.text ?? ''));
  check('a group chat is ignored', (await hook({ message: { chat: { id: -100, type: 'group' }, text: MYNTRA } })).status === 200 && sentTo(-100).length === 0);

  // ---- C. a browser, then linking Telegram to it
  check('alerts need a device token', (await api('/api/alerts', { method: 'POST', body: { key: SHIRT, rule: { kind: 'drop', pct: 5 } } })).body?.error?.code === 'no_device');
  const reg = await api('/api/me', { method: 'POST', ip: '10.2.0.1' });
  const token = reg.body?.token;
  check('a browser registers and gets a token once', reg.status === 201 && /^[\w-]{43}$/.test(token ?? '') && reg.body?.me?.alerts?.length === 0, JSON.stringify(reg.body));
  check('the token itself is not stored (only its hash)', d1(`SELECT COUNT(*) AS n FROM owners WHERE token_hash = '${token}'`)[0].n === 0 && d1(`SELECT COUNT(*) AS n FROM owners WHERE token_hash = '${createHash('sha256').update(token).digest('hex')}'`)[0].n === 1);
  const below = await api('/api/alerts', { method: 'POST', token, body: { key: SHIRT, rule: { kind: 'below', target: 29000 } } });
  check('a below-₹290 alert is set and armed', below.status === 201 && below.body?.alert?.description === 'at or below ₹290' && below.body.alert.armed === true, JSON.stringify(below.body));
  check('a bad rule is refused', (await api('/api/alerts', { method: 'POST', token, body: { key: SHIRT, rule: { kind: 'below', target: 290.5 } } })).body?.error?.code === 'bad_rule');
  check('an untracked product is refused', (await api('/api/alerts', { method: 'POST', token, body: { key: 'myntra:999999', rule: { kind: 'in_stock' } } })).body?.error?.code === 'not_tracked');
  check('a forged token is refused', (await api('/api/me', { token: 'x'.repeat(43) })).body?.error?.code === 'no_device');
  const link = await api('/api/me/telegram', { method: 'POST', token });
  const code = /^https:\/\/t\.me\/BrittoTestBot\?start=([\w-]{24})$/.exec(link.body?.url ?? '')?.[1];
  check('"Connect Telegram" gives a one-time t.me link', !!code, JSON.stringify(link.body));
  const connected = await say(555, `/start ${code}`);
  check('the bot confirms the link', /^Connected/.test(connected[0]?.text ?? ''), connected[0]?.text);
  const meLinked = (await api('/api/me', { token })).body?.me;
  check('the browser now shows Telegram connected, and the alert set in the bot moved over', meLinked?.telegram === true && meLinked.alerts.length === 2 && meLinked.alerts.some((a) => a.description === 'any price drop'), JSON.stringify(meLinked));
  check('the Telegram-only owner left nothing behind', d1(`SELECT COUNT(*) AS n FROM owners WHERE token_hash IS NULL`)[0].n === 0);
  check('a used code does not work twice', /expired or was already used/.test((await say(777, `/start ${code}`))[0]?.text ?? ''));
  check('the product counts 2 watchers (so it is re-checked more often)', d1(`SELECT watchers FROM products WHERE key = '${SHIRT}'`)[0].watchers === 2);

  // ---- D. browser notifications
  const keys = browserKeys();
  const sub = (path, k = keys) => ({ endpoint: `${pushOrigin}${path}`, keys: { p256dh: b64url(k.ecdh.getPublicKey()), auth: b64url(k.auth) } });
  check('a push endpoint on an unknown host is refused', (await api('/api/me/push', { method: 'POST', token, body: { subscription: { ...sub('/push/1'), endpoint: 'https://fcm.googleapis.com.evil.example/x' } } })).body?.error?.code === 'push_service_not_allowed');
  check('a malformed subscription is refused', (await api('/api/me/push', { method: 'POST', token, body: { subscription: { endpoint: `${pushOrigin}/push/1`, keys: { p256dh: 'abc', auth: 'def' } } } })).body?.error?.code === 'bad_subscription');
  check('a real-shaped subscription is saved', (await api('/api/me/push', { method: 'POST', token, body: { subscription: sub('/push/1') } })).body?.me?.push === 1);
  const pushFrom = pushes.length;
  const test = await api('/api/me/test', { method: 'POST', token });
  check('"send a test alert" reaches Telegram and the browser', test.body?.result?.telegram === 'sent' && test.body.result.push.sent === 1, JSON.stringify(test.body));
  const tp = pushes[pushFrom];
  check('the push is aes128gcm with a TTL', tp?.headers['content-encoding'] === 'aes128gcm' && Number(tp.headers.ttl) > 0, JSON.stringify(tp?.headers));
  check('the push carries a valid VAPID signature for that push service', vapidOk(tp?.headers.authorization, VAPID_PUBLIC, pushOrigin), tp?.headers.authorization);
  let tm = null;
  try { tm = decrypt(tp.body, keys); } catch (e) { tm = String(e); }
  check('the browser\'s key decrypts it to the test message', tm?.title === 'Britto test' && tm.url === `${base}/alerts`, JSON.stringify(tm));

  // ---- E. alerts firing on real readings (Myntra: extension reports are all there is)
  let tgFrom = tgCalls.length;
  let pFrom = pushes.length;
  check('a report of ₹280 (−8%) is accepted', (await observe(MYNTRA, shirt(28000), '10.1.0.2')).body?.recorded === 'accept');
  const fired = await until(() => (sentTo(555, tgFrom).length >= 2 && pushes.length - pFrom >= 2 ? sentTo(555, tgFrom) : null));
  const texts = (fired ?? sentTo(555, tgFrom)).map((c) => c.body.text);
  check('both alerts fire on Telegram: below ₹290 and the drop', texts.some((t) => /is now ₹280, at or below your target of ₹290/.test(t)) && texts.some((t) => /dropped from ₹305 to ₹280/.test(t)), JSON.stringify(texts));
  const firedPush = pushes.slice(pFrom).map((p) => { try { return decrypt(p.body, keys); } catch (e) { return String(e); } });
  check('…and as browser notifications that decrypt to the same words and link', firedPush.length === 2 && firedPush.every((m) => /₹280/.test(m.body) && m.url === `${base}/p/myntra%3A1700944` && m.tag === SHIRT), JSON.stringify(firedPush));
  const afterFire = (await api('/api/me', { token })).body?.me?.alerts?.find((a) => a.rule.kind === 'below');
  check('the fired alert records when and what it sent, and waits (disarmed)', afterFire?.armed === false && afterFire.lastFiredAt > 0 && /₹280/.test(afterFire.lastMessage ?? ''), JSON.stringify(afterFire));
  tgFrom = tgCalls.length;
  await observe(MYNTRA, shirt(28000), '10.1.0.3');
  await sleep(1500);
  check('the same price again sends nothing', sentTo(555, tgFrom).length === 0);
  check('a further drop to ₹270 is accepted', (await observe(MYNTRA, shirt(27000), '10.1.0.4')).body?.recorded === 'accept');
  const again = await until(() => sentTo(555, tgFrom).length >= 1 && sentTo(555, tgFrom));
  await sleep(800);
  check('…only the drop alert fires again (below-₹290 stays quiet while still below)', sentTo(555, tgFrom).length === 1 && /dropped from ₹280 to ₹270/.test(again?.[0]?.body.text ?? ''), JSON.stringify(sentTo(555, tgFrom).map((c) => c.body.text)));
  tgFrom = tgCalls.length;
  await observe(MYNTRA, shirt(30000), '10.1.0.5');
  await sleep(800);
  check('back above ₹290 sends nothing (it re-arms)', sentTo(555, tgFrom).length === 0);
  await observe(MYNTRA, shirt(28500), '10.1.0.6');
  const recross = await until(() => sentTo(555, tgFrom).length >= 1 && sentTo(555, tgFrom));
  check('crossing below ₹290 again fires once more', /is now ₹285, at or below your target of ₹290/.test(recross?.[0]?.body.text ?? ''), JSON.stringify(sentTo(555, tgFrom).map((c) => c.body.text)));

  // ---- F. Amazon: a forged extension report cannot fire anyone's alert; our server's reading can
  const amz = await api('/api/products', { method: 'POST', body: { url: AMAZON }, ip: '10.3.0.1' });
  const P = amz.body?.product?.stats?.current;
  if (!Number.isInteger(P)) {
    console.log(`       SKIPPED Amazon section: the server could not read Amazon now (${amz.body?.product?.pending ?? amz.status})`);
  } else {
    const KEY = 'amazon:B09X5DK382';
    const a1 = await api('/api/alerts', { method: 'POST', token, body: { key: KEY, rule: { kind: 'below', target: P - 100 } } });
    check(`a below-${P - 100}-paise alert on Amazon is set and armed`, a1.body?.alert?.armed === true, JSON.stringify(a1.body));
    tgFrom = tgCalls.length;
    const forged = await observe(AMAZON, { status: 'priced', title: null, image: null, price: P - 500, mrp: null }, '10.3.0.2');
    check('a lower extension report on Amazon is accepted as history', forged.body?.recorded === 'accept' && forged.body.product.stats.current === P - 500, JSON.stringify(forged.body?.product?.stats));
    await sleep(1500);
    check('…but fires no alert (our server has the last word)', sentTo(555, tgFrom).length === 0, JSON.stringify(sentTo(555, tgFrom).map((c) => c.body.text)));
    const runCron = async () => {
      await (await fetch(`${base}/__scheduled?cron=*/5+*+*+*+*`)).text();
      return until(() => d1(`SELECT last_attempt_at FROM products WHERE key = '${KEY}'`)[0].last_attempt_at > 1, 20_000);
    };
    check('the cron re-reads Amazon (queued by the report)', await runCron());
    await sleep(1000);
    const back = d1(`SELECT price FROM products WHERE key = '${KEY}'`)[0].price;
    check('the server\'s reading replaced the forged price, and still no alert', back === P && sentTo(555, tgFrom).length === 0, `${back} vs ${P}`);
    // Now a real crossing seen by the server: pretend the stored price was higher when the alert was set.
    d1(`UPDATE products SET price = ${P + 10000} WHERE key = '${KEY}'`);
    const a2 = await api('/api/alerts', { method: 'POST', token, body: { key: KEY, rule: { kind: 'below', target: P + 5000 } } });
    check('an alert set while the price was higher is armed', a2.body?.alert?.armed === true, JSON.stringify(a2.body?.alert));
    d1(`UPDATE products SET last_attempt_at = 1 WHERE key = '${KEY}'`);
    tgFrom = tgCalls.length;
    await runCron();
    const srv = await until(() => sentTo(555, tgFrom).length >= 1 && sentTo(555, tgFrom), 10_000);
    check('our server\'s reading fires it, even though the price did not change since the last point', /Cello/.test(srv?.[0]?.body.text ?? '') && /at or below your target/.test(srv?.[0]?.body.text ?? ''), JSON.stringify(sentTo(555, tgFrom).map((c) => c.body.text)));
  }

  // ---- G. dead channels are dropped, not retried forever
  const gone = browserKeys();
  await api('/api/me/push', { method: 'POST', token, body: { subscription: sub('/push/gone', gone) } });
  const t2 = await api('/api/me/test', { method: 'POST', token });
  check('a push service answering 410 Gone removes that browser', t2.body?.result?.push?.gone === 1 && (await api('/api/me', { token })).body?.me?.push === 1, JSON.stringify(t2.body));
  const reg2 = await api('/api/me', { method: 'POST', ip: '10.2.0.2' });
  const code2 = /start=([\w-]+)/.exec((await api('/api/me/telegram', { method: 'POST', token: reg2.body.token })).body?.url ?? '')?.[1];
  await say(BLOCKED_CHAT, `/start ${code2}`);
  const t3 = await api('/api/me/test', { method: 'POST', token: reg2.body.token });
  check('a chat that blocked the bot is disconnected', t3.body?.result?.telegram === 'blocked' && (await api('/api/me', { token: reg2.body.token })).body?.me?.telegram === false, JSON.stringify(t3.body));

  // ---- H. /stop
  await say(888, MYNTRA);
  await press(888, `s|${SHIRT}`);
  check('a Telegram-only shopper has an alert', d1(`SELECT COUNT(*) AS n FROM alerts a JOIN owners o ON o.id = a.owner WHERE o.telegram_chat = 888`)[0].n === 1);
  const stop888 = await say(888, '/stop');
  check('/stop removes a Telegram-only shopper and their alerts', /removed your alert/.test(stop888[0]?.text ?? '') && d1(`SELECT COUNT(*) AS n FROM owners WHERE telegram_chat = 888`)[0].n === 0, stop888[0]?.text);
  const stop555 = await say(555, '/stop');
  const meStopped = (await api('/api/me', { token })).body?.me;
  check('/stop in a chat linked to a browser disconnects it but keeps the alerts', /still on the Britto website/.test(stop555[0]?.text ?? '') && meStopped?.telegram === false && meStopped.alerts.length >= 2, JSON.stringify(meStopped?.telegram));

  // ---- I. limits and ownership
  const other = await api('/api/me', { method: 'POST', ip: '10.2.0.3' });
  const mine = (await api('/api/me', { token })).body.me.alerts;
  check('nobody can delete someone else\'s alert', (await api(`/api/alerts/${mine[0].id}`, { method: 'DELETE', token: other.body.token })).body?.error?.code === 'no_such_alert');
  const del = await api(`/api/alerts/${mine[0].id}`, { method: 'DELETE', token });
  check('the owner can', del.body?.me?.alerts?.length === mine.length - 1);
  check('…once', (await api(`/api/alerts/${mine[0].id}`, { method: 'DELETE', token })).status === 404);
  let made = del.body.me.alerts.length;
  let lastRes = null;
  for (let i = 0; made < 50 && i < 60; i++) {
    const id = 3_000_001 + i;
    await api('/api/products', { method: 'POST', body: { url: `https://www.myntra.com/${id}` }, ip: `10.4.${Math.floor(i / 25)}.1` });
    lastRes = await api('/api/alerts', { method: 'POST', token, body: { key: `myntra:${id}`, rule: { kind: 'in_stock' } } });
    if (lastRes.status === 201) made++;
  }
  await api('/api/products', { method: 'POST', body: { url: 'https://www.myntra.com/3999999' }, ip: '10.4.9.1' });
  const over = await api('/api/alerts', { method: 'POST', token, body: { key: 'myntra:3999999', rule: { kind: 'in_stock' } } });
  check('the 51st alert is refused', made === 50 && over.body?.error?.code === 'too_many_alerts', `${made} made, then ${JSON.stringify(over.body)}`);
  const replaced = await api('/api/alerts', { method: 'POST', token, body: { key: 'myntra:3000001', rule: { kind: 'in_stock' } } });
  check('…but changing an existing one still works at the cap', replaced.status === 201);

  // ---- J. the pages
  const page = await fetch(`${base}/alerts`);
  check('/alerts serves the app', page.status === 200 && (await page.text()).includes('id="app"'));
  const swRes = await fetch(`${base}/sw.js`);
  check('/sw.js is served as JavaScript', swRes.status === 200 && /javascript/.test(swRes.headers.get('content-type') ?? '') && (await swRes.text()).includes("addEventListener('push'"));
  const man = await fetch(`${base}/manifest.webmanifest`);
  const manBody = await man.json().catch(() => null);
  check('the web app manifest is served (installable on phones)', man.status === 200 && manBody?.short_name === 'Britto' && manBody.icons.length === 3, man.headers.get('content-type'));

  // ---- K. real Chrome: the screens, and a REAL push through Google's push service
  if (process.argv.includes('--browser')) await browserChecks();
} finally {
  stop();
}

async function browserChecks() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PW_DIR ?? 'playwright-core');
  // A persistent profile: a plain context is incognito, and Chrome refuses push in incognito.
  const profile = mkdtempSync(join(tmpdir(), 'britto-chrome-'));
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1280, height: 900 } });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await ctx.grantPermissions(['notifications'], { origin: base });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

    await page.goto(`${base}/p/myntra%3A1700944#alert`, { waitUntil: 'networkidle' });
    check('[chrome] the product page has a price-alert box', await page.locator('#alert h2', { hasText: 'Price alert' }).count() === 1);
    await page.locator('#alert input[value="below"]').check();
    await page.locator('#alert input[name="target"]').fill('250');
    await page.locator('#alert button[type="submit"]').click();
    await page.locator('#alert .form-status', { hasText: 'Alert set' }).waitFor({ timeout: 10_000 });
    check('[chrome] setting "at or below ₹250" confirms in words', (await page.locator('#alert .form-status').innerText()) === 'Alert set: at or below ₹250.');
    check('[chrome] …and lists it on the page', await page.locator('#alert .my-alerts li', { hasText: 'at or below ₹250' }).count() === 1);
    const token = await page.evaluate(() => localStorage.getItem('britto.device'));
    check('[chrome] the browser holds its device token', /^[\w-]{43}$/.test(token ?? ''));
    await page.locator('#alert button', { hasText: 'Connect Telegram' }).click();
    const open = page.locator('#tg-open');
    await open.waitFor({ timeout: 10_000 });
    const href = await open.getAttribute('href');
    const c = /start=([\w-]+)/.exec(href ?? '')?.[1];
    check('[chrome] "Connect Telegram" turns into a t.me link to press', /^https:\/\/t\.me\/BrittoTestBot\?start=/.test(href ?? ''), href);
    await say(4242, `/start ${c}`); // the shopper pressed Start in Telegram
    await page.locator('#alert .ok', { hasText: 'Telegram connected' }).waitFor({ timeout: 15_000 }).catch(() => {});
    check('[chrome] the page notices the connection by itself', await page.locator('#alert .ok', { hasText: 'Telegram connected' }).count() === 1);

    // A real subscription from real Chrome, to Google's push service.
    await page.locator('#alert button', { hasText: 'Turn on notifications here' }).click();
    const on = await page.locator('#alert .ok', { hasText: 'Notifications on' }).waitFor({ timeout: 45_000 }).then(() => true).catch(() => false);
    const subInfo = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const s = await reg?.pushManager.getSubscription();
      return s ? new URL(s.endpoint).host : null;
    }).catch((e) => `error ${e}`);
    if (!on) {
      const msg = await page.locator('#alert .channels').innerText();
      // Which step stalled: permission, the service worker, or the push service itself?
      const diag = await page.evaluate(async (key) => {
        const out = { permission: Notification.permission };
        const reg = await navigator.serviceWorker.getRegistration('/');
        out.sw = reg?.active?.state ?? 'none';
        const k = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
        out.subscribe = await Promise.race([
          reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k }).then((s) => new URL(s.endpoint).host, (e) => `${e.name}: ${e.message}`),
          new Promise((r) => setTimeout(() => r('no answer in 30 s'), 30_000)),
        ]);
        return out;
      }, VAPID_PUBLIC).catch((e) => String(e));
      console.log(`       NOT VERIFIED: real push. Chrome headless did not subscribe (${subInfo ?? 'no subscription'}): ${msg.replace(/\s+/g, ' ').slice(0, 200)} | ${JSON.stringify(diag)}`);
    } else {
      check('[chrome] Chrome subscribed through Google\'s push service', subInfo === 'fcm.googleapis.com', subInfo);
      const got = page.evaluate(() => new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'britto-push') resolve(e.data.message); });
        setTimeout(() => resolve(null), 30_000);
      }));
      const sent = await api('/api/me/test', { method: 'POST', token });
      const arrived = await got;
      check('[chrome] a REAL push via FCM reaches the service worker and decrypts', sent.body?.result?.push?.sent === 1 && arrived?.title === 'Britto test', `${JSON.stringify(sent.body)} -> ${JSON.stringify(arrived)}`);
    }

    await page.goto(`${base}/alerts`, { waitUntil: 'networkidle' });
    check('[chrome] My alerts lists the alert with its rule and price', await page.locator('.alert-row', { hasText: 'at or below ₹250' }).count() === 1);
    check('[chrome] …and shows Telegram connected', await page.locator('.channels .ok', { hasText: 'Telegram connected' }).count() === 1);
    check('[chrome] …and the bot tip for phones', await page.locator('.notice', { hasText: '@BrittoTestBot' }).count() === 1);
    await page.locator('.alert-row button', { hasText: 'Remove' }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.alert-row').length === 0 && /No alerts yet/.test(document.body.innerText), null, { timeout: 10_000 }).catch(() => {});
    check('[chrome] Remove removes it', await page.locator('.alert-row').count() === 0);
    check('[chrome] no console errors', errors.length === 0, errors.join(' | '));

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const p2 = await phone.newPage();
    await p2.goto(`${base}/p/myntra%3A1700944`, { waitUntil: 'networkidle' });
    await p2.evaluate(() => window.scrollTo(500, 0));
    check('[chrome phone] product page with the alert box has no sideways scroll', (await p2.evaluate(() => window.scrollX)) === 0);
    await p2.goto(`${base}/`, { waitUntil: 'networkidle' });
    check('[chrome phone] the home page tells phone users about the bot', /Send any product link to @BrittoTestBot/.test(await p2.locator('#bot-tip').innerText()));
    await phone.close();
  } finally {
    await ctx.close();
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

console.log(`\n${pass} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
