// Reader configs: store knowledge as DATA (BLUEPRINT.md §6). A store changing its HTML is a
// config change served by the Worker, never a client release. This file is the schema, its
// validator (config CI and D1 hot-fixes both go through it), the content-derived version id,
// and the JSON-API row reader (§6.2). The page interpreter is core/interpret.ts.
//
// Britto extensions to the §6.1 shapes, each needed by a reader that already existed:
//   Field.attribute 'attr:<name>'  any attribute (Amazon's ASIN is in data-csa-c-asin)
//   Field.squash                   drop whitespace before the regexes (Amazon splits ₹1,763.31
//                                  across four spans)
//   Field.json                     read a path from JSON text (Myntra's window.__myx)
//   Field.jsonld                   read a path from the page's schema.org Product block
//   Field.replace                  literal replacements (Myntra's image-size placeholders)
//   AvailRule.fields               availability from a value, not a selector's text
//   DomRecipe.blocked              bot-wall / error-page markers -> status 'blocked'
//   DomRecipe.earlyStop            when a server download may stop (CPU budget)
//   Field.regex                    alternatives, tried in order (first that matches wins)
import { compile, SelectorError } from './select.ts';
import { rupeesToPaise } from './money.ts';
import { STORE_IDS } from './stores.ts';
import type { Paise, StoreId } from './types.ts';

export type FieldAttribute = 'innerText' | 'innerHTML' | 'textContent' | 'content' | 'href' | 'alt' | 'URL' | `attr:${string}`;

export interface Field {
  /** CSS path segments, joined as descendants. [] with attribute 'URL' = the page address. */
  selector: string[];
  attribute: FieldAttribute;
  /** Alternatives, tried in order; capture group 1 (else the whole match) is the value. */
  regex?: string[];
  /** Which occurrence of the regex to take (default 0). */
  match?: number;
  /** Ignore the selector: the text is the whole page source. */
  global?: boolean;
  /** Narrow the text first (group 1 if present). */
  sub_regex?: string;
  squash?: boolean;
  json?: string;
  jsonld?: string;
  replace?: [string, string][];
}

export interface AvailRule {
  selectors: string[];
  /** Lower-case substrings; any one in the element's text (or a field value) = out of stock. */
  outOfStockText: string[];
  fields?: Field[];
}

export interface DomRecipe {
  /** Page marker confirming the recipe applies; when it does not match: 'unrecognised'. */
  classSelector?: string;
  name: Field[];
  price: Field[];
  mrp: Field[];
  image: Field[];
  pid: Field[];
  itm: Field[];
  availability: AvailRule;
  discontinuedText?: { sel: string; txt: string }[];
  /** Alternatives; each is a list of regexes that must ALL match the page source. */
  blocked?: string[][];
  /** Server early stop: every id in `complete` is a closed element, and then either the page
   * reads as unavailable or every id in `thenUnavailableOr` is closed too. */
  earlyStop?: { complete: string[]; thenUnavailableOr?: string[] };
  // Declared by the blueprint for later phases; accepted and not yet read.
  rating?: Field[]; ratingsCount?: Field[]; reviewsCount?: Field[];
  brand?: Field[]; categoryPath?: Field[]; seller?: Field[];
  pincodeFromStorageKeys?: string[];
}

export interface ApiParse {
  root: string[];
  match?: { path: string; eq?: unknown[]; ne?: unknown[] }[];
  fields: { product_id?: string; price?: string; mrp?: string; productName?: string[]; image?: string; groupId?: string };
  oos?: { path: string; oos: unknown[] }[];
  oosDefault?: 0 | 1;
}

export interface ApiRecipe {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string | number>;
  bodyTemplate?: unknown;
  parse: ApiParse;
  imageTemplateReplacements?: Record<string, string>;
}

export type Device = 'desktop' | 'mobile';

export interface ReaderConfig {
  schema: 1;
  store: StoreId;
  device: Device;
  /** Human revision number; the version id also carries a hash of the content. */
  revision: number;
  /** Date the recipe was checked against a real saved page; null = never trust its prices. */
  verified: string | null;
  /** The page names its own product id (so a reading naming none is suspicious). */
  reportsPid: boolean;
  /** Stable stores may be cached longer by clients. */
  toCacheLong?: boolean;
  domRecipe: DomRecipe;
  apiRecipes?: ApiRecipe[];
}

