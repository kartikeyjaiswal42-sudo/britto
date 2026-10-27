// Travel links, checked in a real browser (BLUEPRINT §14): `node scripts/travel.mjs`.
// Builds links with web/travel.js (the code the site runs) and opens each one whose format is
// marked 'opened' on the real site, asserting that the site shows the search: route, dates,
// travellers. One page load per site, Chromium's own User-Agent plus "BrittoBot" (honest). A
// site that refuses this network is a SKIP (NOT verified), never worked around. The other
// sites are opened once too and what happened is printed, as information only.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { airportIndex, flightSearch, hotelSearch, rideSearch, todayIST } from '../web/travel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require(process.env.PW_DIR ?? 'playwright-core'); } catch { return require('playwright'); } })();
const airports = airportIndex(JSON.parse(readFileSync(join(ROOT, 'web/airports.json'), 'utf8')).airports);

let pass = 0; let fail = 0; let skips = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${!ok && detail ? `  — ${detail}` : ''}`); };
const skip = (name, why) => { skips++; console.log(`SKIP  ${name}  — NOT verified: ${why}`); };

// Dates a month ahead, so the searches are always in the future.
const day = (n) => new Date(Date.parse(`${todayIST()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const D1 = day(31); const D2 = day(34);
/** Cleartrip prints "Fri, Nov 27" in its flight form and "27 Nov'26" on hotel results. */
const ctFlight = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const ctHotel = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${d.getUTCDate()} ${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}'${String(d.getUTCFullYear()).slice(2)}`; };

const oneWay = flightSearch({ from: 'DEL', to: 'BOM', depart: D1, adults: 1, cabin: 'economy' }, airports);
const roundTrip = flightSearch({ from: 'DEL', to: 'GOI', depart: D1, ret: D2, adults: 2, cabin: 'business' }, airports);
const hotel = hotelSearch({ city: 'Goa', checkIn: D1, checkOut: day(33), adults: 2 });
const ride = rideSearch({ to: 'DEL', pickup: { lat: 28.6315, lng: 77.2167 } }, airports);
for (const s of [oneWay, roundTrip, hotel, ride]) if (!s.ok) throw new Error(s.reason);
const url = (search, id) => search.links.find((l) => l.id === id).url;

const browser = await chromium.launch({ headless: true });
console.log(`browser: ${browser.version()} · searches for ${D1} / ${D2}`);
const probe = await browser.newPage();
const ua = `${await probe.evaluate(() => navigator.userAgent)} BrittoBot/0.1 (+https://britto.amitynoidalibrary.workers.dev/bot)`;
await probe.close();

/** Open a link; -> { status, text (page text + form values), apiRefused } or { error }. */
async function open(link, wait = 12_000) {
  const ctx = await browser.newContext({ userAgent: ua, locale: 'en-IN', timezoneId: 'Asia/Kolkata', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(wait);
    const text = await page.evaluate(() => [document.body?.innerText ?? '', ...[...document.querySelectorAll('input')].map((n) => n.value)].join(' | '));
    return { status: res?.status() ?? 0, text: text.replace(/\s+/g, ' ') };
  } catch (e) {
    return { error: e.message.split('\n')[0] };
  } finally {
    await ctx.close();
  }
}

const refused = (r) => r.error || r.status >= 400 || /captcha|detected as a robot|access denied/i.test(r.text ?? '');
const why = (r) => r.error ?? `HTTP ${r.status}${/captcha/i.test(r.text ?? '') ? ' (captcha)' : ''}`;

try {
  let r = await open(url(oneWay, 'cleartrip'));
  if (refused(r)) skip('Cleartrip flight link fills the search', why(r));
  else check(`Cleartrip, one way: DEL → BOM, ${ctFlight(D1)}, 1 traveller, Economy`, ['DEL - New Delhi', 'BOM - Mumbai', ctFlight(D1), '1 Traveller, Economy'].every((s) => r.text.includes(s)), r.text.slice(0, 300));

  r = await open(url(roundTrip, 'cleartrip'));
  if (refused(r)) skip('Cleartrip round-trip link fills the search', why(r));
  else check(`Cleartrip, round trip: DEL ⇄ GOI, ${ctFlight(D1)} – ${ctFlight(D2)}, 2 travellers, Business`, ['Round trip', 'DEL - New Delhi', 'GOI - Goa', ctFlight(D1), ctFlight(D2), '2 Travellers, Business'].every((s) => r.text.includes(s)), r.text.slice(0, 300));

  r = await open(url(hotel, 'cleartrip'));
  if (refused(r)) skip('Cleartrip hotel link fills the search', why(r));
  else check(`Cleartrip hotels: Goa, ${ctHotel(D1)} – ${ctHotel(day(33))}, 2 guests, with hotels listed`, ['Showing hotels in Goa', ctHotel(D1), ctHotel(day(33)), '1 room, 2 guests'].every((s) => r.text.includes(s)), r.text.slice(0, 300));

  r = await open(url(ride, 'uber'));
  if (refused(r)) skip('Uber ride link fills pickup and drop', why(r));
  else check('Uber: a ride to Indira Gandhi International Airport from the given point', /Choose a ride|Plan your Uber/i.test(r.text) && r.text.includes('Indira Gandhi International Airport'), r.text.slice(0, 300));

  console.log('— not counted: the other links, opened once each to see what happens from this network');
  for (const [label, search] of [['flight', oneWay], ['hotel', hotel]]) {
    for (const l of search.links.filter((x) => x.prefilled && x.checked !== 'opened')) {
      const o = await open(l.url, 6_000);
      console.log(`  info ${label} ${l.name} (${l.checked ?? 'not checked'}): ${refused(o) ? `refused this network: ${why(o)}` : `HTTP ${o.status}, page text ${o.text.length} characters`}`);
    }
  }
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed${skips ? `, ${skips} NOT verified here (SKIP above)` : ''}`);
process.exit(fail ? 1 : 0);
