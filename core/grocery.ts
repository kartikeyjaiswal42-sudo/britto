// Grocery compare (BLUEPRINT §12). Pure logic, the same for every client: the server computes
// the comparison from prices the shopper's own app read (grocery platforms refuse servers:
// measured 2026-10-27, S3). Every figure is tied to ONE delivery address: prices and stock
// differ by address, so quotes for different addresses are never compared.
import type { Millis, Paise } from './types.ts';

// ------------------------------------------------------------------ platforms

export type GroceryPlatformId = 'blinkit' | 'zepto' | 'instamart' | 'bigbasket' | 'jiomart' | 'dmart' | 'flipkartminutes' | 'amazonfresh';

export interface GroceryPlatform {
  id: GroceryPlatformId;
  name: string;
  home: string;
  /** What our server measured, honestly identified. None of these has a verified reader yet. */
  measured: string;
}

export const GROCERY_PLATFORMS: readonly GroceryPlatform[] = [
  { id: 'blinkit', name: 'Blinkit', home: 'https://blinkit.com/', measured: '2026-10-27: home page answered 403 with a captcha to an honest bot. App-only.' },
  { id: 'zepto', name: 'Zepto', home: 'https://www.zepto.com/', measured: '2026-10-27: home page answered 202 with a JavaScript wall. App-only.' },
  { id: 'instamart', name: 'Swiggy Instamart', home: 'https://www.swiggy.com/instamart', measured: '2026-10-27: answered 202 with a JavaScript wall. App-only.' },
  { id: 'bigbasket', name: 'BigBasket', home: 'https://www.bigbasket.com/', measured: '2026-10-27: home page answered 403 to an honest bot. App-only.' },
  { id: 'jiomart', name: 'JioMart', home: 'https://www.jiomart.com/', measured: '2026-10-27: home page answered 403 to an honest bot. App-only.' },
  { id: 'dmart', name: 'DMart Ready', home: 'https://www.dmart.in/', measured: 'Not measured yet.' },
  { id: 'flipkartminutes', name: 'Flipkart Minutes', home: 'https://www.flipkart.com/', measured: 'Inside Flipkart, which refuses our server (2026-10-26). App-only.' },
  { id: 'amazonfresh', name: 'Amazon Fresh / Now', home: 'https://www.amazon.in/', measured: 'Not measured yet (Amazon product pages answer our server).' },
];

const PLATFORM_IDS = new Set<string>(GROCERY_PLATFORMS.map((p) => p.id));

// ------------------------------------------------------------------ pack sizes

export type BaseUnit = 'g' | 'ml' | 'pc';

/** One pack: `count` units of `size` each (6 x 200 ml = size 200, unit ml, count 6). */
export interface PackSize { size: number; unit: BaseUnit; count: number }

const UNITS: Record<string, [BaseUnit, number]> = {
  g: ['g', 1], gm: ['g', 1], gms: ['g', 1], gram: ['g', 1], grams: ['g', 1], kg: ['g', 1000], kgs: ['g', 1000],
  ml: ['ml', 1], l: ['ml', 1000], ltr: ['ml', 1000], litre: ['ml', 1000], liter: ['ml', 1000], litres: ['ml', 1000],
  pc: ['pc', 1], pcs: ['pc', 1], piece: ['pc', 1], pieces: ['pc', 1], unit: ['pc', 1], units: ['pc', 1],
  n: ['pc', 1], nos: ['pc', 1], eggs: ['pc', 1], tablets: ['pc', 1], sachets: ['pc', 1],
};
const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = `(${Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|')})`;

/**
 * Read a pack size as the platforms print it: "500 g", "1kg", "1.5 L", "6 x 200 ml",
 * "200 ml x 6", "Pack of 6 (200 ml each)", "12 pcs". Null when there is no clear size: an
 * item without one is compared by price only and marked "check this one".
 */
