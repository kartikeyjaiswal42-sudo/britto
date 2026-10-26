# Britto API contract

Types: `core/types.ts` (the source of truth; this file explains it). Money is integer
**paise**. Times are **milliseconds** since the epoch. Every error is
`{ "error": { "code": "<stable>", "message": "<for people>" } }`.

## Endpoints (live in S1)

| Method & path | Body / query | 2xx response | Error codes |
|---|---|---|---|
| `GET /api/health` | | `{ ok: true, time }` | |
| `GET /api/stores` | | `{ stores: Store[] }` | |
| `POST /api/products` | `{ "url": "<product link>" }` | `201 { created: true, product: ProductView }` or `200 { created: false, … }` when already tracked | `400 bad_json` `400 bad_url` `422 not_a_url` `422 unsupported_store` `422 not_a_product` `422 short_link_unresolved` `429 rate_limited` |
| `GET /api/products/<key>` | key URL-encoded, e.g. `amazon%3AB09X5DK382` | `{ product: ProductView }` | `400 bad_key` `404 not_tracked` |
| `GET /api/search?q=` | words; punctuation ignored | `{ q, results: ProductCard[] }` (≤ 30) | |
| `GET /api/deals` | | `{ results: ProductCard[] }`: `sale_status = real_drop`, in stock, biggest real drop first | |
| `GET /api/recent` | | `{ results: ProductCard[] }` newest first | |
| `GET /api/popular` | | `{ results: ProductCard[] }` most viewed | |
| `POST /api/observations` | `{ "url": "<product page>", "observed": { status: "priced"\|"unavailable", title, image, price, mrp } }` (paise) | `{ recorded: "accept"\|"hold"\|"skip", reason, product: ProductView }` | `400 bad_json` `400 bad_url` `422 bad_observation` `422 unsupported_store` `422 not_a_product` `429 rate_limited` |

Pages: `/`, `/p/<key>`, `/search?q=`, `/deals`, `/stores` serve the app; `/bot` explains
the crawler. **Prefix form:** `/<any supported product link>` (with or without `https://`)
redirects `302` to `/p/<key>?add=1`, and the page adds the product if nobody has yet.

## Limits

- `POST /api/products` that **creates** a product: 30 per client per hour (`ADDS_PER_HOUR`),
  keyed by a SHA-256 of the client IP (the IP itself is not stored). Already-tracked
  products always open.
- Scheduled re-check: every 5 minutes, at most `PER_RUN = 4` products, only stores with
  `serverFetch: 'yes'`. Products with an alert are re-read every 3 h, others every 12 h;
  failures back off ×2 each time, capped at 7 days (`core/schedule.ts`).

## Storage rules

- A `prices` row is written **only when price, M.R.P. or stock state changes**. A check that
  finds the same price moves `products.last_checked_at` (an update, not an insert).
- History is a step function: each point holds until the next, and the last holds until
  `lastCheckedAt`, **never until "now"** (`core/history.ts spans`).

## Extension reports (`POST /api/observations`)

A report is a claim; `core/trust.ts` decides:

| Situation | Result |
|---|---|
| Same price/stock as the latest point, last check < 10 min ago | `skip` (nothing written) |
| Product has no history | `accept` (`first`) |
| Goes out of stock | `accept` (`stock_change`) |
| Price moves < 40% from the last real price | `accept` (`small_change`) |
| Moves ≥ 40% | `hold`, until a DIFFERENT network (hashed IP) reports within 2% inside 48 h → `accept` (`confirmed`) |

Also: 150 reports per network per hour; creating a product counts against the 30-adds limit;
a report fills a blank title/image but never replaces one; an accepted change on a store our
server reads (Amazon) clears `last_attempt_at` so the next cron run re-reads it.
`image` must be https on `m.media-amazon.com`, `rukminim*.flixcart.com` or
`assets.myntassets.com`, else it is dropped.

## Alerts (S3)

