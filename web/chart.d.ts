// Types for web/chart.js (plain JS, shared by the site and the extension), for TypeScript callers.
import type { Millis, Paise, PricePoint, ProductView } from '../core/types.ts';

export function toSpans(points: readonly PricePoint[], lastCheckedAt: Millis | null): { from: Millis; to: Millis; price: Paise | null }[];
export function saleMarks(
  events: readonly { title: string; from: Millis; to: Millis | null }[] | undefined,
  t0: Millis,
  t1: Millis,
): { title: string; from: Millis; to: Millis | null; ongoing: boolean }[];
export function drawChart(host: HTMLElement, view: ProductView, rangeDays: number): void;
