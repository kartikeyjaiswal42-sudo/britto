// Store sale events for price charts (BLUEPRINT §9: "the band shows the price during the last
// real sale"). Data, not code: readers/sales.json, checked here when it loads. An event without
// a published end date is a start marker only; nothing here guesses an end.
import sales from '../readers/sales.json' with { type: 'json' };
import { STORE_IDS } from './stores.ts';
import type { Millis, StoreId } from './types.ts';

export interface SaleEvent {
  store: StoreId;
  title: string;
  /** India's calendar day the sale started, as midnight IST in ms. */
  from: Millis;
  /** The day it ended (end of that day, IST), or null while no end date is published. */
  to: Millis | null;
  /** Where the dates were read. */
  source: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const IST = 5.5 * 3_600_000;
const startOfDayIst = (d: string) => Date.parse(`${d}T00:00:00Z`) - IST;

/** Every event, or the reasons the file is wrong. */
export function validateSales(input: unknown): { ok: true; events: SaleEvent[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const doc = input as { schema?: unknown; events?: unknown };
  if (!doc || doc.schema !== 1 || !Array.isArray(doc.events)) return { ok: false, errors: ['need {schema: 1, events: [...]}'] };
  const events: SaleEvent[] = [];
  doc.events.forEach((e: Record<string, unknown>, i: number) => {
    const where = `events[${i}]`;
    if (!(STORE_IDS as readonly string[]).includes(String(e['store']))) errors.push(`${where}.store: unknown "${String(e['store'])}"`);
    if (typeof e['title'] !== 'string' || !e['title'] || e['title'].length > 60) errors.push(`${where}.title: 1-60 characters`);
    if (typeof e['from'] !== 'string' || !DAY.test(e['from'])) errors.push(`${where}.from: YYYY-MM-DD`);
    if (e['to'] !== null && !(typeof e['to'] === 'string' && DAY.test(e['to']) && e['to'] >= String(e['from']))) errors.push(`${where}.to: null or YYYY-MM-DD on/after from`);
    if (typeof e['source'] !== 'string' || !/^https:\/\/[^\s]+$/.test(e['source'])) errors.push(`${where}.source: an https link to where the dates were read`);
    if (typeof e['checked'] !== 'string' || !DAY.test(e['checked'])) errors.push(`${where}.checked: YYYY-MM-DD`);
    if (errors.length) return;
    events.push({
      store: e['store'] as StoreId,
      title: e['title'] as string,
      from: startOfDayIst(e['from'] as string),
      to: e['to'] == null ? null : startOfDayIst(e['to'] as string) + 86_400_000 - 1,
      source: e['source'] as string,
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, events };
}

const loaded = validateSales(sales);
if (!loaded.ok) throw new Error(`readers/sales.json: ${loaded.errors.join('; ')}`);
const SALES = loaded.events;

/** A store's sale events, oldest first. */
export function saleEventsFor(store: StoreId): SaleEvent[] {
  return SALES.filter((e) => e.store === store).sort((a, b) => a.from - b.from);
}
