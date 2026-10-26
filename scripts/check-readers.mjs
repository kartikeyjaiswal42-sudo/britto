// Config CI for store readers (BLUEPRINT §22): every reader config is schema-checked, and
// every saved page in test/fixtures is read with it and compared with expected.json.
//   node scripts/check-readers.mjs                      the bundled configs (readers/*.json)
//   node scripts/check-readers.mjs --candidate <file>   a new config, in place of the bundled
//                                                       one for its store and device
// Besides the expected values, three rules are checked on every fixture:
//   1. Deleting what the recipe read changes the reading. For a priced page: the name's and
//      the price's targets; unavailable: the name's and the stock marker's; blocked: the
//      blocked markers. Every target in a fallback chain is deleted in turn until the reading
//      changes, so a reading that survives all of them came from somewhere the recipe does
//      not name. (§22: "deleting the target element reddens the test".)
//   2. Early stop: whenever readerEnough(prefix) is true, readPage(prefix) equals
//      readPage(whole page), for every 16 KB prefix (the server stops downloading there).
//   3. Every fixture has an entry, and every entry a fixture.
// Prints "ok <fixture>" or "DIFF <fixture> <what>: …" lines; exits 1 on any DIFF.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { BUNDLED_READERS } from '../readers/index.ts';
import { configVersion, validateReader } from '../core/recipe.ts';
import { fieldValue, readerEnough, readPage } from '../core/interpret.ts';
import { confirmIdentity } from '../core/extract.ts';
import { outerOf, selectFirst } from '../core/select.ts';
import { parseProductLink } from '../core/stores.ts';
import { validateSales } from '../core/sales.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'test/fixtures');
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

let diffs = 0;
const diff = (name, what) => { diffs++; console.log(`DIFF ${name} ${what}`); };

// ---- configs
const readers = new Map(); // "store.device" -> { config, version, origin }
for (const r of BUNDLED_READERS) readers.set(`${r.config.store}.${r.config.device}`, { ...r, origin: 'bundled' });
for (const f of readdirSync(join(ROOT, 'readers')).filter((f) => f.endsWith('.json'))) {
  const json = JSON.parse(readFileSync(join(ROOT, 'readers', f), 'utf8'));
  if (f === 'sales.json') {
    const sales = validateSales(json);
    if (!sales.ok) diff('readers/sales.json', `invalid: ${sales.errors.join('; ')}`);
    continue;
  }
  if (!/^[a-z]+\.(desktop|mobile)\.json$/.test(f)) { diff(`readers/${f}`, 'is neither a reader (<store>.<device>.json) nor sales.json'); continue; }
  const v = validateReader(json);
  if (!v.ok) diff(`readers/${f}`, `invalid: ${v.errors.join('; ')}`);
  else if (f !== `${v.config.store}.${v.config.device}.json`) diff(`readers/${f}`, `file name must be ${v.config.store}.${v.config.device}.json`);
}
const candidatePath = arg('--candidate');
if (candidatePath) {
  let json;
  try { json = JSON.parse(readFileSync(resolve(candidatePath), 'utf8')); } catch (e) { diff('candidate', `not JSON: ${e.message}`); }
  const v = json === undefined ? null : validateReader(json);
  if (v && !v.ok) diff('candidate', `invalid: ${v.errors.join('; ')}`);
  if (v?.ok) {
    const version = configVersion(v.config);
    readers.set(`${v.config.store}.${v.config.device}`, { config: v.config, version, origin: 'candidate' });
    console.log(`candidate ${version} replaces the bundled ${v.config.store}.${v.config.device} reader`);
  }
}

// ---- fixtures
const expected = JSON.parse(readFileSync(join(FIXTURES, 'expected.json'), 'utf8'));
const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.html')).sort();
for (const f of files) if (!expected[f]) diff(f, 'has no entry in expected.json');
for (const f of Object.keys(expected)) if (f !== '_about' && !files.includes(f)) diff(f, 'is in expected.json but not saved');

const fmt = (v) => (v === undefined ? 'undefined' : JSON.stringify(v));

/** The reading the server or a client would act on: readPage, then the identity check. */
function reading(cfg, html, url) {
  const link = parseProductLink(url);
  if (!link.ok) throw new Error(`expected.json url is not a product link: ${url}`);
  return confirmIdentity(cfg.store, link.link.pid, readPage(cfg, html, url), cfg.reportsPid);
}

/** Cut [start, end) out of the page. */
const cut = (html, start, end) => html.slice(0, start) + html.slice(end);

/** Where a field's value comes from on this page, as a span to delete; null = nothing on the page. */
function targetOf(field, html) {
  if (field.jsonld) {
    const m = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i.exec(html);
    return m ? [m.index, m.index + m[0].length] : null;
  }
  if (field.global) {
    const re = new RegExp(field.sub_regex ?? field.regex?.[0] ?? '$^');
    const m = re.exec(html);
    return m ? [m.index, m.index + Math.max(m[0].length, 1)] : null;
  }
  if (field.attribute === 'URL' || !field.selector.length) return null;
  const found = selectFirst(html, field.selector.join(' '));
  if (!found) return null;
  const outer = outerOf(html, found) ?? found.open;
  return [found.start, found.start + outer.length];
}

