import { ALERTS, parseRule, readingMovesAlerts } from '../core/alerts.ts';
import { pickDue } from '../core/schedule.ts';
import { STORES, STORE_IDS, parseKey, parseProductLink, storeFromParam } from '../core/stores.ts';
import { cleanObserved, judgeObservation } from '../core/trust.ts';
import { GROCERY_PLATFORMS, cleanQuotes, compareBasket, compareItem, type GroceryPlatformId } from '../core/grocery.ts';
import type { ServedConfig } from '../core/recipe.ts';
import type { ApiError, AppConfig, Extracted, ProductKey } from '../core/types.ts';
import {
  createDeviceOwner, createLinkCode, deleteAlert, evaluateAlerts, LINK_CODE_MS, meView, ownerByToken, setAlert, unlinkChat,
  type OwnerRow,
} from './alerts.ts';
import { deliver, siteUrl, telegramBot, vapid } from './channels.ts';
import {
  clearHeld, deals, getProduct, holdReport, insertProduct, loadHeld, loadPoints, markRecheck, popular, productView,
  rateLimit, recent, recordObservation, refreshCandidates, search, sweepRate,
} from './db.ts';
import type { Ctx, D1Database, Env } from './env.ts';
import { countReading, getReader, healthReport, type HealthSource } from './readers.ts';
import { ADDS_PER_HOUR, addProduct, background, refresh, resolveLink } from './refresh.ts';
import { handleTelegram } from './telegram.ts';
import { allowedEndpoint, parseSubscription } from './webpush.ts';

/** Products re-checked per scheduled run. Kept small: free Workers get 10 ms CPU per run,
 * and one Amazon page costs ~1 ms to read (measured on the fixtures). */
export const PER_RUN = 4;
/** Extension price reports one network may send per hour (a long shopping session is ~100 pages). */
export const OBSERVATIONS_PER_HOUR = 150;
/** Browsers one network may register per hour (a college Wi-Fi is one network). */
export const DEVICES_PER_HOUR = 60;
/** Alerts one owner may create per hour, and test messages one owner may ask for. */
export const ALERT_WRITES_PER_HOUR = 120;
export const TESTS_PER_HOUR = 5;
/** Grocery comparisons one network may ask for per hour (each is computed, nothing stored). */
export const GROCERY_PER_HOUR = 300;
/** Reader telemetry one network may send per hour ("could not read this page" reports). */
export const TELEMETRY_PER_HOUR = 600;
/** Clients may keep a served reader config this long before asking again (BLUEPRINT §6.3). */
export const READER_CACHE_SECONDS = 600;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function fail(status: number, code: string, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return json(body, status);
}

async function clientId(request: Request): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`britto:${ip}`));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function track(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ url?: unknown }>(request);
  if (!body) return fail(400, 'bad_json', 'Send JSON: {"url": "<product link>"}.');
  if (typeof body.url !== 'string' || body.url.length > 2000) return fail(400, 'bad_url', 'Send a product link as "url".');
  const link = await resolveLink(env, body.url);
  if (!link.ok) return fail(link.status, link.code, link.message);
  const added = await addProduct(env, link.link, await clientId(request), Date.now());
  if (!added.ok) return fail(added.status, added.code, added.message);
  return json({ created: added.created, product: await productView(env.DB, added.row) }, added.created ? 201 : 200);
}

/**
 * The browser extension's reading of a product page the shopper is viewing. A CLAIM:
 * shape-checked (cleanObserved), rate-limited per network, then judged by core/trust.ts.
 */
