# Britto: design brief for Claude Design

**How to use this file:** copy everything inside the box under "Prompt" into Claude Design
(claude.ai → Design). When the design is done, export it and put the zip in `britto/design/`.
Session S4 turns it into the live site against the integration contract at the bottom.

---

## Prompt (paste this into Claude Design)

```text
Design a complete web app called "Britto". It is a price-history and
honest-discount tool for Indian online shoppers, in the same category as BuyHatke, Keepa or
CamelCamelCamel, but its own brand. Do NOT use BuyHatke's name, logo, colours or layout.

WHAT IT DOES
- A shopper pastes an Amazon.in, Flipkart or Myntra product link (or types the Britto
  address in front of the link in the address bar) and sees that product's price history.
- Britto says plainly whether NOW is a good time to buy, and whether the "sale" is real:
  it judges a discount against the product's OWN usual price, not against the inflated
  M.R.P. printed beside it. It also catches "raised the price, then 'dropped' it".
- Shoppers set price alerts (below a target, any drop of X%, or back in stock), delivered
  by Telegram or browser notification. No account and no password.
- On a phone, a shopper can skip the website entirely: share a product from the store's app
  to the Britto Telegram bot, which replies with the verdict and one-tap alert buttons.
- A browser extension shows the same panel on the store's own product page.

PERSONALITY
Confident, calm and honest. A friend who checks the receipts. Bold, modern and premium, not a
coupon-site template: no flashing banners, no countdown timers, no "HURRY". Big clear numbers.
Rupee amounts use Indian grouping (₹1,29,900). Dates look like "26 Oct 2026". English UI.
Light AND dark theme for every screen. Every
screen must work at 390 px phone width with no sideways scrolling, and at 1280 px desktop.

HONESTY RULES (these are product rules, design them in, do not design them away)
1. Never invent numbers: no "saved ₹500 crore", user counts, ratings or testimonials. If a
   screen needs a number, use the real sample data below.
2. "Too early" is a first-class state, not an error. For the first 7 days a product is
   watched there is no verdict and no sale check. Most products a shopper adds will be in
   this state, so design it to look intentional and reassuring ("we started watching it
   today; a fair call needs 7 days"), and show what IS known (price now, M.R.P., lowest so far).
3. Show the claimed discount (vs M.R.P.) and the real discount (vs usual price) side by side,
   so the gap is obvious: "Claims 56% off · Really 0% vs its usual ₹305".
4. Out-of-stock periods on the chart are gaps (shaded), never a line drawn through them.
5. Some stores refuse automated reading. For those, prices come from the extension. A
   product can therefore be "waiting for its first price": design that state too.

SCREENS TO DESIGN
1. Home: a big paste-a-link box as the hero; one line explaining the "Britto address before
   any link" trick; a "On your phone? Send links to our Telegram bot" line; "Real price drops" (cards); "Most viewed"; supported stores row; a short
   "How we judge a deal" explainer (usual price = time-weighted median of the last 30
   days; 5% under it = a real drop; raised-then-dropped is flagged); extension and
   alerts call-to-action blocks.
2. Product page (the most important screen):
   - product image, store name, title, price now, M.R.P. struck through, "checked 3 min ago",
     "tracking since …", "Open on Amazon.in" button;
   - VERDICT card with 5 states: Good time to buy (green), Fair price (neutral),
     Wait: it is usually cheaper (amber/red), Too early to judge (neutral, reassuring),
     Not available to buy (grey). Each shows 1–3 plain reasons with numbers;
   - SALE CHECK card with 5 states: Real price drop, Raised then "dropped", No real drop,
     Too early to check, Unavailable. Claimed vs real discount side by side;
   - PRICE HISTORY chart: a STEP line (a price holds until it changes), range buttons
     1M / 3M / 6M / All, shaded out-of-stock gaps, a dot on the lowest price, hover/touch
     tooltip "₹265 · 26 Oct 2026";
   - stats row: Lowest (with date), Highest (with date), Usual price, Price changes;
   - SET ALERT panel: three choices (Below ₹___ / Any drop of __% / Back in stock) and
     two delivery channels (Telegram, browser notification), with the connect-Telegram step;
   - COMPARE ACROSS STORES block, including its empty state ("not matched at other stores yet");
   - the "waiting for first price" state.
3. Search results (cards; empty state that offers "paste the link to start tracking").
4. Deals page: only real drops; filter by store and minimum real discount; sort by biggest
   real drop / newest; every card shows real vs claimed discount.
5. My alerts: list of alerts with product, rule, current price, status (watching / sent on
   date with the message); delete; "Where alerts go": Telegram (connect / connected /
   disconnect), notifications in this browser (turn on / on / turn off), "Send a test alert";
   the iPhone state ("add Britto to your Home Screen first, or use Telegram").
6. Extension: (a) a landing page for installing it; (b) the in-page panel it injects on an
   Amazon/Flipkart/Myntra product page: 360 px wide, collapsible, mini chart + verdict +
   sale check + "Set alert" + "Open on Britto".
7. Stores page: a table of stores with an honest status per store ("Our server reads it" /
   "Refuses our server: read by the extension") and the measured note.
8. Spend Lens: a private view of your own spending (by month, store, category) computed in
   your browser from your order pages; a clear "nothing leaves your browser" statement.
9. States: loading skeletons, errors ("That link is not a single product page"), rate limit
   ("You can add 30 new products an hour"), 404.

REAL SAMPLE DATA (use these exact values)
- Cello Butterflow Simply Ball Pen Set | Pack of 25 Ball Pens — Amazon.in — ₹265,
  M.R.P. ₹299 (11% off M.R.P.), in stock, tracking since 26 Oct 2026 → verdict "Too early".
- Cello Pinpoint Ballpoint Pens, Blue, Pack of 10 — Amazon.in — ₹155, M.R.P. ₹199.
- HRX by Hrithik Roshan Men Yellow Printed Cotton T-shirt — Myntra — ₹305, M.R.P. ₹699
  (claims 56% off; after 30 days at ₹305 the sale check says "No real drop").
- boAt Airdopes 141 (Bold Black) — Amazon.in — "Currently unavailable".
- Apple iPhone 15 (Black, 128 GB) — Flipkart — waiting for its first price (Flipkart
  refuses automated reading; the extension records it).
For charts that need history, invent a plausible SHAPE only, and label it in the design as
sample history.

DELIVERABLE
All screens above, light and dark, desktop and 390 px phone, with a small component sheet
(cards, verdict/sale states, chart, buttons, inputs, badges) and the colour/type tokens.
```

