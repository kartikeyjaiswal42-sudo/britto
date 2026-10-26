import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRupees, parseRupees } from './money.ts';
import { parseKey, parseProductLink } from './stores.ts';
import { DAY, isChange, stats } from './history.ts';
import { saleCheck, verdict } from './judge.ts';
import { decideAlert, describeRule, newAlert, parseRule, readingMovesAlerts, suggestTargets } from './alerts.ts';
import { pickDue, refreshInterval } from './schedule.ts';
import type { PricePoint } from './types.ts';

// ------------------------------------------------------------------ money
test('parseRupees reads store formats as integer paise', () => {
  assert.equal(parseRupees('₹1,29,900.00'), 12_990_000);
  assert.equal(parseRupees('&#x20b9;6,999.00'), 699_900);
  assert.equal(parseRupees('Rs. 999'), 99_900);
  assert.equal(parseRupees('₹10.6'), 1_060);
  assert.equal(parseRupees('265'), 26_500);
  assert.equal(parseRupees('₹265.00 with 11 percent savings'), null, 'prose is not an amount');
  assert.equal(parseRupees(''), null);
  assert.equal(parseRupees('1,2345'), null);
});

test('formatRupees uses Indian grouping', () => {
  assert.equal(formatRupees(12_990_000), '₹1,29,900');
  assert.equal(formatRupees(26_500), '₹265');
  assert.equal(formatRupees(1_060), '₹10.60');
  assert.equal(formatRupees(1_000_000_000), '₹1,00,00,000');
  assert.equal(formatRupees(null), '—');
});

// ------------------------------------------------------------------ links
test('Amazon links in every shape become one key', () => {
  for (const url of [
    'https://www.amazon.in/Cello-Butterflow-Simply/dp/B09X5DK382/ref=sr_1_5?crid=X&keywords=pen',
    'amazon.in/dp/B09X5DK382',
    'https://m.amazon.in/gp/aw/d/B09X5DK382?psc=1',
    'https://www.amazon.in/gp/product/b09x5dk382',
  ]) {
    const r = parseProductLink(url);
    assert.ok(r.ok, url);
    if (r.ok) {
      assert.equal(r.link.key, 'amazon:B09X5DK382');
      assert.equal(r.link.url, 'https://www.amazon.in/dp/B09X5DK382');
    }
  }
});

test('Flipkart keeps the variant pid and drops tracking params', () => {
  const r = parseProductLink('https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=LST&marketplace=FLIPKART');
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.link.key, 'flipkart:itm6ac6485515ae4.MOBGTAGPTB3VS24W');
    assert.equal(r.link.url, 'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W');
  }
  const dl = parseProductLink('https://dl.flipkart.com/dl/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4');
  assert.ok(dl.ok && dl.link.key === 'flipkart:itm6ac6485515ae4');
});

test('Myntra product links', () => {
  const r = parseProductLink('https://www.myntra.com/tshirts/roadster/roadster-men-black-printed-round-neck-t-shirt/1700944/buy');
  assert.ok(r.ok && r.link.key === 'myntra:1700944');
});

test('Vijay Sales product links: /p/<id>/<name>, the name is required', () => {
  const r = parseProductLink('https://www.vijaysales.com/p/222878/morphy-richards-digital-5-litres-air-fryer?srsltid=junk#reviews');
  assert.ok(r.ok && r.link.key === 'vijaysales:222878');
  assert.equal(r.ok && r.link.url, 'https://www.vijaysales.com/p/222878/morphy-richards-digital-5-litres-air-fryer');
  // Measured 2026-10-26: /p/184556 without the name answers 404, so it is not a product link.
  assert.deepEqual(parseProductLink('https://www.vijaysales.com/p/184556'), { ok: false, reason: 'not_a_product' });
  assert.deepEqual(parseProductLink('https://www.vijaysales.com/air-conditioners'), { ok: false, reason: 'not_a_product' });
  assert.deepEqual(parseKey('vijaysales:222878'), { store: 'vijaysales', pid: '222878' });
  assert.equal(parseKey('vijaysales:22x'), null);
});

