// Working UI for Britto until the Claude Design screens replace it. Every string from a
// store (titles, image URLs) goes in via textContent / setAttribute — never innerHTML.
import {
  ago, connectTelegram, date, deletePush, deviceToken, disconnectTelegram, getConfig, getDeals, getDrops, getMe, getPopular, getProduct, getRecent, getStores,
  lensPhoto, pct, removeAlert, rupees, savePush, searchProducts, sendTest, setAlert, storeSearch, toPaise, trackProduct, getGroceryPlatforms, getSimilar, voteCoupon,
} from './api.js';
import { drawChart } from './chart.js';
import { mergeOrders, summarize } from './spend.js';
import { airportIndex, flightSearch, hotelSearch, MAX_DAYS_AHEAD, rideCompare, rideSearch, todayIST } from './travel.js';
import { fareStrip, groupFlights, groupHotels, otherAirport, rideRows, siteSummary, tripTotal } from './compare.js';
import { bestMatch, matchTitle, searchWordsFor } from './match.js';
import { compareView, shopSearchUrl, storesFor } from './shop.js';

const app = document.getElementById('app');

// The design's line icons (design/Britto App v4.dc.html), drawn as SVG (no inline markup: CSP).
const ICONS = {
  link: ['M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1', 'M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  trend: ['M3 18l5-6 4 3 8-9', 'M15 6h5v5'],
  plane: ['M2.5 13.5l19-8-5.5 15-3.5-6.5z', 'M12.5 14l9-8.5'],
  tag: ['M3 12V4h8l10 10-8 8z', 'M6 7.5a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0'],
  bag: ['M5 8h14l-1 12H6z', 'M9 8V6a3 3 0 016 0v2'],
  wallet: ['M3 6h18v13H3z', 'M3 10h18M16 14.5h2'],
  store: ['M4 9l1.5-5h13L20 9', 'M4 9h16v11H4z', 'M9 20v-6h6v6'],
  basket: ['M4 10h16l-1.5 10h-13z', 'M8 10l4-6 4 6'],
  car: ['M5 17h14', 'M6 17l1.5-6h9L18 17', 'M8 17v2M16 17v2', 'M9 8h6'],
  auto: ['M4 16h16', 'M6 16l2-7h8l2 7', 'M7 16v3M17 16v3'],
  bike: ['M5 14a3 3 0 100 6 3 3 0 100-6', 'M19 14a3 3 0 100 6 3 3 0 100-6', 'M5 17l4-8h5l5 8', 'M12 9l-1-3H9'],
  hotel: ['M3 20V8l9-4 9 4v12', 'M9 20v-6h6v6'],
  locate: ['M12 9a3 3 0 100 6 3 3 0 100-6', 'M12 2v3M12 19v3M2 12h3M19 12h3', 'M12 5a7 7 0 100 14 7 7 0 100-14'],
  swap: ['M7 4v16M7 4L3 8M7 4l4 4', 'M17 20V4M17 20l-4-4M17 20l4-4'],
  pin: ['M12 21s7-6.1 7-12a7 7 0 00-14 0c0 5.9 7 12 7 12z', 'M12 6.5a2.5 2.5 0 100 5 2.5 2.5 0 100-5'],
  clock: ['M12 3a9 9 0 100 18 9 9 0 100-18', 'M12 7v5l3 2'],
  check: ['M5 12l5 5L20 7'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  drop: ['M22 17l-8.5-8.5-5 5L2 7', 'M16 17h6v-6'],
  taxi: ['M5 17h14l-1.5-6.5a2 2 0 0 0-2-1.5h-7a2 2 0 0 0-2 1.5z', 'M6 17.5a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0', 'M15 17.5a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0', 'M9 9l1-4h4l1 4'],
  globe: ['M2 12h20', 'M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20', 'M12 2a10 10 0 100 20 10 10 0 100-20'],
  warning: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  paste: ['M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z', 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'],
  phone: ['M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z', 'M12 18h.01'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
};
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  for (const d of ICONS[name]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

function h(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
}

/**
 * Replace a node's children, skipping null/false like h() does. The DOM's own replaceChildren
 * turns a null into the text "null" (it did: /alerts showed "null" whenever Telegram was off).
 */
function put(node, ...kids) {
  node?.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
}

function go(path) {
  moved++;
  history.pushState(null, '', path);
  route();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('popstate', () => { moved = Math.max(0, moved - 1); route(); });

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get('q')?.toString().trim();
  if (!q) return;
  // Measured in the app: after searching, the phone keyboard stayed up over the results.
  e.target.querySelector('input')?.blur();
  if (isLink(q)) addByLink(q);
  else go(`/search?q=${encodeURIComponent(q)}`);
});

const STORE_NAMES = { amazon: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', vijaysales: 'Vijay Sales', reliancedigital: 'Reliance Digital', nykaa: 'Nykaa', shopclues: 'ShopClues' };

/** Amazon serves any size of its images: a card needs ~400 px, not the 1,500 px original. */
function thumbUrl(src) {
  return /^https:\/\/m\.media-amazon\.com\/images\/I\/[^/]+\.[a-z]+$/i.test(src ?? '') ? src.replace(/\._[^/]*_\.([a-z]+)$/i, '._SL400_.$1').replace(/(\/I\/[^./]+)\.([a-z]+)$/i, '$1._SL400_.$2') : src;
}

function productCard(c) {
  const badge = c.drop ? h('span', { class: 'badge good', title: `was ${rupees(c.drop.from)} until ${date(c.drop.at)}` }, `↓ ${pct((c.drop.from - c.price) / c.drop.from)} since ${date(c.drop.fromAt)}`)
    : c.saleStatus === 'real_drop' && c.realPct != null ? h('span', { class: 'badge good', title: 'below its own usual price' }, `↓ ${pct(c.realPct)} below usual`) : null;
  return h('a', { class: 'card', href: `/p/${encodeURIComponent(c.key)}`, 'data-nav': true },
    h('div', { class: 'thumb' }, c.image ? h('img', { src: thumbUrl(c.image), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null, badge),
    h('div', { class: 'card-body' },
      h('span', { class: 'store' }, STORE_NAMES[c.store] ?? c.store),
      h('span', { class: 'title' }, c.title ?? 'Waiting for first price'),
      h('span', { class: 'price' }, c.inStock === false ? 'Out of stock' : rupees(c.price),
        c.drop ? h('s', { class: 'mrp', title: 'our reading before' }, rupees(c.drop.from))
          : c.mrp && c.price && c.mrp > c.price ? h('s', { class: 'mrp' }, rupees(c.mrp)) : null)));
}

/** A product from a store's own search page: its price is what that page showed, and opening
 * it starts Britto's history (the product's own page is read then). */
function listedCard(item, tracked) {
  const t = tracked.get(item.key);
  const href = t ? `/p/${encodeURIComponent(item.key)}` : `/p/${encodeURIComponent(item.key)}?add=1`;
  const badge = t?.saleStatus === 'real_drop' && t.realPct != null ? h('span', { class: 'badge good' }, `↓ ${pct(t.realPct)} below usual`)
    : t ? h('span', { class: 'badge' }, 'History on Britto') : null;
  return h('a', { class: 'card', href, 'data-nav': true, 'data-price': item.price ?? 0, 'data-history': t ? 1 : 0 },
    h('div', { class: 'thumb' }, item.image ? h('img', { src: thumbUrl(item.image), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null, badge),
    h('div', { class: 'card-body' },
      h('span', { class: 'store' }, STORE_NAMES[item.store] ?? item.store),
      h('span', { class: 'title' }, item.title),
      h('span', { class: 'price' }, item.price == null ? 'See price' : rupees(item.price),
        item.mrp ? h('s', { class: 'mrp' }, rupees(item.mrp)) : null),
      h('span', { class: 'card-cta' }, t ? 'See price history' : 'Check price history')));
}

/** Buttons that open each store's own search for these words. */
function storeButtons(links) {
  return h('div', { class: 'store-search' }, links.map((l) => h('a', { class: 'store-chip', href: l.url, target: '_blank', rel: 'noopener noreferrer nofollow', 'data-store': l.store },
    h('span', { class: 'mono', 'data-mono': monogramOf(l.name) }), l.name)));
}
const monogramOf = (name) => name.replace(/\.in$/, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function grid(cards, empty) {
  return cards.length ? h('div', { class: 'grid' }, cards.map(productCard)) : h('p', { class: 'muted' }, empty);
}

/** The design's sideways-scrolling row of product cards. */
function row(cards, empty) {
  return cards.length ? h('div', { class: 'row' }, cards.map(productCard)) : h('p', { class: 'muted' }, empty);
}

const isLink = (v) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}\//i.test(v);

/** The one box: a store link opens that product's history, any other words search. */
function linkForm(initial = '') {
  const status = h('p', { class: 'form-status', role: 'status' });
  const input = h('input', { id: 'track-box', name: 'url', type: 'text', value: initial, placeholder: 'Product name or store link', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Search or paste a link' });
  const submit = (v) => {
    const q = v.trim();
    if (!q) { input.focus(); return; }
    input.blur();
    if (isLink(q)) addByLink(q, status);
    else go(`/search?q=${encodeURIComponent(q)}`);
  };
  const paste = navigator.clipboard?.readText ? h('button', { type: 'button', class: 'paste-btn', 'aria-label': 'Paste link', onclick: async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) { status.textContent = 'Nothing is copied on this phone yet.'; return; }
      input.value = text;
      if (isLink(text)) submit(text);
    } catch {
      input.focus();
      status.textContent = 'Press and hold the box, then tap Paste.';
    }
  } }, icon('paste')) : null;
  // Search by photo: shown by home() once the server says Lens is on (config().lens).
  const file = h('input', { type: 'file', accept: 'image/*', class: 'sr', tabindex: '-1', 'aria-hidden': 'true', onchange: () => { if (file.files?.[0]) photoSearch(file.files[0], status); file.value = ''; } });
  const photo = h('button', { type: 'button', class: 'paste-btn', id: 'photo-btn', 'aria-label': 'Search by photo', hidden: true, onclick: () => file.click() }, icon('camera'));
  const form = h('form', { class: 'track', onsubmit: (e) => { e.preventDefault(); submit(input.value); } },
    h('div', { class: 'track-row' }, input, photo, paste), h('button', { type: 'submit' }, 'Check price history'));
  return h('div', {}, form, file, status);
}

/** Matches core/lens.ts LENS.side: the photo is shrunk on this device before it is sent. */
const LENS_SIDE = 512;

/** A photo shrunk to LENS_SIDE px on its long side (upright, as the camera saw it), as a JPEG. */
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, LENS_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('This photo could not be read.'))), 'image/jpeg', 0.82));
}

/** Product Lens: the photo names the product; Britto's own search does the rest. */
async function photoSearch(file, status) {
  status.textContent = 'Reading your photo\u2026';
  let small;
  try { small = await shrinkPhoto(file); } catch {
    status.textContent = 'This phone could not open that photo. Try a JPEG or PNG, or a screenshot.';
    return;
  }
  try {
    const { lens } = await lensPhoto(small);
    if (!lens.found) { status.textContent = 'Britto could not see a product in that photo. Try again closer, or type its name.'; return; }
    go(`/search?q=${encodeURIComponent(lens.words)}&photo=${lens.sure ? 'read' : 'guess'}`);
  } catch (e) {
    // The server's own words (budget, limit, unreadable); a dropped connection has no status.
    status.textContent = e.status ? e.message : 'The photo could not be sent. Check the connection and try again.';
  }
}

async function addByLink(link, status, replace = false) {
  if (status) status.textContent = 'Checking…';
  try {
    const { product } = await trackProduct(link);
    const path = `/p/${encodeURIComponent(product.key)}`;
    if (replace) { history.replaceState(null, '', path); route(); } else go(path);
  } catch (e) {
    if (status) status.textContent = e.message;
    else alert(e.message);
  }
}

function shortcut(label, href, iconName, tint) {
  return h('a', { class: 'shortcut', href, 'data-nav': true }, h('i', { class: tint }, icon(iconName)), label);
}

async function home() {
  put(app,
    h('section', { class: 'hero' },
      h('h1', {}, 'The real price, before you buy.'),
      h('p', { class: 'lede' }, 'Price history, honest sale checks and the same product\u2019s price on other stores, read on your phone.')),
    h('section', { class: 'paste-card', id: 'paste' },
      h('label', { class: 'eyebrow', for: 'track-box' }, 'Search or paste a link'),
      linkForm(),
      h('p', { class: 'tip-line' }, 'Links work from Amazon, Flipkart, Myntra, Nykaa, Reliance Digital, Vijay Sales and ShopClues.'),
      h('p', { class: 'tip-line', id: 'photo-tip', hidden: true }, 'Or tap the camera for a photo or screenshot of the product. It is read once to name the product and not kept.'),
      h('p', { class: 'tip-line', id: 'bot-tip' })),
    h('nav', { class: 'shortcuts', 'aria-label': 'Britto features' },
      shortcut('Real drops', '/deals', 'drop', 'tint-green'),
      shortcut('Alerts', '/alerts', 'bell', 'tint-blue'),
      shortcut('Cabs', '/travel#cabs', 'taxi', 'tint-orange'),
      shortcut('Flights', '/travel#flights', 'globe', 'tint-violet')),
    h('section', { class: 'feature-card' },
      h('span', { class: 'tag' }, inApp ? 'Compare prices' : 'In the Britto app'),
      h('h2', {}, 'One product, its price on other stores.'),
      h('p', {}, 'Open any product and tap ', h('b', {}, 'Check prices'), '. The app opens up to six stores\u2019 own searches on your phone and shows the same product\u2019s price, cheapest first. Nothing is bought.'),
      inApp ? null : h('a', { class: 'button light', href: '/app', 'data-nav': true }, 'Get the app')),
    h('section', { id: 'drops-sec' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Real price drops'), h('a', { href: '/deals', 'data-nav': true }, 'See all')),
      h('p', { class: 'section-note' }, 'Measured against each product\u2019s own earlier prices, not its M.R.P.'),
      h('div', { id: 'drops' }, h('p', { class: 'muted' }, 'Loading\u2026'))),
    h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Is that sale real?')),
      h('div', { class: 'info-card' }, h('span', { class: 'ic tint-orange' }, icon('warning')),
        h('p', {}, '\u201c70% off\u201d is often off an M.R.P. nobody pays. Britto compares today\u2019s price with what the product ', h('b', {}, 'usually'), ' costs, and says when the price was raised just before the sale.'))),
    h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Travel, compared on your phone')),
      h('div', { class: 'travel-cards' },
        h('a', { href: '/travel#cabs', 'data-nav': true }, h('b', {}, 'Cabs'), h('span', {}, 'Uber + Rapido')),
        h('a', { href: '/travel#flights', 'data-nav': true }, h('b', {}, 'Flights'), h('span', {}, '4 sites')),
        h('a', { href: '/travel#hotels', 'data-nav': true }, h('b', {}, 'Hotels'), h('span', {}, 'per night')))),
    h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Recently checked')), h('div', { id: 'recent' }, h('p', { class: 'muted' }, 'Loading\u2026'))));
  config().then((cfg) => {
    if (cfg?.telegram) put(document.getElementById('bot-tip'), 'On your phone? Send any product link to ', botLink(cfg.telegram.bot), ' on Telegram. No app or extension needed.');
    // Not in the app yet: its in-app browser cannot open a file picker (no onShowFileChooser).
    const photo = document.getElementById('photo-btn');
    if (cfg?.lens && !inApp && photo && typeof createImageBitmap === 'function') {
      photo.hidden = false;
      document.getElementById('photo-tip').hidden = false;
    }
  });
  const [dr, d, r] = await Promise.allSettled([getDrops(), getDeals(), getRecent()]);
  // The confirmed ones (below the usual price) first, then "cheaper than at the last reading".
  const deals = d.status === 'fulfilled' ? d.value.results : [];
  const drops = dr.status === 'fulfilled' ? dr.value.results.filter((c) => !deals.some((x) => x.key === c.key)) : [];
  put(document.getElementById('drops'), deals.length || drops.length ? row([...deals, ...drops], '')
    : dr.status === 'rejected' ? h('p', { class: 'error' }, dr.reason.message)
      : h('p', { class: 'muted' }, 'No drops in the last two weeks yet: Britto reads each product about twice a day, so they appear as prices change.'));
  put(document.getElementById('recent'), r.status === 'fulfilled' ? grid(r.value.results, 'Nothing tracked yet. Paste a link above.') : h('p', { class: 'error' }, r.reason.message));
}

const VERDICT_CLASS = { buy: 'good', fair: 'neutral', wait: 'bad', too_early: 'neutral', unavailable: 'neutral' };
const SALE_TITLE = {
  real_drop: 'Real price drop',
  hike_then_drop: 'Raised, then “dropped”',
  no_real_drop: 'No real drop',
  too_early: 'Too early to check this sale',
  unavailable: 'Not on sale: unavailable',
};
const SALE_CLASS = { real_drop: 'good', hike_then_drop: 'bad', no_real_drop: 'neutral', too_early: 'neutral', unavailable: 'neutral' };

/** The line beside the big price: how it stands against the product's own usual price. */
function priceNote(view) {
  const { sale, stats } = view;
  if (stats.inStock === false || stats.current == null) return null;
  if (sale.status === 'real_drop' && sale.realPct != null && sale.usualPrice != null) return h('span', { class: 'price-note good' }, `${pct(sale.realPct)} below its usual ${rupees(sale.usualPrice)}`);
  if (sale.status === 'hike_then_drop') return h('span', { class: 'price-note bad' }, 'Raised before this sale');
  if (sale.status === 'no_real_drop' && sale.usualPrice != null) return h('span', { class: 'price-note neutral' }, `Usual price ${rupees(sale.usualPrice)}`);
  return null;
}

/** The fake-sale check, inside the verdict card. A product too new to check says so once, in the verdict. */
function saleCheck(view) {
  const { sale } = view;
  if (sale.status === 'unavailable' || (sale.status === 'too_early' && view.verdict.kind === 'too_early' && sale.claimedPct == null)) return null;
  return h('div', { class: 'sale-check', 'data-sale': sale.status },
    h('span', { class: `badge ${SALE_CLASS[sale.status]}` }, SALE_TITLE[sale.status]),
    h('p', {}, sale.explanation),
    sale.claimedPct != null ? h('p', { class: 'small' }, `Claimed: ${pct(sale.claimedPct)} off M.R.P. \u00b7 Real: ${sale.realPct == null ? 'not known yet' : pct(sale.realPct) + ' vs usual'}`) : null);
}

/** Top bar's share button on a product page: the phone's share sheet, or the address copied. */
let shareThis = null;
document.getElementById('top-share').addEventListener('click', async () => {
  const url = location.origin + location.pathname;
  const text = shareThis ? `${shareThis.title}${shareThis.price ? ` at ${shareThis.price}` : ''}: its real price history on Britto` : 'Its real price history on Britto';
  const bridge = inApp ? siteBridge() : null;
  if (bridge) { await bridge({ type: 'shareApp', text: `${text.slice(0, 380)} ${url}` }); return; }
  if (navigator.share) { await navigator.share({ title: 'Britto', text, url }).catch(() => {}); return; }
  try { await navigator.clipboard.writeText(url); say('Link copied'); } catch { say('Copy the address from your browser'); }
});

/** A short message at the bottom of the screen. */
function say(text) {
  const old = document.getElementById('toast');
  old?.remove();
  const t = h('div', { class: 'toast', id: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

async function productPage(key) {
  put(app, h('p', { class: 'muted' }, 'Loading…'));
  // "?add=1" (a search result, a britto.app/<link> address): track it, or find it tracked.
  if (new URLSearchParams(location.search).has('add') && keyToLink(key)) return addByLink(keyToLink(key), null, true);
  let view;
  try {
    view = (await getProduct(key)).product;
  } catch (e) {
    if (e.code === 'not_tracked' && new URLSearchParams(location.search).has('add')) {
      return addByLink(keyToLink(key) ?? '', null);
    }
    put(app, h('section', {}, h('h1', {}, 'Not tracked yet'), h('p', {}, e.message), linkForm()));
    return;
  }
  const s = view.stats;
  const chartHost = h('div', { class: 'chart-host' });
  let range = 0;
  const ranges = [['1M', 30], ['3M', 90], ['All', 0]];
  const rangeBar = h('div', { class: 'ranges', role: 'group', 'aria-label': 'Chart range' },
    ranges.map(([label, days]) => h('button', {
      type: 'button', 'aria-pressed': String(days === range),
      onclick: (e) => { range = days; rangeBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); drawChart(chartHost, view, range); },
    }, label)));
  const days = Math.max(1, Math.floor(s.daysTracked));
  const readBy = view.store.serverFetch === 'yes' ? 'by Britto\u2019s server' : 'by shoppers\u2019 phones and browsers';
  const showAlert = (e) => { e.preventDefault(); document.getElementById('alert')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  const priced = s.inStock !== false && s.current != null;
  shareThis = { title: view.title ?? 'A product on Britto', price: priced ? rupees(s.current) : null };

  put(app,
    h('article', { class: 'product' },
      h('section', { class: 'p-card' },
        h('div', { class: 'p-head' },
          h('div', { class: 'product-img' }, view.image ? h('img', { src: view.image, alt: '', referrerpolicy: 'no-referrer' }) : null),
          h('div', { class: 'p-name' },
            h('span', { class: 'store' }, view.store.name),
            h('h1', { class: 'product-title' }, view.title ?? 'Product details not read yet'),
            h('p', { class: 'muted small' }, `Checked ${ago(s.lastCheckedAt)} \u00b7 watched since ${date(s.trackedSince)}`))),
        h('div', { class: 'now' },
          h('span', { class: 'now-price' },
            h('span', { class: 'big-price' }, s.inStock === false ? 'Out of stock' : rupees(s.current)),
            s.currentMrp && s.current && s.currentMrp > s.current ? h('span', { class: 'mrp' }, 'M.R.P. ', h('s', {}, rupees(s.currentMrp))) : null),
          priceNote(view)),
        view.pending ? h('p', { class: 'notice' }, view.pending) : null,
        h('section', { class: `verdict ${VERDICT_CLASS[view.verdict.kind]}` },
          h('h2', {}, view.verdict.headline),
          h('p', {}, view.verdict.reasons.join(' ')),
          saleCheck(view),
          priceScale(s))),
      // The price history right under the verdict (what a shopper came for), then other stores'
      // prices (design v5), the alert and only then the store's own offers.
      h('section', { class: 'p-card' },
        h('div', { class: 'chart-head' }, h('h2', {}, 'Price history'), rangeBar),
        chartHost,
        h('p', { class: 'tip-line' }, `${s.changes} price change${s.changes === 1 ? '' : 's'} in ${days} day${days === 1 ? '' : 's'}, read from ${view.store.name}\u2019s own page ${readBy}.`),
        h('dl', { class: 'stats' },
          stat('Lowest', s.lowest ? `${rupees(s.lowest.price)}` : '\u2014', s.lowest ? date(s.lowest.at) : ''),
          stat('Highest', s.highest ? `${rupees(s.highest.price)}` : '\u2014', s.highest ? date(s.highest.at) : ''),
          // ONE usual price on the page: the sale check's (90 days, leaving out the last 2, so a new
          // sale is not its own baseline); a product too new for it shows the middle price so far.
          stat('Usual price', rupees(view.sale.usualPrice ?? s.median), view.sale.usualPrice != null ? '90 days, before the last 2' : 'so far: too new to be sure'),
          stat('Price changes', String(s.changes), `${Math.floor(s.daysTracked)} days watched`))),
      compareSection(view),
      alertBox(view),
      offersSection(view),
      h('section', { id: 'similar' }),
      h('div', { class: 'buy-bar' },
        h('a', { class: 'button warn', href: view.url, target: '_blank', rel: 'noopener noreferrer nofollow', title: `Opens ${view.store.name}` },
          h('b', {}, priced ? `Buy on ${view.store.name}` : `Open on ${view.store.name}`), priced ? h('span', {}, rupees(s.current)) : null),
        h('a', { class: 'button secondary', href: '#alert', onclick: showAlert }, 'Alert me'))));
  drawChart(chartHost, view, range);
  // Look-alikes (BLUEPRINT §10.3): shown only when there are some, and labelled for what they are.
  getSimilar(key).then(({ results, basis }) => {
    if (!results.length) return;
    put(document.getElementById('similar'), h('h2', {}, 'Similar, and cheaper'), h('p', { class: 'muted small' }, basis), grid(results, ''));
  }).catch(() => {});
  if (location.hash === '#alert') document.getElementById('alert')?.scrollIntoView();
}

// ---- Compare prices across stores (core/shop.ts, web/shop.js, web/match.js). In the Britto app
// (0.8.0+), each store's own SEARCH page for the product opens on this phone, under this page, and
// the products it shows are read there: Britto's server asks Flipkart, Myntra, Croma and the rest
// nothing (they refuse it, measured). A result is called the same product only when its title
// says nothing otherwise; a search-list price never enters the price history. On the website,
// Amazon.in's search is read by the server (api/listing.ts) for products from other stores.
let shopRecipes = null;
const loadShopRecipes = () => (shopRecipes ??= fetch('/shops.json').then((r) => r.json()).then((j) => j.recipes ?? []).catch(() => { shopRecipes = null; return []; }));
/** The app reads store search pages from 0.8.0 (its reader knows shop recipes and may open stores). */
const appCanShop = () => !!appVersion && (appVersion[0] > 0 || appVersion[1] >= 8);
const COMPARE_KEEP_MS = 6 * 3_600_000;
const compareKey = (key) => `britto.compare.${key}`;
function savedCompare(key) {
  try {
    const v = JSON.parse(localStorage.getItem(compareKey(key)) ?? 'null');
    return v && Date.now() - v.at < COMPARE_KEEP_MS ? v : null;
  } catch { return null; }
}
function saveCompare(key, sites) {
  try { localStorage.setItem(compareKey(key), JSON.stringify({ at: Date.now(), sites })); } catch { /* a full or blocked store: shown, not kept */ }
}
const SHOP_STATUS = {
  queued: 'Waiting…',
  loading: 'Checking…',
  check: 'asks if you are a person: open it and answer there',
  empty: 'found nothing for this',
  waiting: 'showed no products for this',
  failed: 'did not open',
};

function compareSection(view) {
  const words = searchWordsFor(view.title ?? '');
  if (!words) return null;
  const box = h('section', { class: 'compare p-card', id: 'compare' });
  const here = view.stats?.inStock !== false ? view.stats?.current ?? null : null;
  Promise.all([storesOnce(), loadShopRecipes()]).then(([stores, recipes]) => {
    const recipesHere = storesFor(view.title, recipes, view.store.id);
    const names = new Map([...stores.map((s) => [s.id, s.name]), ...(servicesCache ?? []).map((s) => [s.id, s.name])]);
    const links = stores.filter((s) => s.id !== view.store.id).map((s) => ({ store: s.id, name: s.name, url: searchLink(s, words) }));
    const head = h('h2', {}, 'Compare prices');
    const out = h('div', { class: 'shop-out' });
    const server = h('div', { class: 'shop-server' });
    const more = h('details', { class: 'shop-more' }, h('summary', {}, 'Search other stores yourself'),
      h('p', { class: 'muted small' }, `Searches for \u201c${words}\u201d. Stores name products differently, so check it is the same item.`), storeButtons(links));
    const sites = recipesHere.map((r) => ({ id: r.store, name: names.get(r.store) ?? r.store, url: shopSearchUrl(r, words), recipe: r }));
    if (inApp && appCanShop() && sites.length) {
      const run = h('button', { type: 'button', class: 'button big', id: 'shop-run' }, `Check prices on ${sites.length} stores`);
      const saved = savedCompare(view.key);
      run.onclick = () => {
        run.textContent = 'Check again';
        liveShop(out, sites, (read) => drawShop(out, view, read, here, null), (read) => saveCompare(view.key, read));
      };
      put(box, head, h('p', { class: 'p-text' }, `Britto opens each store\u2019s own search for \u201c${words}\u201d on your phone and reads its prices. Nothing is bought or added to a cart.`),
        h('div', { class: 'tag-list' }, sites.map((x) => h('span', { class: 'tag-item' }, x.name))), run,
        h('p', { class: 'tip-line' }, 'Takes about half a minute. The last check stays on this phone for 6 hours.'), out, server, more);
      if (saved) { run.textContent = 'Check again'; drawShop(out, view, saved.sites, here, saved.at); }
    } else {
      put(box, head, server, inApp
        ? h('p', { class: 'notice' }, 'Update the Britto app (Get the app) to see this product\u2019s price on Flipkart, Croma, Myntra and more, read on your phone.')
        : h('p', { class: 'notice' }, h('b', {}, 'See its price on Flipkart, Croma, Myntra and more: '), 'the Britto Android app reads each store\u2019s own page on your phone. ', h('a', { href: '/app' }, 'Get the app')), more);
    }
    // Amazon.in, read by Britto's server, for a product from another store (works everywhere).
    if (view.store.id !== 'amazon') serverAmazon(server, view, words, here);
  }).catch(() => {});
  return box;
}

/** Amazon.in's own search for the product, read by the server; its best match, if any. */
async function serverAmazon(box, view, words, here) {
  let res;
  try { res = await storeSearch(words); } catch { return; }
  const amazon = res.stores?.find((s) => s.store === 'amazon' && s.status === 'listed');
  const items = amazon?.items ?? [];
  const rows = items.filter((i) => i.price != null).map((i) => ({ title: i.title, price: i.price, mrp: i.mrp, image: i.image, link: `/p/${i.key}` }));
  const best = bestMatch(view.title, rows);
  if (best) {
    put(box, h('ul', { class: 'shop-list' }, shopRow({ id: 'amazon', name: 'Amazon.in', url: best.row.link, done: true, status: 'listed', best, diff: here != null ? best.row.price - here : null }, `As Amazon.in\u2019s search showed it ${ago(amazon.at)}`)));
    return;
  }
  // The same product listed WITHOUT a price on the search page (measured 6 Nov 2026: Amazon.in
  // lists "boAt Airdopes 141 Gen 2" with none): said, with its page, never hidden.
  const unpriced = items.filter((i) => i.price == null).find((i) => matchTitle(view.title, i.title).kind === 'same');
  if (!unpriced) return;
  put(box, h('ul', { class: 'shop-list' }, h('li', { class: 'shop-row same', 'data-store': 'amazon', 'data-status': 'listed', 'data-kind': 'same-unpriced' },
    h('a', { class: 'shop-link', href: `/p/${unpriced.key}`, rel: 'noopener' },
      unpriced.image ? h('img', { src: unpriced.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'mono', 'data-mono': 'A' }),
      h('span', { class: 'shop-what' }, h('b', {}, 'Amazon.in'), h('span', { class: 'small shop-title' }, unpriced.title),
        h('span', { class: 'badge neutral' }, 'Same product \u00b7 no price on its search')),
      h('span', { class: 'shop-price' }, h('span', { class: 'button secondary small' }, 'See price'))))));
}

/**
 * Opens each store's search page on this phone (FareRunner reads it with its shop recipe) and
 * calls draw(sites with their state) as stores finish, then done(sites) once all are.
 */
async function liveShop(box, sites, draw, done = () => {}) {
  const ask = siteBridge();
  if (!ask) return;
  const started = await ask({ type: 'compareFares', sites: sites.map(({ id, url, recipe }) => ({ id, url, recipe })) });
  if (!started?.ok) { put(box, h('p', { class: 'error' }, 'This copy of the app could not open the stores.')); return; }
  const run = ++fareRun;
  put(box, h('p', { class: 'muted' }, `Opening ${sites.map((s) => s.name).join(', ')} on your phone\u2026`));
  const tick = async () => {
    if (run !== fareRun || !box.isConnected) { if (run === fareRun) ask({ type: 'compareStop' }); return; }
    const st = await ask({ type: 'compareStatus', job: started.job });
    if (!st?.ok || run !== fareRun) return;
    const state = new Map(st.sites.map((x) => [x.id, x]));
    const read = sites.map(({ id, name, url }) => ({ id, name, url, ...state.get(id) }));
    draw(read);
    if (!st.done) setTimeout(tick, 1000);
    else done(read.map(({ id, name, url, state: s, status, rows }) => ({ id, name, url, state: s, status, rows })));
  };
  tick();
}

/** The search page in the app: every other store's own results for the words, read on this phone. */
function otherStoresSearch(box, q) {
  Promise.all([storesOnce(), loadShopRecipes()]).then(([stores, recipes]) => {
    const names = new Map([...stores.map((s) => [s.id, s.name]), ...(servicesCache ?? []).map((s) => [s.id, s.name])]);
    const sites = storesFor(q, recipes, 'amazon').map((r) => ({ id: r.store, name: names.get(r.store) ?? r.store, url: shopSearchUrl(r, q), recipe: r }));
    if (!sites.length || !box.isConnected) return;
    // Asked for by a tap, never on its own: each search opens up to six store pages on the
    // shopper's phone (their data and battery), and stores block a phone that loads them too often.
    const go = h('button', { type: 'button', class: 'button', id: 'shop-search-run' }, `Search ${sites.length} more stores`);
    go.onclick = () => liveShop(box, sites, (read) => { drawStoreResults(box, read); applySearchFilter(); });
    put(box, h('section', { class: 'still-card' },
      h('b', {}, `Also on ${sites.map((s) => s.name).join(', ')}?`),
      h('p', {}, 'Britto opens each store’s own search on your phone and reads what it lists. About half a minute.'),
      go));
  }).catch(() => {});
}

function drawStoreResults(box, sites) {
  const waiting = sites.filter((s) => s.state !== 'done');
  const finished = sites.length - waiting.length;
  put(box,
    // data-state: a store's LAST reading can already say "listed" while it is still loading (the
    // app waits for its products to stop changing), so "done" is the state, not the status. A store
    // still being read waits in the card below, not as an empty section.
    sites.map((s) => h('section', { class: 'store-results filterable', 'data-store': s.id, 'data-status': s.status ?? 'queued', 'data-state': s.state ?? 'queued', hidden: s.state !== 'done' },
      storeHead(s.name, s.status === 'listed' ? 'Read on your phone \u00b7 just now' : 'On your phone', s.url),
      s.status === 'listed' && s.rows?.length ? h('div', { class: 'row' }, s.rows.slice(0, 8).map((r) => h('a', { class: 'card shop-card', href: r.link ?? s.url, rel: 'noopener', 'data-price': r.price ?? 0, 'data-history': 0 },
        h('div', { class: 'thumb' }, r.image ? h('img', { src: r.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null),
        h('span', { class: 'title' }, r.title),
        h('span', { class: 'price-line' }, h('b', {}, rupees(r.price)), r.mrp ? h('s', { class: 'small muted' }, rupees(r.mrp)) : null))))
        : h('p', { class: 'small muted' }, SHOP_STATUS[s.status] ?? SHOP_STATUS.waiting))),
    h('section', { class: 'still-card' },
      waiting.length ? h('b', {}, `Still checking: ${waiting.map((s) => s.name).join(', ')}`) : h('b', {}, `Checked ${sites.length} more stores`),
      waiting.length ? h('progress', { max: sites.length, value: finished, class: 'fare-bar' }) : null,
      h('p', {}, 'Each store\u2019s own search, opened and read on your phone. Tap a product to open it in that store: Britto shows its price history there.')));
}

function drawShop(box, view, sites, here, savedAt) {
  const v = compareView(view.title, sites, here);
  const best = v.cheapest;
  const summary = !v.done ? h('p', { class: 'shop-progress' }, h('span', {}, 'Checking prices on your phone\u2026'), h('span', { class: 'muted' }, `${v.checked} of ${sites.length} stores`))
    : best && (here == null || best.best.row.price < here)
      ? h('div', { class: 'shop-best' }, h('span', { class: 'small' }, here == null ? 'Lowest price found' : 'Cheaper elsewhere'), h('strong', {}, `${rupees(best.best.row.price)} on ${best.name}`),
        here == null ? h('span', { class: 'small' }, `${view.store.name} shows no price for it now`) : h('span', { class: 'small' }, `${rupees(here - best.best.row.price)} less than on ${view.store.name}`))
      : best ? h('div', { class: 'shop-best good' }, h('span', { class: 'small' }, `${view.store.name} is the cheapest`), h('strong', {}, rupees(here)), h('span', { class: 'small' }, `of the ${v.rows.filter((r) => r.best?.kind === 'same').length + 1} stores that have this exact product`))
        : h('p', { class: 'small muted' }, v.rows.some((r) => r.best) ? 'No other store\u2019s search showed this exact product; similar ones are below.' : 'No other store\u2019s search showed this exact product.');
  put(box, summary,
    !v.done ? h('progress', { max: sites.length, value: v.checked, class: 'fare-bar' }) : null,
    h('ul', { class: 'shop-list' }, v.rows.map((r) => shopRow(r))),
    h('p', { class: 'muted small' }, `${savedAt ? `Checked ${ago(savedAt)} on this phone` : 'Prices as each store\u2019s search showed them on your phone'}. A search price can differ from the product page (offers, sizes, sellers): Britto starts tracking a product\u2019s own price when you open it.`));
}

/** One store's line: its best match (photo, price, same / similar), or why there is none. */
function shopRow(r, note = null) {
  const m = r.best;
  const open = m?.row.link ?? r.url;
  const named = (status) => h('span', { class: 'shop-what' }, h('b', {}, r.name), h('span', { class: 'small muted' }, status));
  if (!r.done) return h('li', { class: 'shop-row pending', 'data-store': r.id, 'data-status': r.status ?? 'queued' }, h('span', { class: 'mono', 'data-mono': monogramOf(r.name) }), named(SHOP_STATUS[r.status] ?? SHOP_STATUS.loading));
  if (!m) return h('li', { class: 'shop-row none', 'data-store': r.id, 'data-status': r.status },
    h('span', { class: 'mono', 'data-mono': monogramOf(r.name) }),
    named(r.status === 'listed' ? 'no matching product in its search' : SHOP_STATUS[r.status] ?? SHOP_STATUS.waiting),
    h('a', { class: 'button secondary small', href: r.url, rel: 'noopener' }, 'Open'));
  const diff = r.diff == null || r.diff === 0 ? null : r.diff < 0 ? h('span', { class: 'badge good' }, `${rupees(-r.diff)} less`) : h('span', { class: 'badge bad' }, `${rupees(r.diff)} more`);
  return h('li', { class: `shop-row ${m.kind}`, 'data-store': r.id, 'data-status': r.status, 'data-kind': m.kind },
    h('a', { class: 'shop-link', href: open, rel: 'noopener' },
      m.row.image ? h('img', { src: m.row.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'mono', 'data-mono': monogramOf(r.name) }),
      h('span', { class: 'shop-what' },
        h('b', {}, r.name),
        h('span', { class: 'small shop-title' }, m.row.title),
        h('span', { class: `badge ${m.kind === 'same' ? 'neutral' : 'warn'}` }, m.kind === 'same' ? 'Same product' : `Similar: ${m.why}`),
        note ? h('span', { class: 'small muted' }, note) : null),
      h('span', { class: 'shop-price' }, h('strong', {}, rupees(m.row.price)), m.row.mrp ? h('s', { class: 'small muted' }, rupees(m.row.mrp)) : null, diff)));
}

let storesCache = null;
let servicesCache = null;
const storesOnce = () => (storesCache ??= getStores().then((r) => { servicesCache = r.services ?? []; return r.stores; }).catch((e) => { storesCache = null; throw e; }));
function searchLink(store, words) {
  return store.search.url.replace('{q}', encodeURIComponent(words)).replace('{slug}', encodeURIComponent(words.toLowerCase().replace(/ /g, '-')));
}

// Offers the store's own page showed when OUR server last read it (BLUEPRINT §15): quoted as
// the page put them, not checked by Britto. Offer text from shoppers' browsers is never shown here.
function offersSection(view) {
  if (!view.offers?.items.length) return null;
  return h('section', { class: 'offers p-card', id: 'offers' },
    h('h2', {}, `Offers on ${view.store.name}'s page`),
    h('ul', {}, view.offers.items.map((o) => h('li', {}, h('b', { class: 'offer-kind' }, o.title), ' ', o.text, o.count ? h('span', { class: 'muted small' }, ` · ${o.count}`) : null,
      o.code ? couponBox(view.store.id, o) : null))),
    h('p', { class: 'muted small' }, `As the page showed them ${ago(view.offers.at)}. Britto does not check offers or their terms: read them on ${view.store.name} before you pay.`));
}

// A code the page advertised: copy it, and say whether it worked (one vote per network).
function couponBox(store, offer) {
  const said = h('span', { class: 'muted small votes' }, votesText(offer.votes));
  const vote = (worked) => async () => {
    buttons.forEach((b) => { b.disabled = true; });
    try {
      said.textContent = `${votesText((await voteCoupon(store, offer.code, worked)).votes)} Thanks for saying.`;
    } catch (e) {
      said.textContent = e.message;
      buttons.forEach((b) => { b.disabled = false; });
    }
  };
  const copy = h('button', { type: 'button', class: 'secondary', onclick: async () => {
    try { await navigator.clipboard.writeText(offer.code); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select the code to copy it'; }
  } }, 'Copy');
  const buttons = [h('button', { type: 'button', class: 'secondary', onclick: vote(true) }, 'It worked'), h('button', { type: 'button', class: 'secondary', onclick: vote(false) }, 'It did not')];
  return h('div', { class: 'coupon' }, h('code', {}, offer.code), copy, ...buttons, said);
}

function votesText(v) {
  return v?.total ? `Worked for ${v.worked} of ${v.total} shoppers in the last 30 days.` : 'No shopper has said yet whether it works.';
}

// ---- Travel (BLUEPRINT §14): one search, each site opened with it filled in. Links are built
// here, on the device; Britto shows no fares (no free, permitted source) and stores nothing.
const LINK_NOTE = {
  opened: 'Opens with your search filled in (checked on the site).',
  app: 'Opens with your search filled in (checked in the Britto app).',
  documented: (n) => `Link format from ${n}\u2019s own documentation.`,
  unchecked: 'Not checked yet: it may open without your search filled in.',
  home: 'Opens the site: enter your trip there.',
};

function travelLinks(links) {
  return h('ul', { class: 'travel-links' }, links.map((l) => h('li', { 'data-site': l.id },
    h('a', { class: l.prefilled && l.checked ? 'button' : 'button secondary', href: l.url, target: '_blank', rel: 'noopener noreferrer' },
      l.prefilled ? `Search on ${l.name}` : `Open ${l.name}`),
    h('span', { class: 'small muted' }, !l.prefilled ? LINK_NOTE.home : l.checked === 'opened' ? LINK_NOTE.opened : l.checked === 'app' ? LINK_NOTE.app : l.checked === 'documented' ? LINK_NOTE.documented(l.name) : LINK_NOTE.unchecked))));
}

// ---- Live fares, in the Britto app only (core/fares.ts, android FareRunner): each site's own
// results page opens on this phone, under this page, and its fares are read from what it shows.
// Britto's server never asks a travel site anything, and nothing is booked or clicked there.
let fareRecipes = null;
let fareRun = 0;
const loadFareRecipes = () => (fareRecipes ??= fetch('/fares.json').then((r) => r.json()).then((j) => j.recipes ?? []).catch(() => { fareRecipes = null; return []; }));

const FARE_STATUS = {
  queued: 'Waiting…',
  loading: 'Checking…',
  check: 'asks you to confirm you are a person. Open it, answer it there, then search again.',
  login: 'shows fares only after you log in. Open it and log in once.',
  ask: 'asks a question before its fares (for an airport: which airline). Open it and answer it there; Britto never answers for you.',
  waiting: 'showed no fares for this search.',
  failed: 'did not open.',
};

/**
 * True when the comparison started (inside the app, with at least one site it can read). `draw`
 * paints each state: (box, sites, state, others). opts.date: the searched day (dates the sites'
 * date strips); opts.onDone(sites with their readings) once every site is done.
 */
async function liveFares(box, links, sector, draw, opts = {}) {
  const ask = inApp ? siteBridge() : null;
  if (!ask) return false;
  const recipes = await loadFareRecipes();
  const sites = links.filter((l) => l.prefilled).map((l) => ({ id: l.id, name: l.name, url: l.url, trip: l.trip, recipe: recipes.find((r) => r.site === l.id && r.sector === sector) })).filter((s) => s.recipe);
  if (!sites.length) return false;
  const started = await ask({ type: 'compareFares', sites: sites.map(({ id, url, recipe, trip }) => ({ id, url, recipe, ...(opts.date ? { date: opts.date } : {}), ...(trip ? { trip } : {}) })) });
  if (!started?.ok) return false;
  const others = links.filter((l) => !sites.some((s) => s.id === l.id));
  const run = ++fareRun;
  const tick = async () => {
    if (run !== fareRun || !box.isConnected) { if (run === fareRun) ask({ type: 'compareStop' }); return; }
    const st = await ask({ type: 'compareStatus', job: started.job });
    if (!st?.ok || run !== fareRun) return;
    draw(box, sites, st, others);
    if (!st.done) setTimeout(tick, 1000);
    else opts.onDone?.(sites.map((s) => ({ ...s, ...st.sites.find((x) => x.id === s.id) })));
  };
  put(box, h('p', { class: 'muted' }, `Opening ${sites.map((s) => s.name).join(', ')} on your phone…`));
  tick();
  return true;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-11-20' -> 'Fri 20 Nov' */
const dayName = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`; };

/** The sites' date strips merged (web/compare.js fareStrip): tap a day to compare that day. */
function drawStrip(read, day, pick) {
  const today = todayIST();
  const strip = fareStrip(read).filter((d) => d.date >= today);
  if (strip.length < 2) return null;
  const low = Math.min(...strip.map((d) => d.price));
  return h('div', { class: 'fare-strip-wrap' },
    h('p', { class: 'small muted' }, 'Lowest fare by date, as the sites\u2019 own date strips show it (their figure for each day, which can differ from the fares listed below). Tap a day to compare it.'),
    h('div', { class: 'fare-strip' }, strip.map((d) => h('button', {
      type: 'button', class: `strip-day${d.date === day ? ' active' : ''}${d.price === low ? ' low' : ''}`, 'data-date': d.date, title: `${d.name}: ${rupees(d.price)}`,
      onclick: () => pick?.(d.date),
    }, h('span', {}, dayName(d.date)), h('b', {}, rupees(d.price))))));
}

function drawFares(box, sites, st, others, q, airports, pick = null, watch = null) {
  const state = new Map(st.sites.map((x) => [x.id, x]));
  const read = sites.map((s) => ({ ...s, ...state.get(s.id) }));
  const finished = read.filter((s) => s.state === 'done').length;
  const flights = groupFlights(read);
  const fromCity = airports.get(q.from)?.city ?? null;
  const toCity = airports.get(q.to)?.city ?? null;
  const best = flights[0];
  const open = (url, label, cls = 'button') => h('a', { class: cls, href: url, rel: 'noopener' }, label);
  put(box,
    h('p', { class: 'fare-progress small' }, st.done ? `Checked ${read.length} sites on your phone just now.` : `Checking fares on your phone: ${finished} of ${read.length} sites done…`),
    h('progress', { max: read.length, value: finished, class: 'fare-bar' }),
    best ? h('div', { class: 'fare-best' },
      h('span', { class: 'small muted' }, 'Cheapest found'),
      h('strong', {}, `${rupees(best.best)} on ${best.offers[0].name}`),
      h('span', { class: 'small' }, `${best.airline}${best.number ? ` ${best.number}` : ''}, ${best.depart} → ${best.arrive}`)) : null,
    st.done ? drawStrip(read, q.depart, pick) : null,
    st.done && best && watch ? h('p', {}, h('button', { type: 'button', class: 'button secondary', id: 'fare-watch', onclick: async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      const r = await watch(read, best);
      b.replaceWith(h('span', { class: r?.ok ? 'notice' : 'error', id: 'fare-watch-result' }, r?.ok
        ? `Fare alert set: Britto compares these sites again on this phone every few hours and tells you when a fare for ${q.from} \u2192 ${q.to} on ${dayName(q.depart)} is at least \u20b9100 below ${rupees(best.best)}.`
        : r?.reason === 'full' ? 'You already watch three routes: stop one under Fare alerts first.' : 'This route cannot be watched.'));
    } }, `Alert me if it gets cheaper than ${rupees(best.best)}`)) : null,
    h('ul', { class: 'fare-sites' }, siteSummary(read).map((s) => h('li', { 'data-site': s.id, 'data-status': s.status },
      h('span', { class: 'fare-site' }, s.name),
      s.cheapest != null ? h('span', {}, `from ${rupees(s.cheapest)}`, h('small', { class: 'muted' }, ` · ${s.rows.length} fares`)) : h('span', { class: 'small muted' }, FARE_STATUS[s.status] ?? FARE_STATUS.waiting),
      open(s.url, ['check', 'login', 'ask'].includes(s.status) ? `Open ${s.name}` : 'Open', 'button secondary small')))),
    flights.length ? h('h3', {}, `${flights.length} flights, cheapest first`) : null,
    h('ol', { class: 'fare-list' }, flights.slice(0, 25).map((f) => {
      const away = otherAirport(f.from, q.from, fromCity) || otherAirport(f.to, q.to, toCity);
      return h('li', { 'data-flight': f.key },
        h('div', { class: 'fare-flight' },
          h('strong', {}, `${f.depart} → ${f.arrive}`),
          h('span', {}, `${f.airline}${f.number ? ` ${f.number}` : ''}`),
          h('span', { class: 'small muted' }, [f.duration, f.stops].filter(Boolean).join(' · ')),
          away ? h('span', { class: 'small warn' }, `Airports: ${f.from.join('/') || '?'} → ${f.to.join('/') || '?'}`) : null),
        h('div', { class: 'fare-offers' }, f.offers.map((o, i) => h('a', { class: i === 0 ? 'offer best' : 'offer', href: o.url, rel: 'noopener', 'data-offer': o.site },
          h('span', {}, o.name), h('b', {}, rupees(o.price))))));
    })),
    h('p', { class: 'small muted' }, 'Fares as each site showed them on this phone, before coupons and fees at checkout. Tap a site to book there; Britto never books or pays for you.'),
    others.length ? [h('h3', {}, 'Also search on'), travelLinks(others)] : null);
}

/** Hotel compare: every site's hotels per night (web/compare.js groupHotels), cheapest first. */
function drawHotels(box, sites, st, others, q) {
  const state = new Map(st.sites.map((x) => [x.id, x]));
  const read = sites.map((s) => ({ ...s, ...state.get(s.id) }));
  const finished = read.filter((s) => s.state === 'done').length;
  const nights = Math.round((Date.parse(`${q.checkOut}T00:00:00Z`) - Date.parse(`${q.checkIn}T00:00:00Z`)) / 86_400_000);
  const hotels = groupHotels(read, nights);
  const best = hotels[0];
  const lowest = (id) => hotels.flatMap((x) => x.offers).filter((o) => o.site === id).reduce((m, o) => (m == null || o.night < m ? o.night : m), null);
  const shown = (id) => hotels.filter((x) => x.offers.some((o) => o.site === id)).length;
  const night = (o) => `${rupees(o.night)}/night${o.per === 'stay' ? ` (${rupees(o.printed)} for ${nights} night${nights > 1 ? 's' : ''})` : ''}`;
  put(box,
    h('p', { class: 'fare-progress small' }, st.done ? `Checked ${read.length} sites on your phone just now.` : `Checking hotels on your phone: ${finished} of ${read.length} sites done…`),
    h('progress', { max: read.length, value: finished, class: 'fare-bar' }),
    best ? h('div', { class: 'fare-best' },
      h('span', { class: 'small muted' }, 'Cheapest found'),
      h('strong', {}, `${rupees(best.best)} a night`),
      h('span', { class: 'small' }, `${best.name}${best.area ? `, ${best.area}` : ''}, on ${best.offers[0].name}`)) : null,
    h('ul', { class: 'fare-sites' }, read.map((s) => h('li', { 'data-site': s.id, 'data-status': s.status },
      h('span', { class: 'fare-site' }, s.name),
      lowest(s.id) != null ? h('span', {}, `from ${rupees(lowest(s.id))}/night`, h('small', { class: 'muted' }, ` · ${shown(s.id)} hotels`)) : h('span', { class: 'small muted' }, FARE_STATUS[s.status] ?? FARE_STATUS.waiting),
      h('a', { class: 'button secondary small', href: s.url, rel: 'noopener' }, ['check', 'login', 'ask'].includes(s.status) ? `Open ${s.name}` : 'Open')))),
    hotels.length ? h('h3', {}, `${hotels.length} hotels, cheapest per night first`) : null,
    h('ol', { class: 'fare-list' }, hotels.slice(0, 40).map((x) => h('li', { 'data-hotel': x.key },
      h('div', { class: 'fare-flight' }, h('strong', {}, x.name), x.area ? h('span', { class: 'small muted' }, x.area) : null),
      h('div', { class: 'fare-offers' }, x.offers.map((o, i) => h('a', { class: i === 0 && x.offers.length > 1 ? 'offer best' : 'offer', href: o.url, rel: 'noopener', 'data-offer': o.site },
        h('span', {}, o.name), h('b', {}, night(o)))))))),
    h('p', { class: 'small muted' }, 'Prices as each site showed them on this phone, before taxes and fees, for the first hotels each one lists (in its own order). The same hotel on two sites is shown once with both prices. Tap a site to book there; Britto never books for you.'),
    others.length ? [h('h3', {}, 'Also search on'), travelLinks(others)] : null);
}

/**
 * Rides whose trip is typed on the site's own page (Rapido: its address holds no trip, measured
 * 2026-11-04). The shopper opens it from here and enters the trip there; the app reads its prices
 * while they look (StoreActivity, RideReadings) and this page puts them beside Uber's.
 */
const READ_WHILE_OPEN = new Set(['rapido']);
const rideReads = new Map();
const rideDraws = new WeakMap();
let ridePoll = 0;

async function openToRead(link) {
  const ask = inApp ? siteBridge() : null;
  const recipe = (await loadFareRecipes()).find((r) => r.site === link.id && r.sector === 'ride');
  const r = ask && recipe ? await ask({ type: 'readRide', site: link.id, url: link.url, recipe }) : null;
  if (!r?.ok) location.href = link.url;
}

/** Asks the app every 3 s (for 30 minutes) for the newest reading of each site; redraws on a new one. */
function watchRideReads(box, ids) {
  const run = ++ridePoll;
  const ask = siteBridge();
  const until = Date.now() + 30 * 60_000;
  const tick = async () => {
    if (run !== ridePoll || !box.isConnected || Date.now() > until) return;
    let changed = false;
    for (const id of ids) {
      const reading = (await ask({ type: 'rideReading', site: id }))?.reading ?? null;
      if ((reading?.at ?? 0) === (rideReads.get(id)?.at ?? 0)) continue;
      if (reading) rideReads.set(id, reading);
      else rideReads.delete(id);
      changed = true;
    }
    if (changed && rideDraws.has(box)) drawRides(box, ...rideDraws.get(box));
    setTimeout(tick, 3000);
  };
  tick();
}

/** "Gate no. 3, Amity Rd, Sector 125, Noida, …" -> "Gate no. 3, Amity Rd" (n parts) */
const shortPlace = (p, n = 2) => String(p).split(',').map((x) => x.trim()).filter(Boolean).slice(0, n).join(', ');
const clock = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** A ride's kind from its name in the app, for the filter chips: "Bike Saver" -> bike. */
function rideKind(label) {
  const l = String(label).toLowerCase();
  if (/bike|moto|scooty|two.?wheeler/.test(l)) return 'bike';
  if (/\bauto\b|rickshaw/.test(l)) return 'auto';
  if (/xl\b|\bsuv\b|[67].?seat|innova/.test(l)) return 'xl';
  if (/premier|premium|black|prime|comfort|lux|exec/.test(l)) return 'premium';
  return 'cab';
}
const RIDE_KINDS = [['all', 'All'], ['bike', 'Bike'], ['auto', 'Auto'], ['cab', 'Cab'], ['premium', 'Premium'], ['xl', 'XL']];

/** What the last compare found for each ride app on this phone (logged in or not), kept here. */
const RIDE_STATE_KEY = 'britto.rideApps';
function rideState() {
  try { return JSON.parse(localStorage.getItem(RIDE_STATE_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function noteRideState(read) {
  const now = rideState();
  let changed = false;
  for (const s of read) {
    if (!['fares', 'login', 'check'].includes(s.status)) continue;
    if (now[s.id]?.status === s.status && Date.now() - (now[s.id]?.at ?? 0) < 60_000) continue;
    now[s.id] = { status: s.status, at: Date.now() };
    changed = true;
  }
  if (changed) try { localStorage.setItem(RIDE_STATE_KEY, JSON.stringify(now)); } catch { /* private mode: not kept */ }
}

function drawRides(box, sites, st, others) {
  rideDraws.set(box, [sites, st, others]);
  const readable = inApp ? [...sites, ...others].filter((l) => READ_WHILE_OPEN.has(l.id)) : [];
  if (readable.length && !box.dataset.rideWatch) {
    box.dataset.rideWatch = '1';
    watchRideReads(box, readable.map((l) => l.id));
  }
  const state = new Map(st.sites.map((x) => [x.id, x]));
  // A site read in the background that showed no fares (not logged in, or its place list did not
  // match) falls back to a reading the shopper made by opening it (Open Rapido), when fresh.
  const auto = sites.map((s) => ({ ...s, ...state.get(s.id) }))
    .map((s) => (s.status !== 'fares' && rideReads.has(s.id) ? { ...s, ...rideReads.get(s.id), opened: true } : s));
  const opened = others.filter((l) => READ_WHILE_OPEN.has(l.id) && rideReads.has(l.id)).map((l) => ({ ...l, ...rideReads.get(l.id), opened: true }));
  const read = [...auto, ...opened];
  noteRideState(read);
  const rest = others.filter((l) => !opened.some((o) => o.id === l.id));
  const tripOf = read.filter((s) => s.status === 'fares' && s.places?.filter(Boolean).length === 2);
  const rides = rideRows(read);
  const openButton = (l) => (READ_WHILE_OPEN.has(l.id) && inApp
    ? h('button', { type: 'button', class: 'button secondary small', 'data-read': l.id, onclick: () => openToRead(l) }, `Open ${l.name}`)
    : h('a', { class: 'button secondary small', href: l.url, rel: 'noopener' }, `Open ${l.name}`));
  const count = (s) => rides.filter((r) => r.site.id === s.id).length;
  const kinds = new Set(rides.map((r) => rideKind(r.label)));
  const kind = kinds.has(box.dataset.kind) ? box.dataset.kind : 'all';
  const shown = rides.filter((r) => kind === 'all' || rideKind(r.label) === kind);
  const best = rides[0];
  const rival = best && rides.find((r) => r.site.id !== best.site.id);
  const badge = (site) => h('span', { class: `app-badge app-${site.id}` }, site.name);
  put(box,
    h('p', { class: 'fare-progress small' }, st.done ? 'Checked on your phone just now.' : 'Checking ride fares on your phone…'),
    st.done ? null : h('progress', { class: 'fare-bar' }),
    h('ul', { class: 'fare-sites ride-sites' }, read.map((s) => h('li', { 'data-site': s.id, 'data-status': s.status },
      h('span', { class: 'fare-site' }, s.name),
      s.status === 'fares' && count(s)
        ? h('span', { class: 'ride-ok' }, icon('check'), `${count(s)} rides from ${rupees(rides.find((r) => r.site.id === s.id).price)}`,
          s.opened ? h('span', { class: 'small muted' }, ` · read at ${clock(s.at)}`) : null)
        : h('span', { class: 'small muted' }, s.stage === 'failed'
          ? 'did not list the same place, so Britto stopped. Open it and enter the trip there: Britto reads its prices while you look.'
          : FARE_STATUS[s.status] ?? FARE_STATUS.waiting),
      s.status === 'fares' && count(s) ? null : openButton(s)))),
    best ? h('section', { class: 'ride-best', 'data-best': best.site.id },
      h('span', { class: 'eyebrow' }, 'Cheapest right now'),
      h('div', { class: 'ride-best-row' },
        h('span', { class: `ride-ico kind-${rideKind(best.label)}` }, icon(rideKind(best.label) === 'cab' || rideKind(best.label) === 'premium' || rideKind(best.label) === 'xl' ? 'car' : rideKind(best.label))),
        h('span', { class: 'ride-best-name' }, h('b', {}, `${best.label} on ${best.site.name}`),
          h('small', {}, [best.eta ? `pickup ${best.eta}` : null, rival ? `${rupees(rival.price - best.price)} less than ${rival.site.name}’s cheapest` : null].filter(Boolean).join(' · '))),
        h('strong', {}, rupees(best.price))),
      h('a', { class: 'button light', href: best.site.url, rel: 'noopener', 'data-offer': best.site.id }, `Book it in ${best.site.name}`)) : null,
    tripOf.map((s) => h('p', { class: 'small muted', 'data-trip': s.id }, `${s.name}’s prices are for the trip in its own boxes: ${s.places.map((x) => shortPlace(x)).join(' → ')}. Check it is the same trip.`)),
    kinds.size > 1 ? h('div', { class: 'chips ride-kinds', role: 'group', 'aria-label': 'Ride type' },
      RIDE_KINDS.filter(([id]) => id === 'all' || kinds.has(id)).map(([id, label]) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(id === kind), 'data-kind': id,
        onclick: () => { box.dataset.kind = id; drawRides(box, sites, st, others); },
      }, label))) : null,
    shown.length ? h('ol', { class: 'fare-list ride-list' }, shown.map((r) => h('li', { 'data-ride': r.label },
      h('a', { class: 'offer ride-row', href: r.site.url, rel: 'noopener', 'data-offer': r.site.id },
        h('span', { class: `ride-ico kind-${rideKind(r.label)}` }, icon(['bike', 'auto'].includes(rideKind(r.label)) ? rideKind(r.label) : 'car')),
        h('span', { class: 'ride-name' }, h('b', {}, r.label), h('small', {}, badge(r.site), r.eta ? ` pickup ${r.eta}` : '')),
        h('b', { class: 'ride-price' }, rupees(r.price)))))) : null,
    rest.length ? h('ul', { class: 'fare-sites' }, rest.map((l) => h('li', { 'data-site': l.id, 'data-status': 'link' },
      h('span', { class: 'fare-site' }, l.name),
      h('span', { class: 'small muted' }, READ_WHILE_OPEN.has(l.id) && inApp
        ? `Its trip is typed on its own page: open it, log in with your number once, and enter the same pickup and drop. Britto reads its prices while you look and shows them here.`
        : 'Britto cannot read its fares yet: open it, log in with your number once, and enter the trip there.'),
      openButton(l)))) : null,
    h('p', { class: 'small muted' }, 'Fares exactly as each app’s own page showed them on this phone. Tap a ride to book it in that app; Britto never books a ride.'));
}

const addDaysISO = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** "DEL · New Delhi" (what the airport list puts in the box) or "del" -> "DEL". */
const airportCode = (v) => (/^\s*([A-Za-z]{3})\b/.exec(v)?.[1] ?? '').toUpperCase();

/**
 * A row of tabs over panels (Travel: Cabs, Flights, Hotels). The open tab is kept in the address
 * (/travel#cabs) and on this device, so Back and a reload come back to it.
 */
let travelTabsShow = null;
function tabs(panels, list, fallback) {
  const want = location.hash.slice(1);
  let saved = null;
  try { saved = localStorage.getItem('britto.travelTab'); } catch { /* not kept */ }
  const ids = list.map(([id]) => id);
  const first = ids.includes(want) ? want : ids.includes(saved) ? saved : fallback;
  const buttons = new Map();
  const show = (id, remember = true) => {
    for (const [k, panel] of Object.entries(panels)) panel.hidden = k !== id;
    for (const [k, b] of buttons) b.setAttribute('aria-selected', String(k === id));
    if (!remember) return;
    try { localStorage.setItem('britto.travelTab', id); } catch { /* not kept */ }
    history.replaceState(null, '', `${location.pathname}#${id}`);
  };
  const bar = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Travel' }, list.map(([id, label, ic]) => {
    const b = h('button', { type: 'button', role: 'tab', id: `tab-${id}`, 'aria-controls': `panel-${id}`, onclick: () => show(id) }, icon(ic), label);
    buttons.set(id, b);
    return b;
  }));
  show(first, false);
  return { bar, show };
}

/** Recent ride trips, kept on this phone only (never sent to Britto), newest first, at most 3. */
const RECENT_RIDES_KEY = 'britto.recentRides';
function recentRides() {
  try { return (JSON.parse(localStorage.getItem(RECENT_RIDES_KEY) ?? '[]') ?? []).filter((t) => t?.pickup?.place && t?.drop?.place).slice(0, 3); } catch { return []; }
}
function keepRide(trip) {
  const same = (a, b) => a.pickup.value === b.pickup.value && a.drop.value === b.drop.value;
  const list = [trip, ...recentRides().filter((t) => !same(t, trip))].slice(0, 3);
  try { localStorage.setItem(RECENT_RIDES_KEY, JSON.stringify(list)); } catch { /* not kept */ }
}

/** Where the trip apps stand on this phone, from the last compare (RIDE_STATE_KEY). */
const RIDE_APPS = [
  { id: 'uber', name: 'Uber', url: 'https://m.uber.com/' },
  { id: 'rapido', name: 'Rapido', url: 'https://m.rapido.bike/' },
];
function rideAppsCard() {
  const known = rideState();
  return h('section', { class: 'ride-apps', id: 'ride-apps' },
    h('div', { class: 'ride-apps-head' }, h('h3', {}, 'Your ride apps'), h('span', { class: 'small muted' }, 'read on this phone')),
    h('ul', {}, RIDE_APPS.map((a) => {
      const k = known[a.id];
      const fresh = k && Date.now() - k.at < 7 * 86_400_000;
      const text = fresh && k.status === 'fares' ? `Logged in · prices read ${ago(k.at)}`
        : fresh && k.status === 'login' ? 'Not logged in: tap Open and log in with your number once'
          : fresh && k.status === 'check' ? 'Asked to confirm you are a person: tap Open'
            : 'Log in once inside Britto before your first compare';
      return h('li', { 'data-app': a.id, 'data-state': fresh ? k.status : 'unknown' },
        h('span', { class: `app-mono app-${a.id}` }, a.name[0]),
        h('span', { class: 'app-text' }, h('b', {}, a.name), h('small', { class: fresh && k.status === 'fares' ? 'ok' : 'muted' }, text)),
        READ_WHILE_OPEN.has(a.id)
          ? h('button', { type: 'button', class: 'button secondary small', 'data-read': a.id, onclick: () => openToRead(a) }, 'Open')
          : h('a', { class: 'button secondary small', href: a.url, rel: 'noopener' }, 'Open'));
    })),
    h('p', { class: 'small muted' }, 'Britto types your trip into each app’s own page and reads the fares it shows. It never presses Book.'));
}

/**
 * The Cabs form in the app: pickup (typed, or "Use my current location") and drop, the phone's own
 * place suggestions as you type, then each ride app's fares read on this phone (drawRides).
 */
function cabCompare() {
  const ask = siteBridge();
  const status = h('p', { class: 'form-status', role: 'status' });
  const sugg = h('ul', { class: 'place-list', id: 'place-list', role: 'listbox', 'aria-label': 'Places', hidden: true });
  const out = h('div', { class: 'travel-out', id: 'ride-compare-out', 'aria-live': 'polite' });
  const pickup = h('input', { name: 'pickup', placeholder: 'Where are you?', autocomplete: 'off', required: true, 'aria-label': 'Pickup', enterkeyhint: 'next' });
  const drop = h('input', { name: 'drop', placeholder: 'Where to?', autocomplete: 'off', required: true, 'aria-label': 'Drop', enterkeyhint: 'search' });
  const pickupLabel = h('small', {}, 'Pickup');
  let timer = 0;
  let run = 0;
  const hide = () => { sugg.hidden = true; put(sugg); };
  // A place picked from the list (or the phone's location) stays with its box until it is typed in again.
  const choose = (input, place, shown, say) => {
    input.value = shown;
    input.place = place;
    input.dataset.say = say ?? shown;
    hide();
    status.textContent = '';
    if (input === pickup && !drop.value) drop.focus();
    else input.blur();
  };
  const suggest = (input) => {
    if (input === pickup) pickupLabel.textContent = 'Pickup';
    input.place = null;
    input.dataset.say = '';
    const q = input.value.trim();
    const mine = ++run;
    clearTimeout(timer);
    if (q.length < 3 || !ask) return hide();
    timer = setTimeout(async () => {
      const r = await ask({ type: 'places', q });
      if (mine !== run || document.activeElement !== input) return;
      const found = r?.places ?? [];
      if (!found.length) return hide();
      put(sugg, found.map((p) => {
        const named = p.name && p.name !== q && !/^\d/.test(p.name);
        const shown = named ? p.name : shortPlace(p.address, 3);
        return h('li', {}, h('button', { type: 'button', class: 'place', role: 'option', onclick: () => choose(input, p, shown, named ? p.name : input.value.trim()) },
          icon('pin'), h('span', {}, h('b', {}, shown), h('small', {}, p.address))));
      }));
      input.closest('.trip-row')?.after(sugg);
      sugg.hidden = false;
    }, 400);
  };
  for (const input of [pickup, drop]) {
    input.addEventListener('input', () => suggest(input));
    input.addEventListener('blur', () => setTimeout(() => { if (!sugg.contains(document.activeElement)) hide(); }, 250));
  }
  const locate = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Use my current location', onclick: async () => {
    locate.disabled = true;
    status.textContent = '';
    const before = pickup.placeholder;
    pickup.value = '';
    pickup.placeholder = 'Finding where you are…';
    const r = ask ? await askHere(ask) : null;
    locate.disabled = false;
    pickup.placeholder = before;
    if (!r?.ok) {
      status.textContent = r?.reason === 'denied' ? 'Location was not allowed. Type the pickup instead.'
        : r?.reason === 'off' ? 'Location is off on this phone. Turn it on, or type the pickup.'
          : 'The phone could not find where you are just now. Type the pickup instead.';
      return;
    }
    const p = r.place;
    const near = p.address ? shortPlace(p.address, 3) : '';
    choose(pickup, { ...p, name: near || 'Current location', address: p.address ?? '' }, near ? shortPlace(p.address) : 'Current location', near);
    pickupLabel.textContent = 'Pickup · your location';
  } }, icon('locate'));
  locate.hidden = !appCanLocate;
  const swap = h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'Swap pickup and drop', onclick: () => {
    [pickup.value, drop.value] = [drop.value, pickup.value];
    [pickup.place, drop.place] = [drop.place, pickup.place];
    [pickup.dataset.say, drop.dataset.say] = [drop.dataset.say ?? '', pickup.dataset.say ?? ''];
  } }, icon('swap'));
  const recent = h('div', { class: 'recent-rides' });
  const drawRecent = () => {
    const list = recentRides();
    put(recent, list.length ? [h('h3', { class: 'eyebrow' }, 'Recent trips'), h('ul', {}, list.map((t) => h('li', {},
      h('button', { type: 'button', class: 'recent', onclick: () => {
        for (const [input, side] of [[pickup, t.pickup], [drop, t.drop]]) { input.value = side.value; input.place = side.place; input.dataset.say = side.say ?? side.value; }
        form.requestSubmit();
      } }, icon('clock'), h('span', {}, `${t.pickup.value} → ${t.drop.value}`)))))] : []);
  };
  const form = h('form', { class: 'travel-form cab-form', id: 'ride-compare', onsubmit: async (e) => {
    e.preventDefault();
    hide();
    document.activeElement?.blur?.();
    fareRun++;
    if (!ask) return put(out, h('p', { class: 'error' }, 'Ride compare works in the Britto app.'));
    put(out, h('p', { class: 'muted small' }, 'Finding the places…'));
    const placeOf = async (input) => input.place ?? (await ask({ type: 'places', q: input.value }))?.places?.[0];
    const [p, d] = await Promise.all([placeOf(pickup), placeOf(drop)]);
    if (!p || !d) return put(out, h('p', { class: 'error' }, `${!p ? 'Pickup' : 'Drop'}: no such place found. Try a landmark and the city, or pick one from the list.`));
    const say = (input) => input.dataset.say || input.value;
    const r = rideCompare(p, d, { pickup: say(pickup), drop: say(drop) });
    if (!r.ok) return put(out, h('p', { class: 'error' }, r.reason));
    keepRide({ pickup: { value: pickup.value, place: p, say: say(pickup) }, drop: { value: drop.value, place: d, say: say(drop) } });
    drawRecent();
    const live = h('div', {});
    put(out, h('p', { class: 'trip-line small' }, h('b', {}, 'From '), shortPlace(p.address || p.name, 3), h('br'), h('b', {}, 'To '), shortPlace(d.address || d.name, 3)), live);
    if (!(await liveFares(live, r.links, 'ride', drawRides))) put(live, travelLinks(r.links));
  } },
  h('div', { class: 'trip-card' },
    h('div', { class: 'trip-row' }, h('span', { class: 'dot from' }), h('span', { class: 'trip-field' }, pickupLabel, pickup), locate),
    h('div', { class: 'trip-row' }, h('span', { class: 'dot to' }), h('span', { class: 'trip-field' }, h('small', {}, 'Drop'), drop), swap)),
  status,
  h('button', { type: 'submit', class: 'go' }, 'Compare cabs', icon('arrow')),
  out);
  drawRecent();
  return h('div', {}, form, rideAppsCard(), recent);
}

