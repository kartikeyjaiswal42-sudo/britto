import { DAY, pricedTime, spans, weightedQuantile } from './history.ts';
import { formatPct, formatRupees } from './money.ts';
import type { HistoryStats, Millis, PricePoint, SaleCheck, Verdict } from './types.ts';

// Thresholds are product judgement, not measured accuracy. They live here, named, so a
// change is one line and every test that depends on them says which one it pins.
export const VERDICT = {
  minDays: 7,            // fewer days of history -> 'too_early', never a confident call
  nearLowest: 0.03,      // within 3% of the lowest seen counts as "at the low"
  lowPercentile: 0.15,   // cheaper than this only 15% of the watched time -> 'buy'
  aboveUsual: 0.10,      // 10%+ above the usual price ...
  highPercentile: 0.6,   // ... and dearer than 60% of the watched time -> 'wait'
} as const;

export const SALE = {
  window: 30 * DAY,      // "usual price" = time-weighted median over the last 30 days ...
  exclude: 2 * DAY,      // ... leaving out the last 48 h, so a fresh sale is not its own baseline
  minPriced: 7 * DAY,    // fewer priced days in that window -> 'too_early', not 'clean'
  realDrop: 0.05,        // 5%+ under the usual price is a real drop
  hikeLookback: 14 * DAY,
  hikeBaseline: 60 * DAY,
  hikeRise: 0.10,        // a rise of 10%+ in the 14 days before the "sale" ...
  landsNear: 0.03,       // ... with the sale price no more than 3% under the pre-hike price
  inflatedRatio: 3,      // M.R.P. discount 3x the real one ...
  inflatedMin: 0.30,     // ... and at least 30% -> the M.R.P. is decoration
} as const;

