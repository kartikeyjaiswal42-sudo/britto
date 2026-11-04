// Entering a ride's trip on the site's own page (FareRecipe.fill: Rapido, whose address holds no
// trip, measured 2026-11-04), the way the shopper would: tap the pickup box, type the place they
// gave Britto, pick the site's own suggestion that matches it best, then the same for the drop.
// ONE action per reading (the app reads every 1.5 s), so the page has time to answer each one.
// The step reached is handed back to the app (FareJob keeps it) and comes back with the next
// reading: nothing is stored on the page.
//
// Only the recipe's boxes and suggestion items are ever touched. Anything that is, or is inside, a
// button or a link, or says book / confirm / request / pay, is refused: Britto never books.
import type { FareFill } from '../../core/fares.ts';

export interface Trip { pickup: string; drop: string }
export interface Step { stage: string; failed?: string }

const NEVER = /\b(book|confirm|request|pay|proceed|order)\b/i;
const visible = (e: Element | null | undefined): e is HTMLElement => !!e && (e as HTMLElement).getClientRects().length > 0;
const first = (selector: string): HTMLElement | null => {
  try {
    return Array.from(document.querySelectorAll(selector)).find(visible) as HTMLElement | undefined ?? null;
  } catch {
    return null;
  }
};

/** True when the element may be tapped: not a button or link, and not a booking word. */
export function safeToTap(e: Element): boolean {
  return !e.closest('button, a, [role=button]') && !NEVER.test(e.textContent ?? '');
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && w !== 'india');

/** The suggestion that names most of the place's words (ties: the site's own order), or null. */
export function bestSuggestion(want: string, items: string[]): number | null {
  const need = [...new Set(words(want))];
  if (!need.length) return null;
  let best = -1;
  let score = 0;
  items.forEach((text, i) => {
    const have = new Set(words(text.slice(0, 160)));
    const n = need.filter((w) => have.has(w)).length;
    if (n > score) { score = n; best = i; }
  });
  return best >= 0 && score >= Math.max(1, Math.ceil(need.length / 2)) ? best : null;
}

function type(input: HTMLInputElement, text: string): void {
  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
  const key = text.slice(-1);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }));
}

/**
 * One step towards the trip. Stages: "" → "pickup-open-N" → "pickup-typed-N" → "drop-open-N" →
 * "drop-typed-N" → "done", or "failed" (with why). N counts readings spent waiting in a stage.
 */
export function fillStep(fill: FareFill, trip: Trip, stage: string): Step {
  if (stage === 'done' || stage === 'failed') return { stage };
  const m = /^(pickup|drop)-(open|typed)-(\d{1,2})$/.exec(stage) ?? (['', 'pickup', 'open', '0'] as const);
  const leg = m[1] as 'pickup' | 'drop';
  const n = Number(m[3]);
  const i = leg === 'pickup' ? 0 : 1;
  const want = (leg === 'pickup' ? trip.pickup : trip.drop).trim();
  const search = first(fill.search[i]) as HTMLInputElement | null;
  if (m[2] === 'open') {
    if (search) {
      type(search, want);
      return { stage: `${leg}-typed-0` };
    }
    const box = first(fill.boxes[i]);
    if (!box) return { stage: `${leg}-open-${n}` }; // the page is still loading: the app's time limit applies
    if (n >= 6) return { stage: 'failed', failed: `${leg}: its box did not open` };
    if (!safeToTap(box)) return { stage: 'failed', failed: `${leg}: refused to tap its box` };
    box.focus();
    box.click();
    return { stage: `${leg}-open-${n + 1}` };
  }
  // typed: wait for the site's suggestions, then pick the one that matches the place
  const items = Array.from(document.querySelectorAll(fill.suggestions)).filter(visible) as HTMLElement[];
  if (!items.length) {
    if (n >= 8) return { stage: 'failed', failed: `${leg}: no suggestions` };
    if (n === 4 && search) type(search, want); // once more, as a person would
    return { stage: `${leg}-typed-${n + 1}` };
  }
  const at = bestSuggestion(want, items.map((e) => e.innerText || e.textContent || ''));
  if (at == null) return { stage: 'failed', failed: `${leg}: none of the site's places matched "${want.slice(0, 40)}"` };
  const pick = items[at]!;
  if (!safeToTap(pick)) return { stage: 'failed', failed: `${leg}: refused to tap it` };
  pick.click();
  return { stage: leg === 'pickup' ? 'drop-open-0' : 'done' };
}
