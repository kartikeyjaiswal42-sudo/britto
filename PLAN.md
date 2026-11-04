# Britto: the build plan

(Called Daam until 2026-10-27, when the owner renamed it. The folder is `britto/`.)

> **The plan changed on 2026-10-27: `BLUEPRINT.md` is now the specification and its §24 is
> the phase order.** S1–S3 below are its P0–P2. The next phase is **P3 (reader-config DSL +
> config service)**. The S4–S12 list further down is superseded by BLUEPRINT §24 and kept
> only as history. Start prompt for any session (local or cloud):
> `Read PLAN.md "Start here", HISTORY.md and BLUEPRINT.md. Build only the next phase, keep every gate green.`
>
> **P3–P9 are LIVE on `main`** (merged and deployed 2026-10-27 13:30 UTC after every gate was
> re-run on the owner's Mac, where Amazon answers; HISTORY "P3–P9 checked on the owner's Mac").
> - **P3**: readers are JSON configs served by the Worker, one interpreter in every client,
>   config CI, reader health, D1 hot-fixes.
> - **P4**: Android app (Gradle, AndroidX WebKit), Super Browse, share target, Save page. Not
>   run on a phone yet.
> - **P6**: Vijay Sales, Nykaa and ShopClues read by the server (live from Cloudflare);
>   Reliance Digital refuses Cloudflare, so it is read from shoppers' pages; sale calendar.
> - **P7 (partly)**: grocery compare logic + API + `/grocery`; no platform readable until the
>   owner saves phone pages.
> - **P8 (except Lens)**: deals vs the 90-day usual price, look-alikes, offers, coupon votes.
>   Lens and AI look-alikes wait for Workers AI (owner item 11).
> - **P9 (deep links)**: `/travel` flights, hotels, rides to airports. Fares and flight alerts
>   wait for fares people actually saw.
> - **P10 Spend Lens** (2026-11-03): on-device order parsing and summary, app + extension; no
>   store's order page is readable until the owner saves one (HISTORY "P10").
> - **P5 design** (2026-11-03): the owner's Claude Design (design/, v4) rebuilt in `web/`;
>   money screens, phone login and the overlay bubble deliberately not built (HISTORY "P5").
> - **P11 part 1** (2026-11-04): Amazon store search, a best-seller catalogue (308 products live
>   after one night, from 11), price drops, alerts as app notifications, the app on the site at
>   /app (0.3.1, release-signed), Flipkart-from-search fixed (HISTORY "P11 part 1").
> - **P11 part 2a** (2026-11-04): fare compare ON THE PHONE (app 0.4.0): flights read from
>   MakeMyTrip, ixigo, Goibibo and EaseMyTrip side by side per flight; ride compare with Uber's
>   fares (after the shopper's login) and Rapido opening; recipes in web/fares.json (HISTORY
>   "P11 part 2a").
> - **P11 part 2b** (2026-11-04): app 0.5.0 — the sites' fare strip by date, round trips (two
>   one-way compares), hotel compare (Booking.com + Cleartrip, per night), fare alerts kept on
>   the phone and re-checked every 6 h with no screen, the status bar coloured like the page;
>   link previews for shared links; abuse review (`ABUSE.md`: short links and views limited);
>   README case study (HISTORY "P11 part 2b").
> **P11 part 3 (first part) done 2026-11-04**: Rapido read in the app while the shopper looks
> (app 0.6.0), "Send Britto to a friend", the app reader's page-words fix; second part: Rapido
> filled in like Uber (app 0.6.1) (HISTORY).
> **Next: P11 part 4**: photo search ("Lens", Workers AI: the owner allowed it on AMITY
> 2026-11-04; measure neurons per search and cap it per day before switching it on); check
> MakeMyTrip/Goibibo again from a phone (they refused the test emulator after many searches);
> the sites' own round-trip pages (measure in the app first); MakeMyTrip hotels (needs its city
> codes); food compare (needs the owner's logged-in pages, as Rapido did).
> Owner-only steps: top of HISTORY.md, "Waiting for the owner".

## Unattended runs (the owner is away and cannot answer)

The owner may start a cloud session and switch their laptop off. In that case:

1. ~~Finish P3 on `p3-reader-configs`~~ (done 2026-10-27). Merge to `main` only when every
   gate is green; GitHub Actions then deploys (schema, Worker, live check).
2. Continue with BLUEPRINT §24 in order, **one phase per branch** (`p4-android`, …), each
   merged only when every gate is green, with HISTORY.md + this file updated per phase.
3. **Skip P5** until `design/` holds the owner's Claude Design export.
4. Never stop to ask. Anything only the owner can do (a phone test, an account, a token, an
   affiliate sign-up, a saved store page) goes into HISTORY.md under **"Waiting for the
   owner"**, in plain English with the exact steps, and work moves to what is not blocked.
5. All rules in CLAUDE.md stay binding: AMITY only, never disguise the bot or work around a
   store's defences, never print secrets, no fake data in production, prove every new test
   can fail, report verified and NOT verified separately.
6. Commit and push after every meaningful step, so nothing is lost if the session stops.

Each piece below is sized for **one Claude session (one 5-hour usage window)**. Start every
session by pasting its prompt. A session does only its own piece, then updates `HISTORY.md`,
ticks this file, and says what is verified and what is not.

**Estimate (revised 2026-10-27 after the owner showed the BuyHatke app): 12 sessions, plan
for 15** (S1–S3 done, one session each; the rest is a judgement, not a measurement: a store
changes its page, a bot wall appears, an Android or Chrome API behaves differently from its
docs).

**Website AND an Android app, one server.** The website stays: it is the link anyone can open
(recruiters, iPhone friends) and it already works for Amazon. The Android app adds what only an
app can do, measured 2026-10-27: Flipkart, Myntra, Ajio, Meesho, Croma, Blinkit, Zepto,
Instamart, BigBasket and JioMart all refuse an honest server, so on a phone their prices can
only come from the page the shopper is looking at. That is BuyHatke's "Super Browse": an
in-app browser that reads the store page the shopper opened, exactly as our extension does on
a laptop. The app reuses the extension's readers (`core/extract.ts`) and the same API and trust
rules. Built here without Gradle (`wifibeing/android/build.sh` pattern; Android SDK 36 and
Java 21 are installed), shared as an APK (WhatsApp). Play Store needs the owner's developer
account ($25, not done). No iPhone app (Apple developer account $99/year + review);
iPhone friends use the website and Telegram.

## Start here (cold start for any session)

- Code: `core/` pure logic (no I/O), `api/` Cloudflare Worker + D1, `web/` the site,
  `scripts/` proofs, `test/fixtures/` real store pages (fetched 2026-10-26, unmodified).
- Run locally: `npm run db:local && npm run dev` → http://127.0.0.1:8787
- Readers: `readers/<store>.<device>.json` (data, BLUEPRINT §6), run by `core/interpret.ts`
  everywhere; served at `GET /api/config/reader`; hot-fix with `scripts/publish-reader.mjs`.
- Android app: `android/` (Gradle). `npm run build:apk` → `android/app/build/outputs/apk/
  release/app-release.apk`; `npm run test:app` (Robolectric + APK checks + the injected reader
  through the real Java bridge). Needs an Android SDK (`ANDROID_HOME` or
  `android/local.properties`) and JDK 21.
- Gates: `npm test` (unit) · `npm run typecheck` (core+api AND extension) ·
  `npm run check:readers` (every config vs every saved page) · `npm run mutate [name]`
  (deliberate breakages, each must redden exactly its checks) · `npm run prove`
  (real Worker, real D1, one real Amazon request; `--live <url>` for production) ·
  `node scripts/alerts.mjs [--browser]` (alerts end to end, fake Telegram, decrypting push
  service; `--browser` adds real Chrome and a real FCM push) · `scripts/push-live.mjs <url>` ·
  `PW_DIR=<playwright-core dir> node scripts/browser.mjs <url>` (real Chrome) ·
  `PW_DIR=… node scripts/extension.mjs` (extension in headless Brave; Chrome 137+ refuses
  `--load-extension`). playwright-core lives in `../quire/web/test/node_modules/playwright-core`.
- Live: https://britto.amitynoidalibrary.workers.dev (AMITY; the old daam address 301s here).
  Deploy order: `npm run db:remote` THEN `npm run deploy`. Extension: `npm run build:ext` →
  load `extension/dist` unpacked. Secrets: `VAPID_PRIVATE_JWK` (set), `TELEGRAM_BOT_TOKEN`
  (the owner sets it; README "Switch on the Telegram bot").
- Rules: `README.md` → "Rules". The big one: **the server never disguises itself or works
  around a store's bot defences.** A store that refuses it is read by the extension.

## Sessions

- [x] **S1: foundations** (2026-10-26). Measured which stores a server can read; the contract
  (`core/types.ts`); store link parsing; page readers for Amazon and Myntra from real pages;
  price-history maths, buy/wait verdict, real-vs-fake sale check, alert logic, scheduler;
  Worker API + D1 + cron re-checker; working website; Claude Design brief.
  Tests: 34 unit + 37 end-to-end + 30 real-Chrome (final run 2026-10-26), each suite proved
  able to fail.
  **Not done: deploy** (needs a Cloudflare token for this project, see README).

- [x] **S2: go live + browser extension** (2026-10-26). Live on AMITY; Amazon read from
  Cloudflare measured; `POST /api/observations` with trust rules; extension built and run in
  real Brave (20/20). Carried over: **Flipkart reader needs one real page** saved by the owner
  with the extension's "Save this page" button (do it at the start of S3).
  Original scope: Deploy to the mysecondstartup account; run
  `prove.mjs --live`; MEASURE whether Amazon answers Cloudflare's network (S1 only measured a
  home connection in India). Chrome MV3 extension: on Amazon / Flipkart / Myntra product pages
  it reads the page the shopper is viewing, shows a panel (mini chart, verdict, sale check),
  and posts the observation to `POST /api/observations` with abuse limits (per-install
  rate limit, outlier check against the last known price, two independent installs to confirm
  a big jump). Flipkart reader built from a page captured in the owner's own browser.
  > (done)

