import { readerEnough, readPage } from '../core/interpret.ts';
import type { ReaderConfig } from '../core/recipe.ts';
import { STORES, parseProductLink, type ParsedLink } from '../core/stores.ts';
import type { Extracted, StoreId } from '../core/types.ts';

// The fetcher says who it is. It never borrows a browser's identity, never retries
// through a different disguise, and never works around a store's bot defences: a
// store that refuses it is read by the browser extension instead.
export function botUserAgent(siteUrl: string | undefined): string {
  const base = (siteUrl ?? 'https://britto.invalid').replace(/\/+$/, '');
  return `BrittoBot/0.1 (+${base}/bot; price history for shoppers)`;
}

const MAX_BYTES = 3_000_000;

export type FetchOutcome =
  | { ok: true; extracted: Extracted; httpStatus: number }
  | { ok: false; code: 'http_error' | 'timeout' | 'network' | 'too_large' | 'reader_error'; httpStatus: number | null; detail: string };

/** Fetch a product page and read it with `reader` (the config getReader chose). */
export async function fetchProduct(reader: ReaderConfig, url: string, siteUrl: string | undefined): Promise<FetchOutcome> {
  let res: Response;
  try {
    res = await fetch(url, {
      // identity: decompressing a ~1 MB page was the largest CPU cost (7-12 ms locally) and
      // Amazon honours it (measured: 882 KB plain vs 182 KB gzip). Bytes are free; CPU is not.
      headers: { 'User-Agent': botUserAgent(siteUrl), Accept: 'text/html', 'Accept-Language': 'en-IN,en;q=0.8', 'Accept-Encoding': 'identity' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    return { ok: false, code: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', httpStatus: null, detail: String(e) };
  }
  if (res.status !== 200) {
    await res.body?.cancel();
    return { ok: false, code: 'http_error', httpStatus: res.status, detail: `HTTP ${res.status}` };
  }
  let html: string;
  try {
    html = await readUntilEnough(res, reader);
  } catch (e) {
    return { ok: false, code: 'network', httpStatus: 200, detail: `connection broke mid-page: ${String(e)}` };
  }
  if (html.length > MAX_BYTES) return { ok: false, code: 'too_large', httpStatus: 200, detail: `${html.length} chars` };
  // A reader that throws (a config no saved page exercised) is a failure like any other,
  // recorded against the product. Thrown, it ended the cron run before every product after
  // this one, and this product, never marked as attempted, came first again the next run.
  try {
    return { ok: true, extracted: readPage(reader, html, url), httpStatus: 200 };
  } catch (e) {
    return { ok: false, code: 'reader_error', httpStatus: null, detail: String(e) };
  }
}

/**
 * Stream the page and stop as soon as readerEnough() says the answer cannot change, then
 * cancel the rest of the download. Decoding a whole ~1 MB Amazon page measured 9 ms of
 * CPU on Cloudflare against a 10 ms free-plan limit; the parts we read sit in its first ~40%.
 */
async function readUntilEnough(res: Response, config: ReaderConfig): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parts: string[] = [];
  let size = 0;
  let sinceCheck = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.length;
      sinceCheck += value.length;
      if (size > MAX_BYTES) break;
      // Check every ~32 KB, not every chunk: readerEnough() rescans the text so far.
      // Nothing we read is in the first 64 KB on any fixture (the earliest is ~13% of ~1 MB).
      if (size >= 65_536 && sinceCheck >= 32_768) {
        sinceCheck = 0;
        const text = parts.join('');
        parts.length = 0;
        parts.push(text);
        // A reader that throws cannot say "enough": read on, and readPage decides below.
        let enough = false;
        try { enough = readerEnough(config, text); } catch { /* read on */ }
        if (enough) break;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return parts.join('');
}

/**
 * Follow a store's own link shortener (amzn.in/…) to the product it points at.
 * Only hosts listed as that store's shortHosts are followed, at most 4 hops, and the
 * final URL must parse as a product of the SAME store.
 */
export async function resolveShortLink(store: StoreId, url: string, siteUrl: string | undefined): Promise<ParsedLink | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: 'GET',
        headers: { 'User-Agent': botUserAgent(siteUrl) },
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      return null;
    }
    await res.body?.cancel();
    const location = res.headers.get('location');
    if (!location) return null;
    const next = new URL(location, current).toString();
    const parsed = parseProductLink(next);
    if (parsed.ok) return parsed.link.store === store ? parsed.link : null;
    if (parsed.reason !== 'short_link' || !STORES[store].shortHosts.includes(new URL(next).hostname)) {
      // A redirect to the store itself that is not yet a product URL (e.g. a /d/ hop): keep following.
      if (!STORES[store].hosts.includes(new URL(next).hostname)) return null;
    }
    current = next;
  }
  return null;
}
