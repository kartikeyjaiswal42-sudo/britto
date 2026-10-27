import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { airportIndex, flightSearch, hotelSearch, rideSearch, todayIST, type TravelLink } from '../web/travel.js';
import { parseCsv } from '../scripts/airports.mjs';
import { isAirportPlace } from '../scripts/uber-airports.mjs';

// The link formats themselves are checked on the real sites by scripts/travel.mjs; these tests
// pin what web/travel.js builds and refuses.
const data = JSON.parse(readFileSync(new URL('../web/airports.json', import.meta.url), 'utf8')) as { source: string; licence: string; airports: [string, string, string, string, number, number][] };
const airports = airportIndex(data.airports);
const NOW = Date.parse('2026-10-27T06:00:00Z');
const by = (links: TravelLink[], id: string) => links.find((l) => l.id === id)!;

test('airports: from OurAirports (public domain), every row usable', () => {
  assert.match(data.source, /ourairports-data\/airports\.csv$/);
  assert.match(data.licence, /Public Domain/);
  assert.equal(airports.size, data.airports.length, 'IATA codes are unique');
  for (const a of airports.values()) {
    assert.ok(/^[A-Z]{3}$/.test(a.iata) && a.name && /^[A-Z]{2}$/.test(a.country) && Math.abs(a.lat) <= 90 && Math.abs(a.lng) <= 180, JSON.stringify(a));
  }
  assert.deepEqual(['DEL', 'BOM', 'BLR', 'GOI', 'GOX', 'CCU'].map((c) => airports.get(c)?.country), ['IN', 'IN', 'IN', 'IN', 'IN', 'IN']);
  assert.equal(airports.get('DXB')?.city, 'Dubai');
});

test('flights: one search, each site with it filled in; checked formats first', () => {
  const s = flightSearch({ from: 'del', to: 'BOM', depart: '2026-11-27', adults: 1, cabin: 'economy' }, airports, NOW);
  assert.ok(s.ok);
  assert.deepEqual(s.links.map((l) => [l.id, l.prefilled, l.checked]), [
    ['cleartrip', true, 'opened'], ['skyscanner', true, 'documented'], ['makemytrip', true, null], ['ixigo', true, null],
    ['goibibo', false, null], ['easemytrip', false, null], ['yatra', false, null], ['indigo', false, null], ['airindia', false, null],
  ]);
  assert.equal(by(s.links, 'cleartrip').url, 'https://www.cleartrip.com/flights/results?adults=1&childs=0&infants=0&class=Economy&depart_date=27%2F11%2F2026&from=DEL&to=BOM&intl=n');
  assert.equal(by(s.links, 'skyscanner').url, 'https://www.skyscanner.net/g/referrals/v1/flights/day-view?origin=DEL&destination=BOM&outboundDate=2026-11-27&adultsv2=1&cabinclass=economy&market=IN&locale=en-GB&currency=INR');
  assert.equal(by(s.links, 'makemytrip').url, 'https://www.makemytrip.com/flight/search?itinerary=DEL-BOM-27%2F11%2F2026&tripType=O&paxType=A-1_C-0_I-0&intl=false&cabinClass=E&lang=eng');
  assert.equal(by(s.links, 'ixigo').url, 'https://www.ixigo.com/search/result/flight?from=DEL&to=BOM&date=27112026&adults=1&children=0&infants=0&class=e');
  assert.equal(by(s.links, 'indigo').url, 'https://www.goindigo.in/', 'no link format: the front page, said so');
});

test('flights: round trip, cabin and international; unchecked formats are never guessed further', () => {
  const s = flightSearch({ from: 'DEL', to: 'DXB', depart: '2026-11-27', ret: '2026-11-30', adults: 2, cabin: 'business' }, airports, NOW);
  assert.ok(s.ok && s.q.intl);
  const ct = new URL(by(s.links, 'cleartrip').url).searchParams;
  assert.deepEqual([ct.get('class'), ct.get('depart_date'), ct.get('return_date'), ct.get('adults'), ct.get('intl')], ['Business', '27/11/2026', '30/11/2026', '2', 'y']);
  const sky = new URL(by(s.links, 'skyscanner').url).searchParams;
  assert.deepEqual([sky.get('inboundDate'), sky.get('adultsv2'), sky.get('cabinclass')], ['2026-11-30', '2', 'business']);
  assert.equal(by(s.links, 'makemytrip').prefilled, false, 'MakeMyTrip: only the one-way economy form, until checked');
  assert.equal(by(s.links, 'ixigo').prefilled, false);
  const premium = flightSearch({ from: 'DEL', to: 'BOM', depart: '2026-11-27', cabin: 'premium' }, airports, NOW);
  assert.ok(premium.ok && new URL(by(premium.links, 'skyscanner').url).searchParams.get('cabinclass') === 'premiumeconomy');
});

