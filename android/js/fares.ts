// The fare reader the Britto app runs in a travel site's results page (FareRunner.java), built
// into assets/britto-fares.js by scripts/build-app-assets.mjs. It reads with core/fares.ts, the
// engine the tests run on saved pages, and returns the reading as JSON. It defines nothing on the
// page (the app wraps it in a function each time) and talks to nothing: the app asks, it answers.
//
// Only the fare cards are handed to the engine when the page has any: a results page can be huge
// (EaseMyTrip's measured 8.8 MB, mostly hidden fare details), and reading all of it every
// second and a half would make a phone crawl. With no cards yet (a page still loading, a "are you a
// person?" page, a login page) the whole page is read, which is small. The site's date strip
// (recipe.strip) is handed over beside the cards, and dated from the searched day (`when.date`).
// A ride site whose trip is typed on its own page (recipe.places: Rapido) also says what its
// pickup and drop boxes hold, so the Britto page can show which trip the fares are for.
import { readFares, type FareRecipe } from '../../core/fares.ts';

const all = (selector: string, max: number): Element[] => {
  try {
    return Array.from(document.querySelectorAll(selector)).slice(0, max);
  } catch {
    return [];
  }
};

export function read(recipe: FareRecipe, when?: { date?: string }): string {
  try {
    const cards = all(recipe.items, (recipe.max ?? 40) * 2);
    const strip = recipe.strip ? all(recipe.strip.items, 62) : [];
    const only = (extra: string) => `<html><body><div class="britto-strip">${strip.map((c) => c.outerHTML).join('')}</div><div class="britto-items">${cards.map((c) => c.outerHTML).join('')}</div>${extra}</body></html>`;
    const html = cards.length ? only('') : document.documentElement?.outerHTML ?? ''; // no document yet while the first page loads
    let reading: Record<string, unknown> = { ...readFares(recipe, html, location.href, when?.date) };
    if (cards.length && reading.status !== 'fares') {
      // Cards but no fare on them (Uber logged out lists its rides without prices, measured
      // 2026-11-04): the words saying why ("Login") are outside the cards, so read the page's
      // visible text too, its start only (a log-in or a question is at the top).
      const words = (document.body?.innerText ?? '').slice(0, 20_000).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      reading = { ...readFares(recipe, only(`<div class="britto-text">${words}</div>`), location.href, when?.date) };
    }
    if (recipe.places) {
      reading.places = all(recipe.places, 2).map((e) => String((e as HTMLInputElement).value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120));
    }
    return JSON.stringify(reading);
  } catch (e) {
    // Still "waiting" for the rules (FareJob), but the app logs the error: a reader that throws
    // must never pass for a page with no fares.
    return JSON.stringify({ status: 'waiting', rows: [], error: String((e as Error)?.message ?? e).slice(0, 160) });
  }
}