No account, no password. An **owner** is a browser (it holds a random device token from
`POST /api/me`; the server keeps only its SHA-256) and/or a Telegram chat. Browser calls send
`Authorization: Bearer <token>`; without a valid one they get `401 no_device`.

| Method & path | Body | 2xx response | Error codes |
|---|---|---|---|
| `GET /api/config` | | `AppConfig { telegram: {bot} \| null, push: {publicKey} \| null, maxAlerts }` | |
| `POST /api/me` | | `201 { token, me: MeView }` (the token is shown once) | `429 rate_limited` (60 browsers per network per hour) |
| `GET /api/me` | | `{ me: MeView }` | `401 no_device` |
| `POST /api/alerts` | `{ key, rule }` rule = `{kind:'below', target: paise}` \| `{kind:'drop', pct: 1–90}` \| `{kind:'in_stock'}` | `201 { alert: AlertView, me }` | `400 bad_json` `400 bad_key` `422 bad_rule` `404 not_tracked` `422 too_many_alerts` (50) `429 rate_limited` |
| `DELETE /api/alerts/<id>` | | `{ me }` | `404 no_such_alert` (also for someone else's alert) |
| `POST /api/me/telegram` | | `{ url: "https://t.me/<bot>?start=<code>", bot, expiresAt }` (one use, 15 min) | `503 telegram_off` |
| `DELETE /api/me/telegram` | | `{ me }` | |
| `POST /api/me/push` | `{ subscription: PushSubscription.toJSON() }` | `{ me }` | `422 bad_subscription` `422 push_service_not_allowed` `422 too_many_browsers` (10) `503 push_off` |
| `DELETE /api/me/push` | `{ subscription }` | `{ me }` | |
| `POST /api/me/test` | | `{ result: { telegram: sent\|failed\|blocked\|not_connected\|off, push: {sent, gone, failed} } }` | `429` (5 an hour) |
| `POST /api/telegram/webhook` | a Telegram Update | always `200` (Telegram retries anything else) | `401` without the secret header |

One alert per owner, product and kind: setting it again replaces it.

**When an alert may fire** (`core/alerts.ts`, decided edge-triggered: once when the condition
becomes true, then silent until it has been false again):

- on every successful reading **by our server** of a product with alerts (not only on a
  change: an extension report may have shown the price first, and this reading confirms it);
- on an accepted extension report **only for stores our server cannot read** (Flipkart,
  Myntra). On Amazon an extension report never fires an alert; it queues a server re-read.

Delivery: Telegram `sendMessage` to the linked chat, and Web Push (RFC 8291 aes128gcm, RFC 8292
VAPID) to each subscribed browser. A chat that blocked the bot (403) is unlinked; a push
endpoint answering 404/410 is deleted. Push endpoints must be on `fcm.googleapis.com`,
`updates.push.services.mozilla.com`, `*.push.apple.com` or `*.notify.windows.com`.

**The Telegram bot** (webhook set automatically once `TELEGRAM_BOT_TOKEN` exists; secret
header = first 48 hex of SHA-256 of `britto-webhook:<token>`): a product link anywhere in a
message → price, verdict, sale check, history link and alert buttons (`d|key` any drop,
`b|paise|key` below, `s|key` first price / back in stock); `/alerts` with remove buttons;
`/start <code>` links a browser; `/stop` (Telegram-only: deletes the owner and its alerts;
linked: disconnects, alerts stay). Private chats only; 60 messages and 30 new products per
chat per hour.

## Reader configs and reader health (P3)

| Method & path | Body / query | 2xx response | Error codes |
|---|---|---|---|
| `GET /api/config/reader` | `store=<id or number>` (amazon 1, flipkart 2, myntra 3), `device=desktop\|mobile` (default desktop), `v=<client version>` (ignored) | the `ReaderConfig` (`core/recipe.ts`) plus `version`, `storeNumber`, `features: { deviceFallback }`. `ETag: "<version>"`, `Cache-Control: public, max-age=600`; `If-None-Match` with the current version → `304` without a body. No mobile recipe → the desktop one with `deviceFallback: true` | `404 no_reader` `400 bad_device` |
| `POST /api/telemetry` | `{ feature: "read", store, outcome: "blocked"\|"unrecognised", configVersion?, readerVersion?, client?: "extension"\|"app" }` | `202 { ok: true }` | `400 bad_json` `422 bad_telemetry` `429` (600 per network per hour) |
| `GET /api/health/readers` | | `HealthReport` (`api/readers.ts`): per store, last 24 h: reads, by outcome / source / config version, `failRate`, last 6 h; `warnings` (`no_reads`: read in the last 7 days, not in 6 h; `failing`: ≥ 50% unrecognised or blocked with ≥ 5 reads in 6 h); the config log | |

`POST /api/observations` also takes optional `configVersion`, `readerVersion` (1–80 of
`[A-Za-z0-9_.-]`, else `422 bad_observation` naming the field) and `client`. Every reading,
the server's own included, is counted in `reader_health` (hour, store, source, config
version, reader version, outcome): counts only, no page content, no client id.

