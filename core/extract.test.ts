import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confirmIdentity, enough, extract, jsonLdProduct } from './extract.ts';
import { elementById, elementWithClass, textOf } from './html.ts';

// Every fixture is a real page fetched on 2026-10-26, saved unmodified.
const fx = (name: string) => readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8');

test('Amazon in stock: the price box, not the first rupee on the page', () => {
  const r = extract('amazon', fx('amazon-cello-25pens-instock.html'));
  assert.equal(r.status, 'priced');
  assert.equal(r.price, 26500);
  assert.equal(r.mrp, 29900);
  assert.equal(r.inStock, true);
  assert.match(r.title ?? '', /^Cello Butterflow Simply Ball Pen Set \| Pack of 25/);
  assert.equal(r.image, 'https://m.media-amazon.com/images/I/51xvbsAN5bL._SL1000_.jpg');
  assert.equal(r.rule, 'amazon:priced');
});

test('Amazon price with paise: the decimal point sits inside the whole part', () => {
  // Fetched by the live Worker on 2026-10-26 and read as 'unrecognised' before the fix.
  const r = extract('amazon', fx('amazon-cello-technotip-paise.html'));
  assert.equal(r.status, 'priced');
  assert.equal(r.price, 176_331);
  assert.match(r.title ?? '', /Cello Technotip/);
});

test('Amazon second in-stock page reads its own numbers', () => {
  const r = extract('amazon', fx('amazon-cello-10pens-instock.html'));
  assert.equal(r.status, 'priced');
  assert.equal(r.price, 15500);
  assert.equal(r.mrp, 19900);
});

test('Amazon unavailable variant: no price, even though the page shows a dozen', () => {
  const html = fx('amazon-boat-variant-unavailable.html');
  // The trap this guards: carousels on this page carry ₹999 / ₹1,099 / ₹1,299.
  assert.ok(html.includes('a-offscreen">₹99900') || html.includes('₹1,299.00'), 'fixture still has carousel prices');
  const r = extract('amazon', html);
  assert.equal(r.status, 'unavailable');
  assert.equal(r.price, null);
  assert.equal(r.inStock, false);
  assert.match(r.title ?? '', /^boAt Airdopes 141/);
});

test('Amazon unavailable iPhone page', () => {
  const r = extract('amazon', fx('amazon-iphone15-unavailable.html'));
  assert.equal(r.status, 'unavailable');
  assert.equal(r.price, null);
  assert.match(r.title ?? '', /^Apple iPhone 15/);
});

test('Amazon: price box present but no "price to pay" -> unrecognised, never another price', () => {
  // A real in-stock page with only the price-to-pay element cut out. Every other rupee
  // figure stays (per-unit price ₹10.60, M.R.P. ₹299, carousels) and none may be taken.
  const html = fx('amazon-cello-25pens-instock.html');
  const pay = elementWithClass(elementById(html, 'corePriceDisplay_desktop_feature_div')!, 'a-price', 'priceToPay');
  assert.ok(pay, 'fixture has the price-to-pay element');
  const r = extract('amazon', html.replace(pay, ''));
  assert.equal(r.status, 'unrecognised');
  assert.equal(r.price, null);
  assert.equal(r.rule, 'amazon:no-price');
});

test('Amazon: a page with no product title is unrecognised, never priced', () => {
  const r = extract('amazon', '<html><body><span class="a-price-whole">999</span></body></html>');
  assert.equal(r.status, 'unrecognised');
  assert.equal(r.price, null);
});

