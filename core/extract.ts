import { elementById, elementWithClass, attr, openingTagById, textOf, textOfClass } from './html.ts';
import { parseRupees, rupeesToPaise } from './money.ts';
import type { Extracted, StoreId } from './types.ts';

// THE RULE: a price comes only from the store's own "you pay" element for THIS product.
// Product pages are full of other prices (similar items, sponsored rows, A+ content,
// other variants). An out-of-stock Amazon page still carries a dozen rupee figures —
// none of them is this product's price. When the "you pay" element is absent we say
// so ('unavailable' / 'unrecognised'); we never fall back to "the first ₹ on the page".

export function extract(store: StoreId, html: string): Extracted {
  if (store === 'amazon') return amazon(html);
  if (store === 'myntra') return myntra(html);
  return flipkart(html);
}

function result(partial: Partial<Extracted> & Pick<Extracted, 'status' | 'rule'>): Extracted {
  return { title: null, price: null, mrp: null, inStock: null, image: null, pid: null, ...partial };
}

/** Stores whose reader always reports the page's own product id (so a missing id is suspicious). */
const READERS_REPORT_PID: Record<StoreId, boolean> = { amazon: true, myntra: true, flipkart: false };

/**
 * Accept a reading only if the page says it shows the product the link names. A reading
 * that names another product, or (for stores whose readers report it) names none, becomes
 * 'unrecognised' — never filed under the wrong product.
 */
export function confirmIdentity(store: StoreId, linkPid: string, ex: Extracted): Extracted {
  if (ex.status !== 'priced' && ex.status !== 'unavailable') return ex;
  const expected = store === 'flipkart' ? linkPid.split('.')[0] : linkPid;
  if (ex.pid === expected) return ex;
  if (ex.pid == null && !READERS_REPORT_PID[store]) return ex;
  return { ...ex, status: 'unrecognised', price: null, mrp: null, inStock: null, rule: `${ex.rule}+identity-mismatch(${ex.pid ?? 'none'})` };
}

// ---------------------------------------------------------------- Amazon.in

// Robot-check markers. NOT verified against a captured robot-check page yet (none has
// been served to us). An unmatched robot check still ends as 'unrecognised' below,
// because it has no #productTitle — it can never become a price.
const AMAZON_ROBOT = ['/errors/validateCaptcha', 'Enter the characters you see below', 'To discuss automated access to Amazon data'];

function amazon(html: string): Extracted {
  if (AMAZON_ROBOT.some((m) => html.includes(m))) return result({ status: 'blocked', rule: 'amazon:robot-check' });

  const titleEl = elementById(html, 'productTitle');
  const title = titleEl ? textOf(titleEl) || null : null;
  if (!title) return result({ status: 'unrecognised', rule: 'amazon:no-title' });
  // The ASIN the page itself names, from the title section (before the early-stop cut).
  const titleTag = openingTagById(html, 'title_feature_div');
  const pid = (titleTag && attr(titleTag, 'data-csa-c-asin')) || null;

  const imgEl = elementById(html, 'landingImage');
  const image = imgEl ? (attr(imgEl, 'data-old-hires') || attr(imgEl, 'src') || null) : null;

  const availEl = elementById(html, 'availability');
  const availability = availEl ? textOf(availEl) : '';
  const unavailable = /currently unavailable|out of stock|temporarily unavailable/i.test(availability);

  if (unavailable) return result({ status: 'unavailable', title, image, pid, inStock: false, rule: 'amazon:availability' });

  const core = elementById(html, 'corePriceDisplay_desktop_feature_div');
  if (!core) return result({ status: 'unrecognised', title, image, rule: 'amazon:no-core-price' });

  const pay = elementWithClass(core, 'a-price', 'priceToPay');
  let price: number | null = null;
  if (pay) {
    const whole = textOfClass(pay, 'a-price-whole');
    const fraction = textOfClass(pay, 'a-price-fraction');
    // With paise, Amazon nests the decimal point INSIDE the whole part:
    // <span class="a-price-whole">1,763<span class="a-price-decimal">.</span></span>, which reads
    // as "1,763 ." — keep only digits and commas (a live page with ₹1,763.31 failed on this).
    const digits = whole?.replace(/[^\d,]/g, '');
    const paise = fraction?.replace(/\D/g, '');
    price = parseRupees(digits ? `${digits}${paise ? '.' + paise : ''}` : null);
    if (price == null) price = parseRupees(textOfClass(pay, 'a-offscreen'));
  }
  if (price == null) return result({ status: 'unrecognised', title, image, rule: 'amazon:no-price-to-pay' });

  const basis = elementWithClass(core, 'a-price', 'apex-basisprice-value');
  const mrp = basis ? parseRupees(textOfClass(basis, 'a-offscreen')) : null;

  // "In stock", "Only 3 left in stock.", "Usually dispatched in 2 days" all mean buyable.
  return result({ status: 'priced', title, image, pid, price, mrp, inStock: true, rule: 'amazon:core-price' });
}

/**
 * Has enough of the page arrived for `extract` to give its final answer? Lets the server
 * stop downloading early: on every fixture the title, availability and price box all sit in
 * the first ~40% of a ~1 MB page, and decoding the rest cost CPU the free plan does not have
 * (a full read measured 9 ms of a 10 ms limit, 2026-10-26). Contract, pinned by test:
 * extract(prefix) === extract(full page) whenever enough(prefix) is true.
 */
