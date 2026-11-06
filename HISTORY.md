# Britto (formerly Daam): development record

Renamed from Daam to Britto on 2026-10-27 at the owner's request (S3). Entries below S3 keep
the old name and addresses as they were at the time.

## Waiting for the owner

Things only the owner can do, in plain English with the exact steps. Each later session adds
to this list and removes what is done.

0. **Deploying from the Mac** (optional, 2 minutes): GitHub deploys work again (the push of
   `e315396` went live at 10:17 UTC on 2026-10-29; the earlier `e09e1f4` push never did, cause
   unseen). A deploy from the Mac still fails with Cloudflare API error 10013. If you want
   sessions to be able to deploy from the Mac too, run `npx wrangler login` once in a terminal
   in `britto/` and approve in the browser. If a push ever fails to go live, GitHub → Actions →
   the newest run on `main` shows which step is red.
1. **Reload the Britto extension** (P3 is on `main` since 2026-10-27): open `chrome://extensions` (or
   `brave://extensions`), find Britto, press the round reload arrow. Then open any Amazon.in
   product: the panel should appear as before. The version under the popup's "Open Britto"
   link should say v0.4.0 (Spend Lens added 2026-11-03). (Your old copy keeps working until you do this.)
2. **Switch on the Telegram bot** (from S3, about 3 minutes): README "Switch on the Telegram
   bot". Then tell the next session "bot token is set" so it runs one live Telegram check.
3. **Save one real Flipkart product page** (from S2): open any Flipkart product in Chrome with
   the extension, press "Save this page for Britto" in the panel, and put the downloaded
   `britto-page-flipkart-….html` file into the `britto/test/fixtures/` folder (or attach it
   to the next session). That lets a session check and switch on the Flipkart reader.
4. **Install the Android app on your phone** (5 minutes): open
   https://britto.amitynoidalibrary.workers.dev/app on the phone, tap **Download**, open the
   file, allow installs from Chrome once, Install. (Version 0.6.1, 2026-11-04, signed with the
   release key of item 6, so later versions install over it; 0.5.0 was seen installing over
   0.4.0 with its data kept.) To send it to friends: in the app, **Get the app → Send Britto to
   a friend** (WhatsApp or any app gets the download link), or send the file itself
   (`~/Downloads/Britto-0.6.1.apk` on the Mac) as a WhatsApp **Document**; the friend opens it
   and allows installs from WhatsApp once. It was tested end to end on an
   Android 14 emulator against the live site (HISTORY "P11 part 1"); a real phone is still the
   final check: tell the next session anything that looks wrong. Uninstall any older Britto
   first (it was signed with a different key).
4b. ~~Log in to Uber inside Britto and save one fare screen~~ (done 2026-11-04: you logged in
   on the emulator; a fare screen, Connaught Place → Delhi T3, was saved with Save page. It is
   kept OUTSIDE the repo in `~/.britto/pages/` on the Mac, because it came from your logged-in
   account; checked for your number, name, email and session tokens, none found.)
4c. **Save your orders page once, for Spend Lens** (3 minutes). In the Britto app: Shop →
   Amazon.in → log in (your number, Amazon's own page) → menu → **Your Orders** → press **Save
   page** at the top, and send the `britto-page-amazon-mobile-….html` file to the next session.
   It contains your recent orders (that is the point); it goes only into Britto's private test
   folder to teach the reader, never onto the live site. Until a real orders page is checked,
   Spend Lens reads nothing. The same for Flipkart and Myntra if you shop there.
5. ~~Save three phone pages~~ (done 2026-10-29 in the emulator: 4 Amazon, 3 Flipkart, 2 Myntra
   pages, each saved with the app's own Save page).
6. **Back up the app's signing key** (2 minutes, once): it was made on 2026-11-04 in the folder
   `~/.britto/` on this Mac (`britto-release.jks`, with its password in `release.env`; neither is
   in the repo). Copy that whole folder somewhere safe (a USB stick, or an encrypted note).
   Every version of the app must be signed with it: if it is lost, everyone has to uninstall
   Britto (losing their alerts) before a new version installs. `node scripts/publish-apk.mjs`
   builds, signs and publishes the app with it.
7. ~~Phone notifications (FCM)~~ (not needed: since 2026-11-04 the app asks the server for
   fired alerts every 15 minutes and when it opens, and shows them as notifications.)
8. **Grocery pages from your phone** (P7, 10 minutes, after item 4): in the Britto app, set a
   delivery address in Blinkit, Zepto, Swiggy Instamart and BigBasket inside Super Browse (they
   are not in the Shop grid yet: open them from a Telegram/WhatsApp link to their site), open
   one product (e.g. Amul Butter 500 g) and one search for it on each, and press "Save page"
   each time. Send the files to the next session with the pincode you used. Without these,
   grocery compare cannot read any prices.
9. **Flipkart Affiliate account** (optional, 15 minutes; makes Flipkart prices work without the
   extension): sign up at affiliate.flipkart.com, then in the dashboard go to API → API Token →
   Generate. Do not paste the token anywhere; tell the next session "Flipkart affiliate token
   is ready" and it will explain how to store it as a Worker secret yourself.
10. ~~CPU check on production~~ (measured 2026-11-04 with `wrangler tail`: two Amazon store
   searches took 470 ms and 94 ms of CPU and both answered normally; no CPU-limit errors seen.)
11. ~~Decide on Workers AI~~ (decided 2026-11-04: **"Yes, allowed on AMITY"**, for photo search,
   measured and capped so it cannot use up the account's daily allowance; not built yet: P11
   part 4). The question was: picture search ("Lens": photo of a
   product → matches) and smarter "similar products" need Cloudflare Workers AI. Cloudflare's
   pricing page (read 2026-10-27) says every account gets 10,000 "neurons" a day free, and on
   the free plan going over makes requests fail rather than cost money. The allowance is per
   ACCOUNT, so on AMITY it is shared with the paying client's projects, if they use Workers AI.
   If that is fine, tell the next session "Workers AI is allowed on AMITY"; it will add it and
   measure the cost per search before switching anything on. If not, nothing changes.
12. **Check two travel links from India** (3 minutes; MakeMyTrip, ixigo, Goibibo and EaseMyTrip
   were checked inside the Britto app on 2026-11-04 and are read for fares now): in the Britto
   app open Travel → Flights, DEL to BOM, any date, Compare fares; under "Also search on" tap
   **Skyscanner**: it asks "Are you a person or a robot?" (press and hold). Tell the next
   session whether it then showed fares. (Booking.com hotels are read in the app since 0.5.0.)
13. **Log in to Appetize** (if you want to try the app in your browser): the Chrome window on
   appetize.io asks you to log in again. Log in and tell the session; it uploads
   `web/download/britto.apk` there. Appetize's free plan gives 30 minutes a month. Typing your
   number into an Appetize phone sends it through Appetize's computers, so test logins on your
   own phone instead.
14. **Log in to Uber once in the Britto app on your phone** (2 minutes): Travel → Rides →
   type a pickup and a drop → Compare rides. If Uber says "log in", tap **Open Uber**, log in
   with your number on Uber's own page (it stays in the app on your phone), go back and press
   Compare rides again: every Uber ride type is listed with its fare. Never press Request.
15. ~~Rapido's fare page~~ (done 2026-11-04: you logged in to Rapido on the test phone; the
   session typed the trip with your permission and saved the page, kept OUTSIDE the repo in
   `~/.britto/pages/`; only the ride list went into the tests.) Since 0.6.1 Rapido works like
   Uber: on your phone, log in to Rapido once (Travel → Rides → Compare rides → **Open
   Rapido**), then every Compare rides fills in Rapido and lists its prices by itself.
16. **Try 0.5.0's and 0.6.0's new things on your phone** (10 minutes, after item 4): Travel → Flights,
   DEL to BOM, a date, **Compare fares**: check that a row of dates with prices appears under
   "Cheapest found" (tap a day: it compares that day), and tap **Alert me if it gets cheaper**.
   Then add a Return date and compare again (round trip). Then Hotels → Goa → **Compare
   hotels**. Tell the next session which sites showed prices. On the test phone MakeMyTrip and
   Goibibo stopped answering after many test searches in one day (a bare "200-OK" page and a
   network error); on your phone they should answer normally. A fare alert notification comes
   only when a fare drops at least ₹100 below the lowest seen, so it may take days.

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


## P4, 2026-10-27: the Android app (Super Browse) — on branch `p4-android`

**Asked:** BLUEPRINT §24 P4: WebView shell + Super Browse grid + in-app readers (the same
bundle as the extension) + share target + "Save this page" + FCM alerts. Unattended cloud
session; the owner then allowed libraries ("use Gradle if it is best"), so the app is a
standard Gradle project.

### Decided

- **Gradle + AndroidX, not the hand-made javac/d8 build** (a working no-Gradle APK was built
  first, 45 KB, then replaced). Why: AndroidX WebKit's `addWebMessageListener` creates the
  bridge ONLY in the stores' own https origins and answers only the top page, where
  `addJavascriptInterface` would expose it to every page and frame, ads and payment pages
  included; `addDocumentStartJavaScript` runs the reader in those origins only; the
  project opens in Android Studio; Robolectric tests the Java on a computer; Firebase (FCM)
  needs Gradle anyway. Versions read from the official indexes, each out ≥ 2 weeks:
  AGP 9.4.1, Gradle 9.8.1 (wrapper, SHA-256 pinned), androidx.webkit 1.17.1,
  androidx.activity 1.13.0, Robolectric 4.17, JUnit 4.13.2, org.json 20260719 (harness only).
- **One reader for extension and app**: `extension/src/reader.ts` (`startReader(host)`); the
  extension's `content.ts` and the app's `android/js/inject.ts` are thin hosts (transport,
  device class, save action). The app asks for `device=mobile`; the server serves the
  desktop recipe flagged `deviceFallback` until a mobile recipe is verified.
- **Super Browse grid = the website's new `/browse` page** ("Shop" in the header, built from
  `/api/stores`, `Store.home` added). In the app a store link opens `StoreActivity`; the
  same page in a browser just opens the store.