async function travelPage() {
  put(app, h('p', { class: 'muted' }, 'Loading…'));
  const [data, rides] = await Promise.all([fetch('/airports.json').then((r) => r.json()), fetch('/rides.json').then((r) => r.json())]);
  const airports = airportIndex(data.airports);
  const today = todayIST();
  const max = addDaysISO(today, MAX_DAYS_AHEAD);
  const list = h('datalist', { id: 'airport-list' }, data.airports.map(([iata, name, city, country]) => h('option', { value: `${iata} · ${city || name}` }, country === 'IN' ? name : `${name}, ${country}`)));
  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const out = (id) => h('div', { class: 'travel-out', id, 'aria-live': 'polite' });
  const show = (box, r, extra = null) => put(box, ...(r.ok ? [travelLinks(r.links), extra] : [h('p', { class: 'error' }, r.reason)]));

  // Flights
  const from = h('input', { name: 'from', list: 'airport-list', placeholder: 'DEL · New Delhi', autocomplete: 'off', required: true });
  const to = h('input', { name: 'to', list: 'airport-list', placeholder: 'BOM · Mumbai', autocomplete: 'off', required: true });
  const depart = h('input', { name: 'depart', type: 'date', min: today, max, value: addDaysISO(today, 7), required: true });
  const ret = h('input', { name: 'ret', type: 'date', min: today, max });
  const adults = h('input', { name: 'adults', type: 'number', min: 1, max: 9, value: 1 });
  const cabin = h('select', { name: 'cabin' }, [['economy', 'Economy'], ['premium', 'Premium economy'], ['business', 'Business'], ['first', 'First']].map(([v, t]) => h('option', { value: v }, t)));
  const flightOut = out('flight-links');
  const flights = h('form', { class: 'travel-form', id: 'flights', onsubmit: (e) => {
    e.preventDefault();
    const input = { from: airportCode(from.value), to: airportCode(to.value), depart: depart.value, ret: ret.value || null, adults: Number(adults.value), cabin: cabin.value };
    const r = flightSearch(input, airports);
    fareRun++;
    if (r.ok) document.activeElement?.blur?.();
    const again = (field) => (date) => { field.value = date; flights.requestSubmit(); };
    if (r.ok && inApp && r.q.ret) return roundTrip(r, input);
    if (r.ok && inApp) {
      liveFares(flightOut, r.links, 'flight', (box, sites, st, others) => drawFares(box, sites, st, others, r.q, airports, again(depart), watchFare(r.q)), { date: r.q.depart }).then((live) => { if (!live) show(flightOut, r); });
      return;
    }
    show(flightOut, r, r.ok ? h('p', { class: 'small' }, h('button', { type: 'button', class: 'link', onclick: () => { rideTo.value = from.value; travelTabsShow?.show('cabs'); document.getElementById('rides')?.scrollIntoView(); } }, `Need a ride to ${r.q.from}?`)) : null);
  } },
  h('div', { class: 'fields' }, field('From', from), field('To', to), field('Depart', depart), field('Return (optional)', ret), field('Adults', adults), field('Class', cabin)),
  h('button', { type: 'submit' }, inApp ? 'Compare fares' : 'Show flight searches'), flightOut);

  // A round trip in the app: each way compared as a one-way search (the sites' measured pages),
  // onward first, then the return, and the two cheapest added up. The sites' own round-trip
  // fares (sometimes cheaper together) open from the links below; they are not read.
  function roundTrip(r, input) {
    const onward = flightSearch({ ...input, ret: null }, airports);
    const back = flightSearch({ ...input, from: input.to, to: input.from, depart: input.ret, ret: null }, airports);
    if (!onward.ok || !back.ok) return show(flightOut, r);
    const total = h('div', { class: 'trip-total', id: 'trip-total' });
    const onBox = h('div', { id: 'trip-onward' });
    const backBox = h('div', { id: 'trip-return' }, h('p', { class: 'muted small' }, 'Compared after the onward flights.'));
    put(flightOut, total,
      h('h3', {}, `Onward: ${onward.q.from} \u2192 ${onward.q.to}, ${dayName(onward.q.depart)}`), onBox,
      h('h3', {}, `Return: ${back.q.from} \u2192 ${back.q.to}, ${dayName(back.q.depart)}`), backBox,
      h('h3', {}, 'Round-trip fares on the sites'),
      h('p', { class: 'small muted' }, 'Some sites price a round trip below two one-way tickets. Britto does not read those pages yet: open them here.'),
      travelLinks(r.links));
    let onFlights = null;
    const drawOn = (box, sites, st, others) => drawFares(box, sites, st, others, onward.q, airports, (d) => { depart.value = d; flights.requestSubmit(); }, watchFare(onward.q));
    const drawBack = (box, sites, st, others) => drawFares(box, sites, st, others, back.q, airports, (d) => { ret.value = d; flights.requestSubmit(); }, watchFare(back.q));
    const sum = (backFlights) => {
      const t = tripTotal(onFlights, backFlights);
      put(total, t
        ? h('div', { class: 'fare-best' },
          h('span', { class: 'small muted' }, 'Cheapest round trip found, as two one-way tickets'),
          h('strong', {}, rupees(t.total)),
          h('span', { class: 'small' }, `Onward ${rupees(t.onward.best)} on ${t.onward.offers[0].name} (${t.onward.airline} ${t.onward.depart}) + return ${rupees(t.back.best)} on ${t.back.offers[0].name} (${t.back.airline} ${t.back.depart})`))
        : h('p', { class: 'muted small' }, 'No fare was found for one of the two ways.'));
    };
    const startBack = (readOn) => {
      onFlights = groupFlights(readOn);
      liveFares(backBox, back.links, 'flight', drawBack, { date: back.q.depart, onDone: (readBack) => sum(groupFlights(readBack)) })
        .then((live) => { if (!live) put(backBox, travelLinks(back.links)); });
    };
    liveFares(onBox, onward.links, 'flight', drawOn, { date: onward.q.depart, onDone: startBack })
      .then((live) => { if (!live) show(flightOut, r); });
  }

  // Flight price alerts, kept on this phone (android FareWatches, FareAlertJob): a one-way route
  // and day, compared again on the phone every few hours. Britto's server never sees the route.
  const watchList = h('div', { id: 'fare-watches' });
  const watchFare = (q) => (read, best) => siteBridge()?.({
    type: 'watchFare', from: q.from, to: q.to, date: q.depart, cheapest: best.best, site: best.offers[0].name,
    sites: read.map(({ id, name, url, recipe }) => ({ id, name, url, recipe, date: q.depart })),
  }).then((r) => { loadWatches(); return r; });
  async function loadWatches() {
    const r = inApp ? await siteBridge()?.({ type: 'fareWatches' }) : null;
    if (!r?.ok) return put(watchList);
    put(watchList, h('h3', {}, 'Fare alerts'), r.watches.length
      ? h('ul', { class: 'fare-sites fare-watches' }, r.watches.map((w) => h('li', { 'data-watch': w.id },
        h('span', { class: 'fare-site' }, `${w.from} \u2192 ${w.to}`),
        h('span', { class: 'small' }, `${dayName(w.date)} \u00b7 lowest seen ${rupees(w.low)} on ${w.lowSite}`,
          h('br'), h('small', { class: 'muted' }, `checked ${ago(w.checkedAt)}: ${rupees(w.last)} on ${w.lastSite}`)),
        h('span', { class: 'watch-actions' },
          h('button', { type: 'button', class: 'button secondary small', onclick: () => {
            from.value = w.from; to.value = w.to; depart.value = w.date; ret.value = '';
            flights.requestSubmit();
            flights.scrollIntoView();
          } }, 'Compare now'),
          h('button', { type: 'button', class: 'button secondary small', onclick: async () => { await siteBridge()?.({ type: 'unwatchFare', id: w.id }); loadWatches(); } }, 'Stop')))))
      : h('p', { class: 'small muted' }, 'No fare alerts yet. Compare a one-way flight, then tap \u201cAlert me if it gets cheaper\u201d.'));
  }

  // Hotels
  const city = h('input', { name: 'city', placeholder: 'Goa', autocomplete: 'off', required: true });
  const checkIn = h('input', { name: 'checkIn', type: 'date', min: today, max, value: addDaysISO(today, 7), required: true });
  const checkOut = h('input', { name: 'checkOut', type: 'date', min: today, max, value: addDaysISO(today, 9), required: true });
  const guests = h('input', { name: 'guests', type: 'number', min: 1, max: 8, value: 2 });
  const hotelOut = out('hotel-links');
  const hotels = h('form', { class: 'travel-form', id: 'hotels', onsubmit: (e) => {
    e.preventDefault();
    const r = hotelSearch({ city: city.value, checkIn: checkIn.value, checkOut: checkOut.value, adults: Number(guests.value) });
    fareRun++;
    if (r.ok) document.activeElement?.blur?.();
    if (r.ok && inApp) {
      liveFares(hotelOut, r.links, 'hotel', (box, sites, st, others) => drawHotels(box, sites, st, others, r.q)).then((live) => { if (!live) show(hotelOut, r); });
      return;
    }
    show(hotelOut, r);
  } },
  h('div', { class: 'fields' }, field('City', city), field('Check-in', checkIn), field('Check-out', checkOut), field('Guests (one room)', guests)),
  h('button', { type: 'submit' }, inApp ? 'Compare hotels' : 'Show hotel searches'), hotelOut);

  // Ride compare (app only): places from the phone's own place search (or its location, when the
  // shopper taps for it), fares read from each ride app's own page on this phone.
  const rideCmp = inApp ? cabCompare() : null;

  // Rides to the airport: the shopper's location goes into the Uber link only, never to Britto.
  const rideTo = h('input', { name: 'rideTo', list: 'airport-list', placeholder: 'DEL · New Delhi', autocomplete: 'off', required: true });
  const rideOut = out('ride-links');
  const ridesForm = h('form', { class: 'travel-form', id: 'rides', onsubmit: (e) => {
    e.preventDefault();
    const code = airportCode(rideTo.value);
    if (!airports.has(code)) return show(rideOut, rideSearch({ to: code }, airports, rides.uber));
    // In the app the phone's location comes from Android (asked when tapped), never from Britto.
    if (inApp) {
      const ask = siteBridge();
      if (!ask || !appCanLocate) return put(rideOut, h('p', { class: 'notice' }, `This copy of the Britto app cannot read your location, so ride links work in your phone\u2019s browser: open ${location.host}/travel there.`));
      put(rideOut, h('p', { class: 'muted small' }, 'Finding where you are…'));
      askHere(ask).then((r) => (r?.ok
        ? show(rideOut, rideSearch({ to: code, pickup: { lat: r.place.lat, lng: r.place.lng } }, airports, rides.uber))
        : put(rideOut, h('p', { class: 'error' }, r?.reason === 'denied' ? 'Location was not allowed, so no ride link can start from where you are.' : r?.reason === 'off' ? 'Location is off on this phone. Turn it on and try again.' : 'The phone could not find where you are just now.'))));
      return;
    }
    if (!navigator.geolocation) return put(rideOut, h('p', { class: 'error' }, 'This browser cannot share your location.'));
    put(rideOut, h('p', { class: 'muted small' }, 'Asking for your location…'));
    navigator.geolocation.getCurrentPosition(
      (pos) => show(rideOut, rideSearch({ to: code, pickup: { lat: pos.coords.latitude, lng: pos.coords.longitude } }, airports, rides.uber)),
      () => put(rideOut, h('p', { class: 'error' }, 'Location not shared, so no ride link can start from where you are.')),
      { timeout: 15_000, maximumAge: 300_000 });
  } },
  h('div', { class: 'fields' }, field('Airport', rideTo)),
  h('p', { class: 'small muted' }, 'Your location goes only into the ride link, on this device. Britto never receives it.'),
  h('button', { type: 'submit' }, 'Use my location'), rideOut);

  const panels = {
    cabs: h('section', { class: 'tab-panel', id: 'panel-cabs', role: 'tabpanel', 'aria-labelledby': 'tab-cabs' },
      rideCmp,
      h('h2', {}, 'Ride to the airport'), ridesForm),
    flights: h('section', { class: 'tab-panel', id: 'panel-flights', role: 'tabpanel', 'aria-labelledby': 'tab-flights' }, flights, watchList),
    hotels: h('section', { class: 'tab-panel', id: 'panel-hotels', role: 'tabpanel', 'aria-labelledby': 'tab-hotels' }, hotels),
  };
  travelTabsShow = tabs(panels, [['cabs', 'Cabs', 'car'], ['flights', 'Flights', 'plane'], ['hotels', 'Hotels', 'hotel']], inApp ? 'cabs' : 'flights');
  put(app, h('header', { class: 'page-head' }, h('h1', {}, 'Travel'), travelTabsShow.bar),
    h('p', { class: 'muted travel-lede' }, inApp
      ? 'Enter your trip once. Britto opens each app’s own page on this phone, reads the prices it shows and lists them side by side. Britto’s server never sees your trip, and nothing is booked.'
      : 'Enter your trip once and open the same search on each site. In the Britto Android app, Britto also reads the fares each site shows and compares them for you.'),
    list, panels.cabs, panels.flights, panels.hotels);
  loadWatches();
  // "Compare now" on a Tracker fare alert: its route and day, compared straight away.
  const asked = new URLSearchParams(location.search);
  if (asked.get('from') && asked.get('to') && asked.get('date')) {
    from.value = asked.get('from'); to.value = asked.get('to'); depart.value = asked.get('date'); ret.value = '';
    travelTabsShow.show('flights', false);
    flights.requestSubmit();
  }
}

