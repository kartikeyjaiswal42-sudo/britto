import { formatRupees } from './money.ts';
import type { AlertDecision, AlertRule, AlertState, Paise } from './types.ts';

// Alerts are EDGE-triggered: one message when the condition becomes true, then silence
// until it has become false again. A level-triggered alert would message a shopper on
// every check for as long as the price stays low.

export function newAlert(rule: AlertRule, currentPrice: Paise | null, inStock: boolean | null): AlertState {
  switch (rule.kind) {
    case 'below':
      // Already under the target when set: wait for it to go above and come back down.
      return { rule, armed: !(currentPrice != null && inStock !== false && currentPrice <= rule.target), basePrice: null, lastFiredAt: null };
    case 'drop':
      return { rule, armed: true, basePrice: inStock === false ? null : currentPrice, lastFiredAt: null };
    case 'in_stock':
      return { rule, armed: inStock !== true, basePrice: null, lastFiredAt: null };
  }
}

export function decideAlert(
  state: AlertState,
  next: { price: Paise | null; inStock: boolean },
  now: number,
  title = 'Your product',
): AlertDecision {
  const priced = next.inStock && next.price != null ? next.price : null;
  const rule = state.rule;
  const quiet = (s: AlertState): AlertDecision => ({ fire: false, message: null, next: s });

  if (rule.kind === 'below') {
    if (priced != null && priced <= rule.target) {
      if (!state.armed) return quiet(state);
      return {
        fire: true,
        message: `${title} is now ${formatRupees(priced)}, at or below your target of ${formatRupees(rule.target)}.`,
        next: { ...state, armed: false, lastFiredAt: now },
      };
    }
    return quiet(state.armed ? state : { ...state, armed: true });
  }

  if (rule.kind === 'drop') {
    if (priced == null) return quiet(state);
    if (state.basePrice == null) return quiet({ ...state, basePrice: priced });
    if (priced <= state.basePrice * (1 - rule.pct / 100)) {
      return {
        fire: true,
        message: `${title} dropped from ${formatRupees(state.basePrice)} to ${formatRupees(priced)}.`,
        next: { ...state, basePrice: priced, lastFiredAt: now },
      };
    }
    return quiet(state);
  }

  // in_stock
  if (next.inStock) {
    if (!state.armed) return quiet(state);
    return {
      fire: true,
      message: `${title} is back in stock${priced != null ? ` at ${formatRupees(priced)}` : ''}.`,
      next: { ...state, armed: false, lastFiredAt: now },
    };
  }
  return quiet(state.armed ? state : { ...state, armed: true });
}

export const ALERTS = {
  /** Alerts one owner may hold (one per product and kind). */
  maxPerOwner: 50,
  /** 'drop' alerts: smallest and largest percentage accepted. */
  minDropPct: 1,
  maxDropPct: 90,
  /** Targets suggested by the bot and the page: this much under today's price. */
  suggestPcts: [5, 10] as const,
} as const;

/** Shape-check an alert rule sent by a browser or built from a bot button. */
export function parseRule(input: unknown): { ok: true; rule: AlertRule } | { ok: false; reason: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'Send a rule: {"kind": "below" | "drop" | "in_stock", …}.' };
  const r = input as Record<string, unknown>;
  if (r.kind === 'below') {
    if (!Number.isSafeInteger(r.target) || (r.target as number) < 100) return { ok: false, reason: 'A target price is whole paise, at least ₹1.' };
    return { ok: true, rule: { kind: 'below', target: r.target as number } };
  }
  if (r.kind === 'drop') {
    const pct = r.pct;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < ALERTS.minDropPct || pct > ALERTS.maxDropPct) {
      return { ok: false, reason: `A drop is between ${ALERTS.minDropPct}% and ${ALERTS.maxDropPct}%.` };
    }
    return { ok: true, rule: { kind: 'drop', pct } };
  }
  if (r.kind === 'in_stock') return { ok: true, rule: { kind: 'in_stock' } };
  return { ok: false, reason: 'Unknown alert kind.' };
}

/** "below ₹250", "drops 5% or more", "back in stock". */
export function describeRule(rule: AlertRule): string {
  if (rule.kind === 'below') return `at or below ${formatRupees(rule.target)}`;
  if (rule.kind === 'drop') return rule.pct <= ALERTS.minDropPct ? 'any price drop' : `drops ${rule.pct}% or more`;
  return 'back in stock';
}

/**
 * May this reading move alerts? A store our server reads gets the last word: an extension
 * report on it only queues a server re-check (api/app.ts), so a forged report cannot message
 * every watcher. For a store that refuses our server, accepted extension reports are all
 * there is, so they count (core/trust.ts has already held any 40%+ move).
 */
export function readingMovesAlerts(serverReadable: boolean, source: 'server' | 'extension'): boolean {
  return source === 'server' || !serverReadable;
}

/** Whole-rupee targets 5% and 10% under the price, highest first; none for tiny prices. */
export function suggestTargets(price: Paise | null): Paise[] {
  if (price == null || price < 2_000) return [];
  const out: Paise[] = [];
  for (const p of ALERTS.suggestPcts) {
    const t = Math.floor((price * (100 - p)) / 100 / 100) * 100;
    if (t >= 100 && t < price && !out.includes(t)) out.push(t);
  }
  return out;
}
