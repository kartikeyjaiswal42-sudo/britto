import { test } from 'node:test';
import assert from 'node:assert/strict';
import { innerOf, outerOf, parseAttrs, parseSelector, selectAll, selectFirst, SelectorError } from './select.ts';
import { textOf } from './html.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { BUNDLED_READERS } from '../readers/index.ts';

const PAGE = `<!doctype html><html><head>
<script>var tpl = '<div id="price" class="a-price priceToPay"><span>₹1</span></div>';</script>
<style>#price { color: red }</style>
</head><body>
<!-- <div id="price"><span>₹2</span></div> -->
<div id="main" class="shell wide" data-x="1">
  <ul><li class="item">one<li class="item hot">two</ul>
  <div class="a-price"><span class="a-offscreen">₹9</span></div>
  <section><div class="a-price priceToPay" data-k='single'><span class="a-offscreen">₹265</span></div></section>
  <img id=logo src=/l.png alt="Britto &amp; co">
  <p>first<p>second
</div>
<div id="tail"><b>x</b></div>
</body></html>`;

const text = (sel: string) => {
  const f = selectFirst(PAGE, sel);
  const outer = f && outerOf(PAGE, f);
  return outer == null ? null : textOf(outer);
};

test('compound selectors: tag, id, every class, attributes', () => {
  assert.equal(text('#main .a-price.priceToPay'), '₹265');
  assert.equal(text('.priceToPay .a-offscreen'), '₹265');
  assert.equal(text('div.a-price'), '₹9', 'first .a-price in document order');
  assert.equal(text('[data-k=single] span'), '₹265', 'single-quoted attribute values');
  assert.equal(text('[data-k="single"]'), '₹265');
  assert.equal(selectFirst(PAGE, 'img#logo')?.attrs.get('src'), '/l.png', 'bare attribute values');
  assert.equal(selectFirst(PAGE, 'img[alt^=Britto]')?.attrs.get('alt'), 'Britto & co', 'values entity-decoded');
  assert.equal(selectFirst(PAGE, '[class~=hot]')?.tag, 'li');
  assert.equal(selectFirst(PAGE, '[class*=ide]')?.attrs.get('id'), 'main');
  assert.equal(selectFirst(PAGE, '[data-x$=1]')?.attrs.get('id'), 'main');
  assert.equal(selectFirst(PAGE, '#main.shell.wide')?.tag, 'div');
  assert.equal(selectFirst(PAGE, '#main.missing'), null, 'every class must be present');
});

test('combinators: descendant and child', () => {
  assert.equal(text('#main > section > .priceToPay'), '₹265');
  assert.equal(selectFirst(PAGE, '#main > .priceToPay'), null, 'not a direct child');
  assert.equal(text('#tail b'), 'x');
  assert.equal(selectFirst(PAGE, '#tail > section'), null);
});

test('scripts, styles and comments are never markup', () => {
  // The template string in <script> and the commented-out div both look like #price.
  assert.equal(selectFirst(PAGE, '#price'), null);
  assert.equal(selectFirst(PAGE, 'span')?.start, PAGE.indexOf('<span class="a-offscreen">₹9'), 'first real span, not one inside script text');
  assert.equal(innerOf(PAGE, selectFirst(PAGE, 'script')!), "var tpl = '<div id=\"price\" class=\"a-price priceToPay\"><span>₹1</span></div>';");
});

test('implicitly closed siblings (li, p) do not nest', () => {
  assert.equal(selectFirst(PAGE, 'li.item.hot')?.tag, 'li');
  assert.equal(selectFirst(PAGE, 'li li'), null, 'an <li> ends at the next <li>');
  assert.equal(selectFirst(PAGE, 'p p'), null);
  // Known limit: an element with no closing tag has no readable text here (browsers always
  // write the closing tag when they serialise a page, which is what the clients read).
  assert.equal(text('li.item'), null);
});