export function parsePackSize(text: string | null | undefined): PackSize | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  const amount = new RegExp(`${NUM}\\s?${UNIT}\\b`).exec(t);
  // "6 x 200 ml" (count first) or "200 ml x 6" (count last): groups differ, so match each form.
  const countFirst = new RegExp(`\\b(\\d{1,3})\\s?[x×*]\\s?${NUM}\\s?${UNIT}\\b`).exec(t);
  const countLast = countFirst ? null : new RegExp(`${NUM}\\s?${UNIT}\\s?[x×*]\\s?(\\d{1,3})\\b`).exec(t);
  const packOf = /\bpack of (\d{1,3})\b/.exec(t);
  const mult = countFirst ? { count: countFirst[1]!, n: countFirst[2]!, u: countFirst[3]! }
    : countLast ? { count: countLast[3]!, n: countLast[1]!, u: countLast[2]! } : null;
  if (mult) {
    const [unit, factor] = UNITS[mult.u]!;
    return { size: Number(mult.n) * factor, unit, count: Number(mult.count) };
  }
  if (amount) {
    const [unit, factor] = UNITS[amount[2]!]!;
    const count = packOf && unit !== 'pc' ? Number(packOf[1]) : 1;
    return { size: Number(amount[1]) * factor, unit, count };
  }
  if (packOf) return { size: 1, unit: 'pc', count: Number(packOf[1]) };
  return null;
}

/** Total amount in a pack, in its base unit. */
export const packTotal = (p: PackSize) => p.size * p.count;

/** Price per 100 g, per 100 ml or per piece, in paise (rounded), with the label. */
export function unitPrice(price: Paise, pack: PackSize): { paise: number; per: '100 g' | '100 ml' | '1 pc' } {
  const total = packTotal(pack);
  if (pack.unit === 'pc') return { paise: Math.round(price / total), per: '1 pc' };
  return { paise: Math.round((price * 100) / total), per: pack.unit === 'g' ? '100 g' : '100 ml' };
}

// ------------------------------------------------------------------ matching

/** Words of a product name, normalized: lower-case, no pack sizes, no punctuation. */
export function nameWords(name: string): string[] {
  return name.toLowerCase()
    .replace(new RegExp(`${NUM}\\s?${UNIT}\\b`, 'g'), ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !['pack', 'of', 'the', 'and', 'with', 'x'].includes(w));
}

/**
 * Share of the smaller word set found in the larger one (0..1), the brand's own words left out:
 * the brand is checked on its own, and "Amul Butter" is not half of "Amul Cheese Slices".
 */
export function nameSimilarity(a: string, b: string, brand: string | null = null): number {
  const skip = new Set(brand ? nameWords(brand) : []);
  const wa = new Set(nameWords(a).filter((w) => !skip.has(w)));
  const wb = new Set(nameWords(b).filter((w) => !skip.has(w)));
  if (!wa.size || !wb.size) return 0;
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  let hit = 0;
  for (const w of small) if (large.has(w)) hit++;
  return hit / small.size;
}

export const MATCH = {
  /** Names this similar AND the same brand AND the same total pack: "same item". */
  sameName: 0.8,
  /** Below this, a quote is not the item at all and is left out. */
  minName: 0.5,
} as const;

// ------------------------------------------------------------------ comparing one item

export interface GroceryQuote {
  platform: GroceryPlatformId;
  /** The delivery address the prices are valid for (the app's label for it, e.g. a pincode). */
  address: string;
  title: string;
  brand: string | null;
  pack: string | null;
  price: Paise;
  mrp: Paise | null;
  inStock: boolean;
  at: Millis;
}

export interface CompareRow {
  platform: GroceryPlatformId;
  title: string;
  price: Paise;
  mrp: Paise | null;
  inStock: boolean;
  pack: PackSize | null;
  unitPrice: { paise: number; per: string } | null;
  /** 'same': same brand, name and pack. 'check': probably the item, shown for the shopper to judge. */
  match: 'same' | 'check';
  at: Millis;
}

export interface ItemComparison {
  address: string;
  item: string;
  /** In stock first, then by unit price (or price when units differ), cheapest first. */
  rows: CompareRow[];
  /** The cheapest in-stock 'same' row, or null when no row is certain enough to name a winner. */
  best: GroceryPlatformId | null;
  /** Quotes left out, and why (another address, not the item, a bad quote). */
  leftOut: { platform: string; reason: string }[];
}

/**
 * Compare one item across platforms, for one address. The reference is the item the shopper
 * started from (`item`, `brand`, `pack`). A platform's quote that is not clearly the same item
 * is shown as "check this one", and only certain matches can be "best".
 */
