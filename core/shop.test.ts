// Shop compare: every recipe in web/shops.json on the cards saved from that store's own phone
// search page (2026-11-06, a real Chrome at phone size, see HISTORY), and the title matcher that
// decides whether a result IS the product. Expected values were read off the pages themselves.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bestMatch, matchTitle, quantities, searchWordsFor } from '../web/match.js';
import { checkShopRecipe, readShop, usableShopRecipes, type ShopRecipe } from './shop.ts';
import { compareView, kindOf, shopSearchUrl, storesFor, SHOP_MAX_STORES } from '../web/shop.js';

const recipes = (JSON.parse(readFileSync(new URL('../web/shops.json', import.meta.url), 'utf8')) as { recipes: ShopRecipe[] }).recipes;
const recipe = (store: string) => {
  const r = recipes.find((x) => x.store === store);
  assert.ok(r, `a recipe for ${store}`);
  return r;
};
const page = (name: string) => readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8');

test('every shop recipe passes its own check, one per store', () => {
  for (const r of recipes) assert.deepEqual(checkShopRecipe(r), [], r.store);
  assert.equal(new Set(recipes.map((r) => r.store)).size, recipes.length);
  assert.equal(usableShopRecipes(recipes).length, recipes.length);
});

test('a recipe the app could not run is refused', () => {
  const r = { ...recipe('croma') };
  assert.match(checkShopRecipe({ ...r, items: 'ul li.product-item' }).join(), /one part only/);
  assert.match(checkShopRecipe({ ...r, search: 'https://www.croma.com/search' }).join(), /\{q\}/);
  assert.match(checkShopRecipe({ ...r, sector: 'flight' }).join(), /sector/);
  assert.match(checkShopRecipe({ ...r, price: [] }).join(), /price/);
  assert.match(checkShopRecipe({ ...r, extra: 1 }).join(), /unknown key extra/);
  assert.equal(usableShopRecipes([r, { ...r, items: 'a b' }]).length, 1);
});

