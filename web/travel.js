// Travel and ride links (BLUEPRINT §14): one search, and each site opened with it filled in.
// Britto fetches nothing from these sites and shows no fare: there is no free, permitted fare
// source. Links are built on the shopper's device (a ride link carries their location, which
// never goes to Britto). How each site's link format was checked:
//   'opened'      opened in a real browser from Britto's test network; the site showed the search
//   'app'         opened inside the Britto Android app on a home network in India (2026-11-04):
//                 the results page showed the search and its fares (web/fares.json reads them)
//   'documented'  from the site's own developer documentation; not opened (it refused our network)
//   null          not checked yet: the link may open the site without the search filled in
// A site with no link format for a search opens its front page (prefilled: false).

export const CABINS = ['economy', 'premium', 'business', 'first'];

/** Every site, with what was measured (HISTORY "P9"). */
export const TRAVEL_SITES = {
  cleartrip: { name: 'Cleartrip', home: 'https://www.cleartrip.com/' },
  skyscanner: { name: 'Skyscanner', home: 'https://www.skyscanner.co.in/' },
  makemytrip: { name: 'MakeMyTrip', home: 'https://www.makemytrip.com/' },
  ixigo: { name: 'ixigo', home: 'https://www.ixigo.com/' },
  goibibo: { name: 'Goibibo', home: 'https://www.goibibo.com/' },
  easemytrip: { name: 'EaseMyTrip', home: 'https://www.easemytrip.com/' },
  yatra: { name: 'Yatra', home: 'https://www.yatra.com/' },
  indigo: { name: 'IndiGo', home: 'https://www.goindigo.in/' },
  airindia: { name: 'Air India', home: 'https://www.airindia.com/' },
  booking: { name: 'Booking.com', home: 'https://www.booking.com/' },
  uber: { name: 'Uber', home: 'https://m.uber.com/' },
  ola: { name: 'Ola', home: 'https://www.olacabs.com/' },
  rapido: { name: 'Rapido', home: 'https://www.rapido.bike/' },
  nammayatri: { name: 'Namma Yatri', home: 'https://nammayatri.in/' },
};

const qs = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' (sep '/') or 'DDMMYYYY' (sep ''). */
const dmy = (iso, sep = '/') => iso.split('-').reverse().join(sep);

/** Per kind, in the order shown: checked formats first, then unchecked, then front pages. */
const FLIGHTS = [
  ['cleartrip', 'opened', (q) => `https://www.cleartrip.com/flights/results?${qs({
    adults: q.adults, childs: 0, infants: 0, class: { economy: 'Economy', premium: 'Premium Economy', business: 'Business', first: 'First' }[q.cabin],
    depart_date: dmy(q.depart), ...(q.ret ? { return_date: dmy(q.ret) } : {}), from: q.from, to: q.to, intl: q.intl ? 'y' : 'n',
  })}`],
  ['skyscanner', 'documented', (q) => `https://www.skyscanner.net/g/referrals/v1/flights/day-view?${qs({
    origin: q.from, destination: q.to, outboundDate: q.depart, ...(q.ret ? { inboundDate: q.ret } : {}), adultsv2: q.adults,
    cabinclass: { economy: 'economy', premium: 'premiumeconomy', business: 'business', first: 'first' }[q.cabin], market: 'IN', locale: 'en-GB', currency: 'INR',
  })}`],
  // Opened in the Britto app (they refuse our test network): one-way economy only, the form
  // that was seen working; anything else opens the site's front page.
  ['makemytrip', 'app', (q) => (q.ret || q.cabin !== 'economy' ? null : `https://www.makemytrip.com/flight/search?${qs({
    itinerary: `${q.from}-${q.to}-${dmy(q.depart)}`, tripType: 'O', paxType: `A-${q.adults}_C-0_I-0`, intl: String(q.intl), cabinClass: 'E', lang: 'eng',
  })}`)],
  ['ixigo', 'app', (q) => (q.ret || q.cabin !== 'economy' ? null : `https://www.ixigo.com/search/result/flight?${qs({
    from: q.from, to: q.to, date: dmy(q.depart, ''), adults: q.adults, children: 0, infants: 0, class: 'e',
  })}`)],
  ['goibibo', 'app', (q) => (q.ret || q.cabin !== 'economy' ? null : `https://www.goibibo.com/flight/search?${qs({
    itinerary: `${q.from}-${q.to}-${dmy(q.depart)}`, tripType: 'O', paxType: `A-${q.adults}_C-0_I-0`, intl: String(q.intl), cabinClass: 'E', lang: 'eng',
  })}`)],
  // EaseMyTrip: India only (its address names the country); the city words are as it prints them.
  ['easemytrip', 'app', (q) => (q.ret || q.cabin !== 'economy' || q.intl ? null : `https://flight.easemytrip.com/FlightList/Index?srch=${[q.fromPlace, q.toPlace].map((p) => `${p.iata}-${encodeURIComponent(p.city.replace(/[^A-Za-z ]/g, '').trim())}-India`).join('|')}|${dmy(q.depart)}&${qs({
    px: `${q.adults}-0-0`, cbn: 0, ar: 'undefined', isow: 'true', isdm: 'true', lang: 'en-us', IsDoubleSeat: 'false', CCODE: 'IN', curr: 'INR', apptype: 'B2C',
  })}`)],
  ['yatra', null, null], ['indigo', null, null], ['airindia', null, null],
];

