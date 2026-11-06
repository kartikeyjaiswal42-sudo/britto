// Shop compare, the view's arithmetic (BuyHatke's "compare prices across stores"): which stores
// to check for a product, each store's search address, and the stores' readings (core/shop.ts,
// read on the shopper's phone by the Britto app) put in order with the product's best match in
// each (web/match.js). Pure: the page (web/app.js) draws it, core/shop.test.ts checks it.
import { bestMatch } from './match.js';

/** At most this many stores per compare: each is a store page loaded on the phone. */
export const SHOP_MAX_STORES = 6;

const FASHION = /\b(t-?shirts?|shirts?|jeans|kurtas?|kurtis?|sarees?|dress(es)?|tops?|trousers?|jackets?|shoes?|sneakers?|sandals?|slippers?|socks|shorts|hoodies?|sweatshirts?|leggings|lehengas?|dupattas?|innerwear|briefs|trunks|handbags?|wallets?|sunglasses|polo)\b/i;
const BEAUTY = /\b(face ?wash|cleanser|serum|moisturi[sz]er|sunscreen|shampoo|conditioner|lipstick|kajal|foundation|perfume|deodorant|body ?lotion|face ?cream|hair ?oil|toner|nail ?paint|makeup|mascara|eyeliner|lip ?balm|cetaphil|minimalist|lakme|maybelline)\b/i;
/** Where each kind of product is sold, most likely first (the stores' own ranges). */
const ORDER = {
  fashion: ['myntra', 'ajio', 'flipkart', 'tatacliq', 'meesho', 'snapdeal', 'nykaa'],
  beauty: ['nykaa', 'flipkart', 'myntra', 'tatacliq', 'meesho', 'snapdeal'],
  other: ['flipkart', 'croma', 'reliancedigital', 'tatacliq', 'snapdeal', 'meesho', 'myntra', 'ajio', 'nykaa'],
};

/** 'fashion' | 'beauty' | 'other', from the product's title. */
export function kindOf(title) {
  const t = String(title ?? '');
  return BEAUTY.test(t) ? 'beauty' : FASHION.test(t) ? 'fashion' : 'other';
}

/** The recipes to run for this product: its kind's stores in order, never its own store. */
export function storesFor(title, recipes, ownStore) {
  const order = ORDER[kindOf(title)];
  return recipes
    .filter((r) => r.store !== ownStore && order.includes(r.store))
    .sort((a, b) => order.indexOf(a.store) - order.indexOf(b.store))
    .slice(0, SHOP_MAX_STORES);
}

/** The store's search address for these words (every {q}: Croma's carries them twice). */
export function shopSearchUrl(recipe, words) {
  const q = String(words).trim().replace(/\s+/g, ' ');
  return recipe.search.split('{q}').join(encodeURIComponent(q)).split('{slug}').join(encodeURIComponent(q.toLowerCase().replace(/ /g, '-')));
}

const RANK = { same: 0, close: 1 };

/**
 * The stores in the order a shopper wants them: the same product, cheapest first; then similar
 * ones; then stores that had no match; then stores still being checked. `here` is the product's
 * own price, so each match says how much more or less it is. `cheapest` is the cheapest SAME
 * product (a similar one never wins).
 */
export function compareView(want, sites, here) {
  const rows = sites.map((s) => {
    const done = s.state === 'done';
    const best = done && s.status === 'listed' && s.rows?.length ? bestMatch(want, s.rows) : null;
    return { ...s, done, best, diff: best && here != null ? best.row.price - here : null };
  });
  const score = (r) => (!r.done ? 3 : r.best ? RANK[r.best.kind] : 2);
  rows.sort((a, b) => score(a) - score(b) || (a.best && b.best ? a.best.row.price - b.best.row.price : 0));
  const same = rows.filter((r) => r.best?.kind === 'same');
  const cheapest = same.length ? same[0] : null;
  return { rows, cheapest, done: rows.every((r) => r.done), checked: rows.filter((r) => r.done).length };
}
