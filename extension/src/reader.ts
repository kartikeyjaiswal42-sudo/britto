// The page reader every Britto client runs: the extension's content script and the Android
// app's in-app browser inject this same code (BLUEPRINT §18: one bundle, so they cannot
// drift apart). On a product page it reads the price with the reader config the Britto server
// serves (BLUEPRINT §6: readers are data), reports it, and shows the Britto panel. It ships
// only the interpreter (core/interpret.ts), no store recipes: a store changing its page is
// fixed on the server, never by a new release. The host supplies the transport to the server
// (§7.5 messages), the device class, and what "Save this page" does.
import { confirmIdentity, readOrders, readPage } from '../../core/interpret.ts';
import type { ReaderConfig } from '../../core/recipe.ts';
import { parseProductLink, storeOfPage } from '../../core/stores.ts';
import type { Extracted, StoreId } from '../../core/types.ts';
import type { ConfigReply, ObservedPayload, Reply, Request } from './messages.ts';
import { renderNotice, renderPanel } from './panel.ts';

export interface ReaderHost {
  send(msg: Request): Promise<unknown>;
  device: 'desktop' | 'mobile';
  /** What the panel's save button does; null = the host has its own save control. */
  savePage: ((store: StoreId) => void) | null;
}

let host: ReaderHost;
const send = <T>(msg: Request) => host.send(msg) as Promise<T>;

/** Stores render prices after load: try a few times (waits in ms) before calling a page unreadable. */
const WAITS = [600, 900, 1500, 3000];

let handledUrl = '';
/** The address this document was loaded with (set when the reader starts). */
let loadedUrl = '';
const RELOADED = 'britto.reloaded';

/**
 * Flipkart and Myntra open a product from their search pages WITHOUT loading it: the address
 * changes, but the page keeps the data it was loaded with (measured 2026-11-04 in the app: a
 * Flipkart product reached from search carried the search page's ItemList, no Product data, so
 * nothing could be read; the same address loaded directly read ₹1,849). So a product page that
 * cannot be read after such a change is loaded once, for real. Once per PRODUCT per tab
 * (sessionStorage): keyed by the address, a store that rewrites its address on every load
 * would be reloaded in a loop. Without storage, never.
 */
function reloadOnce(url: string, key: string): boolean {
  if (url === loadedUrl) return false;
  try {
    if (sessionStorage.getItem(RELOADED) === key) return false;
    sessionStorage.setItem(RELOADED, key);
  } catch {
    return false;
  }
  location.reload();
  return true;
}

async function readThisPage(config: ReaderConfig, pid: string): Promise<Extracted> {
  let last: Extracted | null = null;
  for (const wait of WAITS) {
    await new Promise((r) => setTimeout(r, wait));
    // confirmIdentity: right after a single-page navigation the page can still show the
    // PREVIOUS product. Such a reading names another id, is refused, and we try again.
    last = confirmIdentity(config.store, pid, readPage(config, document.documentElement.outerHTML, location.href), config.reportsPid);
    if (last.status === 'priced' || last.status === 'unavailable' || last.status === 'blocked') return last;
  }
  return last!;
}

/**
 * Spend Lens (BLUEPRINT §13): on the shopper's own order-history page, keep the orders it shows
 * ON THIS DEVICE (saveOrders goes to the extension's local storage or the app's own storage,
 * never to Britto's server). Only with a reader whose orderHistory section was verified against
 * a real order page; otherwise nothing is read.
 */
async function readOrderPage(url: string): Promise<void> {
  const store = storeOfPage(url);
  if (!store) return;
  const reader = await send<ConfigReply>({ type: 'getReaderConfig', store, device: host.device });
  const rule = reader?.ok ? reader.config.domRecipe.orderHistory : undefined;
  if (!reader?.ok || !rule?.verified || !new RegExp(rule.page).test(url)) return;
  for (const wait of WAITS) {
    await new Promise((r) => setTimeout(r, wait));
    if (location.href !== url) return;
    const orders = readOrders(reader.config, document.documentElement.outerHTML, url);
    if (orders?.length) {
      const kept = await send<{ ok: boolean; kept?: number }>({ type: 'saveOrders', store, orders });
      if (kept?.ok) renderNotice(`${orders.length} order${orders.length === 1 ? '' : 's'} kept for Spend Lens on this device. Nothing was uploaded.`);
      return;
    }
  }
}

async function run(): Promise<void> {
  const url = location.href;
  if (url === handledUrl) return;
  handledUrl = url;
  const parsed = parseProductLink(url);
  if (!parsed.ok) {
    await readOrderPage(url);
    return;
  }
  const { store, pid, key } = parsed.link;
  const panel = renderPanel(store, host.savePage);
  panel.loading();

  const reader = await send<ConfigReply>({ type: 'getReaderConfig', store, device: host.device });
  if (location.href !== url) return;
  if (!reader?.ok) {
    const none: Extracted = { status: 'unrecognised', title: null, price: null, mrp: null, inStock: null, image: null, pid: null, rule: 'no-reader' };
    panel.show(await send<Reply>({ type: 'getProductAnswer', key }), none, `Britto cannot read this page right now: ${reader?.message ?? 'no reader'}.`);
    return;
  }

  const ex = await readThisPage(reader.config, pid);
  if (location.href !== url) return; // the shopper moved on (single-page store navigation)

  if (ex.status === 'priced' || ex.status === 'unavailable') {
    const observed: ObservedPayload = { status: ex.status, title: ex.title, image: ex.image, price: ex.price, mrp: ex.mrp };
    panel.show(await send<Reply>({ type: 'postObservation', url, observed, configVersion: reader.version }), ex, null);
  } else if (ex.status === 'unrecognised' && reloadOnce(url, key)) {
    panel.loading();
  } else {
    // Not read: count it for reader health (store, outcome, config version: nothing from the
    // page), show whatever history exists, say so plainly, and offer to save the page so a
    // reader can be built from it (it stays on this computer).
    void send({ type: 'reportTelemetry', store, outcome: ex.status === 'blocked' ? 'blocked' : 'unrecognised', configVersion: reader.version });
    const reply = await send<Reply>({ type: 'getProductAnswer', key });
    panel.show(reply, ex, ex.status === 'unrecognised' ? 'Britto cannot read the price on this page yet.' : 'This page did not load properly.');
  }
}

/** Start once per page. Flipkart and Myntra change product without a page load: watch the address. */
export function startReader(h: ReaderHost): void {
  host = h;
  loadedUrl = location.href;
  run();
  setInterval(() => { if (location.href !== handledUrl) run(); }, 1000);
}
