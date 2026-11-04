import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFareRecipe, dayFits, readFares, type FareRecipe, type FareRow, type StripDay } from './fares.ts';
import { clock, fareStrip, flightName, groupFlights, groupHotels, hotelKey, otherAirport, rideRows, siteSummary, tripTotal } from '../web/compare.js';

// Every page here was saved INSIDE the Britto app (debug build, Android 14 emulator, a home
// network in India) on 2026-11-04: Delhi -> Mumbai, one adult, economy, 20 Nov 2026. EaseMyTrip's
// is its first 20 fare cards, exactly as the app hands them to the reader (its whole page is
// 8.8 MB); Uber's is only the ride list (the full page holds places from the logged-in account).
const recipes = (JSON.parse(readFileSync(new URL('../web/fares.json', import.meta.url), 'utf8')) as { recipes: FareRecipe[] }).recipes;
const recipe = (site: string, sector = 'flight') => recipes.find((r) => r.site === site && (r.sector === 'ride' || r.sector === sector))!;
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
  assert.deepEqual(recipes.map((r) => `${r.site}:${r.sector}`), ['ixigo:flight', 'makemytrip:flight', 'goibibo:flight', 'easemytrip:flight', 'uber:ride', 'rapido:ride', 'booking:hotel', 'cleartrip:hotel']);
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
  assert.deepEqual(rows(r)[0], { label: 'IndiGo • 6E 5175', price: 732600, depart: '12:55', arrive: '14:55', origin: 'HDO', destination: 'BOM', duration: '2h', stops: 'Non-stop', eta: null, area: null });
  assert.equal(find(rows(r), '03:30', '05:55')?.price, 742700);
});

test('MakeMyTrip: the final fare, never the struck-out one beside it', () => {
  const r = read('makemytrip', 'fares-makemytrip-del-bom-2026-11-20.html');
  assert.equal(rows(r).length, 16);
  assert.equal(r.status === 'fares' && r.cheapest, 701600);
  assert.deepEqual(rows(r)[0], { label: 'IndiGo', price: 701600, depart: '12:55', arrive: '14:55', origin: 'HDO', destination: 'BOM', duration: '2h', stops: 'Non stop', eta: null, area: null });
  // 14:45 -> 17:20 shows "₹ 7,637" struck out and "₹ 7,334" to pay (seen in the page).
  assert.equal(find(rows(r), '14:45', '17:20')?.price, 733400);
});

test('Goibibo: cities as it prints them, and non-stop flights too', () => {
  const r = read('goibibo', 'fares-goibibo-del-bom-2026-11-20.html');
  assert.equal(rows(r).length, 16);
  assert.equal(r.status === 'fares' && r.cheapest, 711600);
  assert.deepEqual(rows(r)[0], { label: 'IndiGo', price: 711600, depart: '12:55', arrive: '14:55', origin: 'Ghaziabad', destination: 'Mumbai', duration: '2h', stops: 'Non stop', eta: null, area: null });
  assert.equal(find(rows(r), '05:30', '10:05')?.stops, '1 stop(s)');
});

