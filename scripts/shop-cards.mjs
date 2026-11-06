// A store's saved search page → the cards alone, wrapped the way the app hands them to the reader
// (android/js/fares.ts: only the recipe's `items` elements, so a huge page reads fast). Used to
// make test/fixtures/shop-<store>-<words>-cards.html from a page saved on the shopper's side.
//   node scripts/shop-cards.mjs <saved page.html> <store> <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { outerOf, selectAll } from '../core/select.ts';

const [page, store, out] = process.argv.slice(2);
if (!page || !store || !out) throw new Error('usage: shop-cards.mjs <page.html> <store> <out.html>');
const { recipes } = JSON.parse(readFileSync(new URL('../web/shops.json', import.meta.url), 'utf8'));
const recipe = recipes.find((r) => r.store === store);
if (!recipe) throw new Error(`no recipe for ${store} in web/shops.json`);
const html = readFileSync(page, 'utf8');
const cards = selectAll(html, recipe.items, (recipe.max ?? 20) * 3).map((el) => outerOf(html, el)).filter(Boolean);
writeFileSync(out, `<html><body><div class="britto-items">${cards.join('')}</div></body></html>\n`);
console.log(`${store}: ${cards.length} cards, ${Buffer.byteLength(readFileSync(out))} bytes → ${out}`);
