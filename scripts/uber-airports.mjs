// Which airports Uber recognises, and at which point (BLUEPRINT §14 rides):
// `node scripts/uber-airports.mjs`. Uber's documented ride link (m.uber.com/looking) takes
// coordinates, ignores the name we send, and snaps the point to the nearest place on its map:
// Delhi airport's point in the airport list (28.5556, 77.0952) snapped to "50 Feet Rd … Nangloi"
// while Wikidata's (28.5574, 77.0833) snapped to "Gate 7, Terminal 3" (measured 2026-10-27).
// So a ride link is offered only for an airport whose point Uber was SEEN to read as that
// airport. For each Indian airport, up to two points are tried, in order: OurAirports
// (web/airports.json) and Wikidata (CC0, one query, IATA code P238 + coordinates P625). Each try
// is one page load (Chromium's User-Agent plus "BrittoBot"), pickup 0.05° north of the point,
// and Uber's own reading of the drop is taken from the page it lands on. Writes web/rides.json.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOT = 'BrittoBot/0.1 (+https://britto.amitynoidalibrary.workers.dev/bot; travel links)';
const WIKIDATA = 'https://query.wikidata.org/sparql';

/**
 * Uber's name for the place IS an airport or one of its terminals, not something near it
 * ("Unnamed Road, Raja Bhoj Airport Area", "Bhavnagar Airport Fire Station", "old airport
 * khajuraho" and "1316, Airport" (a house number) were all seen, 2026-10-27). "Gate 7,
 * Terminal 3" is a terminal entrance: kept.
 */
export function isAirportPlace(name) {
  return /\b(airport|terminal|aerodrome)\b/i.test(name) && !/^\s*\d/.test(name)
    && !/\b(unnamed|road|rd|marg|area|colony|fire|station|cargo|parking|hangar|police|hotel|lounge|restaurant|cafe|office|quarters|old)\b/i.test(name);
}

const place = (lat, lng) => encodeURIComponent(JSON.stringify({ latitude: lat, longitude: lng }));
const round4 = (x) => Math.round(x * 1e4) / 1e4;
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

/** IATA -> [lat, lng] for Indian airports on Wikidata. */
async function wikidataPoints() {
  const query = 'SELECT ?iata ?coord WHERE { ?item wdt:P238 ?iata; wdt:P17 wd:Q668; wdt:P625 ?coord. }';
  const res = await fetch(`${WIKIDATA}?query=${encodeURIComponent(query)}`, { headers: { accept: 'application/sparql-results+json', 'user-agent': BOT } });
  if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`);
  const out = new Map();
  for (const b of (await res.json()).results.bindings) {
    const m = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(b.coord.value);
    if (m && !out.has(b.iata.value)) out.set(b.iata.value, [round4(Number(m[2])), round4(Number(m[1]))]);
  }
  return out;
}

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = (() => { try { return require(process.env.PW_DIR ?? 'playwright-core'); } catch { return require('playwright'); } })();
  // --only A,B: measure just these airports again and update web/rides.json in place.
  const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
  const rows = JSON.parse(readFileSync(join(ROOT, 'web/airports.json'), 'utf8')).airports.filter((a) => a[3] === 'IN' && (!only || only.has(a[0])));
  const wikidata = await wikidataPoints();
  console.log(`Wikidata: ${wikidata.size} Indian airports with coordinates`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const probe = await browser.newPage();
  const ua = `${await probe.evaluate(() => navigator.userAgent)} BrittoBot/0.1 (+https://britto.amitynoidalibrary.workers.dev/bot)`;
  await probe.close();

  /** Uber's reading of a drop point: { addressLine1, addressLine2 } or null. */
  async function uberReads(lat, lng) {
    const ctx = await browser.newContext({ userAgent: ua, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    const page = await ctx.newPage();
    try {
      await page.goto(`https://m.uber.com/looking?pickup=${place(round4(lat + 0.05), lng)}&drop%5B0%5D=${place(lat, lng)}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForURL(/product-selection/, { timeout: 25_000 });
      return JSON.parse(new URL(page.url()).searchParams.get('drop[0]') ?? 'null');
    } catch {
      return null;
    } finally {
      await ctx.close();
    }
  }

  const before = only ? JSON.parse(readFileSync(join(ROOT, 'web/rides.json'), 'utf8')) : null;
  const uber = before ? before.uber : {};
  const notAnAirportToUber = before ? before.notAnAirportToUber : {};
  for (const iata of only ?? []) { delete uber[iata]; delete notAnAirportToUber[iata]; }
  try {
    for (const [iata, name, , , lat, lng] of rows) {
      const tries = [['ourairports', lat, lng]];
      const wd = wikidata.get(iata);
      if (wd && (Math.abs(wd[0] - lat) > 1e-3 || Math.abs(wd[1] - lng) > 1e-3)) tries.push(['wikidata', wd[0], wd[1]]);
      const seen = [];
      for (const [from, la, ln] of tries) {
        const drop = await uberReads(la, ln);
        const label = drop ? [drop.addressLine1, drop.addressLine2].filter(Boolean).join(' | ') : 'no reading';
        seen.push(`${from}: ${label}`);
        if (drop && isAirportPlace(drop.addressLine1 ?? '')) { uber[iata] = { lat: la, lng: ln, name: drop.addressLine1, from }; break; }
      }
      if (uber[iata]) console.log(`  ok ${iata} ${name} -> ${uber[iata].name} (${uber[iata].from})`);
      else { notAnAirportToUber[iata] = seen.join(' ; '); console.log(`  no ${iata} ${name} -> ${seen.join(' ; ')}`); }
    }
  } finally {
    await browser.close();
  }
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const body = {
    measured: before?.measured ?? new Date().toISOString().slice(0, 10),
    how: 'scripts/uber-airports.mjs: Uber ride link with the point as the drop; Uber\'s own name for it, kept when isAirportPlace(name). Points: OurAirports (public domain), then Wikidata (CC0).',
    uber: sorted(uber),
    notAnAirportToUber: sorted(notAnAirportToUber),
  };
  writeFileSync(join(ROOT, 'web/rides.json'), JSON.stringify(body, null, 1) + '\n');
  console.log(`\n${Object.keys(uber).length} of ${Object.keys(uber).length + Object.keys(notAnAirportToUber).length} Indian airports read as an airport by Uber -> web/rides.json`);
}
