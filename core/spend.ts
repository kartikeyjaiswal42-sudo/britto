// Spend Lens (BLUEPRINT §13): what the shopper spent, built from their OWN order-history pages,
// on their own device. Rule 5: raw orders never leave the device. The arithmetic (dates, merge,
// summary) lives in web/spend.js so the /spend page and the readers run the same code; this
// module adds the types and the check of what a client may keep. Nothing here touches the
// network. It is the one place BLUEPRINT puts arithmetic on a client, because the alternative
// is uploading someone's order history.
import { mergeOrders as mergeAny, parseOrderDate, summarize as summarizeAny } from '../web/spend.js';
import { STORE_IDS } from './stores.ts';
import type { Paise, StoreId } from './types.ts';

export { parseOrderDate };

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

/** Add a page's orders to the ones kept; the same store + order number replaces, never doubles. */
export const mergeOrders = (kept: readonly Order[], read: readonly Order[]): Order[] => mergeAny(kept, read);

/** Totals by month (newest first) and by store (biggest first). */
export const summarize = (orders: readonly Order[]): SpendSummary => summarizeAny(orders) as SpendSummary;

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