/**
 * Where today's price sits between the lowest and highest Britto has seen (design v5): readable
 * at a glance, before the chart. Only with a real range and a price today. The dot is placed
 * through CSSOM (the page's CSP refuses inline style attributes).
 */
function priceScale(s) {
  if (!s.lowest || !s.highest || s.current == null || s.inStock === false || s.highest.price <= s.lowest.price) return null;
  const at = Math.max(0, Math.min(1, (s.current - s.lowest.price) / (s.highest.price - s.lowest.price)));
  const dot = h('span', { class: 'scale-dot' });
  dot.style.left = `${(at * 100).toFixed(1)}%`;
  return h('div', { class: 'price-scale', role: 'img', 'aria-label': `Today ${rupees(s.current)}, between the lowest ${rupees(s.lowest.price)} and the highest ${rupees(s.highest.price)} seen` },
    h('div', { class: 'scale-bar' }, dot),
    h('div', { class: 'scale-labels', 'aria-hidden': 'true' }, h('span', {}, `Lowest ${rupees(s.lowest.price)}`), h('span', {}, `Today ${rupees(s.current)}`), h('span', {}, `Highest ${rupees(s.highest.price)}`)));
}

function stat(label, value, note) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value, note ? h('small', {}, note) : null));
}

function keyToLink(key) {
  const [store, pid] = key.split(':');
  if (store === 'amazon') return `https://www.amazon.in/dp/${pid}`;
  if (store === 'myntra') return `https://www.myntra.com/${pid}`;
  if (store === 'reliancedigital') return `https://www.reliancedigital.in/product/${pid}`;
  if (store === 'flipkart') {
    const [itm, p] = pid.split('.');
    return `https://www.flipkart.com/p/${itm}${p ? `?pid=${p}` : ''}`;
  }
  return null;
}

