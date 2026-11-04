import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_META, metaFor, withMeta } from './meta.ts';
import type { ProductRow } from './db.ts';

const shell = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const row = (o: Partial<ProductRow>): ProductRow => ({
  key: 'amazon:B0CX23V2ZK', store: 'amazon', pid: 'B0CX23V2ZK', url: 'https://www.amazon.in/dp/B0CX23V2ZK', title: 'Cello Opalware Dazzle Dinner Set, 27 Pieces',
  image: 'https://m.media-amazon.com/images/I/71abc.jpg', created_at: 0, last_checked_at: 0, last_attempt_at: 0, fail_count: 0, last_status: 'ok',
  price: 179900, mrp: 349000, in_stock: 1, usual_price: 199900, real_pct: 0.1, sale_status: null, watchers: 0, views: 0, ...o,
});

test('link previews: a product link shows its name, price now, usual price and picture', () => {
  const m = metaFor('/p/amazon%3AB0CX23V2ZK', 'https://britto.example', row({}));
  assert.equal(m.title, 'Cello Opalware Dazzle Dinner Set, 27 Pieces | Britto');
  assert.equal(m.description, '₹1,799 now on Amazon.in, usually ₹1,999. Its price history and whether today’s discount is real, on Britto.');
  assert.equal(m.image, 'https://m.media-amazon.com/images/I/71abc.jpg');
  const html = withMeta(shell, m);
  assert.match(html, /<title>Cello Opalware Dazzle Dinner Set, 27 Pieces \| Britto<\/title>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/m\.media-amazon\.com\/images\/I\/71abc\.jpg">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.equal(html.match(/<title>/g)!.length, 1, 'one title');
  assert.equal(html.match(/<meta name="description"/g)!.length, 1, 'one description');
  assert.ok(html.includes('<script type="module" src="/app.js"></script>') && html.includes('<main id="app"></main>'), 'the rest of the page is untouched');
});

test('link previews: everything escaped; a product not read yet, an unknown page and plain http pictures get the plain card', () => {
  const evil = withMeta(shell, metaFor('/p/x', 'https://b.example', row({ title: '"><script>alert(1)</script>$& $1', image: 'http://insecure.example/a.jpg' })));
  assert.ok(!evil.includes('<script>alert(1)'), 'no markup from a product title');
  const escaped = '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;$&amp; $1 | Britto';
  assert.ok(evil.includes(`<title>${escaped}</title>`), 'the title escaped, and "$&" is not a replacement pattern');
  assert.ok(evil.includes(`<meta property="og:title" content="${escaped}">`));
  assert.ok(!evil.includes('og:image'), 'only an https picture');
  assert.deepEqual(metaFor('/p/x', 'https://b.example', row({ title: null })), { ...DEFAULT_META, image: null, url: 'https://b.example/p/x' });
  assert.deepEqual(metaFor('/p/x', 'https://b.example', null).title, DEFAULT_META.title);
  assert.equal(metaFor('/travel/', 'https://b.example', null).title, 'Compare flight, hotel and ride prices | Britto');
  assert.match(metaFor('/p/x', 'https://b.example', row({ usual_price: null, price: null })).description, /^On Amazon\.in\. /);
  assert.equal(metaFor('/p/x', 'https://b.example', row({ title: 'x'.repeat(200) })).title.length, 90 + ' | Britto'.length);
});
