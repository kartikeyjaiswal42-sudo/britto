// Spend Lens (BLUEPRINT §13), the part the browser needs: order dates, merging, and the summary.
// Plain JS so the /spend page runs it as-is; core/spend.ts re-exports it for the readers and the
// tests (one copy, so the page and the readers cannot disagree). Pure: nothing here touches the
// network. Rule 5: the shopper's orders are summed where they are kept, on their own device.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * An order date as stores print it ("29 October 2026", "29 Oct 2026", "October 29, 2026",
 * "29/10/2026") to YYYY-MM-DD, or null. A day that does not exist (30 February) is null, not
 * the 2nd of March.
 */
export function parseOrderDate(text) {
  if (!text) return null;
  const s = text.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  let d, m, y;
  let hit = /\b(\d{1,2}) ([a-z]{3,9})\.? (\d{4})\b/.exec(s);
  if (hit) [d, m, y] = [Number(hit[1]), MONTHS.indexOf(hit[2].slice(0, 3)) + 1, Number(hit[3])];
  else if ((hit = /\b([a-z]{3,9})\.? (\d{1,2}) (\d{4})\b/.exec(s))) [m, d, y] = [MONTHS.indexOf(hit[1].slice(0, 3)) + 1, Number(hit[2]), Number(hit[3])];
  else if ((hit = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  if (!d || !m || !y || m < 1 || m > 12) return null;
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Add a page's orders to the ones already kept. The same order read again (same store and
 * order number) replaces the earlier reading: it is never counted twice.
 */
export function mergeOrders(kept, read) {
  const byKey = new Map();
  for (const o of [...kept, ...read]) byKey.set(`${o.store}:${o.orderId}`, o);
  return [...byKey.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.orderId.localeCompare(b.orderId)));
}

/** Totals by month (newest first) and by store (biggest first). */
export function summarize(orders) {
  const months = new Map();
  const stores = new Map();
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
