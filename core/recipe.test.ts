import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLED_READERS, bundledReader } from '../readers/index.ts';
import { STORE_IDS } from './stores.ts';
import { fieldValue, readOffers, readPage } from './interpret.ts';
import { canonicalJson, configVersion, fillTemplate, jsonPath, readApiRows, validateReader, type ApiRecipe, type Field, type ReaderConfig } from './recipe.ts';

// A small page made by hand to exercise every Field feature. The real-page checks live in
// extract.test.ts and scripts/check-readers.mjs (fixtures).
const PAGE = `<!doctype html><html><head>
<meta property="og:title" content="Og Title &amp; Co">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","name":"LD Name","image":{"url":"https://img.example/x.jpg"},"offers":[{"price":"1299.50","availability":"https://schema.org/InStock"}]}]}</script>
<script>window.__s = {"p":{"price":{"now":499,"was":999},"name":"Json &amp; Name","flags":{"oos":false},"img":"https://img.example/($w)/a.jpg"}};</script>
</head><body>
<div id="box" class="pb"><span class="a">₹ 1,2</span><span class="b">34.5</span><span>0</span></div>
<p class="multi">A1 B2 C3</p>
<a id="link" href="/p?a=1&amp;b=2" data-sku="SKU-9">x</a>
<div id="stock">Currently Unavailable.</div>
</body></html>`;
const URL_ = 'https://shop.example/item/ABC123?ref=x';
const fv = (f: Partial<Field> & Pick<Field, 'attribute'>) => fieldValue({ selector: [], ...f }, PAGE, URL_);

test('fieldValue: text, attributes, URL', () => {
  assert.equal(fv({ selector: ['p.multi'], attribute: 'textContent' }), 'A1 B2 C3');
  assert.equal(fv({ selector: ['#link'], attribute: 'href' }), '/p?a=1&b=2', 'attribute values arrive decoded');
  assert.equal(fv({ selector: ['#link'], attribute: 'attr:data-sku' }), 'SKU-9');
  assert.equal(fv({ selector: ['meta[property="og:title"]'], attribute: 'content' }), 'Og Title & Co');
  assert.equal(fv({ attribute: 'URL', regex: ['/item/([A-Z0-9]+)'] }), 'ABC123');
  assert.equal(fv({ selector: ['#nope'], attribute: 'textContent' }), null, 'no element, no value');
  assert.equal(fv({ selector: ['#link'], attribute: 'attr:data-missing' }), null);
  assert.equal(fv({ selector: ['#box'], attribute: 'innerHTML', regex: ['class="(\\w)"'] }), 'a', 'innerHTML is the raw markup');
});

test('fieldValue: regex alternatives, match index, capture groups, squash', () => {
  // Without squash the spans' text is "₹ 1,2 34.5 0"; with it, "₹1,234.50".
  assert.equal(fv({ selector: ['#box'], attribute: 'textContent' }), '₹ 1,2 34.5 0');
  assert.equal(fv({ selector: ['#box'], attribute: 'textContent', squash: true, regex: ['([\\d,]+(?:\\.\\d{1,2})?)'] }), '1,234.50');
  assert.equal(fv({ selector: ['p.multi'], attribute: 'textContent', regex: ['Z(\\d)', 'B(\\d)'] }), '2', 'the first alternative that matches wins');
  assert.equal(fv({ selector: ['p.multi'], attribute: 'textContent', regex: ['Z(\\d)', 'Y(\\d)'] }), null, 'no alternative matches: no value');
  assert.equal(fv({ selector: ['p.multi'], attribute: 'textContent', regex: ['[A-C](\\d)'], match: 2 }), '3', 'match picks the nth occurrence');
  assert.equal(fv({ selector: ['p.multi'], attribute: 'textContent', regex: ['[A-C](\\d)'], match: 3 }), null, 'past the last occurrence: no value');
  assert.equal(fv({ selector: ['p.multi'], attribute: 'textContent', regex: ['B\\d'] }), 'B2', 'no group: the whole match');
});

