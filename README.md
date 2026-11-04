# Britto: know the real price before you buy

**Live:** https://britto.amitynoidalibrary.workers.dev · **Browser extension:** `extension/`
(The project was called Daam until 2026-10-27; the old address redirects here.)

Price history, honest discount checks and price-drop alerts for Indian online stores:
Amazon.in, Flipkart and Myntra so far. Paste a product link, put the site's address in front
of any product link, or send the link to the Telegram bot, and see:

- **the price history** as a step chart (a price holds until it changes; out-of-stock
  periods are gaps, never interpolated);
- **a verdict**: good time to buy, fair, wait, or *too early to judge* (under 7 days of
  data, Britto refuses to make a call);
- **a sale check**: the discount judged against the product's *own usual price*, not the
  M.R.P. printed beside it, plus detection of "raised the price, then dropped it";
- **price alerts**: below a target, any drop, or back in stock, by Telegram or browser
  notification. No account and no password.

Status and roadmap: `PLAN.md`. API: `CONTRACT.md`. Development record: `HISTORY.md`.

## Case study: what was hard, and how it was decided

**The problem.** Indian store pages print a discount against an M.R.P. the product never sold
at. BuyHatke-style tools answer "is this really cheap?" from price history. Britto does the
same, on the constraint that it never pretends to be a person: its server identifies itself as
`BrittoBot`, and when a store refuses it, Britto does not work around the refusal.

**Most stores refuse an honest server: measured, not assumed.** Amazon.in, Vijay Sales, Nykaa
and ShopClues answer from Cloudflare. Flipkart answers "E002", Myntra never answers, Croma 403s,
and every grocery app refuses. So the readers run **where the shopper already is**: in a
browser extension, and in the Android app's in-app browser ("Super Browse"), on the page the
shopper opened. All three clients (Worker, extension, app) run **one interpreter over JSON
reader configs** (`core/interpret.ts`), served by the Worker, so a store that changes its page
is fixed by publishing a config, never by shipping an app.

**A reading from a browser is a claim.** A 40% move needs a second network to agree; a report
can never rename a product; on a store the server can read, only the server's own reading
fires an alert (`core/trust.ts`).

**Travel compare without a fare API.** No travel site offers a free, permitted fare API. The
app opens each site's own results page in hidden browsers on the phone, reads what the page
shows with the same selector engine (recipes in `web/fares.json`), and lists the results side
by side. Britto's server never sees the search. Measured on 2026-11-04 in the app: Delhi to
Mumbai on 4 sites in about 32 s, 40 flights grouped per flight with each site's fare, and
Hindon / Navi Mumbai flights flagged (sites mix them into "Delhi" and "Mumbai"). Hotels:
Booking.com prices the whole stay and Cleartrip one night, so both are put per night before
they are compared. Sites that ask "are you a person?" (Skyscanner) are shown to the shopper to
answer, never worked around.

**Proving it.** Every reader is checked against pages saved from real stores
(`test/fixtures/`). Every test suite is **proved able to fail**: `npm run mutate` breaks the
code in 109 deliberate ways, and each must turn exactly its own checks red (the mutation run
has caught tests that passed while asserting nothing). "Verified live" means checked in the
production database, not a fixture.

**What it does not do (yet).** No Play Store listing; Flipkart's reader is off until a real
page is saved; round trips are compared as two one-way tickets (the sites' own round-trip pages
are not read); Rapido, Ola and MakeMyTrip hotels are links only. The record of every decision
and measurement is `HISTORY.md`.

## Without the extension (phone or laptop)

Everything on the website works in any browser, with nothing to install:

- **Amazon.in fully**: paste a link, see the history, verdict and sale check; our server
  re-reads the price on its own (every 3 h for products with alerts, 12 h otherwise).
