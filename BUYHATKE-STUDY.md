# BuyHatke next to Britto: what was measured on 2026-11-10

**How this was done.** BuyHatke's public website was opened in real Chrome as an ordinary
visitor (no login), page by page, and the text and screenshots were read. The same things were
then asked of Britto's live site. BuyHatke's app and extension were **not** taken apart or
decompiled (this project's rule), so anything about their inner workings is marked **inferred**.
"Measured" means it was seen in this session.

## The short answer

Britto's features are real, but three things make BuyHatke feel ten times bigger, and none of
them is a missing screen:

1. **Data age.** BuyHatke's graph for an iPhone 15 runs from July 2025 to today (measured: about
   16 months on the "Max" view). Britto started watching its oldest product on 2026-10-24.
   A product page tracked 14 days had 4 price points (measured, `amazon:B01INWEX9U`).
2. **Catalogue.** BuyHatke answers for any pasted link from "200+" Indian sites. Britto's server
   reads Amazon, Vijay Sales, Nykaa and ShopClues; on the live home lists 47 of 48 products were
   Amazon, and 37 of 48 said "too early to judge".
3. **Other stores' prices on the website.** BuyHatke's product page showed **26 prices** for one
   iPhone (Flipkart, Croma, Vijay Sales, Reliance Digital, Zepto and more) with no app. Britto
   shows other stores only inside the Android app.

Its own "How we earn" page says the extension reads prices on the store pages its users visit
and that Amazon cancelled its affiliate account for that. With 8M+ users (its own figure) that
is millions of readings a day from shoppers' browsers. **Inferred:** that crowd is where its
depth comes from. Britto is built the same way (extension + app report prices) but has almost no
users yet, so the same engine is running nearly empty.

## Feature by feature

| BuyHatke (measured on its site) | Britto today (measured live) | Gap |
|---|---|---|
| Paste any link, or put `buyhatke.com/` before it → product page | Paste a link → product page. Flipkart and Myntra links are accepted but show no price until an app or extension user opens that page; Croma link refused ("unsupported store") | Stores, and prices for stores the server cannot read |
| Price graph: 1 month / 3 months / Max, about 16 months of data | Graph: 1M / 3M / All, data since first tracked | Data age only |
| **Deal Score 0–100** with a points breakup (last sale price, all-time low, 6-month low, average, "price hiked before sale") | Verdict (buy / fair / wait) + fake-sale check. **Deal score added today** (see below) | Closed today |
| "Compare 26 available prices" on the product page, cheapest first, "36% cheaper" | "Check prices on 9 stores" in the Android app only | Website has no cross-store prices |
| Deals: categories (phones, headphones, air fryers…), filters by store, minimum discount, price ceiling; each card "Usually ₹X, N% less" | `/api/deals` returned **0 deals** (no product yet has 7 priced days plus a real drop); "price drops" list works | Catalogue age and size; no categories |
| Price alert at a target price (login needed), email + push | Alerts with no login: Web Push, app notification, Telegram (bot not created yet) | Britto is ahead on "no login"; Telegram waits on the owner |
| Flights: one search, live fares from "500+ airlines and sites" on the website, alerts | Flights compared in the app from 4 sites (MakeMyTrip, ixigo, Goibibo, EaseMyTrip); website gives links | Website has no live fares. **Inferred:** BuyHatke uses a paid fare feed |
| Hotels: quotes from booking sites, more sites "through your browser session" with the extension | Hotels in the app (Booking.com, Cleartrip) | Similar method, fewer sites |
| Cabs: Ola, Uber, Rapido, Namma Yatri, in its app | Uber + Rapido in the app, merged cheapest-first | Ola and Namma Yatri missing |
| Grocery: Blinkit, Zepto, Instamart by delivery address, on the website | Logic built; no store readable until pages are saved from a phone | Not working yet |
| Food: Swiggy, Zomato with fees and coupons, "logins stay in your browser" | Not built | Missing |
| Spend Lens: reads your own orders on Amazon, Flipkart, Myntra, Zomato… | Built for app + extension; reads nothing until one real orders page is saved | Waits on the owner (HISTORY item 4c) |
| Product Lens: an AI research page per product (specs, ratings, top-10 lists) | Lens = search by photo | Different feature under the same name |
| Auto coupons at checkout | Shows the store's own offers; coupon votes | Not built (and risky: it types into checkout pages) |
| Gift cards, refer & win, goodies | Not planned | Money and contracts, not code |

## What was built today

1. **Deal score on every product page**, 0 to 100, the sum of three parts shown with their
   numbers: against the usual price (50), how much of the watched time it cost more than today
   (35), and whether the price was raised before this drop (15). A price that never moved scores
   40 ("Fair price"), because being the only price ever seen is not a deal. A product with too
   little history gets **no score**, not a guess. The design is Britto's own; only the idea of a
   visible points breakup is shared with BuyHatke.
2. **Vijay Sales' newer links** (`/p/P245195/245195/name`) were refused as "not a product".
   BuyHatke's own home page links to one. Fixed; the price reader already read those pages
   (₹1,26,900, M.R.P. ₹1,34,900 on the real page saved today).

## What closes the rest, in order of effect

| # | Step | Who | Why it matters |
|---|---|---|---|
| 1 | **Other stores' prices on the website product page**, from the stores the server may read (Amazon search, Vijay Sales, Nykaa, ShopClues) plus the latest prices app and extension users have reported for the same product | A session | Turns every product page into a comparison without the app; the single most visible BuyHatke screen |
| 2 | **A bigger, faster-growing catalogue**: seed more Amazon best-seller categories and keep them re-checked, so deals and scores fill up within a week or two | A session (must measure Cloudflare's free limits first) | Deals page stops being empty |
| 3 | **Deals by category** with store / discount / price filters | A session, after 2 | Matches BuyHatke's deals page |
| 4 | **Chrome Web Store + Play Store listings** | Owner (developer accounts: $5 once, $25 once) | BuyHatke's depth comes from its users' browsers. Without installs Britto's Flipkart, Myntra and Croma history cannot grow |
| 5 | **Flipkart Affiliate feed** | Owner signs up (HISTORY item 9) | The honest way to Flipkart prices on the website with no app |
| 6 | Telegram bot token, one saved orders page, grocery pages from a phone | Owner (HISTORY items 2, 4c, 8) | Each switches on a feature that is built but idle |
| 7 | Live flight fares on the website | Needs a fare partner (Travelpayouts account: cached fares, labelled as such) | Website flights today are links only |
| 8 | Food compare; Ola and Namma Yatri | A session + the owner's logged-in pages | Same method as Uber and Rapido |

**What no session can do:** give Britto 16 months of past prices. History starts the day a
product is first watched. A paid history source for Amazon exists (Keepa); its price and India
coverage have **not been checked**.
