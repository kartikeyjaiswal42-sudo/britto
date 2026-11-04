import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFareRecipe, readFares, type FareRecipe, type FareRow } from './fares.ts';
import { clock, flightName, groupFlights, otherAirport, rideRows, siteSummary } from '../web/compare.js';

// Every page here was saved INSIDE the Britto app (debug build, Android 14 emulator, a home
// network in India) on 2026-11-04: Delhi -> Mumbai, one adult, economy, 20 Nov 2026. EaseMyTrip's
// is its first 20 fare cards, exactly as the app hands them to the reader (its whole page is
// 8.8 MB); Uber's is only the ride list (the full page holds places from the logged-in account).
const recipes = (JSON.parse(readFileSync(new URL('../web/fares.json', import.meta.url), 'utf8')) as { recipes: FareRecipe[] }).recipes;
const recipe = (site: string) => recipes.find((r) => r.site === site)!;
const page = (name: string) => {
  const html = readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8');
  const url = /^<!-- saved by the Britto app[^>]*? from (\S+)/.exec(html)?.[1];
  assert.ok(url, `${name}: says where it was saved from`);
  return { html, url };
};
const read = (site: string, name: string) => {
  const p = page(name);
  return readFares(recipe(site), p.html, p.url);
};
const rows = (r: ReturnType<typeof readFares>): FareRow[] => (r.status === 'fares' ? r.rows : []);
const find = (list: FareRow[], depart: string, arrive: string) => list.find((r) => r.depart === depart && r.arrive === arrive);

test('fare recipes: every one in web/fares.json is usable, and refusals are real', () => {
  assert.deepEqual(recipes.map((r) => r.site), ['ixigo', 'makemytrip', 'goibibo', 'easemytrip', 'uber']);
  for (const r of recipes) assert.deepEqual(checkFareRecipe(r), [], r.site);
  const ok = recipe('ixigo');
  assert.match(checkFareRecipe({ ...ok, items: 'div:first-child' }).join(), /items/);
  assert.match(checkFareRecipe({ ...ok, page: 'ixigo' }).join(), /page/);
  assert.match(checkFareRecipe({ ...ok, check: ['bot'] }).join(), /check/);
  assert.match(checkFareRecipe({ ...ok, price: [] }).join(), /price/);
  assert.match(checkFareRecipe({ ...ok, extra: 1 }).join(), /unknown key extra/);
  assert.match(checkFareRecipe({ ...ok, label: [{ selector: ['p'], attribute: 'href' }] }).join(), /attribute/);
});

test('ixigo: flights with number, times, airports, and the fare to pay', () => {
  const r = read('ixigo', 'fares-ixigo-del-bom-2026-11-20.html');
  assert.equal(r.status, 'fares');
  assert.equal(rows(r).length, 40);
  assert.equal(r.status === 'fares' && r.cheapest, 727900);
  assert.deepEqual(rows(r)[0], { label: 'IndiGo • 6E 5175', price: 732600, depart: '12:55', arrive: '14:55', origin: 'HDO', destination: 'BOM', duration: '2h', stops: 'Non-stop', eta: null });
  assert.equal(find(rows(r), '03:30', '05:55')?.price, 742700);
});

test('MakeMyTrip: the final fare, never the struck-out one beside it', () => {
  const r = read('makemytrip', 'fares-makemytrip-del-bom-2026-11-20.html');
  assert.equal(rows(r).length, 16);
  assert.equal(r.status === 'fares' && r.cheapest, 701600);
  assert.deepEqual(rows(r)[0], { label: 'IndiGo', price: 701600, depart: '12:55', arrive: '14:55', origin: 'HDO', destination: 'BOM', duration: '2h', stops: 'Non stop', eta: null });
  // 14:45 -> 17:20 shows "₹ 7,637" struck out and "₹ 7,334" to pay (seen in the page).
  assert.equal(find(rows(r), '14:45', '17:20')?.price, 733400);
});

test('Goibibo: cities as it prints them, and non-stop flights too', () => {
  const r = read('goibibo', 'fares-goibibo-del-bom-2026-11-20.html');
  assert.equal(rows(r).length, 16);
  assert.equal(r.status === 'fares' && r.cheapest, 711600);
  assert.deepEqual(rows(r)[0], { label: 'IndiGo', price: 711600, depart: '12:55', arrive: '14:55', origin: 'Ghaziabad', destination: 'Mumbai', duration: '2h', stops: 'Non stop', eta: null });
  assert.equal(find(rows(r), '05:30', '10:05')?.stops, '1 stop(s)');
});

