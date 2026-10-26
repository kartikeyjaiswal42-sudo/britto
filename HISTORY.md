# Britto (formerly Daam): development record

Renamed from Daam to Britto on 2026-10-27 at the owner's request (S3). Entries below S3 keep
the old name and addresses as they were at the time.

## Waiting for the owner

Things only the owner can do, in plain English with the exact steps. Each later session adds
to this list and removes what is done.

0. **Put P3 live (merge it into `main`)** — this cloud session was not allowed to push to
   `main` (the merge deploys to production, and the session's permission guard stops a
   production deploy without you). Every gate is green on branch `p3-reader-configs`
   (HISTORY "P3"). To do it: on github.com open the `britto` repository → **Pull requests**
   → **New pull request** → base `main`, compare `p3-reader-configs` → **Create pull request**
   → **Merge**. GitHub Actions then updates the database, deploys the Worker and runs the live
   check by itself (about 1 minute; the Actions tab shows a green tick). Later phases are on
   their own branches built on top of P3 (`p4-android`, …); merge them in order the same way.
   Or tell the next session "you may merge to main".
1. **Reload the Britto extension** (once P3 is on `main`): open `chrome://extensions` (or
   `brave://extensions`), find Britto, press the round reload arrow. Then open any Amazon.in
   product: the panel should appear as before. The version under the popup's "Open Britto"
   link should say v0.3.0. (Your old copy keeps working until you do this.)
2. **Switch on the Telegram bot** (from S3, about 3 minutes): README "Switch on the Telegram
   bot". Then tell the next session "bot token is set" so it runs one live Telegram check.
3. **Save one real Flipkart product page** (from S2): open any Flipkart product in Chrome with
   the extension, press "Save this page for Britto" in the panel, and put the downloaded
   `britto-page-flipkart-….html` file into the `britto/test/fixtures/` folder (or attach it
   to the next session). That lets a session check and switch on the Flipkart reader.
4. **CPU check on production** (optional, 2 minutes): in the `britto` folder run
   `npx wrangler tail britto --format json | grep cpuTime` for 10 minutes and paste the
   numbers into the next session. (Measures what the new reader costs on Cloudflare.)

## S1, 2026-10-26: foundations

**Asked:** a BuyHatke-class site with every feature working, the UI to come from a Claude
Design prompt, hosting on Cloudflare (owner chose the mysecondstartupworld account mid-session),
and an estimate of how many 5-hour sessions it takes.

### Measured before building

- **BuyHatke's feature list** (read from buyhatke.com, 2026-10-26): price comparison, price
  history, price alerts, smart deal scanner ("no fake discounts"), auto coupons, gift cards /
  cashback, Spend Lens, look-alike items, a browser extension with the "buyhatke.com/ before a
  link" trick, and flight / hotel / grocery / food / ride comparison. Stores in its header:
  Amazon, Flipkart, Myntra, Meesho, Croma, Ajio, Nykaa, Tata CLiQ (+ Vijay Sales, JioMart).
- **robots.txt** (`User-agent: *`): Amazon.in disallows `/dp/product-availability/` and
  `/dp/rate-this-item/` but not `/dp/<ASIN>`; Flipkart disallows `/viewcart`, `/dynamic/`,
  `/reviews/`, `/ps/` and others but not `/<slug>/p/<itm>`; Myntra `Allow: /`.
- **Which stores a server can read, honestly identified:** Amazon yes (to an honest
  `DaamBot` UA and to plain curl). Flipkart refused (error page "E002"). Myntra no answer in
  25 s to the bot UA (the page loads for a browser UA). Croma HTTP 403.
  A retry of Flipkart with full browser headers was **blocked by the safety classifier as
  bot-check circumvention**, correctly. That became rule 1: the server never disguises
  itself; refused stores are read by the extension.
