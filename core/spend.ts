// Spend Lens (BLUEPRINT §13): what the shopper spent, built from their OWN order-history pages,
// on their own device. Rule 5: raw orders never leave the device; this module is pure, so the
// app and the extension compute the summary where the orders are, and nothing here touches the
// network. It is the one place BLUEPRINT puts arithmetic on a client, because the alternative
// is uploading someone's order history.
import { STORE_IDS } from './stores.ts';
import type { Paise, StoreId } from './types.ts';

/** One order as the store's order-history page shows it. */
export interface Order {
  store: StoreId;
  /** The store's own order number, as printed. */
  orderId: string;
  /** The day it was placed, YYYY-MM-DD. */
  date: string;
  /** The order total the page shows, in paise. */
  total: Paise;
  /** Item names the page lists for it (may be empty). */
  items: string[];
}

export interface SpendRow { total: Paise; orders: number }

export interface SpendSummary {
  orders: number;
  total: Paise;
  /** First and last order day, or null when there are no orders. */
  first: string | null;
  last: string | null;
  /** Newest month first: "2026-10". */
  byMonth: ({ month: string } & SpendRow)[];
  /** Biggest spend first. */
  byStore: ({ store: StoreId } & SpendRow)[];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * An order date as stores print it ("29 October 2026", "29 Oct 2026", "October 29, 2026",
 * "29/10/2026") to YYYY-MM-DD, or null. A day that does not exist (30 February) is null, not
 * the 2nd of March.
 */
export function parseOrderDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  let d: number | undefined, m: number | undefined, y: number | undefined;
  let hit = /\b(\d{1,2}) ([a-z]{3,9})\.? (\d{4})\b/.exec(s);
  if (hit) [d, m, y] = [Number(hit[1]), MONTHS.indexOf(hit[2]!.slice(0, 3)) + 1, Number(hit[3])];
  else if ((hit = /\b([a-z]{3,9})\.? (\d{1,2}) (\d{4})\b/.exec(s))) [m, d, y] = [MONTHS.indexOf(hit[1]!.slice(0, 3)) + 1, Number(hit[2]), Number(hit[3])];
  else if ((hit = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  if (!d || !m || !y || m < 1 || m > 12) return null;
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A real calendar day written YYYY-MM-DD. */
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && parseOrderDate(`${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`) === s;

/** Is this a well-formed order (what a client may keep)? */
export function isOrder(o: unknown): o is Order {
  if (!o || typeof o !== 'object') return false;
  const x = o as Record<string, unknown>;
  return STORE_IDS.includes(x['store'] as StoreId)
    && typeof x['orderId'] === 'string' && x['orderId'].length > 0 && x['orderId'].length <= 64
    && typeof x['date'] === 'string' && isDay(x['date'])
    && Number.isSafeInteger(x['total']) && (x['total'] as number) >= 0
    && Array.isArray(x['items']) && x['items'].length <= 50 && x['items'].every((i) => typeof i === 'string' && i.length <= 200);
}

/**
 * Add a page's orders to the ones already kept. The same order read again (same store and
 * order number) replaces the earlier reading: it is never counted twice.
 */
export function mergeOrders(kept: readonly Order[], read: readonly Order[]): Order[] {
  const byKey = new Map<string, Order>();
  for (const o of [...kept, ...read]) byKey.set(`${o.store}:${o.orderId}`, o);
  return [...byKey.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.orderId.localeCompare(b.orderId)));
}

/** Totals by month and by store. */
export function summarize(orders: readonly Order[]): SpendSummary {
  const months = new Map<string, SpendRow>();
  const stores = new Map<StoreId, SpendRow>();
  let total = 0;
  for (const o of orders) {
    total += o.total;
    const month = o.date.slice(0, 7);
    const m = months.get(month) ?? { total: 0, orders: 0 };
    months.set(month, { total: m.total + o.total, orders: m.orders + 1 });
    const s = stores.get(o.store) ?? { total: 0, orders: 0 };
    stores.set(o.store, { total: s.total + o.total, orders: s.orders + 1 });
  }
  const days = orders.map((o) => o.date).sort();
  return {
    orders: orders.length,
    total,
    first: days[0] ?? null,
    last: days.at(-1) ?? null,
    byMonth: [...months].map(([month, r]) => ({ month, ...r })).sort((a, b) => b.month.localeCompare(a.month)),
    byStore: [...stores].map(([store, r]) => ({ store, ...r })).sort((a, b) => b.total - a.total || a.store.localeCompare(b.store)),
  };
}