test('Look-alike hosts, non-product pages and junk are refused', () => {
  assert.deepEqual(parseProductLink('https://amazon.in.evil.example/dp/B09X5DK382'), { ok: false, reason: 'unsupported_store' });
  assert.deepEqual(parseProductLink('https://www.amazon.com/dp/B09X5DK382'), { ok: false, reason: 'unsupported_store' });
  assert.deepEqual(parseProductLink('https://www.amazon.in/s?k=pen'), { ok: false, reason: 'not_a_product' });
  assert.deepEqual(parseProductLink('javascript:alert(1)'), { ok: false, reason: 'not_a_url' });
  assert.deepEqual(parseProductLink('   '), { ok: false, reason: 'not_a_url' });
  const short = parseProductLink('https://amzn.in/d/abc123');
  assert.equal(short.ok, false);
  assert.equal(!short.ok && short.reason, 'short_link');
});

test('parseKey accepts only real key shapes', () => {
  assert.deepEqual(parseKey('amazon:B09X5DK382'), { store: 'amazon', pid: 'B09X5DK382' });
  assert.equal(parseKey('amazon:b09x5dk382'), null);
  assert.equal(parseKey('toString:x'), null);
  assert.equal(parseKey('myntra:1700944; DROP TABLE'), null);
  assert.equal(parseKey('flipkart:itm6ac6485515ae4.MOBGTAGPTB3VS24W')?.store, 'flipkart');
});

// ------------------------------------------------------------------ history
const T0 = Date.UTC(2026, 6, 1); // 1 Jul 2026
const pt = (day: number, price: number | null, extra: Partial<PricePoint> = {}): PricePoint =>
  ({ at: T0 + day * DAY, price, mrp: null, inStock: price != null, source: 'server', ...extra });

test('stats are time-weighted: a price that held 9 days outweighs one that held 1', () => {
  const s = stats([pt(0, 100_00), pt(9, 200_00)], T0 + 10 * DAY);
  assert.equal(s.average, 110_00);
  assert.equal(s.median, 100_00);
  assert.equal(s.lowest?.price, 100_00);
  assert.equal(s.highest?.price, 200_00);
  assert.equal(s.current, 200_00);
  assert.equal(s.daysTracked, 10);
  assert.equal(s.percentile, 0.9);
  assert.equal(s.changes, 1);
});

test('stats never extend the last price past the last check', () => {
  const s = stats([pt(0, 100_00), pt(5, 50_00)], T0 + 5 * DAY);
  assert.equal(s.average, 100_00, 'the 50 has held for zero known time');
});

test('out-of-stock time does not count as priced time', () => {
  const s = stats([pt(0, 100_00), pt(5, null), pt(9, 300_00)], T0 + 10 * DAY);
  assert.equal(s.average, Math.round((100_00 * 5 + 300_00 * 1) / 6));
});

test('isChange: only a visible change makes a new point', () => {
  const prev = pt(0, 100_00);
  assert.equal(isChange(prev, { price: 100_00, mrp: null, inStock: true }), false);
  assert.equal(isChange(prev, { price: 99_00, mrp: null, inStock: true }), true);
  assert.equal(isChange(prev, { price: 100_00, mrp: 150_00, inStock: true }), true);
  assert.equal(isChange(undefined, { price: 100_00, mrp: null, inStock: true }), true);
});

// ------------------------------------------------------------------ verdict
test('verdict: too early under 7 days, whatever the price', () => {
  const v = verdict(stats([pt(0, 100_00), pt(3, 10_00)], T0 + 4 * DAY));
  assert.equal(v.kind, 'too_early');
});

test('verdict: buy at the lowest, wait well above usual, fair in between', () => {
  const series = [pt(0, 1000_00), pt(20, 900_00)];
  assert.equal(verdict(stats(series, T0 + 30 * DAY)).kind, 'buy');
  // 1150 for 10 of 40 days: dearer than 75% of the watched time, 15% over usual.
  // (At 20 of 40 days it would be 'fair': a price held half the time IS usual.)
  const high = [pt(0, 1000_00), pt(30, 1150_00)];
  assert.equal(verdict(stats(high, T0 + 40 * DAY)).kind, 'wait');
  const mid = [pt(0, 900_00), pt(10, 1100_00), pt(20, 1000_00)];
  assert.equal(verdict(stats(mid, T0 + 30 * DAY)).kind, 'fair');
});