async function observe(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  let body: { url?: unknown; observed?: unknown; configVersion?: unknown; readerVersion?: unknown; client?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, 'bad_json', 'Send JSON: {"url": "…", "observed": {…}}.');
  }
  if (typeof body.url !== 'string' || body.url.length > 2000) return fail(400, 'bad_url', 'Send the product page URL as "url".');
  const parsed = parseProductLink(body.url);
  if (!parsed.ok) return fail(422, parsed.reason === 'short_link' ? 'not_a_product' : parsed.reason, 'Not a supported product page.');
  const link = parsed.link;
  const clean = cleanObserved(body.observed);
  if (!clean.ok) return fail(422, 'bad_observation', clean.reason);
  const versions = readerVersions(body);
  if (!versions.ok) return fail(422, 'bad_observation', versions.reason);

  const now = Date.now();
  const reporter = await clientId(request);
  if (!(await rateLimit(env.DB, `observe:${reporter}`, OBSERVATIONS_PER_HOUR, 3_600_000, now))) {
    return fail(429, 'rate_limited', `At most ${OBSERVATIONS_PER_HOUR} price reports an hour from one network.`);
  }
  // Which config read it (BLUEPRINT §5 rule 5): a bad config deploy shows up in reader health.
  await countReading(env.DB, { store: link.store, source: versions.client, configVersion: versions.configVersion, readerVersion: versions.readerVersion, outcome: clean.obs.inStock ? 'priced' : 'unavailable' }, now);
  let row = await getProduct(env.DB, link.key);
  if (!row) {
    if (!(await rateLimit(env.DB, `add:${reporter}`, ADDS_PER_HOUR, 3_600_000, now))) {
      return fail(429, 'rate_limited', `You can add ${ADDS_PER_HOUR} new products an hour.`);
    }
    await insertProduct(env.DB, link, now);
    row = await getProduct(env.DB, link.key);
    if (!row) return fail(500, 'insert_failed', 'The product could not be saved.');
  }

  const points = await loadPoints(env.DB, link.key);
  const held = await loadHeld(env.DB, link.key);
  const decision = judgeObservation(points, row.last_checked_at, clean.obs, reporter, held, now);
  if (decision.action === 'accept') {
    const ex: Extracted = {
      status: clean.obs.inStock ? 'priced' : 'unavailable', title: clean.obs.title, image: clean.obs.image,
      price: clean.obs.price, mrp: clean.obs.mrp, inStock: clean.obs.inStock, pid: null, rule: 'extension',
    };
    const changed = await recordObservation(env.DB, link.key, ex, 'extension', now, points);
    if (changed) {
      if (held.length) await clearHeld(env.DB, link.key);
      // A store our server can read gets the last word: re-read it on the next scheduled run,
      // and only that reading may move alerts (core/alerts.ts readingMovesAlerts).
      const serverReadable = STORES[link.store].serverFetch === 'yes';
      if (serverReadable && points.length > 0) await markRecheck(env.DB, link.key);
      if (readingMovesAlerts(serverReadable, 'extension') && row.watchers > 0) background(ctx, 'alerts', evaluateAlerts(env, link.key, now));
    }
  } else if (decision.action === 'hold') {
    await holdReport(env.DB, link.key, reporter, clean.obs, now);
  }
  const fresh = await getProduct(env.DB, link.key);
  return json({ recorded: decision.action, reason: decision.reason, product: await productView(env.DB, fresh ?? row) });
}

const VERSION_TEXT = /^[\w.-]{1,80}$/;

/** The optional reader/config versions a client sends with a reading or a telemetry report. */
function readerVersions(body: { configVersion?: unknown; readerVersion?: unknown; client?: unknown }):
  { ok: true; configVersion: string; readerVersion: string; client: HealthSource } | { ok: false; reason: string } {
  for (const k of ['configVersion', 'readerVersion'] as const) {
    const v = body[k];
    if (v !== undefined && !(typeof v === 'string' && VERSION_TEXT.test(v))) return { ok: false, reason: `${k} must be 1-80 letters, digits, dots, dashes or underscores` };
  }
  if (body.client !== undefined && body.client !== 'extension' && body.client !== 'app') return { ok: false, reason: 'client must be "extension" or "app"' };
  return {
    ok: true,
    configVersion: (body.configVersion as string | undefined) ?? 'unknown',
    readerVersion: (body.readerVersion as string | undefined) ?? 'unknown',
    client: (body.client as HealthSource | undefined) ?? 'extension',
  };
}

/**
 * GET /api/config/reader?store=<id|number>&device=desktop|mobile — the reader config clients
 * run (BLUEPRINT §6.3). ETag is the content-derived version, so a client revalidates cheaply
 * and a hot-fix changes it without anyone bumping a number.
 */
