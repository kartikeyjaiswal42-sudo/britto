// Readings with the BUNDLED reader configs. Since P3 every store reader is data
// (readers/*.json) run by one interpreter (core/interpret.ts); this module keeps the old
// names for callers and tests that read with the bundled configs. Live paths use the config
// the server serves (api/readers.ts), which may be a newer D1 override.
//
// THE RULE: a price comes only from the recipe's own price fields for THIS product. When the
// "you pay" element is absent we say so ('unavailable' / 'unrecognised'); we never fall back
// to "the first ₹ on the page".
import { bundledReader } from '../readers/index.ts';
import { confirmIdentity as confirmPageIdentity, readerEnough, readPage } from './interpret.ts';
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

/** core/interpret.ts confirmIdentity, with the bundled config's reportsPid by default. */
export function confirmIdentity(store: StoreId, linkPid: string, ex: Extracted, reportsPid = reader(store).reportsPid): Extracted {
  return confirmPageIdentity(store, linkPid, ex, reportsPid);
}
