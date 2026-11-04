# Abuse review (2026-11-04, P11 part 2b)

What someone could do to Britto, or through Britto to a store or travel site, and what stops
it. "Network" means the hashed address Cloudflare reports (`api/app.ts clientId`). Every limit
below is checked by `npm run prove` against a real local Worker unless it says otherwise.

## Fixed in this review

| Risk | Before | Now |
|---|---|---|
| A short link (amzn.in/d/…) makes Britto's server fetch from the store. | It was followed **before** the hourly add limit was checked, so one network could make Britto fetch from Amazon without limit, which could get Britto's honest bot refused. | **30 short links an hour** per network (or Telegram chat), counted before any request (`SHORT_LINKS_PER_HOUR`). prove: a network at 30 is refused before any link is followed; mutant "short links followed without their hourly limit". |
| "Popular" on the home page is ordered by product views. | Every `GET /api/products/<key>` added a view, so a script reloading one product could put it on the home page. | **One view per network per product per hour.** prove: three loads count once, another network once more; mutant "every load counts as a view". |
| Shared-link previews write a product's name into the page head. | (new) | Every value is HTML-escaped and written with replacement functions, so a title like `"><script>` or `$&` stays text (`api/meta.test.ts`, two mutants). Pictures only from `https://`. |
| Two parts of the page used the app bridge at once. | Each call to `siteBridge()` replaced the bridge's reply handler, so a running fare compare could stop getting answers. | One sender for the whole page (`web/app.js`). Not a security issue, but a page could hang. |

## Limits that were already there

| What | Limit |
|---|---|
| New products | 30 an hour per network; already-tracked products open without limit |
| Store search (`/api/store-search`) | 40 store requests an hour per network; repeated words come from a cache |
| Price reports from the extension or app | 150 an hour per network; a report is a claim (`core/trust.ts`): a 40% move needs a second network, a report cannot rename a product, and on a store the server reads only the server's reading fires an alert |
| Coupon votes | 30 an hour per network; only codes the store's own page showed the server can be voted on |
| Grocery compares | 300 an hour per network |
| Telemetry | 600 an hour per network |
| New devices (`POST /api/me`) | 60 an hour per network |
| Alert changes | 120 an hour per device; test messages 5 an hour; Telegram connect attempts 20 an hour |
| Telegram webhook | refused without Telegram's secret header (derived from the bot token) |

## The app (Android)

- **Only the Britto site can talk to the app** (`addWebMessageListener` is given the site's
  own origin only). Store and travel pages get no bridge.
- **Fare and hotel compare** opens only `https://` pages on the travel hosts listed in
  `core/services.ts` (`FareJob.of` refuses anything else, and one bad site refuses the whole
  list), at most 10 sites, 2 at a time, each for at most 45 s. Links that try to open another
  app are not followed. Nothing is clicked, typed or booked on the sites.
- **A searched day** handed to the reader must be a real `YYYY-MM-DD` (`FareJob.DAY`), so no
  text from the page reaches the script the app runs (FareJobTest "refused:
  2026-11-20\");alert(1);//").
- **Status-bar colours** from the page must be `#RRGGBB`; anything else paints nothing.
- **Fare alerts** are kept on the phone only. At most 3 routes, each checked every 6 hours:
  at most 12 travel-site page loads per phone in 6 hours. That is about what the shopper
  would cause by searching themselves.

## Not fixed (known, accepted for now)

- **Many phones share one network** (mobile carriers put many users behind one address), so a
  busy network can hit a limit that one person never would. The limits are set high enough
  for a classroom. An attacker with many addresses (IPv6) gets each limit many times. A real
  fix needs accounts or Cloudflare's paid rate-limiting rules.
- **D1's free daily budget is shared with every project on the AMITY account** (100,000 rows
  written a day). A flood of product page loads now writes one rate row each (a repeat view
  writes nothing else). Cloudflare's own DDoS protection is the backstop; nothing in Britto
  caps total writes per day.
- **`/api/search` (Britto's own catalogue) has no per-network limit.** It reads D1 only, which
  costs reads (5 million a day free), not store requests.
