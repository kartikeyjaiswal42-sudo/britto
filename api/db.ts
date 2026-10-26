import { isChange, stats } from '../core/history.ts';
import { saleCheck, verdict } from '../core/judge.ts';
import { STORES, type ParsedLink } from '../core/stores.ts';
import { TRUST, type HeldReport, type Observed } from '../core/trust.ts';
import type { Extracted, Millis, PricePoint, ProductCard, ProductKey, ProductView, SaleStatus, StoreId } from '../core/types.ts';
import type { D1Database } from './env.ts';

export interface ProductRow {
  key: string;
  store: StoreId;
  pid: string;
  url: string;
  title: string | null;
  image: string | null;
  created_at: number;
  last_checked_at: number | null;
  last_attempt_at: number | null;
  fail_count: number;
  last_status: string | null;
  price: number | null;
  mrp: number | null;
  in_stock: number | null;
  usual_price: number | null;
  real_pct: number | null;
  sale_status: SaleStatus | null;
  watchers: number;
  views: number;
}

interface PriceRow { at: number; price: number | null; mrp: number | null; in_stock: number; source: 'server' | 'extension' }

/** How much history a product page loads. ~2 years of daily changes. */
const MAX_POINTS = 800;

export async function getProduct(db: D1Database, key: ProductKey): Promise<ProductRow | null> {
  return db.prepare('SELECT * FROM products WHERE key = ?').bind(key).first<ProductRow>();
}

export async function insertProduct(db: D1Database, link: ParsedLink, now: Millis): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO products (key, store, pid, url, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(link.key, link.store, link.pid, link.url, now)
    .run();
}

export async function loadPoints(db: D1Database, key: ProductKey): Promise<PricePoint[]> {
  const { results } = await db
    .prepare('SELECT at, price, mrp, in_stock, source FROM (SELECT * FROM prices WHERE key = ? ORDER BY at DESC LIMIT ?) ORDER BY at')
    .bind(key, MAX_POINTS)
    .all<PriceRow>();
  return results.map((r) => ({ at: r.at, price: r.price, mrp: r.mrp, inStock: r.in_stock === 1, source: r.source }));
}

/**
 * Store one successful read. Writes a price point only on a visible change; always moves
 * last_checked_at; recomputes the denormalised sale fields the lists use.
 */
export async function recordObservation(
  db: D1Database,
  key: ProductKey,
  ex: Extracted,
  source: 'server' | 'extension',
  now: Millis,
  loaded?: PricePoint[],
): Promise<boolean> {
  const points = loaded ? [...loaded] : await loadPoints(db, key);
  const obs = { price: ex.status === 'priced' ? ex.price : null, mrp: ex.mrp, inStock: ex.status === 'priced' && ex.inStock === true };
  const statements = [];
  if (isChange(points[points.length - 1], obs)) {
    const point: PricePoint = { at: now, ...obs, source };
    points.push(point);
    statements.push(
      db.prepare('INSERT OR IGNORE INTO prices (key, at, price, mrp, in_stock, source) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(key, now, point.price, point.mrp, point.inStock ? 1 : 0, source),
    );
  }
  const changed = statements.length > 0;
  const sale = saleCheck(points, now);
  // The server's reading may rename a product; an extension report only fills a blank title
  // or image (anyone can send one, and nobody should be able to rename a product).
  const meta = source === 'server'
    ? 'title = COALESCE(?, title), image = COALESCE(?, image)'
    : 'title = COALESCE(title, ?), image = COALESCE(image, ?)';
  statements.push(
    db.prepare(
      `UPDATE products SET ${meta},
         price = ?, mrp = ?, in_stock = ?, last_checked_at = ?, last_attempt_at = ?, fail_count = 0, last_status = ?,
         usual_price = ?, real_pct = ?, sale_status = ?
       WHERE key = ?`,
    ).bind(ex.title, ex.image, obs.price, obs.mrp, obs.inStock ? 1 : 0, now, now, ex.status, sale.usualPrice, sale.realPct, sale.status, key),
  );
  await db.batch(statements);
  return changed;
}

export async function loadHeld(db: D1Database, key: ProductKey): Promise<HeldReport[]> {
  const { results } = await db
    .prepare('SELECT reporter, at, price, in_stock FROM reports WHERE key = ?')
    .bind(key)
    .all<{ reporter: string; at: number; price: number | null; in_stock: number }>();
  return results.map((r) => ({ reporter: r.reporter, at: r.at, price: r.price, inStock: r.in_stock === 1 }));
}

export async function holdReport(db: D1Database, key: ProductKey, reporter: string, obs: Observed, now: Millis): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reports (key, reporter, at, price, mrp, in_stock) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (key, reporter) DO UPDATE SET at = excluded.at, price = excluded.price, mrp = excluded.mrp, in_stock = excluded.in_stock`,
    )
    .bind(key, reporter, now, obs.price, obs.mrp, obs.inStock ? 1 : 0)
    .run();
}

export async function clearHeld(db: D1Database, key: ProductKey): Promise<void> {
  await db.prepare('DELETE FROM reports WHERE key = ?').bind(key).run();
}

/** Ask the scheduled re-check to read this product soon (it orders never-tried first). */
export async function markRecheck(db: D1Database, key: ProductKey): Promise<void> {
  await db.prepare('UPDATE products SET last_attempt_at = NULL WHERE key = ?').bind(key).run();
}

export async function recordFailure(db: D1Database, key: ProductKey, status: string, now: Millis): Promise<void> {
  await db
    .prepare('UPDATE products SET last_attempt_at = ?, fail_count = fail_count + 1, last_status = ? WHERE key = ?')
    .bind(now, status, key)
    .run();
}

function pendingReason(row: ProductRow, hasPoints: boolean): string | null {
  if (hasPoints) return null;
  const store = STORES[row.store];
  if (store.serverFetch !== 'yes') {
    return `${store.name} does not let our server read its pages, so its prices come from shoppers' browsers through the Britto extension. Nobody with the extension has opened this product yet.`;
  }
  if (row.last_attempt_at == null) return 'Waiting for the first price check.';
  return `We could not read the price yet (${row.last_status ?? 'unknown'}). We will try again automatically.`;
}

