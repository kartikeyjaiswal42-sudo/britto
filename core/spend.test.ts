import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOrders } from './interpret.ts';
import { validateReader, type ReaderConfig } from './recipe.ts';
import { isOrder, mergeOrders, parseOrderDate, summarize, type Order } from './spend.ts';

// A MADE-UP order-history page (no real one exists yet: it needs the shopper's own login).
// It tests the machinery only; no store's recipe is verified against it.
const PAGE = `<html><body><h1>Your Orders</h1>
<div class="order"><span class="id">403-1111111-1111111</span><span class="when">Order placed 29 October 2026</span><span class="total">₹1,763.27</span><a class="item">Cello Technotip pens</a></div>
<div class="order"><span class="id">403-2222222-2222222</span><span class="when">Order placed 3 Oct 2026</span><span class="total">₹265</span><a class="item">Cello Butterflow pens</a></div>
<div class="order"><span class="id">403-3333333-3333333</span><span class="when">Order placed 30 September 2026</span><span class="total">₹99.00</span></div>
<div class="order"><span class="id">403-4444444-4444444</span><span class="when">Order placed 31 September 2026</span><span class="total">₹500</span></div>
<div class="order"><span class="id"></span><span class="when">Order placed 1 Oct 2026</span><span class="total">₹700</span></div>
<div class="order"><span class="id">403-1111111-1111111</span><span class="when">Order placed 29 October 2026</span><span class="total">₹1,763.27</span></div>
<div class="ad"><span class="total">₹9,999</span></div>
</body></html>`;
const URL_ORDERS = 'https://www.amazon.in/gp/your-account/order-history?ref=x';

const config = (verified: string | null): ReaderConfig => ({
  schema: 1, store: 'amazon', device: 'mobile', revision: 1, verified: '2026-10-29', reportsPid: true,
  domRecipe: {
    name: [{ selector: ['#title'], attribute: 'textContent' }], price: [], mrp: [], image: [], pid: [], itm: [],
    availability: { selectors: [], outOfStockText: [] },
    orderHistory: {
      verified, page: '^https://www\\.amazon\\.in/gp/your-account/order-history', items: '.order',
      orderId: { selector: ['.id'], attribute: 'textContent' },
      date: { selector: ['.when'], attribute: 'textContent' },
      total: { selector: ['.total'], attribute: 'textContent' },
      titles: { selector: ['.item'], attribute: 'textContent' },
    },
  },
});

test('order dates as stores print them; a day that does not exist is refused', () => {
  assert.equal(parseOrderDate('Order placed 29 October 2026'), '2026-10-29');
  assert.equal(parseOrderDate('3 Oct 2026'), '2026-10-03');
  assert.equal(parseOrderDate('October 3, 2026'), '2026-10-03');
  assert.equal(parseOrderDate('Ordered on Sep. 30, 2026'), '2026-09-30');
  assert.equal(parseOrderDate('03/10/2026'), '2026-10-03', 'Indian day/month order');
  assert.equal(parseOrderDate('31 September 2026'), null, 'no 31st of September');
  assert.equal(parseOrderDate('30 February 2026'), null);
  assert.equal(parseOrderDate('Order placed yesterday'), null);
  assert.equal(parseOrderDate(null), null);
});

test('readOrders: one order per card, skipping cards without an id, a real date or a total', () => {
  const orders = readOrders(config('2026-11-03'), PAGE, URL_ORDERS);
  assert.deepEqual(orders, [
    { store: 'amazon', orderId: '403-1111111-1111111', date: '2026-10-29', total: 176327, items: ['Cello Technotip pens'] },
    { store: 'amazon', orderId: '403-2222222-2222222', date: '2026-10-03', total: 26500, items: ['Cello Butterflow pens'] },
    { store: 'amazon', orderId: '403-3333333-3333333', date: '2026-09-30', total: 9900, items: [] },
  ], 'the 31 September card, the card without an id and the repeated card are not orders; the ad is not an order card');
  assert.ok(orders!.every(isOrder));
});

