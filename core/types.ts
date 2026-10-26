// THE CONTRACT. Every other module, the Worker, the web app, the extension and the
// Claude Design UI build against these shapes. Change additively, and update
// CONTRACT.md in the same commit.

/** Money is integer paise everywhere. ₹265.00 = 26500. Never a float rupee. */
export type Paise = number;

/** Milliseconds since the Unix epoch. */
export type Millis = number;

export type StoreId = 'amazon' | 'flipkart' | 'myntra';

/** `${StoreId}:${store's own product id}` — e.g. "amazon:B09X5DK382". */
export type ProductKey = string;

/**
 * Can OUR SERVER read this store's product pages, identifying itself honestly?
 * Measured, never assumed (see `measured` on the Store). We never disguise the
 * fetcher or work around a store's bot defences: a store that refuses us is
 * covered by the browser extension, which reads the page the shopper is viewing.
 */
export type ServerFetch = 'yes' | 'refused' | 'no_answer' | 'untested';

export interface Store {
  id: StoreId;
  name: string;
  /** Hostnames we accept product links from (exact match, lower-case). */
  hosts: readonly string[];
  /** Link-shortener hosts whose redirect must be followed to reach a product URL. */
  shortHosts: readonly string[];
  serverFetch: ServerFetch;
  /** What was measured, when, and what came back. Shown on the stores page. */
  measured: string;
}

/** What one read of a product page produced. */
export type ExtractStatus =
  | 'priced'        // a price the shopper would pay, and stock state
  | 'unavailable'   // the page says the item cannot be bought now; price is null
  | 'blocked'       // the store answered with a bot wall / error page, not the product
  | 'unrecognised'; // a page we could not read — never guessed

export interface Extracted {
  status: ExtractStatus;
  title: string | null;
  price: Paise | null;
  /** The store's "M.R.P." / list price, when shown. */
  mrp: Paise | null;
  inStock: boolean | null;
  image: string | null;
  /**
   * The product id the PAGE says it is showing (Amazon ASIN, Myntra style id). Compared with
   * the link by confirmIdentity(): a single-page store can still show the previous product
   * for a moment after the address changes, and a redirect can land on another item.
   */
  pid: string | null;
  /** Which rule produced the result — for debugging, and shown nowhere to shoppers. */
  rule: string;
}

/**
 * One stored price change. A point is written only when price, mrp or stock state
 * CHANGES; between points the price is known to have held, up to the product's
 * `lastCheckedAt`. So the history is a step function, not a list of samples.
 */
export interface PricePoint {
  at: Millis;
  price: Paise | null; // null = not purchasable at that time
  mrp: Paise | null;
  inStock: boolean;
  source: 'server' | 'extension';
}

export interface HistoryStats {
  trackedSince: Millis | null;
  lastCheckedAt: Millis | null;
  /** Days between the first point and lastCheckedAt. */
  daysTracked: number;
  current: Paise | null;
  currentMrp: Paise | null;
  inStock: boolean | null;
  /** When the current price started. */
  currentSince: Millis | null;
  lowest: { price: Paise; at: Millis } | null;
  highest: { price: Paise; at: Millis } | null;
  /** Time-weighted over every priced interval. */
  average: Paise | null;
  /** Time-weighted median ("the usual price"). */
  median: Paise | null;
  /** Number of recorded price changes after the first point. */
  changes: number;
  /** Share of priced time the price was strictly BELOW the current price. 0 = lowest ever. */
  percentile: number | null;
}

export type VerdictKind = 'buy' | 'fair' | 'wait' | 'too_early' | 'unavailable';

export interface Verdict {
  kind: VerdictKind;
  headline: string;
  /** Plain-English reasons, each carrying its own numbers. */
  reasons: string[];
}

/**
 * The "is this sale real?" check. A discount is judged against the product's OWN
 * usual price, not against the M.R.P. printed beside it.
 */
export type SaleStatus =
  | 'real_drop'        // at least 5% below its usual price
  | 'hike_then_drop'   // price was raised shortly before, and the "drop" lands near the old usual price
  | 'no_real_drop'     // within 5% of its usual price
  | 'too_early'        // not enough history to know the usual price — NOT "clean"
  | 'unavailable';

export interface SaleCheck {
  status: SaleStatus;
  /** Discount the store claims, vs its M.R.P. 0.77 = 77%. */
  claimedPct: number | null;
  /** Discount vs the product's usual price (time-weighted median, 30 days, last 48 h excluded). */
  realPct: number | null;
  usualPrice: Paise | null;
  /** The store's claimed discount is at least 3x the real one, and at least 30%. */
  mrpInflated: boolean | null;
  /** For hike_then_drop: the raised price and when it started. */
  hike: { from: Paise; to: Paise; at: Millis } | null;
  explanation: string;
}

export type AlertRule =
  | { kind: 'below'; target: Paise }
  | { kind: 'drop'; pct: number }
  | { kind: 'in_stock' };

export interface AlertState {
  rule: AlertRule;
  armed: boolean;
  /** For 'drop': the price the drop is measured from (price when set, or when last fired). */
  basePrice: Paise | null;
  lastFiredAt: Millis | null;
}

export interface AlertDecision {
  fire: boolean;
  message: string | null;
  next: AlertState;
}

/** Everything the product page needs, in one response. */
export interface ProductView {
  key: ProductKey;
  store: { id: StoreId; name: string; serverFetch: ServerFetch };
  url: string;
  title: string | null;
  image: string | null;
  points: PricePoint[];
  stats: HistoryStats;
  verdict: Verdict;
  sale: SaleCheck;
  /** Why there is no price yet, when there is none. */
  pending: string | null;
}

/** A row in search results, deal lists and "recently tracked". */
export interface ProductCard {
  key: ProductKey;
  store: StoreId;
  title: string | null;
  image: string | null;
  price: Paise | null;
  mrp: Paise | null;
  inStock: boolean | null;
  usualPrice: Paise | null;
  realPct: number | null;
  saleStatus: SaleStatus | null;
  lastCheckedAt: Millis | null;
}

/** Every API error has this body. `code` is stable; `message` is for people. */
export interface ApiError {
  error: { code: string; message: string };
}

// ---- Alerts (S3) ----

/** One of the shopper's alerts, as "My alerts" and the bot show it. */
export interface AlertView {
  id: string;
  key: ProductKey;
  store: StoreId;
  title: string | null;
  image: string | null;
  /** The product's latest known price and stock, for the list. */
  price: Paise | null;
  inStock: boolean | null;
  rule: AlertRule;
  /** The rule in plain English: "at or below ₹250", "any price drop", "back in stock". */
  description: string;
  /** false = it has fired and is waiting for the condition to clear before it can fire again. */
  armed: boolean;
  lastFiredAt: Millis | null;
  lastMessage: string | null;
  createdAt: Millis;
}

/** GET /api/me: what this browser has set up. */
export interface MeView {
  telegram: boolean;
  /** Browsers with notifications switched on for this owner. */
  push: number;
  alerts: AlertView[];
}

/** GET /api/config: which alert channels this deployment has switched on. */
export interface AppConfig {
  /** The bot's username (without @), or null when no bot token is set. */
  telegram: { bot: string } | null;
  /** The VAPID public key (base64url, uncompressed P-256), or null when push is not set up. */
  push: { publicKey: string } | null;
  maxAlerts: number;
}
