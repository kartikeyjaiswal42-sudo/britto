// Fare compare (BLUEPRINT §14, the BuyHatke "Ride / Flight compare" screens): one trip, typed
// once; the Britto ANDROID APP opens each travel site's own results page on the shopper's phone,
// in its own in-app browser, and reads the fares that page shows. Nothing is fetched by Britto's
// server, nothing is booked, and a site that asks "are you a person?" is shown to the shopper to
// answer themselves (never worked around).
//
// A fare recipe is data (web/fares.json, served with the site, so a site that changes its page
// is fixed without a new app). It is read here, by this one engine, over the page's HTML as
// text with the same selector engine as every product reader (core/select.ts), so the tests run
// it on pages saved inside the app (test/fixtures/fares-*.html).
import { fieldValue } from './interpret.ts';
import { parseRupees } from './money.ts';
import type { Field } from './recipe.ts';
import { compile, outerOf, selectAll, SelectorError } from './select.ts';
import type { Paise } from './types.ts';

export type FareSector = 'flight' | 'ride' | 'hotel';

export interface FareRecipe {
  /** The travel site (web/travel.js TRAVEL_SITES id). */
  site: string;
  sector: FareSector;
  /** The day this recipe was checked against a results page saved in the app. */
  verified: string;
  /** A regex the results page's address must match (else: 'other_page'). */
  page: string;
  /** One element per fare: a flight, a ride type, a hotel. */
  items: string;
  /** "IndiGo • 6E 6218", "Go Sedan". */
  label: Field[];
  /** The price this card shows to pay, never a crossed-out one. */
  price: Field[];
  depart?: Field[];
  arrive?: Field[];
  /** Where the flight leaves from and lands, as the site prints it ("HDO", "Ghaziabad"): sites
   * put nearby airports into a city's results (Hindon for Delhi, measured), so it is shown. */
  origin?: Field[];
  destination?: Field[];
  duration?: Field[];
  stops?: Field[];
  /** Rides: "10:19 AM • 1 min". */
  eta?: Field[];
  /** Literal texts (any one, case-insensitive, in the page's visible text) of a person check. */
  check: string[];
  /** Literal texts meaning the fares show only after the shopper logs in (rides). */
  login?: string[];
  /** Literal texts of a question the site asks before its fares (Uber, for an airport drop:
   * "Which airline?"). Britto never answers it for the shopper. */
  ask?: string[];
  max?: number;
}

export interface FareRow {
  label: string;
  price: Paise;
  depart: string | null;
  arrive: string | null;
  origin: string | null;
  destination: string | null;
  duration: string | null;
  stops: string | null;
  eta: string | null;
}

export type FareRead =
  | { status: 'fares'; rows: FareRow[]; cheapest: Paise }
  /** check: the site asks the shopper to prove they are a person; login: fares need a login;
   * ask: the site asks a question first; waiting: the right page, no fares on it (yet);
   * other_page: not this recipe's results page. */
  | { status: 'check' | 'login' | 'ask' | 'waiting' | 'other_page'; rows: [] };