async function readerConfig(request: Request, env: Env, url: URL): Promise<Response> {
  const store = storeFromParam(url.searchParams.get('store'));
  if (!store) return fail(404, 'no_reader', 'No reader for that store.');
  const device = url.searchParams.get('device') ?? 'desktop';
  if (device !== 'desktop' && device !== 'mobile') return fail(400, 'bad_device', 'device must be desktop or mobile.');
  let reader = await getReader(env, store, device);
  let deviceFallback = false;
  if (!reader && device === 'mobile') {
    reader = await getReader(env, store, 'desktop');
    deviceFallback = true;
  }
  if (!reader) return fail(404, 'no_reader', 'No reader for that store.');
  const etag = `"${reader.version}"`;
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${READER_CACHE_SECONDS}`, etag };
  const asked = (request.headers.get('if-none-match') ?? '').split(',').map((t) => t.trim().replace(/^W\//, ''));
  if (asked.includes(etag) || asked.includes('*')) return new Response(null, { status: 304, headers });
  const body: ServedConfig = { ...reader.config, version: reader.version, storeNumber: STORES[store].num, features: { deviceFallback } };
  return new Response(JSON.stringify(body), { status: 200, headers });
}

/**
 * POST /api/telemetry: a client could not read a page (BLUEPRINT §20). Counts only: the store,
 * what happened, and which config and client version; never the page or who sent it.
 */
async function telemetry(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ feature?: unknown; store?: unknown; outcome?: unknown; configVersion?: unknown; readerVersion?: unknown; client?: unknown }>(request);
  if (!body) return fail(400, 'bad_json', 'Send JSON: {"feature": "read", "store": …, "outcome": …}.');
  if (body.feature !== 'read') return fail(422, 'bad_telemetry', 'feature must be "read".');
  const store = typeof body.store === 'string' || typeof body.store === 'number' ? storeFromParam(String(body.store)) : null;
  if (!store) return fail(422, 'bad_telemetry', 'Unknown store.');
  if (body.outcome !== 'blocked' && body.outcome !== 'unrecognised') return fail(422, 'bad_telemetry', 'outcome must be "blocked" or "unrecognised".');
  const versions = readerVersions(body);
  if (!versions.ok) return fail(422, 'bad_telemetry', versions.reason);
  const now = Date.now();
  if (!(await rateLimit(env.DB, `telemetry:${await clientId(request)}`, TELEMETRY_PER_HOUR, 3_600_000, now))) {
    return fail(429, 'rate_limited', `At most ${TELEMETRY_PER_HOUR} reports an hour from one network.`);
  }
  await countReading(env.DB, { store, source: versions.client, configVersion: versions.configVersion, readerVersion: versions.readerVersion, outcome: body.outcome }, now);
  return json({ ok: true }, 202);
}

type Ref = { item: string; brand: string | null; pack: string | null };
function cleanRef(v: unknown): Ref | null {
  const o = v as Record<string, unknown> | null;
  const text = (x: unknown, max: number) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
  if (!o || !text(o['item'], 300)) return null;
  return { item: (o['item'] as string).trim(), brand: text(o['brand'], 80) ? (o['brand'] as string).trim() : null, pack: text(o['pack'], 80) ? (o['pack'] as string).trim() : null };
}

/**
 * Grocery compare (BLUEPRINT §12), computed from quotes the shopper's own app read: one item
 * (POST /api/grocery/compare) or a basket (POST /api/grocery/basket), for ONE address.
 * Nothing is stored. Quotes are claims about the shopper's own screen; they move nothing else.
 */
async function grocery(request: Request, env: Env, path: string): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return fail(400, 'bad_json', 'Send JSON.');
  if (typeof body['address'] !== 'string' || !body['address'].trim() || body['address'].length > 80) return fail(422, 'bad_address', 'Say which delivery address the prices are for ("address").');
  if (!(await rateLimit(env.DB, `grocery:${await clientId(request)}`, GROCERY_PER_HOUR, 3_600_000, Date.now()))) {
    return fail(429, 'rate_limited', `At most ${GROCERY_PER_HOUR} comparisons an hour from one network.`);
  }
  const address = body['address'].trim();
  if (path === '/api/grocery/compare') {
    const ref = cleanRef(body['ref']);
    if (!ref) return fail(422, 'bad_ref', 'Say which item to compare: ref {item, brand?, pack?}.');
    const quotes = cleanQuotes(body['quotes']);
    if (!quotes.ok) return fail(422, 'bad_quotes', quotes.reason);
    return json({ comparison: compareItem(ref, address, quotes.quotes), computedAt: Date.now() });
  }
  const items = body['items'];
  if (!Array.isArray(items) || !items.length || items.length > 30) return fail(422, 'bad_items', 'Send 1 to 30 items, each {ref, quotes}.');
  const compared = [];
  for (const [i, it] of items.entries()) {
    const ref = cleanRef((it as Record<string, unknown>)?.['ref']);
    const quotes = cleanQuotes((it as Record<string, unknown>)?.['quotes']);
    if (!ref) return fail(422, 'bad_ref', `items[${i}].ref is missing its item`);
    if (!quotes.ok) return fail(422, 'bad_quotes', `items[${i}]: ${quotes.reason}`);
    compared.push(compareItem(ref, address, quotes.quotes));
  }
  const delivery: Partial<Record<GroceryPlatformId, number>> = {};
  const fees = body['delivery'];
  if (fees && typeof fees === 'object') {
    for (const p of GROCERY_PLATFORMS) {
      const fee = (fees as Record<string, unknown>)[p.id];
      if (fee !== undefined && !(Number.isSafeInteger(fee) && (fee as number) >= 0 && (fee as number) <= 1_000_000)) return fail(422, 'bad_delivery', `delivery.${p.id} must be whole paise`);
      if (fee !== undefined) delivery[p.id] = fee as number;
    }
  }
  return json({ items: compared, totals: compareBasket(compared, delivery), computedAt: Date.now() });
}

/** The browser's owner, from `Authorization: Bearer <device token>`. */
async function authed(request: Request, env: Env): Promise<OwnerRow | Response> {
  const m = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization') ?? '');
  const owner = m ? await ownerByToken(env.DB, m[1]!) : null;
  return owner ?? fail(401, 'no_device', 'This browser is not registered. Reload the page to get a new device token.');
}

async function config(env: Env): Promise<Response> {
  const keys = vapid(env);
  const body: AppConfig = {
    telegram: await telegramBot(env).then((bot) => (bot ? { bot } : null)).catch(() => null),
    push: keys ? { publicKey: keys.publicKey } : null,
    maxAlerts: ALERTS.maxPerOwner,
  };
  return json(body);
}

async function me(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const now = Date.now();
  if (path === '/api/me' && method === 'POST') {
    if (!(await rateLimit(env.DB, `device:${await clientId(request)}`, DEVICES_PER_HOUR, 3_600_000, now))) {
      return fail(429, 'rate_limited', 'Too many new browsers from this network in the last hour. Try again later.');
    }
    const { token, owner } = await createDeviceOwner(env.DB, now);
    return json({ token, me: await meView(env.DB, owner) }, 201);
  }
  const owner = await authed(request, env);
  if (owner instanceof Response) return owner;

  if (path === '/api/me' && method === 'GET') return json({ me: await meView(env.DB, owner) });

  if (path === '/api/me/telegram' && method === 'POST') {
    const bot = await telegramBot(env);
    if (!bot) return fail(503, 'telegram_off', 'Telegram alerts are not switched on for this site yet.');
    if (!(await rateLimit(env.DB, `link:${owner.id}`, 20, 3_600_000, now))) return fail(429, 'rate_limited', 'Too many connect attempts. Try again in an hour.');
    const code = await createLinkCode(env.DB, owner.id, now);
    return json({ url: `https://t.me/${bot}?start=${code}`, bot, expiresAt: now + LINK_CODE_MS });
  }
  if (path === '/api/me/telegram' && method === 'DELETE') {
    await unlinkChat(env.DB, owner.id);
    return json({ me: await meView(env.DB, { ...owner, telegram_chat: null }) });
  }

  if (path === '/api/me/push' && (method === 'POST' || method === 'DELETE')) {
    if (!vapid(env)) return fail(503, 'push_off', 'Browser notifications are not switched on for this site yet.');
    const body = await readJson<{ subscription?: unknown }>(request);
    const sub = parseSubscription(body?.subscription);
    if (!sub) return fail(422, 'bad_subscription', 'Send the browser\'s push subscription as {"subscription": subscription.toJSON()}.');
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND owner = ?').bind(sub.endpoint, owner.id).run();
      return json({ me: await meView(env.DB, owner) });
    }
    if (!allowedEndpoint(sub.endpoint, env.PUSH_TEST_ORIGIN)) return fail(422, 'push_service_not_allowed', 'That push service is not one we send to.');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE owner = ? AND endpoint != ?').bind(owner.id, sub.endpoint).first<{ n: number }>();
    if ((count?.n ?? 0) >= 10) return fail(422, 'too_many_browsers', 'Notifications are on in 10 browsers already. Turn one off first.');
    // The endpoint is the key: a browser that re-subscribes under another owner moves over.
    await env.DB.prepare(
      `INSERT INTO push_subs (endpoint, owner, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET owner = excluded.owner, p256dh = excluded.p256dh, auth = excluded.auth`,
    ).bind(sub.endpoint, owner.id, sub.p256dh, sub.auth, now).run();
    return json({ me: await meView(env.DB, owner) });
  }

  if (path === '/api/me/test' && method === 'POST') {
    if (!(await rateLimit(env.DB, `test:${owner.id}`, TESTS_PER_HOUR, 3_600_000, now))) return fail(429, 'rate_limited', `At most ${TESTS_PER_HOUR} test messages an hour.`);
    const result = await deliver(env, owner, { title: 'Britto test', body: 'Alerts will reach you here.', url: `${siteUrl(env)}/alerts`, tag: 'test' }, now);
    return json({ result });
  }
  return fail(404, 'not_found', 'No such API route.');
}

