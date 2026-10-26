# Britto Blueprint — the full product, one document

This is the complete engineering specification for Britto at full scope: website, Chrome
extension, Android app, one server, and the operations machinery that keeps store readers
alive without shipping client releases. **It specifies the whole system from zero.** Build
it greenfield, or use it to judge and rebuild what exists — the spec does not assume any
prior code. Everything here is written as a build target: data shapes, config schemas,
flows, and acceptance checks. Where a choice was made, the reason is given. Where something
is deliberately excluded, it says so.

Section 24 is the phase plan (the *when*); the rest is the *what*.

**The recommended path is to build on the existing, verified core** (the live Worker + D1,
the Amazon reader, the extension, alerts, push, Telegram shell). That core is measured and
proved-able-to-fail — re-deriving it would rebuy work already done. This spec is written
so that any session can nonetheless rebuild any single piece from this file alone: every
subsystem's data shapes and behaviors are fully specified here, so nothing depends on
undocumented prior knowledge. Where the existing code and this spec differ, this spec
wins; the code is changed to match.

---

## 1. Product definition

Britto tells a shopper three things about any product, anywhere they shop:

1. **Truth about the price** — full price history with sale-event context, and a verdict:
   is today's price genuinely good, or a fake discount (sticker price inflated before a
   "sale")?
2. **Truth about alternatives** — the same product on other stores, and look-alike
   products that are cheaper.
3. **Memory** — price-drop and back-in-stock alerts that arrive where the shopper actually
   is (Telegram, push), plus a private record of what they spend across stores.

Surfaces: the website (link anyone can open), a Chrome extension (laptop shoppers), an
Android app with "Super Browse" (phone shoppers), and a Telegram bot (everyone else).

## 2. Non-negotiable rules (binding on every session)

1. **The server never disguises itself and never works around a store's bot defences.**
   It identifies as `BrittoBot`. A store that refuses the server is read by the extension
   or the app, from the shopper's own browsing context, and the product says so.
2. **Clients are sensors; the server is the brain.** No client computes verdicts, deal
   scores, or history analytics. Clients extract raw facts (price, MRP, title, PID,
   availability) and render what the server returns.
3. **Readers are data, not code.** Store-specific extraction knowledge lives in versioned
   JSON configs served by the server. A store changing its HTML is a config deploy, never
   a client release. (Store review queues take days; config deploys take minutes.)
4. **Every number has a source and every source is checked.** A reader is "verified" only
   against a real captured page from that store, byte-exact, committed as a fixture.
5. **The shopper's own data stays theirs.** Spend Lens and order-history features process
   on-device; only aggregates the user explicitly chooses to sync may leave the device.
   A test asserts raw order data never reaches the network.
6. **Tests must be proved able to fail.** Every suite ships with deliberate breakages that
   redden exactly their own checks.

## 3. System shape

```
                 ┌────────────────────────────────────────────┐
                 │              Cloudflare account             │
                 │                                             │
  website (PWA)  │   Worker API ── D1 (products, prices,      │
  extension ─────┼──▶   + cron    alerts, users, configs)      │
  android app ───┤        │                                    │
  telegram bot ──┤        ├─▶ Config service (versioned JSON   │
                 │        │    per store per device-class)     │
                 │        └─▶ Outbound: Telegram, Web Push     │
                 └────────────────────────────────────────────┘
                    ▲                     │
                    │ observations        │ verdicts, history,
                    │ (raw facts)         │ deal scores, alerts
                    └─────────────────────┘
```

Three data flows matter:

- **Observation flow (up):** every product page a client reads produces one observation
  `{store, pid, itm, price, mrp, title, image, availability, readAt, source}` posted to
  `POST /api/observations`. Server-side trust rules decide what it may affect.
- **Answer flow (down):** clients ask for computed things — history, verdict, deal score,
  comparison, alerts — and render them.
- **Config flow (down):** clients periodically fetch their reader configs; configs are
  cached briefly so fixes propagate fast.

## 4. Core data model

### 4.1 Store registry

