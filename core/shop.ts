// Shop compare (the BuyHatke "compare prices across stores" screen): one product, and the Britto
// ANDROID APP opens each store's own SEARCH page for it on the shopper's phone, in a hidden in-app
// browser (FareRunner, the same one fare compare uses), and reads the products that page shows.
// Britto's server asks these stores nothing (Flipkart, Myntra, Croma, Ajio, Meesho, Tata CLiQ,
// Reliance Digital, Nykaa and Snapdeal all refuse it, or forbid bots on search: measured), nothing
// is added to a cart, and a store that asks "are you a person?" is shown to the shopper.
//
// A search-list price is what that list showed, labelled as such: it never enters a product's
// price history (api/listing.ts, the same rule for the server's Amazon search).
//
// A shop recipe is data (web/shops.json, served with the site), read by this one engine over the
// page's HTML as text with the same selectors and fields as every product reader, so the tests
// run it on cards saved from each store's own page (test/fixtures/shop-*-cards.html).
import { fieldValue } from './interpret.ts';
import { parseRupees } from './money.ts';
import type { Field } from './recipe.ts';
import { compile, outerOf, parseSelector, selectAll, SelectorError } from './select.ts';
import type { Paise } from './types.ts';

export interface ShopRecipe {
  /** The store (core/stores.ts or a 'shop' service in core/services.ts). */
  store: string;
  sector: 'shop';
  /** The day this recipe was checked against the store's own search page. */
  verified: string;
  /** The store's search page, `{q}` = the words (encoded). */
  search: string;
  /** A regex the results page's address must match (else: 'other_page'). */
  page: string;
  /** One element per product card, ONE selector part (the app hands over the cards alone). */
  items: string;
  title: Field[];
  /** The price the card asks, never the crossed-out one. */
  price: Field[];
  /** The crossed-out M.R.P., when the card shows one. */
  mrp?: Field[];
  image?: Field[];
  /** The product's own page; relative links are resolved against the results page. */
  link?: Field[];
  /** Literal texts (any one, case-insensitive) of a person check. */
  check: string[];
  /** Literal texts meaning the store found nothing for these words. */
  empty?: string[];
  max?: number;
}

export interface ShopRow {
  title: string;
  price: Paise;
  mrp: Paise | null;
  image: string | null;
  link: string | null;
}

/** 'listed': products read. check: a person check; empty: the store found nothing; waiting: the
 * right page, no products on it (yet); other_page: not this recipe's results page. */
export type ShopRead =
  | { status: 'listed'; rows: ShopRow[]; cheapest: Paise }
  | { status: 'check' | 'empty' | 'waiting' | 'other_page'; rows: [] };

/** Under ₹10 is never a product's price (a "₹1 deal" badge, a coupon's "₹0"). */
const MIN_PRICE: Paise = 1_000;
const DEFAULT_MAX = 20;