const STATUS_NOTE = {
  busy: 'You have used this hour’s store searches from your network. Tracked products are still shown, and the store buttons below always work.',
  blocked: 'Amazon did not show our search its results just now. Use the store buttons below.',
  failed: 'Amazon did not answer our search just now. Try again in a minute, or use the store buttons below.',
};

/** A store's heading on the search page: who, how its prices were read, and its own search. */
function storeHead(name, how, url) {
  return h('div', { class: 'store-head' }, h('span', { class: 'store-mono' }, monogram(name)),
    h('div', { class: 'store-who' }, h('b', {}, name), h('span', {}, how)),
    url ? h('a', { href: url, rel: 'noopener', target: inApp ? null : '_blank' }, 'Open') : null);
}

const SEARCH_FILTERS = [
  ['all', 'All stores', () => true],
  ['history', 'Has price history', (c) => c.dataset.history === '1'],
  ['under', 'Under \u20b91,000', (c) => Number(c.dataset.price) > 0 && Number(c.dataset.price) < 100_000],
];
let searchFilter = 'all';
/** Hides what the chosen chip leaves out, and a store left with nothing to show. Run after every draw. */
function applySearchFilter() {
  const keep = SEARCH_FILTERS.find(([id]) => id === searchFilter)?.[2] ?? (() => true);
  document.querySelectorAll('[data-price]').forEach((c) => { c.hidden = !keep(c); });
  document.querySelectorAll('.filterable').forEach((sec) => {
    if (sec.dataset.state && sec.dataset.state !== 'done') return;
    const cards = [...sec.querySelectorAll('[data-price]')];
    sec.hidden = searchFilter !== 'all' && !cards.some((c) => !c.hidden);
  });
}

