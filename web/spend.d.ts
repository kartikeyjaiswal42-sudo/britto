// Types for web/spend.js (plain JS, run by the site in the browser), for TypeScript callers.
export interface SpendOrder { store: string; orderId: string; date: string; total: number; items: string[] }
export interface SpendRow { total: number; orders: number }
export interface SpendSummary {
  orders: number;
  total: number;
  first: string | null;
  last: string | null;
  byMonth: ({ month: string } & SpendRow)[];
  byStore: ({ store: string } & SpendRow)[];
}

export function parseOrderDate(text: string | null | undefined): string | null;
export function mergeOrders<T extends SpendOrder>(kept: readonly T[], read: readonly T[]): T[];
export function summarize(orders: readonly SpendOrder[]): SpendSummary;