A config's `version` is `<store>.<device>.r<revision>.<12 hex of a hash of its content>`:
any change to the content changes it. Clients refuse a served config that does not
validate or does not hash to its version (`configFromServed`). The Worker uses the newest
D1 row in `reader_configs` for a store and device that validates, else the bundled file;
`scripts/publish-reader.mjs` writes those rows only after a dry run on every saved page.

`Store` gained `num` (the stable number above) and `home` (the store's https front page,
P4: Super Browse opens it). Page `/browse` (P4) lists the stores; the Android app opens each
in its in-app browser.

## Stores and sale events (P6)

`StoreId` adds `vijaysales` (4), `reliancedigital` (5), `nykaa` (6), `shopclues` (7). Product
keys: `vijaysales:<id>` (links `/p/<id>/<name>`; the name is required, `/p/<id>` alone is a 404),
`reliancedigital:<handle>` (links `/product/<handle>`, lower-cased), `nykaa:<id>` (links
`/<name>/p/<id>`), `shopclues:<id>` (links `/<name>-<id>.html`).

`ProductView.saleEvents`: the store's sale events `{store, title, from, to, source}` (ms; `to`
null = end date not published). From `readers/sales.json`, validated by `core/sales.ts`.

Every reader: a price under ₹1 makes the reading `unrecognised` (rule `<store>:implausible-price`);
an M.R.P. under ₹1 is dropped.

## Grocery compare (P7)

| Method & path | Body | 2xx response | Error codes |
|---|---|---|---|
| `GET /api/grocery/platforms` | | `{ platforms: GroceryPlatform[] }` (id, name, home, measured) | |
| `POST /api/grocery/compare` | `{ address, ref: {item, brand?, pack?}, quotes: GroceryQuote[] }` (1–40) | `{ comparison: ItemComparison, computedAt }` | `400 bad_json` `422 bad_address` `422 bad_ref` `422 bad_quotes` `429` (300/h per network) |
| `POST /api/grocery/basket` | `{ address, items: [{ref, quotes}] (1–30), delivery?: {platform: paise} }` | `{ items: ItemComparison[], totals: BasketTotal[], computedAt }` | as above, `422 bad_items` `422 bad_delivery` |

Types in `core/grocery.ts`. A quote is `{platform, address, title, brand, pack, price, mrp,
inStock, at}` in paise; quotes for another address are left out (`leftOut`), never compared.
Nothing is stored.

## The Android app (P4)

Same API, same trust rules. Its readings and telemetry carry `client: "app"` and
`readerVersion: "app-<version>"`; it asks for `device=mobile` reader configs. Its requests to
Britto say `User-Agent: BrittoApp/<version> (Android)`; its WebView of the Britto site adds
` BrittoApp/<version>` to the phone's own User-Agent (store pages see the phone's WebView
unchanged).

## Planned (later sessions, not live)

- Compare across stores (S5), deals filters and coupons from the page (S6), Spend Lens (S7).
