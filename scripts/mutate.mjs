// Prove the tests able to fail (CLAUDE.md rule 3): break the code on purpose, run the suite,
// and require that it fails on EXACTLY the expected checks. Every file is restored afterwards,
// also on Ctrl-C or a crash.
//   node scripts/mutate.mjs            every mutant
//   node scripts/mutate.mjs <filter>   mutants whose name contains <filter>
// A mutant: one exact text replacement in one file (the text must occur exactly once), the
// command to run, and patterns for the names of the checks that must fail. Names are read
// from `not ok N - <name>` (node --test), `FAIL  <name>` (prove/extension) and
// `DIFF <name>` (check-readers).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UNIT = ['node', ['--test', 'core/recipe.test.ts', 'core/extract.test.ts', 'core/select.test.ts']];
const CHECK = ['node', ['scripts/check-readers.mjs']];
const UNIT2 = ['node', ['--test', 'core/sales.test.ts']];
const GROCERY = ['node', ['--test', 'core/grocery.test.ts']];
const TRAVEL = ['node', ['--test', 'core/travel.test.ts']];
const LISTING = ['node', ['--test', 'api/listing.test.ts']];
const FARES = ['node', ['--test', 'core/fares.test.ts']];
// The slow ones (a real Worker; prove also makes its real amazon.in requests): run them by name.
const PROVE = ['node', ['scripts/prove.mjs']];
const EXTENSION = ['node', ['scripts/extension.mjs']];
const APP = ['node', ['scripts/app.mjs']];
const GRADLE_TEST = ['sh', ['-c', 'cd android && ./gradlew --no-daemon testDebugUnitTest 2>&1']];
// The app's fare reader in a real Chrome (needs PW_DIR, as the other browser scripts).
const FARES_READER = ['node', ['scripts/fares-reader.mjs']];