test('fieldValue: global + sub_regex + json, and replace', () => {
  const base = { attribute: 'innerHTML' as const, global: true, sub_regex: 'window\\.__s = ([\\s\\S]*?)</script>' };
  assert.equal(fv({ ...base, json: 'p.price.now' }), '499');
  assert.equal(fv({ ...base, json: 'p.flags.oos' }), 'false');
  assert.equal(fv({ ...base, json: 'p.name' }), 'Json &amp; Name', 'JSON text is not entity-decoded (the store wrote it that way)');
  assert.equal(fv({ ...base, json: 'p.price' }), null, 'an object is not a value');
  assert.equal(fv({ ...base, json: 'p.nope' }), null);
  assert.equal(fv({ ...base, json: 'p.img', replace: [['($w)', '360']] }), 'https://img.example/360/a.jpg');
  assert.equal(fv({ attribute: 'innerHTML', global: true, sub_regex: 'window\\.__nothing = (.*)', json: 'p' }), null, 'sub_regex finds nothing: no value');
  assert.equal(fv({ attribute: 'innerHTML', global: true, sub_regex: 'og:title" content="[^"]*"' }), 'og:title" content="Og Title & Co"', 'no group: the whole match, page source decoded');
});

test('fieldValue: jsonld paths (inside @graph, arrays, {url} objects)', () => {
  assert.equal(fv({ attribute: 'textContent', jsonld: 'name' }), 'LD Name');
  assert.equal(fv({ attribute: 'textContent', jsonld: 'offers.price' }), '1299.50', 'an array where a key is wanted: its first element');
  assert.equal(fv({ attribute: 'textContent', jsonld: 'image' }), 'https://img.example/x.jpg', 'an ImageObject reads as its url');
  assert.equal(fv({ attribute: 'textContent', jsonld: 'brand' }), null);
  assert.equal(fieldValue({ selector: [], attribute: 'textContent', jsonld: 'name' }, '<p>no json-ld</p>'), null);
});

test('jsonPath and fillTemplate', () => {
  const doc = { a: { b: [{ c: 1 }, { c: 2 }] }, n: null, s: 'x' };
  assert.equal(jsonPath(doc, 'a.b[1].c'), 2);
  assert.equal(jsonPath(doc, 'a.b.1.c'), 2, 'dotted index');
  assert.equal(jsonPath(doc, 'a.b.c'), 1, 'array where a key is wanted: first element');
  assert.equal(jsonPath(doc, 'a.x.y'), undefined);
  assert.equal(jsonPath(doc, 'n.y'), undefined, 'through null');
  assert.equal(jsonPath(doc, 's.length'), undefined, 'never into a string');
  assert.deepEqual(jsonPath(doc, ''), doc);
  assert.equal(fillTemplate('/p/{{pid}}?lat={{latitude}}', { pid: 'X1', latitude: 28.5 }), '/p/X1?lat=28.5');
  assert.equal(fillTemplate('{{pid}}/{{nope}}', { pid: 7 }), '7/{{nope}}', 'an unknown name stays visible');
});

const API: ApiRecipe = {
  url: 'https://store.example/v1/product/{{pid}}',
  method: 'POST',
  parse: {
    root: ['response.missing', 'response.items'],
    match: [{ path: 'id', eq: ['{{pid}}'] }, { path: 'price', ne: [0] }],
    fields: { product_id: 'id', price: 'price', mrp: 'mrp', productName: ['name', 'display_name'], image: 'img', groupId: 'g' },
    oos: [{ path: 'sold_out', oos: [true] }, { path: 'inventory', oos: [0] }],
  },
  imageTemplateReplacements: { '{@width}': '1080' },
};
const JSON_ = {
  response: {
    items: [
      { id: 'P1', price: 52, mrp: 60, name: null, display_name: 'Milk 1 L', img: 'https://cdn.example/{@width}/m.jpg', g: 9, sold_out: false, inventory: 4 },
      { id: 'P1', price: 0, mrp: 60, name: 'Zero price row', sold_out: false, inventory: 4 },
      { id: 'P2', price: 99, mrp: 99, name: 'Other product', sold_out: false, inventory: 4 },
      { id: 'P1', price: '52.5', mrp: '60', name: 'Second pack', sold_out: true, inventory: 4 },
    ],
  },
};