test('verdict: unavailable when out of stock', () => {
  assert.equal(verdict(stats([pt(0, 100_00), pt(10, null)], T0 + 12 * DAY)).kind, 'unavailable');
});

// ------------------------------------------------------------------ sale check
test('sale: a real drop against the usual price', () => {
  const pts = [pt(0, 1000_00, { mrp: 2000_00 }), pt(40, 800_00, { mrp: 2000_00 })];
  const s = saleCheck(pts, T0 + 41 * DAY);
  assert.equal(s.status, 'real_drop');
  assert.equal(s.usualPrice, 1000_00);
  assert.equal(s.realPct, 0.2);
  assert.equal(s.claimedPct, 0.6);
  assert.equal(s.mrpInflated, false, '60% claimed vs 20% real is exactly 3x: inflated only at >= 3x');
});

test('sale: hiked then "dropped" back to the old price', () => {
  // 1000 for 50 days, raised to 1300 for 12 days, "sale" at 999.
  const pts = [pt(0, 1000_00, { mrp: 3000_00 }), pt(50, 1300_00, { mrp: 3000_00 }), pt(62, 999_00, { mrp: 3000_00 })];
  const s = saleCheck(pts, T0 + 63 * DAY);
  assert.equal(s.status, 'hike_then_drop');
  assert.deepEqual(s.hike, { from: 1000_00, to: 1300_00, at: T0 + 50 * DAY });
  assert.equal(s.mrpInflated, true);
});

test('sale: a long hike is still caught', () => {
  const pts = [pt(0, 1000_00), pt(40, 1300_00), pt(65, 999_00)];
  assert.equal(saleCheck(pts, T0 + 66 * DAY).status, 'hike_then_drop');
});

test('sale: M.R.P. discount with no real drop', () => {
  const pts = [pt(0, 305_00, { mrp: 699_00 })];
  const s = saleCheck(pts, T0 + 30 * DAY);
  assert.equal(s.status, 'no_real_drop');
  assert.equal(s.mrpInflated, true);
  assert.equal(Math.round((s.claimedPct ?? 0) * 100), 56);
});

test('sale: too little history is too_early, never clean', () => {
  const s = saleCheck([pt(0, 305_00, { mrp: 699_00 })], T0 + 3 * DAY);
  assert.equal(s.status, 'too_early');
  assert.equal(s.realPct, null);
  assert.equal(s.mrpInflated, null);
});

// ------------------------------------------------------------------ alerts
test('below-target alert fires once per crossing', () => {
  let st = newAlert({ kind: 'below', target: 500_00 }, 600_00, true);
  const step = (price: number) => { const d = decideAlert(st, { price, inStock: true }, 0); st = d.next; return d.fire; };
  assert.deepEqual([550_00, 499_00, 480_00, 520_00, 450_00].map(step), [false, true, false, false, true]);
});

test('below-target alert set while already below waits for the next crossing', () => {
  let st = newAlert({ kind: 'below', target: 500_00 }, 450_00, true);
  const step = (price: number) => { const d = decideAlert(st, { price, inStock: true }, 0); st = d.next; return d.fire; };
  assert.deepEqual([440_00, 510_00, 490_00].map(step), [false, false, true]);
});

test('drop alert measures from the price when set, then from the last fire', () => {
  let st = newAlert({ kind: 'drop', pct: 10 }, 1000_00, true);
  const step = (price: number) => { const d = decideAlert(st, { price, inStock: true }, 0); st = d.next; return d.fire; };
  assert.deepEqual([950_00, 900_00, 850_00, 810_00].map(step), [false, true, false, true]);
});

test('out-of-stock never fires a price alert; back-in-stock fires once', () => {
  const below = newAlert({ kind: 'below', target: 500_00 }, 600_00, true);
  assert.equal(decideAlert(below, { price: 100_00, inStock: false }, 0).fire, false);
  let st = newAlert({ kind: 'in_stock' }, null, false);
  const step = (inStock: boolean) => { const d = decideAlert(st, { price: 100_00, inStock }, 0); st = d.next; return d.fire; };
  assert.deepEqual([false, true, true, false, true].map(step), [false, true, false, false, true]);
});

