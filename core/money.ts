import type { Paise } from './types.ts';

/**
 * Read a rupee amount as printed by a store: "₹1,29,900.00", "Rs. 999", "INR 265",
 * "&#x20b9;6,999.00", "265". Returns integer paise, or null when the text holds no
 * single unambiguous amount. Never rounds through a float.
 */
export function parseRupees(text: string | null | undefined): Paise | null {
  if (text == null) return null;
  const s = String(text)
    .replace(/&#x20b9;|&#8377;|₹|\bRs\.?|\bINR\b/gi, ' ')
    .replace(/&nbsp;| /g, ' ')
    .trim();
  const m = /^(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m || m[1] === undefined) return null;
  const whole = m[1].replace(/,/g, '');
  const frac = (m[2] ?? '').padEnd(2, '0');
  const paise = Number(whole) * 100 + Number(frac);
  return Number.isSafeInteger(paise) ? paise : null;
}

/** A plain number of rupees (e.g. JSON-LD "305" or 305.5) to paise. */
export function rupeesToPaise(value: unknown): Paise | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  }
  if (typeof value === 'string') return parseRupees(value);
  return null;
}

/** ₹1,29,900 or ₹1,299.50 — Indian digit grouping, paise only when non-zero. */
export function formatRupees(paise: Paise | null): string {
  if (paise == null) return '—';
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const digits = String(rupees);
  let grouped: string;
  if (digits.length <= 3) grouped = digits;
  else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  }
  return `${neg ? '-' : ''}₹${grouped}${p ? '.' + String(p).padStart(2, '0') : ''}`;
}

/** 0.1234 -> "12%". */
export function formatPct(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return '—';
  return `${Math.round(fraction * 100)}%`;
}
