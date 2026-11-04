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
import { compile, outerOf, parseSelector, selectAll, selectFirst, SelectorError } from './select.ts';
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
  /** Hotels: where it is, as the site prints it ("Anjuna", "Utorda"). */
  area?: Field[];
  /** Hotels: whether the price is for one night or the whole stay (measured per site). */
  per?: 'night' | 'stay';
  /** Rides whose trip is typed on the site's own page (Rapido: its address has no trip in it):
   * the boxes holding the pickup and the drop, in that order. Only the app reads what they hold
   * (a saved page keeps no typed text), so Britto can show which trip the fares are for. */
  places?: string;
  /** Rides whose trip is typed on the site's own page (Rapido): how the app enters the trip the
   * shopper gave Britto, as a person would: tap the pickup box, type, pick the site's own
   * suggestion that best matches, then the same for the drop. Only these boxes and suggestion
   * items are ever touched (never a button: android/js/fares.ts refuses one). */
  fill?: FareFill;
  /** Literal texts (any one, case-insensitive, in the page's visible text) of a person check. */
  check: string[];
  /** Literal texts meaning the fares show only after the shopper logs in (rides). */
  login?: string[];
  /** Literal texts of a question the site asks before its fares (Uber, for an airport drop:
   * "Which airline?"). Britto never answers it for the shopper. */
  ask?: string[];
  max?: number;
  /** The site's own fares-by-date strip above its results ("Fri, 20 ₹7,279"), when it has one. */
  strip?: FareStrip;
}

/**
 * A date strip: one element per day, in date order, with the searched day marked. Its dates are
 * worked out from the searched day (sites print "Fri, 20" without a month, measured on ixigo),
 * and every printed weekday, month and day must agree, or the strip is not used at all.
 */
export interface FareStrip {
  items: string;
  day: Field[];
  price: Field[];
  /** A selector the searched day's element (or something inside it) matches, and no other day's. */
  active: string;
}

/** How the app types a ride's trip into the site's own page (FareRecipe.fill). */
export interface FareFill {
  /** The trip page's pickup box and drop box. */
  boxes: [string, string];
  /** The search box each one opens (pickup, drop). */
  search: [string, string];
  /** The site's place suggestions under an open search box. */
  suggestions: string;
}

/** One day of a site's date strip: the lowest fare the site printed for that day. */
export interface StripDay {
  date: string;
  price: Paise;
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
  area: string | null;
}

export type FareRead =
  | { status: 'fares'; rows: FareRow[]; cheapest: Paise; strip: StripDay[] }
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

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const isDay = (s: string | undefined): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const plusDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Does a printed day ("Tue, Nov 10", "Fri, 20 ") fit this date? It must print exactly one day
 * number, the date's; a weekday or month it prints must be the date's too.
 */
export function dayFits(label: string, iso: string): boolean {
  if (!isDay(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  const t = label.toLowerCase();
  const nums = t.match(/\b\d{1,2}\b/g);
  if (nums?.length !== 1 || Number(nums[0]) !== d.getUTCDate()) return false;
  const wd = /\b(sun|mon|tue|wed|thu|fri|sat)/.exec(t);
  if (wd && WEEKDAYS.indexOf(wd[1]!) !== d.getUTCDay()) return false;
  const mo = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.exec(t);
  if (mo && MONTHS.indexOf(mo[1]!) !== d.getUTCMonth()) return false;
  return true;
}

/** The strip's days with their dates (searched day = `when`), or [] when anything disagrees. */
export function readStrip(strip: FareStrip, html: string, url: string, when: string): StripDay[] {
  if (!isDay(when)) return [];
  const days: { day: string; price: Paise | null; active: boolean }[] = [];
  for (const el of selectAll(html, strip.items, 62)) {
    const part = outerOf(html, el);
    if (part == null) return [];
    days.push({ day: first(strip.day, part, url) ?? '', price: parseRupees(first(strip.price, part, url)?.replace(/\s+/g, '')), active: selectFirst(part, strip.active) != null });
  }
  const at = days.findIndex((d) => d.active);
  if (at < 0 || days.filter((d) => d.active).length !== 1) return [];
  const out: StripDay[] = [];
  for (let i = 0; i < days.length; i++) {
    const date = plusDays(when, i - at);
    if (!dayFits(days[i]!.day, date)) return [];
    const price = days[i]!.price;
    if (price != null && price >= MIN_FARE) out.push({ date, price });
  }
  return out;
}

/**
 * Read one results page with one recipe. Rows come in the page's own order. `when`, the searched
 * day ('YYYY-MM-DD'), dates the site's strip; without it there is no strip.
 */
export function readFares(recipe: FareRecipe, html: string, url: string, when?: string): FareRead {
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
      area: clean(first(recipe.area, part, url), 60),
    });
  }
  if (rows.length) {
    const strip = recipe.strip && when ? readStrip(recipe.strip, html, url, when) : [];
    return { status: 'fares', rows, cheapest: Math.min(...rows.map((r) => r.price)), strip };
  }
  if (recipe.login?.some((c) => text.includes(c.toLowerCase()))) return { status: 'login', rows: [] };
  if (recipe.ask?.some((c) => text.includes(c.toLowerCase()))) return { status: 'ask', rows: [] };
  return { status: 'waiting', rows: [] };
}