/** "26 Oct 2026" in India time. */
export function formatDate(ms: Millis): string {
  const d = new Date(ms + 5.5 * 3_600_000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function days(n: number): string {
  const r = Math.floor(n);
  return r === 1 ? '1 day' : `${r} days`;
}

export function verdict(s: HistoryStats): Verdict {
  if (s.current == null || s.inStock === false) {
    return {
      kind: 'unavailable',
      headline: 'Not available to buy right now',
      reasons: s.lowest ? [`The lowest price we have seen is ${formatRupees(s.lowest.price)} (${formatDate(s.lowest.at)}).`] : [],
    };
  }
  const reasons: string[] = [];
  if (s.lowest) reasons.push(`Lowest seen: ${formatRupees(s.lowest.price)} on ${formatDate(s.lowest.at)}.`);

  if (s.daysTracked < VERDICT.minDays) {
    return {
      kind: 'too_early',
      headline: s.daysTracked < 1 ? 'Too early to judge: we started watching it today' : `Too early to judge: we have watched this for ${days(s.daysTracked)}`,
      reasons: [`A fair call needs at least ${VERDICT.minDays} days of prices.`, ...reasons],
    };
  }

  const atLow = s.lowest != null && s.current <= s.lowest.price * (1 + VERDICT.nearLowest);
  const rarelyCheaper = s.percentile != null && s.percentile <= VERDICT.lowPercentile;
  if (atLow || rarelyCheaper) {
    const why = atLow && s.lowest
      ? s.current <= s.lowest.price
        ? `${formatRupees(s.current)} is the lowest price in ${days(s.daysTracked)} of tracking.`
        : `${formatRupees(s.current)} is within ${Math.round(VERDICT.nearLowest * 100)}% of the lowest price seen.`
      : `It has been cheaper only ${formatPct(s.percentile)} of the time we have watched it.`;
    return { kind: 'buy', headline: 'Good time to buy', reasons: [why, ...reasons] };
  }

  if (s.median != null && s.current >= s.median * (1 + VERDICT.aboveUsual) && (s.percentile ?? 0) >= VERDICT.highPercentile) {
    return {
      kind: 'wait',
      headline: 'Wait: it is usually cheaper',
      reasons: [`${formatRupees(s.current)} is ${formatPct((s.current - s.median) / s.median)} above its usual ${formatRupees(s.median)}.`, ...reasons],
    };
  }

  const diff = s.median != null ? (s.current - s.median) / s.median : null;
  return {
    kind: 'fair',
    headline: 'Fair price',
    reasons: [
      diff == null || Math.abs(diff) < 0.005
        ? `${formatRupees(s.current)} is its usual price.`
        : `${formatRupees(s.current)} is ${formatPct(Math.abs(diff))} ${diff < 0 ? 'below' : 'above'} its usual ${formatRupees(s.median)}.`,
      ...reasons,
    ],
  };
}

/**
 * Is the discount real? Judged against the product's own usual price. Missing history
 * is reported as 'too_early' — the absence of evidence is never called a clean sale.
 */
export function saleCheck(points: readonly PricePoint[], lastCheckedAt: Millis | null): SaleCheck {
  const last = points[points.length - 1];
  const none = { claimedPct: null, realPct: null, usualPrice: null, mrpInflated: null, hike: null };
  if (!last || last.price == null || !last.inStock) {
    return { status: 'unavailable', ...none, explanation: 'Not available to buy right now, so there is no sale to check.' };
  }
  const current = last.price;
  const end = Math.max(lastCheckedAt ?? last.at, last.at);
  const claimedPct = last.mrp != null && last.mrp > 0 ? Math.max(0, (last.mrp - current) / last.mrp) : null;

  const window = spans(points, end, end - SALE.window, end - SALE.exclude);
  if (pricedTime(window) < SALE.minPriced) {
    return {
      status: 'too_early', ...none, claimedPct,
      explanation: `We need ${SALE.minPriced / DAY} days of prices to know its usual price${claimedPct ? `, so the ${formatPct(claimedPct)} off M.R.P. cannot be checked yet` : ''}.`,
    };
  }
  const usual = weightedQuantile(window, 0.5)!;
  const realPct = (usual - current) / usual;
  const mrpInflated = claimedPct == null ? null : claimedPct >= SALE.inflatedMin && claimedPct >= SALE.inflatedRatio * Math.max(realPct, 0);

  // Hike then drop: was the price pushed up in the 14 days before the current price
  // began, with the "sale" landing back near where it was before the hike?
  const t0 = last.at;
  const prev = points[points.length - 2];
  let hike: SaleCheck['hike'] = null;
  if (prev?.price != null && prev.price > current) {
    const before = spans(points, end, t0 - SALE.hikeBaseline, t0 - SALE.hikeLookback);
    if (pricedTime(before) >= SALE.minPriced) {
      const baseline = weightedQuantile(before, 0.5)!;
      const recent = spans(points, end, t0 - SALE.hikeLookback, t0).filter((s) => s.price != null && s.inStock);
      let peak: { price: number; at: Millis } | null = null;
      for (const s of recent) if (!peak || s.price! > peak.price) peak = { price: s.price!, at: s.from };
      if (peak && peak.price >= baseline * (1 + SALE.hikeRise) && current >= baseline * (1 - SALE.landsNear)) {
        hike = { from: baseline, to: peak.price, at: peak.at };
      }
    }
  }

  const base = { claimedPct, realPct, usualPrice: usual, mrpInflated, hike };
  const mrpNote = mrpInflated && claimedPct != null ? ` The ${formatPct(claimedPct)} off M.R.P. is not a real measure of this deal.` : '';
  if (hike) {
    return {
      status: 'hike_then_drop', ...base,
      explanation: `The price went up from ${formatRupees(hike.from)} to ${formatRupees(hike.to)} on ${formatDate(hike.at)}, then "dropped" to ${formatRupees(current)}: about where it was before.${mrpNote}`,
    };
  }
  if (realPct >= SALE.realDrop) {
    return {
      status: 'real_drop', ...base,
      explanation: `${formatRupees(current)} is ${formatPct(realPct)} below its usual ${formatRupees(usual)}.${mrpNote}`,
    };
  }
  return {
    status: 'no_real_drop', ...base,
    explanation: `${formatRupees(current)} is about its usual price (${formatRupees(usual)}).${mrpNote}`,
  };
}
