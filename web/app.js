// Working UI for Britto until the Claude Design screens replace it. Every string from a
// store (titles, image URLs) goes in via textContent / setAttribute — never innerHTML.
import {
  ago, connectTelegram, date, deletePush, deviceToken, disconnectTelegram, getConfig, getDeals, getDrops, getMe, getPopular, getProduct, getRecent, getStores,
  pct, removeAlert, rupees, savePush, searchProducts, sendTest, setAlert, storeSearch, toPaise, trackProduct, getGroceryPlatforms, getSimilar, voteCoupon,
} from './api.js';
import { drawChart } from './chart.js';
import { mergeOrders, summarize } from './spend.js';
import { airportIndex, flightSearch, hotelSearch, MAX_DAYS_AHEAD, rideCompare, rideSearch, todayIST } from './travel.js';
import { groupFlights, otherAirport, siteSummary } from './compare.js';

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
};
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
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
  history.pushState(null, '', path);
  route();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('popstate', route);

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get('q')?.toString().trim();
  if (!q) return;
  // Measured in the app: after searching, the phone keyboard stayed up over the results.
  e.target.querySelector('input')?.blur();
  if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}\//i.test(q)) addByLink(q);
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
  return h('a', { class: 'card', href, 'data-nav': true },
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

function linkForm(initial = '') {
  const status = h('p', { class: 'form-status', role: 'status' });
  const input = h('input', { name: 'url', type: 'url', required: true, value: initial, placeholder: 'Paste an Amazon, Flipkart or Myntra product link', 'aria-label': 'Product link' });
  const form = h('form', { class: 'track', onsubmit: (e) => { e.preventDefault(); addByLink(input.value, status); } },
    input, h('button', { type: 'submit' }, 'Check price history'));
  return h('div', {}, form, status);
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

const focusPaste = (e) => { e.preventDefault(); const input = document.querySelector('.track input'); input?.scrollIntoView({ block: 'center' }); input?.focus(); };

function shortcut(label, href, iconName, tint, onclick) {
  return h('a', { class: 'shortcut', href, 'data-nav': onclick ? null : true, onclick }, h('i', { class: tint }, icon(iconName)), label);
}

async function home() {
  put(app, 
    h('section', { class: 'hero' },
      h('h1', {}, 'Know the real price before you buy.'),
      h('p', { class: 'lede' }, 'Price history, honest discount checks and price-drop alerts for Indian stores.')),
    h('section', { class: 'paste-card', id: 'paste' },
      h('div', { class: 'paste-head' }, h('span', { class: 'icon' }, icon('link')),
        h('div', {}, h('b', {}, 'Paste a product link'), h('span', {}, 'Check price history & fake sales'))),
      linkForm(),
      h('div', { class: 'tip-row' },
        h('p', { class: 'tip-line' }, 'Tip: put ', h('code', {}, `${location.host}/`), ' in front of any product link.'),
        h('p', { class: 'tip-line', id: 'bot-tip' }))),
    h('div', { class: 'promos' },
      h('a', { class: 'promo fake', href: '#paste', onclick: focusPaste }, h('span', { class: 'tag' }, 'Fake sale detector'), h('b', {}, 'Is that sale real?'), h('span', {}, 'We check the price against the product’s own usual price, not its M.R.P.')),
      h('a', { class: 'promo deals', href: '/deals', 'data-nav': true }, h('span', { class: 'tag' }, 'Real drops'), h('b', {}, 'Biggest real price drops'), h('span', {}, 'Only drops below what each product usually costs.')),
      h('a', { class: 'promo travel', href: '/travel', 'data-nav': true }, h('span', { class: 'tag' }, 'Travel'), h('b', {}, 'One search, every site'), h('span', {}, 'Flights, hotels and rides, filled in on each site.'))),
    h('nav', { class: 'shortcuts', 'aria-label': 'Britto features' },
      shortcut('Fake sale', '#paste', 'shield', 'tint-red', focusPaste),
      shortcut('Price tracker', '/alerts', 'trend', 'tint-blue'),
      shortcut('Flights', '/travel', 'plane', 'tint-sky'),
      shortcut('Deals', '/deals', 'tag', 'tint-orange'),
      shortcut('Shop', '/browse', 'bag', 'tint-green'),
      shortcut('Spend Lens', '/spend', 'wallet', 'tint-violet'),
      shortcut('Stores', '/stores', 'store', 'tint-gold'),
      inApp ? shortcut('Grocery', '/grocery', 'basket', 'tint-pink') : shortcut('Get the app', '/app', 'bag', 'tint-pink')),
    h('section', { class: 'quick' }, h('h2', {}, 'Search Amazon with price history'),
      h('div', { class: 'chips' }, QUICK.map((w) => h('a', { class: 'chip', href: `/search?q=${encodeURIComponent(w)}`, 'data-nav': true }, w)))),
    h('section', { id: 'drops-sec' }, h('div', { class: 'section-head' }, h('h2', {}, 'Price dropped'), h('a', { href: '/deals', 'data-nav': true }, 'View all')),
      h('p', { class: 'section-note' }, 'Cheaper now than at our reading before, and still in stock.'), h('div', { id: 'drops' }, h('p', { class: 'muted' }, 'Loading…'))),
    h('section', { id: 'deals-sec', hidden: true }, h('div', { class: 'section-head' }, h('h2', {}, 'Biggest real price drops'), h('a', { href: '/deals', 'data-nav': true }, 'View all')),
      h('p', { class: 'section-note' }, 'Below each product’s own usual price over 90 days, not its M.R.P.'), h('div', { id: 'deals' })),
    h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Recently checked')), h('div', { id: 'recent' }, h('p', { class: 'muted' }, 'Loading…'))));
  config().then((cfg) => {
    if (cfg?.telegram) put(document.getElementById('bot-tip'), 'On your phone? Send any product link to ', botLink(cfg.telegram.bot), ' on Telegram. No app or extension needed.');
  });
  const [dr, d, r] = await Promise.allSettled([getDrops(), getDeals(), getRecent()]);
  put(document.getElementById('drops'), dr.status === 'fulfilled' ? row(dr.value.results, 'No drops in the last two weeks yet: Britto reads each product about twice a day, so they appear as prices change.') : h('p', { class: 'error' }, dr.reason.message));
  if (d.status === 'fulfilled' && d.value.results.length) {
    document.getElementById('deals-sec').hidden = false;
    put(document.getElementById('deals'), row(d.value.results, ''));
  }
  put(document.getElementById('recent'), r.status === 'fulfilled' ? grid(r.value.results, 'Nothing tracked yet. Paste a link above.') : h('p', { class: 'error' }, r.reason.message));
}

/** Quick searches on the home page (Amazon's own results, read by our server). */
const QUICK = ['Earbuds', 'Smartwatch', 'iPhone 17', 'Air fryer', 'Running shoes', 'Pressure cooker', 'Power bank', 'Trimmer', 'Backpack', 'Face wash'];

const VERDICT_CLASS = { buy: 'good', fair: 'neutral', wait: 'bad', too_early: 'neutral', unavailable: 'neutral' };
const SALE_TITLE = {
  real_drop: 'Real price drop',
  hike_then_drop: 'Raised, then “dropped”',
  no_real_drop: 'No real drop',
  too_early: 'Too early to check this sale',
  unavailable: 'Not on sale: unavailable',
};
const SALE_CLASS = { real_drop: 'good', hike_then_drop: 'bad', no_real_drop: 'neutral', too_early: 'neutral', unavailable: 'neutral' };

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
  const ranges = [['1M', 30], ['3M', 90], ['6M', 180], ['All', 0]];
  const rangeBar = h('div', { class: 'ranges', role: 'group', 'aria-label': 'Chart range' },
    ranges.map(([label, days]) => h('button', {
      type: 'button', 'aria-pressed': String(days === range),
      onclick: (e) => { range = days; rangeBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); drawChart(chartHost, view, range); },
    }, label)));

  put(app, 
    h('article', { class: 'product' },
      h('div', { class: 'product-head' },
        h('div', { class: 'product-img' }, view.image ? h('img', { src: view.image, alt: '', referrerpolicy: 'no-referrer' }) : null),
        h('div', {},
          h('span', { class: 'store' }, view.store.name),
          h('h1', { class: 'product-title' }, view.title ?? 'Product details not read yet'),
          h('div', { class: 'now' },
            h('span', { class: 'big-price' }, s.inStock === false ? 'Out of stock' : rupees(s.current)),
            s.currentMrp && s.current && s.currentMrp > s.current ? h('span', { class: 'mrp' }, 'M.R.P. ', h('s', {}, rupees(s.currentMrp))) : null),
          h('p', { class: 'muted small' }, `Checked ${ago(s.lastCheckedAt)} · tracking since ${date(s.trackedSince)}`),
          h('div', { class: 'product-actions' },
            h('a', { class: 'button warn', href: view.url, target: '_blank', rel: 'noopener noreferrer nofollow', title: `Opens ${view.store.name}` },
              s.inStock !== false && s.current ? `Buy at ${rupees(s.current)}` : `Open on ${view.store.name}`),
            h('a', { class: 'button secondary', href: '#alert', onclick: (e) => { e.preventDefault(); document.getElementById('alert')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, 'Price alert')))),
      view.pending ? h('p', { class: 'notice' }, view.pending) : null,
      h('div', { class: 'cards2' },
        h('section', { class: `verdict ${VERDICT_CLASS[view.verdict.kind]}` },
          h('h2', {}, view.verdict.headline),
          h('ul', {}, view.verdict.reasons.map((r) => h('li', {}, r)))),
        h('section', { class: `verdict ${SALE_CLASS[view.sale.status]}` },
          h('h2', {}, SALE_TITLE[view.sale.status]),
          h('p', {}, view.sale.explanation),
          view.sale.claimedPct != null ? h('p', { class: 'small' }, `Claimed: ${pct(view.sale.claimedPct)} off M.R.P. · Real: ${view.sale.realPct == null ? 'not known yet' : pct(view.sale.realPct) + ' vs usual'}`) : null)),
      compareSection(view),
      offersSection(view),
      h('section', {}, h('div', { class: 'chart-head' }, h('h2', {}, 'Price history'), rangeBar), chartHost),
      alertBox(view),
      h('dl', { class: 'stats' },
        stat('Lowest', s.lowest ? `${rupees(s.lowest.price)}` : '—', s.lowest ? date(s.lowest.at) : ''),
        stat('Highest', s.highest ? `${rupees(s.highest.price)}` : '—', s.highest ? date(s.highest.at) : ''),
        stat('Usual (median)', rupees(s.median), 'time-weighted'),
        stat('Price changes', String(s.changes), `${Math.floor(s.daysTracked)} days watched`)),
      h('section', { id: 'similar' })));
  drawChart(chartHost, view, range);
  // Look-alikes (BLUEPRINT §10.3): shown only when there are some, and labelled for what they are.
  getSimilar(key).then(({ results, basis }) => {
    if (!results.length) return;
    put(document.getElementById('similar'), h('h2', {}, 'Similar, and cheaper'), h('p', { class: 'muted small' }, basis), grid(results, ''));
  }).catch(() => {});
  if (location.hash === '#alert') document.getElementById('alert')?.scrollIntoView();
}

/** The same product on the other stores: their own search pages for its first words. Britto
 * cannot say it is the same item (stores name products differently), so these are searches.
 * The search addresses come from the server (core/stores.ts), never a copy here. */
function compareSection(view) {
  const words = (view.title ?? '').replace(/[|,(:].*$/, '').replace(/[^\p{L}\p{N}\s.+-]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  if (words.length < 3) return null;
  const box = h('section', { class: 'compare', id: 'compare' });
  storesOnce().then((stores) => {
    const links = stores.filter((s) => s.id !== view.store.id).map((s) => ({ store: s.id, name: s.name, url: searchLink(s, words) }));
    put(box, h('h2', {}, 'Check other stores'),
      h('p', { class: 'muted small' }, `Searches for “${words}”. Stores name products differently, so check it is the same item.`),
      storeButtons(links));
  }).catch(() => {});
  return box;
}

let storesCache = null;
const storesOnce = () => (storesCache ??= getStores().then((r) => r.stores).catch((e) => { storesCache = null; throw e; }));
function searchLink(store, words) {
  return store.search.url.replace('{q}', encodeURIComponent(words)).replace('{slug}', encodeURIComponent(words.toLowerCase().replace(/ /g, '-')));
}

// Offers the store's own page showed when OUR server last read it (BLUEPRINT §15): quoted as
// the page put them, not checked by Britto. Offer text from shoppers' browsers is never shown here.
function offersSection(view) {
  if (!view.offers?.items.length) return null;
  return h('section', { class: 'offers', id: 'offers' },
    h('h2', {}, `Offers on ${view.store.name}'s page`),
    h('ul', {}, view.offers.items.map((o) => h('li', {}, h('b', {}, o.title), ' ', o.text, o.count ? h('span', { class: 'muted small' }, ` · ${o.count}`) : null,
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
  waiting: 'showed no fares for this search.',
  failed: 'did not open.',
};

/**
 * True when the comparison started (inside the app, with at least one site it can read). `draw`
 * paints each state: (box, sites, state, others).
 */
async function liveFares(box, links, sector, draw) {
  const ask = inApp ? siteBridge() : null;
  if (!ask) return false;
  const recipes = await loadFareRecipes();
  const sites = links.filter((l) => l.prefilled).map((l) => ({ id: l.id, name: l.name, url: l.url, recipe: recipes.find((r) => r.site === l.id && r.sector === sector) })).filter((s) => s.recipe);
  if (!sites.length) return false;
  const started = await ask({ type: 'compareFares', sites: sites.map(({ id, url, recipe }) => ({ id, url, recipe })) });
  if (!started?.ok) return false;
  const others = links.filter((l) => !sites.some((s) => s.id === l.id));
  const run = ++fareRun;
  const tick = async () => {
    if (run !== fareRun || !box.isConnected) { if (run === fareRun) ask({ type: 'compareStop' }); return; }
    const st = await ask({ type: 'compareStatus', job: started.job });
    if (!st?.ok || run !== fareRun) return;
    draw(box, sites, st, others);
    if (!st.done) setTimeout(tick, 1000);
  };
  put(box, h('p', { class: 'muted' }, `Opening ${sites.map((s) => s.name).join(', ')} on your phone…`));
  tick();
  return true;
}

function drawFares(box, sites, st, others, q, airports) {
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
    h('ul', { class: 'fare-sites' }, siteSummary(read).map((s) => h('li', { 'data-site': s.id, 'data-status': s.status },
      h('span', { class: 'fare-site' }, s.name),
      s.cheapest != null ? h('span', {}, `from ${rupees(s.cheapest)}`, h('small', { class: 'muted' }, ` · ${s.rows.length} fares`)) : h('span', { class: 'small muted' }, FARE_STATUS[s.status] ?? FARE_STATUS.waiting),
      open(s.url, s.status === 'check' || s.status === 'login' ? `Open ${s.name}` : 'Open', 'button secondary small')))),
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

function drawRides(box, sites, st, others) {
  const state = new Map(st.sites.map((x) => [x.id, x]));
  const read = sites.map((s) => ({ ...s, ...state.get(s.id) }));
  const rides = read.flatMap((s) => (s.status === 'fares' ? s.rows.map((r) => ({ ...r, site: s })) : [])).sort((a, b) => a.price - b.price);
  put(box,
    h('p', { class: 'fare-progress small' }, st.done ? `Checked on your phone just now.` : 'Checking ride fares on your phone…'),
    st.done ? null : h('progress', { class: 'fare-bar' }),
    h('ul', { class: 'fare-sites' }, read.map((s) => h('li', { 'data-site': s.id, 'data-status': s.status },
      h('span', { class: 'fare-site' }, s.name),
      s.status === 'fares' ? h('span', {}, `${s.rows.length} rides from ${rupees(Math.min(...s.rows.map((r) => r.price)))}`) : h('span', { class: 'small muted' }, FARE_STATUS[s.status] ?? FARE_STATUS.waiting),
      h('a', { class: 'button secondary small', href: s.url, rel: 'noopener' }, `Open ${s.name}`)))),
    rides.length ? h('ol', { class: 'fare-list' }, rides.map((r) => h('li', { 'data-ride': r.label },
      h('div', { class: 'fare-flight' }, h('strong', {}, r.label), h('span', { class: 'small muted' }, r.eta ? `pickup ${r.eta}` : '')),
      h('div', { class: 'fare-offers' }, h('a', { class: 'offer', href: r.site.url, rel: 'noopener', 'data-offer': r.site.id }, h('span', {}, r.site.name), h('b', {}, rupees(r.price))))))) : null,
    others.length ? h('ul', { class: 'fare-sites' }, others.map((l) => h('li', { 'data-site': l.id, 'data-status': 'link' },
      h('span', { class: 'fare-site' }, l.name),
      h('span', { class: 'small muted' }, 'Britto cannot read its fares yet: open it, log in with your number once, and enter the trip there.'),
      h('a', { class: 'button secondary small', href: l.url, rel: 'noopener' }, `Open ${l.name}`)))) : null,
    h('p', { class: 'small muted' }, 'Fares as each app\u2019s own page showed them on this phone. Tap one to book it there; Britto never books a ride.'));
}

const addDaysISO = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** "DEL · New Delhi" (what the airport list puts in the box) or "del" -> "DEL". */
const airportCode = (v) => (/^\s*([A-Za-z]{3})\b/.exec(v)?.[1] ?? '').toUpperCase();

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
    const r = flightSearch({ from: airportCode(from.value), to: airportCode(to.value), depart: depart.value, ret: ret.value || null, adults: Number(adults.value), cabin: cabin.value }, airports);
    fareRun++;
    if (r.ok) document.activeElement?.blur?.();
    if (r.ok && inApp) {
      liveFares(flightOut, r.links, 'flight', (box, sites, st, others) => drawFares(box, sites, st, others, r.q, airports)).then((live) => { if (!live) show(flightOut, r); });
      return;
    }
    show(flightOut, r, r.ok ? h('p', { class: 'small' }, h('button', { type: 'button', class: 'link', onclick: () => { rideTo.value = from.value; document.getElementById('rides')?.scrollIntoView(); } }, `Need a ride to ${r.q.from}?`)) : null);
  } },
  h('div', { class: 'fields' }, field('From', from), field('To', to), field('Depart', depart), field('Return (optional)', ret), field('Adults', adults), field('Class', cabin)),
  h('button', { type: 'submit' }, inApp ? 'Compare fares' : 'Show flight searches'), flightOut);

  // Hotels
  const city = h('input', { name: 'city', placeholder: 'Goa', autocomplete: 'off', required: true });
  const checkIn = h('input', { name: 'checkIn', type: 'date', min: today, max, value: addDaysISO(today, 7), required: true });
  const checkOut = h('input', { name: 'checkOut', type: 'date', min: today, max, value: addDaysISO(today, 9), required: true });
  const guests = h('input', { name: 'guests', type: 'number', min: 1, max: 8, value: 2 });
  const hotelOut = out('hotel-links');
  const hotels = h('form', { class: 'travel-form', id: 'hotels', onsubmit: (e) => {
    e.preventDefault();
    show(hotelOut, hotelSearch({ city: city.value, checkIn: checkIn.value, checkOut: checkOut.value, adults: Number(guests.value) }));
  } },
  h('div', { class: 'fields' }, field('City', city), field('Check-in', checkIn), field('Check-out', checkOut), field('Guests (one room)', guests)),
  h('button', { type: 'submit' }, 'Show hotel searches'), hotelOut);

  // Ride compare (app only): places from the phone's own place search, fares from Uber's own page.
  const pickup = h('input', { name: 'pickup', placeholder: 'Connaught Place, New Delhi', autocomplete: 'off', required: true });
  const drop = h('input', { name: 'drop', placeholder: 'Delhi Airport Terminal 3', autocomplete: 'off', required: true });
  const rideCmpOut = out('ride-compare-out');
  const rideCmp = h('form', { class: 'travel-form', id: 'ride-compare', onsubmit: async (e) => {
    e.preventDefault();
    document.activeElement?.blur?.();
    fareRun++;
    const ask = siteBridge();
    if (!ask) return put(rideCmpOut, h('p', { class: 'error' }, 'Ride compare works in the Britto app.'));
    put(rideCmpOut, h('p', { class: 'muted small' }, 'Finding the places…'));
    const [a, b] = await Promise.all([ask({ type: 'places', q: pickup.value }), ask({ type: 'places', q: drop.value })]);
    const p = a?.places?.[0];
    const d = b?.places?.[0];
    if (!p || !d) return put(rideCmpOut, h('p', { class: 'error' }, `${!p ? 'Pickup' : 'Drop'}: no such place found. Try a landmark and the city.`));
    const r = rideCompare(p, d);
    if (!r.ok) return put(rideCmpOut, h('p', { class: 'error' }, r.reason));
    const live = h('div', {});
    put(rideCmpOut, h('p', { class: 'small' }, h('b', {}, 'From '), p.address, h('br'), h('b', {}, 'To '), d.address), live);
    if (!(await liveFares(live, r.links, 'ride', drawRides))) put(live, travelLinks(r.links));
  } },
  h('div', { class: 'fields' }, field('Pickup', pickup), field('Drop', drop)),
  h('p', { class: 'small muted' }, 'Places are found by your phone. Uber opens with the trip on this phone and Britto reads its fares; log in to Uber once in the app first.'),
  h('button', { type: 'submit' }, 'Compare rides'), rideCmpOut);

  // Rides to the airport: the shopper's location goes into the Uber link only, never to Britto.
  const rideTo = h('input', { name: 'rideTo', list: 'airport-list', placeholder: 'DEL · New Delhi', autocomplete: 'off', required: true });
  const rideOut = out('ride-links');
  const ridesForm = h('form', { class: 'travel-form', id: 'rides', onsubmit: (e) => {
    e.preventDefault();
    const code = airportCode(rideTo.value);
    if (!airports.has(code)) return show(rideOut, rideSearch({ to: code }, airports, rides.uber));
    // The Britto app asks for the internet only, so its pages cannot have your location.
    if (inApp) return put(rideOut, h('p', { class: 'notice' }, `The Britto app does not ask for your location, so ride links work in your phone\u2019s browser: open ${location.host}/travel there.`));
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

  put(app, h('h1', {}, 'Travel'),
    h('p', { class: 'muted' }, inApp
      ? 'Enter your trip once. Britto opens MakeMyTrip, ixigo, Goibibo and EaseMyTrip on this phone, reads the fares each one shows, and lists them side by side. Britto\u2019s server never sees your search, and nothing is booked.'
      : 'Enter your trip once and open the same search on each site. In the Britto Android app, Britto also reads the fares each site shows and compares them for you.'),
    list,
    inApp ? h('section', {}, h('h2', {}, 'Rides'), rideCmp) : null,
    h('section', {}, h('h2', {}, 'Flights'), flights),
    h('section', {}, h('h2', {}, 'Hotels'), hotels),
    h('section', {}, h('h2', {}, 'Ride to the airport'), ridesForm));
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

async function searchPage(q) {
  const box = document.querySelector('#search-form input');
  if (box && box !== document.activeElement) box.value = q;
  const tracked = h('section', { id: 'tracked' });
  const live = h('section', { id: 'live' }, h('div', { class: 'section-head' }, h('h2', {}, 'On Amazon.in now')), h('div', { class: 'grid skeleton' }, Array.from({ length: 6 }, () => h('div', { class: 'card ghost' }))));
  const others = h('section', { id: 'others' });
  put(app, h('h1', {}, `Results for “${q}”`), tracked, live, others);
  searchProducts(q).then(({ results }) => {
    if (results.length) put(tracked, h('div', { class: 'section-head' }, h('h2', {}, 'With price history on Britto')), row(results, ''));
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
    put(live, h('div', { class: 'section-head' }, h('h2', {}, `On ${s.name} now`)),
      s.status === 'listed'
        ? [h('p', { class: 'section-note' }, `Prices as ${s.name}’s search page showed them ${ago(s.at)}; the product’s own page can differ. Tap one to see its price history: Britto starts watching it then.`),
          s.items.length ? h('div', { class: 'grid' }, s.items.map((i) => listedCard(i, known))) : h('p', { class: 'muted' }, `${s.name} found nothing for that.`)]
        : h('p', { class: 'notice' }, STATUS_NOTE[s.status]));
  }
  if (!res.stores.length) put(live);
  put(others, h('div', { class: 'section-head' }, h('h2', {}, 'Search other stores')),
    h('p', { class: 'section-note' }, inApp ? 'Opens the store inside Britto: its product pages show their price history.' : 'Opens the store’s own search. With the Britto extension or app, its product pages show their price history.'),
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

async function dealsPage() {
  const params = new URLSearchParams(location.search);
  const filter = { store: params.get('store') ?? '', min: Number(params.get('min')) || 0 };
  put(app, h('h1', {}, 'Real price drops'), h('p', { class: 'muted' }, 'Loading…'));
  const [{ stores }, d, p, dr] = await Promise.all([getStores(), getDeals(filter), getPopular(), getDrops(filter.store || undefined)]);
  const apply = (next) => go(`/deals?${new URLSearchParams(Object.entries({ ...filter, ...next }).filter(([, v]) => v)).toString()}`);
  const storeSelect = h('select', { 'aria-label': 'Store', onchange: (e) => apply({ store: e.target.value }) },
    h('option', { value: '' }, 'All stores'), stores.map((s) => h('option', { value: s.id, selected: s.id === filter.store }, s.name)));
  const minSelect = h('select', { 'aria-label': 'Smallest real drop', onchange: (e) => apply({ min: Number(e.target.value) }) },
    [0, 10, 20, 30, 50].map((m) => h('option', { value: m, selected: m === filter.min }, m ? `${m}% or more below usual` : 'Any real drop (5%+)')));
  const cards = d.results.map((c) => {
    const card = productCard(c);
    const spark = sparkline(c.spark);
    if (spark) card.querySelector('.card-body')?.append(spark);
    return card;
  });
  put(app, 
    h('h1', {}, 'Real price drops'),
    h('p', { class: 'muted' }, 'Only products at least 5% below their own usual price (90-day time-weighted median, M.R.P. ignored), and not raised just before the “sale”. The line under each shows its last 90 days.'),
    h('div', { class: 'filters' }, storeSelect, minSelect),
    cards.length ? h('div', { class: 'grid' }, cards) : h('p', { class: 'muted' }, 'No confirmed drops for this filter yet. A drop is only confirmed after a week of watching a product.'),
    h('div', { class: 'section-head' }, h('h2', {}, 'Price dropped since our reading before')),
    h('p', { class: 'section-note' }, 'Cheaper now than at the reading before, in the last two weeks. This says nothing about the usual price: that takes a week of history.'),
    grid(dr.results, 'None in the last two weeks yet.'),
    h('h2', {}, 'Most viewed'), grid(p.results, 'Nothing yet.'));
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
    inApp ? h('p', { class: 'notice' }, `You are using the app${info ? `; the newest version is ${info.version}` : ''}.`)
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
      feature('Rides, flights and hotels.', 'Uber, Cleartrip and Booking.com open inside the app, so you log in once.'),
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

/**
 * Super Browse (BLUEPRINT §18): every store Britto knows, opened in the app's in-app browser,
 * where Britto reads the page you are looking at. In a normal browser the tiles just open the
 * store (the extension reads it there).
 */
const SECTORS = [['ride', 'Rides'], ['flight', 'Flights'], ['hotel', 'Hotels']];
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
      h('span', { class: 'small muted' }, inApp ? `Log in with your number on ${s.name}\u2019s own page; it stays on this phone.` : `Opens ${s.name}.`))))] : [];
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

function siteBridge() {
  const bridge = window.BrittoBridge;
  if (!bridge) return null;
  const pending = new Map();
  let seq = 0;
  bridge.onmessage = (event) => {
    const { id, reply } = JSON.parse(event.data);
    pending.get(id)?.(reply);
    pending.delete(id);
  };
  return (msg) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    bridge.postMessage(JSON.stringify({ id, msg }));
  });
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
  const box = h('section', { class: 'alert-box', id: 'alert' }, h('h2', {}, 'Price alert'));
  const mine = h('ul', { class: 'my-alerts' });
  const status = h('p', { class: 'form-status', role: 'status' });
  const channels = h('div', { class: 'channels' });

  const suggested = priced ? Math.floor((s.current * 95) / 100 / 100) * 100 : null;
  const target = h('input', { name: 'target', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Target price in rupees', value: suggested ? String(suggested / 100) : '', size: 8 });
  const option = (value, label, extra, checked) => h('label', { class: 'opt' },
    h('input', { type: 'radio', name: 'kind', value, checked }), ' ', label, extra ?? null);
  const form = h('form', { class: 'alert-form', onsubmit: async (e) => {
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
    priced ? option('drop', 'Any price drop', null, true) : null,
    priced ? option('below', 'At or below ₹', target, false) : null,
    option('in_stock', s.current == null && s.inStock !== false ? 'When it first has a price' : 'When it is back in stock', null, !priced),
    h('button', { type: 'submit' }, 'Set alert'));

  function show(me) {
    const here = (me?.alerts ?? []).filter((a) => a.key === view.key);
    put(mine, ...here.map((a) => h('li', {},
      h('span', {}, `${a.description}`, a.lastFiredAt ? h('span', { class: 'muted small' }, ` · sent ${date(a.lastFiredAt)}`) : null),
      h('button', { type: 'button', class: 'link', onclick: async () => {
        try { show((await removeAlert(a.id)).me); status.textContent = 'Alert removed.'; } catch (err) { status.textContent = err.message; }
      } }, 'Remove'))));
    if (here.length) (inApp ? appAlertHint(channels) : channelHint(channels, me));
  }
  box.append(mine, form, status, channels);
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

async function alertsPage() {
  put(app, h('h1', {}, 'Price Tracker'), h('p', { class: 'muted' }, 'Loading…'));
  const [cfg, me] = await Promise.all([config(), getMe()]);
  const list = (me?.alerts ?? []);
  const channels = h('div', { class: 'channels' });
  const testStatus = h('span', { class: 'small', role: 'status' });
  put(app, 
    h('h1', {}, 'Price Tracker'),
    h('p', { class: 'muted' }, inApp ? 'No account and no password: your alerts belong to this phone.' : 'No account and no password: your alerts belong to this browser. Connect Telegram to get them on your phone too.'),
    cfg?.telegram ? h('p', { class: 'notice' }, 'On your phone? Send any product link to ', botLink(cfg.telegram.bot), ' on Telegram. It replies with the price history and sets alerts with one tap.') : null,
    h('section', { class: 'alert-box' }, h('h2', {}, 'Where alerts go'), channels,
      me ? h('p', {}, h('button', { type: 'button', class: 'secondary', onclick: async () => {
        testStatus.textContent = ' Sending…';
        try {
          const { result } = await sendTest();
          const tg = { sent: 'Telegram: sent.', failed: 'Telegram: failed.', blocked: 'Telegram: you blocked the bot.', not_connected: '', off: '' }[result.telegram];
          testStatus.textContent = ` ${tg} Browsers: ${result.push.sent} sent${result.push.failed ? `, ${result.push.failed} failed` : ''}.`;
        } catch (err) { testStatus.textContent = ` ${err.message}`; }
      } }, 'Send a test alert'), testStatus) : null),
    h('h2', {}, list.length ? `${list.length} alert${list.length === 1 ? '' : 's'}` : 'No alerts yet'),
    list.length ? h('ul', { class: 'alert-list' }, list.map((a) => h('li', { class: 'alert-row' },
      h('div', { class: 'thumb small-thumb' }, a.image ? h('img', { src: a.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null),
      h('div', { class: 'alert-main' },
        h('a', { href: `/p/${encodeURIComponent(a.key)}`, 'data-nav': true, class: 'title' }, a.title ?? a.key),
        h('span', {}, `${STORE_NAMES[a.store] ?? a.store} · now ${a.inStock === false ? 'out of stock' : rupees(a.price)} · alert: ${a.description}`),
        h('span', { class: 'muted small' }, a.lastFiredAt ? `Sent ${date(a.lastFiredAt)}: ${a.lastMessage}` : `Waiting since ${date(a.createdAt)}`)),
      h('button', { type: 'button', class: 'link', onclick: async () => {
        try { await removeAlert(a.id); alertsPage(); } catch (err) { alert(err.message); }
      } }, 'Remove'))))
      : h('p', { class: 'muted' }, 'Open any product and press "Set alert" under its price history.'));
  if (me && inApp) await appAlertHint(channels);
  else if (me) channelHint(channels, me);
  else put(channels, h('p', { class: 'small muted' }, 'Set your first alert on a product page, then choose where it reaches you.'));
}

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'britto-push' && location.pathname === '/alerts') alertsPage();
});

function route() {
  const { pathname, search } = location;
  window.scrollTo(0, 0);
  // The tab (and desktop nav link) for this page, by its first path segment.
  const section = `/${pathname.split('/')[1] ?? ''}`;
  document.documentElement.classList.toggle('is-home', section === '/');
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