- "Save page" (app toolbar) writes the page's HTML to Downloads (`britto-page-<store>-mobile-
  <time>.html`); nothing is uploaded. The bridge has no save message, so a store's scripts
  cannot write files. The website tells app users that alerts come by Telegram (an Android
  WebView cannot receive web push).

### Built

`android/` (Gradle): `MainActivity` (site in a WebView, Home/Shop/Alerts bar, share target,
store links → Super Browse, Telegram/other links → their apps), `StoreActivity` (store
WebView, unchanged User-Agent, reader at document start, bridge, toolbar Save page / Britto,
`intent:` links stay in the browser via their fallback), `BridgeCore` (pure Java: the four
§7.5 messages, 10-min config cache with If-None-Match, offline uses the stale config,
`readerVersion app-0.1.0`, `client app`), `Bridge` (WebMessageListener), `Stores`
(`assets/stores.json` from `core/stores.ts`), `Api` (Britto only, `BrittoApp/0.1.0`
User-Agent). Gradle task `brittoAssets` builds the reader from the repo's TypeScript
(`scripts/build-app-assets.mjs`). R8 shrinks the release APK to **254 KB** (5.8 MB without).
CI job `android`: unit tests + release APK as a downloadable artifact (signs with the
owner's key once the two secrets exist). `scripts/app.mjs` (`npm run test:app`).

### Measured / found

1. **No Android emulator here** (no `/dev/kvm`): nothing ran on Android itself.
2. Robolectric's own downloader fails behind the cloud proxy (`Failed to fetch maven artifact
   android-all-instrumented`); Gradle fetches it instead and Robolectric runs offline. On
   Java 21 it also needs `--add-exports java.base/jdk.internal.access` (measured error).
3. The saved Amazon pages are **desktop layouts**: on a 390 px phone screen the page (and the
   panel) is shown zoomed out. A page laid out for phones keeps the panel on screen (checked).
4. Two of my own test-harness mistakes were caught by the runs (a non-JSON message rejected
   before it reached the Java bridge; a fit check measured against a desktop page), fixed in
   the test, not the app.

### Gates (this cloud session, final code)

`npm test` 77/77 · typechecks clean · `check:readers` 8/8 · Gradle `testDebugUnitTest`
**8/8** (Robolectric, Android 16) · `assembleRelease` OK incl. lintVital · `test:app`
**28/28** (8 APK checks + the injected reader in Chromium at 390 px through the REAL
`BridgeCore.java` to a local Worker: ₹265/₹305 read and posted as `client app`, parity with
Node on 4 pages, one panel and one report after a double injection, foreign bridge messages
dropped, no bridge outside the stores) · `extension.mjs` 30/30 · `prove` 73 passed, 0
failed, 6 SKIP (Amazon refuses this network) · `browser.mjs` local **36/36** (seeded by one
extension report into a throwaway local D1; Super Browse at 1280 light and 390 dark) ·
GitHub Actions: test + android jobs green.

### Proved able to fail (`npm run mutate app:`)

bridge omits `client: app` → 1 red · never caches configs → 1 · accepts any version text → 1
· store host matched anywhere in the address → 1 · share reads only a link at the start → 1
· reader starts again on every injection → 1. All 6 exact.

### NOT verified / not done

- **Nothing has run on a real phone or emulator**: WebView behaviour (document-start script,
  message listener, `target=_blank`, cookies/logins), Back, the share sheet, Downloads, insets
  under the status bar, dark mode. Waiting for the owner's phone.
- **Store pages on a phone are mobile layouts the recipes have never seen.** Until a mobile
  page is saved (the app's "Save page") and a mobile recipe verified, expect "Britto cannot
  read the price on this page yet" on Amazon/Flipkart/Myntra in the app; the panel still
  shows Britto's history for the product.
- **FCM push not built**: needs the owner's Firebase project (Waiting for the owner).
- Not merged, not deployed (P3 first). The APK talks to production, which still runs the S3
  code: until P3 is live, the app's reader gets no config (404) and says it cannot read.
- AndroidX WebKit features need an up-to-date "Android System WebView"; on an old one the app
  says so and has no panel.

## P6, 2026-10-27: store coverage — on branch `p6-stores` (built on P4)

**Asked:** BLUEPRINT §24 P6: new stores one at a time, each fixture-verified; generic platform
recipes (Shopify & co.); official affiliate feeds checked first for any store the server
can't read; sale-calendar config. Unattended cloud session.

### Official feeds, checked first (read 2026-10-27)

- **Flipkart Affiliate API**: "If you are a registered affiliate, you are granted access to the
  Affiliate APIs using your private Affiliate API Token" (affiliate.flipkart.com/api-docs/
  af_register.html); the token is generated from the affiliate dashboard; the docs list
  product feeds, search by keyword/id, offers. Whether the feeds carry the selling price and
  stock is **not stated** on the pages read. Needs the owner's affiliate account (Waiting).
- **Amazon PA-API 5** is deprecated and answers 403; its successor the **Creators API**
  requires "at least 10 qualifying sales within the past 30 days" (affiliate-program.amazon.com
  /creatorsapi/docs/en-us/introduction). Not open to a new associate; not needed while the
  server reads Amazon itself.

### Measured, every request with the honest BrittoBot User-Agent (from this cloud container, USA)

| Store | robots.txt | Product page to the bot | Decision |
|---|---|---|---|
| Vijay Sales | allows `/p/` | 200, ~840 KB, price box server-rendered, buttons hidden until JS | **added** |
| Reliance Digital | allows `/product/` | 200, ~650 KB (14 pages), visible price server-rendered | **added** |
| Nykaa | allows product pages | 200, ~200 KB (9 pages), price in hashed CSS classes, state in `__PRELOADED_STATE__` | **added** |
| ShopClues | allows product pages | 200, ~200 KB; sitemap listings mostly sold out | **added** |
| Tata CLiQ | allows | 200 but a 14 KB JavaScript shell, no product data | not added |
| FirstCry | allows (incl. Claude) | 200 (after a 301 to the current name), data only under cryptic keys, price drawn by JS | not added |
| Croma | "Access Denied" for robots.txt | — | not added |
| Snapdeal, Ajio, Meesho | 403 for robots.txt | — | not added |

FirstCry's robots.txt names Claude, Claude-User and ClaudeBot: checked before fetching (they
are under `Allow: /`). No store fetched has a rule against Claude or BrittoBot.

### Traps found by measuring (each now a fixture + a mutant)

1. **Vijay Sales**: every buy/notify/unavailable button is hidden until the page's JavaScript
   runs; the stock state the server can see is the store's schema.org availability. The page
   has a second "offer price" block (null when there is none); the reader takes the VS price,
   equal to the schema.org price on both pages. Mutant ignoring the stock statement: the
   out-of-stock AirTag reads as priced ₹9,229.
2. **Reliance Digital**: schema.org says **InStock on every page, including 5 the store will not
   sell** (`product_meta.sellable:false, quantity 0`). The reader uses the sellable flag; the
   mutant trusting schema.org records ₹74,990 for an unsellable GoPro. The page also has three
   elements with `id="main-content"` (the first is the breadcrumb): the name comes from
   `h1.product-name`.
3. **Nykaa**: a real listing shows **"Price ₹0."** with an Add to Bag button. New rule for
   every reader: a price under ₹1 is `unrecognised` (`implausible-price`). Mutant: ₹0 recorded.
4. **ShopClues**: sold-out listings still show the price (₹220, M.R.P. ₹229): the reader uses
   the microdata `OutOfStock` and the Sold Out badge. Mutant: the sold-out oil reads as ₹220.
5. Config CI caught three wrong expectations of mine (a title guessed from the address, an
   M.R.P. I thought absent, a store reader count of 3 hard-coded in a test).

### Built

- 4 stores: registry entries (numbers 4–7, `home`, measured lines), link parsers, readers
  (`readers/<store>.desktop.json`), image hosts + CSP, extension matches, 11 new fixtures with
  `expected.json` entries (when, where, how; every one HTTP 200 to the bot).
- **Selector engine**: substring pre-check and a `.class` fast path (the Vijay Sales in-stock
  page went 9.8 → 2.3 ms per read; a new test shows the fast path finds exactly what a full
  scan finds, on every saved page); JSON-LD parsed once per reading.
- **Sale calendar**: `readers/sales.json` (source + checked date required; `to: null` = no end
  date published → start marker only), `core/sales.ts`, `ProductView.saleEvents`,
  `chart.js saleMarks` (+ `chart.d.ts`). Two events: Amazon Great Indian Festival from
  8 Oct 2026, Flipkart Big Billion Days from 9 Oct 2026 (articles cited in the file; no end
  dates were published there).
- `prove` makes one real read per server-readable store through the Worker.

### Gates (final code, this cloud session)

`npm test` 86/86 · typechecks clean · `check:readers` **19/19 fixtures** (written "21/21" at the time: a miscount, corrected in P9) · `mutate` **30/30**
caught exactly (incl. prove, extension and app mutants) · `prove` **77 passed, 0 failed, 6 SKIP**
(Amazon refuses this network) with real Worker reads: Vijay Sales ₹4,999, Reliance Digital
₹1,739, Nykaa ₹749, ShopClues ₹419 · `browser.mjs` local **38/38** (incl. sale marks drawn in
real Chrome) · `extension.mjs` 30/30 · `test:app` 28/28 · Gradle unit tests 8/8.

### NOT verified / not done

- **Cloudflare's network has not read any of the 4 new stores** (only this cloud container).
  After deploy, `prove --live` and reader health (`/api/health/readers`) will show it.
- **No out-of-stock page seen** for Reliance Digital or Nykaa (only for Vijay Sales and
  ShopClues); Nykaa products with variants (shades/sizes) not seen.
- What shoppers SEE after the stores' JavaScript runs (stock buttons, an "offer price") is not
  verified on any of the 4: the readers use what the server receives.
- **Generic platform recipes (Shopify & co.) not built.** Reading any brand's own shop means the
  server fetching hosts nobody has checked: it needs a per-host robots.txt check at run time
  and abuse limits designed first. Left for its own step.
- Sale end dates not published in the sources read; earlier sales not entered.
- The Android APK must be rebuilt after store changes (app.mjs checks it; it caught a stale one).

## P9, 2026-10-27: travel and rides, one search → every site — branch `p9-travel` (built on P8)

**Asked:** BLUEPRINT §14 / §24 P9: deep-link compare (one search → every OTA/airline/ride app),
indicative calendars once observation volume allows, flight price alerts.

### Measured first (honest User-Agent; from this cloud container, USA)

- **Reachability:** Cleartrip, Uber, Ola, Rapido and Namma Yatri answer. MakeMyTrip, Goibibo,
  Yatra, IndiGo, Air India: no answer (HTTP/2 resets, timeouts, 502 through the proxy;
  MakeMyTrip gives curl's default User-Agent a 403). EaseMyTrip redirects this network to its
  .US site. ixigo: 403 "too many requests". Skyscanner: captcha. Booking.com: 403 "detected as a
  robot" (once a short 202 holding page). Ola's booking page stayed on a loading skeleton behind
  reCAPTCHA. None worked around.
- **Cleartrip, in real Chromium:** the flight link fills the whole search (one way DEL→BOM;
  round trip DEL⇄GOI with 2 travellers in Business; Premium Economy; First; DEL→DXB
  international) and Cleartrip then asks its own fare service for exactly those values (that
  request got 403 here, so no fares were seen). The hotel link shows "Showing hotels in Goa",
  the dates, "1 room, 2 guests" and real hotel prices.
- **Skyscanner:** its own referral docs (developers.skyscanner.net, read 2026-10-27): day view
  `origin`, `destination`, `outboundDate`/`inboundDate` (YYYY-MM-DD), `adultsv2`,
  `cabinclass` (economy / premiumeconomy / business / first).
- **Uber:** its docs (developer.uber.com, read 2026-10-27): `m.uber.com/looking?pickup=<JSON>&drop[0]=<JSON>`
  with latitude/longitude. Opened in Chromium: the trip is filled in (fares need a login).
  Uber **ignores the name** we send (an address-only drop is dropped) and **snaps the point to
  the nearest place on its map**: Delhi airport's point in the public airport list read as
  "50 Feet Rd … Nangloi"; Wikidata's point for it read as "Gate 7, Terminal 3". So
  `scripts/uber-airports.mjs` tried every Indian airport (one page load per point, OurAirports
  then Wikidata) and kept those Uber read as the airport itself: **62 of 106** (52 at the OurAirports point, 10 at Wikidata's; Delhi
  as "Gate 7, Terminal 3"). Kochi, Pune, Ahmedabad, Jaipur, Srinagar, Nagpur and 38 others
  snapped to a road, a house, "Air Traffic Control" or an "old airport": they get Uber's front
  page. The first rule let "old airport khajuraho" and "1316, Airport" (a house number) through;
  reading every kept name caught them, the rule was tightened and those two re-measured.
- **Airports:** OurAirports (public domain, per its terms page): 1,214 airports with scheduled
  service and an IATA code (106 in India, plus the world's large airports), 92 KB.

### Built

- `web/travel.js` (runs on the device; the tests import the same file): flight, hotel and
  ride-to-the-airport searches → one link per site, each labelled how far it was checked
  (`opened` on the site / `documented` by the site / not checked yet / front page only).
  Unchecked formats (MakeMyTrip, ixigo flights; Booking.com hotels) are offered only in their
  simplest form (one way, economy) and say "Not checked yet". Dates are India's calendar, up to a
  year ahead (Skyscanner's documented limit); return / check-out after the first date.
- `/travel` page (nav "Travel"): flights, hotels, ride to the airport. The ride link uses the
  phone's location **on the device only** (Britto never receives it; the browser test watches
  every request). Inside the Britto app (which asks for no location permission) the page says
  to use the phone's browser for rides. "Need a ride to DEL?" after a flight search.
- `scripts/airports.mjs` (builds `web/airports.json`), `scripts/uber-airports.mjs` (builds
  `web/rides.json`), `scripts/travel.mjs` (opens the checked links on the real sites; SKIP when
  a site refuses this network).

### Gates (final code on the branch, this cloud session)

`npm test` **105/105** (9 travel) · typechecks clean · `check:readers` 19/19 · `prove` **98
passed, 0 failed, 7 SKIP** (all 7 need Amazon; incl. "/travel serves the app") ·
`travel.mjs` **4/4 on the real sites** (Cleartrip one way, round trip in Business, hotels in
Goa with prices listed; Uber to DEL "Gate 7, Terminal 3"), plus 4 refusals printed as
information (Skyscanner captcha, MakeMyTrip 502, ixigo 403, Booking.com) · `browser.mjs` local
**70/70** (travel at 1280 light and 390 dark: every link exactly as `web/travel.js` builds it,
labels, new tab without referrer, hotels, the Uber link from the browser's location, **no
request to Britto carries the location**, the in-app note, no sideways scroll) ·
`extension.mjs` 32/32 · `test:app` 28/28 · `npm run mutate` **55/55 caught exactly** (7 new:
India's date, return before departure, an unchecked format guessed for round trips, Uber
pre-filled for an unrecognised airport, anything near an airport counted as one, a house number
counted as one, Cleartrip dates in the wrong form). Proved by hand in the browser: sending the
location to Britto's server on purpose turned "the location never went to Britto" red (both
screen sizes), restored. GitHub Actions: green on every P9 push except run 40, which failed for
a real reason: the travel test imported `scripts/uber-airports.mjs`, which loaded Playwright
as soon as it was imported, and GitHub's test machine has no Playwright; the next commit
loads it only when the script runs (runs 41 and 42 green).

### NOT verified / not done

- **MakeMyTrip, ixigo, Skyscanner and Booking.com links:** they refused this network; the owner
  checks them from India (item 12). Goibibo, EaseMyTrip, Yatra, IndiGo and Air India get their
  front page only: no link format could be checked.
- **Rides:** Ola, Rapido and Namma Yatri get their front pages (no documented web link format;
  Ola's page did not load here). Uber only to the airports it was seen to recognise. A ride to
  a typed address needs a map service to turn it into coordinates (not built).
- **Indicative fares calendar and flight price alerts:** need fares that shoppers actually saw.
  There are none: no reader reads a travel site yet, and the sites refuse the server. Not built.
- **Hotels:** one room only. Nothing deployed: waits for item 0 (merge).

## P8, 2026-10-27: deals, look-alikes, offers and coupon codes — branch `p8-deals` (built on P7)

**Asked:** BLUEPRINT §24 P8: deals feed (§11), look-alikes (§10.3), Product Lens (§19),
coupons and bank offers (§15).

### Built

- **Deals against the 90-day usual price** (§11): `SALE.window` 30 → 90 days (a new test pins
  it: 60 days at ₹1,000 then ₹800 is a 20% drop against 90 days and none against 30).
  `GET /api/deals?store=&min=` (5–90%), each card with its last 90 days of prices; the deals
  page has the filters and a sparkline per deal. M.R.P. plays no part.
- **Look-alikes** (§10.3): `GET /api/products/<key>/similar`, cheaper in-stock tracked products
  sharing 2+ distinctive title words (FTS5), labelled "similar, not the same product". The
  Workers AI version waits (owner item 11).
- **Offers read from the store page** (§15): a new `offers` part of the reader language
  (every matching card, read inside each card; at most 1–20; text capped at 200 characters; an
  offer the page repeats listed once; a coupon code only if it looks like one). Amazon reader
  r2 reads Cashback / Bank Offer / No Cost EMI / Partner Offers (3, 3 and 4 cards on the three
  saved priced pages, word for word against the raw HTML); ShopClues reader r2 reads its coupon
  list (code MYSHOPCLUES, "Get flat 10 Percent off on all Prepaid Orders").
- **Stored only from our own server's reads:** `product_offers` (one row per product, replaced
  on each server read, shown for 3 days). Offer text sent by a browser is ignored, never stored
  or shown to anyone else. The extension and the app show the page's offers on the shopper's
  own screen only. An identity mismatch drops the other item's offers with its price.
- **Coupon votes:** `POST /api/coupons/vote`: only a code our server read on that store's page
  can be voted on (a vote never brings a code in), one vote per network per code, 30 votes a
  network per hour, counted over 30 days. Product page: code + Copy + "It worked / It did not"
  + "Worked for N of M shoppers in the last 30 days".

### Measured / found

- The config CI's early-stop rule caught a real bug: the server stopped downloading Amazon
  pages before the offers box closed (it reads to 360 KB; the offers end later). The Amazon
  reader now also waits for `vsxoffers_feature_div`: early stop moves from 33–45% to 36–51% of
  the saved pages.
- Vijay Sales' "Extra Deals" load by JavaScript (not in the server's HTML); Nykaa's `offers`
  list was empty on both saved pages; Reliance Digital's offers are a separate JS section;
  Myntra's codes (MYNTRA300) are site-wide new-user banners, not product offers: none read.
- A real ShopClues read through the local Worker stored its offer (MYSHOPCLUES), from this
  cloud container.

### Gates (final code on the branch, this cloud session)

`npm test` 96/96 · typechecks clean · `check:readers` 19/19 ("21/21" at first: a miscount, corrected in P9) (offers compared exactly; a priced
page whose recipe reads offers must list them) · `prove` **97 passed, 0 failed, 7 SKIP** (all 7
need Amazon, which refuses this network: 503) · `browser.mjs` local **50/50** (offers as plain
text, an injected `<img onerror>` shown as text and never run; coupon Copy/vote; 1280 light and
390 dark; votes stubbed in the browser only) · `extension.mjs` **32/32** (panel shows the 3
offers; parity with Node now includes offers; nothing stored) · `test:app` **28/28** (parity
includes offers) · `npm run mutate` **48/48 caught exactly** (14 new in P8: usual price from 30
days, look-alikes on one shared word, deals ignoring the store filter, offers read outside the
card, text uncapped, another item's offers kept, validator skipping offers, Amazon early stop
before the offers box, offer titles from the wrong element, offers shown after 3 days, a vote
bringing in an unknown code, repeated votes, repeated offers, any text taken as a code; the
ShopClues sold-out mutant now also trips the offers rule, correctly).

### NOT verified / not done

- **Amazon offers from a real server read:** Amazon refuses this network, so the server path
  was proven on ShopClues and on saved Amazon pages only (SKIP in `prove`).
- **Product Lens** (§19) and **AI look-alikes** (§10.3): need Workers AI on the account (owner
  item 11). Not built: nothing here can run Workers AI (`wrangler dev --local` cannot), and
  untestable code is not shipped.
- **"Try codes" at checkout** (§15 auto-apply): needs real cart pages; none saved. Not built.
- **Deals by category** (§11): products have no category yet (the readers do not read
  breadcrumbs); store and minimum drop only.
- Nothing deployed: waits for item 0 (merge).

## P7, 2026-10-27: grocery compare (the part not waiting for phone captures) — branch `p7-grocery`

**Asked:** BLUEPRINT §12 / §24 P7: platform registry, search/price/address/cart recipes, basket
compare, category map, per-100 g normalisation, location-bound labelling. App-first.

**The blocker, measured in S3:** Blinkit (403 + captcha), Zepto and Instamart (202 + JavaScript
wall), BigBasket and JioMart (403) all refuse an honest server. Their prices can only come
from the shopper's phone, and a recipe for each needs real pages/JSON saved there first. So no
platform recipe, address recipe or cart recipe was written: there is nothing real to verify
them against.

### Built (logic and service; tested with made-up quotes, labelled as such in the tests)

- `core/grocery.ts`: the platform registry (8, with what was measured), pack sizes as platforms
  print them ("500 g", "1.5 L", "6 x 300 ml", "300 ml x 6", "Pack of 30", "12 pcs"), price per
  100 g / 100 ml / piece, name matching with the brand left out (my first version scored
  "Amul Butter" and "Amul Cheese Slices" 50% alike on the brand alone: the test caught it),
  `compareItem` (one address only: quotes for another address are left out and said so; in
  stock first; unit prices compared only within one unit; only a certain "same" match can be
  "best", anything else is "check this one"), `compareBasket` (complete baskets first,
  delivery fee only when read, nothing silently swapped), `cleanQuotes`.
- `GET /api/grocery/platforms`, `POST /api/grocery/compare`, `POST /api/grocery/basket`
  (computed per request, nothing stored, 300 per network per hour). `/grocery` page saying
  plainly that it does not work yet and why.

### Gates

`npm test` 93/93 (7 grocery) · typechecks clean · `prove` 82 passed, 0 failed, 6 SKIP (Amazon)
incl. 5 grocery checks · 4 grocery mutants caught exactly (address mixing, brand-only match,
basket swap, "best" without a certain match).

### NOT done / not verified

- **No grocery platform is read.** Needs, per platform, one product page and one search page
  saved from the Britto app on a phone with a delivery address set (Waiting for the owner).
- The page-world API listener (§7.1), search/price/address/cart recipes, category map: not
  built. Without a real platform's JSON there is no pattern to arm the listener with, and
  untested code that wraps a store's own network calls is risk without benefit.
- Nothing about pack sizes has been checked against real platform listings.

## P3–P9 checked on the owner's Mac before the merge, 2026-10-27 (local session)

The cloud sessions built P3–P9 from a US container that Amazon stopped answering, so every
real-Amazon check on the final code was a SKIP. This session re-ran the gates on branch
`p9-travel` (`f3e9e34`) from the owner's Mac in India, where Amazon answers.

### Gates (Mac, Node 24/25, Google Chrome 156 and Brave)

`npm run typecheck` clean · `npm test` **105/105** (108/108 after the fix below) · `check:readers` every reader valid, every
fixture as expected · `prove` **107 passed, 0 failed, 0 SKIP** (live amazon.in reads incl.
Cello pen set ₹246 / M.R.P. ₹275, Morphy Richards air fryer ₹4999 / ₹15999) ·
`alerts.mjs` **68/68** (its Amazon section ran; the cloud had 61 with it skipped) ·
`browser.mjs` **70/70** twice · `extension.mjs` **32/32** · `travel.mjs` **4/4 from India**.
Not run here: `test:app` (**wrong reason given at the time: this Mac HAS an Android SDK at ~/Library/Android/sdk; corrected 2026-10-29, when it ran 29/29**),
`alerts.mjs --browser`, `push-live.mjs`.

### Found and fixed: a reader that throws stopped the whole cron run (product code)

Found because the mutant "a D1 override is used without validation" reddened one check too
many on the Mac (`an unchanged price adds no new row`: `3 -> 3 rows, status priced`, i.e.
the cron's re-read never finished). Measured cause: `fetchProduct` called `readPage` (and,
while streaming, `readerEnough`) outside any `try`, so a reader that throws went up through
`refresh` and the cron loop (`api/app.ts`, no catch): the run ended at that product, and the
product, never marked as attempted, came first again on the next run, every 5 minutes, ahead
of every product after it. In the cloud Amazon answered 503, which is handled before any reader
runs, so the check passed there. Since P3 a reader can come from D1 (validated, but no saved
page has exercised a hot-fix), so this is new risk in this branch.

- `api/fetcher.ts`: a throwing `readPage` → `{ ok: false, code: 'reader_error' }`, recorded
  against the product like any failure (attempt time moves, back-off applies); a throwing
  `readerEnough` → keep downloading; a connection that breaks mid-page → `network`.
- `api/readers.ts`: reader health counts `reader_error` as a failure, so the hourly warning
  names a crashing config.
- `api/app.ts`: the cron loop catches per product (a D1 or alert-send error) and goes on.
  **Not covered by a test** (needs a failing D1; the reader path above is).
- `api/fetcher.test.ts` (3 tests, a saved Amazon page through a stubbed `fetch`) + 2 mutants,
  each caught exactly. The override mutant is now caught exactly on both networks.

### Mutation run on the Mac

`npm run mutate`: **51 of 57 caught exactly** (55 from the cloud + the 2 above). The 6 not
run are the `app:` mutants (Gradle/Robolectric; no Android SDK on this Mac; the cloud caught
all 6). First run said 19/55: **`scripts/mutate.mjs` read failing names only from TAP
`not ok` lines, but Node 24 on the Mac prints its spec format even into a pipe**, so every
`node --test` mutant read as WRONG with no names. The runner now passes
`--test-reporter=tap`. (The extension mutant also needs `PW_DIR` in the environment.)

### Also fixed (test code only)

- **`browser.mjs` "no offers section when none were read" was true only where Amazon refuses.**
  On the Mac the local server read the real page's offers (Cashback, Bank Offer, Partner
  Offers), so the page rightly showed them and the check failed at both sizes. The check now
  compares the section with what the server actually returned (none → no section; N → N
  rows). Proved able to fail: the page told to drop one offer → "read 3, shown 2" red at both
  sizes, restored.
- **`travel.mjs` launched only Playwright's own Chromium**, which the Mac does not have. It now
  tries Google Chrome first, then Chromium (as `browser.mjs` already did).

### Travel sites from India (honest UA, one load each; information, not counted)

Same refusals as from the US container: Skyscanner HTTP 403 captcha, MakeMyTrip
`ERR_HTTP2_PROTOCOL_ERROR`, ixigo HTTP 403, Booking.com HTTP 202 with a 1,251-character page.
So owner item 12 (a person opening the four links) still stands.

### Merged and deployed (2026-10-27 13:30 UTC)

The owner's plan ("Unattended runs": merge when every gate is green) covered the merge the
cloud session could not make: `main` fast-forwarded `2dfce45 → e7ff161` (34 commits, pull
request #1). GitHub Actions put the new code live ~75 s after the push (the reader-config
endpoint answered `amazon.desktop.r2.b6819f37c495`). **Production D1** (`wrangler d1 execute
--remote`, AMITY login) has the five new tables: config_log, coupon_votes, product_offers,
reader_configs, reader_health. **Production rows** written by the live check's real reads:
vijaysales:222878, nykaa:1003586, shopclues:153656207 all `priced` by the production Worker
(13:31 UTC) — the first P6 reads from Cloudflare.

`prove --live` from the Mac: **56 passed, 2 failed, 1 SKIP**. All three measured:

- **Cloudflare weakens the config ETag when it compresses** (curl: no compression → `"amazon.…"`;
  `accept-encoding: br` → `W/"amazon.…"`; the 304 carries the strong one). The server already
  strips `W/` from If-None-Match and both clients send back what they were given, so caching
  works; the two checks compared the strings exactly. They now compare without `W/`
  (the "endpoint ignores If-None-Match" mutant is still caught exactly).
- **Reliance Digital refuses Cloudflare's network**: HTTP 403 to the production Worker twice
  (GitHub's live check 13:31:38, the Mac's ~13:33), while the same honest User-Agent from the
  Mac got the full page (HTTP 200, 650,781 bytes). Not worked around: `serverFetch` →
  `'refused'`, its prices come from the extension (its manifest already matches
  reliancedigital.in) and the app, like Flipkart; the cron no longer asks it. prove checks it is
  tracked and never server-fetched (new mutant, caught exactly). README table updated.

After the second deploy (`f97537f`, live ~50 s after the push): `prove --live` from the Mac
**59 passed, 0 failed, 0 SKIP**. **The production cron read Amazon with the new code**
(production D1, checked): `amazon:B09X5DK382` was made due by moving its `last_attempt_at` back
13 h (schedule field only; unwatched products are re-read every 12 h, so none was due since the
deploy), and the 13:49:42 UTC cron run read it: new `prices` row ₹246 / M.R.P. ₹275 (was ₹265 /
₹299 on 2026-10-26), `product_offers` row (408 bytes), `reader_health` row `server ·
amazon.desktop.r2.b6819f37c495 · priced`. `config_log` lists all seven bundled configs.
NOT verified live: an extension or app reading with a server-served config (the owner's own
browser still runs extension 0.2; item 1), alerts firing on the new code, CPU per read on
Cloudflare (item 10).

## Android on Android, 2026-10-29 (local session): the app tested, phone readers for 3 stores

**Asked:** "whatever is made till now, test the Android app first; then P10 and P11 … make sure
I can connect at least one app per sector (travel, Uber/ride compare, flight, Amazon …); in the
app I log in with my number, as in BuyHatke."

### Owner's decisions (asked 2026-10-29)

- **Rides: "read the fare shown"** — after the shopper logs in on Uber's/Ola's own page inside
  the app (their number, their OTP; Britto never sees either), Compare opens each ride page
  with the trip filled and reads the fare that page shows, then lists them side by side. This
  changes BLUEPRINT §14's "no automated fare reading" line for rides. Never their private APIs.
- **No Britto account** (no phone-OTP login to Britto itself): logins happen on each company's
  own page inside the app; Britto keeps working without an account.

### Measured / found

1. **This Mac has an Android SDK** (`~/Library/Android/sdk`: platforms 33–36, build-tools
   34–36, platform-tools, emulator, an Android 14 arm64 Play image, AVD `wb_test` from
   WifiBeing) and JDK 21. The 2026-10-27 record said otherwise; corrected above.
2. **Gradle's wrapper could not download Gradle**: Java reaches services.gradle.org, github.com,
   dl.google.com and Maven Central but times out on release-assets.githubusercontent.com
   (curl reaches it). Fix: curl the zip, check it against the pinned SHA-256 (equal), put it in
   `~/.gradle/wrapper/dists/gradle-9.8.1-bin/a2l6ltp3k1vth6lwipzm5p2jp/`. `./gradlew` works.
3. **Robolectric breaks on a space in the checkout path** ("New project"): its native-runtime
   loader looked for `…/New%20project/…` (NoSuchFileException), failing the first test of a run.
   `build.gradle.kts` now uses a space-free directory when needed. 8/8.
4. **The app on Android 14 (emulator, WebView 151), production site:** home renders under the
   status bar correctly (411 px wide, no sideways scroll); Shop → Super Browse (7 stores, tiles
   107 px); Amazon tile opens the store browser; on Amazon's real mobile page the panel shows
   the server's history (₹246, chart, verdict, buttons) but **"Britto cannot read the price on
   this page yet"**, as P4 predicted (phone layout, desktop recipe). **Save page** wrote a
   1.9 MB file to Downloads. Back: product → store home → Britto. Share → Britto with a
   tracking-laden Amazon link opens it in Super Browse with the panel.
5. **Dark mode bug (fixed):** switching light→dark with the app open left white status-bar
   icons on a light strip, because the activities handled `uiMode` themselves and the theme/
   insets were never re-applied (cold start in dark was correct). `configChanges` no longer
   has `uiMode`; both screens already save/restore their page. Measured after: dark bars, the
   page stays on /browse. app.mjs checks the APK; red with `uiMode` put back.
6. **Phone pages differ from desktop pages**, so three phone readers were written from pages
   saved with the app's own Save page (prices cross-checked against something other than the
   reader: Amazon's accessibility label, the screenshot, Myntra's own listing):
   - `amazon.mobile` — `#title`, the mobile priceToPay box, M.R.P. from apex-basisprice-value;
     **trap: the box's first struck price is the per-count price (₹10.60)**, a mutant proves the
     fixtures catch it. ASIN from the buy form, else the canonical link (no fixture tells the
     two apart; both give the same ASIN on every saved page). 3 of 5 Amazon pages said "cannot
     be shipped to your selected delivery location" (Noida 201313) while showing a price; read
     as priced, like the desktop reader. **Price depends on location**: the phone saw ₹265 for
     the pen set where the server (Cloudflare, no location) saw ₹246.
   - `flipkart.mobile` — **the first verified Flipkart reader** (the server gets E002; the desktop
     reader is still off). JSON-LD price = the listed price on the screen (₹225; "Buy at ₹213"
     is after offers). **Trap: "Out of stock" on the page belonged to the other colour's
     swatch**; mutant caught. M.R.P. not read (only obfuscated class names hold it). A
     2026-10-26 iPhone link gave E002 even in the app: read as blocked.
   - `myntra.mobile` — the phone page has no `window.__myx = {pdpData}`; JSON-LD + the page's
     one `"price-mrp"` value.