const FIELD_KEYS = new Set(['selector', 'attribute', 'regex', 'match', 'squash', 'replace', 'sub_regex']);
const RECIPE_KEYS = new Set(['site', 'sector', 'verified', 'page', 'items', 'label', 'price', 'depart', 'arrive', 'origin', 'destination', 'duration', 'stops', 'eta', 'check', 'login', 'ask', 'max', 'strip', 'area', 'per', 'places', 'fill']);
const STRIP_KEYS = new Set(['items', 'day', 'price', 'active']);

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
  // The app hands the reader the cards alone (android/js/fares.ts: a results page can be 8.8 MB),
  // so a card selector that needs the cards' ancestors ("#list .card") would find nothing there.
  const alone = (name: string, v: unknown) => {
    try {
      if (typeof v === 'string' && parseSelector(v).parts.length > 1) errs.push(`${name}: one part only (no space or >): the app reads the cards without their page`);
    } catch { /* reported by selector() */ }
  };
  selector('items', r.items);
  alone('items', r.items);
  const fieldList = (name: string, fields: unknown) => {
    if (!Array.isArray(fields) || !fields.length) { errs.push(`${name}: one or more fields`); return; }
    fields.forEach((f: Record<string, unknown>, i) => {
      for (const k of Object.keys(f ?? {})) if (!FIELD_KEYS.has(k)) errs.push(`${name}[${i}]: unknown key ${k}`);
      if (!Array.isArray(f?.selector) || !(f.selector as unknown[]).length) errs.push(`${name}[${i}]: selector`);
      else (f.selector as unknown[]).forEach((s) => selector(`${name}[${i}]`, s));
      if (typeof f?.attribute !== 'string' || !/^(innerText|textContent|alt|attr:[\w-]+)$/.test(f.attribute)) errs.push(`${name}[${i}]: attribute`);
      for (const re of (f?.regex as unknown[] | undefined) ?? []) regex(`${name}[${i}].regex`, re);
    });
  };
  for (const name of ['label', 'price', 'depart', 'arrive', 'origin', 'destination', 'duration', 'stops', 'eta', 'area']) {
    if (r[name] === undefined && name !== 'label' && name !== 'price') continue;
    fieldList(name, r[name]);
  }
  if (r.sector === 'hotel' && r.per !== 'night' && r.per !== 'stay') errs.push('per: night or stay (a hotel price is one or the other)');
  if (r.sector !== 'hotel' && r.per !== undefined) errs.push('per: hotels only');
  if (r.places !== undefined) {
    if (r.sector !== 'ride') errs.push('places: rides only');
    else selector('places', r.places);
  }
  if (r.fill !== undefined) {
    const f = r.fill as Record<string, unknown> | null;
    if (r.sector !== 'ride') errs.push('fill: rides only');
    else if (!f || typeof f !== 'object') errs.push('fill: an object');
    else {
      for (const k of Object.keys(f)) if (!['boxes', 'search', 'suggestions'].includes(k)) errs.push(`fill: unknown key ${k}`);
      for (const k of ['boxes', 'search'] as const) {
        const pair = f[k];
        if (!Array.isArray(pair) || pair.length !== 2) errs.push(`fill.${k}: two selectors (pickup, drop)`);
        else pair.forEach((v, i) => selector(`fill.${k}[${i}]`, v));
      }
      selector('fill.suggestions', f.suggestions);
    }
  }
  if (r.strip !== undefined) {
    const st = r.strip as Record<string, unknown>;
    if (!st || typeof st !== 'object') errs.push('strip: an object');
    else {
      for (const k of Object.keys(st)) if (!STRIP_KEYS.has(k)) errs.push(`strip: unknown key ${k}`);
      selector('strip.items', st.items);
      alone('strip.items', st.items);
      selector('strip.active', st.active);
      fieldList('strip.day', st.day);
      fieldList('strip.price', st.price);
    }
  }
  for (const name of ['check', 'login', 'ask']) {
    const v = r[name];
    if (v === undefined && name !== 'check') continue;
    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string' || s.trim().length < 6)) errs.push(`${name}: texts of 6+ characters`);
  }
  if (r.max !== undefined && !(Number.isInteger(r.max) && (r.max as number) > 0 && (r.max as number) <= 100)) errs.push('max: 1 to 100');
  return errs;
}
