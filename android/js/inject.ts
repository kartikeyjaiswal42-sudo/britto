// The page reader the Android app runs in every store page its in-app browser shows
// (StoreActivity, BLUEPRINT §18 "Super Browse"). It is the extension's own reader
// (extension/src/reader.ts) with another way to the server: `BrittoBridge`, a WebView message
// listener that WebView creates only in the stores' own pages, speaking the same §7.5 messages
// as the extension's service worker (native side: BridgeCore.java). The served reader config is
// checked HERE (configFromServed), exactly as the extension's service worker checks it.
import { configFromServed } from '../../core/recipe.ts';
import type { ConfigReply, Request } from '../../extension/src/messages.ts';
import { startReader } from '../../extension/src/reader.ts';

interface NativeBridge {
  postMessage(data: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}
declare const BrittoBridge: NativeBridge | undefined;

const w = window as unknown as { __brittoStarted?: boolean };
const pending = new Map<number, (v: unknown) => void>();
let seq = 0;

function ask(bridge: NativeBridge, msg: Request): Promise<unknown> {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    bridge.postMessage(JSON.stringify({ id, msg }));
  });
}

async function send(bridge: NativeBridge, msg: Request): Promise<unknown> {
  if (msg.type !== 'getReaderConfig') return ask(bridge, msg);
  // Native answers {ok: true, body: <the served config>} or {ok: false, code, message}.
  const r = (await ask(bridge, msg)) as { ok: true; body: unknown } | { ok: false; code: string; message: string };
  if (!r.ok) return r;
  const c = configFromServed(r.body);
  const reply: ConfigReply = c.ok
    ? { ok: true, config: c.config, version: c.version }
    : { ok: false, code: 'bad_config', message: `Britto sent a reader it could not check (${c.errors[0] ?? ''})` };
  return reply;
}

// The top page only (not ad or payment frames), once per page; the reader itself watches the
// address, for stores that change product without loading a new page.
const bridge = typeof BrittoBridge === 'undefined' ? undefined : BrittoBridge;
if (bridge && window.top === window && !w.__brittoStarted) {
  w.__brittoStarted = true;
  bridge.onmessage = (event) => {
    const { id, reply } = JSON.parse(event.data) as { id: number; reply: unknown };
    const resolve = pending.get(id);
    pending.delete(id);
    resolve?.(reply);
  };
  // device 'mobile': a phone shows the store's mobile pages. Until a mobile recipe is verified
  // the server serves the desktop one (features.deviceFallback) and an unreadable page says so.
  const start = () => startReader({ send: (msg) => send(bridge, msg), device: 'mobile', savePage: null });
  // WebView may run this at document start, before the page exists.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
