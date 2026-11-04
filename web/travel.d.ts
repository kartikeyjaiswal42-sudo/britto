// Types for web/travel.js (plain JS, run by the site in the browser), for TypeScript callers.
export type Cabin = 'economy' | 'premium' | 'business' | 'first';
export type Checked = 'opened' | 'app' | 'documented' | null;
export interface Airport { iata: string; name: string; city: string; country: string; lat: number; lng: number }
export interface TravelLink { id: string; name: string; url: string; prefilled: boolean; checked: Checked }
export type Search<Q> = { ok: true; q: Q; links: TravelLink[] } | { ok: false; reason: string };
export interface FlightQuery { from: string; to: string; depart: string; ret: string | null; adults: number; cabin: Cabin; intl: boolean }
export interface HotelQuery { city: string; checkIn: string; checkOut: string; adults: number }
export interface Place { lat: number; lng: number; name: string }
export interface RideQuery { pickup: Place; drop: Place }

export const CABINS: Cabin[];
export const TRAVEL_SITES: Record<string, { name: string; home: string }>;
export const MAX_DAYS_AHEAD: number;
export function todayIST(now?: number): string;
export function airportIndex(rows: [string, string, string, string, number, number][]): Map<string, Airport>;
export function flightSearch(
  input: { from?: string; to?: string; depart?: string; ret?: string | null; adults?: number; cabin?: string },
  airports: Map<string, Airport>, now?: number,
): Search<FlightQuery>;
export function hotelSearch(input: { city?: string; checkIn?: string; checkOut?: string; adults?: number }, now?: number): Search<HotelQuery>;
export function rideSearch(input: { to?: string; pickup?: { lat?: number; lng?: number } }, airports: Map<string, Airport>, uberAirports?: Record<string, { lat: number; lng: number; name: string; from: string }>): Search<RideQuery>;
export function rideCompare(pickup: Partial<Place> | null | undefined, drop: Partial<Place> | null | undefined): Search<RideQuery>;
