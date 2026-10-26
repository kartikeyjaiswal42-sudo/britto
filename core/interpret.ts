// The reader-config interpreter (BLUEPRINT §6). The one place a page becomes a reading, for
// the Worker, the extension and the app alike: store knowledge comes from a ReaderConfig,
// never from code here.
//
// THE RULE carried over from the hand-written readers: a price comes only from the recipe's
// own price fields for THIS product. When they find nothing the answer is 'unrecognised'
// (or 'unavailable'); there is no "first rupee on the page" fallback, ever. A product page
// whose price box is empty still carries carousel prices, and reading one of those as this
// product's price is a lie with a number on it.
import { decodeEntities, elementById, textOf } from './html.ts';
import { jsonLdPath, jsonLdProductNode } from './jsonld.ts';
import { parseRupees } from './money.ts';
import { jsonPath, type Field, type ReaderConfig } from './recipe.ts';
import { innerOf, outerOf, selectFirst } from './select.ts';
import type { Extracted, StoreId } from './types.ts';

interface Ctx { html: string; url: string; memo: Map<string, unknown> }

const once = <T>(ctx: Ctx, key: string, make: () => T): T => {
  if (!ctx.memo.has(key)) ctx.memo.set(key, make());
  return ctx.memo.get(key) as T;
};

/** The raw text a field starts from, before sub_regex / json / regex. */
function sourceText(field: Field, ctx: Ctx): string | null {
  if (field.jsonld) return jsonLdPath(once(ctx, 'ld-node', () => jsonLdProductNode(ctx.html)), field.jsonld);
  if (field.global) return ctx.html;
  if (field.attribute === 'URL') return ctx.url || null;
  if (!field.selector.length) return null;
  const found = once(ctx, `sel:${field.selector.join(' ')}`, () => selectFirst(ctx.html, field.selector.join(' ')));
  if (!found) return null;
  switch (field.attribute) {
    case 'innerText':
    case 'textContent': {
      // Visible text, scripts/styles dropped, whitespace collapsed: the same on every client
      // (layout-free, so a browser's real innerText is deliberately not used).
      const outer = outerOf(ctx.html, found);
      return outer == null ? null : textOf(outer);
    }
    case 'innerHTML':
      return innerOf(ctx.html, found);
    default: {
      const name = field.attribute.startsWith('attr:') ? field.attribute.slice(5).toLowerCase() : field.attribute.toLowerCase();
      return found.attrs.get(name) ?? null;
    }
  }
}

/** One field's value as text, or null. Every step that finds nothing ends the field. */
export function fieldValue(field: Field, html: string, url = '', memo = new Map<string, unknown>()): string | null {
  const ctx: Ctx = { html, url, memo };
  // Fields that start from the same source share the work of finding and parsing it.
  const source = `${field.jsonld ?? ''}|${field.global ? '*' : field.selector.join(' ')}|${field.attribute}`;
  let text = sourceText(field, ctx);
  if (text == null) return null;
  // Raw page source still carries entities; text and attribute values arrive decoded.
  const raw = field.global || field.attribute === 'innerHTML';
  if (field.sub_regex) {
    const re = field.sub_regex;
    const m = once(ctx, `sub:${re}:${source}`, () => new RegExp(re).exec(text!));
    if (!m) return null;
    text = m[1] ?? m[0];
  }
  if (field.json) {
    const body = text.trim().replace(/;\s*$/, '');
    const parsed = once(ctx, `json:${field.sub_regex ?? ''}:${source}`, () => { try { return JSON.parse(body) as unknown; } catch { return undefined; } });
    const v = jsonPath(parsed, field.json);
    if (v == null || typeof v === 'object') return null;
    text = String(v);
  }
  if (field.squash) text = text.replace(/\s+/g, '');
  if (field.regex) {
    let hit: string | null = null;
    for (const src of field.regex) {
      const re = new RegExp(src, 'g');
      let n = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (n++ === (field.match ?? 0)) { hit = m[1] ?? m[0]; break; }
        if (m[0] === '') re.lastIndex++;
      }
      if (hit != null) break;
    }
    if (hit == null) return null;
    text = hit;
  }
  for (const [from, to] of field.replace ?? []) text = text.split(from).join(to);
  const out = (raw && !field.json ? decodeEntities(text) : text).replace(/\s+/g, ' ').trim();
  return out || null;
}

/** The first field in a fallback chain that yields a value. */
function firstOf(fields: Field[], ctx: Ctx): string | null {
  for (const f of fields) {
    const v = fieldValue(f, ctx.html, ctx.url, ctx.memo);
    if (v != null) return v;
  }
  return null;
}