test('readApiRows: root fallbacks, eq with {{pid}}, ne, rupees -> paise, oos, image template', () => {
  const rows = readApiRows(API, JSON_, { pid: 'P1' });
  assert.equal(rows.length, 2, 'the zero-price row and the other product are not this product');
  assert.deepEqual(rows[0], { pid: 'P1', name: 'Milk 1 L', price: 5200, mrp: 6000, image: 'https://cdn.example/1080/m.jpg', inStock: true, groupId: '9' });
  assert.equal(rows[1]!.price, 5250, '"52.5" rupees is 5250 paise');
  assert.equal(rows[1]!.inStock, false, 'sold_out: true marks it out of stock');
  assert.equal(rows[1]!.name, 'Second pack', 'first productName path with a value');
  const inv0 = readApiRows(API, { response: { items: [{ id: 'P1', price: 10, inventory: 0 }] } }, { pid: 'P1' });
  assert.equal(inv0[0]!.inStock, false, 'a second oos rule');
  assert.deepEqual(readApiRows(API, { response: {} }, { pid: 'P1' }), [], 'no root: no rows');
  assert.deepEqual(readApiRows(API, JSON_, { pid: 'P9' }), [], 'eq filters every row out');
});

test('readApiRows: oosDefault when the recipe has no oos markers; a single object root', () => {
  const recipe = (oosDefault?: 0 | 1): ApiRecipe => ({ url: 'u', method: 'GET', parse: { root: ['item'], fields: { price: 'p' }, ...(oosDefault === undefined ? {} : { oosDefault }) } });
  const doc = { item: { p: 10 } };
  assert.equal(readApiRows(recipe(), doc)[0]!.inStock, true);
  assert.equal(readApiRows(recipe(0), doc)[0]!.inStock, true);
  assert.equal(readApiRows(recipe(1), doc)[0]!.inStock, false);
  assert.equal(readApiRows(recipe(), doc)[0]!.price, 1000);
  assert.equal(readApiRows(recipe(), { item: { p: -5 } })[0]!.price, null, 'a negative price is no price');
});

const good = (): ReaderConfig => JSON.parse(JSON.stringify(bundledReader('amazon')!.config)) as ReaderConfig;
const errorsOf = (c: unknown) => { const v = validateReader(c); return v.ok ? [] : v.errors; };

test('validateReader: every bundled config passes; a good API recipe passes', () => {
  assert.deepEqual(BUNDLED_READERS.map((r) => r.config.store), STORE_IDS, 'a bundled desktop reader for every store');
  for (const r of BUNDLED_READERS) assert.deepEqual(errorsOf(r.config), [], r.version);
  assert.deepEqual(errorsOf({ ...good(), apiRecipes: [{ ...API, headers: { lat: 28.5, 'content-type': 'application/json' } }] }), []);
});

