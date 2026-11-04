// The fare reader the Britto app runs in a travel site's results page (FareRunner.java), built
// into assets/britto-fares.js by scripts/build-app-assets.mjs. It reads with core/fares.ts, the
// engine the tests run on saved pages, and returns the reading as JSON. It defines nothing on the
// page (the app wraps it in a function each time) and talks to nothing: the app asks, it answers.
//
// Only the fare cards are handed to the engine when the page has any: a results page can be huge
// (EaseMyTrip's measured 8.8 MB, mostly hidden fare details), and reading all of it every
// second and a half would make a phone crawl. With no cards yet (a page still loading, a "are you a
// person?" page, a login page) the whole page is read, which is small.
import { readFares, type FareRecipe } from '../../core/fares.ts';

export function read(recipe: FareRecipe): string {
  try {
    let cards: Element[] = [];
    try {
      cards = Array.from(document.querySelectorAll(recipe.items)).slice(0, (recipe.max ?? 40) * 2);
    } catch {
      cards = [];
    }
    const html = cards.length
      ? `<html><body><div class="britto-items">${cards.map((c) => c.outerHTML).join('')}</div></body></html>`
      : document.documentElement.outerHTML;
    return JSON.stringify(readFares(recipe, html, location.href));
  } catch {
    return JSON.stringify({ status: 'waiting', rows: [] });
  }
}
