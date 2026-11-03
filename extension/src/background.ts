// Service worker: the ONLY part of the extension that talks to the Britto API. It sends what
// the content script read from a product page (url, title, image, price, M.R.P., stock, and
// which reader config read it) and nothing else: no cookies, no browsing history, no account
// details. It also fetches the reader configs the content script runs (BLUEPRINT §6.3).
import { configFromServed } from '../../core/recipe.ts';
import { isOrder, mergeOrders, type Order } from '../../core/spend.ts';
import { parseProductLink } from '../../core/stores.ts';
import { isRequest, type ConfigReply, type Reply, type Request } from './messages.ts';

declare const BRITTO_API: string; // set at build time (scripts/build-ext.mjs)
/** How long a reader config is used before asking again (10 min; 0 in the test build). */
declare const BRITTO_READER_TTL: number;

/** The same reading re-seen within 30 minutes is not re-sent; the panel just loads the view. */
const RESEND_AFTER = 30 * 60_000;
const READER_VERSION = chrome.runtime.getManifest().version;

async function call(path: string, init?: RequestInit): Promise<Reply> {
  try {
    const res = await fetch(BRITTO_API + path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !body) {
      const err = (body?.['error'] ?? {}) as { code?: string; message?: string };
      return { ok: false, code: err.code ?? `http_${res.status}`, message: err.message ?? `Britto answered ${res.status}` };
    }
    return { ok: true, ...(body as object) } as Reply;
  } catch (e) {
    return { ok: false, code: 'network', message: `Could not reach Britto (${String(e)})` };
  }
}

/** True when this exact reading was sent recently. Records the send otherwise. */
async function sentRecently(signature: string): Promise<boolean> {
  const key = `sent:${signature}`;
  const got = await chrome.storage.session.get(key);
  const at = got[key] as number | undefined;
  if (at && Date.now() - at < RESEND_AFTER) return true;
  await chrome.storage.session.set({ [key]: Date.now() });
  return false;
}

interface CachedConfig { at: number; etag: string; body: unknown }
const inFlight = new Map<string, Promise<ConfigReply>>();

/**
 * The reader config for a store: from the session cache while fresh, else revalidated with
 * the server (If-None-Match; a 304 costs no body). A body that fails configFromServed is
 * never used. With the server unreachable, a stale config still reads the page.
 */
async function readerConfig(store: string, device: string): Promise<ConfigReply> {
  const key = `reader:${store}.${device}`;
  const cached = (await chrome.storage.session.get(key))[key] as CachedConfig | undefined;
  const use = (body: unknown): ConfigReply => {
    const c = configFromServed(body);
    return c.ok ? { ok: true, config: c.config, version: c.version } : { ok: false, code: 'bad_config', message: `Britto sent a reader it could not check (${c.errors[0] ?? ''})` };
  };
  if (cached && Date.now() - cached.at < BRITTO_READER_TTL) return use(cached.body);
  try {
    const res = await fetch(`${BRITTO_API}/api/config/reader?store=${encodeURIComponent(store)}&device=${device}&v=${READER_VERSION}`, {
      headers: cached ? { 'if-none-match': cached.etag } : {},
      cache: 'no-store', // the session cache above is the only cache: one place to reason about
    });
    if (res.status === 304 && cached) {
      await chrome.storage.session.set({ [key]: { ...cached, at: Date.now() } });
      return use(cached.body);
    }
    if (!res.ok) return cached ? use(cached.body) : { ok: false, code: `http_${res.status}`, message: `Britto has no reader for this store (${res.status})` };
    const body = (await res.json()) as unknown;
    const reply = use(body);
    if (reply.ok) await chrome.storage.session.set({ [key]: { at: Date.now(), etag: res.headers.get('etag') ?? '', body } });
    return reply;
  } catch (e) {
    return cached ? use(cached.body) : { ok: false, code: 'network', message: `Could not reach Britto (${String(e)})` };
  }
}

/** Spend Lens orders live in this browser only (chrome.storage.local); nothing sends them. */
const SPEND_KEY = 'spend:orders';
async function keepOrders(orders: Order[]): Promise<{ ok: true; kept: number }> {
  const kept = ((await chrome.storage.local.get(SPEND_KEY))[SPEND_KEY] ?? []) as Order[];
  const merged = mergeOrders(kept.filter(isOrder), orders);
  await chrome.storage.local.set({ [SPEND_KEY]: merged });
  return { ok: true, kept: merged.length };
}

async function handle(msg: Request): Promise<Reply | ConfigReply | { ok: true; kept?: number }> {
  switch (msg.type) {
    case 'getReaderConfig': {
      // One question to the server per store at a time, however many pages ask.
      const key = `${msg.store}.${msg.device}`;
      let p = inFlight.get(key);
      if (!p) {
        p = readerConfig(msg.store, msg.device).finally(() => inFlight.delete(key));
        inFlight.set(key, p);
      }
      return p;
    }
    case 'getProductAnswer':
      return call(`/api/products/${encodeURIComponent(msg.key)}`);
    case 'reportTelemetry':
      await call('/api/telemetry', { method: 'POST', body: JSON.stringify({ feature: 'read', store: msg.store, outcome: msg.outcome, configVersion: msg.configVersion, readerVersion: READER_VERSION, client: 'extension' }) });
      return { ok: true };
    case 'saveOrders':
      return keepOrders(msg.orders);
    case 'postObservation': {
      const parsed = parseProductLink(msg.url);
      if (!parsed.ok) return { ok: false, code: 'not_a_product', message: 'Not a product page.' };
      const o = msg.observed;
      if (await sentRecently(`${parsed.link.key}|${o.status}|${o.price}|${o.mrp}`)) {
        const view = await call(`/api/products/${encodeURIComponent(parsed.link.key)}`);
        if (view.ok) return { ...view, recorded: 'skip', reason: 'sent_recently' };
      }
      return call('/api/observations', {
        method: 'POST',
        body: JSON.stringify({ url: msg.url, observed: o, configVersion: msg.configVersion, readerVersion: READER_VERSION, client: 'extension' }),
      });
    }
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  // Only this extension's own content scripts; anything unknown is dropped without an answer.
  if (sender.id !== chrome.runtime.id || !isRequest(msg)) return false;
  handle(msg).then(sendResponse);
  return true; // keep the channel open for the async reply
});
