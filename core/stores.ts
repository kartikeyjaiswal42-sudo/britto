import type { ProductKey, Store, StoreId } from './types.ts';

// Each `measured` line is what was observed, not what was hoped. Re-measure before
// changing `serverFetch`; the stores page shows these lines to shoppers.
export const STORES: Record<StoreId, Store> = {
  amazon: {
    id: 'amazon',
    num: 1,
    name: 'Amazon.in',
    hosts: ['amazon.in', 'www.amazon.in', 'm.amazon.in'],
    shortHosts: ['amzn.in', 'amzn.to'],
    home: 'https://www.amazon.in/',
    serverFetch: 'yes',
    measured:
      '2026-10-26: in-stock /dp/ pages fetched with an honest bot User-Agent (from India, not yet from Cloudflare) returned the price box: ₹265, M.R.P. ₹299, "In stock".',
  },
  flipkart: {
    id: 'flipkart',
    num: 2,
    name: 'Flipkart',
    hosts: ['flipkart.com', 'www.flipkart.com', 'dl.flipkart.com'],
    shortHosts: [],
    home: 'https://www.flipkart.com/',
    serverFetch: 'refused',
    measured:
      '2026-10-26: product pages answered "Something went wrong! E002" instead of the product. Prices come from the browser extension.',
  },
  myntra: {
    id: 'myntra',
    num: 3,
    name: 'Myntra',
    hosts: ['myntra.com', 'www.myntra.com'],
    shortHosts: [],
    home: 'https://www.myntra.com/',
    serverFetch: 'no_answer',
    measured:
      '2026-10-26: no response within 25 s to an honest bot User-Agent. Prices come from the browser extension.',
  },
  vijaysales: {
    id: 'vijaysales',
    num: 4,
    name: 'Vijay Sales',
    hosts: ['vijaysales.com', 'www.vijaysales.com'],
    shortHosts: [],
    home: 'https://www.vijaysales.com/',
    serverFetch: 'yes',
    measured:
      '2026-10-26: two product pages fetched with an honest bot User-Agent (from a cloud computer in the USA, not yet from Cloudflare) returned the price box: ₹9,229 (M.R.P. ₹11,900, the store says out of stock) and ₹4,999 (M.R.P. ₹15,999, in stock).',
  },
  reliancedigital: {
    id: 'reliancedigital',
    num: 5,
    name: 'Reliance Digital',
    hosts: ['reliancedigital.in', 'www.reliancedigital.in'],
    shortHosts: [],
    home: 'https://www.reliancedigital.in/',
    serverFetch: 'yes',
    measured:
      '2026-10-26: 14 product pages fetched with an honest bot User-Agent (from a cloud computer in the USA, not yet from Cloudflare) all returned the price box, e.g. ₹999 (M.R.P. ₹2,999). Its search-engine data says "in stock" even for items it will not sell; Britto reads the page\'s own "sellable" flag instead.',
  },
};

export const STORE_IDS = Object.keys(STORES) as StoreId[];

/** A store named by its id ("amazon") or its number ("1"); null when there is no such store. */
export function storeFromParam(param: string | null | undefined): StoreId | null {
  if (!param) return null;
  if (/^\d{1,6}$/.test(param)) return STORE_IDS.find((id) => STORES[id].num === Number(param)) ?? null;
  return Object.hasOwn(STORES, param) ? (param as StoreId) : null;
}

export interface ParsedLink {
  store: StoreId;
  /** The store's own id for the product (ASIN, Flipkart itm[.pid], Myntra style id). */
  pid: string;
  key: ProductKey;
  /** The URL we fetch and link to: tracking parameters removed. */
  url: string;
}

export type LinkResult =
  | { ok: true; link: ParsedLink }
  | { ok: false; reason: 'not_a_url' | 'unsupported_store' | 'not_a_product' }
  | { ok: false; reason: 'short_link'; store: StoreId; url: string };

const ASIN = /^[A-Z0-9]{10}$/;

function storeForHost(host: string): { store: StoreId; short: boolean } | null {
  for (const s of Object.values(STORES)) {
    if (s.hosts.includes(host)) return { store: s.id, short: false };
    if (s.shortHosts.includes(host)) return { store: s.id, short: true };
  }
  return null;
}

/**
 * Turn whatever a shopper pastes into a product identity. Accepts a bare host
 * ("amazon.in/dp/…"), the "britto.app/https://…" prefix form, and links with any amount
 * of tracking junk. Host matching is exact: "amazon.in.evil.example" is not Amazon.
 */