test('readOrders reads nothing with an unverified rule or on another page', () => {
  assert.equal(readOrders(config(null), PAGE, URL_ORDERS), null, 'a section nobody checked against a real page reads nothing');
  assert.equal(readOrders(config('2026-11-03'), PAGE, 'https://www.amazon.in/dp/B09X5DK382'), null);
  const { orderHistory: _, ...withoutRule } = config('2026-11-03').domRecipe;
  assert.equal(readOrders({ ...config('2026-11-03'), domRecipe: withoutRule }, PAGE, URL_ORDERS), null);
});

test('merging: the same order read again replaces the earlier reading, never counts twice', () => {
  const a: Order = { store: 'amazon', orderId: 'A1', date: '2026-10-29', total: 100_00, items: [] };
  const b: Order = { store: 'flipkart', orderId: 'F1', date: '2026-09-01', total: 50_00, items: [] };
  const aAgain: Order = { ...a, total: 120_00, items: ['updated'] };
  const merged = mergeOrders([a, b], [aAgain]);
  assert.deepEqual(merged.map((o) => [o.store, o.orderId, o.total]), [['amazon', 'A1', 120_00], ['flipkart', 'F1', 50_00]], 'newest first, one A1');
  assert.deepEqual(mergeOrders(merged, merged), merged, 'merging a page twice changes nothing');
  assert.deepEqual(mergeOrders([{ ...a, orderId: 'X' }], [{ ...b, orderId: 'X' }]).length, 2, 'the same number at two stores is two orders');
});

test('summary: totals by month (newest first) and by store (biggest first)', () => {
  const orders: Order[] = [
    { store: 'amazon', orderId: '1', date: '2026-10-29', total: 1_763_27, items: [] },
    { store: 'amazon', orderId: '2', date: '2026-10-03', total: 265_00, items: [] },
    { store: 'flipkart', orderId: '3', date: '2026-09-30', total: 225_00, items: [] },
    { store: 'myntra', orderId: '4', date: '2026-09-02', total: 395_00, items: [] },
  ];
  assert.deepEqual(summarize(orders), {
    orders: 4, total: 2_648_27, first: '2026-09-02', last: '2026-10-29',
    byMonth: [{ month: '2026-10', total: 2_028_27, orders: 2 }, { month: '2026-09', total: 620_00, orders: 2 }],
    byStore: [{ store: 'amazon', total: 2_028_27, orders: 2 }, { store: 'myntra', total: 395_00, orders: 1 }, { store: 'flipkart', total: 225_00, orders: 1 }],
  });
  assert.deepEqual(summarize([]), { orders: 0, total: 0, first: null, last: null, byMonth: [], byStore: [] });
});

test('isOrder: what a client may keep', () => {
  const ok: Order = { store: 'amazon', orderId: 'A1', date: '2026-10-29', total: 100, items: ['x'] };
  assert.ok(isOrder(ok));
  for (const bad of [{ ...ok, store: 'ebay' }, { ...ok, orderId: '' }, { ...ok, date: '2026-02-30' }, { ...ok, date: '29 Oct 2026' }, { ...ok, total: -1 }, { ...ok, total: 1.5 }, { ...ok, items: [1] }, null]) {
    assert.ok(!isOrder(bad), JSON.stringify(bad));
  }
});

test('validator: an orderHistory section is checked like any other', () => {
  const good = config('2026-11-03') as unknown as Record<string, any>;
  assert.deepEqual(validateReader(good).ok ? [] : (validateReader(good) as { errors: string[] }).errors, []);
  const errorsOf = (change: (c: Record<string, any>) => void) => {
    const c = structuredClone(good);
    change(c);
    const v = validateReader(c);
    return v.ok ? [] : v.errors;
  };
  assert.match(errorsOf((c) => { c.domRecipe.orderHistory.verified = 'yes'; }).join(), /orderHistory\.verified/);
  assert.match(errorsOf((c) => { c.domRecipe.orderHistory.page = '('; }).join(), /orderHistory\.page/);
  assert.match(errorsOf((c) => { c.domRecipe.orderHistory.items = 'div:nth-child(2)'; }).join(), /orderHistory\.items/);
  assert.match(errorsOf((c) => { delete c.domRecipe.orderHistory.total; }).join(), /orderHistory\.total/);
  assert.match(errorsOf((c) => { c.domRecipe.orderHistory.upload = true; }).join(), /unknown key "upload"/);
});
