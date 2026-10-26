// Content script: on a product page the shopper is viewing, read the price with the reader
// config the Britto server serves (BLUEPRINT §6: readers are data), report it, and show the
// Britto panel. This script ships only the interpreter (core/interpret.ts), no store recipes:
// a store changing its page is fixed on the server, never by a new extension release.
import { confirmIdentity, readPage } from '../../core/interpret.ts';
import type { ReaderConfig } from '../../core/recipe.ts';
import { parseProductLink } from '../../core/stores.ts';
import type { Extracted } from '../../core/types.ts';
import type { ConfigReply, ObservedPayload, Reply, Request } from './messages.ts';
import { renderPanel } from './panel.ts';

const send = <T>(msg: Request) => chrome.runtime.sendMessage(msg) as Promise<T>;

/** Stores render prices after load: try a few times (waits in ms) before calling a page unreadable. */
const WAITS = [600, 900, 1500, 3000];

let handledUrl = '';

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

async function run(): Promise<void> {
  const url = location.href;
  if (url === handledUrl) return;
  handledUrl = url;
  const parsed = parseProductLink(url);
  if (!parsed.ok) return;
  const { store, pid, key } = parsed.link;
  const panel = renderPanel(store);
  panel.loading();

  const reader = await send<ConfigReply>({ type: 'getReaderConfig', store, device: 'desktop' });
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
  } else {
    // Not read: count it for reader health (store, outcome, config version: nothing from the
    // page), show whatever history exists, say so plainly, and offer to save the page so a
    // reader can be built from it (it stays on this computer).
    void send({ type: 'reportTelemetry', store, outcome: ex.status === 'blocked' ? 'blocked' : 'unrecognised', configVersion: reader.version });
    const reply = await send<Reply>({ type: 'getProductAnswer', key });
    panel.show(reply, ex, ex.status === 'unrecognised' ? 'Britto cannot read the price on this page yet.' : 'This page did not load properly.');
  }
}

run();
// Flipkart and Myntra change product without a page load: watch the address.
setInterval(() => { if (location.href !== handledUrl) run(); }, 1000);