// [store, fixture, results page, rows, first row]
const CASES: [string, string, string, number, { title: string; price: number; mrp: number | null; link: string | null; image: string }][] = [
  ['flipkart', 'shop-flipkart-boat-airdopes-141-2026-11-06-cards.html', 'https://www.flipkart.com/search?q=boat%20airdopes%20141', 6,
    { title: 'boAt Airdopes 141 Gen 2, 4 Mics ENx Tech,48H Battery,ASAP Charge,Low Latency,BT v5.4 Bluetooth Headset', price: 79_900, mrp: 399_000, link: 'https://www.flipkart.com/boat-airdopes-141-gen-2-4-mics-enx-tech-48h-battery-asap-charge-low-latency-bt-v5-4-bluetooth/p/itm619afae0c5b89?pid=ACCHGG7NBBMK5GGJ', image: 'https://rukminim2.flixcart.com/image/' }],
  ['myntra', 'shop-myntra-levis-t-shirt-2026-11-06-cards.html', 'https://www.myntra.com/levis%20t%20shirt', 16,
    { title: 'Levis Men Brand Logo Printed T-shirt', price: 149_900, mrp: 219_900, link: 'https://www.myntra.com/44968046', image: 'https://assets.myntassets.com/' }],
  ['croma', 'shop-croma-boat-airdopes-141-2026-11-06-cards.html', 'https://www.croma.com/searchB?q=boat%20airdopes%20141%3Arelevance&text=boat%20airdopes%20141', 20,
    { title: 'boAt Airdopes 111v2 TWS Earbuds with Environmental Noise Cancellation (IPX4 Spla', price: 129_900, mrp: 499_000, link: 'https://www.croma.com/boat-airdopes-111v2-tws-earbuds-with-environmental-noise-cancellation', image: 'https://media-ik.croma.com/' }],
  ['ajio', 'shop-ajio-levis-t-shirt-2026-11-06-cards.html', 'https://www.ajio.com/search/?text=levis%20t%20shirt', 15,
    { title: "LEVI'S Men Printed Regular Fit Round-Neck T-Shirt", price: 64_400, mrp: 139_900, link: 'https://www.ajio.com/levi-s-men-printed-regular-fit-round-neck-t-shirt/p/469800954_blue', image: 'https://assets-jiocdn.ajio.com/' }],
  ['meesho', 'shop-meesho-steam-iron-2026-11-06-cards.html', 'https://www.meesho.com/search?q=steam%20iron', 20,
    { title: 'Fashionate Steam Presses', price: 63_800, mrp: null, link: 'https://www.meesho.com/mini-electric-dry-iron-istri-machine-with-spray-water-portabie-fast-h', image: 'https://images.meesho.com/' }],
  ['reliancedigital', 'shop-reliancedigital-boat-airdopes-141-2026-11-06-cards.html', 'https://www.reliancedigital.in/products?q=boat%20airdopes%20141', 9,
    { title: 'boAt Airdopes 141 ANC TWS in Ear Earbuds with 32 dB ANC, 42 Hrs Playback, 50 ms ', price: 139_900, mrp: 599_000, link: 'https://www.reliancedigital.in/product/boat-airdopes-141-anc-tws-in-ear-earbuds-with-32-db-anc-42-hr', image: 'https://cdn.jiostore.online/' }],
  ['tatacliq', 'shop-tatacliq-boat-airdopes-141-2026-11-06-cards.html', 'https://www.tatacliq.com/search/?searchCategory=all&text=boat%20airdopes%20141', 18,
    { title: 'boAt Nirvanaa 751ANC T Headset with Hybrid Active Noise Cancellation & 65H Playback(Sterling Silver)', price: 409_900, mrp: 799_000, link: 'https://www.tatacliq.com/boat-nirvanaa-751anc-t-headset-with-hybrid-active-noise-cancellation-', image: 'https://img.tatacliq.com/' }],
  ['nykaa', 'shop-nykaa-cetaphil-face-wash-2026-11-06-cards.html', 'https://www.nykaa.com/search/result/?q=cetaphil%20face%20wash', 12,
    { title: 'Cetaphil Gentle Skin Cleanser For Normal, Dry Skin Hydrates And Softens', price: 38_100, mrp: 45_900, link: null, image: 'https://images-static.nykaa.com/' }],
  ['snapdeal', 'shop-snapdeal-steam-iron-2026-11-06-cards.html', 'https://www.snapdeal.com/search?keyword=steam%20iron', 20,
    { title: 'K-life 107 Steam Respiratory Machine Kit For Adults & kids Asthma Inhaler Patients Nebulizer (White)', price: 74_100, mrp: 234_300, link: 'https://www.snapdeal.com/product/klife-klife-107-nebulizer-neb107/', image: 'https://g.sdlcdn.com/' }],
];

for (const [store, fixture, url, count, first] of CASES) {
  test(`${store}: reads the products its own search page showed`, () => {
    const out = readShop(recipe(store), page(fixture), url);
    assert.equal(out.status, 'listed');
    assert.equal(out.rows.length, count);
    const row = out.rows[0]!;
    assert.equal(row.title.slice(0, first.title.length), first.title.slice(0, 160));
    assert.equal(row.price, first.price);
    assert.equal(row.mrp, first.mrp);
    if (first.link == null) assert.equal(row.link, null);
    else assert.ok(row.link?.startsWith(first.link), `${row.link} starts with ${first.link}`);
    assert.ok(row.image?.startsWith(first.image), String(row.image));
    // Every row is a priced product with an https picture, and never a crossed-out price as the price.
    for (const r of out.rows) {
      assert.ok(r.price >= 1_000 && r.title.length > 3, JSON.stringify(r));
      assert.ok(r.mrp == null || r.mrp > r.price);
      assert.ok(r.image == null || r.image.startsWith('https://'));
      assert.ok(r.link == null || new URL(r.link).hostname.endsWith(new URL(url).hostname.replace(/^www\./, '')), r.link ?? '');
    }
    assert.equal(out.status === 'listed' && out.cheapest, Math.min(...out.rows.map((r) => r.price)));
  });
}

