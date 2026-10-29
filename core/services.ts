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
    measured: '2026-10-29: Uber\'s web app opens in the Britto app (Android 14) with Login, pickup and drop-off. Fares show only after you log in, so Britto does not read them yet.',
  },
  {
    id: 'cleartrip',
    sector: 'flight',
    name: 'Cleartrip',
    home: 'https://www.cleartrip.com/flights',
    hosts: ['www.cleartrip.com', 'cleartrip.com'],
    measured: '2026-10-29: flight results open in the Britto app with fares (Delhi to Mumbai, 27 Nov: from ₹6,945).',
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