const clean = (s: string | null | undefined, max: number): string | null => {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
function pageText(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').toLowerCase();
}
function first(fields: Field[] | undefined, html: string, url: string): string | null {
  for (const f of fields ?? []) {
    const v = fieldValue(f, html, url);
    if (v != null && v.trim()) return v;
  }
  return null;
}
/** An https address on the results page's own site (or its CDN, for images), else null. */
function absolute(raw: string | null, base: string, sameSite: boolean): string | null {
  if (!raw || /^(data|javascript|blob):/i.test(raw.trim())) return null;
  let u: URL;
  try {
    u = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (sameSite) {
    const site = (h: string) => h.split('.').slice(-2).join('.');
    try {
      if (site(u.hostname) !== site(new URL(base).hostname)) return null;
    } catch {
      return null;
    }
  }
  return u.toString();
}

export function readShop(recipe: ShopRecipe, html: string, url: string): ShopRead {
  if (!new RegExp(recipe.page).test(url)) return { status: 'other_page', rows: [] };
  const text = pageText(html);
  if (recipe.check.some((c) => text.includes(c.toLowerCase()))) return { status: 'check', rows: [] };
  const max = recipe.max ?? DEFAULT_MAX;
  const rows: ShopRow[] = [];
  const seen = new Set<string>();
  for (const el of selectAll(html, recipe.items, max * 3)) {
    if (rows.length >= max) break;
    const part = outerOf(html, el);
    if (part == null) continue;
    const title = clean(first(recipe.title, part, url), 160);
    const price = parseRupees(first(recipe.price, part, url)?.replace(/\s+/g, ''));
    if (!title || price == null || price < MIN_PRICE) continue;
    const mrpRaw = parseRupees(first(recipe.mrp, part, url)?.replace(/\s+/g, ''));
    const link = absolute(first(recipe.link, part, url), url, true);
    // A card nested in another card of the same product (Flipkart's phone page) is read once.
    const key = link ? link.replace(/[?#].*$/, '') : `${title}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      title,
      price,
      mrp: mrpRaw != null && mrpRaw > price ? mrpRaw : null,
      image: absolute(first(recipe.image, part, url), url, false),
      link,
    });
  }
  if (rows.length) return { status: 'listed', rows, cheapest: Math.min(...rows.map((r) => r.price)) };
  if (recipe.empty?.some((c) => text.includes(c.toLowerCase()))) return { status: 'empty', rows: [] };
  return { status: 'waiting', rows: [] };
}

// The store's search address is built by the page (web/shop.js shopSearchUrl), one copy.

const FIELD_KEYS = new Set(['selector', 'attribute', 'regex', 'match', 'squash', 'replace', 'sub_regex']);
const RECIPE_KEYS = new Set(['store', 'sector', 'verified', 'search', 'page', 'items', 'title', 'price', 'mrp', 'image', 'link', 'check', 'empty', 'max']);

/** Everything wrong with a recipe ([] = usable). A recipe that fails is never run. */
export function checkShopRecipe(input: unknown): string[] {
  const errs: string[] = [];
  if (!input || typeof input !== 'object') return ['not an object'];
  const r = input as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!RECIPE_KEYS.has(k)) errs.push(`unknown key ${k}`);
  if (typeof r.store !== 'string' || !/^[a-z]+$/.test(r.store)) errs.push('store: a lower-case id');
  if (r.sector !== 'shop') errs.push('sector: shop');
  if (typeof r.verified !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.verified)) errs.push('verified: YYYY-MM-DD');
  if (typeof r.search !== 'string' || !r.search.startsWith('https://') || !r.search.includes('{q}')) errs.push('search: an https address with {q}');
  if (typeof r.page !== 'string' || !r.page.startsWith('^https://')) errs.push('page: a regex starting ^https://');
  else {
    try { new RegExp(r.page); } catch { errs.push('page: not a regex'); }
  }
  if (typeof r.items !== 'string') errs.push('items: a selector');
  else {
    try {
      compile(r.items);
      // The app hands the reader the cards alone (android/js/fares.ts), so a card selector that
      // needs the cards' ancestors would find nothing there.
      if (parseSelector(r.items).parts.length > 1) errs.push('items: one part only (no space or >): the app reads the cards without their page');
    } catch (e) {
      errs.push(`items: ${e instanceof SelectorError ? e.message : 'bad selector'}`);
    }
  }
  const fields = (name: string, required: boolean) => {
    const v = r[name];
    if (v === undefined && !required) return;
    if (!Array.isArray(v) || !v.length) { errs.push(`${name}: a non-empty list of fields`); return; }
    v.forEach((f, i) => {
      const where = `${name}[${i}]`;
      if (!f || typeof f !== 'object') { errs.push(`${where}: an object`); return; }
      const o = f as Record<string, unknown>;
      for (const k of Object.keys(o)) if (!FIELD_KEYS.has(k)) errs.push(`${where}: unknown key ${k}`);
      if (!Array.isArray(o.selector) || !o.selector.length) errs.push(`${where}: selector list`);
      else for (const s of o.selector) {
        try { compile(String(s)); } catch (e) { errs.push(`${where}: ${e instanceof SelectorError ? e.message : 'bad selector'}`); }
      }
      if (typeof o.attribute !== 'string') errs.push(`${where}: attribute`);
      for (const re of (o.regex as unknown[] | undefined) ?? []) {
        try { new RegExp(String(re)); } catch { errs.push(`${where}: bad regex`); }
      }
    });
  };
  fields('title', true);
  fields('price', true);
  fields('mrp', false);
  fields('image', false);
  fields('link', false);
  if (!Array.isArray(r.check) || r.check.some((c) => typeof c !== 'string' || !c)) errs.push('check: a list of texts');
  if (r.empty !== undefined && (!Array.isArray(r.empty) || r.empty.some((c) => typeof c !== 'string' || !c))) errs.push('empty: a list of texts');
  if (r.max !== undefined && (typeof r.max !== 'number' || r.max < 1 || r.max > 40)) errs.push('max: 1 to 40');
  return errs;
}

/** The web/shops.json recipes that pass checkShopRecipe (the rest are dropped, never half-run). */
export function usableShopRecipes(list: unknown): ShopRecipe[] {
  return Array.isArray(list) ? list.filter((r) => checkShopRecipe(r).length === 0) as ShopRecipe[] : [];
}