const HOTELS = [
  ['cleartrip', 'opened', (q) => `https://www.cleartrip.com/hotels/results?${qs({
    city: q.city, chk_in: dmy(q.checkIn), chk_out: dmy(q.checkOut), adults1: q.adults, children1: 0, num_rooms: 1,
  })}`],
  ['booking', null, (q) => `https://www.booking.com/searchresults.html?${qs({
    ss: q.city, checkin: q.checkIn, checkout: q.checkOut, group_adults: q.adults, no_rooms: 1, group_children: 0,
  })}`],
  ['makemytrip', null, null], ['goibibo', null, null], ['yatra', null, null],
];

/** Uber's documented universal link (m.uber.com/looking): places as JSON with coordinates. */
const place = (p) => JSON.stringify({ latitude: p.lat, longitude: p.lng, addressLine1: p.name });
const RIDES = [
  ['uber', 'opened', (q) => `https://m.uber.com/looking?pickup=${encodeURIComponent(place(q.pickup))}&${encodeURIComponent('drop[0]')}=${encodeURIComponent(place(q.drop))}`],
  ['ola', null, null], ['rapido', null, null], ['nammayatri', null, null],
];

function links(table, q) {
  return table.map(([id, checked, build]) => {
    const url = build ? build(q) : null;
    return url
      ? { id, name: TRAVEL_SITES[id].name, url, prefilled: true, checked }
      : { id, name: TRAVEL_SITES[id].name, url: TRAVEL_SITES[id].home, prefilled: false, checked: null };
  });
}

/** Today in India, 'YYYY-MM-DD'. */
export const todayIST = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** Searches up to a year ahead (Skyscanner's documented limit for flights is 12 months). */
export const MAX_DAYS_AHEAD = 365;

/** airports: the `airports` rows of web/airports.json ([iata, name, city, country, lat, lng]). */
export function airportIndex(rows) {
  return new Map(rows.map(([iata, name, city, country, lat, lng]) => [iata, { iata, name, city, country, lat, lng }]));
}

function dateError(label, iso, today, earliest = today) {
  if (!isDate(iso)) return `${label}: pick a date`;
  if (iso < earliest) return `${label}: ${earliest === today ? 'that date has passed' : 'must be after the first date'}`;
  if (iso > addDays(today, MAX_DAYS_AHEAD)) return `${label}: at most a year ahead`;
  return null;
}

/** -> { ok: true, q, links } or { ok: false, reason } */
export function flightSearch(input, airports, now = Date.now()) {
  const today = todayIST(now);
  const from = airports.get(String(input.from ?? '').toUpperCase());
  const to = airports.get(String(input.to ?? '').toUpperCase());
  if (!from) return { ok: false, reason: 'From: pick an airport from the list' };
  if (!to) return { ok: false, reason: 'To: pick an airport from the list' };
  if (from.iata === to.iata) return { ok: false, reason: 'From and To are the same airport' };
  const bad = dateError('Departure', input.depart, today) ?? (input.ret ? dateError('Return', input.ret, today, input.depart) : null);
  if (bad) return { ok: false, reason: bad };
  const adults = Number(input.adults ?? 1);
  if (!Number.isInteger(adults) || adults < 1 || adults > 9) return { ok: false, reason: 'Travellers: 1 to 9 adults' };
  const cabin = input.cabin ?? 'economy';
  if (!CABINS.includes(cabin)) return { ok: false, reason: 'Unknown cabin class' };
  const q = { from: from.iata, to: to.iata, depart: input.depart, ret: input.ret || null, adults, cabin, intl: from.country !== 'IN' || to.country !== 'IN' };
  return { ok: true, q, links: links(FLIGHTS, { ...q, fromPlace: from, toPlace: to }) };
}

export function hotelSearch(input, now = Date.now()) {
  const today = todayIST(now);
  const city = String(input.city ?? '').replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}][\p{L} .'-]{1,59}$/u.test(city)) return { ok: false, reason: 'City: type a city name' };
  const bad = dateError('Check-in', input.checkIn, today) ?? dateError('Check-out', input.checkOut, today, addDays(input.checkIn, 1));
  if (bad) return { ok: false, reason: bad };
  if (input.checkOut > addDays(input.checkIn, 30)) return { ok: false, reason: 'At most 30 nights' };
  const adults = Number(input.adults ?? 2);
  if (!Number.isInteger(adults) || adults < 1 || adults > 8) return { ok: false, reason: 'Guests: 1 to 8 adults (one room)' };
  const q = { city, checkIn: input.checkIn, checkOut: input.checkOut, adults };
  return { ok: true, q, links: links(HOTELS, q) };
}

const isCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * A ride from a point (the shopper's own location) to an airport. Uber snaps a point to the
 * nearest place on its map and ignores the name, so it gets the trip filled in only for an
 * airport it was seen to read as that airport, at the point it was seen at (`uberAirports`: the
 * `uber` map of web/rides.json, from scripts/uber-airports.mjs); otherwise its front page.
 */
export function rideSearch(input, airports, uberAirports = {}) {
  const airport = airports.get(String(input.to ?? '').toUpperCase());
  if (!airport) return { ok: false, reason: 'Airport: pick one from the list' };
  const p = input.pickup ?? {};
  if (!isCoord(p.lat, p.lng)) return { ok: false, reason: 'Pickup: allow your location first' };
  const round = (x) => Math.round(x * 1e5) / 1e5;
  const seen = Object.hasOwn(uberAirports, airport.iata) ? uberAirports[airport.iata] : null;
  const q = { pickup: { lat: round(p.lat), lng: round(p.lng), name: 'My location' }, drop: seen ? { lat: seen.lat, lng: seen.lng, name: seen.name } : { lat: airport.lat, lng: airport.lng, name: airport.name } };
  const table = seen ? RIDES : RIDES.map(([id, checked, build]) => (id === 'uber' ? [id, null, null] : [id, checked, build]));
  return { ok: true, q, links: links(table, q) };
}

/**
 * Ride compare in the Britto app: pickup and drop found by the phone's own place search. Uber
 * opens with the trip (its documented link) and its ride list is read on the phone (web/fares.json);
 * Rapido opens its own web app, where the shopper logs in and enters the trip (no link format for
 * a trip, and its fare page has not been seen, so nothing of it is read).
 */
export function rideCompare(pickup, drop) {
  if (!isCoord(pickup?.lat, pickup?.lng)) return { ok: false, reason: 'Pickup: pick a place from the list' };
  if (!isCoord(drop?.lat, drop?.lng)) return { ok: false, reason: 'Drop: pick a place from the list' };
  const round = (x) => Math.round(x * 1e5) / 1e5;
  const named = (p) => ({ lat: round(p.lat), lng: round(p.lng), name: String(p.name ?? '').slice(0, 80) || 'Pinned place' });
  const q = { pickup: named(pickup), drop: named(drop) };
  if (q.pickup.lat === q.drop.lat && q.pickup.lng === q.drop.lng) return { ok: false, reason: 'Pickup and drop are the same place' };
  return { ok: true, q, links: [
    { id: 'uber', name: TRAVEL_SITES.uber.name, url: RIDES[0][2](q), prefilled: true, checked: 'app' },
    { id: 'rapido', name: TRAVEL_SITES.rapido.name, url: 'https://m.rapido.bike/', prefilled: false, checked: null },
  ] };
}