/** Under ₹10 is never a fare (a "₹0 convenience fee", a coupon's "₹1"). */
const MIN_FARE: Paise = 1_000;
const clean = (s: string | null | undefined, max = 80): string | null => {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
/** Visible-ish text: the page without its scripts, styles and tags, for the check markers. */
function pageText(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function first(fields: Field[] | undefined, html: string, url: string): string | null {
  for (const f of fields ?? []) {
    const v = fieldValue(f, html, url);
    if (v != null && v.trim()) return v;
  }
  return null;
}

/** Read one results page with one recipe. Rows come in the page's own order. */
export function readFares(recipe: FareRecipe, html: string, url: string): FareRead {
  if (!new RegExp(recipe.page).test(url)) return { status: 'other_page', rows: [] };
  const text = pageText(html);
  if (recipe.check.some((c) => text.includes(c.toLowerCase()))) return { status: 'check', rows: [] };
  const rows: FareRow[] = [];
  for (const el of selectAll(html, recipe.items, (recipe.max ?? 40) * 2)) {
    if (rows.length >= (recipe.max ?? 40)) break;
    const part = outerOf(html, el);
    if (part == null) continue;
    const label = clean(first(recipe.label, part, url));
    const price = parseRupees(first(recipe.price, part, url)?.replace(/\s+/g, ''));
    if (!label || price == null || price < MIN_FARE) continue;
    rows.push({
      label, price,
      depart: clean(first(recipe.depart, part, url), 12),
      arrive: clean(first(recipe.arrive, part, url), 12),
      origin: clean(first(recipe.origin, part, url), 40),
      destination: clean(first(recipe.destination, part, url), 40),
      duration: clean(first(recipe.duration, part, url), 20),
      stops: clean(first(recipe.stops, part, url), 30),
      eta: clean(first(recipe.eta, part, url), 40),
    });
  }
  if (rows.length) return { status: 'fares', rows, cheapest: Math.min(...rows.map((r) => r.price)) };
  if (recipe.login?.some((c) => text.includes(c.toLowerCase()))) return { status: 'login', rows: [] };
  if (recipe.ask?.some((c) => text.includes(c.toLowerCase()))) return { status: 'ask', rows: [] };
  return { status: 'waiting', rows: [] };
}

const FIELD_KEYS = new Set(['selector', 'attribute', 'regex', 'match', 'squash', 'replace', 'sub_regex']);
const RECIPE_KEYS = new Set(['site', 'sector', 'verified', 'page', 'items', 'label', 'price', 'depart', 'arrive', 'origin', 'destination', 'duration', 'stops', 'eta', 'check', 'login', 'ask', 'max']);

/** Everything wrong with a recipe ([] = usable). A recipe that fails is never run. */
export function checkFareRecipe(input: unknown): string[] {
  const errs: string[] = [];
  if (!input || typeof input !== 'object') return ['not an object'];
  const r = input as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!RECIPE_KEYS.has(k)) errs.push(`unknown key ${k}`);
  if (typeof r.site !== 'string' || !/^[a-z]+$/.test(r.site)) errs.push('site: a lower-case id');
  if (!['flight', 'ride', 'hotel'].includes(r.sector as string)) errs.push('sector: flight, ride or hotel');
  if (typeof r.verified !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.verified)) errs.push('verified: YYYY-MM-DD');
  const regex = (name: string, v: unknown) => { try { new RegExp(String(v)); } catch { errs.push(`${name}: not a regex`); } };
  if (typeof r.page !== 'string' || !r.page.startsWith('^https://')) errs.push('page: a regex starting ^https://');
  else regex('page', r.page);
  const selector = (name: string, v: unknown) => {
    if (typeof v !== 'string') { errs.push(`${name}: a selector`); return; }
    try { compile(v); } catch (e) { errs.push(`${name}: ${e instanceof SelectorError ? e.message : 'bad selector'}`); }
  };
  selector('items', r.items);
  for (const name of ['label', 'price', 'depart', 'arrive', 'origin', 'destination', 'duration', 'stops', 'eta']) {
    const fields = r[name];
    if (fields === undefined && name !== 'label' && name !== 'price') continue;
    if (!Array.isArray(fields) || !fields.length) { errs.push(`${name}: one or more fields`); continue; }
    fields.forEach((f: Record<string, unknown>, i) => {
      for (const k of Object.keys(f ?? {})) if (!FIELD_KEYS.has(k)) errs.push(`${name}[${i}]: unknown key ${k}`);
      if (!Array.isArray(f?.selector) || !(f.selector as unknown[]).length) errs.push(`${name}[${i}]: selector`);
      else (f.selector as unknown[]).forEach((s) => selector(`${name}[${i}]`, s));
      if (typeof f?.attribute !== 'string' || !/^(innerText|textContent|alt|attr:[\w-]+)$/.test(f.attribute)) errs.push(`${name}[${i}]: attribute`);
      for (const re of (f?.regex as unknown[] | undefined) ?? []) regex(`${name}[${i}].regex`, re);
    });
  }
  for (const name of ['check', 'login', 'ask']) {
    const v = r[name];
    if (v === undefined && name !== 'check') continue;
    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string' || s.trim().length < 6)) errs.push(`${name}: texts of 6+ characters`);
  }
  if (r.max !== undefined && !(Number.isInteger(r.max) && (r.max as number) > 0 && (r.max as number) <= 100)) errs.push('max: 1 to 100');
  return errs;
}