async function alerts(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const owner = await authed(request, env);
  if (owner instanceof Response) return owner;
  const now = Date.now();
  if (path === '/api/alerts' && method === 'GET') return json({ me: await meView(env.DB, owner) });
  if (path === '/api/alerts' && method === 'POST') {
    const body = await readJson<{ key?: unknown; rule?: unknown }>(request);
    if (!body) return fail(400, 'bad_json', 'Send JSON: {"key": "<product key>", "rule": {…}}.');
    if (typeof body.key !== 'string' || !parseKey(body.key)) return fail(400, 'bad_key', 'Not a product key.');
    const rule = parseRule(body.rule);
    if (!rule.ok) return fail(422, 'bad_rule', rule.reason);
    const product = await getProduct(env.DB, body.key);
    if (!product) return fail(404, 'not_tracked', 'We are not tracking this product yet. Add it by its link.');
    if (!(await rateLimit(env.DB, `alert:${owner.id}`, ALERT_WRITES_PER_HOUR, 3_600_000, now))) return fail(429, 'rate_limited', 'Too many alert changes this hour.');
    const res = await setAlert(env.DB, owner.id, product, rule.rule, now);
    if (!res.ok) return fail(res.status, res.code, res.message);
    return json({ alert: res.alert, me: await meView(env.DB, owner) }, 201);
  }
  if (path.startsWith('/api/alerts/') && method === 'DELETE') {
    const id = decodeURIComponent(path.slice('/api/alerts/'.length));
    if (!(await deleteAlert(env.DB, owner.id, id))) return fail(404, 'no_such_alert', 'No such alert.');
    return json({ me: await meView(env.DB, owner) });
  }
  return fail(404, 'not_found', 'No such API route.');
}