Every store is a numeric ID plus metadata, in one registry table (and mirrored in the
config service). The registry is the single place that maps hostnames → store, including
sub-brand splits by URL pattern (e.g. a quick-commerce storefront living inside a main
store's domain gets its own ID via a `url_includes` rule).

```
Store {
  id: number                 // stable, never reused
  name: string               // display name
  hosts: string[]            // exact hostnames
  urlSplits?: [{ url_includes: string[], storeId: number }]
  kind: 'shopping'|'grocery'|'food'|'travel'|'ride'|'service'
  region: string             // 'IN', 'US', ...
  serverReadable: 'yes'|'no'|'unmeasured'   // measured fact, updated by probes
  readerVerifiedAt: string|null             // last fixture-verified date
}
```

Initial registry (shopping): Amazon IN, Flipkart, Myntra, Ajio, Meesho, Nykaa (+Fashion,
+Man), Tata CLiQ, Croma, Reliance Digital, Vijay Sales, Snapdeal, ShopClues, FirstCry.
Grocery: Blinkit, Zepto, Swiggy Instamart, BigBasket, JioMart, DMart Ready, Flipkart
Minutes, Amazon Fresh/Now. Travel (deep-link only at first): MakeMyTrip, Goibibo,
Cleartrip, Ixigo, EaseMyTrip, Yatra, IndiGo, Air India, plus Skyscanner. Rides (deep-link
only): Uber, Ola, Rapido, Namma Yatri. Food (later): Swiggy, Zomato, Domino's, KFC,
McDonald's.

Also register **storefront platforms** generically: a Shopify/Wix/Magento detector lets
thousands of small brand sites work without a per-store reader (§6.4).

### 4.2 Product identity

```
ProductKey = { storeId, pid, itm? }      // pid = store's product id; itm = item/listing id
Product {
  key: ProductKey
  title, brand?, image, categoryPath: string[]
  firstSeenAt, lastSeenAt
}
Observation {
  key: ProductKey
  pricePaise: number|null
  mrpPaise: number|null
  availability: 'in_stock'|'out_of_stock'|'unknown'
  readAt: timestamp
  source: 'server'|'extension'|'app'|'telegram'
  installHash?: string        // hashed install id, for trust rules
}
PricePoint { key, pricePaise, at }          // write-on-change only
Alert {
  id, key: ProductKey, channel: 'telegram'|'push',
  target: { chatId } | { subscription },
  kind: 'below'|'any_drop'|'back_in_stock',
  thresholdPaise?: number, armed: bool, createdAt
}
```

Price history is a **step function**: the last observed price holds until the next
observation — never drawn "until now" unless actually re-read. Aggregates are
time-weighted (mean, median, percentiles, min) — a point's weight is how long the price
actually held, not how many times it was re-read.

### 4.3 Users, installs, linkage

No accounts for basic use. Each install (extension/app/browser-profile) has a random
`installId` + secret; the server stores only their hash. Telegram linking is a one-time
code (§17). Web Push subscriptions are stored per install. Rate limits
key on hashed IP + install.

## 5. The observation contract (up-flow)

`POST /api/observations`:

```
{ storeId, pid, itm?, url, title, pricePaise, mrpPaise, availability,
  image?, categoryPath?, specsHash?, readAt, readerVersion, configVersion }
```

Responses: `202` accepted (possibly quarantined), `200` accepted-and-applied, `429`
rate-limited, `422` malformed (with the failing fields named). Idempotent on
`(installHash, key, readAt)` — a retried post writes one row.

Trust rules:

1. Server reads outrank client reads for `serverReadable: yes` stores.
2. A client observation never, by itself, fires an alert on a server-readable store.
   Generalized form: alerts re-evaluate on every *trusted* read; a confirming read writes
   no row, and an unconfirmed client outlier moves nothing.
3. Outlier guard: a client reading more than 40% off the last trusted price is quarantined
   until a second independent install or a server read confirms it.
4. Per-install rate limits; per-IP new-product limits (the campus Wi-Fi case: a whole
   classroom shares one IP, so the ceiling is per-IP generous and per-install strict —
   30 new products/hour per IP, with a clear "slow down" message, never a silent drop).
5. `readerVersion` and `configVersion` are recorded on every observation so a bad config
   deploy can be identified and its readings excluded.

## 6. Store readers as data — the reader-config DSL

This is the most important machinery in the whole system. **All** store knowledge lives in
versioned JSON. Clients ship with only a config *interpreter*.

### 6.1 DOM recipe (per store, per device-class: `desktop` | `mobile`)

Each field is an ordered list of candidate selectors — first match wins; every entry
declares its attribute and extraction regex. Fallback chains absorb A/B tests and layout
variants.

```
DomRecipe {
  classSelector?: string                 // page marker confirming the recipe matches
  name:     Field[]; price: Field[]; mrp: Field[]; image: Field[];
  pid:      Field[];    itm: Field[];   availability: AvailRule;
  rating?: Field[]; ratingsCount?: Field[]; reviewsCount?: Field[];
  brand?: Field[]; categoryPath?: Field[]; seller?: Field[];
  variants?: VariantRule[]; discontinuedText?: [{ sel, txt }];
  pincodeFromStorageKeys?: string[]
}
Field {
  selector: string[]            // css path segments; [] = use the page URL itself
  attribute: 'innerText'|'innerHTML'|'textContent'|'content'|'href'|'alt'|'URL'
  regex?: string[]              // applied in order; capture group 1 is the value
  match?: number                // which regex match (default 0)
  global?: bool                 // search whole document
  sub_regex?: string            // pre-narrow the matched text
}
AvailRule {
  selectors: string[]
  outOfStockText: string[]      // e.g. 'currently out of stock', 'notify me'
  sellerPageFallback?: { urlIncludes, inStockSelectors, inStockText[] }
}
```

Rules for writing recipes:

- Price and MRP are different fields with different evidence. A strike-through styled
  element (`[style*='line-through']`) is MRP evidence, never current price.
- `og:title` / canonical URL are always the last fallback for name/PID.
- Regexes extract digits only; paise conversion happens in `core/money.ts`.
- Every recipe ships with a **fixture test**: a real saved page + expected values. The
  test must redden if the selector is deleted from the fixture (proved able to fail).
- A recipe whose `classSelector` stops matching is reported as `unrecognised` — never a
  guessed price from anywhere on the page. (The canonical failure: a product page whose
  own price block is empty still shows carousel prices elsewhere; a "price from anywhere"
  reader reports the carousel's price as the product's. That is a lie with a number on it.)

### 6.2 API recipe (stores whose pages render from JSON APIs)

Many stores render product pages from an internal JSON API. For those, the recipe declares
the API call shape and a JSON-path extraction, and the client obtains the JSON in one of
two honest ways (§7):

```
ApiRecipe {
  url: string                   // may contain {{pid}}, {{latitude}}, {{longitude}}
  method: 'GET'|'POST'
  headers?: Record<string,string|number>   // constants only; no spoofing (rule 1)
  bodyTemplate?: object
  parse: {
    root: string[]              // candidate roots, e.g. 'response.widgets[0].data.items'
    match?: [{ path, eq?: any[], ne?: any[] }]     // row selection conditions
    fields: { product_id?, price?, mrp?, productName?: string[], image?, groupId? }
    oos?: [{ path, oos: any[] }]            // out-of-stock markers
    oosDefault?: 0|1
  }
  imageTemplateReplacements?: Record<string,string>   // {@width} -> '1080'
}
```

Real recipe shape (this is the actual working form for a quick-commerce store):

```
url: POST {store}/v1/layout/product/{{pid}}
headers: { lat: {{latitude}}, lon: {{longitude}}, content-type: application/json }
parse.root: [ 'response.page_level_components…cart_item' ]
parse.match: [{ path: 'product_id', eq: ['{{pid}}'] }, { path: 'price', ne: [0] }]
parse.fields: { price: 'price', mrp: 'mrp', productName: ['product_name','display_name'] }
parse.oos: [{ path: '…is_sold_out', oos: [true] }, { path: 'inventory', oos: [0] }]
```

### 6.3 Config service

`GET /api/config/reader?store=<id>&device=<desktop|mobile>&v=<clientVersion>`
→ `{ version, domRecipe?, apiRecipes?, features: {...} }` with `ETag`/`304` and a
`Cache-Control: max-age=600`. Clients cache per store for 10 minutes, revalidate daily
at minimum. Config carries `toCacheLong` for stable stores. Config deploys are:
edit JSON → bump version → deploy Worker (or a D1 row) → clients converge within 10 min.

Every config version is logged server-side with first-seen timestamp, so a store breakage
("zero observations from store X in 6h") can be correlated with a config deploy.

### 6.4 Generic platform recipes

Detect the storefront platform from page markers, then apply the platform's default
recipe — thousands of long-tail brand stores with zero per-store work:

```
PlatformRecipe {
  detect: { markerSelectors: string[], productPathIncludes?: string[] }
  pid:    { canonicalSelector, ogUrlSelector, variantParam?, stripSchemeRegex }
  productJsonEndpoint?: { pathTemplate, suffix }   // e.g. Shopify: /products/<handle>.js
  listingCards?: { collectionMarkerSelector, cardAnchorSelector, handleRegex }
}
```

Ship detectors for: Shopify (its `/products/<handle>.js` endpoint returns clean JSON —
title, price, compare-at price, variants, availability), Wix, Squarespace, Magento,
BigCommerce, Dukaan, WooCommerce.

## 7. Reading hard stores from the user's own context (honest design)

Stores that refuse the server are read **where the shopper already is**. Two techniques,
both legitimate because they use the shopper's own session, on the shopper's own device,
for the shopper's own benefit — the same access the shopper themselves has:

1. **Page-world API listening.** On supported stores, the extension/app injects a tiny
   page-world script at document start that wraps `Response.prototype.json/text` and
   `XMLHttpRequest`. When the store's *own* front-end fetches its product JSON, the
   listener copies the response (only for URL patterns in the store's config, supplied by
   `GET /api/config/api-patterns?store=<id>`) and relays it to the content script via
   `window.postMessage`, then to the background worker. The store app did the fetch; we
   just read what it read. The config's `parse` section (§6.2) extracts the product.
2. **Direct read in the page's session.** Where a store's API answers plain same-origin
   requests from its own pages, the content script may issue the configured `ApiRecipe`
   call from the page context with the user's own cookies — exactly what the store's own
   front-end does. No header forging, no UA impersonation, no credential relay. Cookies
   never leave the device; only the extracted product facts go to the server.

What we **never** do (rule 1): rewrite Origin/Referer headers to impersonate a store,
impersonate mobile apps' User-Agents, relay user cookies to the server, or automate
logged-in actions beyond what the user initiates.

## 7.5 The client message protocol

Content scripts and in-app page scripts **never call the server directly**. All server
access goes through the background worker (extension service worker / the app's native
bridge), which owns caching, rate-limit politeness, and credentials. Named messages,
request → response:

| Message | Payload → Response | Used for |
|---|---|---|
| `getReaderConfig` | `{storeId, device}` → `{version, domRecipe?, apiRecipes?}` | §6.3, cached 10 min |
| `getApiPatterns` | `{storeId}` → `{urlPatterns: string[]}` | §7.1 listener arming |
| `apiResponse` | `{storeId, url, text}` → `ack` | sniffed store JSON → server |
| `getProductAnswer` | `{storeId, pid, itm?}` → `{history, verdict, saleBands, compare, alerts}` | the whole panel in one call |
| `postObservation` | `Observation` → `{accepted, quarantined?}` | §5 |
| `getDealScoreBatch` | `{items: [{pid, pricePaise, oos}]}` → `{scores: {...}}` | listing badges |
| `setAlert / removeAlert / listAlerts` | alert fields → `Alert[]` | alert box |
| `captureFixture` | `{url, html, note?}` → `{fixtureId}` | "Save this page" |
| `getGroceryCompare` | `{item, addressId}` → `per-platform rows` | §12 |
| `reportTelemetry` | `{feature, storeId, ok, ms}` → `ack` | §20 |

Rules: every message is validated against a schema before handling; unknown messages are
dropped silently; responses never include credentials or other installs' data; the
worker batches and dedupes identical in-flight requests (a page firing the same question
twice gets one server call).

## 8. Server API surface

The full target surface (all new unless a phase says otherwise):

```
GET  /api/config/reader            reader configs (§6.3)
GET  /api/config/api-patterns      URL patterns for API listening (§7.1)
GET  /api/config/registry          store registry snapshot
POST /api/observations             observation ingest (§5)
GET  /api/product/<store>/<pid>    product + history + verdict + sale bands + comparison
GET  /api/search?q=                FTS5 title search with store filter
GET  /api/compare/<store>/<pid>    same product elsewhere (§10)
POST /api/dealscore                batch: [{store,pid,pricePaise,oos}] → verdict per pid
POST /api/alerts  GET/DELETE       price + stock alerts
POST /api/push/subscription        web push (RFC 8291)
GET  /api/telegram/link            one-time code
POST /api/grocery/basket           build/normalize a basket (§12)
POST /api/grocery/compare          compare one item across platforms
GET  /api/grocery/platforms        platform registry + serviceability
POST /api/spend/summary            on-device computed aggregates (optional sync)
GET  /api/deals                    curated real-drop feed (§11)
GET  /api/flights/indicative       cached-fare calendar (§14, labelled cached)
GET  /api/hotels/indicative        same for hotels
POST /api/telemetry                client error/feature telemetry (no PII)
```

Conventions: JSON in/out; `{status: 1, data}` success envelope; errors as
`{status: 0, error, fields?}`; every computed response carries `computedAt`; history
responses carry `trackingSince` and the UI shows "tracking since …" honestly when history
is young. All mutation endpoints are rate-limited per hashed IP + install and are
idempotent under client retry.

## 9. The product page panel (extension + app + website share the design)

Shown on every product page. Contents, top to bottom:

1. **Price now** + MRP + the store. If the reader is unsure: "unrecognised" state, never
   a guessed number.
2. **Verdict chip** from the server: `great_price | fair | wait | fake_discount_risk |
   insufficient_data`. Fake-discount risk is computed from history (e.g. current "sale"
   price ≥ median of the last 90 days while MRP is new/inflated) — thresholds live in
   `core/judge.ts` and are the same on every surface.
3. **History graph** — an SVG step chart (no chart library; a step path is 40 lines and
   keeps the CSP strict and the bundle tiny) with:
   - range filters 1M / 3M / 6M / 1Y / All;
   - min / average / highest markers and "lowest recorded price";
   - drop statistics: biggest single drop, typical drop %, days since last drop;
   - **sale-event bands**: shaded regions labelled with the store's known sale events
     ("Big Billion Days Price", "Prime Day Price") from a server-maintained sale calendar
     config (`{storeId: [{title, titleFull, from, to, color}]}`). This is what makes a fake
     discount *visible*: the band shows the price during the last real sale.
4. **Compare strip**: same product on other stores with prices (§10).
5. **Alert box**: set target price / any drop / back-in-stock. Setting an alert requires
   a delivery channel: connect Telegram by one-time code, or grant push permission. The
   box shows existing alerts on this product with a remove control.
6. **Coupons**: only codes actually read from the page or confirmed working by users
   (§15) — never an invented coupon database.
7. **Look-alikes**: cheaper similar items (§10.3).

### Listing-page deal scanner

On search/category pages, the client extracts each product card's PID + displayed price
(recipe: `listingCards` per store), batches them (max ~40 per call, 10-minute client-side
cache keyed by pid) to `POST /api/dealscore`, and badges each card: ▲ dearer than usual,
▼ genuine drop, ● at typical price, plus a wishlist heart. Badge thresholds are identical
to the panel verdict. Cards the recipe can't identify are skipped, never guessed.

## 9.5 Surfaces and screens — the complete inventory

Everything a builder must produce, enumerated. No other screens exist.

**Website (PWA, vanilla JS, strict CSP — no inline scripts, no CDN):**

| Route | Screen | Contents |
|---|---|---|
| `/` | Home | search box (paste any product link or type a name), store grid, deals strip, "add to Chrome / install app" cards |
| `/p/<store>/<pid>` | Product | the full panel (§9) as a page; server-rendered meta tags for sharing/SEO |
| `/search?q=` | Search results | own index first, then per-store deep links |
| `/alerts` | My alerts | every alert for this install; pause/remove; connect Telegram/push |
| `/deals` | Deals | filterable real-drop feed (§11) |
| `/grocery` | Grocery | address picker, item search, basket builder, compare results |
| `/travel` | Flights + hotels | one search form → pre-filled deep links; indicative calendar when available |
| `/spend` | Spend Lens | upload-free explainer + "use the extension/app" (on-device only) |
| `/about` | Method | how Britto reads prices, the honesty rules, "tracking since" policy |

**Extension (MV3):**

1. **Product panel** — injected on product pages (§9); collapsible to a chip.
2. **Listing badges** — deal scanner on search/category pages (§9).
3. **Popup** (toolbar icon) — current tab's product if any, alerts count, deals link,
   "Save this page" button (captures a fixture for new readers), settings.
4. **Options page** — channels (Telegram link, push), per-feature toggles, data
   deletion ("forget this install").

**Android app:**

1. **Home** — same as website home + Super Browse grid of store icons.
2. **Store tab** — in-app browser for one store (§18.2) with the panel injected.
3. **Product** — the website's product page, native-wrapped.
4. **Compare** — grocery basket and results.
5. **Alerts** — same as `/alerts` plus FCM channel.
6. **Lens** — camera/gallery → product matches (§19).
7. **Settings** — permissions explainer screens (asked in context, each with "why").

**Telegram bot** — §17; **config service + reader-health dashboard** — §6.3, §20
(operator-only, not a user screen).

## 10. Comparison

### 10.1 Same product on other stores

Matching order, each step labelled by strength in the UI:

1. **Exact IDs** — barcode/GTIN/EAN/ISBN or manufacturer model number from the page's spec
   table (recipe: `specs`). Deterministic; shown as "same product".
2. **Store cross-walk** — PID pairs confirmed by repeated co-observation (the same product
   reported from two stores by many installs over time accumulates confidence server-side).
3. **Name + brand + price proximity** — normalized title similarity ≥ 0.8 AND price within
   15%; shown as "likely the same" with a mismatch-report button
   (`POST /api/feedback/compare`) whose reports tune the threshold.

### 10.2 Search comparison

`GET /api/search` across the observation DB (FTS5 over the titles table). For stores with no data, the
compare panel falls back to **pre-filled deep links** to that store's own search results —
honest, always works, and clearly labelled "opens <store>".

### 10.3 Look-alikes

Cheaper products with similar titles via Workers AI embeddings (measure the neuron cost
per query against the daily free budget before enabling; results are cached per product).
Labelled "similar", never "same".

## 11. Deals feed

`GET /api/deals` = products with a **verified real drop**: current trusted price below the
90-day time-weighted median by ≥ threshold, MRP excluded from the maths (MRP is marketing;
only observed prices count). Filters: store, category, minimum drop %. No "deals" that are
just MRP-vs-price arithmetic. A deal's card shows the graph sparkline so the drop is
checkable. Optional later: a curated feed pushed by an admin endpoint.

## 12. Grocery compare (app-first)

Registry: Blinkit, Zepto, Instamart, BigBasket, JioMart, DMart, Flipkart Minutes, Amazon
Fresh/Now. Every figure is **location-bound** — the UI always names the delivery address
the prices are valid for, and refuses to compare across addresses.

Building blocks, each a config family (data, not code):

- **Platform registry** (`/api/grocery/platforms`): id, name, logo, checkout/basket URL,
  store ID, alternate IDs.
- **Search recipes** (`platformSearch`): per-platform search API recipe (§6.2) incl. how
  location is supplied (headers `lat`/`lon`, path params, or an address-id cookie),
  pagination, and result field mapping.
- **Price recipes** (`platformPrice`): per-platform product-price API recipe with OOS
  rules (the working shape in §6.2 is taken from production-grade recipes of this kind).
- **Address recipes** (`getAndSetAddress`): how the platform exposes the current delivery
  address and how the app sets one the user picked (user-initiated only).
- **Cart recipes** (`platformCart`, `domAddToCart`, `removeCartItems`): building the
  compared basket into the user's own cart on the winning platform, on explicit tap only.
- **Category map** (`mapped-categories`): a canonical category taxonomy with per-platform
  synonyms (hundreds of rows; this file is big because grocery taxonomies never align).
- **Order-history recipes** (`orderHistory`): for Spend Lens grocery.

Flows:

1. **Item compare:** on any grocery product page (or from search), "compare this item" →
   the app queries every serviceable platform's search recipe for the item, normalizes
   pack size (per-100g/unit price displayed beside pack price), and ranks by total.
   Matching is by normalized name + pack size + brand; ambiguous matches are shown as
   "check this one" not silently ranked.
2. **Basket compare:** the user builds a basket (or imports the current cart from one
   platform); the app prices the whole basket per platform incl. delivery fee where the
   recipe can read it, and shows the winner. "Move basket to <winner>" deep-links to that
   platform's cart with items added by the cart recipe, only on tap, and reports what it
   could not add.
3. **Limits, honestly stated:** prices valid for one address; stock changes by the minute;
   delivery fees/membership prices (e.g. pass pricing) shown when the recipe reads them,
   footnoted when not.

## 13. Spend Lens

Reads the shopper's **own** order-history pages (Amazon, Flipkart, Myntra, grocery
platforms) in the extension/app and builds a spending summary: by month, by store, by
category (registry-driven category map), lifetime totals.

