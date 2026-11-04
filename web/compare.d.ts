// Types for web/compare.js (plain JS, run by the site in the browser), for TypeScript callers.
import type { FareRow } from '../core/fares.ts';

export interface SiteFares { id: string; name: string; url: string; status?: string; rows?: FareRow[] }
export interface Offer { site: string; name: string; url: string; price: number }
export interface Flight {
  key: string; airline: string; number: string | null; depart: string; arrive: string;
  from: string[]; to: string[]; duration: string | null; stops: string | null; offers: Offer[]; best: number;
}
export function flightName(label: string): { airline: string; number: string | null };
export function clock(t: string | null | undefined): string | null;
export function groupFlights(sites: SiteFares[]): Flight[];
export function otherAirport(printed: string[], code: string, city: string | null): boolean;
export function siteSummary<S extends SiteFares>(sites: S[]): (S & { cheapest: number | null })[];
export function rideRows<S extends SiteFares>(sites: S[]): (FareRow & { site: S })[];
