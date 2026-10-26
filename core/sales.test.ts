import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saleEventsFor, validateSales } from './sales.ts';
// The chart's own helper (web/chart.js is plain JS shared by the site and the extension).
import { saleMarks } from '../web/chart.js';

const good = { schema: 1, events: [{ store: 'amazon', title: 'Great Indian Festival', from: '2026-10-08', to: null, source: 'https://example.com/a', checked: '2026-10-27' }] };

test('sale calendar: the bundled file loads; a day is India\'s calendar day', () => {
  const amazon = saleEventsFor('amazon');
  assert.ok(amazon.length >= 1);
  assert.ok(amazon.every((e) => e.source.startsWith('https://')));
  const v = validateSales(good);
  assert.ok(v.ok);
  assert.equal(new Date(v.events[0]!.from).toISOString(), '2026-10-07T18:30:00.000Z', 'midnight IST');
  assert.equal(v.events[0]!.to, null, 'no end date published: none invented');
  const ended = validateSales({ ...good, events: [{ ...good.events[0], to: '2026-10-12' }] });
  assert.ok(ended.ok && new Date(ended.events[0]!.to!).toISOString() === '2026-10-12T18:29:59.999Z', 'end of that day, IST');
});

test('sale calendar: refuses an event without a source, a bad store or an end before its start', () => {
  const bad = (patch: Record<string, unknown>) => validateSales({ ...good, events: [{ ...good.events[0], ...patch }] });
  for (const [patch, want] of [
    [{ source: '' }, /source/], [{ source: 'http://x.example' }, /source/], [{ store: 'ebay' }, /store/],
    [{ to: '2026-10-01' }, /\.to/], [{ from: '8 Oct' }, /from/], [{ checked: undefined }, /checked/],
  ] as const) {
    const v = bad(patch);
    assert.ok(!v.ok && v.errors.some((e) => want.test(e)), JSON.stringify(patch));
  }
  assert.equal(validateSales({ events: [] }).ok, false);
});

test('chart marks: only events in the shown range; an open-ended event is a start marker, never a band', () => {
  const day = 86_400_000;
  const t0 = Date.parse('2026-10-26T00:00:00Z');
  const t1 = t0 + 10 * day;
  const ev = (from: number, to: number | null) => ({ title: 'Sale', from, to });
  assert.deepEqual(saleMarks([ev(t0 - 20 * day, null)], t0, t1), [], 'started before the chart and no end known: nothing drawn');
  assert.deepEqual(saleMarks([ev(t0 + day, null)], t0, t1), [{ title: 'Sale', from: t0 + day, to: null, ongoing: true }]);
  assert.deepEqual(saleMarks([ev(t0 - day, t0 + 2 * day)], t0, t1), [{ title: 'Sale', from: t0, to: t0 + 2 * day, ongoing: false }], 'a band is clipped to the chart');
  assert.deepEqual(saleMarks([ev(t1 + day, t1 + 2 * day), ev(t0 - 3 * day, t0 - day)], t0, t1), [], 'entirely outside');
  assert.deepEqual(saleMarks(undefined, t0, t1), []);
});
