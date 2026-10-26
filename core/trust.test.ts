import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanImage, cleanObserved, judgeObservation, TRUST } from './trust.ts';
import type { PricePoint } from './types.ts';

const NOW = Date.UTC(2026, 9, 26, 12);
const H = 3_600_000;
const pts = (...prices: (number | null)[]): PricePoint[] =>
  prices.map((p, i) => ({ at: NOW - (prices.length - i) * 24 * H, price: p, mrp: null, inStock: p != null, source: 'server' as const }));
const obs = (price: number | null) => ({ price, mrp: null, inStock: price != null });

test('first report for a product is accepted', () => {
  assert.deepEqual(judgeObservation([], null, obs(500_00), 'a', [], NOW), { action: 'accept', reason: 'first' });
});

test('unchanged price: skipped within 10 minutes of the last check, accepted after', () => {
  const p = pts(500_00);
  assert.equal(judgeObservation(p, NOW - 5 * 60_000, obs(500_00), 'a', [], NOW).action, 'skip');
  assert.deepEqual(judgeObservation(p, NOW - 11 * 60_000, obs(500_00), 'a', [], NOW), { action: 'accept', reason: 'unchanged' });
});

test('a small change is accepted; a 40%+ move is held', () => {
  const p = pts(1000_00);
  assert.equal(judgeObservation(p, null, obs(700_00), 'a', [], NOW).reason, 'small_change'); // -30%
  assert.deepEqual(judgeObservation(p, null, obs(600_00), 'a', [], NOW), { action: 'hold', reason: 'big_move' }); // -40%
  assert.equal(judgeObservation(p, null, obs(1400_00), 'a', [], NOW).action, 'hold'); // +40%
  assert.equal(judgeObservation(p, null, obs(1_00), 'a', [], NOW).action, 'hold'); // the forged ₹1
});

test('a held big move is confirmed only by a DIFFERENT reporter, agreeing within 2%, within 48 h', () => {
  const p = pts(1000_00);
  const held = (reporter: string, price: number, hoursAgo: number) => [{ reporter, at: NOW - hoursAgo * H, price, inStock: true }];
  assert.equal(judgeObservation(p, null, obs(500_00), 'a', held('a', 500_00, 1), NOW).action, 'hold', 'same reporter cannot confirm itself');
  assert.equal(judgeObservation(p, null, obs(500_00), 'b', held('a', 500_00, 1), NOW).reason, 'confirmed');
  assert.equal(judgeObservation(p, null, obs(500_00), 'b', held('a', 509_00, 1), NOW).reason, 'confirmed', '1.8% apart agrees');
  assert.equal(judgeObservation(p, null, obs(500_00), 'b', held('a', 515_00, 1), NOW).action, 'hold', '3% apart does not');
  assert.equal(judgeObservation(p, null, obs(500_00), 'b', held('a', 500_00, 49), NOW).action, 'hold', 'too old');
});

test('going out of stock is accepted; coming back is compared with the last REAL price', () => {
  const p = pts(1000_00, null);
  assert.equal(judgeObservation(pts(1000_00), null, obs(null), 'a', [], NOW).reason, 'stock_change');
  assert.equal(judgeObservation(p, null, obs(950_00), 'a', [], NOW).reason, 'small_change');
  assert.equal(judgeObservation(p, null, obs(100_00), 'a', [], NOW).action, 'hold');
});

test('cleanObserved refuses bad shapes and cleans the rest', () => {
  assert.equal(cleanObserved(null).ok, false);
  assert.equal(cleanObserved({ status: 'blocked' }).ok, false);
  assert.equal(cleanObserved({ status: 'priced', price: 26.5 }).ok, false, 'paise must be whole');
  assert.equal(cleanObserved({ status: 'priced', price: 0 }).ok, false);
  assert.equal(cleanObserved({ status: 'priced', price: TRUST.maxPrice + 1 }).ok, false);
  const r = cleanObserved({ status: 'priced', price: 26_500, mrp: 20_000, title: '  Pen\n set ', image: 'javascript:alert(1)' });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.obs.mrp, null, 'M.R.P. below price is dropped');
    assert.equal(r.obs.title, 'Pen set');
    assert.equal(r.obs.image, null);
  }
  const u = cleanObserved({ status: 'unavailable', price: 999 });
  assert.ok(u.ok && u.obs.price === null && u.obs.inStock === false);
});

test('cleanImage keeps only https store image hosts', () => {
  assert.equal(cleanImage('https://m.media-amazon.com/images/I/x.jpg'), 'https://m.media-amazon.com/images/I/x.jpg');
  assert.equal(cleanImage('https://rukminim2.flixcart.com/image/x.jpg'), 'https://rukminim2.flixcart.com/image/x.jpg');
  assert.equal(cleanImage('http://m.media-amazon.com/x.jpg'), null);
  assert.equal(cleanImage('https://m.media-amazon.com.evil.example/x.jpg'), null);
  assert.equal(cleanImage('https://evil.example/x.jpg'), null);
});