- **The trap that defines the Amazon reader:** the first "in stock" product I picked (boAt
  Airdopes 141, Bold Black) was actually *Currently unavailable*. Every rupee figure on its
  page (₹999, ₹1,099, ₹1,299) belonged to carousels (`sims-simsContainer`, `aplus`). The
  first reading, "Amazon works, prices visible", was wrong until I mapped each price to its
  page section. In-stock pages carry the real price in `#corePriceDisplay_desktop_feature_div`
  → `.a-price.priceToPay` (whole + fraction; its `a-offscreen` is EMPTY), M.R.P. in
  `.apex-basisprice-value .a-offscreen`.
- **Myntra:** `window.__myx.pdpData.price = { mrp: 699, discounted: 305 }` in rupees,
  `flags.outOfStock`, image template `secureSrc` with `($height)` placeholders.
- **Read cost** (warm, this M2): ~0.8 ms per Amazon page (860 KB), 1.06 ms for 1.6 MB,
  0.16 ms Myntra. Free Workers allow 10 ms CPU per invocation → `PER_RUN = 4`. **Not yet
  measured on Cloudflare** (observability is on; check `cpuTime` after deploy).
- **Free-plan limits** (developers.cloudflare.com, 2026-10-26): Workers 100k requests/day,
  10 ms CPU (HTTP and cron alike), 5 cron triggers/account, 50 subrequests/invocation,
  128 MB. D1: 5M rows read/day, 100k written/day, 5 GB, 500 MB per DB, 10 DBs.

### Built

`core/` (pure): `types.ts` contract · `money.ts` paise · `stores.ts` link → key (exact host
match; `Object.hasOwn`, because `"toString" in obj` is true) · `html.ts` (find one element by
id, skipping script/style bodies, so no DOM and no 10 ms blow-up) · `extract.ts` · `history.ts`
(step function; the last price holds until `lastCheckedAt`, never "now"; time-weighted
mean/median/percentile) · `judge.ts` (verdict + sale check, thresholds named in `VERDICT` /
`SALE`) · `alerts.ts` (edge-triggered) · `schedule.ts` (overdue ratio, failure backoff).
`api/`: Worker (`worker.ts` exports only the default; logic in `app.ts`), D1 schema with
FTS5 title search via triggers, write-on-change prices, IP-hashed rate limit, cron re-check.
`web/`: working single-page UI (vanilla JS, strict CSP, SVG step chart, light/dark, 390 px).

### Bugs caught by the suites (each was real)

1. **`/p/<key>` bounced to the home page.** The assets server answers `/index.html` with
   `307 → /` by default, so every product link a browser opened would have lost its path, and
   `/bot` would have looped. Fix: `html_handling: "none"` + explicit `/` route. Caught by
   `prove.mjs` (first run 30/31).
2. **The chart was blank for a just-added product.** One point = a zero-length span, and
   the range filter `to > start` dropped it. That is exactly the screen every shopper sees
   first. Caught only in real Chrome (`path d=""`, width 0). The API tests could not see it.
3. A unit test asked for "wait" on a product priced ₹1,150 for half the watched time. The
   rule (dearer than 60% of the time) correctly said "fair". **The test's fault**; fixed
   the data (30 days ₹1,000 + 10 days ₹1,150).

### Proved able to fail

Nine deliberate breakages, each run against the suites and restored (runner backs up
originals and restores on exit/signal): availability ignored, minDays 0, last price held
until now, below-alert always armed, prefix host match, sale check without history, every
check writes a row (prove), cron fetches refused stores (prove) → all red on exactly their
own checks. **"Price from anywhere on the page" stayed GREEN at first**: every fixture's
first `a-price` happened to be the real one. Added a test that cuts the price-to-pay element
out of a real page and requires `unrecognised`. Now red. In Chrome, reverting fix 2
reddens exactly the 4 chart checks.

### Final gates (this session, final code)

`npm test` 34/34 · `tsc --noEmit` clean · `prove.mjs` 37/37 (local wrangler dev, real
Amazon read: Cello 25-pen set ₹265, M.R.P. ₹299) · `browser.mjs` 30/30 (desktop light +
390 px dark).

### NOT verified / not done

- **Not deployed.** Wrangler here is signed in to AMITY (OAuth). The mysecondstartup token
  in `quire/.env` is labelled "for Quire only", so it was not used. The owner creates a
  Daam token (README → Deploy).