export const MUTANTS = [
  {
    name: 'validator ignores unknown top-level keys',
    file: 'core/recipe.ts', find: "  unknownKeys(input, TOP_KEYS, 'config', errors);\n", replace: '',
    run: UNIT, expect: [/refuses what it does not understand/],
  },
  {
    name: 'validator lets a recipe set identity headers',
    file: 'core/recipe.ts', find: 'if (IDENTITY_HEADER.test(h))', replace: 'if (false && IDENTITY_HEADER.test(h))',
    run: UNIT, expect: [/refuses what it does not understand/],
  },
  {
    name: 'version id ignores the content',
    file: 'core/recipe.ts', find: 'fnv(canonicalJson(c))', replace: "fnv(c.store + c.device)",
    run: UNIT, expect: [/configVersion/],
  },
  {
    name: 'only the first regex alternative is tried',
    file: 'core/interpret.ts', find: '      if (hit != null) break;\n', replace: '      break;\n',
    run: UNIT, expect: [/regex alternatives/],
  },
  {
    name: 'regex match index ignored',
    file: 'core/interpret.ts', find: 'if (n++ === (field.match ?? 0))', replace: 'if (n++ === 0)',
    run: UNIT, expect: [/regex alternatives/],
  },
  {
    name: 'API rows keep rupees (no paise conversion)',
    file: 'core/recipe.ts', find: 'price: f.price ? rupeesToPaise(jsonPath(item, f.price)) : null,', replace: 'price: f.price ? (jsonPath(item, f.price) as number) : null,',
    run: UNIT, expect: [/readApiRows/],
  },
  {
    name: 'API row filter ignores ne',
    file: 'core/recipe.ts', find: 'if (m.ne && fill(m.ne).some((x) => eqLoose(v, x))) return false;', replace: '',
    run: UNIT, expect: [/readApiRows: root fallbacks/],
  },
  {
    name: 'jsonPath does not step into the first array element',
    file: 'core/recipe.ts', find: '(cur[0] as Record<string, unknown> | undefined)?.[seg]', replace: 'undefined',
    run: UNIT, expect: [/jsonPath and fillTemplate/, /jsonld paths/],
  },
  {
    name: 'interpreter falls back to any price on the page',
    file: 'core/interpret.ts',
    find: "  const price = parseRupees(firstOf(d.price, ctx));\n",
    replace: "  const price = parseRupees(firstOf(d.price, ctx)) ?? parseRupees(/₹\\s*([\\d,]+(?:\\.\\d{1,2})?)/.exec(html.replace(/<[^>]+>/g, ''))?.[1]);\n",
    run: UNIT, expect: [/never a price from outside the price fields/, /price box present but no "price to pay"/],
  },
  // ---- config CI (scripts/check-readers.mjs) on the real fixtures
  {
    name: 'Amazon recipe forgets "currently unavailable"',
    file: 'readers/amazon.desktop.json', find: '"currently unavailable", ', replace: '',
    run: CHECK, expect: [/^amazon-boat-variant-unavailable\.html (status|inStock|pid)/, /^amazon-iphone15-unavailable\.html (status|inStock|pid)/],
  },
  {
    name: 'Myntra recipe reads the M.R.P. as the price',
    file: 'readers/myntra.desktop.json', find: '"json": "pdpData.price.discounted"', replace: '"json": "pdpData.price.mrp"',
    run: CHECK, expect: [/^myntra-instock\.html price/],
  },
  {
    name: 'Flipkart recipe loses its error-page markers',
    file: 'readers/flipkart.desktop.json', find: '"blocked": [["Something went wrong!", "\\\\bE00\\\\d\\\\b"]],', replace: '',
    run: CHECK, expect: [/^flipkart-blocked-e002\.html (status|deleting the blocked marker)/],
  },
  {
    name: 'Vijay Sales recipe reads the hidden "offer price" block instead of the VS price',
    file: 'readers/vijaysales.desktop.json', find: '"selector": [".vsPrice", ".product__price--price"]', replace: '"selector": [".product__price--price"]',
    run: CHECK, expect: [/^vijaysales-airfryer-instock\.html (status|price|mrp|inStock|pid)/],
  },
  {
    name: 'Vijay Sales recipe ignores the store\'s own stock statement',
    file: 'readers/vijaysales.desktop.json', find: '"outOfStockText": ["outofstock", "soldout", "discontinued"]', replace: '"outOfStockText": ["discontinued"]',
    run: CHECK, expect: [/^vijaysales-airtag-outofstock\.html (status|price|mrp|inStock|deleting)/],
  },
  {
    name: 'Reliance Digital recipe trusts schema.org stock instead of the page\'s sellable flag',
    file: 'readers/reliancedigital.desktop.json',
    find: '"fields": [{ "selector": [], "attribute": "innerHTML", "global": true, "regex": ["\\"product_meta\\":\\\\{\\"sellable\\":(true|false)"] }]',
    replace: '"fields": [{ "selector": [], "attribute": "textContent", "jsonld": "offers.availability" }]',
    run: CHECK, expect: [/^reliancedigital-gopro-notsellable\.html (status|price|mrp|inStock|deleting)/],
  },
  {
    name: 'interpreter accepts a ₹0 price',
    file: 'core/interpret.ts', find: "  if (price < MIN_PRICE) return result({ status: 'unrecognised', title, image, rule: rule('implausible-price') });\n", replace: '',
    run: CHECK, expect: [/^nykaa-zero-price-listing\.html (status|price|inStock|pid)/],
  },
  {
    name: 'Nykaa recipe reads the M.R.P. as the price',
    file: 'readers/nykaa.desktop.json', find: '"json": "productPage.product.offerPrice"', replace: '"json": "productPage.product.mrp"',
    run: CHECK, expect: [/^nykaa-(carbamide-instock|boots-last-one)\.html price/],
  },
  {
    name: 'ShopClues recipe ignores the sold-out markers',
    file: 'readers/shopclues.desktop.json', find: '"outOfStockText": ["outofstock", "sold out", "soldout"]', replace: '"outOfStockText": ["discontinued-forever"]',
    run: CHECK, expect: [/^shopclues-babyoil-soldout\.html (status|price|mrp|inStock|deleting|the recipe reads offers)/],
  },
  {
    name: 'chart guesses an end date for an open-ended sale',
    file: 'web/chart.js', find: "to: e.to == null ? null : Math.min(e.to, t1), ongoing: e.to == null }));", replace: "to: Math.min(e.to ?? t1, t1), ongoing: false }));",
    run: UNIT2, expect: [/an open-ended event is a start marker/],
  },
  {
    name: 'usual price from the last 30 days instead of 90',
    file: 'core/judge.ts', find: '  window: 90 * DAY,', replace: '  window: 30 * DAY,',
    run: ['node', ['--test', 'core/core.test.ts']], expect: [/the usual price is the 90-day median/],
  },
  {
    name: 'prove: look-alikes need only one shared word',
    file: 'api/db.ts', find: "    .filter((r) => titleWords(r.title ?? '').filter((w) => set.has(w)).length >= 2)", replace: "    .filter((r) => titleWords(r.title ?? '').filter((w) => set.has(w)).length >= 0)",
    run: PROVE, expect: [/look-alikes: cheaper, in stock, sharing title words/],
  },
  {
    name: 'prove: offers read days ago are still shown',
    file: 'api/db.ts', find: '  if (!row || now - row.at > OFFERS.showFor) return null;', replace: '  if (!row) return null;',
    run: PROVE, expect: [/offers read more than 3 days ago are not shown/],
  },
  {
    name: 'prove: a vote can bring in a code our server never read',
    file: 'api/app.ts', find: "  if (!(await couponKnown(env.DB, store, body.code))) return fail(", replace: "  if (false && !(await couponKnown(env.DB, store, body.code))) return fail(",
    run: PROVE, expect: [/a vote never brings in a code/, /nothing written for refused votes/],
  },
  {
    name: 'prove: one network can vote on a code again and again',
    file: 'api/app.ts', find: '  await voteCoupon(env.DB, store, body.code, voter, body.worked, now);', replace: '  await voteCoupon(env.DB, store, body.code, voter + now, body.worked, now);',
    run: PROVE, expect: [/coupon votes: one per network/, /shown with the code on the product/, /nothing written for refused votes/],
  },
  {
    name: 'prove: deals ignore the store filter',
    file: 'api/db.ts', find: "  if (f.store) { where.push('store = ?'); args.push(f.store); }\n", replace: '',
    run: PROVE, expect: [/deals: filtered by store/, /each deal carries its last 90 days/],
  },
  {
    name: 'grocery compares prices from different delivery addresses',
    file: 'core/grocery.ts', find: "    if (q.address !== address) { leftOut.push({ platform: q.platform, reason: 'priced for another delivery address' }); continue; }\n", replace: '',
    run: GROCERY, expect: [/one item: same address only/],
  },
  {
    name: 'grocery counts a shared brand as half a name match',
    file: 'core/grocery.ts', find: "  const skip = new Set(brand ? nameWords(brand) : []);", replace: "  const skip = new Set<string>();",
    run: GROCERY, expect: [/names: pack sizes and filler words/, /one item: same address only/],
  },
  {
    name: 'grocery basket swaps in a "check this one" item',
    file: 'core/grocery.ts', find: "      const row = it.rows.find((r) => r.platform === p && r.inStock && r.match === 'same');", replace: "      const row = it.rows.find((r) => r.platform === p && r.inStock);",
    run: GROCERY, expect: [/basket: complete baskets first/],
  },
  {
    name: 'grocery best is the cheapest per 100 g even when not the same item',
    file: 'core/grocery.ts', find: "  const best = rows.find((r) => r.inStock && r.match === 'same')?.platform ?? null;", replace: "  const best = rows.find((r) => r.inStock)?.platform ?? null;",
    run: GROCERY, expect: [/one item: same address only/, /no winner when nothing is certainly/],
  },
  {
    name: 'travel: "today" is the server\'s date, not India\'s',
    file: 'web/travel.js', find: 'new Date(now + 5.5 * 3_600_000)', replace: 'new Date(now)',
    run: TRAVEL, expect: [/"today" is India's date/],
  },
  {
    name: 'travel: a return date before the departure is accepted',
    file: 'web/travel.js', find: "(input.ret ? dateError('Return', input.ret, today, input.depart) : null)", replace: "(input.ret ? dateError('Return', input.ret, today) : null)",
    run: TRAVEL, expect: [/flights: what is refused/],
  },
  {
    name: 'travel: an unchecked link format is guessed for round trips too',
    file: 'web/travel.js', find: "['makemytrip', null, (q) => (q.ret || q.cabin !== 'economy' ? null :", replace: "['makemytrip', null, (q) => (false ? null :",
    run: TRAVEL, expect: [/round trip, cabin and international/],
  },
  {
    name: 'travel: Uber pre-filled for an airport it was not seen to recognise',
    file: 'web/travel.js', find: 'const table = seen ? RIDES', replace: 'const table = true ? RIDES',
    run: TRAVEL, expect: [/rides: from the shopper's point to an airport Uber recognises/],
  },
  {
    name: 'travel: anything near an airport counts as the airport for Uber',
    file: 'scripts/uber-airports.mjs', find: "    && !/\\b(unnamed|road|rd|marg|area|colony|fire|station|cargo|parking|hangar|police|hotel|lounge|restaurant|cafe|office|quarters|old)\\b/i.test(name);", replace: ';',
    run: TRAVEL, expect: [/Uber airport check: the place must BE the airport/],
  },
  {
    name: 'travel: a house number in a place called "Airport" counts as the airport',
    file: 'scripts/uber-airports.mjs', find: " && !/^\\s*\\d/.test(name)", replace: '',
    run: TRAVEL, expect: [/Uber airport check: the place must BE the airport/],
  },
  {
    name: 'travel: Cleartrip dates sent as YYYY-MM-DD',
    file: 'web/travel.js', find: "    depart_date: dmy(q.depart), ...(q.ret ? { return_date: dmy(q.ret) } : {})", replace: "    depart_date: q.depart, ...(q.ret ? { return_date: q.ret } : {})",
    run: TRAVEL, expect: [/flights: one search, each site with it filled in/, /round trip, cabin and international/],
  },
  {
    name: 'early stop before the price box has arrived',
    file: 'core/interpret.ts', find: '  if (!es.thenUnavailableOr?.length) return true;\n', replace: '  return true;\n',
    run: CHECK, expect: [/^amazon-cello-(25pens|10pens)-instock\.html early stop/, /^amazon-cello-technotip-paise\.html early stop/],
  },
  {
    name: 'offers read from anywhere on the page, not inside each offer card',
    file: 'core/interpret.ts', find: '    const title = fieldValue(rule.title, part);', replace: '    const title = fieldValue(rule.title, html);',
    run: UNIT, expect: [/readOffers: every offer card in page order/],
  },
  {
    name: 'an offer the page repeats is listed twice',
    file: 'core/interpret.ts', find: '    if (!seen.has(id)) { seen.add(id); out.push(offer); }', replace: '    out.push(offer);',
    run: UNIT, expect: [/readOffers: every offer card in page order/],
  },
  {
    name: 'any text is taken as a coupon code',
    file: 'core/interpret.ts', find: '      code: code != null && COUPON_CODE.test(code) ? code : null,', replace: '      code,',
    run: UNIT, expect: [/readOffers: every offer card in page order/],
  },
  {
    name: 'offer text not capped at 200 characters',
    file: 'core/interpret.ts', find: 'text: text.slice(0, 200)', replace: 'text',
    run: UNIT, expect: [/readOffers: every offer card in page order/],
  },
  {
    name: "another item's offers kept on an identity mismatch",
    file: 'core/interpret.ts', find: '  return { ...rest, status:', replace: '  return { ...ex, status:',
    run: UNIT, expect: [/confirmIdentity: a page showing ANOTHER product/],
  },
  {
    name: 'validator does not check offers',
    file: 'core/recipe.ts', find: '    if (of !== undefined) {', replace: '    if (false) {',
    run: UNIT, expect: [/refuses what it does not understand/],
  },
  {
    name: 'Amazon: early stop before the offers box has closed',
    file: 'readers/amazon.desktop.json', find: '"corePriceDisplay_desktop_feature_div", "vsxoffers_feature_div"', replace: '"corePriceDisplay_desktop_feature_div"',
    run: CHECK, expect: [/^amazon-cello-(25pens|10pens)-instock\.html early stop/, /^amazon-cello-technotip-paise\.html early stop/],
  },
  {
    name: 'Amazon: offer titles read from the wrong element',
    file: 'readers/amazon.desktop.json', find: '"title": { "selector": [".offers-items-title"]', replace: '"title": { "selector": [".vsx-offers-count"]',
    run: CHECK, expect: [/^amazon-cello-(25pens|10pens)-instock\.html offers/, /^amazon-cello-technotip-paise\.html offers/],
  },
  {
    name: 'interpreter falls back to the price in the page\'s own JSON',
    file: 'core/interpret.ts',
    find: "  const price = parseRupees(firstOf(d.price, ctx));\n",
    replace: "  const price = parseRupees(firstOf(d.price, ctx)) ?? parseRupees(/\"priceAmount\":([\\d.]+)/.exec(html)?.[1]);\n",
    run: CHECK, expect: [/^amazon-cello-(25pens|10pens)-instock\.html deleting the price/, /^amazon-cello-technotip-paise\.html deleting the price/],
  },
  // ---- the config service end to end (scripts/prove.mjs) and the extension (scripts/extension.mjs)
  {
    name: 'prove: config endpoint ignores If-None-Match',
    file: 'api/app.ts', find: "  if (asked.includes(etag) || asked.includes('*')) return new Response(null, { status: 304, headers });\n", replace: '',
    run: PROVE, expect: [/asking again with If-None-Match gets 304/],
  },
  {
    name: 'prove: a D1 override is used without validation',
    file: 'api/readers.ts',
    find: "    if (!v.ok) { console.error('reader override refused', store, device, row.created_at, v.errors.join('; ')); continue; }\n",
    replace: "    if (!v.ok) return { config: parsed as ReaderConfig, version: 'unvalidated', origin: 'd1' };\n",
    run: PROVE, expect: [/an invalid newer row in D1 is skipped/, /that server read used the hot-fix/],
  },
  {
    name: 'Amazon phone recipe reads the per-count price as the M.R.P.',
    file: 'readers/amazon.mobile.json', find: '"selector": ["#corePriceDisplay_mobile_feature_div", ".a-price.apex-basisprice-value", ".a-offscreen"]', replace: '"selector": ["#corePriceDisplay_mobile_feature_div", ".a-text-price", ".a-offscreen"]',
    run: CHECK, expect: [/^amazon-mobile-(cello-25pens-noship|technotip-paise|butterflow10-nomrp)\.html mrp/],
  },
  {
    name: 'Flipkart phone recipe takes stock from page-wide "out of stock" text (another colour\'s swatch)',
    file: 'readers/flipkart.mobile.json', find: '"selectors": [],\n      "outOfStockText": ["outofstock", "soldout", "discontinued"],', replace: '"selectors": ["body"],\n      "outOfStockText": ["outofstock", "soldout", "discontinued", "out of stock"],',
    run: CHECK, expect: [/^flipkart-mobile-cello-pinpoint-variant\.html (status|price|inStock|deleting)/],
  },
  {
    name: 'Spend Lens reads orders with an unverified orderHistory rule',
    file: 'core/interpret.ts', find: "if (!rule || rule.verified == null || !new RegExp(rule.page).test(url)) return null;", replace: "if (!rule || !new RegExp(rule.page).test(url)) return null;",
    run: ['node', ['--test', 'core/spend.test.ts']], expect: [/readOrders reads nothing with an unverified rule/],
  },
  {
    name: 'Spend Lens merges orders by number alone (two stores, one order)',
    file: 'web/spend.js', find: "byKey.set(`${o.store}:${o.orderId}`, o);", replace: "byKey.set(o.orderId, o);",
    run: ['node', ['--test', 'core/spend.test.ts']], expect: [/merging: the same order read again/],
  },
  {
    name: 'Spend Lens accepts a day that does not exist (31 September)',
    file: 'web/spend.js', find: "  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return null;\n", replace: "",
    run: ['node', ['--test', 'core/spend.test.ts']], expect: [/order dates as stores print them/, /readOrders: one order per card/, /isOrder: what a client may keep/],
  },
  {
    name: 'Spend Lens totals by year instead of month',
    file: 'web/spend.js', find: "const month = o.date.slice(0, 7);", replace: "const month = o.date.slice(0, 4);",
    run: ['node', ['--test', 'core/spend.test.ts']], expect: [/summary: totals by month/],
  },
  {
    name: 'app: Spend Lens orders are also uploaded when saved (rule 5 broken)',
    file: 'android/app/src/main/java/app/britto/BridgeCore.java', find: '                return new JSONObject().put("ok", true).put("kept", spend.keep(orders));',
    replace: '                transport.request("POST", "/api/spend/orders", orders.toString(), null);\n                return new JSONObject().put("ok", true).put("kept", spend.keep(orders));',
    run: GRADLE_TEST, expect: [/BridgeCoreTest > spendLensOrdersAreKeptOnThePhoneAndNeverSent/, /BridgeCoreTest > aStorePageCannotReadOrdersBackOrWriteOddOnes/, /BridgeCoreTest > theBrittoSiteReadsAndClearsSpendLensButNothingElse/],
  },
  {
    name: 'app: a store page can read the Spend Lens orders back',
    file: 'android/app/src/main/java/app/britto/BridgeCore.java', find: '            case "saveOrders": {',
    replace: '            case "getSpend":\n                return new JSONObject().put("ok", true).put("orders", spend.all());\n            case "saveOrders": {',
    run: GRADLE_TEST, expect: [/BridgeCoreTest > aStorePageCannotReadOrdersBackOrWriteOddOnes/],
  },
  {
    name: 'extension: Spend Lens orders are also uploaded when saved (rule 5 broken)',
    file: 'extension/src/background.ts', find: '  await chrome.storage.local.set({ [SPEND_KEY]: merged });',
    replace: "  await chrome.storage.local.set({ [SPEND_KEY]: merged });\n  await call('/api/spend/orders', { method: 'POST', body: JSON.stringify(orders) });",
    run: EXTENSION, expect: [/nothing about them went to Britto/],
  },
  {
    name: 'prove: Reliance Digital (refuses Cloudflare) is server-fetched again',
    file: 'core/stores.ts', find: "    serverFetch: 'refused',\n    measured:\n      '2026-10-27: refuses our server on Cloudflare", replace: "    serverFetch: 'yes',\n    measured:\n      '2026-10-27: refuses our server on Cloudflare",
    run: PROVE, expect: [/reliancedigital: tracked, never fetched by our server/],
  },
  {
    name: 'fetcher lets a reader that throws escape (the cron run ends there)',
    file: 'api/fetcher.ts', find: "    return { ok: false, code: 'reader_error', httpStatus: null, detail: String(e) };", replace: '    throw e;',
    run: ['node', ['--test', 'api/fetcher.test.ts']], expect: [/a reader that throws is a recorded failure/],
  },
  {
    name: 'fetcher gives up on the page when the early-stop check throws',
    file: 'api/fetcher.ts', find: '        try { enough = readerEnough(config, text); } catch { /* read on */ }', replace: '        enough = readerEnough(config, text);',
    run: ['node', ['--test', 'api/fetcher.test.ts']], expect: [/cannot decide "enough" reads on/],
  },
  {
    name: 'extension: the browser drops the image it read (parity)',
    file: 'extension/src/reader.ts',
    find: '    last = confirmIdentity(config.store, pid, readPage(config, document.documentElement.outerHTML, location.href), config.reportsPid);\n',
    replace: '    last = { ...confirmIdentity(config.store, pid, readPage(config, document.documentElement.outerHTML, location.href), config.reportsPid), image: null };\n',
    run: EXTENSION, expect: [/^parity: the browser reads (amazon\.in\/Cello|amazon\.in\/dp\/B09N3ZNHTY|myntra)/],
  },
  // ---- the Android app: its Java bridge (Robolectric, ./gradlew testDebugUnitTest) and the
  // injected reader through the real bridge code (scripts/app.mjs)
  {
    name: 'app: bridge forgets to say the reading came from the app',
    file: 'android/app/src/main/java/app/britto/BridgeCore.java', find: '                    .put("client", "app");\n                return reply(', replace: '                    ;\n                return reply(',
    run: GRADLE_TEST, expect: [/BridgeCoreTest > observationCarriesTheConfigAndAppVersionsAndNothingElse/],
  },
  {
    name: 'app: bridge never caches reader configs',
    file: 'android/app/src/main/java/app/britto/BridgeCore.java', find: 'if (cached != null && now - cached.at < CONFIG_TTL_MS) return withBody(cached.body);', replace: '',
    run: GRADLE_TEST, expect: [/BridgeCoreTest > readerConfigIsCachedTenMinutesThenRevalidatedWithItsEtag/],
  },
  {
    name: 'app: bridge accepts any config version text',
    file: 'android/app/src/main/java/app/britto/BridgeCore.java', find: 'if (url.isEmpty() || url.length() > 2000 || observed == null || !VERSION.matcher(configVersion).matches()) return null;', replace: 'if (url.isEmpty() || observed == null) return null;',
    run: GRADLE_TEST, expect: [/BridgeCoreTest > anythingElseIsDroppedWithoutARequest/],
  },
  {
    name: 'app: a store host matches anywhere in the address',
    file: 'android/app/src/main/java/app/britto/Stores.java', find: 'for (Store s : all(context)) if (s.hosts.contains(host)) return s;', replace: 'for (Store s : all(context)) if (s.hosts.stream().anyMatch(host::contains)) return s;',
    run: GRADLE_TEST, expect: [/ScreensTest > storesAreMatchedByExactHost/],
  },
  {
    name: 'app: share reads only a link at the very start of the text',
    file: 'android/app/src/main/java/app/britto/MainActivity.java', find: '            while (m.find()) {', replace: '            if (m.find() && m.start() == 0) {',
    run: GRADLE_TEST, expect: [/ScreensTest > aSharedProductOpensInSuperBrowse/],
  },
  {
    name: 'app: the injected reader starts again on every injection',
    file: 'android/js/inject.ts', find: "if (bridge && window.top === window && !w.__brittoStarted) {", replace: "if (bridge && window.top === window) {",
    run: APP, expect: [/a second injection on the same page adds no panel and no report/],
  },
  // ---- store search, best-seller lists and drops (2026-11-04)
  {
    name: 'list reader keeps another store\'s links',
    file: 'core/interpret.ts', find: 'if (!parsed.ok || parsed.link.store !== cfg.store || seen.has(parsed.link.key)) continue;', replace: 'if (!parsed.ok || seen.has(parsed.link.key)) continue;',
    run: LISTING, expect: [/another store's link/],
  },
  {
    name: 'list reader reads past the end marker',
    file: 'core/interpret.ts', find: '    if (end >= 0) html = html.slice(0, end);\n', replace: '',
    run: LISTING, expect: [/nothing after the end marker/],
  },
  {
    name: 'validator lets a list send the server to another site',
    file: 'core/recipe.ts', find: "if (Object.hasOwn(STORES, String(store)) && !STORES[store as StoreId].hosts.includes(host))", replace: 'if (false)',
    run: LISTING, expect: [/list addresses must be on the store's own site/],
  },
  {
    name: 'fares: MakeMyTrip read from the whole price block (struck-out fare first)',
    file: 'web/fares.json', find: '"selector": [".listingFlightCard__finalFare"]', replace: '"selector": ["[data-testid=listing-flight-card-price]"]',
    run: FARES, expect: [/MakeMyTrip: the final fare/, /one flight across four sites/],
  },
  {
    name: 'fares: a person-check page is read as "no fares"',
    file: 'core/fares.ts', find: "if (recipe.check.some((c) => text.includes(c.toLowerCase()))) return { status: 'check', rows: [] };", replace: '',
    run: FARES, expect: [/pages without fares say why/],
  },
  {
    name: "fares: a recipe reads any site's page",
    file: 'core/fares.ts', find: "if (!new RegExp(recipe.page).test(url)) return { status: 'other_page', rows: [] };", replace: '',
    run: FARES, expect: [/pages without fares say why/],
  },
  {
    name: 'compare: airlines matched only when spelt the same',
    file: 'web/compare.js', find: "const airlineKey = (a) => a.toLowerCase().replace(/[^a-z]/g, '');", replace: 'const airlineKey = (a) => a;',
    run: FARES, expect: [/names and times as the sites print them/, /one flight across four sites/],
  },
  {
    name: 'compare: a printed city is never another airport',
    file: 'web/compare.js', find: 'city != null && p.toLowerCase() !== city.toLowerCase()', replace: 'false',
    run: FARES, expect: [/one flight across four sites/],
  },
  {
    name: 'compare: a site keeps the dearer of two fares for a flight',
    file: 'web/compare.js', find: 'else if (r.price < have.price) have.price = r.price;', replace: '',
    run: FARES, expect: [/names and times as the sites print them/],
  },
  {
    name: "fares: Uber's airline question read as no fares",
    file: 'core/fares.ts', find: "  if (recipe.ask?.some((c) => text.includes(c.toLowerCase()))) return { status: 'ask', rows: [] };\n", replace: '',
    run: FARES, expect: [/airline question/],
  },
  {
    name: 'rides: parcel delivery listed as a ride',
    file: 'web/compare.js', find: ".filter((r) => !/^parcel\\b/i.test(r.label))", replace: '',
    run: FARES, expect: [/parcel delivery left out/],
  },
  {
    name: 'Amazon search reads the struck-out M.R.P. as the price',
    file: 'readers/amazon.desktop.json', find: '".a-price[data-a-color=base]"', replace: '".a-price.a-text-price"',
    run: CHECK, expect: [/^amazon-search-(boat-earbuds|cello-technotip-paise|iphone-15-brands)\.html /],
  },
  {
    name: 'a price rise does not end a drop',
    file: 'api/db.ts', find: "    else if (over) statements.push(db.prepare('DELETE FROM drops WHERE key = ?').bind(key));\n", replace: '',
    run: PROVE, expect: [/a rise ends the drop/, /selling out ends it/],
  },
  {
    name: 'store search ignores the hourly allowance',
    file: 'api/listing.ts', find: "  if (!(await allowFetch())) return { ...base, status: 'busy', items: [], at: null };\n", replace: '',
    // Uncharged, the cache check's evidence (one search charged for two asks) reads none too.
    run: PROVE, expect: [/past its searches this hour/, /same words again come from the cache/],
  },
  {
    name: 'lists show best-seller products before their own page is read',
    file: 'api/db.ts', find: "'SELECT * FROM products WHERE title IS NOT NULL AND last_checked_at IS NOT NULL ORDER BY created_at DESC LIMIT ?'", replace: "'SELECT * FROM products WHERE title IS NOT NULL ORDER BY created_at DESC LIMIT ?'",
    run: PROVE, expect: [/stay off the lists until their own page is read/],
  },
  // ---- alerts as app notifications (2026-11-04)
  {
    name: 'app shows an alert that fired before it started watching',
    file: 'android/app/src/main/java/app/britto/AlertWatch.java', find: 'if (id.isEmpty() || at <= since) continue;', replace: 'if (id.isEmpty()) continue;',
    // Before watching begins nothing is news either: the same rule, so that test reddens too.
    run: GRADLE_TEST, expect: [/onlyFiringsAfterWatchingBeganAndNotShownBefore/, /wrongShapesYieldNothing/],
  },
  {
    name: 'app shows the same firing twice',
    file: 'android/app/src/main/java/app/britto/AlertWatch.java', find: 'if (seen != null && at <= seen.optLong(id, 0)) continue;', replace: '',
    run: GRADLE_TEST, expect: [/onlyFiringsAfterWatchingBeganAndNotShownBefore/],
  },
  {
    name: 'the site bridge takes any text as an alert token',
    file: 'android/app/src/main/java/app/britto/AlertWatch.java', find: 'if (token == null || !TOKEN.matcher(token).matches()) return false;', replace: 'if (token == null) return false;',
    run: GRADLE_TEST, expect: [/tokenRules/, /siteBridgeHandsOverTheTokenAndSaysTheStatus/],
  },
  // ---- fare compare on the phone (FareJob)
  {
    name: 'fare compare opens every site at once',
    file: 'android/app/src/main/java/app/britto/FareJob.java', find: '            if (loading >= PARALLEL) break;\n', replace: '',
    run: GRADLE_TEST, expect: [/twoSitesLoadAtOnceAndTheNextStartsWhenOneIsDone/],
  },
  {
    name: 'fare compare ends a site at its first fares after the settle time',
    file: 'android/app/src/main/java/app/britto/FareJob.java', find: 'boolean settled = s.same >= SAME_READS - 1 && ', replace: 'boolean settled = ',
    run: GRADLE_TEST, expect: [/faresAreDoneOnlyWhenTheyStopChangingAfterTheSettleTime/],
  },
  {
    name: 'fare compare gives up a site on any load error',
    file: 'android/app/src/main/java/app/britto/FareJob.java', find: 'if (s == null || !s.state.equals("loading") || s.read != null) return false;', replace: 'if (s == null || !s.state.equals("loading")) return false;',
    run: GRADLE_TEST, expect: [/aLoadErrorEndsOnlyASiteThatShowedNothing/],
  },
  // ---- a product opened in place from a search page (Flipkart, Myntra): loaded once for real
  {
    name: 'reader never reloads a product opened in place',
    file: 'extension/src/reader.ts', find: "  } else if (ex.status === 'unrecognised' && reloadOnce(url, key)) {\n    panel.loading();\n", replace: '',
    // The loop check counts exactly one load, so with no reload at all it reddens too.
    run: APP, expect: [/opened from search in place/, /never in a loop/],
  },
  {
    name: 'reader reloads an unreadable product in a loop',
    file: 'extension/src/reader.ts', find: '    if (sessionStorage.getItem(RELOADED) === key) return false;\n', replace: '',
    run: APP, expect: [/never in a loop/],
  },
  // ---- P11 part 2b: date strip, round trip, hotels, fare alerts, bar colours
  {
    name: 'strip: a printed weekday is not checked',
    file: 'core/fares.ts', find: '  if (wd && WEEKDAYS.indexOf(wd[1]!) !== d.getUTCDay()) return false;\n', replace: '',
    run: FARES, expect: [/a printed day that does not fit/],
  },
  {
    name: 'strip: dated from its first day, not the searched one',
    file: 'core/fares.ts', find: 'const date = plusDays(when, i - at);', replace: 'const date = plusDays(when, i);',
    run: FARES, expect: [/dated from the searched day/, /strips merged by day/],
  },
  {
    name: 'strip: two days marked as the searched one are accepted',
    file: 'core/fares.ts', find: 'if (at < 0 || days.filter((d) => d.active).length !== 1) return [];', replace: 'if (at < 0) return [];',
    run: FARES, expect: [/a printed day that does not fit/],
  },
  {
    name: 'compare: a day of the strip keeps the first site’s figure',
    file: 'web/compare.js', find: '        if (d.price < have.price) Object.assign(have, { price: d.price, site: s.id, name: s.name });\n', replace: '',
    run: FARES, expect: [/strips merged by day/],
  },
  {
    name: 'compare: a round trip counts one way only',
    file: 'web/compare.js', find: 'total: a.best + b.best', replace: 'total: a.best',
    run: FARES, expect: [/strips merged by day/],
  },
  {
    name: 'hotels: a whole-stay price taken as one night',
    file: 'web/compare.js', find: "const night = per === 'stay' ? Math.round(r.price / nights) : r.price;", replace: 'const night = r.price;',
    run: FARES, expect: [/hotel compare: per night/],
  },
  {
    name: 'hotels: two hotels matched by their first word',
    file: 'web/compare.js', find: "const key = [...new Set(words)].sort().join(' ');", replace: "const key = words.slice(0, 1).join(' ');",
    run: FARES, expect: [/hotel compare: per night/],
  },
  {
    name: 'hotels: a recipe that does not say per night or per stay is accepted',
    file: 'core/fares.ts', find: "if (r.sector === 'hotel' && r.per !== 'night' && r.per !== 'stay') errs.push(", replace: 'if (false) errs.push(',
    run: FARES, expect: [/Booking.com prices the whole stay/],
  },
  {
    name: 'hotels: Cleartrip read at its struck-out price',
    file: 'web/fares.json', find: '(₹\\\\s?[\\\\d,]+)\\\\s*(?:₹\\\\s?[\\\\d,]+\\\\s*)?', replace: '(?:₹\\\\s?[\\\\d,]+\\\\s*)?(₹\\\\s?[\\\\d,]+)\\\\s*',
    run: FARES, expect: [/Booking.com prices the whole stay/],
  },
  {
    name: 'fare alert for any lower fare',
    file: 'android/app/src/main/java/app/britto/FareWatches.java', find: 'if (low - cheapest >= Math.max(MIN_DROP_PAISE, low / 100)) {', replace: 'if (cheapest < low) {',
    run: GRADLE_TEST, expect: [/anAlertOnlyForARealDropBelowTheLowestSeen/],
  },
  {
    name: 'fare alerts: a fourth route is watched',
    file: 'android/app/src/main/java/app/britto/FareWatches.java', find: 'if (next.length() >= MAX) return', replace: 'if (false) return',
    run: GRADLE_TEST, expect: [/theSameRouteReplacesItselfAndAtMostThreeAreWatched/],
  },
  {
    name: 'fare compare takes any text as the searched day',
    file: 'android/app/src/main/java/app/britto/FareJob.java', find: '            if (date != null && !DAY.matcher(date).matches()) return null;\n', replace: '',
    run: GRADLE_TEST, expect: [/theSearchedDayIsCheckedAndTheSitesDateStripIsReported/],
  },
  {
    name: 'fare compare settles before the strip arrives',
    file: 'android/app/src/main/java/app/britto/FareJob.java', find: '\n                    + ":" + (read.optJSONArray("strip") == null ? 0 : read.optJSONArray("strip").length());', replace: ';',
    run: GRADLE_TEST, expect: [/theSearchedDayIsCheckedAndTheSitesDateStripIsReported/],
  },
  {
    name: 'fare alert job keeps the recipes saved with the watch',
    file: 'android/app/src/main/java/app/britto/FareAlertJob.java', find: ' s.put("recipe", r);', replace: ' { }',
    run: GRADLE_TEST, expect: [/theJobComparesWithTodaysRecipesAndFindsTheCheapestSite/],
  },
  {
    name: 'the bridge paints any text as a bar colour',
    file: 'android/app/src/main/java/app/britto/SiteBridgeCore.java', find: 'return s != null && COLOUR.matcher(s).matches() ? 0xFF000000 | Integer.parseInt(s.substring(1), 16) : null;', replace: 'return s != null ? 0xFF000000 | (s.hashCode() & 0xFFFFFF) : null;',
    run: GRADLE_TEST, expect: [/theBridgeKeepsAlertsAndBarColours/],
  },
  {
    name: 'link previews: a product title written in unescaped',
    file: 'api/meta.ts', find: "const esc = (s: string) => s.replace(/&/g, '&amp;')", replace: "const esc = (s: string) => s || s.replace(/&/g, '&amp;')",
    run: ['node', ['--test', 'api/meta.test.ts']], expect: [/everything escaped/],
  },
  {
    name: 'link previews: "$&" in a title read as a replacement pattern',
    file: 'api/meta.ts', find: '.replace(/<title>[^<]*<\\/title>/, () => `<title>${esc(meta.title)}</title>`)', replace: '.replace(/<title>[^<]*<\\/title>/, `<title>${esc(meta.title)}</title>`)',
    run: ['node', ['--test', 'api/meta.test.ts']], expect: [/everything escaped/],
  },
  {
    name: 'abuse: short links followed without their hourly limit',
    file: 'api/refresh.ts', find: 'if (!(await rateLimit(env.DB, `short:${limiter}`, SHORT_LINKS_PER_HOUR, 3_600_000, now))) {', replace: 'if (false) {',
    run: PROVE, expect: [/past 30 short links/], timeout: 900_000,
  },
  {
    name: 'abuse: every load counts as a view',
    file: 'api/app.ts', find: 'if (await rateLimit(env.DB, `view:${viewer}:${key}`, 1, 3_600_000, Date.now())) {', replace: 'if (viewer) {',
    run: PROVE, expect: [/views: three loads/], timeout: 900_000,
  },
  // ---- P11 part 3: Rapido read while the shopper looks; the app reader's own page words.
  {
    name: 'Rapido: a card showing two prices is read anyway',
    file: 'web/fares.json', find: '"^[^₹]*(₹', replace: '"(₹',
    run: FARES, expect: [/Rapido: every ride type/],
  },
  {
    name: 'fare recipes: a card selector that needs the page is accepted',
    file: 'core/fares.ts', find: 'parseSelector(v).parts.length > 1', replace: 'parseSelector(v).parts.length > 9',
    run: FARES, expect: [/Rapido: every ride type/],
  },
  {
    name: 'app reader: cards with no price never read the page\'s words',
    file: 'android/js/fares.ts', find: "if (cards.length && reading.status !== 'fares') {", replace: 'if (false) {',
    run: FARES_READER, expect: [/Uber logged out on its ride list/],
  },
  {
    name: 'app reader: only the first of Rapido\'s trip boxes read',
    file: 'android/js/fares.ts', find: 'reading.places = all(recipe.places, 2)', replace: 'reading.places = all(recipe.places, 1)',
    run: FARES_READER, expect: [/the trip its boxes hold/, /before a trip is entered/],
  },
  {
    name: 'ride readings kept long after they are fresh',
    file: 'android/app/src/main/java/app/britto/RideReadings.java', find: 'if (now - at > FRESH_MS || at > now) {', replace: 'if (now - at > FRESH_MS * 100 || at > now) {',
    run: GRADLE_TEST, expect: [/RideReadingsTest > keepsOnlyFaresAndOnlyWhileFresh/],
  },
  {
    name: 'the bridge opens a flight recipe as a ride to read',
    file: 'android/app/src/main/java/app/britto/SiteBridgeCore.java', find: '&& "ride".equals(recipe.optString("sector"))', replace: '',
    run: GRADLE_TEST, expect: [/RideReadingsTest > bridgeOpensOnlyARideRecipeOnHttpsAndHandsBackTheReading/],
  },
  {
    name: '"Send Britto to a friend" shares any text, however long',
    file: 'android/app/src/main/java/app/britto/SiteBridgeCore.java', find: '!text.isEmpty() && text.length() <= 500 && share.text(text)', replace: 'share.text(text)',
    run: GRADLE_TEST, expect: [/RideReadingsTest > sendBrittoToAFriendSharesThePagesTextOnlyWhenShort/],
  },
];

const only = process.argv[2];
const backups = new Map();
const restore = () => { for (const [file, text] of backups) writeFileSync(join(ROOT, file), text); backups.clear(); };
process.on('exit', restore);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restore(); process.exit(130); });

function failingNames(output) {
  const names = [];
  for (const line of output.split('\n')) {
    const m = /^not ok \d+ - (.*)$/.exec(line.trim()) ?? /^FAIL\s+(.*?)(?:\s+—.*)?$/.exec(line) ?? /^DIFF\s+(.*)$/.exec(line)
      ?? /^(\w+Test > \w+) FAILED$/.exec(line.trim());
    if (m) names.push(m[1]);
  }
  return names;
}

let good = 0;
let bad = 0;
for (const m of MUTANTS) {
  if (only && !m.name.includes(only)) continue;
  const path = join(ROOT, m.file);
  const original = readFileSync(path, 'utf8');
  const count = original.split(m.find).length - 1;
  if (count !== 1) { console.log(`BROKEN MUTANT ${m.name}: text found ${count} times in ${m.file}`); bad++; continue; }
  backups.set(m.file, original);
  writeFileSync(path, original.replace(m.find, m.replace));
  let output = '';
  let exit = 0;
  // TAP whatever the Node version's default is: Node 24 on the Mac prints its spec format even
  // into a pipe, and then no `not ok` line exists to read the failing names from.
  const args = m.run[0] === 'node' && m.run[1][0] === '--test' ? ['--test', '--test-reporter=tap', ...m.run[1].slice(1)] : m.run[1];
  try {
    output = execFileSync(m.run[0], args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: m.timeout ?? 600_000 });
  } catch (e) {
    exit = e.status ?? 1;
    output = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
  }
  restore();
  // node --test also reports each failing FILE as a failed test: drop those lines.
  const names = failingNames(output).filter((n) => !/\.(ts|mjs)$/.test(n));
  const unexpected = names.filter((n) => !m.expect.some((re) => re.test(n)));
  const missing = m.expect.filter((re) => !names.some((n) => re.test(n)));
  const ok = exit !== 0 && names.length > 0 && !unexpected.length && !missing.length;
  ok ? good++ : bad++;
  console.log(`${ok ? '  red as expected' : 'WRONG'}  ${m.name}`);
  for (const n of names) console.log(`        failed: ${n}`);
  if (!ok) console.log(`        exit ${exit}; unexpected ${JSON.stringify(unexpected)}; missing ${missing.map(String).join(', ') || 'none'}`);
}
console.log(`\n${good} mutants caught exactly, ${bad} not`);
process.exit(bad ? 1 : 0);
