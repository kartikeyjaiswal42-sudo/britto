import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuotes, compareBasket, compareItem, nameSimilarity, packTotal, parsePackSize, unitPrice, type GroceryQuote } from './grocery.ts';

// Quotes here are MADE UP to exercise the logic: no grocery platform has a verified reader yet
// (they refuse servers; real pages must come from the shopper's phone).

test('pack sizes as platforms print them', () => {
  const cases: [string, { size: number; unit: string; count: number } | null][] = [
    ['500 g', { size: 500, unit: 'g', count: 1 }],
    ['Amul Butter 500g', { size: 500, unit: 'g', count: 1 }],
    ['1 kg', { size: 1000, unit: 'g', count: 1 }],
    ['1.5 L', { size: 1500, unit: 'ml', count: 1 }],
    ['Coke 6 x 300 ml', { size: 300, unit: 'ml', count: 6 }],
    ['300 ml x 6', { size: 300, unit: 'ml', count: 6 }],
    ['2 × 1 kg', { size: 1000, unit: 'g', count: 2 }],
    ['Pack of 6 (200 ml each)', { size: 200, unit: 'ml', count: 6 }],
    ['12 pcs', { size: 12, unit: 'pc', count: 1 }],
    ['Eggs Pack of 30', { size: 1, unit: 'pc', count: 30 }],
    ['Fresh coriander bunch', null],
    ['', null],
  ];
  for (const [text, want] of cases) assert.deepEqual(parsePackSize(text), want, text);
  assert.equal(packTotal(parsePackSize('6 x 300 ml')!), 1800);
});

test('unit price: per 100 g, per 100 ml, per piece', () => {
  assert.deepEqual(unitPrice(28_000, parsePackSize('500 g')!), { paise: 5600, per: '100 g' });
  assert.deepEqual(unitPrice(54_000, parsePackSize('1 kg')!), { paise: 5400, per: '100 g' }, 'the bigger pack is cheaper per 100 g');
  assert.deepEqual(unitPrice(23_400, parsePackSize('6 x 300 ml')!), { paise: 1300, per: '100 ml' });
  assert.deepEqual(unitPrice(21_000, parsePackSize('Pack of 30')!), { paise: 700, per: '1 pc' });
});

test('names: pack sizes and filler words do not count', () => {
  assert.equal(nameSimilarity('Amul Butter 500 g', 'Amul Butter - Pasteurised, 500 g'), 1);
  assert.ok(nameSimilarity('Amul Butter 500 g', 'Amul Cheese Slices 200 g') < 0.8);
  assert.equal(nameSimilarity('Tata Salt 1 kg', 'Daawat Basmati Rice'), 0);
  assert.equal(nameSimilarity('Amul Butter 500 g', 'Amul Cheese Slices 200 g', 'Amul'), 0, 'a shared brand alone is not a match');
});

const q = (platform: GroceryQuote['platform'], title: string, price: number, extra: Partial<GroceryQuote> = {}): GroceryQuote => ({
  platform, address: '110001', title, brand: 'Amul', pack: null, price, mrp: null, inStock: true, at: 1, ...extra,
});

test('one item: same address only, in stock first, cheapest per 100 g, only a certain match can win', () => {
  const ref = { item: 'Amul Butter 500 g', brand: 'Amul', pack: '500 g' };
  const r = compareItem(ref, '110001', [
    q('blinkit', 'Amul Butter 500 g', 28_500),
    q('zepto', 'Amul Butter 500 g', 27_900),
    q('instamart', 'Amul Butter 500 g', 26_000, { inStock: false }),
    q('bigbasket', 'Amul Butter 1 kg', 54_000),
    q('jiomart', 'Amul Butter 500 g', 25_000, { address: '400001' }),
    q('dmart', 'Amul Cheese Slices 200 g', 12_000),
  ]);
  assert.deepEqual(r.leftOut.map((l) => `${l.platform}: ${l.reason}`).sort(), ['dmart: not the same item', 'jiomart: priced for another delivery address']);
  assert.deepEqual(r.rows.map((x) => x.platform), ['bigbasket', 'zepto', 'blinkit', 'instamart'], 'in stock first, then per 100 g');
  assert.equal(r.rows.find((x) => x.platform === 'bigbasket')!.match, 'check', 'a different pack size is "check this one"');
  assert.equal(r.best, 'zepto', 'the cheapest SAME item in stock, not the cheaper-per-100 g bigger pack');
});

test('one item: no winner when nothing is certainly the same item', () => {
  const r = compareItem({ item: 'Amul Butter 500 g', brand: 'Amul', pack: '500 g' }, '110001', [q('blinkit', 'Amul Butter', 28_500, { brand: null })]);
  assert.equal(r.rows[0]!.match, 'check');
  assert.equal(r.best, null);
});

test('basket: complete baskets first; delivery added only when read; nothing silently swapped', () => {
  const butter = compareItem({ item: 'Amul Butter 500 g', brand: 'Amul', pack: '500 g' }, '110001', [q('blinkit', 'Amul Butter 500 g', 28_500), q('zepto', 'Amul Butter 500 g', 27_900)]);
  const milk = compareItem({ item: 'Amul Taaza Milk 1 L', brand: 'Amul', pack: '1 L' }, '110001', [q('blinkit', 'Amul Taaza Milk 1 L', 7_400), q('zepto', 'Amul Taaza Milk 500 ml', 3_800)]);
  const totals = compareBasket([butter, milk], { blinkit: 2_500 });
  assert.equal(totals[0]!.platform, 'blinkit', 'the only platform with every item');
  assert.deepEqual(totals[0], { platform: 'blinkit', items: 35_900, delivery: 2_500, total: 38_400, missing: [] });
  assert.deepEqual(totals[1], { platform: 'zepto', items: 27_900, delivery: null, total: 27_900, missing: ['Amul Taaza Milk 1 L'] }, 'a 500 ml pack is not the 1 L item');
});

test('quotes from a client are shape-checked', () => {
  const ok = { platform: 'blinkit', address: '110001', title: 'Amul Butter 500 g', brand: 'Amul', pack: '500 g', price: 28_500, mrp: 29_000, inStock: true, at: 1 };
  assert.ok(cleanQuotes([ok]).ok);
  for (const [bad, want] of [
    [[{ ...ok, platform: 'amazon' }], /platform/], [[{ ...ok, price: 285.5 }], /price/], [[{ ...ok, price: 0 }], /price/],
    [[{ ...ok, address: '' }], /address/], [[], /1 to 40/], [Array(41).fill(ok), /1 to 40/], [[{ ...ok, inStock: 'yes' }], /inStock/],
  ] as const) {
    const r = cleanQuotes(bad);
    assert.ok(!r.ok && want.test(r.reason), JSON.stringify(bad).slice(0, 80));
  }
});