async function searchPage(q) {
  const box = document.querySelector('#search-form input');
  if (box && box !== document.activeElement) box.value = q;
  searchFilter = 'all';
  const tracked = h('section', { id: 'tracked', class: 'filterable' });
  const live = h('section', { id: 'live', class: 'filterable' }, storeHead('Amazon.in', 'Reading its search\u2026'), h('div', { class: 'grid skeleton' }, Array.from({ length: 2 }, () => h('div', { class: 'card ghost' }))));
  const others = h('section', { id: 'others' });
  // In the app (0.8.0+), the other stores' own searches, read on the phone: not waiting for (or
  // depending on) the server's Amazon search below.
  const more = h('section', { id: 'other-stores' });
  const chips = h('div', { class: 'chips filter-chips', role: 'group', 'aria-label': 'Show' }, SEARCH_FILTERS.map(([id, label]) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(id === searchFilter), 'data-filter': id,
    onclick: () => { searchFilter = id; chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === id))); applySearchFilter(); },
  }, label)));
  // From Lens: say where the words came from, and that the box above can change them.
  const photo = new URLSearchParams(location.search).get('photo');
  const fromPhoto = photo === 'read' || photo === 'guess' ? h('p', { class: 'notice photo-note' }, photo === 'read'
    // The model's own "sure" is not proof (live, 2026-11-07, it was sure of "bella" on a Cello pack).
    ? `From your photo, Britto\u2019s AI read \u201c${q}\u201d. It can misread a name:` : `From your photo, Britto\u2019s AI guessed \u201c${q}\u201d from how it looks:`, ' if this is not it, change the words in the box above.') : null;
  put(app, h('h1', { class: 'search-title' }, `Results for \u201c${q}\u201d`), fromPhoto, chips, tracked, live, more, others);
  if (inApp && appCanShop() && siteBridge()) otherStoresSearch(more, q);
  searchProducts(q).then(({ results }) => {
    if (results.length) {
      put(tracked, storeHead('Britto', 'Products Britto already watches'), row(results, ''));
      tracked.querySelectorAll('.card').forEach((c, i) => { c.dataset.history = '1'; c.dataset.price = String(results[i].price ?? 0); });
      applySearchFilter();
    }
  }).catch(() => {});
  let res;
  try {
    res = await storeSearch(q);
  } catch (e) {
    put(live, h('p', { class: 'error' }, e.message));
    return;
  }
  const known = new Map(res.tracked.map((c) => [c.key, c]));
  for (const s of res.stores) {
    const open = res.links.find((l) => l.store === s.store)?.url;
    put(live, storeHead(s.name, s.status === 'listed' ? `Read by Britto \u00b7 ${ago(s.at)}` : 'Not read just now', open),
      s.status === 'listed'
        ? [s.items.length ? h('div', { class: inApp ? 'row' : 'grid' }, s.items.map((i) => listedCard(i, known))) : h('p', { class: 'muted' }, `${s.name} found nothing for that.`),
          h('p', { class: 'section-note below' }, 'Prices as its search page showed them; the product\u2019s own page can differ. Tap one to see its price history: Britto starts watching it then.')]
        : h('p', { class: 'notice' }, STATUS_NOTE[s.status]));
  }
  if (!res.stores.length) put(live);
  applySearchFilter();
  put(others, h('div', { class: 'section-head' }, h('h2', {}, inApp ? 'Open a store yourself' : 'Search other stores')),
    h('p', { class: 'section-note' }, inApp ? 'Opens the store inside Britto: its product pages show their price history.' : 'Opens the store\u2019s own search. With the Britto extension or app, its product pages show their price history.'),
    storeButtons(res.links.filter((l) => l.store !== 'amazon' || !res.stores.some((s) => s.store === 'amazon' && s.status === 'listed'))));
}