// ------------------------------------------------------------------ validation

type Check = { ok: true; config: ReaderConfig } | { ok: false; errors: string[] };

const ATTRS = new Set(['innerText', 'innerHTML', 'textContent', 'content', 'href', 'alt', 'URL']);
const FIELD_KEYS = new Set(['selector', 'attribute', 'regex', 'match', 'global', 'sub_regex', 'squash', 'json', 'jsonld', 'replace']);
const TOP_KEYS = new Set(['schema', 'store', 'device', 'revision', 'verified', 'reportsPid', 'toCacheLong', 'domRecipe', 'apiRecipes']);
const DOM_KEYS = new Set([
  'classSelector', 'name', 'price', 'mrp', 'image', 'pid', 'itm', 'availability', 'discontinuedText', 'blocked', 'earlyStop',
  'rating', 'ratingsCount', 'reviewsCount', 'brand', 'categoryPath', 'seller', 'pincodeFromStorageKeys',
]);
// sellerPageFallback (§6.1) is not implemented: refused, so no recipe can rely on it silently.
const AVAIL_KEYS = new Set(['selectors', 'outOfStockText', 'fields']);
const API_KEYS = new Set(['url', 'method', 'headers', 'bodyTemplate', 'parse', 'imageTemplateReplacements']);
const PARSE_KEYS = new Set(['root', 'match', 'fields', 'oos', 'oosDefault']);
const API_FIELD_KEYS = new Set(['product_id', 'price', 'mrp', 'productName', 'image', 'groupId']);
/** Identity headers are the store's (or the browser's) to set, never a recipe's (rule 1). */
const IDENTITY_HEADER = /^(user-agent|origin|referer|cookie|authorization|host|forwarded|x-forwarded-|x-real-ip|true-client-ip|proxy-|sec-)/i;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function unknownKeys(o: Record<string, unknown>, known: Set<string>, where: string, errors: string[]): void {
  for (const k of Object.keys(o)) if (!known.has(k)) errors.push(`${where}: unknown key "${k}"`);
}

const isPath = (x: unknown) => typeof x === 'string' && x.length > 0;

function checkRegex(src: unknown, where: string, errors: string[]): void {
  if (typeof src !== 'string' || !src) { errors.push(`${where}: regex must be a non-empty string`); return; }
  try { new RegExp(src); } catch (e) { errors.push(`${where}: bad regex (${(e as Error).message})`); }
}

function checkSelector(src: unknown, where: string, errors: string[]): void {
  if (typeof src !== 'string') { errors.push(`${where}: selector must be a string`); return; }
  try { compile(src); } catch (e) { errors.push(`${where}: ${e instanceof SelectorError ? e.message : String(e)}`); }
}

function checkField(f: unknown, where: string, errors: string[]): void {
  if (!isObj(f)) { errors.push(`${where}: must be an object`); return; }
  unknownKeys(f, FIELD_KEYS, where, errors);
  if (!Array.isArray(f['selector'])) errors.push(`${where}.selector: must be an array`);
  else f['selector'].forEach((s, i) => checkSelector(s, `${where}.selector[${i}]`, errors));
  const a = f['attribute'];
  if (typeof a !== 'string' || !(ATTRS.has(a) || /^attr:[A-Za-z_][\w:-]*$/.test(a))) errors.push(`${where}.attribute: unknown "${String(a)}"`);
  const usesSource = f['global'] === true || typeof f['jsonld'] === 'string' || a === 'URL';
  if (Array.isArray(f['selector']) && f['selector'].length === 0 && !usesSource) errors.push(`${where}: an empty selector needs attribute "URL", global or jsonld`);
  if (f['regex'] !== undefined) {
    if (!Array.isArray(f['regex']) || !f['regex'].length) errors.push(`${where}.regex: must be a non-empty array`);
    else f['regex'].forEach((r, i) => checkRegex(r, `${where}.regex[${i}]`, errors));
  }
  if (f['sub_regex'] !== undefined) checkRegex(f['sub_regex'], `${where}.sub_regex`, errors);
  if (f['match'] !== undefined && !(Number.isInteger(f['match']) && (f['match'] as number) >= 0)) errors.push(`${where}.match: must be a whole number`);
  for (const k of ['global', 'squash'] as const) if (f[k] !== undefined && typeof f[k] !== 'boolean') errors.push(`${where}.${k}: must be true/false`);
  for (const k of ['json', 'jsonld'] as const) if (f[k] !== undefined && (typeof f[k] !== 'string' || !f[k])) errors.push(`${where}.${k}: must be a path string`);
  if (f['replace'] !== undefined && !(Array.isArray(f['replace']) && f['replace'].every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'string')))) {
    errors.push(`${where}.replace: must be [from, to] string pairs`);
  }
}