- [x] **S3: alerts + rename to Britto** (2026-10-27). Telegram bot (send a link, get the
  verdict, one-tap alerts; "Connect Telegram" links a browser by a one-time code), Web Push
  written by hand (RFC 8291 byte-exact against the RFC's example; a REAL push from the
  production Worker reached real Chrome through Google), "My alerts" page, alert box on every
  product page, installable manifest. A forged extension report cannot fire an alert on
  Amazon. Gates: unit 58, alerts 68 (+15 in Chrome), prove 51 / live 35, browser live 30,
  extension 21, push-live 6; five breakages each reddened exactly their checks.
  **Carried over:** (1) the owner creates the bot and sets `TELEGRAM_BOT_TOKEN`, then a
  session runs one live Telegram check; (2) the Flipkart page is still not saved
  (`~/Downloads/britto-page-flipkart-*.html` with the extension's "Save this page"); verify
  the reader on it and flip `FLIPKART_READER_VERIFIED` only if its price is the visible one.

- [ ] **S4: the Android app, part 1: "Super Browse".** Start with S3's carried-over checks
  if the owner has done their part (bot token set). Then: an Android app = the Britto website
  in a WebView + an in-app browser for stores. A grid of stores (like BuyHatke's Super
  Browse); on a product page the app injects the same reader bundle as the extension, shows
  the Britto panel and reports the price (`POST /api/observations`, same trust rules).
  "Share → Britto" from the Amazon/Flipkart/Myntra apps opens the product's history. Alerts
  by Telegram inside the app (native push needs Firebase: later). APK built here, installed on
  the owner's phone for the real test (no phone = not verified). **The owner's phone also
  captures the first real Flipkart page** (the app's "Save this page"), which unblocks the
  Flipkart reader.
  > Paste: `Britto S4. Read britto/PLAN.md "Start here" and britto/HISTORY.md, then do only S4.`

- [ ] **S5: the Claude Design UI** (website and app share it). Owner pastes `DESIGN-BRIEF.md`'s
  prompt into Claude Design and drops the export in `britto/design/`. Rebuild those screens
  in `web/` (strict CSP, no CDN, see the brief's integration contract), extend
  `scripts/browser.mjs` to every screen at 390 px and 1280 px, light and dark.
  > Paste: `Britto S5. Read britto/PLAN.md "Start here", britto/HISTORY.md and britto/DESIGN-BRIEF.md. The design export is in britto/design/. Do only S5.`

- [ ] **S6: more stores + compare across stores.** First check whether the **Flipkart
  Affiliate API** (docs exist at affiliate.flipkart.com; access for new affiliates **not
  checked**) and Amazon's **PA-API** are open to the owner: an official feed is the honest way
  to get Flipkart prices with no app or extension. Then readers, one store at a time, each
  from a real captured page with a fixture test. Home pages measured 2026-10-27 from a home
  connection (product pages and Cloudflare's network still to measure): **answered** Reliance
  Digital, Vijay Sales, Snapdeal, ShopClues, FirstCry, Nykaa (its page mentions a captcha:
  check), Tata CLiQ (a 14 KB "enable JavaScript" shell); **refused** Ajio, Meesho, Croma, JioMart (app/extension only). Cross-store
  matching by barcode/model number first, title similarity only as a labelled weaker match.
  > Paste: `Britto S6. Read britto/PLAN.md "Start here" and britto/HISTORY.md, then do only S6.`

- [ ] **S7: grocery compare (app).** Blinkit (403 + captcha), Zepto and Swiggy Instamart
  (202 + JavaScript wall), BigBasket and JioMart (403) all refuse servers, measured
  2026-10-27. So grocery compare lives in the app: readers for each store's product and search
  pages, built from pages captured on the owner's phone, and "find this item in every store"
  inside Super Browse. Grocery prices depend on the delivery address, so a comparison is only
  valid for one location, and says so. BuyHatke itself marks grocery "beta".
  > Paste: `Britto S7. Read britto/PLAN.md "Start here" and britto/HISTORY.md, then do only S7.`

- [ ] **S8: flight + hotel compare (website).** The free live-fare route I assumed in S1 is
  gone: **Amadeus closed its Self-Service APIs on 17 July 2026** (PhocusWire). What remains:
  (a) one search form → the same search opened, pre-filled, on MakeMyTrip, Ixigo, Cleartrip,
  Goibibo, EaseMyTrip, Skyscanner and the airlines (deep links, no API, works today);
  (b) if the owner opens a **Travelpayouts** account (free), its Aviasales Data API gives
  *cached* fares that other searchers saw in the last 2–7 days: a cheapest-day calendar,
  labelled as cached, never shown as a live price. Live fares need a partner contract.
  Hotels: the same two layers; Travelpayouts' hotel data terms **not checked**.
  > Paste: `Britto S8. Read britto/PLAN.md "Start here" and britto/HISTORY.md, then do only S8.`

- [ ] **S9: ride compare (app).** Enter pickup and drop once; the app opens Uber, Ola, Rapido
  and Namma Yatri with the trip already filled in (deep links), so comparing takes taps, not
  typing. **Reading the fares automatically is not decided:** Uber's API needs Uber's approval
  and its terms forbid using it for comparison with rival services; reading another app's
  screen needs an Accessibility permission that Android 13+ blocks for sideloaded apps unless
  the user overrides it, and that app stores restrict. How BuyHatke and Comparoo get fares is
  **not known**. The session decides from what it can verify, and ships the deep links either way.
  > Paste: `Britto S9. Read britto/PLAN.md "Start here" and britto/HISTORY.md, then do only S9.`

- [ ] **S10: deals, look-alikes, Product Lens.** Deals filters (store, minimum real drop,
  "biggest real drops this week"); look-alike products (cheaper items with similar titles via
  Workers AI text embeddings, measured cost per query); **Product Lens**: a photo or screenshot
  of a product → Workers AI vision names it → Britto's own matches + store search links;
  coupons and bank offers only as read from the page. **No made-up coupon database.**
  > Paste: `Britto S10. Read britto/PLAN.md "Start here" and britto/HISTORY.md, then do only S10.`

- [ ] **S11: Spend Lens.** The extension and the app's in-app browser read the shopper's own
  Amazon/Flipkart order pages and build a spending summary (month / store / category).
  Nothing is uploaded; a test asserts no order data reaches the network.
  > Paste: `Britto S11. Read britto/PLAN.md "Start here" and britto/HISTORY.md, then do only S11.`

- [ ] **S12: job-ready.** Server-rendered product meta for sharing and search engines, share
  target for the website on Android, abuse review (campus Wi-Fi: every classmate shares one
  network's 30-new-products-an-hour limit), full live test pass on web, extension and app,
  README case study (the measured decisions: what is read how, and why), a 2-minute demo
  script, Chrome Web Store and Play Store listing prep (owner's accounts).
  > Paste: `Britto S12. Read britto/PLAN.md "Start here" and britto/HISTORY.md, then do only S12.`

## Not in this plan, and why

- **Gift cards, cashback, Refer & Win.** They move real money: buying gift cards from a
  supplier, paying users, KYC and payouts. A business deal with each store, not code.
- **Food compare (Swiggy vs Zomato).** BuyHatke marks it "coming soon" itself. It would work
  like grocery (app only, location-dependent); revisit after S7 shows how that goes.
- **Years of back-history on day one.** BuyHatke has years of data. Britto's history starts when a
  product is first tracked and says so ("tracking since …"). Paid history APIs exist
  (Keepa, for Amazon), **not checked** for price or India coverage.
- **An iPhone app.** Needs an Apple developer account ($99/year) and App Store review.
  iPhone users get the website (installable from Safari) and the Telegram bot.
