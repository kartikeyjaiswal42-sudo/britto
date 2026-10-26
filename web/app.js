// Working UI for Britto until the Claude Design screens replace it. Every string from a
// store (titles, image URLs) goes in via textContent / setAttribute — never innerHTML.
import {
  ago, connectTelegram, date, deletePush, disconnectTelegram, getConfig, getDeals, getMe, getPopular, getProduct, getRecent, getStores,
  pct, removeAlert, rupees, savePush, searchProducts, sendTest, setAlert, toPaise, trackProduct,
} from './api.js';
import { drawChart } from './chart.js';

const app = document.getElementById('app');

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
  if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}\//i.test(q)) addByLink(q);
  else go(`/search?q=${encodeURIComponent(q)}`);
});

const STORE_NAMES = { amazon: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', vijaysales: 'Vijay Sales', reliancedigital: 'Reliance Digital', nykaa: 'Nykaa' };

function productCard(c) {
  const badge = c.saleStatus === 'real_drop' && c.realPct != null ? h('span', { class: 'badge good' }, `${pct(c.realPct)} below usual`) : null;
  return h('a', { class: 'card', href: `/p/${encodeURIComponent(c.key)}`, 'data-nav': true },
    h('div', { class: 'thumb' }, c.image ? h('img', { src: c.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null),
    h('div', { class: 'card-body' },
      h('span', { class: 'store' }, STORE_NAMES[c.store] ?? c.store),
      h('span', { class: 'title' }, c.title ?? 'Waiting for first price'),
      h('span', { class: 'price' }, c.inStock === false ? 'Out of stock' : rupees(c.price),
        c.mrp && c.price && c.mrp > c.price ? h('s', { class: 'mrp' }, rupees(c.mrp)) : null),
      badge));
}

function grid(cards, empty) {
  return cards.length ? h('div', { class: 'grid' }, cards.map(productCard)) : h('p', { class: 'muted' }, empty);
}

function linkForm(initial = '') {
  const status = h('p', { class: 'form-status', role: 'status' });
  const input = h('input', { name: 'url', type: 'url', required: true, value: initial, placeholder: 'Paste an Amazon, Flipkart or Myntra product link', 'aria-label': 'Product link' });
  const form = h('form', { class: 'track', onsubmit: (e) => { e.preventDefault(); addByLink(input.value, status); } },
    input, h('button', { type: 'submit' }, 'Check price history'));
  return h('div', {}, form, status);
}

async function addByLink(link, status) {
  if (status) status.textContent = 'Checking…';
  try {
    const { product } = await trackProduct(link);
    go(`/p/${encodeURIComponent(product.key)}`);
  } catch (e) {
    if (status) status.textContent = e.message;
    else alert(e.message);
  }
}

async function home() {
  app.replaceChildren(
    h('section', { class: 'hero' },
      h('h1', {}, 'Know the real price before you buy.'),
      h('p', { class: 'lede' }, 'Price history, honest discount checks and price-drop alerts for Indian stores. Paste a product link to start.'),
      linkForm(),
      h('p', { class: 'tip-line' }, 'Tip: put ', h('code', {}, `${location.host}/`), ' in front of any product link.'),
      h('p', { class: 'tip-line', id: 'bot-tip' })),
    h('section', {}, h('h2', {}, 'Real price drops'), h('p', { class: 'muted small' }, 'Judged against each product’s own usual price, not its M.R.P.'), h('div', { id: 'deals' }, h('p', { class: 'muted' }, 'Loading…'))),
    h('section', {}, h('h2', {}, 'Recently tracked'), h('div', { id: 'recent' }, h('p', { class: 'muted' }, 'Loading…'))));
  config().then((cfg) => {
    if (cfg?.telegram) document.getElementById('bot-tip')?.replaceChildren('On your phone? Send any product link to ', botLink(cfg.telegram.bot), ' on Telegram. No app or extension needed.');
  });
  const [d, r] = await Promise.allSettled([getDeals(), getRecent()]);
  document.getElementById('deals')?.replaceChildren(d.status === 'fulfilled' ? grid(d.value.results, 'No confirmed drops yet. A drop is only confirmed after 7 days of watching a product.') : h('p', { class: 'error' }, d.reason.message));
  document.getElementById('recent')?.replaceChildren(r.status === 'fulfilled' ? grid(r.value.results, 'Nothing tracked yet. Paste a link above.') : h('p', { class: 'error' }, r.reason.message));
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

async function productPage(key) {
  app.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  let view;
  try {
    view = (await getProduct(key)).product;
  } catch (e) {
    if (e.code === 'not_tracked' && new URLSearchParams(location.search).has('add')) {
      return addByLink(keyToLink(key) ?? '', null);
    }
    app.replaceChildren(h('section', {}, h('h1', {}, 'Not tracked yet'), h('p', {}, e.message), linkForm()));
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

  app.replaceChildren(
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
          h('a', { class: 'button', href: view.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, `Open on ${view.store.name}`))),
      view.pending ? h('p', { class: 'notice' }, view.pending) : null,
      h('div', { class: 'cards2' },
        h('section', { class: `verdict ${VERDICT_CLASS[view.verdict.kind]}` },
          h('h2', {}, view.verdict.headline),
          h('ul', {}, view.verdict.reasons.map((r) => h('li', {}, r)))),
        h('section', { class: `verdict ${SALE_CLASS[view.sale.status]}` },
          h('h2', {}, SALE_TITLE[view.sale.status]),
          h('p', {}, view.sale.explanation),
          view.sale.claimedPct != null ? h('p', { class: 'small' }, `Claimed: ${pct(view.sale.claimedPct)} off M.R.P. · Real: ${view.sale.realPct == null ? 'not known yet' : pct(view.sale.realPct) + ' vs usual'}`) : null)),
      h('section', {}, h('div', { class: 'chart-head' }, h('h2', {}, 'Price history'), rangeBar), chartHost),
      alertBox(view),
      h('dl', { class: 'stats' },
        stat('Lowest', s.lowest ? `${rupees(s.lowest.price)}` : '—', s.lowest ? date(s.lowest.at) : ''),
        stat('Highest', s.highest ? `${rupees(s.highest.price)}` : '—', s.highest ? date(s.highest.at) : ''),
        stat('Usual (median)', rupees(s.median), 'time-weighted'),
        stat('Price changes', String(s.changes), `${Math.floor(s.daysTracked)} days watched`))));
  drawChart(chartHost, view, range);
  if (location.hash === '#alert') document.getElementById('alert')?.scrollIntoView();
}

function stat(label, value, note) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value, note ? h('span', { class: 'muted small' }, ` ${note}`) : null));
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

async function searchPage(q) {
  app.replaceChildren(h('h1', {}, `Results for “${q}”`), h('p', { class: 'muted' }, 'Searching…'));
  try {
    const { results } = await searchProducts(q);
    app.replaceChildren(h('h1', {}, `Results for “${q}”`),
      grid(results, 'Nothing we track matches that. Paste the product’s link to start tracking it.'), linkForm());
  } catch (e) {
    app.replaceChildren(h('h1', {}, 'Search failed'), h('p', { class: 'error' }, e.message));
  }
}

async function dealsPage() {
  app.replaceChildren(h('h1', {}, 'Real price drops'), h('p', { class: 'muted' }, 'Loading…'));
  const [d, p] = await Promise.all([getDeals(), getPopular()]);
  app.replaceChildren(
    h('h1', {}, 'Real price drops'),
    h('p', { class: 'muted' }, 'Only products at least 5% below their own usual price (30-day time-weighted median), and not raised just before the “sale”.'),
    grid(d.results, 'No confirmed drops yet.'),
    h('h2', {}, 'Most viewed'), grid(p.results, 'Nothing yet.'));
}

async function storesPage() {
  const { stores } = await getStores();
  const label = { yes: 'Our server reads it', refused: 'Refuses our server', no_answer: 'Does not answer our server', untested: 'Not tested yet' };
  app.replaceChildren(h('h1', {}, 'Stores'),
    h('p', { class: 'muted' }, 'Our server identifies itself honestly and never works around a store’s bot defences. Stores that refuse it are read by the browser extension, from pages you are already viewing.'),
    h('table', { class: 'stores' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Store'), h('th', {}, 'Server'), h('th', {}, 'What we measured'))),
      h('tbody', {}, stores.map((s) => h('tr', {}, h('td', {}, s.name), h('td', {}, label[s.serverFetch]), h('td', { class: 'small' }, s.measured))))));
}

/** Inside the Britto Android app (it adds "BrittoApp/<version>" to its WebView's User-Agent). */
const inApp = /\bBrittoApp\//.test(navigator.userAgent);

/**
 * Super Browse (BLUEPRINT §18): every store Britto knows, opened in the app's in-app browser,
 * where Britto reads the page you are looking at. In a normal browser the tiles just open the
 * store (the extension reads it there).
 */
async function browsePage() {
  const { stores } = await getStores();
  app.replaceChildren(h('h1', {}, 'Super Browse'),
    h('p', { class: 'muted' }, inApp
      ? 'Open a store and shop as usual. On every product page Britto shows its price history and reads the price from the page you are looking at.'
      : 'Open a store and shop as usual. With the Britto extension (or the Britto Android app) you see the price history on every product page.'),
    h('div', { class: 'store-grid' }, stores.map((s) => h('a', { class: 'store-tile', href: s.home, rel: 'noopener', 'data-store': s.id },
      h('span', { class: 'store-name' }, s.name),
      h('span', { class: 'small muted' }, s.serverFetch === 'yes' ? 'Prices also checked by our server' : 'Prices from shoppers\u2019 own pages')))));
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
    mine.replaceChildren(...here.map((a) => h('li', {},
      h('span', {}, `${a.description}`, a.lastFiredAt ? h('span', { class: 'muted small' }, ` · sent ${date(a.lastFiredAt)}`) : null),
      h('button', { type: 'button', class: 'link', onclick: async () => {
        try { show((await removeAlert(a.id)).me); status.textContent = 'Alert removed.'; } catch (err) { status.textContent = err.message; }
      } }, 'Remove'))));
    if (here.length) channelHint(channels, me);
  }
  box.append(mine, form, status, channels);
  getMe().then(show).catch(() => {});
  return box;
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
  host.replaceChildren(...parts, row);
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
  app.replaceChildren(h('h1', {}, 'My alerts'), h('p', { class: 'muted' }, 'Loading…'));
  const [cfg, me] = await Promise.all([config(), getMe()]);
  const list = (me?.alerts ?? []);
  const channels = h('div', { class: 'channels' });
  const testStatus = h('span', { class: 'small', role: 'status' });
  app.replaceChildren(
    h('h1', {}, 'My alerts'),
    h('p', { class: 'muted' }, 'No account and no password: your alerts belong to this browser. Connect Telegram to get them on your phone too.'),
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
  if (me) channelHint(channels, me);
  else channels.replaceChildren(h('p', { class: 'small muted' }, 'Set your first alert on a product page, then choose where it reaches you.'));
}

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'britto-push' && location.pathname === '/alerts') alertsPage();
});

function route() {
  const { pathname, search } = location;
  window.scrollTo(0, 0);
  const done = (p) => p?.catch?.((e) => app.replaceChildren(h('p', { class: 'error' }, e.message)));
  if (pathname.startsWith('/p/')) return done(productPage(decodeURIComponent(pathname.slice(3))));
  if (pathname === '/search') return done(searchPage(new URLSearchParams(search).get('q') ?? ''));
  if (pathname === '/deals') return done(dealsPage());
  if (pathname === '/stores') return done(storesPage());
  if (pathname === '/browse') return done(browsePage());
  if (pathname === '/alerts') return done(alertsPage());
  return done(home());
}

route();