test('validateReader: refuses what it does not understand', () => {
  const cases: [string, (c: Record<string, any>) => void, RegExp][] = [
    ['unsupported selector', (c) => { c.domRecipe.price[0].selector = ['div:first-child']; }, /domRecipe\.price\[0\]\.selector\[0\]/],
    ['unknown field key', (c) => { c.domRecipe.price[0].fallbackToAnyPrice = true; }, /unknown key "fallbackToAnyPrice"/],
    ['unknown top-level key', (c) => { c.trustMe = true; }, /config: unknown key "trustMe"/],
    ['unknown domRecipe key', (c) => { c.domRecipe.variants = []; }, /domRecipe: unknown key "variants"/],
    ['unimplemented availability fallback', (c) => { c.domRecipe.availability.sellerPageFallback = {}; }, /unknown key "sellerPageFallback"/],
    ['bad regex', (c) => { c.domRecipe.price[0].regex = ['([0-9']; }, /bad regex/],
    ['unknown attribute', (c) => { c.domRecipe.name[0].attribute = 'outerText'; }, /attribute: unknown/],
    ['empty selector reading nothing', (c) => { c.domRecipe.name[0] = { selector: [], attribute: 'textContent' }; }, /empty selector/],
    ['upper-case stock text', (c) => { c.domRecipe.availability.outOfStockText = ['Sold Out']; }, /lower-case/],
    ['missing price list', (c) => { delete c.domRecipe.price; }, /domRecipe\.price: must be an array/],
    ['unknown store', (c) => { c.store = 'ebay'; }, /store: unknown/],
    ['revision 0', (c) => { c.revision = 0; }, /revision/],
    ['verified not a date', (c) => { c.verified = 'yes'; }, /verified/],
    ['earlyStop not ids', (c) => { c.domRecipe.earlyStop = { complete: ['#x y'] }; }, /earlyStop/],
    ['User-Agent header', (c) => { c.apiRecipes = [{ ...API, headers: { 'User-Agent': 'Mozilla/5.0' } }]; }, /"User-Agent" is not ours to set/],
    ['Origin header', (c) => { c.apiRecipes = [{ ...API, headers: { origin: 'https://store.example' } }]; }, /"origin" is not ours to set/],
    ['Cookie header', (c) => { c.apiRecipes = [{ ...API, headers: { Cookie: 'a=b' } }]; }, /"Cookie" is not ours/],
    ['X-Forwarded-For header', (c) => { c.apiRecipes = [{ ...API, headers: { 'X-Forwarded-For': '1.2.3.4' } }]; }, /not ours/],
    ['unknown API field', (c) => { c.apiRecipes = [{ ...API, parse: { ...API.parse, fields: { cost: 'p' } } }]; }, /unknown key "cost"/],
    ['API recipe without root', (c) => { c.apiRecipes = [{ ...API, parse: { ...API.parse, root: [] } }]; }, /parse\.root/],
    ['bad oosDefault', (c) => { c.apiRecipes = [{ ...API, parse: { ...API.parse, oosDefault: 2 } }]; }, /oosDefault/],
    ['API method PUT', (c) => { c.apiRecipes = [{ ...API, method: 'PUT' }]; }, /method GET\|POST/],
    ['offers without items', (c) => { c.domRecipe.offers = { title: { selector: ['b'], attribute: 'textContent' }, text: { selector: ['p'], attribute: 'textContent' } }; }, /domRecipe\.offers\.items/],
    ['offers max 50', (c) => { c.domRecipe.offers = { items: '.o', title: { selector: ['b'], attribute: 'textContent' }, text: { selector: ['p'], attribute: 'textContent' }, max: 50 }; }, /offers\.max: 1 to 20/],
    ['unknown offers key', (c) => { c.domRecipe.offers = { items: '.o', title: { selector: ['b'], attribute: 'textContent' }, text: { selector: ['p'], attribute: 'textContent' }, link: {} }; }, /domRecipe\.offers: unknown key "link"/],
  ];
  for (const [name, mutate, want] of cases) {
    const c = good() as unknown as Record<string, any>;
    mutate(c);
    const errors = errorsOf(c);
    assert.ok(errors.some((e) => want.test(e)), `${name}: ${JSON.stringify(errors)}`);
  }
  assert.deepEqual(errorsOf('{}'), ['config must be an object']);
});

test('configVersion: same content same id (key order irrelevant), any change a new id', () => {
  const a = good();
  const v = configVersion(a);
  assert.match(v, new RegExp(`^amazon\\.desktop\\.r${a.revision}\\.[0-9a-f]{12}$`));
  const shuffled = Object.fromEntries(Object.entries(a).reverse()) as unknown as ReaderConfig;
  shuffled.domRecipe = Object.fromEntries(Object.entries(a.domRecipe).reverse()) as unknown as ReaderConfig['domRecipe'];
  assert.equal(configVersion(shuffled), v, 'keys in another order');
  assert.equal(canonicalJson(shuffled), canonicalJson(a));
  const changes: ((c: any) => void)[] = [
    (c) => { c.revision += 1; },
    (c) => { c.verified = null; },
    (c) => { c.domRecipe.price[0].regex[0] += '?'; },
    (c) => { c.domRecipe.availability.outOfStockText.push('sold out'); },
    (c) => { c.domRecipe.name[0].selector[0] = '#productTitle2'; },
  ];
  for (const change of changes) {
    const c = good();
    change(c);
    assert.notEqual(configVersion(c), v, String(change));
  }
});