test('EaseMyTrip: from its fare cards; Navi Mumbai arrivals kept as printed', () => {
  const r = read('easemytrip', 'fares-easemytrip-del-bom-2026-11-20-cards.html');
  assert.equal(rows(r).length, 18);
  assert.equal(r.status === 'fares' && r.cheapest, 711600);
  assert.deepEqual(rows(r)[0], { label: 'IndiGo | 6E - 5175', price: 711600, depart: '12:55', arrive: '14:55', origin: 'HDO', destination: 'BOM', duration: '02h 00m', stops: 'Non-stop', eta: null });
  assert.equal(find(rows(r), '05:30', '07:45')?.destination, 'NMI');
});

test('Uber: every ride with its fare (paise kept), the struck-out fare never taken', () => {
  const r = read('uber', 'fares-uber-cp-del-t3-2026-11-04-list.html');
  assert.deepEqual(rows(r).map((x) => [x.label, x.price]), [
    ['Go Sedan', 36618], ['Uber Go AC', 44977], ['UberXL', 68862], ['Bike Saver', 16461], ['Go Priority', 52120],
    ['Bike', 18801], ['Premier AC', 47052], ['Black', 69910], ['Premier XL', 73625],
  ]);
  assert.equal(rows(r)[0]!.eta, '10:19 AM • 1 min');
  assert.equal(r.status === 'fares' && r.cheapest, 16461);
});

test('pages without fares say why: log in, a person check, another page, still loading', () => {
  assert.equal(read('uber', 'fares-uber-logged-out-2026-11-04.html').status, 'login');
  // Skyscanner's own "Are you a person or a robot?" page, read with a recipe for its address.
  const sky = page('fares-skyscanner-person-check-2026-11-04.html');
  assert.equal(readFares({ ...recipe('ixigo'), site: 'skyscanner', page: '^https://www\\.skyscanner\\.co\\.in/' }, sky.html, sky.url).status, 'check');
  const mmt = page('fares-makemytrip-del-bom-2026-11-20.html');
  assert.equal(readFares(recipe('ixigo'), mmt.html, mmt.url).status, 'other_page', "ixigo's recipe on MakeMyTrip's page");
  assert.equal(readFares(recipe('makemytrip'), '<html><body><div>Hold on, we are fetching flights</div></body></html>', mmt.url).status, 'waiting');
});

test("Uber's airline question (an airport drop) is its own answer, never taken for no fares", () => {
  // Built from Uber's own words on the phone's screen (2026-11-04 11:36, the owner's logged-in
  // Uber in the Britto app; the page itself was not saved: it belongs to their account).
  const asked = '<html><body><h1>Which airline?</h1><p>Indira Gandhi International Airport</p><ul><li>Air India Terminal 3</li><li>IndiGo Terminal 1, Terminal 3</li></ul><button>Next</button><button>Skip</button></body></html>';
  assert.equal(readFares(recipe('uber'), asked, 'https://m.uber.com/go/home?drop').status, 'ask');
  assert.match(checkFareRecipe({ ...recipe('uber'), ask: ['air'] }).join(), /ask/);
});

test('rides: cheapest first, parcel delivery left out', () => {
  const list = rows(read('uber', 'fares-uber-cp-del-t3-2026-11-04-list.html'));
  const parcel: FareRow = { ...list[0]!, label: 'Parcel Bike', price: 6525 };
  const out = rideRows([{ id: 'uber', name: 'Uber', url: 'https://m.uber.com/x', status: 'fares', rows: [...list, parcel] }, { id: 'x', name: 'X', url: '', status: 'login' }]);
  assert.deepEqual(out.map((r) => [r.label, r.price]).slice(0, 3), [['Bike Saver', 16461], ['Bike', 18801], ['Go Sedan', 36618]]);
  assert.equal(out.length, 9, 'the nine rides, not the parcel option');
  assert.ok(out.every((r) => r.site.id === 'uber'));
});