test('EaseMyTrip: from its fare cards; Navi Mumbai arrivals kept as printed', () => {
  const r = read('easemytrip', 'fares-easemytrip-del-bom-2026-11-20-cards.html');
  assert.equal(rows(r).length, 18);
  assert.equal(r.status === 'fares' && r.cheapest, 711600);
  assert.deepEqual(rows(r)[0], { label: 'IndiGo | 6E - 5175', price: 711600, depart: '12:55', arrive: '14:55', origin: 'HDO', destination: 'BOM', duration: '02h 00m', stops: 'Non-stop', eta: null, area: null });
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
  // Logged out on the ride list itself (2026-11-04 16:37, the test phone): ride types, no prices.
  assert.equal(read('uber', 'fares-uber-logged-out-list-2026-11-04.html').status, 'login');
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

test('Rapido: every ride type with its fare, read from the ride list its own page showed', () => {
  const r = read('rapido', 'fares-rapido-amity-sector18-2026-11-04-list.html');
  assert.deepEqual(rows(r).map((x) => [x.label, x.price, x.eta]), [
    ['Auto', 16200, '2 mins'], ['Cab Economy', 37600, '2 mins'], ['Cab Premium', 48800, '2 mins'], ['Cab XL', 78800, '2 mins'],
  ]);
  assert.equal(r.status === 'fares' && r.cheapest, 16200, 'Parcel (₹98, a delivery, not a ride) is never the cheapest ride');
  // A card showing two prices is never guessed at: the price after a discount, or nothing.
  const p = page('fares-rapido-amity-sector18-2026-11-04-list.html');
  const two = p.html.replace('<div _ngcontent-ucj-c66="">₹ 162</div>', '<div _ngcontent-ucj-c66=""><span class="price-prior-discount">₹ 200</span> <span>₹ 162</span></div>');
  assert.notEqual(two, p.html);
  assert.equal(rows(readFares(recipe('rapido'), two, p.url)).find((x) => x.label === 'Auto'), undefined, 'two prices, neither marked: not read');
  const marked = two.replace('<span>₹ 162</span>', '<span class="price-after-discount">₹ 162</span>');
  assert.equal(rows(readFares(recipe('rapido'), marked, p.url)).find((x) => x.label === 'Auto')?.price, 16200, 'the price after the discount');
  // Rapido's own words (2026-11-04, on the test phone's screen): its login, and its home page
  // before a trip is entered (the trip is typed on Rapido's page: its address holds none).
  const login = '<html><body><p>Hey there!</p><h2>Enter your mobile number</h2><p>You\u2019ll get an SMS to confirm your number</p><span>+91</span><button>Next</button></body></html>';
  assert.equal(readFares(recipe('rapido'), login, 'https://m.rapido.bike/verify-phonenumber').status, 'login');
  const home = '<html><body><h1>Welcome to Rapido!</h1><p>Book your hassle-free trip with Rapido</p><p>Our Services</p><p>Bike</p><p>Auto</p><p>Car</p><p>Parcel</p></body></html>';
  assert.equal(readFares(recipe('rapido'), home, 'https://m.rapido.bike/home').status, 'ask');
  assert.equal(readFares(recipe('rapido'), p.html, 'https://www.rapido.bike/').status, 'other_page');
  assert.match(checkFareRecipe({ ...recipe('rapido'), sector: 'flight' }).join(), /places: rides only/);
  assert.match(checkFareRecipe({ ...recipe('rapido'), places: 'input:focus' }).join(), /places/);
  // In the app the cards reach the reader without their page: read them that way too.
  const cards = [...p.html.matchAll(/<div _ngcontent-ucj-c66="" class="card-wrap">[\s\S]*?₹ \d+<\/div><!----><!----><\/div>/g)].map((m) => m[0]);
  assert.equal(cards.length, 5);
  assert.equal(rows(readFares(recipe('rapido'), `<html><body><div class="britto-strip"></div><div class="britto-items">${cards.join('')}</div></body></html>`, p.url)).length, 4);
  assert.match(checkFareRecipe({ ...recipe('rapido'), items: '.fare-estimate-wrapper .card-wrap' }).join(), /items: one part only/);
});

test('rides from two apps: one list, cheapest first, parcel left out', () => {
  const uber = rows(read('uber', 'fares-uber-cp-del-t3-2026-11-04-list.html'));
  const rapido = rows(read('rapido', 'fares-rapido-amity-sector18-2026-11-04-list.html'));
  const out = rideRows([{ id: 'uber', name: 'Uber', url: '', status: 'fares', rows: uber }, { id: 'rapido', name: 'Rapido', url: '', status: 'fares', rows: rapido }]);
  assert.equal(out.length, 9 + 4);
  assert.deepEqual(out.slice(0, 3).map((r) => [r.site.id, r.label, r.price]), [['rapido', 'Auto', 16200], ['uber', 'Bike Saver', 16461], ['uber', 'Bike', 18801]]);
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
    { id: 'a', name: 'A', url: '', rows: [{ label: 'Air-India Express • IX 1080', price: 744600, depart: '5:30', arrive: '07:45', origin: null, destination: null, duration: null, stops: null, eta: null, area: null }] },
    { id: 'b', name: 'B', url: '', rows: [{ label: 'Air India Express', price: 734600, depart: '05:30', arrive: '07:45', origin: null, destination: null, duration: null, stops: null, eta: null, area: null }] },
  ]).length, 1, 'the same airline however it is spelt, at the same minutes');
  const row = (price: number): FareRow => ({ label: 'IndiGo • 6E 353', price, depart: '03:30', arrive: '05:55', origin: 'DEL', destination: 'BOM', duration: null, stops: null, eta: null, area: null });
  assert.deepEqual(groupFlights([{ id: 'a', name: 'A', url: '', rows: [row(742700), row(732700)] }])[0]!.offers.map((o) => o.price), [732700], "a site listing a flight twice (two fare types): its lower fare");
  assert.equal(clock('6:05'), '06:05');
  assert.equal(clock('24:10'), null);
  assert.equal(clock('10:19 AM'), null);
});

