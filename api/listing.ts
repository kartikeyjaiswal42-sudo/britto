// Store search and best-seller lists, read by the server (BLUEPRINT §1 "truth about
// alternatives"; §2 rule 1). Only stores whose server reading is allowed ('yes') and whose
// reader carries a VERIFIED list rule are read, only pages the store's robots.txt allows
// (Amazon.in, checked 2026-11-03: /s?k= and /gp/bestsellers/ are not disallowed for "*"),
// with the same honest User-Agent as product pages and never a second, disguised try.
//
// A search page's price is what that list showed, labelled as such; it never enters a
// product's price history. History comes only from the product's own page (core/interpret.ts
// readPage), read when someone opens the product or by the scheduled re-check.
import { readListing, type Listing } from '../core/interpret.ts';
import type { PopularRule, ReaderConfig, SearchRule } from '../core/recipe.ts';
import { STORES, STORE_IDS } from '../core/stores.ts';
import type { Millis, StoreId } from '../core/types.ts';
import type { D1Database, Env } from './env.ts';
import { botUserAgent } from './fetcher.ts';
import { getReader } from './readers.ts';

/** A list page is read up to here at most (the results end well before: 410–760 KB measured). */
const MAX_LIST_BYTES = 1_200_000;
/** A search answer is reused for this long: the same words do not send a second request. */
export const SEARCH_CACHE_MS = 6 * 3_600_000;
/** Store searches one network may cause per hour (answers from the cache are free). */
export const SEARCHES_PER_HOUR = 40;
/** The catalogue the best-seller lists may grow to. Every product is re-read about twice a day
 * (core/schedule.ts), and the schedule reads ~1,900 pages a day; this leaves room for products
 * shoppers add themselves. */
export const CATALOGUE_CAP = 650;
/** New products one best-seller page may add. */
export const PER_POPULAR_PAGE = 30;

export type ListFetch =
  | { ok: true; items: Listing[]; status: 'listed' | 'blocked' | 'not_verified' | 'other_page' }
  | { ok: false; code: 'http_error' | 'timeout' | 'network' | 'reader_error'; httpStatus: number | null };

/** Fetch one list page and read it. Stops downloading at the rule's end marker. */
export async function fetchListing(config: ReaderConfig, rule: SearchRule | PopularRule, url: string, siteUrl: string | undefined): Promise<ListFetch> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': botUserAgent(siteUrl), Accept: 'text/html', 'Accept-Language': 'en-IN,en;q=0.8', 'Accept-Encoding': 'identity' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    return { ok: false, code: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', httpStatus: null };
  }
  if (res.status !== 200) {
    await res.body?.cancel();
    return { ok: false, code: 'http_error', httpStatus: res.status };
  }
  let html = '';
  try {
    html = await readUntil(res, rule.endsAt);
  } catch {
    return { ok: false, code: 'network', httpStatus: 200 };
  }
  try {
    const read = readListing(config, rule, html, res.url || url);
    return { ok: true, items: read.items, status: read.status };
  } catch (e) {
    console.error('list reader', config.store, e);
    return { ok: false, code: 'reader_error', httpStatus: null };
  }
}

/** Stream until `endsAt` has arrived (plus the tag it sits in), the page ends, or the cap. */
async function readUntil(res: Response, endsAt: string | undefined): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const from = Math.max(0, text.length - (endsAt?.length ?? 0));
      text += value;
      if (text.length > MAX_LIST_BYTES) break;
      if (endsAt && text.indexOf(endsAt, from) >= 0) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text;
}

/** Normalise the shopper's words: the cache key and what the store is asked. */
export function searchWords(q: string): string | null {
  const words = q.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}.+&'-]+/gu, ' ').trim().replace(/\s+/g, ' ');
  if (words.length < 2 || words.length > 80) return null;
  return words;
}

export interface StoreResults {
  store: StoreId;
  name: string;
  status: 'listed' | 'blocked' | 'failed' | 'busy';
  items: Listing[];
  /** When the list was read (an answer from the cache keeps its first time). */
  at: Millis | null;
}