async function api(request: Request, env: Env, ctx: Ctx, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health') return json({ ok: true, time: Date.now() });
  if (path === '/api/stores' && method === 'GET') return json({ stores: STORE_IDS.map((id) => STORES[id]) });
  if (path === '/api/products' && method === 'POST') return track(request, env);
  if (path === '/api/observations' && method === 'POST') return observe(request, env, ctx);
  if (path === '/api/config' && method === 'GET') return config(env);
  if (path === '/api/config/reader' && method === 'GET') return readerConfig(request, env, url);
  if (path === '/api/telemetry' && method === 'POST') return telemetry(request, env);
  if (path === '/api/grocery/platforms' && method === 'GET') return json({ platforms: GROCERY_PLATFORMS });
  if ((path === '/api/grocery/compare' || path === '/api/grocery/basket') && method === 'POST') return grocery(request, env, path);
  if (path === '/api/health/readers' && method === 'GET') return json(await healthReport(env.DB, STORE_IDS, Date.now()));
  if (path === '/api/me' || path.startsWith('/api/me/')) return me(request, env, path, method);
  if (path === '/api/alerts' || path.startsWith('/api/alerts/')) return alerts(request, env, path, method);
  if (path === '/api/telegram/webhook' && method === 'POST') return handleTelegram(request, env);

  if (path.startsWith('/api/products/') && method === 'GET') {
    const key = decodeURIComponent(path.slice('/api/products/'.length));
    if (!parseKey(key)) return fail(400, 'bad_key', 'Not a product key.');
    const row = await getProduct(env.DB, key);
    if (!row) return fail(404, 'not_tracked', 'We are not tracking this product yet. Add it by its link.');
    ctx.waitUntil(env.DB.prepare('UPDATE products SET views = views + 1 WHERE key = ?').bind(key).run());
    return json({ product: await productView(env.DB, row) });
  }

  if (path === '/api/search' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').slice(0, 200);
    return json({ q, results: await search(env.DB, q) });
  }
  if (path === '/api/deals' && method === 'GET') return json({ results: await deals(env.DB) });
  if (path === '/api/recent' && method === 'GET') return json({ results: await recent(env.DB) });
  if (path === '/api/popular' && method === 'GET') return json({ results: await popular(env.DB) });

  return fail(404, 'not_found', 'No such API route.');
}

