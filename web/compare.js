// Fare compare, the view's arithmetic (BuyHatke's "Flight compare" with "more booking options"):
// the fares each site showed on the shopper's phone (core/fares.ts readings), put side by side.
// Pure: the page (web/app.js) draws it, core/fares.test.ts checks it on pages saved in the app.

/** "IndiGo • 6E 5175", "IndiGo | 6E - 5175", "Air-India Express" -> { airline, number } */
export function flightName(label) {
  const [airline, ...rest] = String(label).split(/\s*[•|]\s*/);
  const m = /\b([A-Z0-9]{2})\s*-?\s*(\d{2,5})\b/.exec(rest.join(' '));
  return { airline: airline.trim(), number: m ? `${m[1]} ${m[2]}` : null };
}

/** "06:05", "6:05" -> "06:05"; anything else -> null. */
export function clock(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? '').trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

const airlineKey = (a) => a.toLowerCase().replace(/[^a-z]/g, '');

/**
 * sites: [{ id, name, url, rows }] (rows: core/fares.ts FareRow) -> flights, cheapest first.
 * One flight is the same airline leaving and landing at the same minutes; its offers are each
 * site's lowest fare for it. Airports are kept as the sites printed them ("HDO", "Ghaziabad"):
 * sites mix nearby airports into a city's results (Hindon for Delhi, Navi Mumbai for Mumbai).
 */
export function groupFlights(sites) {
  const flights = new Map();
  for (const s of sites) {
    for (const r of s.rows ?? []) {
      const depart = clock(r.depart);
      const arrive = clock(r.arrive);
      if (!depart || !arrive || !Number.isInteger(r.price) || r.price <= 0) continue;
      const n = flightName(r.label);
      const key = `${airlineKey(n.airline)}|${depart}|${arrive}`;
      let f = flights.get(key);
      if (!f) {
        f = { key, airline: n.airline, number: n.number, depart, arrive, from: new Set(), to: new Set(), duration: r.duration ?? null, stops: r.stops ?? null, offers: [] };
        flights.set(key, f);
      }
      f.number ??= n.number;
      f.duration ??= r.duration ?? null;
      f.stops ??= r.stops ?? null;
      if (r.origin) f.from.add(r.origin);
      if (r.destination) f.to.add(r.destination);
      const have = f.offers.find((o) => o.site === s.id);
      if (!have) f.offers.push({ site: s.id, name: s.name, url: s.url, price: r.price });
      else if (r.price < have.price) have.price = r.price;
    }
  }
  const out = [...flights.values()].map((f) => {
    f.offers.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    return { ...f, from: [...f.from], to: [...f.to], best: f.offers[0].price };
  });
  out.sort((a, b) => a.best - b.best || a.depart.localeCompare(b.depart) || a.airline.localeCompare(b.airline));
  return out;
}

/**
 * True when a flight may not use the airport that was searched: a site printed another airport
 * code for it (HDO for a DEL search), or a city name that is not the airport's city.
 */
export function otherAirport(printed, code, city) {
  return printed.some((p) => (/^[A-Z]{3}$/.test(p) ? p !== code : city != null && p.toLowerCase() !== city.toLowerCase()));
}

/** Each site's own summary, cheapest first; sites without fares after, in the order asked. */
export function siteSummary(sites) {
  const priced = sites.filter((s) => s.status === 'fares' && s.rows?.length).map((s) => ({ ...s, cheapest: Math.min(...s.rows.map((r) => r.price)) }));
  priced.sort((a, b) => a.cheapest - b.cheapest);
  return [...priced, ...sites.filter((s) => !priced.some((p) => p.id === s.id)).map((s) => ({ ...s, cheapest: null }))];
}

/**
 * The rides of ride compare, cheapest first: each row with its site. Uber lists parcel delivery
 * ("Parcel Bike", "Parcel Scooter", measured 2026-11-04) beside its rides; those are not rides
 * for a person, so they are left out.
 */