function checkFields(v: unknown, where: string, errors: string[], required: boolean): void {
  if (v === undefined && !required) return;
  if (!Array.isArray(v)) { errors.push(`${where}: must be an array of fields`); return; }
  v.forEach((f, i) => checkField(f, `${where}[${i}]`, errors));
}

function checkApiRecipe(r: unknown, where: string, errors: string[]): void {
  if (!isObj(r) || typeof r['url'] !== 'string' || !r['url'] || (r['method'] !== 'GET' && r['method'] !== 'POST') || !isObj(r['parse'])) {
    errors.push(`${where}: needs url, method GET|POST and parse`);
    return;
  }
  unknownKeys(r, API_KEYS, where, errors);
  const p = r['parse'];
  unknownKeys(p, PARSE_KEYS, `${where}.parse`, errors);
  if (!Array.isArray(p['root']) || !p['root'].length || !p['root'].every(isPath)) errors.push(`${where}.parse.root: must be a non-empty list of paths`);
  const f = p['fields'];
  if (!isObj(f)) errors.push(`${where}.parse.fields: must be an object`);
  else {
    unknownKeys(f, API_FIELD_KEYS, `${where}.parse.fields`, errors);
    for (const [k, v] of Object.entries(f)) {
      const ok = k === 'productName' ? Array.isArray(v) && v.length > 0 && v.every(isPath) : isPath(v);
      if (!ok) errors.push(`${where}.parse.fields.${k}: must be ${k === 'productName' ? 'a non-empty list of paths' : 'a path'}`);
    }
  }
  if (p['match'] !== undefined && !(Array.isArray(p['match']) && p['match'].every((m) => isObj(m) && isPath(m['path'])
    && Object.keys(m).every((k) => ['path', 'eq', 'ne'].includes(k)) && (m['eq'] === undefined || Array.isArray(m['eq'])) && (m['ne'] === undefined || Array.isArray(m['ne']))))) {
    errors.push(`${where}.parse.match: must be [{path, eq?: [], ne?: []}]`);
  }
  if (p['oos'] !== undefined && !(Array.isArray(p['oos']) && p['oos'].every((o) => isObj(o) && isPath(o['path']) && Array.isArray(o['oos']) && Object.keys(o).length === 2))) {
    errors.push(`${where}.parse.oos: must be [{path, oos: []}]`);
  }
  if (p['oosDefault'] !== undefined && p['oosDefault'] !== 0 && p['oosDefault'] !== 1) errors.push(`${where}.parse.oosDefault: must be 0 or 1`);
  // Rule 1: constant headers only. Identity headers are the store's to set, never ours.
  if (r['headers'] !== undefined) {
    if (!isObj(r['headers'])) errors.push(`${where}.headers: must be an object`);
    else for (const [h, v] of Object.entries(r['headers'])) {
      if (IDENTITY_HEADER.test(h)) errors.push(`${where}.headers: "${h}" is not ours to set (rule 1)`);
      if (typeof v !== 'string' && typeof v !== 'number') errors.push(`${where}.headers.${h}: must be text or a number`);
    }
  }
  const itr = r['imageTemplateReplacements'];
  if (itr !== undefined && !(isObj(itr) && Object.values(itr).every((v) => typeof v === 'string'))) errors.push(`${where}.imageTemplateReplacements: must map text to text`);
}