test('flipkart: a card nested in another card of the same product is read once (13 cards, 6 products)', () => {
  const out = readShop(recipe('flipkart'), page('shop-flipkart-boat-airdopes-141-2026-11-06-cards.html'), 'https://www.flipkart.com/search?q=boat');
  const ids = out.rows.map((r) => /pid=([A-Z0-9]+)/.exec(r.link ?? '')?.[1]);
  assert.deepEqual(ids, ['ACCHGG7NBBMK5GGJ', 'ACCGTQY9NEDG33GH', 'ACCHGG7NWSM4KFQA', 'ACCHGG7NBKUHAJAW', 'ACCGBVMG5N6P7TEK', 'ACCGTQY9KFBAXXBS']);
});

test('another page, a person check and a page still loading are told apart', () => {
  const r = recipe('croma');
  assert.equal(readShop(r, page('shop-croma-boat-airdopes-141-2026-11-06-cards.html'), 'https://www.croma.com/p/12345').status, 'other_page');
  assert.equal(readShop(r, '<html><body><h1>Access Denied</h1></body></html>', 'https://www.croma.com/searchB?q=x').status, 'check');
  assert.equal(readShop(r, '<html><body><div>Loading…</div></body></html>', 'https://www.croma.com/searchB?q=x').status, 'waiting');
});

test('a link to another site is dropped, a relative one resolved', () => {
  const r = recipe('snapdeal');
  const card = (href: string) => `<html><body><a class="sd-product-tuple" href="${href}"><img src="https://g.sdlcdn.com/a.jpg"><div class="product-name-info">Philips Steam Iron GC1905</div><span class="product-final-price">₹ 1,299</span></a></body></html>`;
  assert.equal(readShop(r, card('https://evil.example/x'), 'https://www.snapdeal.com/search?keyword=iron').rows[0]?.link, null);
  assert.equal(readShop(r, card('/product/philips/123'), 'https://www.snapdeal.com/search?keyword=iron').rows[0]?.link, 'https://www.snapdeal.com/product/philips/123');
});

test('search addresses carry the words encoded', () => {
  assert.equal(shopSearchUrl(recipe('flipkart'), 'boAt  Airdopes 141'), 'https://www.flipkart.com/search?q=boAt%20Airdopes%20141');
  assert.equal(shopSearchUrl(recipe('myntra'), 'Levis T Shirt'), 'https://www.myntra.com/levis-t-shirt?rawQuery=Levis%20T%20Shirt');
  assert.equal(shopSearchUrl(recipe('croma'), 'a&b'), 'https://www.croma.com/searchB?q=a%26b%3Arelevance&text=a%26b');
});

