// Service worker: the ONLY part of the extension that talks to the Britto API. It sends what
// the content script read from a product page (url, title, image, price, M.R.P., stock) and
// nothing else: no cookies, no browsing history, no account details.
import { parseProductLink } from '../../core/stores.ts';
import type { Reply, Request } from './messages.ts';

declare const BRITTO_API: string; // set at build time (scripts/build-ext.mjs)

/** The same reading re-seen within 30 minutes is not re-sent; the panel just loads the view. */
const RESEND_AFTER = 30 * 60_000;

async function call(path: string, init?: RequestInit): Promise<Reply> {
  try {
    const res = await fetch(BRITTO_API + path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !body) {
      const err = (body?.['error'] ?? {}) as { code?: string; message?: string };
      return { ok: false, code: err.code ?? `http_${res.status}`, message: err.message ?? `Britto answered ${res.status}` };
    }
    return { ok: true, ...(body as object) } as Reply;
  } catch (e) {
    return { ok: false, code: 'network', message: `Could not reach Britto (${String(e)})` };
  }
}

/** True when this exact reading was sent recently. Records the send otherwise. */
async function sentRecently(signature: string): Promise<boolean> {
  const key = `sent:${signature}`;
  const got = await chrome.storage.session.get(key);
  const at = got[key] as number | undefined;
  if (at && Date.now() - at < RESEND_AFTER) return true;
  await chrome.storage.session.set({ [key]: Date.now() });
  return false;
}

async function handle(msg: Request): Promise<Reply> {
  if (msg.type === 'view') return call(`/api/products/${encodeURIComponent(msg.key)}`);
  const parsed = parseProductLink(msg.url);
  if (!parsed.ok) return { ok: false, code: 'not_a_product', message: 'Not a product page.' };
  const o = msg.observed;
  if (await sentRecently(`${parsed.link.key}|${o.status}|${o.price}|${o.mrp}`)) {
    const view = await call(`/api/products/${encodeURIComponent(parsed.link.key)}`);
    if (view.ok) return { ...view, recorded: 'skip', reason: 'sent_recently' };
  }
  return call('/api/observations', { method: 'POST', body: JSON.stringify({ url: msg.url, observed: o }) });
}

chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
  handle(msg).then(sendResponse);
  return true; // keep the channel open for the async reply
});