export function rideRows(sites) {
  return sites.flatMap((s) => (s.status === 'fares' ? (s.rows ?? []).filter((r) => !/^parcel\b/i.test(r.label)).map((r) => ({ ...r, site: s })) : []))
    .sort((a, b) => a.price - b.price || a.label.localeCompare(b.label));
}

/**
 * The sites' date strips, merged: for each day, the lowest fare any site's strip printed for it
 * and which site, days in date order. A strip is the site's own figure for that day (measured
 * 2026-11-04: MakeMyTrip's strip said ₹7,116 for the day its list started at ₹7,016), not a fare
 * read from its list, so the page shows it apart from the fares and says so.
 */
export function fareStrip(sites) {
  const days = new Map();
  for (const s of sites) {
    if (s.status !== 'fares') continue;
    for (const d of s.strip ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.date) || !Number.isInteger(d.price) || d.price <= 0) continue;
      const have = days.get(d.date);
      if (!have) days.set(d.date, { date: d.date, price: d.price, site: s.id, name: s.name, sites: 1 });
      else {
        have.sites++;
        if (d.price < have.price) Object.assign(have, { price: d.price, site: s.id, name: s.name });
      }
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A round trip as two one-way tickets: the cheapest flight found each way (groupFlights output,
 * cheapest first) and their sum, or null until both ways have a fare. The sites' own round-trip
 * fares are not read (their round-trip pages were not measured), so the page links to them.
 */
export function tripTotal(onward, back) {
  const a = onward?.[0];
  const b = back?.[0];
  return a && b ? { onward: a, back: b, total: a.best + b.best } : null;
}

const HOTEL_WORDS = new Set(['the', 'hotel', 'hotels', 'resort', 'resorts', 'and', 'spa', 'by', 'a', 'an', 'of', 'at', 'in']);
/** A hotel's name for matching across sites: its words, lower-case, order-free, filler dropped; null when too little is left. */
export function hotelKey(name) {
  const words = String(name ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !HOTEL_WORDS.has(w));
  const key = [...new Set(words)].sort().join(' ');
  return key.replace(/ /g, '').length >= 6 ? key : null;
}

/**
 * Hotels from every site, cheapest per night first. A site's recipe says whether it prints a
 * price for one night or for the whole stay (measured: Booking.com "Price for 2 nights",
 * Cleartrip "taxes & fees / night"), so each offer is put per night; prices are before taxes on
 * both. The same hotel on two sites (hotelKey) gets both offers; otherwise each stays its own row.
 * sites: [{ id, name, url, status, rows, recipe: { per } }]
 */
export function groupHotels(sites, nights) {
  if (!Number.isInteger(nights) || nights < 1) return [];
  const hotels = new Map();
  for (const s of sites) {
    const per = s.recipe?.per;
    if (s.status !== 'fares' || (per !== 'night' && per !== 'stay')) continue;
    for (const r of s.rows ?? []) {
      if (!Number.isInteger(r.price) || r.price <= 0) continue;
      const night = per === 'stay' ? Math.round(r.price / nights) : r.price;
      const key = hotelKey(r.label) ?? `${s.id}|${r.label}`;
      let h = hotels.get(key);
      if (!h) {
        h = { key, name: r.label, area: r.area ?? null, offers: [] };
        hotels.set(key, h);
      }
      h.area ??= r.area ?? null;
      const have = h.offers.find((o) => o.site === s.id);
      if (!have) h.offers.push({ site: s.id, name: s.name, url: s.url, night, printed: r.price, per });
      else if (night < have.night) Object.assign(have, { night, printed: r.price });
    }
  }
  const out = [...hotels.values()].map((h) => {
    h.offers.sort((a, b) => a.night - b.night || a.name.localeCompare(b.name));
    return { ...h, best: h.offers[0].night };
  });
  out.sort((a, b) => a.best - b.best || a.name.localeCompare(b.name));
  return out;
}
