// Readings with the BUNDLED reader configs. Since P3 every store reader is data
// (readers/*.json) run by one interpreter (core/interpret.ts); this module keeps the old
// names for callers and tests that read with the bundled configs. Live paths use the config
// the server serves (api/readers.ts), which may be a newer D1 override.
//
// THE RULE: a price comes only from the recipe's own price fields for THIS product. When the
// "you pay" element is absent we say so ('unavailable' / 'unrecognised'); we never fall back
// to "the first ₹ on the page".
import { bundledReader } from '../readers/index.ts';
import { readerEnough, readPage } from './interpret.ts';
import type { Extracted, StoreId } from './types.ts';

export { jsonLdProduct } from './jsonld.ts';

function reader(store: StoreId) {
  const r = bundledReader(store, 'desktop');
  if (!r) throw new Error(`no bundled reader for ${store}`);
  return r.config;
}

export function extract(store: StoreId, html: string, url = ''): Extracted {
  return readPage(reader(store), html, url);
}

/** See readerEnough: extract(prefix) === extract(full page) whenever enough(prefix). */
export function enough(store: StoreId, html: string): boolean {
  return readerEnough(reader(store), html);
}

/**
 * Accept a reading only if the page says it shows the product the link names. A reading
 * that names another product, or (for stores whose readers report it) names none, becomes
 * 'unrecognised' — never filed under the wrong product.
 */
export function confirmIdentity(store: StoreId, linkPid: string, ex: Extracted, reportsPid = reader(store).reportsPid): Extracted {
  if (ex.status !== 'priced' && ex.status !== 'unavailable') return ex;
  const expected = store === 'flipkart' ? linkPid.split('.')[0] : linkPid;
  if (ex.pid === expected) return ex;
  if (ex.pid == null && !reportsPid) return ex;
  return { ...ex, status: 'unrecognised', price: null, mrp: null, inStock: null, rule: `${ex.rule}+identity-mismatch(${ex.pid ?? 'none'})` };
}