- **Local-first:** parsing and aggregation on-device; raw orders never uploaded (test
  asserts). Optional: sync monthly aggregates only, behind an explicit toggle.
- Auto-sync schedule per store, user-visible ("last synced …"), with a manual refresh.
- Grocery orders use the `orderHistory` recipes (§12).
- No scraping of payment instruments; amounts come from order pages only.

## 14. Travel: flights and hotels (website)

No live-fare API exists for free (Amadeus self-service closed July 2026). Two layers:

1. **One search, many tabs:** the user enters route/dates once; Britto opens the same
   search pre-filled on each OTA/airline via deep links (config: per-site URL templates
   with date/airport formatting, plus autocomplete data for airports and cities).
2. **Indicative prices:** if and when observation volume allows, show cached fares other
   Britto users saw for the route in the last 2–7 days, as a cheapest-day calendar —
   always labelled "indicative, seen on <date>", never presented as a live price.
   Flight price alerts (set on a route+date) are evaluated against new observations.

Hotel flow mirrors flights. Ride compare (app): pickup+drop entered once, deep links open
each ride app with the trip filled; no automated fare reading until an official, permitted
source exists.

## 15. Coupons and bank offers

- **Page-read only:** coupon codes and bank offers shown on the product/cart page are read
  by the recipe (`offers`, `bankOffers` fields) and displayed. Auto-apply tries codes the
  page itself advertised, one at a time, only when the user taps "try codes".