export function compareItem(ref: { item: string; brand: string | null; pack: string | null }, address: string, quotes: readonly GroceryQuote[]): ItemComparison {
  const refPack = parsePackSize(ref.pack ?? ref.item);
  const leftOut: ItemComparison['leftOut'] = [];
  const rows: CompareRow[] = [];
  for (const q of quotes) {
    if (q.address !== address) { leftOut.push({ platform: q.platform, reason: 'priced for another delivery address' }); continue; }
    const sim = nameSimilarity(ref.item, q.title, ref.brand ?? q.brand);
    if (sim < MATCH.minName) { leftOut.push({ platform: q.platform, reason: 'not the same item' }); continue; }
    const pack = parsePackSize(q.pack ?? q.title);
    const sameBrand = ref.brand != null && q.brand != null && ref.brand.toLowerCase() === q.brand.toLowerCase();
    const samePack = refPack != null && pack != null && refPack.unit === pack.unit && packTotal(refPack) === packTotal(pack);
    rows.push({
      platform: q.platform, title: q.title, price: q.price, mrp: q.mrp, inStock: q.inStock, pack,
      unitPrice: pack ? unitPrice(q.price, pack) : null,
      match: sim >= MATCH.sameName && sameBrand && samePack ? 'same' : 'check',
      at: q.at,
    });
  }
  // Unit prices are comparable only within one unit; otherwise fall back to the pack price.
  const units = new Set(rows.map((r) => r.unitPrice?.per ?? 'none'));
  const key = (r: CompareRow) => (units.size === 1 && r.unitPrice ? r.unitPrice.paise : r.price);
  rows.sort((a, b) => Number(b.inStock) - Number(a.inStock) || key(a) - key(b));
  const best = rows.find((r) => r.inStock && r.match === 'same')?.platform ?? null;
  return { address, item: ref.item, rows, best, leftOut };
}

// ------------------------------------------------------------------ comparing a basket

export interface BasketTotal {
  platform: GroceryPlatformId;
  /** Sum of the items this platform has in stock as a 'same' match. */
  items: Paise;
  /** Delivery fee when the platform's page showed one; null = not read (the total excludes it). */
  delivery: Paise | null;
  total: Paise;
  /** Items this platform cannot supply as the same item, in stock. */
  missing: string[];
}

/**
 * The whole basket per platform: only certain, in-stock matches count; anything else is listed
 * as missing for that platform, never silently swapped. Complete baskets first, then cheapest.
 */
export function compareBasket(items: readonly ItemComparison[], delivery: Partial<Record<GroceryPlatformId, Paise>> = {}): BasketTotal[] {
  const platforms = new Set<GroceryPlatformId>(items.flatMap((i) => i.rows.map((r) => r.platform)));
  const totals: BasketTotal[] = [];
  for (const p of platforms) {
    let sum = 0;
    const missing: string[] = [];
    for (const it of items) {
      const row = it.rows.find((r) => r.platform === p && r.inStock && r.match === 'same');
      if (row) sum += row.price;
      else missing.push(it.item);
    }
    const fee = delivery[p] ?? null;
    totals.push({ platform: p, items: sum, delivery: fee, total: sum + (fee ?? 0), missing });
  }
  return totals.sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);
}

// ------------------------------------------------------------------ input checks

/** Shape check of quotes sent by a client (a claim, like any client reading). */
export function cleanQuotes(input: unknown): { ok: true; quotes: GroceryQuote[] } | { ok: false; reason: string } {
  if (!Array.isArray(input) || input.length === 0 || input.length > 40) return { ok: false, reason: 'Send 1 to 40 quotes.' };
  const quotes: GroceryQuote[] = [];
  for (const [i, q] of input.entries()) {
    const o = q as Record<string, unknown>;
    const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
    const paise = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 100 && (v as number) <= 100_000_000;
    if (!o || !PLATFORM_IDS.has(String(o['platform']))) return { ok: false, reason: `quotes[${i}].platform is not a known grocery platform` };
    if (!text(o['address'], 80) || !text(o['title'], 300)) return { ok: false, reason: `quotes[${i}] needs an address and a title` };
    if (!paise(o['price'])) return { ok: false, reason: `quotes[${i}].price must be whole paise, ₹1 or more` };
    if (o['mrp'] != null && !paise(o['mrp'])) return { ok: false, reason: `quotes[${i}].mrp must be whole paise or null` };
    if (typeof o['inStock'] !== 'boolean' || !Number.isSafeInteger(o['at'])) return { ok: false, reason: `quotes[${i}] needs inStock and at` };
    quotes.push({
      platform: o['platform'] as GroceryPlatformId, address: (o['address'] as string).trim(), title: (o['title'] as string).trim(),
      brand: text(o['brand'], 80) ? (o['brand'] as string).trim() : null, pack: text(o['pack'], 80) ? (o['pack'] as string).trim() : null,
      price: o['price'] as number, mrp: (o['mrp'] as number | null | undefined) ?? null, inStock: o['inStock'] as boolean, at: o['at'] as number,
    });
  }
  return { ok: true, quotes };
}
