# Britto (formerly Daam): development record

Renamed from Daam to Britto on 2026-10-27 at the owner's request (S3). Entries below S3 keep
the old name and addresses as they were at the time.

## Waiting for the owner

Things only the owner can do, in plain English with the exact steps. Each later session adds
to this list and removes what is done.

0. **Production deploys are stuck since 2026-10-29** (5 minutes). The push of `e09e1f4`
   (and later) did not reach the live site, and a deploy from the Mac fails with Cloudflare
   API error 10013 at "assets-upload-session". Please open GitHub → the britto repository →
   **Actions** → the newest run on `main`, and tell the next session which step is red and
   its last lines (or "no run started"). If the run is green but the site is old, run
   `npx wrangler login` once in a terminal in `britto/` (it opens the browser; approve), so a
   session can deploy from the Mac again. Until then the live site runs P3–P9 without the phone
   readers.
1. **Reload the Britto extension** (P3 is on `main` since 2026-10-27): open `chrome://extensions` (or
   `brave://extensions`), find Britto, press the round reload arrow. Then open any Amazon.in
   product: the panel should appear as before. The version under the popup's "Open Britto"
   link should say v0.3.0. (Your old copy keeps working until you do this.)
2. **Switch on the Telegram bot** (from S3, about 3 minutes): README "Switch on the Telegram
   bot". Then tell the next session "bot token is set" so it runs one live Telegram check.
3. **Save one real Flipkart product page** (from S2): open any Flipkart product in Chrome with
   the extension, press "Save this page for Britto" in the panel, and put the downloaded
   `britto-page-flipkart-….html` file into the `britto/test/fixtures/` folder (or attach it
   to the next session). That lets a session check and switch on the Flipkart reader.
4. **Try the Android app on your phone** (10 minutes): it now works on an Android 14
   emulator (2026-10-29: Amazon, Flipkart and Myntra prices read from the page once the
   phone readers are live, Back, Share → Britto, Save page, dark mode). A real phone is still
   the final check: download the APK (GitHub → Actions → newest run → Artifacts →
   `britto-apk`), install, open Britto → Shop → a store → any product, and tell the next
   session what the Britto panel said. Uninstall an older Britto first (different signing keys
   until item 6 is done).
5. ~~Save three phone pages~~ (done 2026-10-29 in the emulator: 4 Amazon, 3 Flipkart, 2 Myntra
   pages, each saved with the app's own Save page).
6. **A signing key for the app** (5 minutes, once): on your Mac run
   `keytool -genkeypair -keystore britto-release.keystore -alias britto -keyalg RSA -keysize 3072 -validity 10000`
   (pick a strong password; keep the file and password safe, never in the repo). Then on
   GitHub → Settings → Secrets and variables → Actions add `ANDROID_KEYSTORE_B64` (the output
   of `base64 -i britto-release.keystore`) and `ANDROID_KEYSTORE_PASS` (the password). From
   then on every APK from GitHub Actions can update the installed app.
7. **Phone notifications (FCM)** (optional, 10 minutes): create a free Firebase project at
   console.firebase.google.com, add an Android app with package name `app.britto`, download
   `google-services.json` and give it to a session (it is not secret, but it is yours). Until
   then the app's alerts come by Telegram.
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
10. **CPU check on production** (optional, 2 minutes): in the `britto` folder run
   `npx wrangler tail britto --format json | grep cpuTime` for 10 minutes and paste the
   numbers into the next session. (Measures what the new reader costs on Cloudflare.)
11. **Decide on Workers AI** (P8, a decision, 1 minute): picture search ("Lens": photo of a
   product → matches) and smarter "similar products" need Cloudflare Workers AI. Cloudflare's
   pricing page (read 2026-10-27) says every account gets 10,000 "neurons" a day free, and on
   the free plan going over makes requests fail rather than cost money. The allowance is per
   ACCOUNT, so on AMITY it is shared with the paying client's projects, if they use Workers AI.
   If that is fine, tell the next session "Workers AI is allowed on AMITY"; it will add it and
   measure the cost per search before switching anything on. If not, nothing changes.
12. **Check four travel links from India** (P9, 3 minutes): open
   https://britto.amitynoidalibrary.workers.dev/travel on your phone or laptop. Under Flights
   type From `DEL`, To `BOM`, any date next month, press "Show flight searches", then tap
   **MakeMyTrip**, **ixigo** and **Skyscanner** one by one. Under Hotels type `Goa`, press
   "Show hotel searches", tap **Booking.com**. For each, tell the next session "filled in" (your
   trip was already there) or "empty" (you had to type it). Britto's test computer is in the
   USA and these four sites refused it, so only you can check them; the next session then
   marks each link as checked or removes it.

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

- **Nothing of today is live** (owner item 0); production still serves the desktop recipe to
  phones, so the app says "cannot read" there until a deploy succeeds.
- A real phone (emulator only); FCM; a phone with a different delivery location.
- Flipkart M.R.P.; Amazon variant pages (buy-form ASIN vs canonical); out-of-stock Flipkart and
  Myntra phone pages (none seen).