// ------------------------------------------------------------------ schedule
test('refresh backs off on failure and never exceeds a week', () => {
  assert.equal(refreshInterval({ failCount: 0, watchers: 1 }), 3 * 3_600_000);
  assert.equal(refreshInterval({ failCount: 2, watchers: 0 }), 48 * 3_600_000);
  assert.equal(refreshInterval({ failCount: 30, watchers: 0 }), 7 * 24 * 3_600_000);
});

test('pickDue: never-checked first, then most overdue, only overdue ones', () => {
  const now = 100 * 3_600_000;
  const due = pickDue([
    { key: 'a', lastAttemptAt: now - 13 * 3_600_000, failCount: 0, watchers: 0 },
    { key: 'b', lastAttemptAt: now - 1 * 3_600_000, failCount: 0, watchers: 0 },
    { key: 'c', lastAttemptAt: null, failCount: 0, watchers: 0 },
    { key: 'd', lastAttemptAt: now - 6 * 3_600_000, failCount: 0, watchers: 2 },
  ], now, 10);
  assert.deepEqual(due.map((p) => p.key), ['c', 'd', 'a']);
});

test('alert rules are shape-checked; money stays whole paise', () => {
  assert.deepEqual(parseRule({ kind: 'below', target: 25_000 }), { ok: true, rule: { kind: 'below', target: 25_000 } });
  assert.equal(parseRule({ kind: 'below', target: 250.5 }).ok, false, 'fractional paise');
  assert.equal(parseRule({ kind: 'below', target: 50 }).ok, false, 'under ₹1');
  assert.equal(parseRule({ kind: 'below', target: '25000' }).ok, false, 'a string is not paise');
  assert.equal(parseRule({ kind: 'drop', pct: 0 }).ok, false);
  assert.equal(parseRule({ kind: 'drop', pct: 95 }).ok, false);
  assert.deepEqual(parseRule({ kind: 'drop', pct: 5 }), { ok: true, rule: { kind: 'drop', pct: 5 } });
  assert.deepEqual(parseRule({ kind: 'in_stock', target: 1 }), { ok: true, rule: { kind: 'in_stock' } }, 'extra fields dropped');
  assert.equal(parseRule({ kind: 'sell' }).ok, false);
  assert.equal(parseRule(null).ok, false);
});

test('alert rules read as plain English', () => {
  assert.equal(describeRule({ kind: 'below', target: 25_050 }), 'at or below ₹250.50');
  assert.equal(describeRule({ kind: 'drop', pct: 1 }), 'any price drop');
  assert.equal(describeRule({ kind: 'drop', pct: 10 }), 'drops 10% or more');
  assert.equal(describeRule({ kind: 'in_stock' }), 'back in stock');
});

test('a forged extension report on a server-read store cannot fire alerts', () => {
  assert.equal(readingMovesAlerts(true, 'server'), true);
  assert.equal(readingMovesAlerts(true, 'extension'), false, 'Amazon: wait for our own re-read');
  assert.equal(readingMovesAlerts(false, 'extension'), true, 'Flipkart/Myntra: reports are all there is');
});

test('suggested targets are whole rupees under the price', () => {
  assert.deepEqual(suggestTargets(26_500), [25_100, 23_800]); // ₹265 -> ₹251.75 -> ₹251; ₹238.50 -> ₹238
  assert.deepEqual(suggestTargets(176_331), [167_500, 158_600]);
  assert.deepEqual(suggestTargets(1_500), [], 'too cheap to bother');
  assert.deepEqual(suggestTargets(null), []);
});

test('re-checking the same reading never fires twice (alerts are re-evaluated on every read)', () => {
  for (const rule of [{ kind: 'below', target: 500_00 }, { kind: 'drop', pct: 5 }, { kind: 'in_stock' }] as const) {
    let st = newAlert(rule, rule.kind === 'in_stock' ? null : 600_00, rule.kind !== 'in_stock');
    let fired = 0;
    for (let i = 0; i < 5; i++) {
      const d = decideAlert(st, { price: 450_00, inStock: true }, i);
      st = d.next;
      if (d.fire) fired++;
    }
    assert.equal(fired, 1, rule.kind);
  }
});