// The sites' own fares-by-date strips (above their lists), on the same saved pages: the search was
// for Friday 20 Nov 2026.
const SEARCHED = '2026-11-20';
const IXIGO = 'fares-ixigo-del-bom-2026-11-20.html';
const MMT = 'fares-makemytrip-del-bom-2026-11-20.html';
const GOIBIBO = 'fares-goibibo-del-bom-2026-11-20.html';
const strip = (site: string, name: string, when: string | null = SEARCHED, html?: string): StripDay[] => {
  const p = page(name);
  const r = readFares(recipe(site), html ?? p.html, p.url, when ?? undefined);
  assert.equal(r.status, 'fares');
  return r.status === 'fares' ? r.strip : [];
};

test('date strip: each site\u2019s own fare for each day, dated from the searched day', () => {
  const ix = strip('ixigo', IXIGO);
  assert.equal(ix.length, 31, 'ixigo prints 31 days, Thu 05 Nov to Sat 05 Dec');
  assert.deepEqual(ix[0], { date: '2026-11-05', price: 587100 });
  assert.deepEqual(ix.at(-1), { date: '2026-12-05', price: 711600 }, '"Sat, 05" is December: the same day number as "Thu, 05", a month on');
  assert.deepEqual(ix.find((d) => d.date === SEARCHED), { date: SEARCHED, price: 727900 }, 'the searched day, "Fri, 20" \u20b97,279');
  assert.ok(ix.every((d, i) => i === 0 || d.date > ix[i - 1]!.date), 'in date order');
  const mmt = strip('makemytrip', MMT);
  assert.deepEqual([mmt.length, mmt[0], mmt.at(-1)], [15, { date: '2026-11-10', price: 633100 }, { date: '2026-11-24', price: 633100 }]);
  assert.equal(mmt.find((d) => d.date === SEARCHED)!.price, 711600, 'its strip says \u20b97,116 for the 20th ...');
  assert.equal((read('makemytrip', MMT) as { cheapest: number }).cheapest, 701600, '... while its own list starts at \u20b97,016: a strip is the site\u2019s figure, not a fare');
  assert.deepEqual(strip('goibibo', GOIBIBO).find((d) => d.date === '2026-11-11'), { date: '2026-11-11', price: 610500 });
  assert.deepEqual(strip('ixigo', IXIGO, null), [], 'no searched day, no strip');
});