/** Targets, in order, of the fields in a chain that currently yield a value. */
function chainTarget(fields, html, url) {
  for (const f of fields) {
    if (fieldValue(f, html, url) == null) continue;
    const t = targetOf(f, html);
    if (t) return t;
  }
  return null;
}

function availabilityTarget(cfg, html, url) {
  const av = cfg.domRecipe.availability;
  for (const sel of av.selectors) {
    const t = targetOf({ selector: [sel], attribute: 'textContent' }, html);
    const text = fieldValue({ selector: [sel], attribute: 'textContent' }, html, url)?.toLowerCase() ?? '';
    if (t && av.outOfStockText.some((s) => text.includes(s))) return t;
  }
  for (const f of av.fields ?? []) {
    const text = fieldValue(f, html, url)?.toLowerCase() ?? '';
    if (av.outOfStockText.some((s) => text.includes(s))) return targetOf(f, html);
  }
  return null;
}

function blockedTarget(cfg, html) {
  for (const all of cfg.domRecipe.blocked ?? []) {
    if (!all.every((src) => new RegExp(src).test(html))) continue;
    const m = new RegExp(all[0]).exec(html);
    return [m.index, m.index + Math.max(m[0].length, 1)];
  }
  return null;
}

/** Delete targets one at a time until the reading changes; true when it did. */
function deletionChangesReading(cfg, html, url, base, nextTarget) {
  let page = html;
  for (let i = 0; i < 20; i++) {
    const t = nextTarget(page);
    if (!t) return !isDeepStrictEqual(reading(cfg, page, url), base);
    page = cut(page, t[0], t[1]);
    if (!isDeepStrictEqual(reading(cfg, page, url), base)) return true;
  }
  return false;
}

for (const f of files) {
  const want = expected[f];
  if (!want) continue;
  const r = readers.get(`${want.store}.${want.device ?? 'desktop'}`);
  if (!r) { diff(f, `no reader for ${want.store}.${want.device ?? 'desktop'}`); continue; }
  const cfg = r.config;
  const html = readFileSync(join(FIXTURES, f), 'utf8');
  const got = reading(cfg, html, want.url);
  const before = diffs;
  for (const k of ['status', 'price', 'mrp', 'inStock', 'pid']) {
    if (k in want && got[k] !== want[k]) diff(f, `${k}: expected ${fmt(want[k])}, got ${fmt(got[k])} (${got.rule})`);
  }
  if (want.title && !(got.title ?? '').startsWith(want.title)) diff(f, `title: expected to start ${fmt(want.title)}, got ${fmt(got.title)}`);

  // Rule 1: deleting what was read changes the reading.
  const d = cfg.domRecipe;
  const rules = got.status === 'priced'
    ? [['name', (p) => chainTarget(d.name, p, want.url)], ['price', (p) => chainTarget(d.price, p, want.url)]]
    : got.status === 'unavailable'
      ? [['name', (p) => chainTarget(d.name, p, want.url)], ['stock marker', (p) => availabilityTarget(cfg, p, want.url)]]
      : got.status === 'blocked' ? [['blocked marker', (p) => blockedTarget(cfg, p)]] : [];
  for (const [what, next] of rules) {
    if (!next(html)) diff(f, `deleting the ${what}: the recipe names no element on this page`);
    else if (!deletionChangesReading(cfg, html, want.url, got, next)) diff(f, `deleting the ${what}: the reading did not change (it comes from somewhere the recipe does not name)`);
  }

  // Rule 2: early stop never changes the answer.
  let firstStop = null;
  for (let n = 16_384; n < html.length; n += 16_384) {
    const prefix = html.slice(0, n);
    if (!readerEnough(cfg, prefix)) continue;
    firstStop ??= n;
    const early = reading(cfg, prefix, want.url);
    if (!isDeepStrictEqual(early, got)) { diff(f, `early stop at ${n} bytes reads ${early.status} ${fmt(early.price)}, the whole page ${got.status} ${fmt(got.price)}`); break; }
  }

  if (diffs === before) {
    const money = got.price == null ? '' : ` ₹${got.price / 100}${got.mrp == null ? '' : ` (M.R.P. ₹${got.mrp / 100})`}`;
    const stop = firstStop == null ? 'reads to the end' : `early stop at ${Math.round((firstStop / html.length) * 100)}%`;
    console.log(`  ok  ${f}: ${got.status}${money}${got.pid ? ` pid ${got.pid}` : ''} · ${r.origin} ${r.version} · ${stop}`);
  }
}

console.log(diffs ? `\n${diffs} difference(s)` : `\nevery reader valid, every fixture as expected`);
process.exit(diffs ? 1 : 0);
