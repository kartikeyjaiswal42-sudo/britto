// The services Britto opens inside its Android app (more shopping stores, rides, flights,
// hotels), next to the shopping stores it keeps price history for (core/stores.ts). The shopper logs in on the service's OWN page
// in the app's in-app browser, with their own number and OTP; the login stays in that browser
// on their phone. Britto never sees the number, the code or the cookies.
//
// Each `measured` line is what was observed in the app, not what was hoped; the Super Browse
// page shows it. Services are not stores: no product keys, no server reads, no price history.
// A 'shop' service is a store whose own search page shop compare reads on the phone
// (core/shop.ts, web/shops.json); its products are not tracked.

export type Sector = 'shop' | 'ride' | 'flight' | 'hotel';

export interface Service {
  id: string;
  sector: Sector;
  name: string;
  /** Where the tile opens. */
  home: string;
  /** Hostnames that open inside the app (exact, lower-case). Login pages on other hosts stay in
   * the same in-app browser anyway once the shopper is there. */
  hosts: readonly string[];
  measured: string;
}

export const SECTOR_NAMES: Record<Sector, string> = { shop: 'More stores', ride: 'Rides', flight: 'Flights', hotel: 'Hotels' };

const SHOP_MEASURED = '2026-11-06: its own search page, opened once in a phone-size Chrome, listed products with prices (no robot check); Britto reads that page on your phone to compare prices (web/shops.json).';

export const SERVICES: readonly Service[] = [
  { id: 'croma', sector: 'shop', name: 'Croma', home: 'https://www.croma.com/', hosts: ['www.croma.com', 'croma.com'], measured: SHOP_MEASURED },
  { id: 'ajio', sector: 'shop', name: 'AJIO', home: 'https://www.ajio.com/', hosts: ['www.ajio.com', 'ajio.com'], measured: SHOP_MEASURED },
  { id: 'meesho', sector: 'shop', name: 'Meesho', home: 'https://www.meesho.com/', hosts: ['www.meesho.com', 'meesho.com'], measured: SHOP_MEASURED },
  { id: 'tatacliq', sector: 'shop', name: 'Tata CLiQ', home: 'https://www.tatacliq.com/', hosts: ['www.tatacliq.com', 'tatacliq.com'], measured: SHOP_MEASURED },
  { id: 'snapdeal', sector: 'shop', name: 'Snapdeal', home: 'https://www.snapdeal.com/', hosts: ['www.snapdeal.com', 'snapdeal.com', 'm.snapdeal.com'], measured: SHOP_MEASURED },
  {
    id: 'uber',
    sector: 'ride',
    name: 'Uber',
    home: 'https://m.uber.com/go/home',
    hosts: ['m.uber.com'],
    measured: '2026-11-04: Uber\'s web app opens in the Britto app (Android 14) with your trip filled in; after you log in it lists every ride with its fare, and Britto reads them (web/fares.json).',
  },
  {
    id: 'rapido',
    sector: 'ride',
    name: 'Rapido',
    home: 'https://m.rapido.bike/',
    hosts: ['m.rapido.bike'],
    measured: '2026-11-04: Rapido\'s own web app opens in the Britto app and asks for your mobile number and an SMS code once. Its trip is typed on its own page (its address holds none), so the app types the trip into Rapido\'s own two boxes, picks Rapido\'s matching place (never a button) and reads its ride list beside Uber\'s.',
  },
  {
    id: 'cleartrip',
    sector: 'flight',
    name: 'Cleartrip',
    home: 'https://www.cleartrip.com/flights',
    hosts: ['www.cleartrip.com', 'cleartrip.com'],
    measured: '2026-11-04: flight results open in the Britto app; its fare service refused this phone (HTTP 403) after a few test searches in a row, so Britto does not read Cleartrip\'s fares yet.',
  },
  {
    id: 'makemytrip',
    sector: 'flight',
    name: 'MakeMyTrip',
    home: 'https://www.makemytrip.com/flights/',
    hosts: ['www.makemytrip.com', 'makemytrip.com'],
    measured: '2026-11-04: one-way search opens in the Britto app with fares (Delhi to Mumbai, 20 Nov: 16 flights from ₹7,016); Britto reads them.',
  },
  {
    id: 'ixigo',
    sector: 'flight',
    name: 'ixigo',
    home: 'https://www.ixigo.com/flights',
    hosts: ['www.ixigo.com', 'ixigo.com'],
    measured: '2026-11-04: one-way search opens in the Britto app with fares (Delhi to Mumbai, 20 Nov: from ₹7,279); Britto reads them.',
  },
  {
    id: 'goibibo',
    sector: 'flight',
    name: 'Goibibo',
    home: 'https://www.goibibo.com/flights/',
    hosts: ['www.goibibo.com', 'goibibo.com'],
    measured: '2026-11-04: one-way search opens in the Britto app with fares (Delhi to Mumbai, 20 Nov: 16 flights from ₹7,116); Britto reads them.',
  },
  {
    id: 'easemytrip',
    sector: 'flight',
    name: 'EaseMyTrip',
    home: 'https://www.easemytrip.com/flights.html',
    hosts: ['flight.easemytrip.com', 'www.easemytrip.com'],
    measured: '2026-11-04: one-way search opens in the Britto app with fares (Delhi to Mumbai, 20 Nov: from ₹7,116); Britto reads them.',
  },
  {
    id: 'skyscanner',
    sector: 'flight',
    name: 'Skyscanner',
    home: 'https://www.skyscanner.co.in/',
    hosts: ['www.skyscanner.co.in', 'www.skyscanner.net'],
    measured: '2026-11-04: in the Britto app Skyscanner first asks "Are you a person or a robot?" (press and hold). You answer it yourself; Britto does not read its fares.',
  },
  {
    id: 'booking',
    sector: 'hotel',
    name: 'Booking.com',
    home: 'https://www.booking.com/',
    hosts: ['www.booking.com', 'booking.com'],
    measured: '2026-10-29: hotel results open in the Britto app with prices (Goa, 27 to 29 Nov: from ₹2,800).',
  },
];