/** Accept a config only when every part of it is understood. Unknown = refused, never guessed. */
export function validateReader(input: unknown): Check {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['config must be an object'] };
  unknownKeys(input, TOP_KEYS, 'config', errors);
  if (input['schema'] !== 1) errors.push('schema: must be 1');
  if (!(STORE_IDS as readonly string[]).includes(String(input['store']))) errors.push(`store: unknown "${String(input['store'])}"`);
  if (input['device'] !== 'desktop' && input['device'] !== 'mobile') errors.push('device: must be desktop or mobile');
  if (!Number.isInteger(input['revision']) || (input['revision'] as number) < 1) errors.push('revision: must be a whole number >= 1');
  const v = input['verified'];
  if (v !== null && !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) errors.push('verified: must be null or YYYY-MM-DD');
  if (typeof input['reportsPid'] !== 'boolean') errors.push('reportsPid: must be true/false');
  if (input['toCacheLong'] !== undefined && typeof input['toCacheLong'] !== 'boolean') errors.push('toCacheLong: must be true/false');
  const d = input['domRecipe'];
  if (!isObj(d)) errors.push('domRecipe: must be an object');
  else {
    unknownKeys(d, DOM_KEYS, 'domRecipe', errors);
    for (const k of ['name', 'price', 'mrp', 'image', 'pid', 'itm'] as const) checkFields(d[k], `domRecipe.${k}`, errors, true);
    if (d['pincodeFromStorageKeys'] !== undefined && !(Array.isArray(d['pincodeFromStorageKeys']) && d['pincodeFromStorageKeys'].every(isPath))) {
      errors.push('domRecipe.pincodeFromStorageKeys: must be a list of names');
    }
    for (const k of ['rating', 'ratingsCount', 'reviewsCount', 'brand', 'categoryPath', 'seller'] as const) checkFields(d[k], `domRecipe.${k}`, errors, false);
    if (d['classSelector'] !== undefined) checkSelector(d['classSelector'], 'domRecipe.classSelector', errors);
    const av = d['availability'];
    if (!isObj(av)) errors.push('domRecipe.availability: must be an object');
    else {
      unknownKeys(av, AVAIL_KEYS, 'domRecipe.availability', errors);
      if (!Array.isArray(av['selectors'])) errors.push('domRecipe.availability.selectors: must be an array');
      else av['selectors'].forEach((s, i) => checkSelector(s, `domRecipe.availability.selectors[${i}]`, errors));
      if (!Array.isArray(av['outOfStockText']) || !av['outOfStockText'].every((t) => typeof t === 'string' && t === t.toLowerCase() && t.length > 0)) {
        errors.push('domRecipe.availability.outOfStockText: must be lower-case strings');
      }
      checkFields(av['fields'], 'domRecipe.availability.fields', errors, false);
    }
    if (d['blocked'] !== undefined) {
      if (!Array.isArray(d['blocked']) || !d['blocked'].every((alt) => Array.isArray(alt) && alt.length > 0)) errors.push('domRecipe.blocked: must be a list of regex lists');
      else d['blocked'].forEach((alt, i) => (alt as unknown[]).forEach((r, j) => checkRegex(r, `domRecipe.blocked[${i}][${j}]`, errors)));
    }
    if (d['discontinuedText'] !== undefined) {
      if (!Array.isArray(d['discontinuedText'])) errors.push('domRecipe.discontinuedText: must be an array');
      else d['discontinuedText'].forEach((x, i) => {
        if (!isObj(x) || typeof x['txt'] !== 'string') errors.push(`domRecipe.discontinuedText[${i}]: needs sel and txt`);
        else checkSelector(x['sel'], `domRecipe.discontinuedText[${i}].sel`, errors);
      });
    }
    const es = d['earlyStop'];
    if (es !== undefined) {
      const ids = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === 'string' && /^[\w:-]+$/.test(s));
      if (!isObj(es) || !ids(es['complete']) || (es['thenUnavailableOr'] !== undefined && !ids(es['thenUnavailableOr']))) {
        errors.push('domRecipe.earlyStop: complete / thenUnavailableOr must be lists of element ids');
      }
    }
  }
  if (input['apiRecipes'] !== undefined) {
    if (!Array.isArray(input['apiRecipes'])) errors.push('apiRecipes: must be an array');
    else input['apiRecipes'].forEach((r, i) => checkApiRecipe(r, `apiRecipes[${i}]`, errors));
  }
  return errors.length ? { ok: false, errors } : { ok: true, config: input as unknown as ReaderConfig };
}