---

## Integration contract (for session S4, not for Claude Design)

The live site keeps a strict Content-Security-Policy (`script-src 'self'`, no inline script,
no CDN). A Claude Design export runs React + Babel from unpkg at runtime, which that policy
forbids and which costs ~1.5 s of blank boot (measured in `meridingo/`). **So S4 treats the
export as the visual spec and rebuilds it in `web/` in plain HTML/CSS/JS.** Using the export
directly instead means vendoring React/Babel and adding `'unsafe-eval'`. That is the owner's
call, and it is not recommended.

Data comes **only** through `web/api.js` (the exported functions are the contract):

| Function | Returns | Shapes in |
|---|---|---|
| `trackProduct(url)` | `{ created, product: ProductView }` | `core/types.ts` |
| `getProduct(key)` | `{ product: ProductView }`; throws `code: 'not_tracked'` | |
| `searchProducts(q)` | `{ q, results: ProductCard[] }` | |
| `getDeals()` / `getRecent()` / `getPopular()` | `{ results: ProductCard[] }` | |
| `getStores()` | `{ stores: Store[] }` | |
| `getConfig()` | `AppConfig`: which alert channels are on (`telegram.bot`, `push.publicKey`) | |
| `getMe()` | `MeView` or `null` (this browser has no alerts yet) | |
| `setAlert(key, rule)` / `removeAlert(id)` | `{ alert?: AlertView, me: MeView }` | |
| `connectTelegram()` / `disconnectTelegram()` | `{ url }` (a one-time t.me link) / `{ me }` | |
| `savePush(sub)` / `deletePush(sub)` / `sendTest()` | `{ me }` / `{ result }` | |
| `rupees(paise)`, `pct(f)`, `date(ms)`, `ago(ms)`, `toPaise(text)` | display strings / paise | |

State mapping the design must cover (all from `core/types.ts`):

- `ProductView.verdict.kind`: `buy | fair | wait | too_early | unavailable`
- `ProductView.sale.status`: `real_drop | hike_then_drop | no_real_drop | too_early | unavailable`
- `ProductView.pending`: string or null (the "waiting for first price" notice)
- `PricePoint.inStock === false` / `price === null`: chart gap
- `Store.serverFetch`: `yes | refused | no_answer | untested`

Money is integer **paise** everywhere (`26500` = ₹265). Never format it with `toFixed` or
`toLocaleString`. Use `rupees()`.

Alerts (S3) and the extension panel (S2) exist and work; the browser-push and Telegram
connection code in `web/app.js` (`enablePush`, `telegramButton`, `waitForTelegram`) carries
the browser rules that took testing to get right (incognito refusal, iPhone Home Screen,
popup blocking after a network wait): keep it, restyle it.

Things the designer will design that do not exist yet. Each lands in its own session, per PLAN.md:
compare across stores (S5), deals filters (S6), Spend Lens (S7).