test('date strip: a printed day that does not fit, or no single searched day, drops the whole strip', () => {
  const html = page(IXIGO).html;
  assert.deepEqual(strip('ixigo', IXIGO, '2026-11-21'), [], 'searched the 21st, but the page marked Fri 20');
  const sat = 'border-transparent" rel="nofollow"><p class="body-xs text-neutral-500">Sat, 21 </p>';
  assert.equal(html.split(sat).length, 2);
  assert.deepEqual(strip('ixigo', IXIGO, SEARCHED, html.replace(sat, sat.replace('border-transparent', 'border-subbrand-500'))), [], 'two days marked as the searched one');
  assert.deepEqual(strip('ixigo', IXIGO, SEARCHED, html.replace(sat, sat.replace('Sat, 21', 'Sun, 21'))), [], 'one wrong weekday');
  assert.deepEqual(strip('ixigo', IXIGO, SEARCHED, html.replace(sat, sat.replace('Sat, 21', 'Sat, 22'))), [], 'a day skipped or out of order');
  assert.ok(dayFits('Tue, Nov 10', '2026-11-10') && dayFits('Fri, 20 ', '2026-11-20'));
  assert.ok(!dayFits('Fri, 20', '2026-12-20'), '20 Dec 2026 is a Sunday');
  assert.ok(!dayFits('Tue, Dec 10', '2026-11-10'), 'another month');
  assert.ok(!dayFits('Nov', '2026-11-10') && !dayFits('10 11', '2026-11-10') && !dayFits('Tue 10', '2026-02-30'), 'no day, two numbers, no such date');
  const ok = recipe('ixigo');
  assert.match(checkFareRecipe({ ...ok, strip: { ...ok.strip!, day: [] } }).join(), /strip\.day/);
  assert.match(checkFareRecipe({ ...ok, strip: { ...ok.strip!, active: 'a:hover' } }).join(), /strip\.active/);
  assert.match(checkFareRecipe({ ...ok, strip: { ...ok.strip!, extra: 1 } }).join(), /strip: unknown key extra/);
});

test('compare: the strips merged by day (lowest first), and a round trip as two one-way tickets', () => {
  const sites = [['ixigo', 'ixigo', IXIGO], ['makemytrip', 'MakeMyTrip', MMT], ['goibibo', 'Goibibo', GOIBIBO]]
    .map(([id, name, file]) => ({ id: id!, name: name!, url: '', status: 'fares', rows: rows(read(id!, file!)), strip: strip(id!, file!) }));
  const days = fareStrip([...sites, { id: 'x', name: 'X', status: 'check', strip: [{ date: SEARCHED, price: 100 }] }]);
  assert.equal(days.length, 31, 'every day any site printed');
  assert.deepEqual(days.find((d) => d.date === SEARCHED), { date: SEARCHED, price: 711600, site: 'makemytrip', name: 'MakeMyTrip', sites: 3 }, 'the lowest of three, and a site without fares is not counted');
  assert.deepEqual(days[0], { date: '2026-11-05', price: 587100, site: 'ixigo', name: 'ixigo', sites: 1 });
  assert.ok(days.every((d, i) => i === 0 || d.date > days[i - 1]!.date));
  const onward = groupFlights(sites);
  const back = groupFlights(sites.slice(2));
  const t = tripTotal(onward, back)!;
  assert.deepEqual([t.onward.best, t.back.best, t.total], [701600, 711600, 1413200]);
  assert.equal(tripTotal(onward, []), null, 'no total until both ways have a fare');
});

// Hotels, saved in the app on 2026-11-04: Goa, 20 to 22 Nov (2 nights), 2 adults, the hotel cards
// as the app hands them to the reader.
const hotels = (site: string, name: string) => {
  const p = page(name);
  return readFares(recipe(site, 'hotel'), p.html, p.url);
};
const BOOKING = 'fares-booking-goa-2026-11-20-cards.html';
const CLEARTRIP_HOTELS = 'fares-cleartrip-hotels-goa-2026-11-20-cards.html';