- **Community confirmations:** users can up/down-vote a code
  (`POST /api/coupons/vote`); a code's card shows "worked for N of M recently".
- **Never** a scraped or invented coupon database presented as verified.
- Cashback, gift cards, refer-and-earn: **excluded** (they move real money — supplier
  deals, KYC, payouts; a business decision, not code). If ever added, they are server
  modules with their own ledger, never extension hacks.

## 16. Wishlist

Per-install and shared wishlists: create, add from any product page, move between lists,
share by link (read-only or collaborative), price-drop alerts on list items, and a
"best store for this list" total. Server stores only product keys + list metadata.

## 17. Telegram bot

A single bot (token in a Worker secret, webhook mode — no polling). Behaviors:

- Send any product link → reply with verdict, current price vs min/avg, a compact history
  summary ("lowest ₹___ on <date>, usually ₹___"), and one-tap buttons: "Alert me below
  ₹___", "Alert on any drop", "Open graph".
- Send a grocery item name → a compare card across serviceable platforms for the user's
  saved address (asked once, stored against the chat).
- Send a flight route ("DEL BOM 12 Dec") → deep links, plus the indicative calendar when
  observations exist (labelled cached).
- `/link <code>` ties the chat to a browser/app install so that install's alerts arrive
  here; `/alerts` lists and manages them; `/stop` deletes all of the chat's data.