- **Alerts** by Telegram (any phone) or browser notification (Chrome/Edge/Firefox on Android
  and laptops; on iPhone only after "Add to Home Screen", Apple's rule).
- **The Telegram bot**: share a product from the Amazon app to the bot and it replies with the
  verdict and one-tap alert buttons. (Switched on once the owner sets the bot token, below.)

**Flipkart and Myntra refuse our server**, so their prices come only from shoppers who have
the extension. A phone user can see any Flipkart/Myntra history that extension users have
recorded, but cannot add new prices. The honest way to fill that gap is the stores' own
affiliate data feeds, which need an affiliate account (not checked yet, see PLAN.md).

## How prices are read (measured)

| Store | Read by our server? | Read by the extension? |
|---|---|---|
| Amazon.in | **Yes**, from Cloudflare's network (2026-10-26: ₹265, ₹155 and two unavailable pages; 2026-10-27: ₹1,763.31, the first price with paise) | Yes (tested in real Brave on saved pages) |
| Myntra | No: no answer to an honest bot in 25 s | Yes (tested on a saved page; live site not yet checked) |
| Flipkart | No: answers "Something went wrong! E002" | **Not yet.** The reader is off until it is checked against a real Flipkart page |
| Vijay Sales | **Yes** (P6, 2026-10-26, from a cloud computer; from Cloudflare live 2026-10-27, `priced` in production): ₹4,999 / M.R.P. ₹15,999 read by the Worker. Stock from the store's own schema.org data (its buttons are drawn by JavaScript) | Same reader |
| Reliance Digital | **No, from Cloudflare** (2026-10-27: HTTP 403 twice from the live Worker, while the same honest bot got full pages from a US cloud computer and from India). Its schema.org data says "in stock" even for items it will not sell, so the reader uses the page's own `sellable` flag | Yes, same reader (fixture-verified) |
| Nykaa | **Yes** (P6, same; from Cloudflare live 2026-10-27): ₹749 / M.R.P. ₹1,150, from the state the page renders from. A listing showing "₹0" is read as no price | Same reader |
| ShopClues | **Yes** (P6, same; from Cloudflare live 2026-10-27): ₹419 / M.R.P. ₹1,499; sold-out listings read as unavailable | Same reader |
| Tata CLiQ | No price in the page the server gets (a 14 KB JavaScript shell) | Not yet (needs a page saved from a browser) |
| FirstCry | Product data only under cryptic keys; the price is drawn by JavaScript | Not yet (needs a saved page) |
| Croma, Snapdeal, Ajio, Meesho | No: they refuse even robots.txt to an honest bot (403 / Access Denied) | Not yet (needs a saved page) |

Store sales (Amazon Great Indian Festival, Flipkart Big Billion Days, …) are marked on every
price chart from `readers/sales.json`, each with the link its dates were read from; a sale
whose end date is not published is marked at its start only.

## Readers are data (since P3)

Everything Britto knows about a store's page lives in a JSON **reader config**
(`readers/amazon.desktop.json`, …), not in code. One interpreter (`core/interpret.ts`) runs
it everywhere: the Worker, the extension, and later the Android app, so they cannot
disagree. The server serves the configs (`GET /api/config/reader`, cached 10 minutes by
clients, revalidated by version), so **when a store changes its page, the fix is a config
change, never a new extension release**.

- **Check a config before it ships:** `npm run check:readers` reads every saved page in
  `test/fixtures/` and compares it with `test/fixtures/expected.json`; it also deletes what
  each recipe read and requires the reading to change. CI runs it on every push.
- **Hot-fix production without a deploy:** `node scripts/publish-reader.mjs new.json --remote`
  dry-runs the candidate against every saved page and only then writes it to D1; the Worker
  serves it within a minute. `--clear amazon.desktop --remote` goes back to the bundled one.
- **Watch for breakage:** `GET /api/health/readers` counts every reading per store, source and
  config version for 24 hours, and warns when a store stops being read or half its readings
  fail. The cron logs the same warnings once an hour.

## Deals, look-alikes and offers (P8)

- **Deals** (`/deals`) are products whose trusted price is at least 5% below their usual
  price (the 90-day median of prices Britto saw). M.R.P. is never used. Filter by store and by
  the smallest drop; each deal shows a small graph of its last 90 days so you can check it.
- **Similar, and cheaper** on a product page: tracked products sharing distinctive title
  words, cheaper and in stock. Labelled "similar, not the same product".
- **Offers on the store's page:** bank offers and cashback (Amazon.in) and coupon codes
  (ShopClues) exactly as the page shows them when Britto's own server reads it, for 3 days.
  A code has a Copy button and "It worked / It did not"; the page shows "Worked for N of M
  shoppers in the last 30 days". Britto never invents codes and never stores offer text sent
  by a browser.

## Travel (P9, P11)

`/travel`: enter a trip once.

- **In the Android app, Britto compares the prices** (P11). It opens each site's own results
  page on the phone, under the Britto page, and reads what that page shows:
  - **Flights:** MakeMyTrip, ixigo, Goibibo and EaseMyTrip, side by side per flight, with
    nearby airports flagged.
    - A **fare strip by date**, taken from the sites' own date strips. Tap a day to compare it.
    - **Round trips**, compared as two one-way tickets.
    - **Fare alerts:** up to three routes, compared again on the phone every few hours. A
      notification comes when a fare drops at least ₹100 (and 1%) below the lowest seen.
  - **Hotels:** Booking.com and Cleartrip, per night, before taxes.
  - **Rides:** Uber's rides with their fares, after you log in to Uber once in the app.

  Nothing is clicked or booked on the sites, and Britto's server never sees the search.
- **In a browser,** the same search opens on each site instead. Every link says how far it
  was checked:
  - **checked in the Britto app:** the four flight sites, Booking.com, Cleartrip hotels and
    Uber;
  - **checked on the site:** Cleartrip flights;
  - **from the site's own documentation:** Skyscanner;
  - or just the site's front page: IndiGo, Air India, MakeMyTrip hotels, Rapido and others.
- **Ride to the airport** puts your location into an Uber link on your phone (Britto never
  receives it), for airports Uber was seen to recognise.

## Rules

1. **The server never disguises itself.** It sends `BrittoBot/0.1 (+<site>/bot)`, fetches only
   product pages robots.txt allows, one at a time, and backs off on refusal. It never
   borrows a browser's identity and never works around a bot wall.
2. **A price comes only from the store's own "you pay" element for THIS product.** Product
   pages carry many other prices (similar items, sponsored rows, other variants). Every reading
   must also name the product it shows, and a reading that names another product is refused
   (`confirmIdentity`).
3. **An extension report is a claim.** A move of 40% or more is shown only after a second,
   independent network sees the same price; a report can't rename a product; Amazon changes are
   re-read by the server, which has the last word (`core/trust.ts`). **A report never fires an
   alert on a store our server reads**: only our own reading can (`readingMovesAlerts`).
4. **Missing is not zero.** Too little history means `too_early`, never "clean sale" or
   "good price".
5. **Money is integer paise.** Never a float rupee.
6. **Every number in the docs has a source**: a fixture, a test, or a dated measurement.

## Switch on the Telegram bot (owner, once, about 3 minutes)

1. In Telegram, open **@BotFather**, send `/newbot`, call it `Britto`, and pick a username
   ending in `bot`. BotFather replies with a token. Keep it private: not in chat, not in a file.
2. In this folder: `npx wrangler secret put TELEGRAM_BOT_TOKEN` and paste the token.
3. Open the site's `/alerts` page. The Worker finds the token, registers the bot's webhook
   with Telegram itself, and the page starts showing "Send any product link to @yourbot".

## The Android app (Super Browse)

`android/`: the Britto website in an app, plus **Super Browse**: shop on Amazon.in, Flipkart
or Myntra inside the app and Britto's panel appears on every product page, reading the page
you are looking at (the extension's own reader, run by the phone's WebView, only on the stores'
own pages). **Share → Britto** from a store's app opens the product there. "Save page" keeps a
copy of a page in Downloads so a reader can be built for it (nothing is uploaded).

Build: `npm run build:apk` (Gradle; needs JDK 21, Node.js and an Android SDK). Tests:
`npm run test:app`. Every push also builds the APK on GitHub Actions (run page → Artifacts).
Not on the Play Store (needs the owner's developer account); install the APK directly.

## Install the extension (until it is on the Chrome Web Store)

1. `npm install && npm run build:ext` (or use the already-built `extension/dist`).
2. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose
   `britto/extension/dist`.
3. Open any Amazon.in, Flipkart or Myntra product. The Britto panel appears at the bottom right.

It sends only what the product page shows (address, title, image, price, M.R.P., stock),
never cookies, account details or browsing history.

## Run it

```bash
npm install
npm run db:local          # create the local database
npm run dev               # http://127.0.0.1:8787
npm test                  # unit tests (no network), incl. RFC 8291's own push example
npm run typecheck         # the real gate: node --test strips types without checking them
npm run check:readers     # every reader config against every saved store page
npm run mutate            # break the code on purpose; the right checks must turn red
npm run prove             # real Worker + real local D1 + one real Amazon request
node scripts/alerts.mjs   # alerts end to end: fake Telegram + a push service that decrypts
PW_DIR=<playwright-core dir> node scripts/alerts.mjs --browser   # + real Chrome, real FCM push
PW_DIR=<playwright-core dir> node scripts/browser.mjs http://127.0.0.1:8787   # site, real Chrome
PW_DIR=<playwright-core dir> node scripts/extension.mjs                        # extension, real Brave
PW_DIR=<playwright-core dir> node scripts/travel.mjs         # travel links opened on the real sites
node scripts/airports.mjs                                    # rebuild web/airports.json (OurAirports)
PW_DIR=<playwright-core dir> node scripts/uber-airports.mjs  # re-measure which airports Uber recognises
```

In a cloud session Playwright and Chrome for Testing are preinstalled; `extension.mjs` uses
them when Brave is absent (Chrome for Testing still allows `--load-extension`).

## Deploy (Cloudflare, free plan, AMITY account)

Hosting is **Cloudflare Workers + D1 + Cron Triggers** on the free plan, account
amitynoidalibrary@gmail.com (`account_id` in `wrangler.jsonc`). Limits, checked 2026-10-26 on
developers.cloudflare.com: 100,000 requests/day, 10 ms CPU per invocation, 5 cron triggers per
account; D1 5 million rows read and 100,000 written per day, 5 GB. **These are shared with
every other project on the AMITY account.**

```bash
npx wrangler whoami                # must show amitynoidalibrary@gmail.com
npm run db:remote                  # schema FIRST (idempotent)
npm run deploy                     # then code
node scripts/prove.mjs --live https://britto.amitynoidalibrary.workers.dev
PW_DIR=<dir> node scripts/push-live.mjs https://britto.amitynoidalibrary.workers.dev  # real push, cleans up
```

Secrets (set once, kept by Cloudflare across deploys): `VAPID_PRIVATE_JWK` (set 2026-10-27;
its public half is `VAPID_PUBLIC_KEY` in `wrangler.jsonc`) and `TELEGRAM_BOT_TOKEN` (owner).
Losing the VAPID private key only means generating a new pair: browsers re-subscribe the next
time their owner presses "Turn on notifications".

Measured CPU is above the nominal 10 ms for Amazon reads (cron 30 ms for one read, 81 ms for
four), and Cloudflare currently lets it through (`outcome: ok`). Alert requests cost 0–3 ms.
See HISTORY.md for the numbers and the fallbacks.