- **Amazon from Cloudflare's network: unmeasured.** Every Amazon read so far came from a
  home connection in India. If Cloudflare egress is refused, Amazon becomes extension-only
  too, and the cron does nothing until the extension exists.
- Amazon robot-check marker strings in `extract.ts` are **from memory**: no robot-check
  page has been served to us. An unmatched one still lands as `unrecognised` (no title).
- Short links (`amzn.in`, `amzn.to`): code follows redirects, but **no real short link has
  been resolved yet**.
- `_headers` CSP is applied in `wrangler dev` (checked by `prove.mjs`); not yet checked live.
- No extension, alerts delivery, more stores, comparison, Spend Lens: see `PLAN.md`.

## S2, 2026-10-26: live on AMITY + the browser extension

**Asked:** "start building for session 2, host on amitynoidalibrary account only". The owner
moved hosting from mysecondstartup to AMITY (wrangler's OAuth on this Mac is AMITY, so no new
token was needed).

### Deployed

- Checked AMITY first (it hosts live client work): no Worker named `daam`; D1 had 3 of 10
  databases; cron triggers in use 1 of 5 (`hme-sheet */6`), so Daam's `*/5` makes 2.
- D1 `daam` = `6c89b04d-7e2e-4b9f-8ef2-86c87ea9ef61`. Live: https://daam.amitynoidalibrary.workers.dev
- **Order kept: schema first, then code** (the new `reports` table existed before the code
  that writes it).

### Measured on the live Worker

- **Amazon answers Cloudflare's network.** Cello 25-pen set ₹265 / M.R.P. ₹299, Cello
  10-pen ₹155 / ₹199; two unavailable pages read as unavailable.
  **Correction (S3, from the production database):** this line originally also listed
  "Technotip ₹1,763.31" as read through the live Worker. It was not. The live Worker's only
  read of B00IEA1G4M was the failed one that exposed the paise bug (`unrecognised`, before
  the fix), and the 24 h failure back-off meant it was never re-read. ₹1,763.31 came from the
  saved fixture. The first real live read of it happened in S3 (₹1,763.31, in stock, cron
  CPU 30 ms, 2026-10-27 00:31 IST).
- **CPU (from `wrangler tail`, cpuTime):** first full-page read 9 ms per add. Then with the
  "unavailable" pages 16–22 ms per add, and the cron **126 ms for 2 products**. After the
  early stop and `Accept-Encoding: identity`: cron **81 ms for 4 products**, adds 33–36 ms
  (cold isolates). Every outcome was `ok`: the free plan's nominal 10 ms is **not being
  enforced per request today**. It is still a risk (meridingo has seen 1102s on this account). If
  outcomes turn `exceededCpu`, the options are PER_RUN 1, Workers Paid ($5/month), or reading
  from a GitHub Actions job instead (its IPs **not measured** against Amazon).
- Locally (M2, warm): gunzip+decode of a full page 7–12 ms against ~0.8 ms to read it. That is
  why the server now asks for `identity` (Amazon honours it: 882 KB plain vs 182 KB gzip) and
  stops reading once `enough()` says the answer cannot change (title, availability and the
  whole price box all arrive in the first ~20–41% of the page).

### Bugs found this session (all real)

1. **Every Amazon price with paise read as "unrecognised".** Amazon nests the decimal point
   inside the whole part (`1,763<span class="a-price-decimal">.</span>`), and the reader got
   "1,763 ." with a stray space. Found by the LIVE Worker on a real product (B00IEA1G4M);
   none of the S1 fixtures had paise. Fixture + test added.
2. **Readings could be filed under the wrong product.** Single-page stores (Flipkart, Myntra)
   change the address before the page, and a redirect can land on another item. Every reader
   now reports the id the PAGE names, and `confirmIdentity()` refuses a mismatch on both the
   server and in the extension. In the browser test, removing the guard filed the ₹305 Myntra
   shirt under product 999999.