test('readPage: decisions in order, never a price from outside the price fields', () => {
  const cfg = (d: Partial<ReaderConfig['domRecipe']>, verified: string | null = '2026-10-27'): ReaderConfig => ({
    schema: 1, store: 'amazon', device: 'desktop', revision: 1, verified, reportsPid: false,
    domRecipe: {
      name: [{ selector: ['p.multi'], attribute: 'textContent' }],
      price: [{ selector: ['#box'], attribute: 'textContent', squash: true, regex: ['([\\d,]+(?:\\.\\d{1,2})?)'] }],
      mrp: [], image: [], pid: [], itm: [],
      availability: { selectors: [], outOfStockText: [] },
      ...d,
    },
  });
  assert.equal(readPage(cfg({}), PAGE).price, 123450);
  assert.equal(readPage(cfg({}), PAGE).status, 'priced');
  assert.equal(readPage(cfg({ blocked: [['A1 B2', 'C3']] }), PAGE).status, 'blocked', 'every regex in an alternative matches');
  assert.equal(readPage(cfg({ blocked: [['A1 B2', 'nope']] }), PAGE).status, 'priced', 'one regex missing: not blocked');
  assert.equal(readPage(cfg({ classSelector: '.not-on-page' }), PAGE).rule, 'amazon:class-mismatch');
  assert.equal(readPage(cfg({}, null), PAGE).rule, 'amazon:reader-not-verified');
  assert.equal(readPage(cfg({ name: [{ selector: ['#none'], attribute: 'textContent' }] }), PAGE).rule, 'amazon:no-name');
  const unavailable = readPage(cfg({ availability: { selectors: ['#stock'], outOfStockText: ['currently unavailable'] } }), PAGE);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.price, null, 'unavailable carries no price, even with one on the page');
  const noPrice = readPage(cfg({ price: [{ selector: ['#none'], attribute: 'textContent' }] }), PAGE);
  assert.equal(noPrice.status, 'unrecognised', 'the page is full of numbers, none from the price field');
  assert.equal(noPrice.price, null);
  assert.equal(readPage(cfg({ price: [{ selector: ['#none'], attribute: 'textContent' }, { selector: ['#box'], attribute: 'textContent', squash: true, regex: ['([\\d,]+(?:\\.\\d{1,2})?)'] }] }), PAGE).price, 123450, 'fallback chain: the second field');
});

test('readOffers: every offer card in page order, each read inside its own card, capped', () => {
  const cfg = good();
  cfg.domRecipe.offers = {
    items: '#offers .card', max: 3,
    title: { selector: ['h6'], attribute: 'textContent' },
    text: { selector: ['.full'], attribute: 'textContent' },
    count: { selector: ['.n'], attribute: 'textContent' },
    code: { selector: ['.c'], attribute: 'attr:data-code' },
  };
  const card = (t: string, x: string, n = '', c = '') => `<div class="card"><h6>${t}</h6><span class="full">${x}</span>${n ? `<a class="n">${n}</a>` : ''}${c ? `<b class="c" data-code="${c}">${c}</b>` : ''}</div>`;
  const page = `<div class="card"><h6>Outside</h6><span class="full">not an offer box</span></div>
    <div id="offers">${card('Bank Offer', 'Upto &#8377;1,000 off', '27 offers')}<div class="card"><h6>No text</h6></div>${card('Cashback', 'x'.repeat(300))}${card('EMI', 'No cost')}${card('Fourth', 'over the cap')}</div>`;
  assert.deepEqual(readOffers(cfg, page), [
    { title: 'Bank Offer', text: 'Upto ₹1,000 off', count: '27 offers', code: null },
    { title: 'Cashback', text: 'x'.repeat(200), count: null, code: null },
  ], 'outside the box: no; a card without text: skipped; text capped at 200; max counts cards looked at');
  assert.equal(readOffers(good(), page).length, 0, 'a recipe without offers reads none');

  const coded = `<div id="offers">${card('10% off', 'Use code SAVE10', '', 'SAVE10')}${card('10% off', 'Use code SAVE10', '', 'SAVE10')}${card('Free gift', 'see page', '', 'not a code!')}</div>`;
  assert.deepEqual(readOffers(cfg, coded), [
    { title: '10% off', text: 'Use code SAVE10', count: null, code: 'SAVE10' },
    { title: 'Free gift', text: 'see page', count: null, code: null },
  ], 'an offer the page repeats is listed once; text that is not a code is no code');
});