test('early stop: reading a prefix gives the same answer as the whole page, well before the end', () => {
  for (const name of ['amazon-cello-25pens-instock.html', 'amazon-cello-10pens-instock.html', 'amazon-cello-technotip-paise.html', 'amazon-boat-variant-unavailable.html', 'amazon-iphone15-unavailable.html']) {
    const html = fx(name);
    // Simulate the network: 16 KB chunks, stop at the first chunk where enough() says so.
    let cut = html.length;
    for (let n = 16_384; n < html.length; n += 16_384) {
      if (enough('amazon', html.slice(0, n))) { cut = n; break; }
    }
    assert.ok(cut < html.length * 0.5, `${name}: stopped at ${Math.round((cut / html.length) * 100)}%`);
    assert.deepEqual(extract('amazon', html.slice(0, cut)), extract('amazon', html), name);
  }
});

test('early stop never fires on a page cut before the price box closes', () => {
  const html = fx('amazon-cello-25pens-instock.html');
  const core = html.indexOf('id="corePriceDisplay_desktop_feature_div"');
  assert.equal(enough('amazon', html.slice(0, core + 500)), false);
});

test('Myntra: pdpData price and M.R.P.', () => {
  const r = extract('myntra', fx('myntra-instock.html'));
  assert.equal(r.status, 'priced');
  assert.equal(r.price, 30500);
  assert.equal(r.mrp, 69900);
  assert.equal(r.inStock, true);
  assert.match(r.title ?? '', /^HRX by Hrithik Roshan Men Yellow Printed Cotton/);
  assert.match(r.image ?? '', /^https:\/\/assets\.myntassets\.com\/h_480,q_90,w_360\//);
});

test('Flipkart error page is recognised as blocked', () => {
  const r = extract('flipkart', fx('flipkart-blocked-e002.html'));
  assert.equal(r.status, 'blocked');
  assert.equal(r.price, null);
});

test('elementById ignores ids inside JSON and survives </div> inside scripts', () => {
  const html = `<script>var x = {"dtu":"box"}; document.write("</div>")</script>
    <div id="box" class="a"><div><script>"</div>"</script>inner</div><span>tail</span></div><div>after</div>`;
  const el = elementById(html, 'box');
  assert.ok(el);
  assert.equal(textOf(el), 'inner tail');
});

test('generic JSON-LD reader, checked against the real Myntra page', () => {
  const r = jsonLdProduct(fx('myntra-instock.html'));
  assert.equal(r.status, 'priced');
  assert.equal(r.price, 30500, 'same price as Myntra\'s own pdpData');
  assert.equal(r.inStock, true);
});

test('Flipkart stays unrecognised until its reader is verified on a real page', () => {
  const page = '<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":"999","availability":"https://schema.org/InStock"}}</script>';
  const r = extract('flipkart', page);
  assert.equal(r.status, 'unrecognised');
  assert.equal(r.price, null);
  assert.equal(r.rule, 'flipkart:reader-not-verified');
});

test('readers report which product the page shows', () => {
  assert.equal(extract('amazon', fx('amazon-cello-25pens-instock.html')).pid, 'B09X5DK382');
  assert.equal(extract('amazon', fx('amazon-iphone15-unavailable.html')).pid, 'B0CHX1W1XY');
  assert.equal(extract('myntra', fx('myntra-instock.html')).pid, '1700944');
});

test('confirmIdentity: a page showing ANOTHER product is never filed under this link', () => {
  const page = extract('amazon', fx('amazon-cello-25pens-instock.html'));
  assert.equal(confirmIdentity('amazon', 'B09X5DK382', page).status, 'priced');
  const wrong = confirmIdentity('amazon', 'B01INWEX9U', page);
  assert.equal(wrong.status, 'unrecognised');
  assert.equal(wrong.price, null);
  assert.match(wrong.rule, /identity-mismatch\(B09X5DK382\)/);
  // Single-page navigation: Myntra URL already says 999999, page still shows 1700944.
  assert.equal(confirmIdentity('myntra', '999999', extract('myntra', fx('myntra-instock.html'))).status, 'unrecognised');
  // A reader that should name the product but does not is not trusted either.
  assert.equal(confirmIdentity('amazon', 'B09X5DK382', { ...page, pid: null }).status, 'unrecognised');
});