- The bot never asks for credentials and never echoes product history it doesn't have —
  "not tracked yet, I'll start now" and it begins.

## 18. Android app

WebView shell of the website (the website ships as an installable PWA) plus the parts
only an app can do:

1. **Super Browse:** a grid of store icons opens an in-app browser tab per store. The app
   injects the same reader bundle + config interpreter as the extension, shows the same
   panel, and posts observations under the same trust rules. The app's "Save this page"
   button captures a fixture for new readers (this is how the Flipkart reader gets its
   first verified page).

   **How a store tab works, mechanically:** each store gets its own `WebView` (its own
   back-stack; cookies via the shared `CookieManager` so the user logs in once per store).
   On `onPageFinished`, the app evaluates one JavaScript bundle — the *same* reader bundle
   the extension ships, built from the same source — which asks the native side for its
   reader config through a `JavascriptInterface` bridge (`BrittoBridge.postMessage(json)`
   carrying the §7.5 protocol). The bridge answers from a native cache (10 min, ETag),
   the bundle runs the DOM recipe or arms the API listener, renders the panel into a
   shadow root (isolated from the store's CSS), and ships observations back over the
   bridge. Navigation to a non-product page tears the panel down; a URL change re-runs
   detection. "Save this page" serializes `document.documentElement.outerHTML` + URL +
   timestamp and uploads it as a fixture candidate. The native layer never inspects page
   content itself — all extraction lives in the one shared bundle, so the app and the
   extension can never drift apart (a parity test runs the same fixtures through both
   interpreters).
2. **Share target:** "Share → Britto" from any shopping app opens the product's history.
3. **Clipboard assist (opt-in):** detecting a copied product link offers to open it.
4. **Floating bubble (opt-in, later):** an overlay entry point while browsing other
   shopping apps (requires the draw-over-apps permission, asked in context).
5. **Alerts:** FCM push (native) and in-app Telegram.
6. **Grocery flows** (§12) live here first.
7. Permissions, asked in context only: notifications (alerts), location (grocery),
   camera (visual product search, §19), overlay (bubble). Build with the repo's no-Gradle
   toolchain (`wifibeing/android/build.sh` pattern); distribute as APK; Play Store listing
   is the owner's account decision.

## 19. Product Lens (visual search)

Photo or screenshot of a product → on-device preprocessing → Workers AI vision names the
product → Britto's own matches first, then pre-filled store search links. No third-party
visual-search piggybacking; every answer traceable to our own index or a labelled store
search.

## 20. Telemetry and operations

- **Reader health:** per-store observation counts and `unrecognised` rates hourly; alert
  the operator when a store drops to zero or unrecognised spikes (that's a broken recipe).
- **Config deploy log:** every config version with first-seen time and observation delta.
- **Feature telemetry:** `POST /api/telemetry` — feature used, store, success/fail,
  duration; no page content, no PII. Client error reports with stack, store, config
  version.
- **Sale calendar:** operator-maintained config (§9) updated before each major sale.
- **Cron:** every 5 minutes, re-check the most overdue watched products
  (overdue = `now − lastCheckedAt > interval(store)`; pick by worst overdue ratio, cap per
  run by measured CPU budget; back off a failing product exponentially and a failing store
  by pausing its whole queue). A store that starts refusing the server is demoted to
  client-read-only automatically and flagged.

## 21. Monetization (later, and optional)

The product works fully without it. If added: affiliate deep links where the store has an
official affiliate program (declared in the registry per store, applied transparently —
"this link supports Britto"), and nothing else. No ad networks, no data sale, no paid
placement in verdicts or comparison order — comparison order is always by price.

## 22. Testing and verification standards

- **Fixtures:** one real, byte-exact saved page per store per page-type in
  `test/fixtures/`; reader tests assert extracted values AND that deleting the target
  element reddens the test (proved able to fail).
- **Parity:** extension, app, and website share `core/`; a parity suite runs the same
  fixture set through every client's interpreter and diffs outputs field-by-field.
- **Config CI:** every config JSON is schema-validated on deploy; a dry-run evaluates all
  fixtures against the new config and reports extraction diffs before it goes live.
- **Live gates:** an end-to-end suite (`prove`) that boots the real Worker against a real
  D1, walks every endpoint, performs one real store read per server-readable store, and
  has a `--live <url>` mode for production. Extended per feature: a real push to a real
  browser, a real Telegram round-trip (once the owner's bot exists), a real grocery recipe
  against one real address the owner provides.
- **Browser suites** at 390px and 1280px, light and dark, for every screen (P5 onward).

## 23. Non-goals (with reasons)

- **Gift cards / cashback / refer-and-earn:** real money, KYC, supplier contracts.
- **Food delivery compare (Swiggy/Zomato menu items):** location- and time-fragile;
  revisit after grocery compare proves the recipe machinery at scale.
- **Server-side reading of bot-walled stores:** against rule 1, forever.
- **iOS app:** Apple developer account + review; iPhone users get the PWA and Telegram.
- **Years of back-history on day one:** history starts at first observation and says so
  ("tracking since …"). Paid history feeds may be evaluated later for Amazon only.

## 24. Build order (standalone phases, sized as one focused session each)

Each phase ships something usable and leaves every gate green. Early phases create the
spine everything else hangs on; do not reorder the first four.

**Where the existing work lands:** P0–P2 are already built, deployed, and gated (that's
the S1–S3 core). A fresh session starts at **P3**, checks each earlier phase's acceptance
line against the live system, and only rebuilds what fails its line.

- **P0 — Spine.** Contracts (`ProductKey`, `Observation`, `Alert`, money-in-paise),
  store registry, Worker + D1 schema (write-on-change prices, FTS5 titles), cron
  re-checker, `POST /api/observations` with trust rules, `GET /api/product` with
  history + verdict, minimal working website (strict CSP, SVG step chart), Amazon reader
  server-side, first fixtures, prove suite. *A link pasted into the site gets truth.*
- **P1 — Go live + extension.** Deploy (migrate DB first, then Worker). MV3 extension:
  panel with graph/verdict/alert box, observation posting, one store's DOM recipe.
- **P2 — Alerts everywhere.** Web Push (RFC 8291, byte-exact against the RFC's vector),
  Telegram bot + one-time-code linking, "My alerts" page, installable PWA manifest.
- **P3 — Reader-config DSL + config service.** §6 in full: config interpreter shared by
  website edge cases, extension, and later the app; ETag caching; config CI with fixture
  dry-runs; reader-health telemetry. Migrate the P1 reader onto configs.
- **P4 — Android app.** WebView shell + Super Browse grid + in-app readers (same bundle
  as the extension) + share target + "Save this page" fixture capture + FCM alerts.
- **P5 — Design system.** The full UI from the design brief across website + app:
  every screen at 390px and 1280px, light and dark.
- **P6 — Store coverage.** New shopping stores one at a time, each fixture-verified;
  generic platform recipes (Shopify & co.); official affiliate feeds checked first for
  any store the server can't read; sale-calendar config.
- **P7 — Grocery compare.** Platform registry, search/price/address/cart recipes, basket
  compare, category map, per-100g normalization, location-bound labelling.
- **P8 — Deals, look-alikes, Lens, coupons.** §11, §10.3, §19, §15.
- **P9 — Travel + rides.** Deep-link compare (one search → every OTA/airline/ride app),
  indicative calendars once observation volume allows, flight price alerts.
- **P10 — Spend Lens.** Local-first order parsing and aggregates, the no-upload test,
  optional aggregate sync.
- **P11 — Job-ready.** SSR product meta for sharing/search, abuse review (shared-IP
  limits), full live pass on all surfaces, README case study, store listing prep.

Done means: every surface renders the same verdicts from the same server, every store
reader is fixture-verified and config-driven, and the reader-health dashboard would tell
the operator about a broken store before users do.
