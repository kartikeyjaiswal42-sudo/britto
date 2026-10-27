// Which airports' points Uber recognises (BLUEPRINT §14 rides): `node scripts/uber-airports.mjs`.
// Uber's documented ride link (m.uber.com/looking) takes coordinates, ignores the name we send,
// and snaps the point to the nearest place on its map: Delhi airport's point in the airport list
// (28.5556, 77.0952) snapped to "50 Feet Rd … Nangloi" (measured 2026-10-27). So a ride link is
// offered only for an airport whose own point Uber was SEEN to read as an airport. For each
// Indian airport: one page load (Chromium's User-Agent plus "BrittoBot"), pickup 0.05° north of
// the airport, and Uber's own reading of the drop taken from the page it lands on.
// Writes web/rides.json.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require(process.env.PW_DIR ?? 'playwright-core'); } catch { return require('playwright'); } })();

/**
 * Uber's name for the place IS an airport or terminal, not something near one ("Unnamed Road,
 * Raja Bhoj Airport Area" and "Bhavnagar Airport Fire Station" were both seen, 2026-10-27).
 */
export function isAirportPlace(name) {
  return /\b(airport|terminal|aerodrome)\b/i.test(name)
    && !/\b(unnamed|road|rd|marg|area|colony|fire|station|cargo|parking|hangar|gate|police|hotel|lounge|restaurant|cafe|office|quarters)\b/i.test(name);
}

const place = (lat, lng) => encodeURIComponent(JSON.stringify({ latitude: lat, longitude: lng }));
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

async function main() {
const rows = JSON.parse(readFileSync(join(ROOT, 'web/airports.json'), 'utf8')).airports.filter((a) => a[3] === 'IN');
const browser = await chromium.launch({ headless: true });
const probe = await browser.newPage();
const ua = `${await probe.evaluate(() => navigator.userAgent)} BrittoBot/0.1 (+https://britto.amitynoidalibrary.workers.dev/bot)`;
await probe.close();

const airports = {};
const other = {};
try {
  for (const [iata, name, , , lat, lng] of rows) {
    const ctx = await browser.newContext({ userAgent: ua, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    const page = await ctx.newPage();
    let drop = null;
    try {
      await page.goto(`https://m.uber.com/looking?pickup=${place(Math.round((lat + 0.05) * 1e4) / 1e4, lng)}&drop%5B0%5D=${place(lat, lng)}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForURL(/product-selection/, { timeout: 25_000 });
      drop = JSON.parse(new URL(page.url()).searchParams.get('drop[0]') ?? 'null');
    } catch (e) {
      other[iata] = `no reading: ${e.message.split('\n')[0].slice(0, 80)}`;
    }
    await ctx.close();
    if (!drop) { console.log(`  ?  ${iata} ${other[iata]}`); continue; }
    const label = [drop.addressLine1, drop.addressLine2].filter(Boolean).join(' | ');
    if (isAirportPlace(drop.addressLine1 ?? '')) { airports[iata] = label; console.log(`  ok ${iata} ${name} -> ${label}`); }
    else { other[iata] = label; console.log(`  no ${iata} ${name} -> ${label}`); }
  }
} finally {
  await browser.close();
}
const body = {
  measured: new Date().toISOString().slice(0, 10),
  how: 'scripts/uber-airports.mjs: Uber ride link with the airport list point as the drop; Uber\'s own name for it (addressLine1 | addressLine2), kept when isAirportPlace(addressLine1)',
  uber: airports,
  notAnAirportToUber: other,
};
writeFileSync(join(ROOT, 'web/rides.json'), JSON.stringify(body, null, 1) + '\n');
console.log(`\n${Object.keys(airports).length} of ${rows.length} Indian airports read as an airport by Uber -> web/rides.json`);
}