test('a cut-off page: opening tags still match; text needs the element closed', () => {
  const cut = PAGE.slice(0, PAGE.indexOf('₹265') + 2);
  const f = selectFirst(cut, '#main .priceToPay');
  assert.ok(f, 'the opening tag arrived');
  assert.equal(f.attrs.get('data-k'), 'single');
  assert.equal(outerOf(cut, f), null, 'but its text is not complete yet');
});

test('an id inside JSON or text is not an element', () => {
  const html = `<script>{"x":"id=\\"main\\""}</script><p>see id="main" here</p><div class='k' id='main'>real</div>`;
  const f = selectFirst(html, '#main');
  assert.equal(f?.tag, 'div');
  assert.equal(textOf(outerOf(html, f!)!), 'real');
});

test('unsupported selector syntax is refused, not reinterpreted', () => {
  for (const bad of ['div:first-child', 'a + b', 'a ~ b', 'a, b', '#', '.', '[x', 'div >', '']) {
    assert.throws(() => parseSelector(bad), SelectorError, bad);
  }
  assert.deepEqual(parseSelector('*').parts.length, 1);
});

test('attributes: every quoting style, names lower-cased, first wins', () => {
  const a = parseAttrs(`<img SRC="a.png" alt='it&#39;s' data-x=7 hidden src="b.png">`);
  assert.equal(a.get('src'), 'a.png');
  assert.equal(a.get('alt'), "it's");
  assert.equal(a.get('data-x'), '7');
  assert.equal(a.get('hidden'), '');
});

test('the #id / .class fast path finds exactly what a full scan finds, on every saved page', () => {
  const dir = new URL('../test/fixtures/', import.meta.url);
  const selectors = new Set<string>(['.a-price', '.a-price.priceToPay', '#corePriceDisplay_desktop_feature_div .a-offscreen', 'div.vsPrice p', '.product__price--mrp span', '.nope', '.price-comman-wrapper > div']);
  for (const r of BUNDLED_READERS) {
    const d = r.config.domRecipe;
    for (const f of [...d.name, ...d.price, ...d.mrp, ...d.image, ...d.pid]) if (f.selector.length) selectors.add(f.selector.join(' '));
    for (const sel of d.availability.selectors) selectors.add(sel);
  }
  let compared = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(new URL(file, dir), 'utf8');
    for (const sel of selectors) {
      assert.deepEqual(selectFirst(html, sel)?.start ?? null, selectFirst(html, sel, true)?.start ?? null, `${file}: ${sel}`);
      compared++;
    }
  }
  assert.ok(compared > 50, String(compared));
});

test('.class fast path: a class name in text, another attribute or a script is not an element', () => {
  const html = `<script>var c = '<div class="hit">no</div>';</script><p data-x="hit">x</p><p>hit</p><div class="a hit b"><span>yes</span></div>`;
  assert.equal(textOf(outerOf(html, selectFirst(html, '.hit span')!)!), 'yes');
  assert.equal(selectFirst(html, '.hit')?.start, html.indexOf('<div class="a hit b">'));
});

test('selectAll: every match in page order, with and without an id/class anchor, limited', () => {
  assert.deepEqual(selectAll(PAGE, 'li.item').map((f) => f.open), ['<li class="item">', '<li class="item hot">']);
  assert.deepEqual(selectAll(PAGE, '.a-price .a-offscreen').map((f) => innerOf(PAGE, f)), ['₹9', '₹265'], 'not the copy inside the script');
  assert.deepEqual(selectAll(PAGE, '#main p').length, 2);
  assert.deepEqual(selectAll(PAGE, 'li.item', 1).map((f) => f.open), ['<li class="item">']);
  assert.deepEqual(selectAll(PAGE, '.nothing-here'), []);
  for (const sel of ['li.item', '.a-price .a-offscreen', '#main p', 'span']) {
    assert.deepEqual(selectAll(PAGE, sel)[0], selectFirst(PAGE, sel), `${sel}: the first of all is selectFirst`);
  }
});