test('flights: what is refused', () => {
  const ok = { from: 'DEL', to: 'BOM', depart: '2026-11-27', adults: 1, cabin: 'economy' };
  for (const [bad, want] of [
    [{ from: 'XXX' }, /From: pick an airport/], [{ to: '' }, /To: pick an airport/], [{ to: 'DEL' }, /same airport/],
    [{ depart: '2026-10-26' }, /has passed/], [{ depart: '2027-10-28' }, /a year ahead/], [{ depart: '2026-02-30' }, /pick a date/],
    [{ ret: '2026-11-26' }, /Return: must be after/], [{ adults: 0 }, /1 to 9/], [{ adults: 10 }, /1 to 9/], [{ cabin: 'jumbo' }, /cabin/],
  ] as const) {
    const r = flightSearch({ ...ok, ...bad }, airports, NOW);
    assert.ok(!r.ok && want.test(r.reason), `${JSON.stringify(bad)} -> ${JSON.stringify(r)}`);
  }
});

test('"today" is India\'s date, not the server\'s', () => {
  const lateNightUTC = Date.parse('2026-10-26T20:00:00Z'); // 01:30 on the 27th in India
  assert.equal(todayIST(lateNightUTC), '2026-10-27');
  const r = flightSearch({ from: 'DEL', to: 'BOM', depart: '2026-10-26' }, airports, lateNightUTC);
  assert.ok(!r.ok && /has passed/.test(r.reason));
  assert.ok(flightSearch({ from: 'DEL', to: 'BOM', depart: '2026-10-27' }, airports, lateNightUTC).ok);
});

test('hotels: one city and dates; check-out after check-in; a city is a name', () => {
  const s = hotelSearch({ city: '  Goa ', checkIn: '2026-11-27', checkOut: '2026-11-29', adults: 2 }, NOW);
  assert.ok(s.ok);
  assert.equal(by(s.links, 'cleartrip').url, 'https://www.cleartrip.com/hotels/results?city=Goa&chk_in=27%2F11%2F2026&chk_out=29%2F11%2F2026&adults1=2&children1=0&num_rooms=1');
  assert.deepEqual([by(s.links, 'cleartrip').checked, by(s.links, 'booking').checked, by(s.links, 'makemytrip').prefilled], ['opened', null, false]);
  for (const [bad, want] of [
    [{ checkOut: '2026-11-27' }, /Check-out: must be after/], [{ checkOut: '2027-01-10' }, /30 nights/], [{ city: '<script>' }, /City/],
    [{ city: 'G' }, /City/], [{ adults: 9 }, /1 to 8/],
  ] as const) {
    const base = { city: 'Goa', checkIn: '2026-11-27', checkOut: '2026-11-29', adults: 2 };
    const r = hotelSearch({ ...base, ...bad }, NOW);
    assert.ok(!r.ok && want.test(r.reason), JSON.stringify(bad));
  }
});

test('rides: from the shopper\'s point to an airport Uber recognises, by Uber\'s documented link', () => {
  assert.ok(!rideSearch({ to: 'DEL' }, airports).ok, 'no location, no link');
  assert.ok(!rideSearch({ to: 'DEL', pickup: { lat: 128, lng: 77 } }, airports).ok);
  const notSeen = rideSearch({ to: 'del', pickup: { lat: 28.6315, lng: 77.2167 } }, airports, {});
  assert.ok(notSeen.ok && !by(notSeen.links, 'uber').prefilled && by(notSeen.links, 'uber').url === 'https://m.uber.com/', 'an airport Uber was not seen to recognise: its front page');
  const s = rideSearch({ to: 'del', pickup: { lat: 28.631512345, lng: 77.216712345 } }, airports, { DEL: { lat: 28.5574, lng: 77.0833, name: 'Gate 7, Terminal 3', from: 'wikidata' } });
  assert.ok(s.ok);
  const u = new URL(by(s.links, 'uber').url);
  assert.equal(u.origin + u.pathname, 'https://m.uber.com/looking');
  assert.deepEqual(JSON.parse(u.searchParams.get('pickup')!), { latitude: 28.63151, longitude: 77.21671, addressLine1: 'My location' }, 'rounded to ~1 m');
  assert.deepEqual(JSON.parse(u.searchParams.get('drop[0]')!), { latitude: 28.5574, longitude: 77.0833, addressLine1: 'Gate 7, Terminal 3' }, 'the point Uber was seen to read as the airport');
  assert.deepEqual(s.links.filter((l) => !l.prefilled).map((l) => l.id), ['ola', 'rapido', 'nammayatri']);
});

test('airport CSV parser: quoted commas, doubled quotes, CRLF', () => {
  assert.deepEqual(parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\n2,,\n'), [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', '', '']]);
});

test('Uber airport check: the place must BE the airport, not something near it', () => {
  // Names Uber gave on 2026-10-27 (scripts/uber-airports.mjs).
  for (const n of ['Agra Airport', 'Kempegowda International Airport Bengaluru', 'Indira Gandhi International Airport', 'Lengpui Airport', 'Gate 7, Terminal 3']) assert.ok(isAirportPlace(n), n);
  for (const n of ['Unnamed Road', 'Raja Bhoj Airport Area', 'Bhavnagar Airport Fire Station', '50 Feet Rd Nihal Vihar', 'Airport Road', 'Airport Cargo Gate', 'old airport khajuraho', '1316, Airport']) assert.ok(!isAirportPlace(n), n);
});