/** Stores whose server reader has a verified search rule. */
export function searchableStores(): StoreId[] {
  return STORE_IDS.filter((s) => STORES[s].serverFetch === 'yes');
}

/**
 * One store's results for these words: from the cache when fresh, else read now (if the
 * network has searches left this hour). Nothing is written to the product tables.
 */
export async function storeSearch(env: Env, store: StoreId, words: string, allowFetch: () => Promise<boolean>, now: Millis): Promise<StoreResults | null> {
  const reader = await getReader(env, store, 'desktop', now);
  const rule = reader?.config.domRecipe.search;
  if (!reader || !rule || rule.verified == null) return null;
  const base = { store, name: STORES[store].name };
  const cached = await env.DB.prepare('SELECT at, json FROM search_cache WHERE store = ? AND q = ?').bind(store, words).first<{ at: number; json: string }>();
  if (cached && now - cached.at < SEARCH_CACHE_MS) {
    return { ...base, status: 'listed', items: JSON.parse(cached.json) as Listing[], at: cached.at };
  }
  if (!(await allowFetch())) return { ...base, status: 'busy', items: [], at: null };
  const url = rule.url.replace('{q}', encodeURIComponent(words).replace(/%20/g, '+'));
  const out = await fetchListing(reader.config, rule, url, env.SITE_URL);
  if (!out.ok || out.status !== 'listed') {
    console.warn('store search', store, out.ok ? out.status : `${out.code} ${out.httpStatus ?? ''}`);
    return { ...base, status: out.ok && out.status === 'blocked' ? 'blocked' : 'failed', items: [], at: null };
  }
  await env.DB.prepare('INSERT OR REPLACE INTO search_cache (store, q, at, json) VALUES (?, ?, ?, ?)')
    .bind(store, words, now, JSON.stringify(out.items)).run();
  return { ...base, status: 'listed', items: out.items, at: now };
}

/** Old cached searches go (run by the schedule). */
export async function sweepSearchCache(db: D1Database, now: Millis): Promise<void> {
  await db.prepare('DELETE FROM search_cache WHERE at < ?').bind(now - SEARCH_CACHE_MS).run();
}

/**
 * The best-seller page for this hour (one page an hour, store by store, list by list), its
 * products added to the catalogue without a price: the scheduled re-check reads each one's
 * own page, never trusting the list's price. Returns how many were new.
 */
export async function seedPopular(env: Env, now: Millis): Promise<{ url: string; added: number; status: string } | null> {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM products').first<{ n: number }>();
  if ((count?.n ?? 0) >= CATALOGUE_CAP) return null;
  const pages: { store: StoreId; url: string }[] = [];
  const configs = new Map<StoreId, { config: ReaderConfig; rule: PopularRule }>();
  for (const store of searchableStores()) {
    const reader = await getReader(env, store, 'desktop', now);
    const rule = reader?.config.domRecipe.popular;
    if (!reader || !rule || rule.verified == null) continue;
    configs.set(store, { config: reader.config, rule });
    for (const url of rule.urls) pages.push({ store, url });
  }
  if (!pages.length) return null;
  const pick = pages[Math.floor(now / 3_600_000) % pages.length]!;
  const { config, rule } = configs.get(pick.store)!;
  const out = await fetchListing(config, rule, pick.url, env.SITE_URL);
  if (!out.ok || out.status !== 'listed') return { url: pick.url, added: 0, status: out.ok ? out.status : out.code };
  const room = Math.max(0, CATALOGUE_CAP - (count?.n ?? 0));
  const items = out.items.slice(0, Math.min(PER_POPULAR_PAGE, room));
  if (!items.length) return { url: pick.url, added: 0, status: 'listed' };
  await env.DB.batch(items.map((i) =>
    env.DB.prepare('INSERT OR IGNORE INTO products (key, store, pid, url, title, image, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(i.key, i.store, i.pid, i.url, i.title, i.image, now)));
  // Counted, not summed from meta.changes: the title-search triggers' writes count there too.
  const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM products').first<{ n: number }>();
  return { url: pick.url, added: (after?.n ?? 0) - (count?.n ?? 0), status: 'listed' };
}
