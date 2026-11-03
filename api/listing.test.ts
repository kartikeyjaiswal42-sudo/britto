import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchListing, searchWords } from './listing.ts';
import { readListing } from '../core/interpret.ts';
import { validateReader, type ReaderConfig, type SearchRule } from '../core/recipe.ts';
import { storeSearchUrl } from '../core/stores.ts';
import { bundledReader } from '../readers/index.ts';

// Real pages, saved unmodified on 2026-11-03 (test/fixtures/expected.json says how).
const SEARCH = readFileSync(new URL('../test/fixtures/amazon-search-boat-earbuds.html', import.meta.url), 'utf8');
const AMAZON = bundledReader('amazon', 'desktop')!.config;
const RULE = AMAZON.domRecipe.search!;
const URL_S = 'https://www.amazon.in/s?k=boat+earbuds';

test('list reader: a verified search rule reads the real page; prices stay as the list printed them', () => {
  const r = readListing(AMAZON, RULE, SEARCH, URL_S);
  assert.equal(r.status, 'listed');
  assert.equal(r.items.length, 16);
  const first = r.items[0]!;
  assert.deepEqual(first, {
    key: 'amazon:B0C3ZYFZ77', store: 'amazon', pid: 'B0C3ZYFZ77', url: 'https://www.amazon.in/dp/B0C3ZYFZ77',
    title: first.title, price: 79900, mrp: 349000, image: first.image,
  });
  assert.match(first.title, /^boAt Airdopes Joy/, 'the brand heading is joined in front');
  assert.match(first.image!, /^https:\/\/m\.media-amazon\.com\//);
  assert.ok(r.items.every((i) => i.url === `https://www.amazon.in/dp/${i.pid}`), 'the canonical address, never the list\'s tracking link');
});

test('list reader: nothing from an unverified rule, another page, or a bot wall', () => {
  assert.deepEqual(readListing(AMAZON, { ...RULE, verified: null }, SEARCH, URL_S), { status: 'not_verified', items: [] });
  assert.deepEqual(readListing(AMAZON, undefined, SEARCH, URL_S), { status: 'not_verified', items: [] });
  assert.equal(readListing(AMAZON, RULE, SEARCH, 'https://www.amazon.in/dp/B0C3ZYFZ77').status, 'other_page');
  const wall = readFileSync(new URL('../test/fixtures/amazon-refused-503-automated-access.html', import.meta.url), 'utf8');
  assert.equal(readListing(AMAZON, RULE, wall, URL_S).status, 'blocked');
});

test('list reader: another store\'s link, a non-product link and a second card for one product are dropped', () => {
  const card = (href: string, name: string, price: string) =>
    `<div data-component-type="s-search-result"><a href="${href}">x</a><h2 aria-label="${name}"></h2><span class="a-price" data-a-color="base"><span class="a-offscreen">${price}</span></span></div>`;
  const page = `<html>${card('/dp/B0C3ZYFZ77', 'One', '₹799')}${card('https://www.flipkart.com/dp/p/itm0123456789', 'Flipkart, with /dp/ in its address', '₹1')}`
    + `${card('/gp/help/dp/', 'Help', '₹5')}${card('/Some-Name/dp/B0C3ZYFZ77?ref=x', 'One again', '₹9')}${card('/dp/B0D49ZS9MT', 'Two', '₹0.50')}</html>`;
  const { endsAt: _e, brand: _b, ...plain } = RULE;
  const r = readListing(AMAZON, plain, page, URL_S);
  assert.deepEqual(r.items.map((i) => [i.pid, i.title, i.price]), [['B0C3ZYFZ77', 'One', 79900], ['B0D49ZS9MT', 'Two', null]],
    'one card per product, only Amazon product pages, and under ₹1 is no price');
});

test('list reader: nothing after the end marker is read', () => {
  const end = SEARCH.indexOf(RULE.endsAt!);
  assert.ok(end > 0, 'the saved page has the end marker');
  const tail = `<div data-component-type="s-search-result"><a href="/dp/B000000001">x</a><h2 aria-label="After the end"></h2></div>`;
  const r = readListing(AMAZON, RULE, SEARCH.slice(0, end) + RULE.endsAt + tail, URL_S);
  assert.ok(!r.items.some((i) => i.pid === 'B000000001'));
});

test('validator: list addresses must be on the store\'s own site and match the page pattern', () => {
  const errorsOf = (change: (s: SearchRule) => void) => {
    const c = structuredClone(AMAZON) as ReaderConfig;
    change(c.domRecipe.search!);
    const v = validateReader(c);
    return v.ok ? '' : v.errors.join('; ');
  };
  assert.equal(errorsOf(() => {}), '');
  assert.match(errorsOf((s) => { s.url = 'https://evil.example/s?k={q}'; }), /evil\.example is not one of this store's own hosts/);
  assert.match(errorsOf((s) => { s.url = 'https://www.amazon.in/s?k=pens'; }), /must contain \{q\} exactly once/);
  assert.match(errorsOf((s) => { s.url = 'https://www.amazon.in/b?node={q}'; }), /does not match the rule's page pattern/);
  assert.match(errorsOf((s) => { s.link = []; }), /search\.link: needs at least one field/);
  assert.match(errorsOf((s) => { (s as unknown as Record<string, unknown>)['upload'] = 1; }), /unknown key "upload"/);
  const pop = structuredClone(AMAZON) as ReaderConfig;
  pop.domRecipe.popular!.urls = ['https://www.amazon.com/gp/bestsellers/x'];
  assert.match((validateReader(pop) as { errors: string[] }).errors.join(), /www\.amazon\.com is not one of this store's own hosts/);
});

test('fetchListing: streams the page and stops at the end marker; a refusal is a failure, not a list', async () => {
  const real = globalThis.fetch;
  let sent: Headers | null = null;
  let streamed = 0;
  globalThis.fetch = async (_u: unknown, init?: RequestInit) => {
    sent = new Headers(init?.headers);
    const bytes = new TextEncoder().encode(SEARCH);
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (streamed >= bytes.length) { c.close(); return; }
        c.enqueue(bytes.slice(streamed, streamed + 16_384));
        streamed += 16_384;
      },
    });
    return new Response(body, { status: 200 });
  };
  try {
    const out = await fetchListing(AMAZON, RULE, URL_S, 'https://britto.example');
    assert.equal(out.ok && out.status, 'listed');
    assert.equal(out.ok && out.items.length, 16);
    assert.ok(streamed < SEARCH.length * 0.75, `stopped early (${streamed} of ${SEARCH.length} bytes)`);
    assert.match(sent!.get('user-agent')!, /^BrittoBot\/0\.1 \(\+https:\/\/britto\.example\/bot/, 'the honest User-Agent');
    globalThis.fetch = async () => new Response('no', { status: 503 });
    assert.deepEqual(await fetchListing(AMAZON, RULE, URL_S, undefined), { ok: false, code: 'http_error', httpStatus: 503 });
  } finally {
    globalThis.fetch = real;
  }
});

test('search words and store search links', () => {
  assert.equal(searchWords('  Boat   Earbuds!! '), 'boat earbuds');
  assert.equal(searchWords('a'), null);
  assert.equal(searchWords('x'.repeat(81)), null);
  assert.equal(storeSearchUrl('amazon', 'boat earbuds'), 'https://www.amazon.in/s?k=boat%20earbuds');
  assert.equal(storeSearchUrl('myntra', 'Men Tshirts'), 'https://www.myntra.com/men-tshirts?rawQuery=Men%20Tshirts');
});
