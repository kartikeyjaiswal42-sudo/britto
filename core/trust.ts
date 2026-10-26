import { isChange } from './history.ts';
import type { Millis, Paise, PricePoint } from './types.ts';

// When to believe a price reported by the browser extension. Anyone can send one, so a
// report is a CLAIM. The rules, in order:
//   1. Same price as the latest point, re-reported within 10 minutes: not written at all.
//   2. Nothing known yet about the product: accepted (there is nothing to compare with).
//   3. A move of 40% or more from the last known price needs a SECOND, independent reporter
//      (a different network) to report the same price (within 2%) inside 48 hours. Until
//      then it is held, not shown. A real crash is confirmed by the next shopper; one
//      person's forged ₹1 is not.
//   4. Anything else is accepted.
// Residual risk, stated: a forger can still nudge a price by up to 40%, one product at a time,
// within the per-network rate limits. Stores the server can read are re-checked by it soon
// after any accepted change, so for them the server's own reading has the last word.

export const TRUST = {
  bigMove: 0.4,
  agree: 0.02,
  confirmWindow: 48 * 3_600_000,
  dedupe: 10 * 60_000,
  minPrice: 100,            // ₹1
  maxPrice: 1_000_000_000,  // ₹1 crore
} as const;

export interface Observed {
  price: Paise | null;
  mrp: Paise | null;
  inStock: boolean;
}

export interface HeldReport {
  reporter: string;
  at: Millis;
  price: Paise | null;
  inStock: boolean;
}

export type TrustDecision =
  | { action: 'accept'; reason: 'first' | 'small_change' | 'unchanged' | 'stock_change' | 'confirmed' }
  | { action: 'hold'; reason: 'big_move' }
  | { action: 'skip'; reason: 'duplicate' };

export function judgeObservation(
  points: readonly PricePoint[],
  lastCheckedAt: Millis | null,
  obs: Observed,
  reporter: string,
  held: readonly HeldReport[],
  now: Millis,
): TrustDecision {
  const last = points[points.length - 1];
  if (!last) return { action: 'accept', reason: 'first' };

  if (!isChange(last, obs)) {
    if (lastCheckedAt != null && now - lastCheckedAt < TRUST.dedupe) return { action: 'skip', reason: 'duplicate' };
    return { action: 'accept', reason: 'unchanged' };
  }

  // Going out of stock / losing the price: low harm, common, accepted.
  if (obs.price == null || !obs.inStock) return { action: 'accept', reason: 'stock_change' };

  let ref: Paise | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    if (p.price != null && p.inStock) { ref = p.price; break; }
  }
  if (ref == null) return { action: 'accept', reason: 'stock_change' };

  const move = Math.abs(obs.price - ref) / ref;
  if (move < TRUST.bigMove) return { action: 'accept', reason: 'small_change' };

  const confirmed = held.some(
    (h) => h.reporter !== reporter && h.inStock && h.price != null && now - h.at <= TRUST.confirmWindow &&
      Math.abs(h.price - obs.price!) / obs.price! <= TRUST.agree,
  );
  return confirmed ? { action: 'accept', reason: 'confirmed' } : { action: 'hold', reason: 'big_move' };
}

/** Shape check of an extension report. Returns a cleaned copy, or a reason it is refused. */
export function cleanObserved(input: unknown): { ok: true; obs: Observed & { title: string | null; image: string | null } } | { ok: false; reason: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'observed must be an object' };
  const o = input as Record<string, unknown>;
  const status = o['status'];
  if (status !== 'priced' && status !== 'unavailable') return { ok: false, reason: 'status must be "priced" or "unavailable"' };
  const intIn = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= TRUST.minPrice && (v as number) <= TRUST.maxPrice;

  let price: Paise | null = null;
  let mrp: Paise | null = null;
  if (status === 'priced') {
    if (!intIn(o['price'])) return { ok: false, reason: `price must be whole paise between ${TRUST.minPrice} and ${TRUST.maxPrice}` };
    price = o['price'];
    // An M.R.P. below the price is not an M.R.P.; drop it rather than refuse the report.
    mrp = intIn(o['mrp']) && o['mrp'] >= price ? o['mrp'] : null;
  }
  const title = typeof o['title'] === 'string' ? o['title'].replace(/\s+/g, ' ').trim().slice(0, 300) || null : null;
  return { ok: true, obs: { price, mrp, inStock: status === 'priced', title, image: cleanImage(o['image']) } };
}

const IMAGE_HOSTS = [/^m\.media-amazon\.com$/, /^rukminim\d*\.flixcart\.com$/, /^assets\.myntassets\.com$/, /^vsprod\.vijaysales\.com$/, /^cdn\.jiostore\.online$/];

/** Only https images from the stores' own image hosts; anything else becomes null. */
export function cleanImage(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 600) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && IMAGE_HOSTS.some((re) => re.test(u.hostname)) ? u.toString() : null;
  } catch {
    return null;
  }
}
