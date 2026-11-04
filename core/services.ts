// One service per sector that Britto opens inside its Android app (rides, flights, hotels),
// next to the shopping stores (core/stores.ts). The shopper logs in on the service's OWN page
// in the app's in-app browser, with their own number and OTP; the login stays in that browser
// on their phone. Britto never sees the number, the code or the cookies.
//
// Each `measured` line is what was observed in the app, not what was hoped; the Super Browse
// page shows it. Services are not stores: no product keys, no server reads, no price history.

export type Sector = 'ride' | 'flight' | 'hotel';

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

export const SECTOR_NAMES: Record<Sector, string> = { ride: 'Rides', flight: 'Flights', hotel: 'Hotels' };

export const SERVICES: readonly Service[] = [
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
    measured: '2026-11-04: Rapido\'s own web app opens in the Britto app and asks for your mobile number and an SMS code. Its fares were not seen yet (they need your login), so Britto does not read them.',
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