// The matcher: "same" only when nothing in the titles says otherwise.
const PAIRS: [string, string, 'same' | 'close' | 'none'][] = [
  ['boAt Airdopes 141 Gen 2, 4 Mics ENx Tech, 48H Battery', 'boAt Airdopes 141 Gen 2, 4 Mics ENx Tech,48H Battery,ASAP Charge,Low Latency,BT v5.4 Bluetooth Headset', 'same'],
  ['boAt Airdopes 141 Gen 2, 4 Mics ENx Tech, 48H Battery', 'boAt Airdopes 141 ANC TWS in Ear Earbuds with 32 dB ANC, 42 Hrs Playback', 'none'],
  ['boAt Airdopes 141 Gen 2, 4 Mics ENx Tech, 48H Battery', 'boAt Airdopes 71,40 H Battery, ENx Tech, Low Latency', 'none'],
  ['boAt Airdopes 141/8, Low Latency, ENx Tech, 42HRS Battery', 'boAt Airdopes 141 Gen 2, 4 Mics ENx Tech,48H Battery', 'none'],
  ['Cello Pinpoint Ballpoint Pens, Blue - Pack of 10', 'Cello Pinpoint Ball Pen (Pack of 25, Blue)', 'none'],
  ['Cello Pinpoint Ballpoint Pens, Blue - Pack of 10', 'Cello Pinpoint Ballpoint Pen Blue Pack of 10', 'same'],
  ['Cetaphil Gentle Skin Cleanser 125ml', 'Cetaphil Gentle Skin Cleanser 250 ml', 'none'],
  ['Apple iPhone 15 (128 GB) - Black', 'Apple iPhone 15 Plus (128 GB) - Black', 'none'],
  ['Apple iPhone 15 (128 GB) - Black', 'Apple iPhone 15 (256 GB) - Black', 'none'],
  ['Apple iPhone 15 (128 GB) - Black', 'Apple iPhone 15 128GB Black', 'same'],
  ['Apple iPhone 15 (128 GB) - Black', 'Samsung Galaxy S23 (128 GB)', 'none'],
  ['Levis Men Brand Logo Printed T-shirt', "LEVI'S Men Printed Regular Fit Round-Neck T-Shirt", 'close'],
  ['Levis Men Brand Logo Printed T-shirt', 'Levis Men Brand Logo Printed T-shirt', 'same'],
  ['boAt Airdopes 213, 25H Battery', 'boAt Airdopes 213 PA0028 TWS Earbuds with Environmental Noise Cancellation', 'close'],
];
test('the matcher calls a result the same product only when nothing says otherwise', () => {
  for (const [want, got, kind] of PAIRS) assert.equal(matchTitle(want, got).kind, kind, `${want} ↔ ${got}: ${JSON.stringify(matchTitle(want, got))}`);
  assert.match(matchTitle('Cello Pinpoint Ballpoint Pens, Blue - Pack of 10', 'Cello Pinpoint Ball Pen (Pack of 25, Blue)').why ?? '', /pack of 25, not 10/);
  assert.deepEqual([...quantities('Tea 1 l and 500 ml, pack of 2').entries()].map(([k, v]) => [k, [...v]]), [['ml', [500, 1000]], ['count', [2]]]);
});

test('search words: the product name up to its feature list', () => {
  assert.equal(searchWordsFor('Cello Pinpoint Ballpoint Pens, Blue - Pack of 10'), 'Cello Pinpoint Ballpoint Pens');
  assert.equal(searchWordsFor('boAt Airdopes 141 Gen 2, 4 Mics ENx Tech, 48H Battery'), 'boAt Airdopes 141 Gen 2');
  assert.equal(searchWordsFor('Apple iPhone 15 (128 GB) - Black'), 'Apple iPhone 15');
  assert.equal(searchWordsFor('| ,'), null);
});

test('on real pages: Flipkart has the same earbuds; Reliance Digital and Croma only other boAt models', () => {
  const want = 'boAt Airdopes 141 Gen 2, 4 Mics ENx Tech, 48H Battery, ASAP Charge, Low Latency, BT v5.4 Bluetooth Earbuds';
  const fk = readShop(recipe('flipkart'), page('shop-flipkart-boat-airdopes-141-2026-11-06-cards.html'), 'https://www.flipkart.com/search?q=x');
  const best = bestMatch(want, fk.rows);
  assert.equal(best?.kind, 'same');
  assert.equal(best?.row.price, 79_900);
  for (const [store, fixture, url] of [
    ['reliancedigital', 'shop-reliancedigital-boat-airdopes-141-2026-11-06-cards.html', 'https://www.reliancedigital.in/products?q=x'],
    ['croma', 'shop-croma-boat-airdopes-141-2026-11-06-cards.html', 'https://www.croma.com/searchB?q=x'],
  ] as const) {
    const rows = readShop(recipe(store), page(fixture), url).rows;
    assert.ok(rows.length > 5);
    assert.equal(bestMatch(want, rows), null, store);
  }
});