3. `scripts/build-ext.mjs` used `path.join(ROOT, out)`, which turns an absolute `--out` into
   `ROOT + /var/folders/…`. The test build went into a stray `daam/var/` and the browser
   loaded an empty folder. Now `path.resolve`.
4. Playwright adds `--disable-extensions` by default, and it silently wins over
   `--load-extension` (the first launch hung for 180 s). Fix: `ignoreDefaultArgs`.

### Built

- `core/trust.ts`: when to believe a report. Unchanged price within 10 minutes is skipped. A
  first report is accepted. A move of 40% or more needs a second, independent network
  (hashed IP) agreeing within 2% inside 48 h. Otherwise accepted. `cleanObserved` (whole
  paise, ₹1 to ₹1 crore, M.R.P. below the price dropped) and `cleanImage` (https, store
  image hosts only).
- `POST /api/observations`: 150 reports per network per hour; creating a product counts
  against the 30-adds limit. An extension report fills a blank title but never renames a
  product. An accepted change on a server-readable store queues a server re-check, so the
  server's reading has the last word (asserted in prove: latest point is `server`).
- `core/extract.ts`: `enough()` (early stop), `jsonLdProduct()` (generic schema.org reader,
  checked against the real Myntra page: ₹305, same as Myntra's own data), `confirmIdentity()`.
  **Flipkart's reader is OFF** (`FLIPKART_READER_VERIFIED = false`): no real Flipkart
  product page has been seen yet, and the embedded price is not always the price paid.
- `extension/`: Chrome MV3, built by `scripts/build-ext.mjs` (esbuild) from `core/` and
  `web/` directly, so it reads pages exactly as the server does. Closed shadow-root panel
  (price, verdict, sale check, chart, link to Daam). The service worker is the only network
  path; re-sends of the same reading are suppressed for 30 minutes. A "Save this page"
  button on unreadable pages downloads the HTML (nothing uploaded). The popup says exactly
  what is sent.

### Gates (final code, this session)

`npm test` 48/48 · `tsc` (core+api) clean · `tsc -p tsconfig.ext.json` clean · `prove.mjs`
local 51/51, **live 35/35** · `browser.mjs` local 30/30, **live 30/30** · `extension.mjs`
20/20 in headless Brave 155 (Google Chrome 156 refuses `--load-extension`).
Proved able to fail this session: identity guard removed → the 2 identity checks red; panel
on every page → "no panel on a search page" red; plus the S1 runner's 9 breakages still
hold (unit/prove suites re-run green after restore).

### NOT verified / not done

- **Flipkart has no working reader**: needs one real product page saved from the owner's
  browser with the extension ("Save this page"). Then verify JSON-LD vs the visible price
  and flip the flag.
- Myntra in a LIVE browser: the extension test serves the saved Myntra page. Whether the live
  site still keeps `window.__myx` in the DOM after its own scripts run is **unverified**.
- The extension has never been run against production or on a real store page. The owner's
  first install is that test.
- Not on the Chrome Web Store (load unpacked). Alerts: S3.
- Gotcha: killing a local dev server by port (`lsof -ti tcp:P | xargs kill`) stops workerd
  but leaves the parent `wrangler dev` node process alive. Kill by command line.

## S3, 2026-10-27: alerts, the Telegram bot, and the rename to Britto

**Asked:** "change the Daam name to Britto"; "is there anything which works without the
extension so that I can directly send"; then: "so that I can share the website with all my
friends and classmates; they can use it on phone and laptop everywhere without the extension,
and I want all the features of BuyHatke"; "build S3".

### Rename (done, live)

- Every name in code, UI, extension, bot User-Agent (`BrittoBot/0.1`), docs. The saved
  Amazon fixtures still say `DaamBot`: Amazon echoes the requesting User-Agent into its page,
  and fixtures stay byte-for-byte as fetched.
- New Worker `britto` and new D1 `britto` (`8fe7808f-37cf-4800-bee5-de9178423a29`). The 7
  products and 5 price rows were copied from D1 `daam` with generated INSERTs (FTS rebuilt by
  its triggers: "cello" finds 3). D1 `daam` is left in place, unused; deleting it is the
  owner's call.
- The old `daam` Worker was replaced by a 13-line redirect (`legacy/daam-redirect/`, 301 for
  GET, 308 otherwise) with **no cron**: AMITY still uses 2 of its 5 cron slots
  (hme-sheet + britto). Checked: an old `/p/…` link lands on the same Britto page.

### What works without the extension (the owner's question, answered by measurement)

Amazon.in works fully from any phone or laptop browser (server-read), and alerts reach a phone
by Telegram or notification. Flipkart and Myntra still refuse our server (S1 measurements), so
without the extension nobody can add new prices for them; phone users see what extension
users recorded. The honest way to change that is an official feed (Flipkart Affiliate API /
Amazon PA-API, both **not checked**); added to S5 as its first step. Not done: anything that
disguises the bot.

### Built

- `core/alerts.ts` additions: `parseRule` (whole paise, 1–90%), `describeRule`,
  `suggestTargets` (5%/10% under, whole rupees), and **`readingMovesAlerts`: an extension
  report never fires an alert on a store our server reads**; only our own reading can.
  Alerts are re-evaluated on **every** successful server reading of a watched product, not
  only on a change: an extension report may have recorded the new price first, and the
  server's confirming reading writes no new row. Safe because `decideAlert` is idempotent on
  repeated readings (unit test).
- `api/webpush.ts`: Web Push by hand with WebCrypto: RFC 8291 aes128gcm + RFC 8292 VAPID
  (ES256, WebCrypto's raw r|s is exactly JWS). **Byte-for-byte equal to RFC 8291 Appendix A**
  (fetched from rfc-editor.org), plus a decryption written separately with node:crypto, plus
  a VAPID signature verified with node:crypto. Push endpoints allow-listed (FCM, Mozilla,
  Apple, Windows) so the server cannot be pointed at arbitrary URLs.
- `api/channels.ts`: Telegram calls (the token is in the URL, so URLs are never logged); the
  webhook **registers itself** the first time a token is seen (`getMe` + `setWebhook` with a
  secret derived from the token + `setMyCommands`; cached in D1 `meta`, re-done if the token
  or site address changes); delivery to Telegram and every subscribed browser; a chat that
  blocked the bot (403) is unlinked, a push endpoint answering 404/410 is deleted.
- `api/alerts.ts`: owners (browser token hash and/or Telegram chat, no passwords), one alert
  per owner+product+kind, 50 per owner, link codes (24 chars, one use, 15 min), linking a chat
  merges alerts made in the bot into the browser's owner, `evaluateAlerts` saves state BEFORE
  sending (a failed send must not fire again).
- `api/telegram.ts`: the bot. A product link anywhere in a message (Amazon app shares put it
  mid-sentence) → title, store, price, M.R.P., verdict, sale check, history link, alert
  buttons; `/alerts`, `/stop`, `/start <code>`. Private chats only; always answers the webhook
  200 so Telegram does not resend.
- `api/refresh.ts`: reading and adding products moved out of `app.ts` so the site and the bot
  share one path (`resolveLink`, `addProduct`, `refresh`).
- Web: alert box on every product page (any drop / at or below ₹X / back in stock or "first
  price"), "My alerts" page, Connect Telegram (the button becomes a real t.me link because
  browsers block windows opened after a network wait; the page polls until the bot has the
  link), notifications on/off, test alert, bot tip on the home page for phone users,
  `sw.js` (shows notifications, caches nothing), `manifest.webmanifest` + icons (iPhone
  allows web push only from a Home Screen app). Extension panel: "Set a price alert" link.

### Measured / found this session

1. **Playwright's default browser context is incognito-like and Chrome refuses push there**,
   with only "Registration failed - permission denied". A real user in a private window would
   have seen that raw text → the page now says private windows cannot get notifications and
   offers Telegram. The test uses a persistent profile.
2. **Chrome's first push subscription in a fresh profile can take more than 20 s** (one run
   missed at 20 s, the next succeeded) → wait 45 s.
3. **New cron triggers took ~11 minutes to start** on the new Worker (Cloudflare documents up
   to 15). Not a bug; the first cron then read the never-tried product first.
4. CPU from `wrangler tail` on production: alert endpoints 0–3 ms (push encrypt + sign + send
   = 3 ms), one Amazon read in the cron 30 ms, outcome `ok` throughout.

### Gates (final code)

`npm test` **58/58** (incl. RFC 8291 vector) · both typechecks clean · `scripts/alerts.mjs`
**68/68** API, **83/83** with `--browser` (real Chrome UI + **a real FCM push from the local
Worker, decrypted in the service worker**) · `prove.mjs` local **51/51**, live **35/35** ·
`browser.mjs` live **30/30** · `extension.mjs` **21/21** (Brave) · `push-live.mjs` **6/6**:
real Chrome subscribed on production, the production Worker's push (secret VAPID key) arrived
decrypted; its test subscription and owner row were deleted afterwards (checked: 0 rows).
Proved able to fail (mutation runner restores on exit): forged report may fire → 2 checks
red, and the failure text shows a ₹260 forged price messaging a watcher; no evaluation on an
unchanged server read → 1 red; webhook secret check removed → 3 red; alert state not saved →
4 red (repeat messages); chat merge dropped → 5 red. Encryption label changed → the RFC
vector and the decryption test red.

### NOT verified / not done

- **The Telegram bot has never talked to real Telegram.** Everything ran against a fake Bot
  API that answers like the real one. Needs the owner's bot token (README), then one live
  check. Until then `/api/config` says `telegram: null` and the site hides Telegram buttons.
- **Phones:** Android Chrome and iPhone (Home Screen) notifications are untested on real
  devices; laptop Chrome headless is what was tested. Firefox/Safari push untested.
- Flipkart app share links (`dl.flipkart.com/s/…`) are short links our parser does not
  follow (it would need a Flipkart request, which Flipkart refuses). Not measured.
- One shared network (a college Wi-Fi) shares the 30 new products/hour and 60 new
  browsers/hour limits. Fine for a class, worth watching (S8).
- Flipkart reader still off: no saved page yet.

## Plan revision, 2026-10-27 (after S3, no code)

**Asked** (with 6 screenshots of the BuyHatke Android app: "Super Browse", a grid of ~100 stores
and brands; "Explore": Ride Compare, Product Lens, Flight Compare, Gift Cards, Spend Lens, Hotel
Compare, Refer & Win, Food Compare "coming soon", Verified Deals, Grocery Compare "beta"): build
the BuyHatke app as a website, or as an app if an app is better; why are rides and flights not
in the plan?

**Checked, not assumed:**
- Uber's price-estimate API needs Uber's approval, and its terms forbid using it to compare
  prices with rival services (developer.uber.com, estimates-price page).
- Amadeus Self-Service APIs (the free flight search I had in mind in S1) closed on
  17 July 2026 (PhocusWire). Travelpayouts' Aviasales Data API is free after sign-up but
  serves cached prices other searchers saw (2–7 days); live search needs brand approval.
- Flipkart's affiliate site documents Product/Offers APIs; whether new affiliates get access
  today was not found.
- Android 13+ "restricted settings" block Accessibility for sideloaded apps unless the user
  overrides it (third-party guides; no Google page found).
- How BuyHatke or Comparoo read ride fares: **not found**.
- Store home pages with the honest BrittoBot UA, from a home connection (not Cloudflare):
  refused: Blinkit 403 captcha, Zepto 202 JS wall, Swiggy Instamart 202 JS wall, BigBasket
  403, JioMart 403, Ajio 403, Meesho 403, Croma 403. Answered 200: Nykaa (page mentions a
  captcha), Tata CLiQ (14 KB JS shell), Reliance Digital, Vijay Sales, Snapdeal, ShopClues,
  FirstCry.
- This Mac has Android SDK build-tools 34–36, platforms 33–36 and Java 21; wifibeing's
  no-Gradle APK build is the pattern to reuse.

**Correction to S1's plan text:** "grocery, food and cab prices live inside phone apps with no
public web pages" was wrong for grocery: Blinkit, Zepto and Instamart have web pages; they
refuse bots.

**Decision:** website AND an Android app on one server. The app's in-app browser ("Super
Browse") is the only honest way to get Flipkart/Myntra/grocery prices on a phone: it reads the
page the shopper opened, like the extension. New order: S4 Android app, S5 design, S6 stores
+ compare, S7 grocery (app), S8 flights + hotels, S9 rides (app), S10 deals + look-alikes +
Product Lens, S11 Spend Lens, S12 job-ready. Not planned: gift cards, cashback, Refer & Win
(real money), food compare (after grocery), iPhone app.

## P3, 2026-10-27: readers are data (reader-config DSL + config service)

**Asked:** BLUEPRINT §24 P3 — §6 in full: one config interpreter for every client, ETag
caching, config CI with fixture dry-runs, reader-health telemetry, the P1 readers migrated
onto configs. Part 1 (selector engine, recipe schema, interpreter, the three recipes, 386
readings identical to the old readers) was done on the owner's Mac; part 2 ran unattended in
a cloud session (claude.ai/code) on branch `p3-reader-configs`.

### Built

- `core/select.ts` (CSS selectors over raw HTML, no DOM; anything unsupported is refused),
  `core/recipe.ts` (schema, `validateReader`, content-hashed `configVersion`, `jsonPath`,
  `fillTemplate`, `readApiRows`, `configFromServed`), `core/interpret.ts` (`readPage`,
  `readerEnough`, `confirmIdentity`), `core/jsonld.ts`, `readers/*.json` (Amazon, Myntra
  verified; Flipkart `verified: null`, so it stays unrecognised).
- `validateReader` now refuses unknown keys at EVERY level (its header promised that; only
  field keys were checked) and identity headers in API recipes (User-Agent, Origin, Referer,
  Cookie, Authorization, Host, Forwarded, X-Forwarded-*, X-Real-IP, True-Client-IP, Proxy-*,
  Sec-*). `variants` and `sellerPageFallback` are refused until built.
- **Config CI** `scripts/check-readers.mjs` + `test/fixtures/expected.json` (every fixture
  must have an entry): validates every `readers/*.json`, reads every saved page and diffs
  status/price/M.R.P./stock/pid/title, **deletes what the recipe read until the reading
  changes** (a reading that survives every target came from somewhere the recipe does not
  name), checks the early-stop contract on every 16 KB prefix; `--candidate <file>`. In CI.
- Schema: `reader_configs` (D1 hot-fix), `config_log`, `reader_health` (hourly counts,
  swept after 30 days).
- `api/readers.ts`: `getReader` (newest VALID D1 override, else bundled, 60 s per isolate,
  first-seen versions logged), `countReading`, `healthReport` (§20 warnings `no_reads`,
  `failing`; the cron logs them once an hour).
- Endpoints: `GET /api/config/reader` (id or number; desktop/mobile with `deviceFallback`;
  `ETag` = version; `304`; `max-age=600`), `POST /api/telemetry`, `GET /api/health/readers`;
  `POST /api/observations` takes `configVersion`/`readerVersion`/`client`. Server reads go
  through `getReader` and count every outcome. `Store.num`: amazon 1, flipkart 2, myntra 3.
- `scripts/publish-reader.mjs`: dry run against every saved page, then insert; `--clear`,
  `--list`; `--local <dir>` or `--remote`.
- Extension 0.3.0: the §7.5 messages (`getReaderConfig`, `postObservation`,
  `getProductAnswer`, `reportTelemetry`), shape-checked, unknown/foreign ones dropped; the
  service worker caches configs 10 min in `chrome.storage.session`, revalidates with
  `If-None-Match`, refuses a body that does not hash to its version, dedupes in-flight asks.
  **The content script ships the interpreter only: `content.js` contains no recipe string.**
- `scripts/mutate.mjs` (`npm run mutate [name]`): kept mutation runner. Each mutant is one
  exact replacement, a command, and the names of the checks that must fail; it fails if any
  other check fails or an expected one stays green. Restores files on exit/Ctrl-C.

### Measured / found

1. **Amazon refused this cloud container.** Shortly before 21:10 UTC (2026-10-26) two local
   `prove` runs read the real page through the Worker's honest BrittoBot headers (₹265 /
   M.R.P. ₹299). At 21:10:50 UTC (Amazon's own Date header) a plain `curl` with the BrittoBot
   User-Agent got **HTTP 503** from CloudFront ORD58 (USA), the "To discuss automated access
   to Amazon data" page; by 21:25 the Worker's own reads got 503 too. Not worked around. Saved as fixture
   `amazon-refused-503-automated-access.html`: it confirms two of the reader's three blocked
   markers on a real page (`/errors/validateCaptcha` and the "automated access" comment);
   "Enter the characters you see below" is NOT on it (still from memory). `prove` and
   `alerts.mjs` now print the checks that need a real Amazon price as **SKIP … NOT verified**
   instead of crashing (prove did `last.source` on an empty result) or passing silently.
2. **Parity, browser vs Node** (§22): the extension's readings in Chrome for Testing 153
   equal `readPage` in Node on the same saved pages, all fields (status, price, M.R.P.,
   stock, pid, title, image, rule), on 4 pages (Amazon in stock, Amazon unavailable, Myntra,
   Flipkart error page). The browser re-serialises the page and runs its inline scripts;
   none of that changed a reading here.
3. Cloud tooling: Playwright + Chrome for Testing 153 are preinstalled (`require('playwright')`,
   nothing downloaded); Chrome for Testing accepts `--load-extension` (the extension suite ran
   30/30 in it). Android SDK pieces for P4 came from `dl.google.com` (reachable).
4. The config CI runs in 0.7 s for 8 fixtures, every 16 KB prefix included.

### Gates (final code on the branch, this cloud session)

`npm test` **77/77** · both typechecks clean · `check:readers` **8/8 fixtures** ·
`mutate` **17/17 caught exactly** · `prove` local **71 passed, 0 failed, 6 SKIP (Amazon
refused this network)** · `extension.mjs` **30/30** (Chrome for Testing 153) ·
`alerts.mjs` **61 passed, 0 failed, Amazon section SKIPPED** (same reason). GitHub Actions
(Node 24): typecheck + unit + check:readers green on every push of the branch.

### Proved able to fail (`npm run mutate`, each restored)

validator ignores unknown keys → 1 red · validator allows identity headers → 1 · version
ignores content → 1 · only the first regex alternative tried → 1 · regex match index
ignored → 1 · API rows keep rupees → 2 · API row filter ignores `ne` → 1 · `jsonPath` does
not step into arrays → 2 · **interpreter falls back to any price on the page → 2** (the
synthetic decision test and the real "price box without price-to-pay" page) · Amazon recipe
forgets "currently unavailable" → both unavailable fixtures · Myntra recipe reads M.R.P. as
price → 1 · Flipkart loses its error-page markers → 1 · early stop before the price box → 3
fixtures · **interpreter falls back to the page's own `priceAmount` JSON → the deletion rule
reddens 3 fixtures** (the reading survived deleting every target) · config endpoint ignores
If-None-Match → prove 1 · D1 override used without validation → prove 2 · extension drops
the image → the 3 parity checks with an image.

### NOT verified / not done

- **Not merged, not deployed.** The push to `main` was refused by the session's permission
  guard ("Production Deploy"); not worked around. Production still runs the S3 code. Waiting
  for the owner (top of this file). The branch is `p3-reader-configs` (`560f9cf`).
- **Anything that needs Amazon to answer this network**: the 6 prove SKIPs and the alerts
  Amazon section. They run green where Amazon answers (S3 on the Mac; the live check after a
  deploy reads through the production Worker).
- CPU of the new interpreter on Cloudflare (Mac: full Amazon page 1.17–1.25 ms vs 0.78–0.90
  before). Needs `wrangler tail` on production (owner's login).
- The extension 0.3.0 has not been loaded into the owner's own browser.
- No real-store page has been read by the extension since S2 (tests serve saved pages).