export function parseProductLink(input: string): LinkResult {
  let raw = input.trim();
  if (!raw) return { ok: false, reason: 'not_a_url' };
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'not_a_url' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'not_a_url' };
  const host = u.hostname.toLowerCase();
  const hit = storeForHost(host);
  if (!hit) return { ok: false, reason: 'unsupported_store' };
  if (hit.short) return { ok: false, reason: 'short_link', store: hit.store, url: `https://${host}${u.pathname}` };

  if (hit.store === 'amazon') return amazon(u);
  if (hit.store === 'flipkart') return flipkart(u);
  if (hit.store === 'vijaysales') return vijaysales(u);
  if (hit.store === 'reliancedigital') return reliancedigital(u);
  return myntra(u);
}

function ok(store: StoreId, pid: string, url: string): LinkResult {
  return { ok: true, link: { store, pid, key: `${store}:${pid}`, url } };
}

function amazon(u: URL): LinkResult {
  const m = /\/(?:dp|gp\/product|gp\/aw\/d|o\/ASIN)\/([A-Za-z0-9]{10})(?=[/?]|$)/.exec(u.pathname);
  const asin = m?.[1]?.toUpperCase();
  if (!asin || !ASIN.test(asin)) return { ok: false, reason: 'not_a_product' };
  return ok('amazon', asin, `https://www.amazon.in/dp/${asin}`);
}

function flipkart(u: URL): LinkResult {
  // dl.flipkart.com/dl/<slug>/p/<itm…> is the same page under a /dl prefix.
  let path = u.pathname;
  if (u.hostname.toLowerCase() === 'dl.flipkart.com') {
    if (!path.startsWith('/dl/')) return { ok: false, reason: 'not_a_product' };
    path = path.slice(3);
  }
  const m = /^(\/[^/]+)?\/p\/(itm[a-z0-9]{6,20})\/?$/i.exec(path);
  const itm = m?.[2]?.toLowerCase();
  if (!itm) return { ok: false, reason: 'not_a_product' };
  const pidRaw = u.searchParams.get('pid');
  const pid = pidRaw && /^[A-Z0-9]{12,20}$/i.test(pidRaw) ? pidRaw.toUpperCase() : null;
  const clean = `https://www.flipkart.com${path.replace(/\/$/, '')}${pid ? `?pid=${pid}` : ''}`;
  return ok('flipkart', pid ? `${itm}.${pid}` : itm, clean);
}

function myntra(u: URL): LinkResult {
  const m = /\/(\d{5,10})\/buy\/?$/.exec(u.pathname) ?? /^\/(\d{5,10})\/?$/.exec(u.pathname);
  const id = m?.[1];
  if (!id) return { ok: false, reason: 'not_a_product' };
  return ok('myntra', id, `https://www.myntra.com${u.pathname.replace(/\/$/, '')}`);
}

function vijaysales(u: URL): LinkResult {
  // /p/<id>/<name>; the name is part of the address (measured: /p/<id> alone is a 404).
  const m = /^\/p\/(\d{4,8})\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(u.pathname);
  if (!m) return { ok: false, reason: 'not_a_product' };
  return ok('vijaysales', m[1]!, `https://www.vijaysales.com/p/${m[1]}/${m[2]!.toLowerCase()}`);
}

function reliancedigital(u: URL): LinkResult {
  // /product/<name-with-codes>: the store's own handle for the product (its canonical link).
  const m = /^\/product\/([a-z0-9][a-z0-9-]{2,299})\/?$/i.exec(u.pathname);
  if (!m) return { ok: false, reason: 'not_a_product' };
  const slug = m[1]!.toLowerCase();
  return ok('reliancedigital', slug, `https://www.reliancedigital.in/product/${slug}`);
}

/** Split "amazon:B09X5DK382" safely; null for anything that is not a known key shape. */
export function parseKey(key: string): { store: StoreId; pid: string } | null {
  const i = key.indexOf(':');
  if (i < 1) return null;
  const store = key.slice(0, i) as StoreId;
  const pid = key.slice(i + 1);
  if (!Object.hasOwn(STORES, store)) return null; // not `in`: "toString" is in every object
  const shape: Record<StoreId, RegExp> = {
    amazon: ASIN,
    flipkart: /^itm[a-z0-9]{6,20}(\.[A-Z0-9]{12,20})?$/,
    myntra: /^\d{5,10}$/,
    vijaysales: /^\d{4,8}$/,
    reliancedigital: /^[a-z0-9][a-z0-9-]{2,299}$/,
  };
  return shape[store].test(pid) ? { store, pid } : null;
}
