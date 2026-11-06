// Types for web/shop.js (plain JS, run by the site in the browser), for TypeScript callers.
import type { ShopRecipe, ShopRow } from '../core/shop.ts';
import type { Best } from './match.js';

export const SHOP_MAX_STORES: number;
export function kindOf(title: string): 'fashion' | 'beauty' | 'other';
export function storesFor(title: string, recipes: ShopRecipe[], ownStore: string): ShopRecipe[];
export function shopSearchUrl(recipe: Pick<ShopRecipe, 'search'>, words: string): string;
export interface ShopSite { id: string; name: string; url: string; state: string; status: string; rows?: ShopRow[] }
export interface ShopViewRow extends ShopSite { done: boolean; best: Best<ShopRow> | null; diff: number | null }
export function compareView(want: string, sites: ShopSite[], here: number | null): { rows: ShopViewRow[]; cheapest: ShopViewRow | null; done: boolean; checked: number };
