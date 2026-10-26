import type { Millis } from './types.ts';

const HOUR = 3_600_000;

export const REFRESH = {
  watched: 3 * HOUR,     // a product someone has an alert on
  unwatched: 12 * HOUR,
  maxBackoff: 7 * 24 * HOUR,
} as const;

export interface Refreshable {
  key: string;
  lastAttemptAt: Millis | null;
  failCount: number;
  watchers: number;
}

/** How long to wait between checks. Failures back off exponentially (a store that is
 * refusing us is not hammered), capped at a week. */
export function refreshInterval(p: Pick<Refreshable, 'failCount' | 'watchers'>): Millis {
  const base = p.watchers > 0 ? REFRESH.watched : REFRESH.unwatched;
  return Math.min(base * 2 ** Math.min(p.failCount, 10), REFRESH.maxBackoff);
}

/** The products most overdue for a check, at most `limit`. Never-checked products first. */
export function pickDue<T extends Refreshable>(products: readonly T[], now: Millis, limit: number): T[] {
  return products
    .map((p) => ({ p, overdue: p.lastAttemptAt == null ? Infinity : (now - p.lastAttemptAt) / refreshInterval(p) }))
    .filter((x) => x.overdue >= 1)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, limit)
    .map((x) => x.p);
}
