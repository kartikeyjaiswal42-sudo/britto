// THE ONLY FILE THAT TALKS TO THE SERVER. Every screen gets data through these functions;
// the Claude Design UI must do the same (see DESIGN-BRIEF.md). Shapes: core/types.ts.

async function call(path, init = {}) {
  const headers = { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) };
  const res = await fetch(path, { ...init, headers });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const err = new Error(body?.error?.message ?? `Request failed (${res.status})`);
    err.code = body?.error?.code ?? `http_${res.status}`;
    err.status = res.status;
    throw err;
  }
  return body;
}

/** Start tracking a product by its link. -> { created: boolean, product: ProductView } */
export const trackProduct = (url) => call('/api/products', { method: 'POST', body: JSON.stringify({ url }) });

/** -> { product: ProductView }. Throws with code 'not_tracked' if nobody has added it. */
export const getProduct = (key) => call(`/api/products/${encodeURIComponent(key)}`);

/** -> { q, results: ProductCard[] } */
export const searchProducts = (q) => call(`/api/search?q=${encodeURIComponent(q)}`);

/** The stores' own search results, read by our server where allowed, plus a link to every
 * store's search page. -> { q, stores: [{ store, name, status, items, at }], tracked: ProductCard[], links } */
export const storeSearch = (q) => call(`/api/store-search?q=${encodeURIComponent(q)}`);

/** Products cheaper now than at our reading before ("was ₹X, now ₹Y"). -> { results: ProductCard[] } */
export const getDrops = (store) => call(`/api/drops${store ? `?store=${encodeURIComponent(store)}` : ''}`);

/** Real price drops only (judged against the product's usual price). -> { results: ProductCard[] } */
export const getDeals = (filter = {}) => {
  const q = new URLSearchParams();
  if (filter.store) q.set('store', filter.store);
  if (filter.min) q.set('min', String(filter.min));
  return call(`/api/deals${q.size ? `?${q}` : ''}`);
};
export const getSimilar = (key) => call(`/api/products/${encodeURIComponent(key)}/similar`);

/** -> { results: ProductCard[] } */
export const getRecent = () => call('/api/recent');

/** -> { results: ProductCard[] } most viewed */
export const getPopular = () => call('/api/popular');

/** -> { stores: Store[] } with the measured "can our server read it" line for each. */
export const getStores = () => call('/api/stores');

// ---- alerts: no account and no password. The browser holds a random device token (kept in
// localStorage; the server stores only its hash). Telegram, once connected, carries alerts to
// the phone, and the bot can be used without this website at all.

const TOKEN_KEY = 'britto.device';
function readToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function saveToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked */ } }
function forgetToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } }

/** Which alert channels this site has switched on. -> AppConfig */
export const getConfig = () => call('/api/config');

/** This browser's alerts and channels, or null if it has never set an alert. -> MeView | null */
export async function getMe() {
  const token = readToken();
  if (!token) return null;
  try {
    return (await call('/api/me', { headers: { authorization: `Bearer ${token}` } })).me;
  } catch (e) {
    if (e.code === 'no_device') { forgetToken(); return null; }
    throw e;
  }
}

/** A call as this browser, registering it first if needed. */
async function asDevice(path, init = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let token = readToken();
    if (!token) {
      saveToken((await call('/api/me', { method: 'POST' })).token);
      token = readToken();
      if (!token) {
        const err = new Error('This browser does not let websites save anything, so alerts cannot be kept here. Use the Telegram bot instead.');
        err.code = 'no_storage';
        throw err;
      }
    }
    try {
      return await call(path, { ...init, headers: { authorization: `Bearer ${token}` } });
    } catch (e) {
      if (e.code !== 'no_device' || attempt) throw e;
      forgetToken();
    }
  }
  throw new Error('unreachable');
}

/** rule: {kind:'below', target: paise} | {kind:'drop', pct} | {kind:'in_stock'}. -> { alert: AlertView, me: MeView } */
export const setAlert = (key, rule) => asDevice('/api/alerts', { method: 'POST', body: JSON.stringify({ key, rule }) });
/** -> { me: MeView } */
export const removeAlert = (id) => asDevice(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
/** -> { url: 'https://t.me/<bot>?start=<one-time code>', bot, expiresAt } */
export const connectTelegram = () => asDevice('/api/me/telegram', { method: 'POST' });
/** -> { me: MeView } */
export const disconnectTelegram = () => asDevice('/api/me/telegram', { method: 'DELETE' });
/** subscription: PushSubscription.toJSON(). -> { me: MeView } */
export const savePush = (subscription) => asDevice('/api/me/push', { method: 'POST', body: JSON.stringify({ subscription }) });
export const deletePush = (subscription) => asDevice('/api/me/push', { method: 'DELETE', body: JSON.stringify({ subscription }) });
/** Send a test message to every channel. -> { result: DeliveryResult } */
export const sendTest = () => asDevice('/api/me/test', { method: 'POST' });

/** "251", "251.5", "1,763.31", "₹251" -> paise, or null. Never through a float. */
export function toPaise(text) {
  const m = /^\s*(?:₹|rs\.?)?\s*(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const paise = Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

// ---- formatting shared by every screen (mirrors core/money.ts) ----

export function rupees(paise) {
  if (paise == null) return '—';
  const r = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  const d = String(r);
  const g = d.length <= 3 ? d : `${d.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${d.slice(-3)}`;
  return `${paise < 0 ? '-' : ''}₹${g}${p ? '.' + String(p).padStart(2, '0') : ''}`;
}

export const pct = (f) => (f == null || !Number.isFinite(f) ? '—' : `${Math.round(f * 100)}%`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "26 Oct 2026" in India time, whatever the viewer's clock zone. */
export function date(ms) {
  if (ms == null) return '—';
  const d = new Date(ms + 5.5 * 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function ago(ms) {
  if (ms == null) return 'never';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export const getGroceryPlatforms = () => call('/api/grocery/platforms');

/** "Did this code work?" -> { votes: { worked, total } } (last 30 days). */
export const voteCoupon = (store, code, worked) => call('/api/coupons/vote', { method: 'POST', body: JSON.stringify({ store, code, worked }) });