/**
 * "britto.app/" + any product link opens that product: /https://www.amazon.in/dp/X,
 * /www.amazon.in/dp/X and /amazon.in/dp/X all redirect to /p/amazon:X.
 */
function prefixRedirect(request: Request, url: URL): Response | null {
  const rest = request.url.slice(url.origin.length + 1);
  if (!/^(https?:\/*)?([a-z0-9-]+\.)+[a-z]{2,}\//i.test(rest)) return null;
  const parsed = parseProductLink(rest.replace(/^(https?):\/+/i, '$1://'));
  if (!parsed.ok) return null;
  return Response.redirect(`${url.origin}/p/${encodeURIComponent(parsed.link.key)}?add=1`, 302);
}

async function page(request: Request, env: Env, url: URL): Promise<Response> {
  // The app is one page; /p/<key>, /search, /deals, /stores, /alerts and /browse are its client routes.
  // html_handling is "none" (wrangler.jsonc): with the default, a request for /index.html
  // is answered 307 -> "/", which sent every /p/<key> link to the home page.
  if (/^\/(|p\/[^/]+|search|deals|stores|alerts|browse|grocery)\/?$/.test(url.pathname)) {
    return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
  }
  if (url.pathname === '/bot') return env.ASSETS.fetch(new Request(new URL('/bot.html', url), request));
  return env.ASSETS.fetch(request);
}

export const handler = {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, ctx, url);
      const redirect = prefixRedirect(request, url);
      if (redirect) return redirect;
      return await page(request, env, url);
    } catch (e) {
      console.error('unhandled', e);
      return fail(500, 'internal', 'Something went wrong on our side.');
    }
  },

  async scheduled(_controller: unknown, env: Env, ctx: Ctx): Promise<void> {
    ctx.waitUntil(runSchedule(env.DB, env));
  },
};

export async function runSchedule(db: D1Database, env: Env): Promise<{ checked: { key: ProductKey; result: string }[] }> {
  const now = Date.now();
  // A new bot token takes effect on the next run without anyone pressing anything.
  await telegramBot(env).catch((e) => console.error('telegram setup', e));
  const readable = STORE_IDS.filter((id) => STORES[id].serverFetch === 'yes');
  const due = pickDue(
    (await refreshCandidates(db, readable)).map((r) => ({ ...r, lastAttemptAt: r.last_attempt_at, failCount: r.fail_count })),
    now,
    PER_RUN,
  );
  const checked: { key: ProductKey; result: string }[] = [];
  // One at a time: polite to the store, and keeps CPU per run flat.
  for (const row of due) checked.push({ key: row.key, result: await refresh(env, row, Date.now()) });
  await sweepRate(db, now);
  if (checked.length) console.log('schedule', JSON.stringify(checked));
  // Once an hour (the first run after the hour turns): say when a store's reader looks broken.
  if (now % 3_600_000 < 5 * 60_000) {
    const { warnings } = await healthReport(db, STORE_IDS, now);
    for (const w of warnings) console.warn('reader health', w.code, w.message);
  }
  return { checked };
}