export async function productView(db: D1Database, row: ProductRow): Promise<ProductView> {
  const points = await loadPoints(db, row.key);
  const s = stats(points, row.last_checked_at);
  const store = STORES[row.store];
  return {
    key: row.key,
    store: { id: store.id, name: store.name, serverFetch: store.serverFetch },
    url: row.url,
    title: row.title,
    image: row.image,
    points,
    stats: s,
    verdict: verdict(s),
    sale: saleCheck(points, row.last_checked_at),
    pending: pendingReason(row, points.length > 0),
  };
}

export function card(row: ProductRow): ProductCard {
  return {
    key: row.key,
    store: row.store,
    title: row.title,
    image: row.image,
    price: row.price,
    mrp: row.mrp,
    inStock: row.in_stock == null ? null : row.in_stock === 1,
    usualPrice: row.usual_price,
    realPct: row.real_pct,
    saleStatus: row.sale_status,
    lastCheckedAt: row.last_checked_at,
  };
}

/** Turn free text into a safe FTS5 query: each word a quoted prefix term, all required. */
export function ftsQuery(q: string): string | null {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  if (!words.length) return null;
  return words.map((w) => `"${w}"*`).join(' ');
}

export async function search(db: D1Database, q: string, limit = 30): Promise<ProductCard[]> {
  const match = ftsQuery(q);
  if (!match) return [];
  const { results } = await db
    .prepare(
      `SELECT p.* FROM products_fts f JOIN products p ON p.rowid = f.rowid
       WHERE products_fts MATCH ? ORDER BY bm25(products_fts) LIMIT ?`,
    )
    .bind(match, limit)
    .all<ProductRow>();
  return results.map(card);
}

export async function deals(db: D1Database, limit = 48): Promise<ProductCard[]> {
  const { results } = await db
    .prepare(`SELECT * FROM products WHERE sale_status = 'real_drop' AND in_stock = 1 ORDER BY real_pct DESC LIMIT ?`)
    .bind(limit)
    .all<ProductRow>();
  return results.map(card);
}

export async function recent(db: D1Database, limit = 24): Promise<ProductCard[]> {
  const { results } = await db
    .prepare('SELECT * FROM products WHERE title IS NOT NULL ORDER BY created_at DESC LIMIT ?')
    .bind(limit)
    .all<ProductRow>();
  return results.map(card);
}

export async function popular(db: D1Database, limit = 24): Promise<ProductCard[]> {
  const { results } = await db
    .prepare('SELECT * FROM products WHERE title IS NOT NULL ORDER BY views DESC, created_at DESC LIMIT ?')
    .bind(limit)
    .all<ProductRow>();
  return results.map(card);
}

/** Candidates for the scheduled re-check: server-readable stores, least recently tried first. */
export async function refreshCandidates(db: D1Database, stores: StoreId[], limit = 200): Promise<ProductRow[]> {
  if (!stores.length) return [];
  const { results } = await db
    .prepare(
      `SELECT * FROM products WHERE store IN (${stores.map(() => '?').join(',')})
       ORDER BY last_attempt_at IS NOT NULL, last_attempt_at LIMIT ?`,
    )
    .bind(...stores, limit)
    .all<ProductRow>();
  return results;
}

/**
 * Fixed-window counter. Returns true when the action is allowed. One row write per call.
 */
export async function rateLimit(db: D1Database, bucket: string, max: number, windowMs: number, now: Millis): Promise<boolean> {
  const start = Math.floor(now / windowMs) * windowMs;
  const row = await db
    .prepare(
      `INSERT INTO rate (bucket, count, expires) VALUES (?, 1, ?)
       ON CONFLICT (bucket) DO UPDATE SET count = count + 1 RETURNING count`,
    )
    .bind(`${bucket}:${start}`, start + windowMs)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= max;
}

export async function sweepRate(db: D1Database, now: Millis): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM rate WHERE expires < ?').bind(now),
    db.prepare('DELETE FROM reports WHERE at < ?').bind(now - TRUST.confirmWindow),
  ]);
}