function result(partial: Partial<Extracted> & Pick<Extracted, 'status' | 'rule'>): Extracted {
  return { title: null, price: null, mrp: null, inStock: null, image: null, pid: null, ...partial };
}

function isBlocked(cfg: ReaderConfig, html: string): boolean {
  return (cfg.domRecipe.blocked ?? []).some((all) => all.every((src) => new RegExp(src).test(html)));
}

function isUnavailable(cfg: ReaderConfig, ctx: Ctx): boolean {
  const av = cfg.domRecipe.availability;
  const hit = (t: string | null) => t != null && av.outOfStockText.some((s) => t.toLowerCase().includes(s));
  for (const sel of av.selectors) {
    if (hit(fieldValue({ selector: [sel], attribute: 'textContent' }, ctx.html, ctx.url, ctx.memo))) return true;
  }
  for (const f of av.fields ?? []) if (hit(fieldValue(f, ctx.html, ctx.url, ctx.memo))) return true;
  for (const d of cfg.domRecipe.discontinuedText ?? []) {
    const t = fieldValue({ selector: [d.sel], attribute: 'textContent' }, ctx.html, ctx.url, ctx.memo);
    if (t != null && t.toLowerCase().includes(d.txt.toLowerCase())) return true;
  }
  return false;
}

/**
 * Read one product page with one config. Order of decisions: bot wall -> recipe applies ->
 * the product's name -> not buyable -> the price-to-pay -> priced.
 */
export function readPage(cfg: ReaderConfig, html: string, url = ''): Extracted {
  const rule = (why: string) => `${cfg.store}:${why}`;
  const d = cfg.domRecipe;
  if (isBlocked(cfg, html)) return result({ status: 'blocked', rule: rule('blocked') });
  const ctx: Ctx = { html, url, memo: new Map() };
  if (d.classSelector && !selectFirst(html, d.classSelector)) return result({ status: 'unrecognised', rule: rule('class-mismatch') });

  const title = firstOf(d.name, ctx);
  if (cfg.verified == null) return result({ status: 'unrecognised', title, rule: rule('reader-not-verified') });
  if (!title) return result({ status: 'unrecognised', rule: rule('no-name') });
  const image = firstOf(d.image, ctx);
  const pid = firstOf(d.pid, ctx);

  if (isUnavailable(cfg, ctx)) return result({ status: 'unavailable', title, image, pid, inStock: false, rule: rule('unavailable') });

  const price = parseRupees(firstOf(d.price, ctx));
  if (price == null) return result({ status: 'unrecognised', title, image, rule: rule('no-price') });
  const mrp = parseRupees(firstOf(d.mrp, ctx));
  return result({ status: 'priced', title, image, pid, price, mrp, inStock: true, rule: rule('priced') });
}

/**
 * Has enough of a page arrived for readPage to give its final answer? Lets the server stop
 * downloading early (decoding a whole ~1 MB page cost more CPU than the free plan has).
 * Contract, pinned by test on every fixture: readPage(prefix) equals readPage(full page)
 * whenever readerEnough(prefix) is true. A config without earlyStop always reads to the end.
 */
export function readerEnough(cfg: ReaderConfig, html: string): boolean {
  const es = cfg.domRecipe.earlyStop;
  if (!es) return false;
  for (const id of es.complete) if (!elementById(html, id)) return false;
  if (isUnavailable(cfg, { html, url: '', memo: new Map() })) return true;
  if (!es.thenUnavailableOr?.length) return true;
  return es.thenUnavailableOr.every((id) => {
    const at = html.indexOf(`id="${id}"`);
    return at !== -1 && elementById(html, id, at - 1) !== null;
  });
}

/**
 * Accept a reading only if the page says it shows the product the link names. A reading
 * that names another product, or (for stores whose readers report it, config.reportsPid)
 * names none, becomes 'unrecognised' — never filed under the wrong product.
 */
export function confirmIdentity(store: StoreId, linkPid: string, ex: Extracted, reportsPid: boolean): Extracted {
  if (ex.status !== 'priced' && ex.status !== 'unavailable') return ex;
  const expected = store === 'flipkart' ? linkPid.split('.')[0] : linkPid;
  if (ex.pid === expected) return ex;
  if (ex.pid == null && !reportsPid) return ex;
  return { ...ex, status: 'unrecognised', price: null, mrp: null, inStock: null, rule: `${ex.rule}+identity-mismatch(${ex.pid ?? 'none'})` };
}