/** A tiny step line of a deal's last 90 days, so the drop can be checked by eye. */
function sparkline(points) {
  const priced = (points ?? []).filter((p) => p.price != null);
  if (priced.length < 2) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const t0 = priced[0].at, t1 = priced[priced.length - 1].at;
  const lo = Math.min(...priced.map((p) => p.price)), hi = Math.max(...priced.map((p) => p.price));
  const x = (t) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * 100);
  const y = (p) => (hi === lo ? 12 : 22 - ((p - lo) / (hi - lo)) * 20);
  let d = '';
  priced.forEach((p, i) => { d += i === 0 ? `M${x(p.at)},${y(p.price)}` : `H${x(p.at)}V${y(p.price)}`; });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 24');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** A confirmed real drop: its photo, how far below the usual price, and its last 90 days. */
function dealCard(c) {
  return h('a', { class: 'card wide', href: `/p/${encodeURIComponent(c.key)}`, 'data-nav': true },
    h('div', { class: 'thumb' }, c.image ? h('img', { src: thumbUrl(c.image), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null),
    h('div', { class: 'card-body' },
      h('span', { class: 'badge solid' }, `${pct(c.realPct)} below usual`),
      h('span', { class: 'title' }, c.title),
      h('span', { class: 'deal-line' },
        h('span', { class: 'price-line' }, h('b', { class: 'price' }, rupees(c.price)), c.usualPrice ? h('span', { class: 'small muted' }, `usual ${rupees(c.usualPrice)}`) : null),
        sparkline(c.spark))));
}

async function dealsPage() {
  const params = new URLSearchParams(location.search);
  const filter = { store: params.get('store') ?? '', min: Number(params.get('min')) || 0 };
  const head = h('header', { class: 'page-head' }, h('h1', {}, 'Real drops'),
    h('p', {}, 'Cheaper than the product ', h('b', {}, 'usually'), ' costs on its own store, never measured against its M.R.P.'));
  put(app, head, h('p', { class: 'muted page-wait' }, 'Loading\u2026'));
  const [d, p, dr] = await Promise.all([getDeals(filter), getPopular(), getDrops(filter.store || undefined)]);
  const chip = (label, next, on) => {
    const q = new URLSearchParams(Object.entries({ ...filter, ...next }).filter(([, v]) => v)).toString();
    return h('a', { class: `chip${on ? ' on' : ''}`, href: `/deals${q ? `?${q}` : ''}`, 'data-nav': true, 'aria-current': on ? 'true' : null }, label);
  };
  // "10% or more" means the same on both lists: below the usual price here, below the last reading there.
  const drops = dr.results.filter((c) => !filter.min || (c.drop && ((c.drop.from - c.price) / c.drop.from) * 100 >= filter.min));
  put(app, head,
    h('div', { class: 'chips filter-band', role: 'group', 'aria-label': 'Filter' },
      chip('All stores', { store: '', min: 0 }, !filter.store && !filter.min),
      chip('10% or more', { min: filter.min === 10 ? 0 : 10 }, filter.min === 10),
      chip('30% or more', { min: filter.min === 30 ? 0 : 30 }, filter.min === 30),
      chip('Amazon.in', { store: filter.store === 'amazon' ? '' : 'amazon' }, filter.store === 'amazon')),
    h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Below their usual price')),
      d.results.length ? h('div', { class: 'deal-list' }, d.results.map(dealCard)) : null,
      h('p', { class: d.results.length ? 'section-note below' : 'muted' }, d.results.length
        ? 'A product needs a week of prices before Britto knows what it usually costs, so this list grows as Britto watches more products.'
        : 'No confirmed drops for this filter yet. A drop is only confirmed after a week of watching a product.')),
    h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Cheaper than at the last check')),
      h('p', { class: 'section-note' }, 'Too new to know the usual price, but cheaper now than Britto\u2019s reading before.'),
      grid(drops, 'None in the last two weeks yet.')),
    h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Most viewed')), grid(p.results, 'Nothing yet.')));
}

async function storesPage() {
  const { stores } = await getStores();
  const label = { yes: 'Our server reads it', refused: 'Refuses our server', no_answer: 'Does not answer our server', untested: 'Not tested yet' };
  put(app, h('h1', {}, 'Stores'),
    h('p', { class: 'muted' }, 'Our server identifies itself honestly and never works around a store’s bot defences. Stores that refuse it are read by the browser extension, from pages you are already viewing.'),
    h('table', { class: 'stores' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Store'), h('th', {}, 'Server'), h('th', {}, 'What we measured'))),
      h('tbody', {}, stores.map((s) => h('tr', {}, h('td', {}, s.name), h('td', {}, label[s.serverFetch]), h('td', { class: 'small' }, s.measured))))));
}

/** The Android app's download page. Its facts (version, size, fingerprint) come from
 * /download/britto.json, written by scripts/publish-apk.mjs from the APK itself. */
async function appPage() {
  put(app, h('h1', {}, 'Britto for Android'), h('p', { class: 'muted' }, 'Loading…'));
  let info = null;
  try { info = await (await fetch('/download/britto.json', { cache: 'no-cache' })).json(); } catch { /* no APK published */ }
  const feature = (title, text) => h('li', {}, h('b', {}, title), ' ', text);
  put(app,
    h('h1', {}, 'Britto for Android'),
    h('p', { class: 'lede-dark' }, 'Shop on Amazon, Flipkart, Myntra and more inside Britto: every product page shows its price history and whether the sale is real.'),
    inApp ? h('div', {}, h('p', { class: 'notice' }, `You are using the app${info ? `; the newest version is ${info.version}` : ''}.`),
      h('button', { type: 'button', class: 'button', id: 'share-app', onclick: async () => {
        const r = await siteBridge()?.({ type: 'shareApp', text: `Britto: price history, real discounts, and flight, hotel and ride prices compared. Get the Android app: ${location.origin}/app` });
        if (!r?.ok) location.href = `https://wa.me/?text=${encodeURIComponent(`Britto for Android: ${location.origin}/app`)}`;
      } }, 'Send Britto to a friend'))
      : info ? h('div', { class: 'download' },
        h('a', { class: 'button warn big', href: '/download/britto.apk', download: 'Britto.apk' }, `Download Britto ${info.version} (${Math.round(info.bytes / 1024)} KB)`),
        h('p', { class: 'muted small' }, `Android 10 or newer. Built ${date(info.builtAt)}. SHA-256 ${info.sha256}`))
        : h('p', { class: 'notice' }, 'The app is not published here yet.'),
    h('h2', {}, 'What it does'),
    h('ul', { class: 'features' },
      feature('Super Browse.', 'Open a store from Shop, log in with your own number as you would in its app, and every product page shows Britto’s price panel. You log in on the store’s own page: Britto keeps no password and no login of yours.'),
      feature('Search.', 'Search Amazon from Britto, or open the same search on Flipkart, Myntra and the rest.'),
      feature('Price alerts.', 'Set an alert on any product: the app shows it as a notification (it checks every 15 minutes, and when you open it). In Chrome on a laptop, alerts arrive as browser notifications.'),
      feature('Share to Britto.', 'In any store’s app, tap Share on a product and choose Britto to see its history.'),
      feature('Rides, flights and hotels.', 'Uber and Rapido rides, flights on MakeMyTrip, ixigo, Goibibo and EaseMyTrip, hotels on Booking.com and Cleartrip: compared on your phone, with your own logins.'),
      feature('Spend Lens.', 'What you spent across stores, from your own order pages, worked out on your phone and never uploaded.')),
    inApp ? null : h('div', {},
      h('h2', {}, 'Installing'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Tap Download. Chrome may warn that this type of file can harm your device: Britto is not on the Play Store yet, so it says that for every app from outside it.'),
        h('li', {}, 'Open the downloaded Britto.apk. Android asks once to allow installs from Chrome: allow it, go back, and tap Install.'),
        h('li', {}, 'Later versions install over this one and keep your alerts.')),
      h('p', { class: 'muted small' }, 'iPhone: there is no iPhone app. Use this website in Safari, and Add to Home Screen.')));
}

/** Inside the Britto Android app (it adds "BrittoApp/<version>" to its WebView's User-Agent). */
const inApp = /\bBrittoApp\//.test(navigator.userAgent);
/** The app's version from its User-Agent ("BrittoApp/0.7.0"), as [major, minor], or null. */
const appVersion = (() => { const m = /\bBrittoApp\/(\d+)\.(\d+)/.exec(navigator.userAgent); return m ? [Number(m[1]), Number(m[2])] : null; })();
/** App 0.7.0 and later can hand the page the phone's location (the "here" message). */
const appCanLocate = !!appVersion && (appVersion[0] > 0 || appVersion[1] >= 7);
/** Asks the app for the phone's location; an app that never answers counts as "none" after 90 s. */
const askHere = (ask) => Promise.race([ask({ type: 'here' }), new Promise((r) => setTimeout(() => r({ ok: false, reason: 'none' }), 90_000))]);

/**
 * Super Browse (BLUEPRINT §18): every store Britto knows, opened in the app's in-app browser,
 * where Britto reads the page you are looking at. In a normal browser the tiles just open the
 * store (the extension reads it there).
 */
const SECTORS = [['shop', 'More stores'], ['ride', 'Rides'], ['flight', 'Flights'], ['hotel', 'Hotels']];
/** The design uses letter badges, not store logos: "Amazon.in" -> "A", "Reliance Digital" -> "RD". */
const monogram = (name) => name.replace(/\.\w+$/, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

async function browsePage() {
  const { stores, services = [] } = await getStores();
  // One service per sector (core/services.ts): in the app it opens inside Britto, so the shopper
  // logs in once on the service's own page; that login stays in the app on their phone.
  const sectionFor = ([sector, title]) => {
    const list = services.filter((s) => s.sector === sector);
    return list.length ? [h('h2', {}, title), h('div', { class: 'store-grid' }, list.map((s) => h('a', { class: 'store-tile', href: s.home, rel: 'noopener', 'data-service': s.id, 'data-mono': monogram(s.name) },
      h('span', { class: 'store-name' }, s.name),
      h('span', { class: 'small muted' }, sector === 'shop' ? (inApp ? 'Its prices are compared on product pages' : `Opens ${s.name}.`)
        : inApp ? `Log in with your number on ${s.name}\u2019s own page; it stays on this phone.` : `Opens ${s.name}.`))))] : [];
  };
  put(app, h('h1', {}, 'Super Browse'),
    h('p', { class: 'muted' }, inApp
      ? 'Open a store and shop as usual. On every product page Britto shows its price history and reads the price from the page you are looking at.'
      : 'Open a store and shop as usual. With the Britto extension (or the Britto Android app) you see the price history on every product page.'),
    h('h2', {}, 'Shopping'),
    h('div', { class: 'store-grid' }, stores.map((s) => h('a', { class: 'store-tile', href: s.home, rel: 'noopener', 'data-store': s.id, 'data-mono': monogram(s.name) },
      h('span', { class: 'store-name' }, s.name),
      h('span', { class: 'small muted' }, s.serverFetch === 'yes' ? 'Prices also checked by our server' : 'Prices from shoppers\u2019 own pages')))),
    ...SECTORS.flatMap(sectionFor),
    h('p', { class: 'small muted' }, inApp
      ? 'Britto never sees your number, the code or your login: they stay in this app\u2019s browser on your phone.'
      : 'In the Britto Android app these open inside the app, where you log in once with your number.'),
    h('p', {}, h('a', { href: '/spend', 'data-nav': true }, 'Spend Lens'), ': what you spent across stores, from your own order pages, worked out on your phone.'));
}

/**
 * The app's bridge on the Britto site (MainActivity, this origin only): Spend Lens orders kept on
 * this phone. Absent in a browser, in which case Spend Lens says where it works.
 */
/**
 * Inside the app: hand it this browser's alert token, so it can show the alerts as phone
 * notifications (it asks the server which fired; android AlertJob). -> { watching, notifications } | null
 */
async function appWatchesAlerts() {
  const ask = inApp ? siteBridge() : null;
  const token = deviceToken();
  if (!ask || !token) return null;
  try {
    await ask({ type: 'watchAlerts', token });
    return await ask({ type: 'alertStatus' });
  } catch { return null; }
}

// ONE sender for the whole page: the bridge has a single onmessage, so a second sender with its
// own numbering would take the first one's replies (a running fare compare would hang).
let bridgeAsk = null;
function siteBridge() {
  const bridge = window.BrittoBridge;
  if (!bridge) return null;
  if (bridgeAsk) return bridgeAsk;
  const pending = new Map();
  let seq = 0;
  bridge.onmessage = (event) => {
    const { id, reply } = JSON.parse(event.data);
    pending.get(id)?.(reply);
    pending.delete(id);
  };
  bridgeAsk = (msg) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    bridge.postMessage(JSON.stringify({ id, msg }));
  });
  return bridgeAsk;
}

/**
 * Spend Lens (BLUEPRINT §13): what you spent, from your own order pages, summed HERE from the
 * orders the app keeps on this phone. Nothing about your orders is sent to Britto (rule 5): this
 * page makes no request with them.
 */
async function spendPage() {
  const ask = siteBridge();
  const intro = h('p', { class: 'muted' }, 'Your spending across stores, from your own order pages. It is worked out on this phone; your orders are never uploaded to Britto.');
  if (!ask) {
    put(app, h('h1', {}, 'Spend Lens'), intro,
      h('p', {}, 'Spend Lens works in the Britto Android app: open a store from Shop, log in, and open your orders page. Britto keeps the orders it reads there on your phone, and this page adds them up.'));
    return;
  }
  const reply = await ask({ type: 'getSpend' });
  const orders = mergeOrders([], (reply?.orders ?? []).filter((o) => o && typeof o.total === 'number'));
  const s = summarize(orders);
  const table = (rows, label) => h('table', { class: 'spend' },
    h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, label(r)), h('td', { class: 'num' }, rupees(r.total)), h('td', { class: 'num small muted' }, `${r.orders} order${r.orders === 1 ? '' : 's'}`)))));
  const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const clear = h('button', { class: 'secondary', type: 'button' }, 'Delete Spend Lens data from this phone');
  clear.addEventListener('click', async () => { await ask({ type: 'clearSpend' }); spendPage(); });
  put(app, h('h1', {}, 'Spend Lens'), intro,
    ...(s.orders === 0
      ? [h('p', {}, 'No orders kept yet. Open a store from Shop, log in, and open your orders page: Britto reads the orders shown there (for stores whose order page it has learned).')]
      : [
          h('p', { class: 'spend-total' }, h('strong', {}, rupees(s.total)), ` on ${s.orders} order${s.orders === 1 ? '' : 's'}, ${date(Date.parse(s.first))} to ${date(Date.parse(s.last))}`),
          h('h2', {}, 'By month'), table(s.byMonth, (r) => monthName(r.month)),
          h('h2', {}, 'By store'), table(s.byStore, (r) => STORE_NAMES[r.store] ?? r.store),
          clear,
        ]));
}

