// The schema.org Product block many stores embed for search engines. Generic, so any recipe
// may read from it (Field.jsonld); each store must still be VERIFIED against a real page
// before its price is trusted (the embedded price is not always the price a shopper pays).
import { rupeesToPaise } from './money.ts';
import { jsonPath } from './recipe.ts';
import type { Extracted } from './types.ts';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function* jsonLdNodes(html: string): Generator<Record<string, Json>> {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let data: Json;
    try {
      data = JSON.parse(m[1] ?? '') as Json;
    } catch {
      continue;
    }
    const stack: Json[] = [data];
    while (stack.length) {
      const n = stack.pop();
      if (Array.isArray(n)) stack.push(...n);
      else if (n && typeof n === 'object') {
        yield n;
        const g = n['@graph'];
        if (Array.isArray(g)) stack.push(...g);
      }
    }
  }
}

const isType = (n: Record<string, Json>, t: string) => n['@type'] === t || (Array.isArray(n['@type']) && n['@type'].includes(t));

/** The page's first schema.org Product node, or null. */
export function jsonLdProductNode(html: string): Record<string, unknown> | null {
  for (const n of jsonLdNodes(html)) if (isType(n, 'Product')) return n;
  return null;
}

/** A value from the Product node by path ("name", "offers.price"), as text; null if absent. */
export function jsonLdValue(html: string, path: string): string | null {
  return jsonLdPath(jsonLdProductNode(html), path);
}

/** jsonLdValue on an already-found Product node (a reading parses the page's JSON-LD once). */
export function jsonLdPath(node: Record<string, unknown> | null, path: string): string | null {
  if (!node) return null;
  let v = jsonPath(node, path);
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Record<string, unknown>)['url'] === 'string') v = (v as Record<string, unknown>)['url'];
  if (Array.isArray(v)) v = v[0];
  return v == null || typeof v === 'object' ? null : String(v);
}

function result(partial: Partial<Extracted> & Pick<Extracted, 'status' | 'rule'>): Extracted {
  return { title: null, price: null, mrp: null, inStock: null, image: null, pid: null, ...partial };
}

/** A whole reading from JSON-LD alone. Kept as a generic candidate reader and for its test. */
export function jsonLdProduct(html: string): Extracted {
  const n = jsonLdProductNode(html);
  if (!n) return result({ status: 'unrecognised', rule: 'jsonld:none' });
  const title = typeof n['name'] === 'string' ? n['name'].replace(/\s+/g, ' ').trim() || null : null;
  const image = jsonLdValue(html, 'image');
  const offersRaw = n['offers'];
  const offer = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Record<string, unknown> | null | undefined;
  if (!offer || typeof offer !== 'object') return result({ status: 'unrecognised', title, image, rule: 'jsonld:no-offer' });
  const availability = String(offer['availability'] ?? '');
  if (/OutOfStock|SoldOut|Discontinued/i.test(availability)) return result({ status: 'unavailable', title, image, inStock: false, rule: 'jsonld' });
  const price = rupeesToPaise(offer['price'] ?? offer['lowPrice'] ?? null);
  if (price == null || !/InStock|LimitedAvailability|OnlineOnly/i.test(availability)) {
    return result({ status: 'unrecognised', title, image, rule: 'jsonld:no-price' });
  }
  return result({ status: 'priced', title, image, price, inStock: true, rule: 'jsonld' });
}
