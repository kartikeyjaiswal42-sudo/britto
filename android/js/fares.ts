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
    const html = cards.length
      ? `<html><body><div class="britto-strip">${strip.map((c) => c.outerHTML).join('')}</div><div class="britto-items">${cards.map((c) => c.outerHTML).join('')}</div></body></html>`
      : document.documentElement?.outerHTML ?? ''; // no document yet while the first page loads
    return JSON.stringify(readFares(recipe, html, location.href, when?.date));
  } catch (e) {
    // Still "waiting" for the rules (FareJob), but the app logs the error: a reader that throws
    // must never pass for a page with no fares.
    return JSON.stringify({ status: 'waiting', rows: [], error: String((e as Error)?.message ?? e).slice(0, 160) });
  }
}