/**
 * Grocery compare (BLUEPRINT §12): what works today, said plainly. Every grocery platform refuses
 * our server, so prices come from the shopper's own phone (the Britto app), and a comparison is
 * valid for one delivery address only.
 */
async function groceryPage() {
  const { platforms } = await getGroceryPlatforms();
  put(app, h('h1', {}, 'Grocery compare'),
    h('p', { class: 'muted' }, 'Grocery prices and stock depend on your delivery address and change by the hour, so Britto compares them only for one address at a time, says which, and puts the price per 100 g, 100 ml or piece beside each pack.'),
    h('p', { class: 'notice' }, 'Not working yet. Every grocery app below refuses our server, so prices will come from the Britto app on your phone, from the pages you open. Britto does not read any of them yet: each one needs a page saved from a phone first, so Britto can learn to read it.'),
    h('table', { class: 'stores' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Platform'), h('th', {}, 'What we measured'))),
      h('tbody', {}, platforms.map((p) => h('tr', {}, h('td', {}, p.name), h('td', { class: 'small' }, p.measured))))));
}

// ------------------------------------------------------------------ alerts

let configPromise = null;
/** The site's alert channels, fetched once. null if the request fails. */
function config() {
  configPromise ??= getConfig().catch(() => null);
  return configPromise;
}

function botLink(bot) {
  return h('a', { href: `https://t.me/${bot}`, target: '_blank', rel: 'noopener' }, `@${bot}`);
}

/** The price-alert box on a product page. */
function alertBox(view) {
  const s = view.stats;
  const priced = s.current != null && s.inStock !== false;
  const box = h('section', { class: 'alert-box p-card', id: 'alert' }, h('h2', {}, 'Price alert'));
  const mine = h('ul', { class: 'my-alerts' });
  const status = h('p', { class: 'form-status', role: 'status' });
  const channels = h('div', { class: 'channels' });

  const suggested = priced ? Math.floor((s.current * 95) / 100 / 100) * 100 : null;
  const target = h('input', { id: 'alert-target', name: 'target', inputmode: 'decimal', autocomplete: 'off', value: suggested ? String(suggested / 100) : '', size: 8 });
  const option = (value, label, checked) => h('label', { class: 'seg-opt' }, h('input', { type: 'radio', name: 'kind', value, checked }), h('span', {}, label));
  const targetLabel = h('label', { class: 'target-label', for: 'alert-target' }, 'Tell me when it is at or below');
  const targetBox = h('span', { class: 'target-box' }, h('b', {}, '\u20b9'), target);
  const syncTarget = () => { const below = new FormData(form).get('kind') === 'below'; targetLabel.hidden = !below; targetBox.hidden = !below; };
  const form = h('form', { class: 'alert-form', onchange: syncTarget, onsubmit: async (e) => {
    e.preventDefault();
    const kind = new FormData(form).get('kind');
    let rule;
    if (kind === 'below') {
      const paise = toPaise(target.value);
      if (paise == null) { status.textContent = 'Type a price in rupees, like 249 or 249.50.'; return; }
      rule = { kind: 'below', target: paise };
    } else if (kind === 'drop') rule = { kind: 'drop', pct: 1 };
    else rule = { kind: 'in_stock' };
    status.textContent = 'Saving…';
    try {
      const { alert, me } = await setAlert(view.key, rule);
      status.textContent = `Alert set: ${alert.description}.`;
      show(me);
    } catch (err) {
      status.textContent = err.message;
    }
  } },
    h('div', { class: 'seg-radio', role: 'radiogroup', 'aria-label': 'Tell me when' },
      priced ? option('drop', 'Any drop', false) : null,
      priced ? option('below', 'Below a price', true) : null,
      option('in_stock', s.current == null && s.inStock !== false ? 'First price' : 'Back in stock', !priced)),
    targetLabel,
    h('div', { class: 'target-row' }, targetBox, h('button', { type: 'submit' }, 'Set alert')));
  syncTarget();

  function show(me) {
    const here = (me?.alerts ?? []).filter((a) => a.key === view.key);
    put(mine, ...here.map((a) => h('li', {},
      h('span', {}, `${a.description}`, a.lastFiredAt ? h('span', { class: 'muted small' }, ` · sent ${date(a.lastFiredAt)}`) : null),
      h('button', { type: 'button', class: 'link', onclick: async () => {
        try { show((await removeAlert(a.id)).me); status.textContent = 'Alert removed.'; } catch (err) { status.textContent = err.message; }
      } }, 'Remove'))));
    if (here.length) (inApp ? appAlertHint(channels) : channelHint(channels, me));
  }
  box.append(mine, form, status,
    h('p', { class: 'tip-line' }, `${view.store.serverFetch === 'yes' ? 'Britto re-checks the price every few hours' : 'Britto sees a new price when someone opens this page in the app or extension'}. No account, no password.`),
    channels);
  getMe().then(show).catch(() => {});
  return box;
}

/** Inside the app, alerts reach the phone as the app's own notifications (android AlertJob). */
async function appAlertHint(host) {
  const st = await appWatchesAlerts();
  put(host, st?.notifications
    ? h('p', { class: 'small ok' }, 'Phone notifications are on: the app checks your alerts every 15 minutes and whenever you open it.')
    : h('p', { class: 'small' }, st ? 'Allow notifications for Britto in your phone’s settings, and the app will tell you when an alert fires.' : 'This version of the app cannot show notifications: update it from the Get the app page.'));
}

/** "Where should we tell you?": Telegram and this browser's notifications. */
async function channelHint(host, me) {
  const cfg = await config();
  if (!cfg) return;
  const parts = [];
  if (!me.telegram && !me.push) parts.push(h('p', { class: 'small' }, 'Alerts show on this page. To hear about them anywhere, connect one of these:'));
  const row = h('div', { class: 'channel-row' });
  if (cfg.telegram) row.append(me.telegram ? h('span', { class: 'ok' }, 'Telegram connected ✓') : telegramButton(host));
  if (cfg.push) row.append(await pushControl(cfg, me, () => getMe().then((m) => m && channelHint(host, m))));
  if (!cfg.telegram && !cfg.push) parts.push(h('p', { class: 'small muted' }, 'Alert messages are not switched on for this site yet. Your alert is saved and shows here.'));
  put(host, ...parts, row);
}

function telegramButton(host) {
  const msg = h('span', { class: 'small' });
  const btn = h('button', { type: 'button', onclick: async () => {
    btn.disabled = true;
    msg.textContent = 'Getting a link…';
    try {
      const { url } = await connectTelegram();
      // A second, real link: browsers block windows opened after a network wait.
      btn.replaceWith(h('a', { class: 'button', href: url, target: '_blank', rel: 'noopener', id: 'tg-open' }, 'Open Telegram and press Start'));
      msg.textContent = ' The link works once, for 15 minutes.';
      waitForTelegram(host);
    } catch (err) {
      btn.disabled = false;
      msg.textContent = err.message;
    }
  } }, 'Connect Telegram');
  return h('span', {}, btn, msg);
}

/** After "Open Telegram", notice the link as soon as the bot has it. */
function waitForTelegram(host) {
  const until = Date.now() + 15 * 60_000;
  const tick = async () => {
    if (!host.isConnected || Date.now() > until) return;
    const me = await getMe().catch(() => null);
    if (me?.telegram) return channelHint(host, me);
    setTimeout(tick, document.hidden ? 10_000 : 3_000);
  };
  setTimeout(tick, 3_000);
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function urlB64ToBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** This browser's subscription, or null. Never asks for permission. */
async function currentSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

async function enablePush(cfg) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error(isIOS
      ? 'On iPhone, notifications need Britto on your Home Screen: tap Share, then "Add to Home Screen", open Britto from there and try again. Or connect Telegram.'
      : inApp ? 'In the Britto app, alerts arrive by Telegram for now. Connect Telegram instead.'
        : 'This browser cannot show notifications from websites. Connect Telegram instead.');
  }
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser\'s site settings, then try again.');
  const key = urlB64ToBytes(cfg.push.publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for another server key cannot receive our messages: replace it.
  if (sub && sub.options.applicationServerKey && !new Uint8Array(sub.options.applicationServerKey).every((b, i) => b === key[i])) {
    await sub.unsubscribe();
    sub = null;
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch (err) {
    // Chrome refuses push in incognito windows and says only "permission denied".
    throw new Error(err?.name === 'NotAllowedError'
      ? 'This window cannot receive notifications (private and incognito windows cannot). Open Britto in a normal window, or connect Telegram.'
      : `Notifications could not be switched on here (${err?.message ?? err}). Connect Telegram instead.`);
  }
  return (await savePush(sub.toJSON())).me;
}

async function pushControl(cfg, me, refresh) {
  const msg = h('span', { class: 'small' });
  const sub = await currentSubscription().catch(() => null);
  if (sub && me.push > 0) {
    const off = h('button', { type: 'button', class: 'link', onclick: async () => {
      try { await deletePush(sub.toJSON()); await sub.unsubscribe(); refresh(); } catch (err) { msg.textContent = err.message; }
    } }, 'Turn off');
    return h('span', {}, h('span', { class: 'ok' }, 'Notifications on in this browser ✓ '), off, msg);
  }
  const btn = h('button', { type: 'button', class: 'secondary', onclick: async () => {
    btn.disabled = true;
    msg.textContent = '';
    try { await enablePush(cfg); refresh(); } catch (err) { btn.disabled = false; msg.textContent = ` ${err.message}`; }
  } }, 'Turn on notifications here');
  return h('span', {}, btn, msg);
}

/** One alert on the Tracker: how close the price is, or, once it has fired, what to do now. */
function trackerRow(a) {
  const fired = a.lastFiredAt != null;
  const link = keyToLink(a.key);
  const page = `/p/${encodeURIComponent(a.key)}`;
  const near = a.rule?.kind === 'below' && a.price && a.inStock !== false ? Math.min(100, (a.rule.target / a.price) * 100) : null;
  const bar = near == null ? null : h('span', { class: 'near-bar', role: 'img', 'aria-label': `Alert price is ${Math.round(near)}% of today\u2019s price` }, h('span', {}));
  if (bar) bar.firstChild.style.width = `${near.toFixed(1)}%`;
  return h('li', { class: `alert-row${fired ? ' fired' : ''}`, 'data-alert': a.id },
    h('div', { class: 'thumb small-thumb' }, a.image ? h('img', { src: thumbUrl(a.image), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null),
    h('div', { class: 'alert-main' },
      fired ? h('span', { class: 'badge solid' }, `Alert sent \u00b7 ${date(a.lastFiredAt)}`) : null,
      h('a', { href: page, 'data-nav': true, class: 'title' }, a.title ?? a.key),
      h('span', { class: 'alert-state' }, `${STORE_NAMES[a.store] ?? a.store} \u00b7 ${a.inStock === false ? 'out of stock' : `${rupees(a.price)} now`} \u00b7 alert: ${a.description}`),
      bar,
      fired ? h('span', { class: 'muted small' }, a.lastMessage) : h('span', { class: 'muted small' }, `Waiting since ${date(a.createdAt)}`)),
    h('button', { type: 'button', class: 'icon-btn plain', 'aria-label': 'Remove this alert', onclick: async () => {
      try { await removeAlert(a.id); alertsPage(); } catch (err) { alert(err.message); }
    } }, icon('close'), h('span', { class: 'sr' }, 'Remove')),
    fired ? h('div', { class: 'alert-actions' },
      h('a', { class: 'button warn', href: link ?? page, target: link ? '_blank' : null, rel: 'noopener noreferrer nofollow', 'data-nav': link ? null : true }, a.price && a.inStock !== false ? `Buy at ${rupees(a.price)}` : 'Open it'),
      h('a', { class: 'button secondary', href: `${page}#compare`, 'data-nav': true }, 'Compare stores')) : null);
}

/** The fare alerts this phone keeps (android FareWatches): a flight route and day, re-read on the phone. */
function fareWatchCard(w, refresh) {
  const q = new URLSearchParams({ from: w.from, to: w.to, date: w.date });
  return h('li', { class: 'fare-watch', 'data-watch': w.id },
    h('span', { class: 'eyebrow' }, 'Fare alert'),
    h('b', {}, `${w.from} \u2192 ${w.to} \u00b7 ${dayName(w.date)}`),
    // The app's own rule (FareWatches.checked): at least ₹100, and at least 1% of the lowest fare.
    h('p', {}, `Tells you when a fare is at least ${rupees(Math.max(10_000, Math.floor(w.low / 100)))} below ${rupees(w.low)} (${w.lowSite}, the lowest seen). Checked on this phone every 6 hours; last ${ago(w.checkedAt)}: ${rupees(w.last)} on ${w.lastSite}.`),
    h('div', { class: 'alert-actions' },
      h('a', { class: 'button light', href: `/travel?${q}#flights`, 'data-nav': true }, 'Compare now'),
      h('button', { type: 'button', class: 'button ghost-light', onclick: async () => { await siteBridge()?.({ type: 'unwatchFare', id: w.id }); refresh(); } }, 'Stop')));
}

async function alertsPage() {
  const head = h('header', { class: 'page-head' }, h('h1', {}, 'Tracker'),
    h('p', {}, inApp ? 'Your alerts belong to this phone: no account, no password.' : 'Your alerts belong to this browser: no account, no password.'));
  put(app, head, h('p', { class: 'muted page-wait' }, 'Loading\u2026'));
  const [cfg, me, fares] = await Promise.all([config(), getMe(), inApp ? siteBridge()?.({ type: 'fareWatches' }) : null]);
  const list = me?.alerts ?? [];
  const watches = fares?.ok ? fares.watches : null;
  const channels = h('div', { class: 'channels' });
  const testStatus = h('span', { class: 'small', role: 'status' });
  const prices = h('section', { id: 'tracker-prices' },
    h('h2', {}, list.length ? `${list.length} alert${list.length === 1 ? '' : 's'}` : 'No alerts yet'),
    list.length ? h('ul', { class: 'alert-list' }, list.map(trackerRow))
      : h('p', { class: 'muted' }, 'Open any product and tap \u201cAlert me\u201d at the bottom of its page.'));
  const farePanel = watches ? h('section', { id: 'tracker-fares', hidden: true },
    watches.length ? h('ul', { class: 'alert-list' }, watches.map((w) => fareWatchCard(w, alertsPage)))
      : h('p', { class: 'muted' }, 'No fare alerts yet. Compare a one-way flight in Travel, then tap \u201cAlert me if it gets cheaper\u201d.')) : null;
  const seg = watches ? h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Alerts' }, [['prices', `Prices (${list.length})`, prices], ['fares', `Fares (${watches.length})`, farePanel]].map(([id, label, panel], i) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(i === 0),
    onclick: (e) => {
      prices.hidden = id !== 'prices';
      farePanel.hidden = id !== 'fares';
      e.target.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.target)));
    },
  }, label))) : null;
  put(app, head,
    cfg?.telegram ? h('p', { class: 'notice page-gap' }, 'On your phone? Send any product link to ', botLink(cfg.telegram.bot), ' on Telegram. It replies with the price history and sets alerts with one tap.') : null,
    h('section', { class: 'alert-box p-card page-gap' }, h('h2', {}, 'Where alerts go'), channels,
      me ? h('p', {}, h('button', { type: 'button', class: 'secondary', onclick: async () => {
        testStatus.textContent = ' Sending\u2026';
        try {
          const { result } = await sendTest();
          const tg = { sent: 'Telegram: sent.', failed: 'Telegram: failed.', blocked: 'Telegram: you blocked the bot.', not_connected: '', off: '' }[result.telegram];
          testStatus.textContent = ` ${tg} Browsers: ${result.push.sent} sent${result.push.failed ? `, ${result.push.failed} failed` : ''}.`;
        } catch (err) { testStatus.textContent = ` ${err.message}`; }
      } }, 'Send a test alert'), testStatus) : null),
    seg, prices, farePanel);
  if (me && inApp) await appAlertHint(channels);
  else if (me) channelHint(channels, me);
  else put(channels, h('p', { class: 'small muted' }, 'Set your first alert on a product page, then choose where it reaches you.'));
}

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'britto-push' && location.pathname === '/alerts') alertsPage();
});