test('bestMatch takes the cheapest same product over a closer-looking similar one', () => {
  const rows = [
    { title: 'Cello Pinpoint Ballpoint Pen Blue Pack of 10', price: 12_000 },
    { title: 'Cello Pinpoint Ballpoint Pen Blue Pack of 10', price: 9_900 },
    { title: 'Cello Pinpoint Ball Pen (Pack of 25, Blue)', price: 5_000 },
  ];
  const best = bestMatch('Cello Pinpoint Ballpoint Pens, Blue - Pack of 10', rows);
  assert.equal(best?.kind, 'same');
  assert.equal(best?.row.price, 9_900);
});

test('which stores a product is compared on: by its kind, never its own store, at most six', () => {
  assert.equal(kindOf('Levis Men Brand Logo Printed T-shirt'), 'fashion');
  assert.equal(kindOf('Cetaphil Gentle Skin Cleanser 125ml'), 'beauty');
  assert.equal(kindOf('boAt Airdopes 141 Gen 2'), 'other');
  assert.deepEqual(storesFor('boAt Airdopes 141 Gen 2', recipes, 'amazon').map((r) => r.store), ['flipkart', 'croma', 'reliancedigital', 'tatacliq', 'snapdeal', 'meesho']);
  assert.deepEqual(storesFor('Levis Men Brand Logo Printed T-shirt', recipes, 'myntra').map((r) => r.store), ['ajio', 'flipkart', 'tatacliq', 'meesho', 'snapdeal', 'nykaa']);
  assert.equal(storesFor('Cetaphil Gentle Skin Cleanser', recipes, 'amazon')[0]?.store, 'nykaa');
  for (const t of ['boAt Airdopes', 'Levis T-shirt', 'Cetaphil cleanser']) assert.ok(storesFor(t, recipes, 'flipkart').length <= SHOP_MAX_STORES);
});

test('the compare view: same product cheapest first, similar after, no match, then still checking', () => {
  const want = 'boAt Airdopes 141 Gen 2, 4 Mics ENx Tech, 48H Battery';
  const fk = readShop(recipe('flipkart'), page('shop-flipkart-boat-airdopes-141-2026-11-06-cards.html'), 'https://www.flipkart.com/search?q=x');
  const rd = readShop(recipe('reliancedigital'), page('shop-reliancedigital-boat-airdopes-141-2026-11-06-cards.html'), 'https://www.reliancedigital.in/products?q=x');
  const v = compareView(want, [
    { id: 'croma', name: 'Croma', url: 'https://www.croma.com/searchB?q=x', state: 'loading', status: 'loading' },
    { id: 'reliancedigital', name: 'Reliance Digital', url: 'u', state: 'done', status: 'listed', rows: rd.rows },
    { id: 'flipkart', name: 'Flipkart', url: 'u', state: 'done', status: 'listed', rows: fk.rows },
    { id: 'ajio', name: 'AJIO', url: 'u', state: 'done', status: 'check', rows: [] },
  ], 89_900);
  assert.deepEqual(v.rows.map((r) => r.id), ['flipkart', 'reliancedigital', 'ajio', 'croma']);
  assert.equal(v.cheapest?.id, 'flipkart');
  assert.equal(v.cheapest?.best?.row.price, 79_900);
  assert.equal(v.cheapest?.diff, -10_000);
  assert.equal(v.done, false);
  assert.equal(v.checked, 3);
  // A similar item is never the "cheapest": with only one, there is no cheapest.
  const close = compareView('boAt Airdopes 213, 25H Battery', [{ id: 'croma', name: 'Croma', url: 'u', state: 'done', status: 'listed', rows: [{ title: 'boAt Airdopes 213 PA0028 TWS Earbuds', price: 84_900, mrp: null, image: null, link: null }] }], 99_900);
  assert.equal(close.rows[0]?.best?.kind, 'close');
  assert.equal(close.cheapest, null);
});
