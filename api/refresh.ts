// Reading a product and adding one by its link: shared by the website's API, the scheduled
// re-check and the Telegram bot, so every way in follows the same rules.
import { confirmIdentity } from '../core/extract.ts';
import { STORES, STORE_IDS, parseKey, parseProductLink, type ParsedLink } from '../core/stores.ts';
import { evaluateAlerts } from './alerts.ts';
import { getProduct, insertProduct, rateLimit, recordFailure, recordObservation, type ProductRow } from './db.ts';
import type { Ctx, Env } from './env.ts';
import { fetchProduct, resolveShortLink } from './fetcher.ts';
import { countReading, getReader } from './readers.ts';

/** reader_version recorded for the Worker's own readings. */
export const WORKER_READER = 'worker';

/** New products one client (a network, or a Telegram chat) may add per hour. */
export const ADDS_PER_HOUR = 30;

/**
 * Read now, if this store lets our server read it. Failure is recorded, not thrown. A product
 * with alerts has them re-evaluated on every successful read, not only on a change: an
 * extension report may have shown the new price first, and this read is what confirms it.
 */
export async function refresh(env: Env, row: Pick<ProductRow, 'key' | 'store' | 'url'> & { watchers?: number }, now: number): Promise<string> {
  if (STORES[row.store].serverFetch !== 'yes') return 'not_server_readable';
  const reader = await getReader(env, row.store, 'desktop', now);
  if (!reader) return 'no_reader';
  const health = (outcome: string) => countReading(env.DB, { store: row.store, source: 'server', configVersion: reader.version, readerVersion: WORKER_READER, outcome }, now);
  const out = await fetchProduct(reader.config, row.url, env.SITE_URL);
  if (!out.ok) {
    const status = out.httpStatus ? `${out.code}_${out.httpStatus}` : out.code;
    await recordFailure(env.DB, row.key, status, now);
    await health(status);
    return out.code;
  }
  // A redirect can land on another item: only a page that names THIS product counts.
  const ex = confirmIdentity(row.store, parseKey(row.key)?.pid ?? '', out.extracted, reader.config.reportsPid);
  await health(ex.status);
  if (ex.status === 'priced' || ex.status === 'unavailable') {
    await recordObservation(env.DB, row.key, ex, 'server', now);
    if ((row.watchers ?? 0) > 0) await evaluateAlerts(env, row.key, now);
  } else {
    await recordFailure(env.DB, row.key, ex.status, now);
  }
  return ex.status;
}

export type LinkOutcome =
  | { ok: true; link: ParsedLink }
  | { ok: false; status: number; code: string; message: string };

export const STORE_LIST = STORE_IDS.map((s) => STORES[s].name).join(', ');

/** A pasted link to a product key, following a store's own short links (amzn.in). */
export async function resolveLink(env: Env, input: string): Promise<LinkOutcome> {
  const parsed = parseProductLink(input);
  if (parsed.ok) return parsed;
  if (parsed.reason === 'short_link') {
    const resolved = await resolveShortLink(parsed.store, parsed.url, env.SITE_URL);
    if (resolved) return { ok: true, link: resolved };
    return { ok: false, status: 422, code: 'short_link_unresolved', message: 'We could not follow that short link to a product page. Paste the full product link instead.' };
  }
  const messages: Record<string, string> = {
    not_a_url: 'That does not look like a link.',
    unsupported_store: `We support ${STORE_LIST} so far.`,
    not_a_product: 'That link is not a single product page. Open the product and copy its link.',
  };
  return { ok: false, status: 422, code: parsed.reason, message: messages[parsed.reason] ?? 'Unsupported link.' };
}

export type AddOutcome =
  | { ok: true; created: boolean; row: ProductRow }
  | { ok: false; status: number; code: string; message: string };

/** Track a product (or find it already tracked). `limiter` names who is adding, for the hourly cap. */
export async function addProduct(env: Env, link: ParsedLink, limiter: string, now: number): Promise<AddOutcome> {
  const existing = await getProduct(env.DB, link.key);
  if (existing) return { ok: true, created: false, row: existing };
  if (!(await rateLimit(env.DB, `add:${limiter}`, ADDS_PER_HOUR, 3_600_000, now))) {
    return { ok: false, status: 429, code: 'rate_limited', message: `You can add ${ADDS_PER_HOUR} new products an hour. Products already tracked open without limit.` };
  }
  await insertProduct(env.DB, link, now);
  await refresh(env, link, now);
  const row = await getProduct(env.DB, link.key);
  if (!row) return { ok: false, status: 500, code: 'insert_failed', message: 'The product could not be saved.' };
  return { ok: true, created: true, row };
}

/** Run work after the response without losing its errors. */
export function background(ctx: Ctx, label: string, work: Promise<unknown>): void {
  ctx.waitUntil(work.catch((e) => console.error(label, e)));
}