// In the app, Android's status bar sits over the page's top bar: the app paints the strip behind
// it in the top bar's colour, and behind the navigation bar the tab bar's (SiteBridgeCore "bars").
let barsSent = '';
function reportBars() {
  const ask = inApp ? siteBridge() : null;
  if (!ask) return;
  const hex = (sel) => {
    const el = document.querySelector(sel);
    const m = el && /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(getComputedStyle(el).backgroundColor);
    return m && (m[4] === undefined || Number(m[4]) === 1) ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : null;
  };
  const top = hex('.top');
  const bottom = hex('.tabbar') ?? hex('body');
  if (!top || !bottom || top + bottom === barsSent) return;
  barsSent = top + bottom;
  ask({ type: 'bars', top, bottom });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', reportBars);

// What the top bar shows on a phone, page by page (style.css; index.html holds every part).
const CHROME = { '/': 'home', '/p': 'back', '/search': 'search', '/deals': 'page', '/alerts': 'page', '/travel': 'page' };
function setChrome(mode, title = '') {
  document.documentElement.dataset.chrome = mode;
  document.getElementById('top-title').textContent = title;
}
let moved = 0; // pages opened inside the site this visit: Back goes there, or home when none.
document.getElementById('top-back').addEventListener('click', (e) => {
  e.preventDefault();
  if (moved > 0) history.back();
  else go('/');
});

function route() {
  const { pathname, search } = location;
  window.scrollTo(0, 0);
  // The tab (and desktop nav link) for this page, by its first path segment.
  const section = `/${pathname.split('/')[1] ?? ''}`;
  document.documentElement.classList.toggle('is-home', section === '/');
  setChrome(CHROME[section] ?? 'none', section === '/p' ? 'Price history' : '');
  reportBars();
  document.querySelectorAll('.tabbar a, .top nav a').forEach((a) => {
    if (a.getAttribute('href') === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const done = (p) => p?.catch?.((e) => put(app, h('p', { class: 'error' }, e.message)));
  if (pathname.startsWith('/p/')) return done(productPage(decodeURIComponent(pathname.slice(3))));
  if (pathname === '/search') return done(searchPage(new URLSearchParams(search).get('q') ?? ''));
  if (pathname === '/deals') return done(dealsPage());
  if (pathname === '/stores') return done(storesPage());
  if (pathname === '/browse') return done(browsePage());
  if (pathname === '/grocery') return done(groceryPage());
  if (pathname === '/travel') return done(travelPage());
  if (pathname === '/alerts') return done(alertsPage());
  if (pathname === '/spend') return done(spendPage());
  if (pathname === '/app') return done(appPage());
  return done(home());
}

route();