7. **End to end on Android against a local Worker** (debug APK built with
   `-Pbritto.site=http://127.0.0.1:8799` + `adb reverse`; a debug-only network config allows
   plain HTTP to 10.0.2.2/127.0.0.1/localhost; release stays HTTPS-only): the app read Amazon
   ₹265/₹299 and ₹99/₹199, Flipkart ₹225, Myntra ₹395/₹649; the local D1 shows each as a client
   reading with `reader_health` source `app`, reader `app-0.1.0`, the phone config, `priced`.
8. **Deploy blocked.** `e09e1f4` reached GitHub `main` but not the live site (old code after 15
   min). From the Mac: schema OK (25 statements, 0 rows changed), Worker upload fails twice with
   Cloudflare API **10013** at assets-upload-session (truepen hit 10013 before on this account).
   GitHub Actions cannot be seen from here (the keychain's GitHub https login is expired).
   Owner item 0.

### Gates (Mac)

`npm test` 108/108 · typechecks clean · `check:readers` every reader valid, all 28 fixtures
(9 new phone pages) as expected · `prove` 109/0 · Gradle unit tests 8/8 · `test:app` / app.mjs
29/29 · all 6 `app:` mutants caught exactly (first run on any machine besides the cloud) · new
mutants (Amazon per-count M.R.P., Flipkart page-wide stock text, uiMode back) caught exactly.

### NOT verified

- (Resolved 10:17 UTC: the push of `e315396` deployed through GitHub; `prove --live` 61/0,
  incl. "Amazon's phone reader is served" and "Flipkart's phone reader is served verified".
  **Verified live in the production D1:** the production-pointing debug app on the emulator read
  Amazon B00IEA1G4M at ₹1,763.27; `reader_health` 10:00 UTC: source app, `amazon.mobile.r1`,
  priced. The 09:00 rows (4 × unrecognised, desktop fallback) are the same emulator's taps
  before the deploy: real readings of real pages, not test data.)
- A real phone (emulator only); FCM; a phone with a different delivery location.
- Flipkart M.R.P.; Amazon variant pages (buy-form ASIN vs canonical); out-of-stock Flipkart and
  Myntra phone pages (none seen).

## Connect one app per sector, step A, 2026-10-29 (local session) — branch `connect-apps`

**Asked:** "make sure that I am able to connect at least one app per sector like travel, Uber,
compare ride, flight, Amazon etc.; in the app I can do the login with my number, just what
happens in the BuyHatke app."

### Measured first (the Britto app on the Android 14 emulator, owner's network in India)

Uber's web app `m.uber.com/go/home`: map, Login, pickup, drop-off. Ola `book.olacabs.com`:
loads (title) but its page had no text when read; not used. Rapido: a marketing page with an
app download. Cleartrip flight results (DEL→BOM, 27 Nov): real fares (₹7,485 at 15:4x, ₹6,945 at
17:13; its "Lowest price starting from ₹6,398" is ₹6,945 minus a ₹547 coupon). MakeMyTrip:
answers the in-app browser with a bare "200-OK" page (not used, not worked around).
Booking.com Goa results: real prices (₹2,800 …). Shopping: Amazon, Flipkart, Myntra (above).

### Built

`core/services.ts` (one service per sector: Uber, Cleartrip, Booking.com, each with what was
measured) + unit test; `/api/stores` also returns `services`; Super Browse shows Shopping,
Rides, Flights, Hotels, and in the app each service tile says "Log in with your number on
<name>'s own page; it stays on this phone". App: services ride in `assets/stores.json` marked
`service` — they open in the in-app browser (and Save page works there), but get no reader and
no bridge (`origins()` and the old-WebView injection skip them). `scripts/android-cdp.mjs`:
drives the app's WebViews on an emulator over DevTools (targets / eval / nav / save — save writes
the same bytes as the app's Save page), kept in the repo after the session scratchpad was wiped.

### Verified (emulator, debug build against a local Worker)

Super Browse headings `["Shopping","Rides","Flights","Hotels"]`; tapping Uber opens
`StoreActivity` on `m.uber.com/go/home`; Uber's own **Login** opens `auth.uber.com` **inside the
app**: "What's your phone number or email? … verification code by text or WhatsApp" (stopped
there; the number is the owner's). A Cleartrip results link followed from the Britto page opens
in the app too (so the Travel page's Uber/Cleartrip/Booking links use the shopper's in-app
logins). Gates: npm test 109/109 · prove 110/0 · app.mjs 30/30 · Gradle 8/8 (routing asserts
for services) · browser.mjs 72/0 (with the product the suite expects already tracked; on an
empty database its first "recently tracked" check fails by design) · the new browser check
reddens at both sizes with the Hotels section removed, restored.

### NOT done (step B)

- **Reading the fare shown** (owner's decision): Uber's fares appear only after login, so no
  Uber page exists to verify a reader against — owner item 4b. Cleartrip and Booking.com result
  pages were seen with fares but their readers are not written yet (the saved copies were lost
  with the session scratchpad; re-save with `scripts/android-cdp.mjs … save`).
- No "connected" badge: telling a login from its cookies would need each service's session
  cookie name, which needs a logged-in session to learn.

## P10 Spend Lens, 2026-11-03 (local session) — branch `p10-spend-lens`

**Asked (2026-10-29):** "then make P10 and P11". BLUEPRINT §13 + rule 5: the shopper's own
order-history pages, read and summed on the device; raw orders never uploaded; a test proves it.

### Built

- `web/spend.js` (+ `.d.ts`; plain JS so the /spend page runs it): `parseOrderDate` ("29 October
  2026", "Oct 3, 2026", "03/10/2026"; impossible days refused), `mergeOrders` (same store + order
  number replaces, never double-counts), `summarize` (total, first/last, by month, by store).
  `core/spend.ts`: the `Order` type, re-exports, `isOrder`.
- `DomRecipe.orderHistory` {verified, page, items, orderId, date, total, titles?, max?} with its
  **own** verified day; `readOrders` reads nothing unless that section is verified and the
  address matches. **No store ships one yet**: no real order page exists (it needs the
  shopper's login) — owner item 4c. Guessing Amazon's order-page markup from memory was not done.
- Shared reader: on a store page that is not a product page, a verified orderHistory rule →
  `saveOrders` → a one-line notice ("… kept for Spend Lens on this device. Nothing was uploaded").
- Extension 0.4.0: kept in `chrome.storage.local`; the popup shows the summary and "Delete".
- App 0.2.0: `BridgeCore.saveOrders` → `SpendStore` (a private file; allowBackup is off), never the
  transport, and **write-only**: no message lets a store page read orders back (a store's
  scripts must not see what was bought elsewhere). `SiteBridgeCore`, attached ONLY to the
  Britto site's origin, answers `getSpend`/`clearSpend`. `/spend` (website) sums them on the
  phone; in a browser it says it works in the app. Linked from Super Browse.

### Verified

Unit 116/116 (7 spend tests on a MADE-UP order page, labelled) · typechecks · check:readers ·
prove 111/0 (`/spend serves the app`) · Gradle 11/11 (+3: kept and NO request; a store page
cannot read back or write odd orders; the site reads/clears and nothing else) · app.mjs 30/30 ·
extension.mjs 38/38 (+6, incl. "the service worker's calls to Britto are visible to this test",
so "nothing about them went to Britto" means something) · browser.mjs 82/0 (+5 per size: totals,
**no request carries an order number or amount**, Delete, no sideways scroll). Mutants, each
caught exactly: unverified rule read · merge by number alone · impossible day · year not month ·
app uploads orders (3 red) · store page reads back · extension uploads · /spend POSTs the orders.
**On the Android 14 emulator** (local Worker): the Amazon page's real bridge kept 2 made-up
orders (`{ok:true,kept:2}`), `getSpend` from that store page was dropped, the app's /spend showed
₹2,028.27 on 2 orders, and the Worker log shows only GET /spend and /spend.js — zero POSTs.

### Found on the way

- Chrome never reported a fetch to a 404 route as finished (the Worker logged the 404 in 6 ms),
  so a page that makes one never goes "networkidle"; the no-upload check records requests when
  they START instead.
- My expected total in the first browser check was arithmetic, not product (₹2,250.27 vs the
  right ₹2,253.27).

### NOT done

- **No order page is readable yet** (owner item 4c). Categories (BLUEPRINT "by category") not
  built: no category map exists. Optional aggregate sync (`POST /api/spend/summary`) not built:
  nothing needs it, and a server copy of someone's spending is a privacy cost with no feature.
- Order pages on a real phone; the extension on a real order page.

## P5 design, 2026-11-03 (local session) — branch `p5-design`

**Asked:** "install ui ux from download folder … it is in zip file" — `Britto Mobile App Design.zip`
(Claude Design export, 10 files: v1–v4 of "Britto App" + "Britto Screens", `support.js`).
Kept in `design/` with a README; **v4 is current: 32 Android screens**.

### Decided

- **The export is the visual spec, rebuilt in `web/`** (DESIGN-BRIEF "Integration contract"):
  `support.js` runs React + Babel from unpkg, which the CSP forbids. Data still comes only
  through `web/api.js`; the push/Telegram code was kept and restyled.
- **Not built from the design, on purpose:** cashback, wallet, withdraw, payouts, spin & rewards,
  refer & earn (real money; out since 2026-10-27), phone login + OTP (owner chose no Britto account
  on 2026-10-29), the price bubble over other apps (needs Android accessibility/overlay
  permissions; Super Browse does it inside Britto). The design's example numbers ("12,480
  checked", "₹620 cashback") are not shown anywhere; every number on the site is real.

### Built

Tokens measured from v4 (primary #1F5BFF, ink #141B34, muted #6B7390, green/red/orange/yellow/
violet tints, surfaces #F4F6FB) + a navy dark theme in the same palette; Outfit + Manrope
self-hosted (`web/fonts`, OFL licences; CSP allows no Google Fonts). Shell: "b" brand mark,
search with icon, desktop nav, a 5-tab bottom bar on phones (Home, Deals, Tracker, Shop, Travel;
current tab marked). Home: blue header + hero, the overlapping "Paste a product link" card,
promo cards (Fake sale detector, Real drops, Travel), an 8-shortcut grid, a sideways row of real
drops, recently tracked. Product: card with big price, orange "Buy at ₹…" + "Price alert",
verdict cards with status icons, range pills, stat tiles. Alerts page titled "Price Tracker".
Store tiles get letter badges (no logos, as in the design). The Android app shows the site's tab
bar (the native 3-button bar is gone). The store-page panel uses the design palette.

### Found and fixed on the way

- **The live /alerts page showed the word "null"** whenever Telegram is off (it is, in
  production): the DOM's `replaceChildren` turns a `null` argument into text. All 31 calls go
  through `put()`, which skips null/false like `h()`. New check: no page shows a stray
  "null"/"undefined"/"NaN" (red on /alerts with put() not filtering).
- The link box measured 23 px tall on phones (`flex: 1` in the stacked layout overrode its
  height); now 46 px; checked (>= 44 px), red on the old CSS at 390 px only.
- Dark mode: white on the lighter orange was ~2.3:1; orange buttons get dark text in dark mode.

### Verified

browser.mjs 86/0 (1280 light, 390 dark; fonts load; no console errors; no sideways scroll) ·
npm test 116/116 · typechecks · check:readers · prove 111/0 · alerts.mjs 68/0 · extension.mjs
38/38 · app.mjs 30/30 · Gradle 11/11 · screenshots of Home, product, Tracker, Deals, Shop,
Travel, Spend Lens, Stores, Search, Grocery at 390 px against the design · the Android 14
emulator shows the design's home and tab bar.

### NOT done

- The status-bar strip in the app stays light above the blue Home header (the design runs blue
  behind the clock): needs the app to follow each page's colour.
- Screens of the design with no Britto feature yet: categories, filters, onboarding,
  notifications list, profile/settings, flight results with fares. Deals still uses selects,
  not the design's chips.

## P11 part 1, 2026-11-03/04 (local session): a catalogue, store search, drops, app alerts, the app tested live

The owner said the site was empty ("total shit") and asked for the app to work "like BuyHatke",
tested before installing it. Measured first: production held **11 products and 21 price
readings**, and search only searched those 11. So the work was data and entry points, not looks.

### Built (all on `main`, deployed)
- **Store search** (`api/listing.ts`, `/api/store-search`): Amazon.in's own search page, read by
  the server with the honest User-Agent. Checked first: amazon.in robots.txt does not disallow
  `/s?k=` or `/gp/bestsellers/` for `*` (it disallows only filtered searches). New recipe
  sections `search` / `popular` (core/recipe.ts `ListingRule`): own `verified` day, an `endsAt`
  marker (download stops at the page strip), addresses limited to the store's own hosts, a
  `brand` joined to the name. Cached 6 h in D1 (`search_cache`; the Cache API does nothing on
  workers.dev), 40 searches/network/hour. **List prices are labelled as the list's and never
  enter history** (the pen set: ₹280 on the search page, ₹265 on its own page).
- **Catalogue**: the first scheduled run of each hour reads one of 13 Amazon best-seller lists
  and adds up to 30 products WITHOUT a price (the list shows "1 offer from ₹18,99900": a lowest
  offer, paise glued on); later runs read each product's own page. Cron every 3 min; cap 650.
- **Drops** (`drops` table, `/api/drops`): "was ₹X, now ₹Y" from the reading before, both in
  stock; a rise or a sell-out ends it, an M.R.P.-only change does not.
- **Site**: search page (Amazon results + one tap to every other store's own search), quick
  searches and "Price dropped" on Home, "Check other stores" on product pages, 400 px Amazon
  thumbnails, the sale check says when it will be ready ("ready around 11 Nov").
- **App alerts as notifications, no push service**: the site (in the app) hands its device
  token over the site-only bridge; `AlertJob` (JobScheduler, 15 min + on open) asks
  `/api/me` and shows each firing not shown yet (`AlertWatch`). Tapping opens the product.
- **App download**: `/app` page; `scripts/publish-apk.mjs` builds, signs with the release key
  in `~/.britto/` (refuses any other signer) and writes `web/download/britto.json`.
- **Icons**: the design's white b on #1F5BFF everywhere, Android adaptive icon included.

### Bugs found by testing for real (each fixed)
1. **The app crashed when an alert was set**: Android 14 refuses a job that waits for a network
   without ACCESS_NETWORK_STATE (SecurityException, found on the emulator).
2. **Flipkart products opened from search could not be read** (live, in the app): Flipkart
   changes the address with pushState and keeps the SEARCH page's data (an ItemList, no Product
   JSON-LD). The same address loaded directly read ₹1,849. The shared reader now loads such a
   page once for real (once per product per tab: a store that rewrites its address on every
   load cannot loop; the first guard, by address, could have, and a test proved it). Verified
   after: Flipkart search → "Cello Gripper 30" read ₹262 in the app.
3. **The APK was never published**: `.gitignore`'s `*.apk` silently kept
   `web/download/britto.apk` out of git; live answered 404 while britto.json described it.
   `prove` now downloads it and compares size and SHA-256 (it was red against production).
4. **GitHub runs #69/#70 failed** on my new live check, not on the site: it sent a made-up
   `CF-Connecting-IP` header, which Cloudflare refuses from outside (403, error 1000). Local only now.
5. The keyboard stayed over search results in the app; the in-app alert box showed the
   website's Telegram text; the download page said Android 8 (minSdk is 29 = Android 10) and
   at first claimed app notifications before they existed. All corrected.

### Measured
- Production after one night: **308 products, 196 priced** (from 11). 70 "unrecognised" are
  honest non-reads: Amazon redirects some best-seller ids to another product (identity check
  refuses it), and some pages have "No featured offers" (only third-party sellers, no price
  to pay). 0 drops yet: prices had not changed since their first read.
- Amazon answers store search from Cloudflare (live: 16–24 results, ~2 s). `wrangler tail`:
  cpuTime 470 ms and 94 ms for two searches, outcome ok (no CPU-limit errors).
- Alert notifications end to end on the Android 14 emulator against a LOCAL Worker: a real
  Amazon read (₹280) crossed a ₹300 target the throwaway database had been set up to cross;
  the notification appeared ("Price alert … at or below your target of ₹300"); tapping it
  opened the product; a second check showed nothing new.
- The release app (0.3.1) against PRODUCTION on the emulator: Home, search "earbuds" (16
  results), a result → product page (server read ₹1,849), "Check other stores" → Flipkart's
  search inside the app (₹1,849 there too), Flipkart product → panel read, Amazon product via
  Share → panel ₹1,199 (M.R.P. ₹6,999), Amazon sign-in page (+91 number field), Uber sign-in;
  the owner logged in to Uber, and Uber's fare screen (Connaught Place → DEL T3: Go Sedan
  ₹366.18 … Black ₹699.10) was saved with Save page. Nothing was booked.
- **An Uber code was sent by my test**: the emulator's Android autofill had kept a number from
  an earlier session and Uber submitted it on its own; it was the owner's number (they confirmed
  and logged in). Lesson: on a test phone, never tap into a login field that autofill fills.

### Gates (final code)
`npm test` 123 · typecheck both configs · check:readers (5 list pages added) · prove 129/0 local
(real amazon.in) and **69/0 live** · browser.mjs 98/0 · extension.mjs 38/0 · app.mjs 32/0 ·
Java unit tests 16/16. **Proved able to fail**: 14 new breakages, each reddening exactly its
checks (list reader ×3 + Amazon search recipe, drops ×1, search limit ×1, unread products ×1,
AlertWatch ×3, reader reload ×2; 2 browser breakages by hand). Two tests were too weak at
first and were fixed (a sample Flipkart link with no "/dp/"; a skip that hid a wrong link).

### NOT verified / not done
- A real phone (only the emulator). App notifications against PRODUCTION (only locally:
  a live alert fires when a watched product's price crosses, at most every 3 h).
- Uber fares are saved but **not read yet**: Uber is a "service", not a store, in the reader
  system, so reading it needs its own small schema step (next session). Ola/Rapido: none.
- Myntra/Nykaa search links: headless Chrome is refused by both, so marked unchecked.
- Flights/hotels still show no fares (no permitted free source; unchanged since P9).
- The app's status bar stays light grey above the blue Home header.
- Appetize upload: waiting for the owner to log in to Appetize again (item 13).

## P11 part 2a, 2026-11-04 (local session): fare compare on the phone — flights and rides

**Asked:** "does every feature match BuyHatke … did you add MakeMyTrip, Skyscanner and Rapido …
BuyHatke's speciality: it compares prices and shows you" + a 2 min 38 s screen recording of the
BuyHatke app (`~/Downloads/WhatsApp Video 2026-11-04 at 10.00.09.mp4`, watched as 53 frames, one
every 3 s): Home (search or paste a link, camera, mic; Ride / Flight / Hotel / Grocery / Food
Compare, Gift Card), **Ride compare** (pickup + drop, map, All/Bike/Auto/Cab, Smart Pickup,
"Connect" Namma Yatri / Uber / Rapido / Ola / Bharat Taxi / RedTaxi: the list stays empty until
apps are connected), **Flight compare** (one-way / round / multi-city, a fare strip by date,
Cheapest / Fastest / Best, price alert, "Checking … 26 of 47 airlines · 12 booking sites", per
flight "More booking options": Agoda, Cleartrip, MakeMyTrip, ixigo, Goibibo, Paytm Travel,
TeaFlight), **Food compare** (address, connect Swiggy-style apps + Domino's / McDonald's / KFC,
"Your app logins stay on this phone"), Explore (Product Lens, Spend Lens, Super Browse, Refer &
Win, Verified Deals, Gift Cards).

### Measured first (inside the Britto app: a debug build `app.britto.dev`, Android 14 emulator, the owner's home network in India, driven over DevTools)
- **MakeMyTrip** (the old one-way link, unchanged): results with fares (16-19 flights). The
  bare "200-OK" page of 2026-10-29 did not come back.
- **ixigo**: results with fares (6 at 15 s, 40 at 30 s: the list keeps growing).
- **Goibibo** (MakeMyTrip's link format on goibibo.com, a guess that was then seen working).
- **EaseMyTrip** (`flight.easemytrip.com/FlightList/Index?srch=DEL-…|BOM-…|dd/mm/yyyy…`): fares,
  but its page is **8.8 MB** (168 cards, each ~58 KB of hidden fare details).
- **Skyscanner**: "Are you a person or a robot?" (press and hold, PerimeterX). Not worked around.
- **Cleartrip**: fares at 10:19 (IndiGo 03:30 → 05:55 ₹7,427 on screen); after several test
  loads its `flight/search/v2` answered **403** to this phone. Not worked around; no recipe.
- **Uber**: logged out = "Plan your Uber journey Login" (product page) or "Uber Login Loading"
  (`/go/home`, read twice via DevTools; that screen was never saved whole: the emulator froze).
  Logged in (the owner's login of 2026-11-04 in the release app): every ride with its fare.
- **Rapido**: `m.rapido.bike` is Rapido's own web app (the one inside Flipkart's app); it asks
  for a mobile number and an SMS code. Its fare page has not been seen. No number was entered.
- **Ola**: `book.olacabs.com` loads with no text in the app (as on 2026-10-29).
- Sites mix nearby airports into a city: Hindon (HDO, "Ghaziabad") for Delhi, Navi Mumbai
  (NMI) for Mumbai. The cheapest DEL→BOM flight of 20 Nov was from Hindon.

### Built
- `core/fares.ts`: fare recipes (data) + `readFares` (statuses fares / check / login / waiting
  / other_page; prices under ₹10 dropped) + `checkFareRecipe`. Same selector engine and
  `fieldValue` as every product reader.
- `web/fares.json`: recipes for ixigo, MakeMyTrip, Goibibo, EaseMyTrip (flights) and Uber
  (rides), each `verified: 2026-11-04`. Served with the site: a site that changes its page is
  fixed without a new app.
- `web/compare.js`: `groupFlights` (one flight = airline + departure + arrival minutes; each
  site's lowest fare; cheapest first), `otherAirport`, `siteSummary`, `flightName`, `clock`.
- App: `FareJob` (rules: ≤ 2 sites at once, ≤ 10 sites, https + a known travel host only; a
  site is done after 3 equal readings and 15 s, or at 45 s; a load error ends only a site that
  showed nothing — results pages raise errors for their own redirects, measured: that ended
  all four sites early in the first run), `FareRunner` (hidden WebViews UNDER the Britto page,
  the phone's own WebView, Super Browse's cookies, no bridge or reader; never follows a link to
  another app; nothing is clicked or typed), `android/js/fares.ts` → `assets/britto-fares.js`
  (25 KB; reads only the fare cards when there are any, so EaseMyTrip's 8.8 MB is not re-read).
  Site bridge: `compareFares` / `compareStatus` / `compareStop`, and `places` (the phone's own
  Geocoder, limited to India, no location permission). Debug builds are now `app.britto.dev`
  (install beside the signed app without touching its logins).
- Site: Travel → Flights in the app = "Compare fares" (per site: cheapest + Open; per flight:
  every site's fare, cheapest highlighted, other airports flagged); Travel → Rides (app only):
  pickup + drop → Uber's rides with fares (after login) + "Open Rapido". In a browser: links, and
  the page says fares are read in the Android app. Links: Goibibo and EaseMyTrip added;
  MakeMyTrip/ixigo/Goibibo/EaseMyTrip marked "checked in the Britto app".
- Services: + MakeMyTrip, ixigo, Goibibo, EaseMyTrip, Skyscanner (flights), Rapido (rides).
- App 0.4.0 (versionCode 5), signed with the `~/.britto` key, published at /download.

### Verified (this session, final code unless said)
- **In the app (debug build against a local copy of the site), DEL→BOM 20 Nov:** all four
  sites read in ~32 s: ixigo from ₹7,116 (6), EaseMyTrip ₹7,116 (40), MakeMyTrip ₹7,122 (19),
  Goibibo ₹7,279 (18); 40 flights grouped, e.g. IndiGo 6E 5175 12:55 HDO → 14:55 BOM:
  EaseMyTrip ₹7,116 · ixigo ₹7,116 · MakeMyTrip ₹7,201 · Goibibo ₹7,326 (screenshots).
- Ride compare in the debug app: places found by the phone ("Connaught Place, New Delhi 110001",
  "IGI Airport Terminal 3, Delhi 110037"); Uber opened with the trip; logged out it ended as
  "showed no fares" (the `/go/home` login text was then added as a marker; see NOT verified).
- Gates: `npm test` 132/132 (134 after the live fixes) · typecheck (both) · check:readers clean (fare pages excluded: they
  are fare recipes' pages) · Gradle unit tests 22/22 (FareJob 6 new) · app.mjs 32/0 (with
  `PW_DIR`) · browser.mjs 100/0 local (schema + the Cello product first, as before) · prove
  129/0 (real amazon.in).
- **Proved able to fail:** 9 new breakages each reddened exactly their checks (MakeMyTrip price
  block, person check ignored, page address ignored, airline spelling, city as airport, dearer
  fare kept, all sites at once, settle without agreement, any load error ends a site); two were
  not caught at first and the tests were made stronger (a site listing one flight twice; a
  city-name-only airport). A browser breakage (ride compare shown in a browser) reddened its
  check at both sizes, restored.

### Verified LIVE (release 0.4.0 installed OVER 0.3.1 on the emulator — same key, data and the owner's Uber login kept — against https://britto.amitynoidalibrary.workers.dev after the deploy of `96a9437`)
- The live site serves `/fares.json` (5 recipes), `/compare.js`, 9 services in `/api/stores`,
  and the 0.4.0 APK (282,857 bytes, sha256 c258da1a…, matching britto.json). `prove --live`
  69/0.
- **Ride compare, Connaught Place → India Gate: "Uber 16 rides from ₹52.44"** (Bike Saver
  ₹52.44, Bike ₹59.18, Auto ₹91.06 …) read from the owner's logged-in Uber in the app
  (screenshots). Nothing on Uber's page was touched.
- **Connaught Place → IGI Airport T3: Uber asked "Which airline?"** (seen on screen through
  "Open Uber") before any fare, so the compare said "no fares". Fixed on the site (no new app
  needed: recipes and page are served): a new status `ask` ("asks a question before its fares
  … Britto never answers for you"), recipe marker "which airline?". Uber also lists parcel
  delivery ("Parcel Bike", "Parcel Scooter") among its rides: now left out (`rideRows`).
  Tests: 11 fare tests (the airline-question page is built from the on-screen words, not a
  saved page: it belongs to the owner's account); 2 more breakages caught (11 new in all).

### NOT verified / not done
- **The airline-question status, live**: after the fix went live (11:42 IST) the same airport
  trip in the release app still ended "showed no fares": the hidden Uber page answered only 3
  readings in 45 s on the overloaded emulator (log), so the question had probably not appeared
  yet. Not seen working live; check on a real phone.
- **Airport rides on Uber**: the airline question is now reported, not answered. Mapping an
  airport drop to the points Uber was seen to accept (web/rides.json) might skip it: not
  measured, not built.
- **Rapido fares**: not read (login, then its fare page must be saved: owner item 15). Ola: blank
  web page. Namma Yatri / Bharat Taxi / RedTaxi: no web booking measured.
- **Cleartrip** (403 after repeated tests), **Skyscanner** (person check): links only.
- Round trip / multi-city / other cabins: links only (only one-way economy was seen working).
- Hotels, grocery, food: no fares read (hotels: links; grocery: P7 partial; food: nothing).
- A real phone (only the emulator, which froze several times on this 8 GB Mac).
- The saved Uber page in `~/.britto/pages/` (2026-11-04 09:32) holds a destination from the
  owner's Uber account (Amity University Gate 4): it stays on the Mac; only its ride list is in
  the repo (`test/fixtures/fares-uber-cp-del-t3-2026-11-04-list.html`).

## P11 part 2b, 2026-11-04 (local session): fare strip, round trip, hotels, fare alerts, status bar, link previews, abuse review

**Asked:** "build the remaining things" (PLAN: P11 part 2b). Rapido stays blocked on the owner's
saved fare page (owner item 15).

### Measured first
- **The sites' own date strips are already in the pages saved on 2026-11-04.** MakeMyTrip and
  Goibibo: one layout (`div.flexiitemCal`, the searched day `flexiCalActive`, 15 days 10-24
  Nov; a `p.loaderBox.flexiitemCal` placeholder sits among them). ixigo: 31 days (Thu 05 Nov to
  Sat 05 Dec) printed as "Fri, 20" with no month, so "05" appears twice; the searched day has
  `border-subbrand-500`. **A strip figure is not a fare from the list:** MakeMyTrip's strip
  said ₹7,116 for 20 Nov while its list started at ₹7,016.
- **Hotels in the app (debug build, Goa 20-22 Nov, 2 adults), one load each:** Booking.com 30
  hotels, "Price for 2 nights" (the whole stay), current price in
  `[data-testid=price-and-discounted-price]`, taxes separate. Cleartrip 5 hotels (it draws
  only what is on screen), price per night ("+ ₹3,311 taxes & fees / night"; page data
  `"price":18393` for the first). **MakeMyTrip hotels with a city name and no city code: a
  bare "200-OK" page**, so it stays a front-page link. No hotel was on both sites' lists.

### Built
- `core/fares.ts`: `strip` in a recipe (entries, printed day, price, the searched day's
  marker); `readStrip` dates each entry from the searched day by its position and requires every
  printed weekday, month and day to fit, else no strip at all (`dayFits`). Hotels: `area`
  field and `per: 'night' | 'stay'` (required for hotels, refused elsewhere).
- `web/fares.json`: strips for ixigo, MakeMyTrip, Goibibo; hotel recipes for Booking.com
  (per stay) and Cleartrip (per night; the price is the amount just before its tax line).
- `web/compare.js`: `fareStrip` (lowest per day across sites), `tripTotal` (two one-way
  tickets), `hotelKey` + `groupHotels` (per night; the same hotel merged only on an identical
  word set, filler words dropped).
- App: the reader gets the searched day and the strip entries beside the cards; `FareJob`
  accepts a `date` only as a real `YYYY-MM-DD` and counts the strip in "still changing";
  `FareRunner` works with no screen (laid out at the phone's size) and says when a compare is
  done; reader errors are logged instead of passing for "no fares".
  **Fare alerts:** `FareWatches` (on the phone only; ≤ 3 routes; same route and day replaces;
  alert when ≥ ₹100 and ≥ 1% below the lowest seen; past days dropped) + `FareAlertJob` (every
  6 h with a network: today's recipes from /fares.json, each route compared again with no
  screen, notification "Flight fare dropped" that opens Travel). **Status bar:** the page
  reports its top bar's and tab bar's colours (`bars`); the app paints a strip behind the
  status bar and sets light or dark icons. Bridge: `bars`, `watchFare`, `fareWatches`,
  `unwatchFare`. Version 0.5.0 (6).
- Site (app): the merged strip under "Cheapest found" (tap a day = compare it); round trip =
  onward compare, then return compare, then "Cheapest round trip found, as two one-way
  tickets" + the sites' round-trip links; "Alert me if it gets cheaper than ₹X"; Fare alerts
  list on Travel (Compare now, Stop); Hotels → "Compare hotels" (per night, "₹900/night
  (₹1,800 for 2 nights)"). **`siteBridge()` is now one shared sender:** each call used to
  replace the bridge's reply handler, so a second user (bars, alerts) would have hung a running
  compare.
- **Link previews** (`api/meta.ts`): the Worker writes a page's own title, description and
  Open Graph tags into the shell; a product link gets its name, price now, usual price and
  picture (https only), all escaped.
- **Abuse review** (`ABUSE.md`): short links now limited (30 an hour per network or chat)
  BEFORE they are followed (they were followed before the add limit was checked: unlimited
  requests to Amazon from one network); product views count once per network per product per
  hour ("popular" is ordered by views, so a script could put any product on the home page).
- README: a case-study section and the Travel section rewritten (it still said no fares).

### Verified (this session)
- `npm test` 141/141 · typecheck (both) · check:readers clean · Android unit tests 30/30 ·
  `app.mjs` 32/0 (against the 0.5.0 release APK) · `browser.mjs` 100/0 (local) · `prove`
  133/0 (incl. the short-link limit, views once per network, a shared product link's own
  title and tags, /travel's title).
- **21 new mutants, each red on exactly its checks:** 3 strip, 2 compare (strip, round-trip
  total), 4 hotels, 6 Android (alert drop rule, three routes, searched day, strip settling,
  today's recipes, bar colours), 2 link previews, 2 abuse (through prove). One survived first
  ("$&" in a title): the test then found the escaped title in og:title and missed the broken
  `<title>`; the test now checks the `<title>` element. The full 109-mutant run was NOT
  repeated this session.
- **In the app (debug build `app.britto.dev`, Android 14 emulator, the owner's home network):**
  - Status bar: blue behind the clock with white icons above the blue Home header, white with
    dark icons on Travel; the strip behind the navigation bar white like the tab bar
    (screenshots).
  - Round trip DEL⇄BOM 20/23 Nov, 95 s: "Cheapest round trip found, as two one-way tickets
    ₹14,220" = ₹7,217 onward + ₹7,003 return (ixigo both ways); each leg's strip had 31 days
    read live from ixigo with the searched day marked (20 Nov, 23 Nov).
  - Fare alert: "Alert me if it gets cheaper than ₹7,217" → "Fare alert set …"; Travel lists
    it. With the stored lowest raised to ₹8,000 by hand and the app sent to the background,
    `cmd jobscheduler run -f app.britto.dev 4202` compared again **with no screen** in 45 s and
    Android showed **"Flight fare dropped — DEL → BOM, Fri 20 Nov: ₹7,217 on ixigo, down from
    ₹8,000."**; the stored lowest became ₹7,217.
  - Hotels, Goa 20-22 Nov: Booking.com 30 hotels from ₹900/night (₹1,800 for 2 nights),
    Cleartrip 2 hotels (5 earlier the same day) from ₹9,788/night, merged per night.
  - One-way DEL→BOM 20 Nov after the emulator restart: EaseMyTrip 40 fares and ixigo 6, both
    from ₹7,217; strip 31 days.
- Release 0.5.0 (294,189 bytes, sha256 26df6c3f…, the same certificate fbf25e7d… as 0.4.0)
  installed over 0.4.0 on the emulator with its first-install date (= data) kept.

### Verified LIVE (production, after the push of `00f2f5d`, live at 16:11 IST)
- The site serves app 0.5.0: the downloaded `/download/britto.apk` is 294,189 bytes with
  sha256 26df6c3f… (= `britto.json`); `/fares.json` carries the hotel recipes.
- `prove --live` 71/0 (69 before + a shared product link's own title/tags and /travel's).
- A shared product link on production: `<title>Cello Butterflow Simply Ball Pen Set | … |
  Britto</title>`, og:description "₹280 now on Amazon.in. …", og:image from m.media-amazon.com;
  the page keeps its CSP and nosniff headers.
- The release 0.5.0 app on the emulator, on the live site: Travel shows the new wording and a
  white status bar with dark icons over its white header.

### NOT verified
- **MakeMyTrip and Goibibo stopped answering this emulator in the afternoon** (after ~6 test
  searches each that day): MakeMyTrip a bare "200-OK" page (169 characters, seen in Super
  Browse too), Goibibo `ERR_HTTP2_PROTOCOL_ERROR` three times. Not worked around. Their strips
  are verified on the saved pages only; their fares were read live in the morning (P11 2a).
- The emulator's DNS failed after a cold boot (Booking.com, EaseMyTrip: ERR_NAME_NOT_RESOLVED
  in every browser in the app); restarting the emulator with `-dns-server 1.1.1.1,8.8.8.8`
  fixed it. A test-machine problem; not seen on phones.
- A fare alert on a real phone over days (Android may run the 6-hour job later than asked);
  the job was forced once on the emulator.
- Round trips use two one-way searches; the sites' own round-trip pages (sometimes cheaper)
  are linked, not read. Hotel compare reads only the first hotels each site draws.
- Link previews as WhatsApp/Telegram actually render them (the tags are checked, not the apps).
- A real phone (owner items 4 and 16).

## P11 part 3 (first part), 2026-11-04 (local session): Rapido read in the app, app 0.6.0

The owner asked: "BUILD left things and provide me modapk that i send over whatsapp, with rapido
and other thing working". "Mod APK" here = Britto's own signed app file to send on WhatsApp
(not a modified copy of anyone else's app).

**Rapido.** Its web app (m.rapido.bike) asks for a number and SMS code, and its trip is TYPED on
its own page: the address stays `/home`, so Britto cannot open it with the trip as it opens Uber
(measured). The owner logged in on the test phone (asked twice: their first "done" was before a
trip was entered; the boxes were still empty) and then allowed the session to type the trip
("You type the places": only the two place boxes and Rapido's own suggestion list were touched,
never Book). Rapido then showed Auto ₹162, Cab Economy ₹376, Cab Premium ₹488, Cab XL ₹788,
Parcel ₹98 (16:2x IST; ₹166/₹284/₹353/₹570/₹92 at 17:07 on the second run). The page is kept
outside the repo (`~/.britto/pages/rapido-fares-…`: it holds the account's name and number);
`test/fixtures/fares-rapido-amity-sector18-2026-11-04-list.html` is the ride list only (and the
logged-out Uber list page has its anonymous session id blanked),
checked for the name and a phone number before writing.
- `web/fares.json` `rapido:ride`: cards `div.card-wrap`, name from the icon's alt text, the
  price only when the card shows ONE price (or one marked `.price-after-discount`): a card with
  two unmarked prices is not guessed at. Parcel (a delivery) is left out by the recipe, so it is
  never "the cheapest ride" (the first device run said "from ₹92": that was Parcel).
- New recipe key `places` (rides only): the boxes holding pickup and drop. Only the app reads
  what they hold (a saved page keeps no typed text), so the Britto page can say which trip the
  prices are for: "Gate no. 3, Amity Rd → Noida Sec-18, Captain Vijyant Thapar Marg. Check it is
  the same trip."
- The flow: Travel → Rides → Compare rides → **Open Rapido** (bridge `readRide`, only a
  `ride` recipe of that site on https) → the in-app browser reads Rapido's page every 2 s with the
  same fare reader as a compare and shows a blue bar ("Britto read 4 Rapido prices, from ₹166")
  → the newest reading is kept IN MEMORY for 15 minutes (`RideReadings`) → the Britto page asks
  every 3 s (`rideReading`) and merges Rapido's rides into the ride list.
- **Bug found on the device and fixed**: in the app the reader gets the fare CARDS alone, so a
  logged-out Uber (it lists ride types with no prices and a "Login" button, measured) read as
  "showed no fares" after 45 s instead of "log in": the words saying why are outside the cards.
  The app reader now also reads the start of the page's visible text when the cards show no
  fare. Same device afterwards: "Uber shows fares only after you log in" in 21 s.
- **Rule added**: a recipe's card selector must be one part (no space or `>`), because the app
  reads the cards without their page; the first Rapido recipe (`.fare-estimate-wrapper
  .card-wrap`) would have read nothing in the app while every test passed. `checkFareRecipe`
  now refuses that.
- New `scripts/fares-reader.mjs`: the app's reader (built exactly as the app's
  `britto-fares.js`) in real Chrome on saved pages served at their own address with their
  scripts off (5 checks). It is what caught the two problems above as tests.
- "Send Britto to a friend" on the app's Get the app page: Android's share sheet (WhatsApp…)
  with the download link (bridge `shareApp`, at most 500 characters).

**Verified (local, this session):**
- `npm test` 143/143 · typecheck both configs · `check:readers` · `scripts/fares-reader.mjs` 5/5 ·
  Android unit tests 33/33 (new `RideReadingsTest` 3) · `scripts/app.mjs` 32/32 (release APK
  0.6.0) · `npm run prove` 133/133 (real Worker, real amazon.in).
- Every new check proved able to fail: 7 new mutants (116 in all), each caught exactly (run one
  by one: Rapido two-price card, two-part card selector, app reader without the page words,
  one trip box read, readings kept too long, flight recipe opened as a ride, share text
  unchecked); plus by hand: the Parcel rule, Uber's new login words, the 15-minute limit.
- On the test phone (debug build 0.6.0-dev, Android 14 emulator, local site): Compare rides →
  Uber "log in" (the test phone's Uber login had expired) → Open Rapido → blue bar → trip typed
  → bar "Britto read 5 Rapido prices, from ₹92" (before the Parcel fix) → back to Britto: "Rapido
  4 rides from ₹166 · read at 5:08 pm", Auto ₹166, Cab Economy ₹284, Cab Premium ₹353, Cab XL
  ₹570, and the trip line (screenshots). The reading survived a reload of the Britto page.
- Release `web/download/britto.apk` 0.6.0 (7): 298,221 bytes, sha256 1fbf81f7…, signed by the
  same certificate fbf25e7d… as 0.4.0/0.5.0 (installs over them).

**Verified LIVE** (17:18 IST, after GitHub deployed f785d5e): `/download/britto.json` says
0.6.0 and the live `/download/britto.apk` has sha256 1fbf81f7… (same bytes as
`~/Downloads/Britto-0.6.0.apk`); the live `/fares.json` has the Rapido recipe and `/app.js` the
Rapido and share code; `prove --live` 71/71.

**NOT verified:**
- The Parcel fix and the trip-line layout were checked on the device through the page (served
  by the local site); the blue bar's text after the Parcel fix was not re-read on the device.
- "Send Britto to a friend" opening WhatsApp's share sheet on a phone (unit-tested only).
- Rapido on a real phone; a Rapido card with a discount (its markup was not seen: such a card
  is skipped unless one price is marked as the price after the discount).
- MakeMyTrip/Goibibo were not re-checked (the test phone ran out of memory and was restarted
  twice; the 8 GB Mac swapped ~10 GB). Uber on the test phone needs a fresh login.
- Photo search (Workers AI, allowed today by the owner) is not built: P11 part 4.

## P11 part 3 (second part), 2026-11-04 (local session): Rapido filled in like Uber, app 0.6.1

The owner: "make rapido work same as uber in my brito---do it now", then "without breaking
anything". Rapido's address holds no trip (measured), so "like Uber" means the app enters the
trip on Rapido's own page as a person would. New recipe entry `fill` (rides only): Rapido's
pickup/drop boxes, the search box each opens, and its suggestion list
(`div.location-item`). `android/js/fill.ts` takes ONE step per reading (every 1.5 s): tap the
pickup box → type what the shopper typed into Britto → wait for Rapido's suggestions → tap the
one naming most of the place's words (at least half; ties keep Rapido's order) → the same for
the drop → "done", then the ride list is read. The step goes back to the app (FareJob keeps it,
only steps it knows) and returns with the next reading; nothing is stored on Rapido's page.
Fares count only after "done" (a page can show an earlier trip). Anything that is or sits in a
button/link, or says book/confirm/request/pay, is refused and Britto stops ("did not list the
same place… open it and enter the trip there"); "Open Rapido" (read while you look) stays as the
fallback, and a fresh manual reading fills in when the automatic one found no fares.

**Verified:**
- On the REAL Rapido page (test phone, the owner's login from earlier today, debug 0.6.1-dev,
  local site): a Rapido-only compare went pickup-open → pickup-typed → drop-open → drop-typed →
  done → fares in 19.5 s: Auto ₹171, Cab Economy ₹160, Cab Premium ₹196, Cab XL ₹308, trip
  "Gate no. 3, Amity Rd → Noida Sec-18" (17:45 IST). Then Britto's own Compare rides (Uber and
  Rapido together): "Rapido 4 rides from ₹160" with the trip line, Uber "log in" (the test
  phone's Uber login has expired) (screenshot).
- `scripts/fares-reader.mjs` 13/13 in real Chrome, 8 new on a stand-in page with Rapido's real
  placeholders, real ride cards, suggestions that appear only after a key is released, and a
  Book button that counts presses: filled like a person; the best-matching (not the first)
  suggestion picked; trip read back; Book pressed 0 times; no matching place → stops; a
  matching suggestion inside a button never tapped; an earlier trip's fares not taken; without
  a trip nothing is filled.
- `npm test` 143 · typecheck (android/js included) · check:readers · Android 34/34 (FareJobTest
  trip rules: too long, control character, not text, no drop, not an object; unknown steps not
  kept) · app.mjs 32/32 · prove 133/133. 4 new mutants (120 in all), each caught exactly
  (two first reddened more checks than listed: those checks rely on the same rule, so the lists
  were widened, not the code changed).
- Release 0.6.1 (8): 299,905 bytes, sha256 a20f957b…, same certificate fbf25e7d….
- **Verified LIVE** (after GitHub deployed a34badf): `/download/britto.json` 0.6.1, the live APK's
  sha256 a20f957b… (= `~/Downloads/Britto-0.6.1.apk`), the live `/fares.json` has Rapido's
  `fill`, `prove --live` 71/71.

**NOT verified:**
- On a real phone. Uber and Rapido logged in at the same time (the test phone's Uber login
  expired). The full 120-mutant run (the new ones were run one by one).
- The test phone crashed three times while Rapido's map drew (emulator graphics; it held with
  `-gpu swiftshader_indirect`) and the Mac swapped 7-10 GB: Uber and Rapido together were run
  once. The phone's place search failed right after each restart ("no such place found") and
  worked on the second try: an emulator start-up delay, not seen on a phone yet.


## UI uplift + cabs like the design, 2026-11-05 (app 0.7.0)

**Asked (owner):** "uplift the whole UI UX of the app" with Claude Design, and make it work "at
the level of how BuyHatke works", e.g. Rapido prices beside Uber's. Mid-session: the laptop hung
on the emulator ("use any online emulator").

**Design:** Claude Design canvas https://claude.ai/artifact/NRNHzmm1rbYqhJLbh6f9W6 (private to
the owner): the original "Britto Mobile App Design" v4 (32 screens, from `design/`, the
standalone project itself cannot be opened from a session) plus 6 new phone screens: Home, Product,
Travel → Cabs, Cab results (Uber + Rapido in one list), Flights results, Tracker. Their figures
are real: products and drops from production (4 Nov), flights from the four saved DEL→BOM pages,
ride rows from the two saved ride pages (Uber CP→T3 and Rapido Amity→Sector 18 are DIFFERENT
trips, shown together only as sample data in the design).

**Built (web, live):**
- Travel = three tabs (Cabs / Flights / Hotels, kept in the address `/travel#cabs` and on the
  device); Cabs opens first in the app, Flights in a browser.
- Cabs (app): a trip card (pickup, drop, swap), the phone's own place suggestions as you type
  (Geocoder, 400 ms after typing stops), "Use my current location" (app 0.7.0+, see below), the
  ride apps' state from the last compare (`britto.rideApps`, on the device), recent trips (3,
  on the device only).
- Cab results: the cheapest ride first (dark card, how much less than the other app's
  cheapest, "Book it in …"), kind chips (Bike / Auto / Cab / Premium / XL, only kinds present),
  one list with each app's badge and pickup time. Same `data-*` hooks as before.
- Home: Cabs shortcut, an "Uber and Rapido, one list" card (no fares on it: a stale fare on the
  home page would mislead); Stores dropped from the shortcuts (still in the desktop nav).
- Product page: the price history right under the verdict, then numbers, alert, other stores,
  offers.
- Greys: `--muted` #586079 (was #6B7390, 4.3:1 on the page background), `--subtle` #6E7691.

**Built (app 0.7.0, versionCode 9):** the `here` bridge message (`SiteBridgeCore.Here`,
`MainActivity.findHere`): Android's location permission asked only when the shopper taps, one
fresh fix (fused / GPS / network, 15 s), else a fix under 10 minutes old, then the Geocoder's
address. The place goes into the ride apps' pages on the phone, never to Britto's server. Ride to
the airport uses it too. Pages read the app version from the User-Agent: apps before 0.7.0 get no
location button and the old message; a 90 s limit covers an app that never answers.
`ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` added (scripts/app.mjs pins them, argued in
its comment).

**Online emulator:** `.github/workflows/phone.yml` + `scripts/phone-ci.mjs`: GitHub's Linux
machine boots an Android 14 Google Play emulator (KVM), a local `wrangler dev` serves the site,
the debug app opens it, and the script drives Travel → Cabs like a person (permission dialog
answered by its own id, the phone's suggestion picked, Compare cabs), screenshots + results to
the run's artifact AND to the `phone-ci-results` branch (no GitHub CLI on the Mac:
`git fetch origin phone-ci-results`). Runs on pushes touching android/, web/ or itself, and by
hand. First run: the script ended before writing results (`pidof` exits 1 before the app has
started); fixed, and every stage is now logged.

**Measured:** Ola's booking page (book.olacabs.com) still renders nothing in a phone-size Chrome
after 6 s (5 Nov), so Ola stays a link.