// ------------------------------------------------------------------ version ids

/** JSON with keys sorted at every level, so the same content always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** FNV-1a, 2 x 32 bits. Content fingerprint for version ids and ETags, not security. */
function fnv(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** "amazon.desktop.r1.3f2a…": readable, and any change of content changes it. */
export function configVersion(c: ReaderConfig): string {
  return `${c.store}.${c.device}.r${c.revision}.${fnv(canonicalJson(c)).slice(0, 12)}`;
}

// ------------------------------------------------------------------ JSON paths and API rows

/** "a.b[0].c", "a.b.0.c". On an array where a key is wanted, the first element is used. */
export function jsonPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = /^\d+$/.test(seg) ? cur[Number(seg)] : (cur[0] as Record<string, unknown> | undefined)?.[seg];
    else if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[seg];
    else return undefined;
  }
  return cur;
}

/** {{name}} -> vars[name] (as text). Unknown names stay as written, so a mistake is visible. */
export function fillTemplate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export interface ApiRow { pid: string | null; name: string | null; price: Paise | null; mrp: Paise | null; image: string | null; inStock: boolean; groupId: string | null }

const eqLoose = (a: unknown, b: unknown) => a === b || String(a) === String(b);

/**
 * Rows a store's own JSON describes, per an ApiRecipe's parse section. Prices in store JSON
 * are rupees (52 = ₹52); converted to paise here. Used on JSON the shopper's own browser
 * received (BLUEPRINT §7); the server never fetches it.
 */
export function readApiRows(recipe: ApiRecipe, json: unknown, vars: Record<string, string | number> = {}): ApiRow[] {
  const p = recipe.parse;
  const str = (v: unknown) => (v == null || v === '' ? null : String(v));
  for (const rootPath of p.root) {
    const node = jsonPath(json, rootPath);
    if (node == null) continue;
    const items = Array.isArray(node) ? node : [node];
    const rows: ApiRow[] = [];
    for (const item of items) {
      const ok = (p.match ?? []).every((m) => {
        const v = jsonPath(item, m.path);
        const fill = (xs: unknown[]) => xs.map((x) => (typeof x === 'string' ? fillTemplate(x, vars) : x));
        if (m.eq && !fill(m.eq).some((x) => eqLoose(v, x))) return false;
        if (m.ne && fill(m.ne).some((x) => eqLoose(v, x))) return false;
        return true;
      });
      if (!ok) continue;
      const f = p.fields;
      const oosHit = (p.oos ?? []).some((o) => o.oos.some((x) => eqLoose(jsonPath(item, o.path), x)));
      const inStock = p.oos?.length ? !oosHit : p.oosDefault !== 1;
      let image = f.image ? str(jsonPath(item, f.image)) : null;
      if (image && recipe.imageTemplateReplacements) {
        for (const [from, to] of Object.entries(recipe.imageTemplateReplacements)) image = image.split(from).join(to);
      }
      rows.push({
        pid: f.product_id ? str(jsonPath(item, f.product_id)) : null,
        name: (f.productName ?? []).map((n) => str(jsonPath(item, n))).find((x) => x != null) ?? null,
        price: f.price ? rupeesToPaise(jsonPath(item, f.price)) : null,
        mrp: f.mrp ? rupeesToPaise(jsonPath(item, f.mrp)) : null,
        image,
        inStock,
        groupId: f.groupId ? str(jsonPath(item, f.groupId)) : null,
      });
    }
    if (rows.length) return rows;
  }
  return [];
}
