// Content script: on a product page the shopper is viewing, read the price with the SAME
// readers the server uses (core/extract.ts), report it, and show the Britto panel.
import { confirmIdentity, extract } from '../../core/extract.ts';
import { parseProductLink } from '../../core/stores.ts';
import type { Extracted } from '../../core/types.ts';
import type { ObservedPayload, Reply, Request } from './messages.ts';
import { renderPanel } from './panel.ts';

const send = (msg: Request) => chrome.runtime.sendMessage(msg) as Promise<Reply>;

/** Stores render prices after load: try a few times (waits in ms) before calling a page unreadable. */
const WAITS = [600, 900, 1500, 3000];

let handledUrl = '';

async function readPage(store: Parameters<typeof extract>[0], pid: string): Promise<Extracted> {
  let last: Extracted | null = null;
  for (const wait of WAITS) {
    await new Promise((r) => setTimeout(r, wait));
    // confirmIdentity: right after a single-page navigation the page can still show the
    // PREVIOUS product. Such a reading names another id, is refused, and we try again.
    last = confirmIdentity(store, pid, extract(store, document.documentElement.outerHTML));
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
  const panel = renderPanel(parsed.link.store);
  panel.loading();

  const ex = await readPage(parsed.link.store, parsed.link.pid);
  if (location.href !== url) return; // the shopper moved on (single-page store navigation)

  let reply: Reply;
  if (ex.status === 'priced' || ex.status === 'unavailable') {
    const observed: ObservedPayload = { status: ex.status, title: ex.title, image: ex.image, price: ex.price, mrp: ex.mrp };
    reply = await send({ type: 'observe', url, observed });
    panel.show(reply, ex, null);
  } else {
    // Not read: show whatever history exists, say so plainly, and offer to save the page
    // so a reader can be built from it (it stays on this computer).
    reply = await send({ type: 'view', key: parsed.link.key });
    panel.show(reply, ex, ex.status === 'unrecognised' ? 'Britto cannot read the price on this page yet.' : 'This page did not load properly.');
  }
}

run();
// Flipkart and Myntra change product without a page load: watch the address.
setInterval(() => { if (location.href !== handledUrl) run(); }, 1000);