test('compare: one flight across four sites, cheapest offer first, other airports flagged', () => {
  const sites = [
    ['ixigo', 'ixigo', 'fares-ixigo-del-bom-2026-11-20.html'],
    ['makemytrip', 'MakeMyTrip', 'fares-makemytrip-del-bom-2026-11-20.html'],
    ['goibibo', 'Goibibo', 'fares-goibibo-del-bom-2026-11-20.html'],
    ['easemytrip', 'EaseMyTrip', 'fares-easemytrip-del-bom-2026-11-20-cards.html'],
  ].map(([id, name, file]) => ({ id: id!, name: name!, url: `https://${id}.example/results`, status: 'fares', rows: rows(read(id!, file!)) }));
  const flights = groupFlights(sites);
  const hindon = flights.find((f) => f.key === 'indigo|12:55|14:55')!;
  assert.equal(flights[0], hindon, 'the cheapest flight first');
  assert.equal(hindon.number, '6E 5175', 'the flight number from the sites that print one');
  assert.deepEqual(hindon.offers.map((o) => [o.site, o.price]), [['makemytrip', 701600], ['easemytrip', 711600], ['goibibo', 711600], ['ixigo', 732600]]);
  assert.deepEqual(hindon.from, ['HDO', 'Ghaziabad']);
  assert.ok(otherAirport(hindon.from, 'DEL', 'New Delhi'), 'Hindon is not Delhi airport');
  assert.ok(otherAirport(['Ghaziabad'], 'DEL', 'New Delhi'), 'nor is a city name other than the airport\u2019s (Goibibo prints cities)');
  const early = flights.find((f) => f.key === 'indigo|03:30|05:55')!;
  assert.equal(early.offers.length, 4);
  assert.ok(!otherAirport(early.from, 'DEL', 'New Delhi') && !otherAirport(early.to, 'BOM', 'Mumbai'), 'DEL and "New Delhi" are the searched airport');
  assert.ok(flights.every((f, i) => i === 0 || flights[i - 1]!.best <= f.best), 'cheapest first');
  assert.ok(flights.every((f) => f.offers.every((o, i) => i === 0 || f.offers[i - 1]!.price <= o.price)));
  assert.deepEqual(siteSummary(sites).map((s) => [s.id, s.cheapest]), [['makemytrip', 701600], ['goibibo', 711600], ['easemytrip', 711600], ['ixigo', 727900]]);
  assert.deepEqual(siteSummary([{ id: 'x', name: 'X', url: '', status: 'check' }, ...sites.slice(0, 1)]).map((s) => [s.id, s.cheapest]), [['ixigo', 727900], ['x', null]], 'sites without fares come last');
});

test('compare: names and times as the sites print them', () => {
  assert.deepEqual(flightName('IndiGo • 6E 5175'), { airline: 'IndiGo', number: '6E 5175' });
  assert.deepEqual(flightName('IndiGo | 6E - 5175'), { airline: 'IndiGo', number: '6E 5175' });
  assert.deepEqual(flightName('Air-India Express • IX 1080'), { airline: 'Air-India Express', number: 'IX 1080' });
  assert.deepEqual(flightName('Air India Express'), { airline: 'Air India Express', number: null });
  assert.equal(groupFlights([
    { id: 'a', name: 'A', url: '', rows: [{ label: 'Air-India Express • IX 1080', price: 744600, depart: '5:30', arrive: '07:45', origin: null, destination: null, duration: null, stops: null, eta: null }] },
    { id: 'b', name: 'B', url: '', rows: [{ label: 'Air India Express', price: 734600, depart: '05:30', arrive: '07:45', origin: null, destination: null, duration: null, stops: null, eta: null }] },
  ]).length, 1, 'the same airline however it is spelt, at the same minutes');
  const row = (price: number): FareRow => ({ label: 'IndiGo • 6E 353', price, depart: '03:30', arrive: '05:55', origin: 'DEL', destination: 'BOM', duration: null, stops: null, eta: null });
  assert.deepEqual(groupFlights([{ id: 'a', name: 'A', url: '', rows: [row(742700), row(732700)] }])[0]!.offers.map((o) => o.price), [732700], "a site listing a flight twice (two fare types): its lower fare");
  assert.equal(clock('6:05'), '06:05');
  assert.equal(clock('24:10'), null);
  assert.equal(clock('10:19 AM'), null);
});