export function enough(store: StoreId, html: string): boolean {
  if (store !== 'amazon') return false; // only Amazon is read by the server
  // No robot-page scan here: rescanning the whole prefix on every check was half this
  // function's cost. A robot page has no #productTitle, so it is read to its (small) end.
  if (!elementById(html, 'productTitle')) return false;
  const availEl = elementById(html, 'availability');
  if (!availEl) return false;
  if (/currently unavailable|out of stock|temporarily unavailable/i.test(textOf(availEl))) return true;
  // In stock (or unknown): wait for the whole price box. Pages that never have one are read
  // to the caller's size cap and end as 'unrecognised', exactly as a full read would.
  const at = html.indexOf('id="corePriceDisplay_desktop_feature_div"');
  return at !== -1 && elementById(html, 'corePriceDisplay_desktop_feature_div', at - 1) !== null;
}

// ---------------------------------------------------------------- Myntra

interface MyntraPdp {
  id?: number;
  name?: string;
  price?: { mrp?: number; discounted?: number };
  flags?: { outOfStock?: boolean };
  media?: { albums?: { images?: { secureSrc?: string }[] }[] };
}

function myntra(html: string): Extracted {
  const marker = 'window.__myx = ';
  const at = html.indexOf(marker);
  if (at === -1) return result({ status: 'unrecognised', rule: 'myntra:no-myx' });
  const end = html.indexOf('</script>', at);
  let pdp: MyntraPdp | undefined;
  try {
    pdp = (JSON.parse(html.slice(at + marker.length, end).trim().replace(/;$/, '')) as { pdpData?: MyntraPdp }).pdpData;
  } catch {
    return result({ status: 'unrecognised', rule: 'myntra:bad-json' });
  }
  if (!pdp?.name) return result({ status: 'unrecognised', rule: 'myntra:no-pdp' });

  const title = pdp.name.replace(/\s+/g, ' ').trim();
  const src = pdp.media?.albums?.[0]?.images?.[0]?.secureSrc;
  const image = src ? src.replace('($height)', '480').replace('($qualityPercentage)', '90').replace('($width)', '360') : null;
  const pid = pdp.id != null ? String(pdp.id) : null;
  if (pdp.flags?.outOfStock) return result({ status: 'unavailable', title, image, pid, inStock: false, rule: 'myntra:flags' });

  const price = rupeesToPaise(pdp.price?.discounted);
  const mrp = rupeesToPaise(pdp.price?.mrp);
  if (price == null) return result({ status: 'unrecognised', title, image, rule: 'myntra:no-price' });
  return result({ status: 'priced', title, image, pid, price, mrp, inStock: true, rule: 'myntra:pdpData' });
}

// ---------------------------------------------------------------- Flipkart

/**
 * Flipkart's reader is switched OFF until a real Flipkart product page (captured in a
 * shopper's browser — Flipkart refuses our server) confirms that its embedded product data
 * carries the price the shopper actually pays. Until then: 'unrecognised', never a guess.
 */
export const FLIPKART_READER_VERIFIED = false;

function flipkart(html: string): Extracted {
  if (/Something went wrong!/.test(html) && /\bE00\d\b/.test(html)) return result({ status: 'blocked', rule: 'flipkart:error-page' });
  if (!FLIPKART_READER_VERIFIED) return result({ status: 'unrecognised', title: jsonLdProduct(html).title, rule: 'flipkart:reader-not-verified' });
  return { ...jsonLdProduct(html), rule: 'flipkart:jsonld' };
}

// ---------------------------------------------------------------- schema.org JSON-LD

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

/**
 * The schema.org Product block many stores embed for search engines. Generic, so it is a
 * candidate reader for any store; each store must be VERIFIED against a real page before
 * its price is trusted (the embedded price is not always the price a shopper pays).
 */
export function jsonLdProduct(html: string): Extracted {
  for (const n of jsonLdNodes(html)) {
    if (!isType(n, 'Product')) continue;
    const title = typeof n['name'] === 'string' ? n['name'].replace(/\s+/g, ' ').trim() || null : null;
    const img = n['image'];
    const image = typeof img === 'string' ? img : Array.isArray(img) && typeof img[0] === 'string' ? img[0]
      : img && typeof img === 'object' && !Array.isArray(img) && typeof img['url'] === 'string' ? img['url'] : null;
    const offersRaw = n['offers'];
    const offer = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Record<string, Json> | null | undefined;
    if (!offer || typeof offer !== 'object') return result({ status: 'unrecognised', title, image, rule: 'jsonld:no-offer' });
    const availability = String(offer['availability'] ?? '');
    if (/OutOfStock|SoldOut|Discontinued/i.test(availability)) return result({ status: 'unavailable', title, image, inStock: false, rule: 'jsonld' });
    const price = rupeesToPaise(offer['price'] ?? offer['lowPrice'] ?? null);
    if (price == null || !/InStock|LimitedAvailability|OnlineOnly/i.test(availability)) {
      return result({ status: 'unrecognised', title, image, rule: 'jsonld:no-price' });
    }
    return result({ status: 'priced', title, image, price, inStock: true, rule: 'jsonld' });
  }
  return result({ status: 'unrecognised', rule: 'jsonld:none' });
}
