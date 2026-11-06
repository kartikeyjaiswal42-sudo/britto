// Types for web/match.js (plain JS, run by the site in the browser), for TypeScript callers.
export type MatchKind = 'same' | 'close' | 'none';
export interface TitleMatch { kind: MatchKind; score: number; why: string | null }
export interface Candidate { title: string; price: number }
export interface Best<T extends Candidate> { row: T; kind: Exclude<MatchKind, 'none'>; score: number; why: string | null }
export function words(title: string): string[];
export function quantities(title: string): Map<string, Set<number>>;
export function matchTitle(want: string, got: string): TitleMatch;
export function bestMatch<T extends Candidate>(want: string, rows: readonly T[]): Best<T> | null;
export function searchWordsFor(title: string): string | null;