test('hotels: Booking.com prices the whole stay, Cleartrip one night; the struck-out price is never taken', () => {
  const b = hotels('booking', BOOKING);
  assert.equal(b.status, 'fares');
  assert.equal(rows(b).length, 30);
  assert.deepEqual(rows(b)[0], { label: 'Zulu Land cottages - near Curlies beach shack and shiva valley - Anjuna beach', price: 544500, depart: null, arrive: null, origin: null, destination: null, duration: null, stops: null, eta: null, area: 'Anjuna' }, '"Price for 2 nights: \u20b96,050 \u20b95,445": the current price');
  assert.equal((b as { cheapest: number }).cheapest, 180000, 'Samantha Inn Beach Resort, \u20b91,800 for 2 nights');
  const c = hotels('cleartrip', CLEARTRIP_HOTELS);
  assert.deepEqual(rows(c).map((r) => [r.label, r.price, r.area]), [
    ['Royal Orchid Beach Resort & Spa', 1839300, 'Utorda'],
    ["Neemrana's Three Waters", 978800, 'Quitol'],
    ['Gateway Goa Palolem (A Taj InnerCircle Hotel)', 900000, 'Canacona'],
    ['Hotel Eagle Empire', 350000, 'Margao'],
    ['Ginger Candolim', 579400, 'Candolim'],
  ], 'five hotels (their tax lines are matched too, and skipped: no name); \u20b918,393 not the struck \u20b920,666');
  const ok = recipe('booking', 'hotel');
  assert.match(checkFareRecipe({ ...ok, per: undefined }).join(), /per: night or stay/);
  assert.match(checkFareRecipe({ ...recipe('ixigo'), per: 'night' }).join(), /per: hotels only/);
});

test('hotel compare: per night across sites, the same hotel once with both prices, cheapest first', () => {
  const site = (id: string, name: string, file: string) => ({ id, name, url: `https://${id}.example/`, status: 'fares', rows: rows(hotels(id, file)), recipe: recipe(id, 'hotel') });
  const b = site('booking', 'Booking.com', BOOKING);
  const c = site('cleartrip', 'Cleartrip', CLEARTRIP_HOTELS);
  const list = groupHotels([b, c], 2);
  assert.equal(list.length, 35, 'no hotel is on both lists in these pages');
  assert.deepEqual([list[0]!.name, list[0]!.best, list[0]!.offers[0]], ['Samantha Inn Beach Resort', 90000, { site: 'booking', name: 'Booking.com', url: 'https://booking.example/', night: 90000, printed: 180000, per: 'stay' }], 'Booking.com\u2019s \u20b91,800 for 2 nights is \u20b9900 a night');
  assert.equal(list.find((x) => x.name === 'Hotel Eagle Empire')!.best, 350000, 'Cleartrip prints one night already');
  assert.ok(list.every((x, i) => i === 0 || list[i - 1]!.best <= x.best));
  // The same hotel on both sites (a Cleartrip row named like a Booking.com one) is one row, cheaper first.
  const same = { ...c, rows: [...c.rows, { ...c.rows[0]!, label: 'The Baga Pescador Hotel', price: 160000, area: 'Baga' }] };
  const both = groupHotels([b, same], 2).find((x) => x.offers.length === 2)!;
  assert.deepEqual(both.offers.map((o) => [o.site, o.night]), [['cleartrip', 160000], ['booking', 174500]]);
  assert.equal(groupHotels([b, c], 0).length, 0, 'no nights, no per-night price');
  assert.equal(hotelKey('Resort Cape Marino GOA'), hotelKey('Cape Marino Goa Resort'));
  assert.notEqual(hotelKey('Cape Marino'), hotelKey('Cape Marino Goa'), 'never a guess: another word, another hotel');
  assert.equal(hotelKey('The Hotel'), null);
});
