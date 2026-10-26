import type { HistoryStats, Millis, Paise, PricePoint } from './types.ts';

export const DAY: Millis = 86_400_000;

/** A run of time during which one price held. */
export interface Span {
  from: Millis;
  to: Millis;
  price: Paise | null;
  inStock: boolean;
}

/**
 * Points are price CHANGES. Each one holds until the next, and the last holds until
 * `lastCheckedAt` — never until "now": after the last check we do not know the price.
 * Points must be sorted by `at`; spans outside [start, end) are clipped away.
 */
export function spans(points: readonly PricePoint[], lastCheckedAt: Millis | null, start = -Infinity, end = Infinity): Span[] {
  const out: Span[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const next = points[i + 1];
    const to = next ? next.at : Math.max(lastCheckedAt ?? p.at, p.at);
    const a = Math.max(p.at, start);
    const b = Math.min(to, end);
    if (b > a) out.push({ from: a, to: b, price: p.price, inStock: p.inStock });
  }
  return out;
}

/** Time-weighted quantile (0..1) of the prices across spans; null when no priced time. */
export function weightedQuantile(ss: readonly Span[], q: number): Paise | null {
  const priced = ss.filter((s) => s.price != null && s.inStock).map((s) => ({ price: s.price!, w: s.to - s.from }));
  const total = priced.reduce((n, s) => n + s.w, 0);
  if (total <= 0) return null;
  priced.sort((x, y) => x.price - y.price);
  let acc = 0;
  for (const s of priced) {
    acc += s.w;
    if (acc >= total * q) return s.price;
  }
  return priced[priced.length - 1]!.price;
}

export function weightedMean(ss: readonly Span[]): Paise | null {
  let w = 0;
  let sum = 0;
  for (const s of ss) {
    if (s.price == null || !s.inStock) continue;
    const d = s.to - s.from;
    w += d;
    sum += s.price * d;
  }
  return w > 0 ? Math.round(sum / w) : null;
}

/** Total priced, in-stock time in the spans. */
export function pricedTime(ss: readonly Span[]): Millis {
  return ss.reduce((n, s) => n + (s.price != null && s.inStock ? s.to - s.from : 0), 0);
}

export function stats(points: readonly PricePoint[], lastCheckedAt: Millis | null): HistoryStats {
  const first = points[0];
  const last = points[points.length - 1];
  const empty: HistoryStats = {
    trackedSince: null, lastCheckedAt, daysTracked: 0, current: null, currentMrp: null, inStock: null,
    currentSince: null, lowest: null, highest: null, average: null, median: null, changes: 0, percentile: null,
  };
  if (!first || !last) return empty;

  const end = Math.max(lastCheckedAt ?? last.at, last.at);
  const ss = spans(points, end);

  let lowest: HistoryStats['lowest'] = null;
  let highest: HistoryStats['highest'] = null;
  for (const p of points) {
    if (p.price == null || !p.inStock) continue;
    if (!lowest || p.price < lowest.price) lowest = { price: p.price, at: p.at };
    if (!highest || p.price > highest.price) highest = { price: p.price, at: p.at };
  }

  const current = last.inStock ? last.price : null;
  let percentile: number | null = null;
  const total = pricedTime(ss);
  if (current != null && total > 0) {
    const below = ss.reduce((n, s) => n + (s.price != null && s.inStock && s.price < current ? s.to - s.from : 0), 0);
    percentile = below / total;
  }

  return {
    trackedSince: first.at,
    lastCheckedAt: end,
    daysTracked: (end - first.at) / DAY,
    current,
    currentMrp: last.mrp,
    inStock: last.inStock,
    currentSince: last.at,
    lowest,
    highest,
    // With no elapsed time yet (a product seen once) the only honest average is the one price seen.
    average: weightedMean(ss) ?? (current ?? null),
    median: weightedQuantile(ss, 0.5) ?? (current ?? null),
    changes: points.length - 1,
    percentile,
  };
}

/**
 * Should a new observation be stored as a point? Only when something a shopper would
 * see changed. Otherwise the caller just moves `lastCheckedAt` forward — one row
 * update instead of one row insert per check, which is what keeps the free D1 write
 * allowance (100,000 rows/day) from being spent on "still ₹265".
 */
export function isChange(prev: PricePoint | undefined, next: Pick<PricePoint, 'price' | 'mrp' | 'inStock'>): boolean {
  if (!prev) return true;
  return prev.price !== next.price || prev.mrp !== next.mrp || prev.inStock !== next.inStock;
}
