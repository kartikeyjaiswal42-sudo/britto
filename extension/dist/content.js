"use strict";
(() => {
  // core/html.ts
  var NAMED = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'"
  };
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name) => {
      const lower = name.toLowerCase();
      if (lower.startsWith("#x")) return safeCodePoint(parseInt(lower.slice(2), 16)) ?? whole;
      if (lower.startsWith("#")) return safeCodePoint(parseInt(lower.slice(1), 10)) ?? whole;
      return NAMED[lower] ?? whole;
    });
  }
  function safeCodePoint(n) {
    return Number.isInteger(n) && n > 0 && n <= 1114111 ? String.fromCodePoint(n) : null;
  }
  function textOf(html) {
    const noCode = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
    return decodeEntities(noCode.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  }
  var VOID = /* @__PURE__ */ new Set(["img", "input", "br", "hr", "meta", "link", "source", "area", "base", "col", "embed", "wbr"]);
  function elementById(html, id, from = 0) {
    const needle = `id="${id}"`;
    let at = html.indexOf(needle, from);
    while (at !== -1) {
      const open = html.lastIndexOf("<", at);
      const prevClose = html.lastIndexOf(">", at);
      const before = html.charCodeAt(at - 1);
      const isAttr = open > prevClose && (before === 32 || before === 10 || before === 9 || before === 13);
      if (isAttr) return elementFrom(html, open);
      at = html.indexOf(needle, at + needle.length);
    }
    return null;
  }
  function elementFrom(html, start) {
    const head = /^<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/.exec(html.slice(start, start + 4e3));
    if (!head || head[1] === void 0) return null;
    const tag = head[1].toLowerCase();
    const headEnd = start + head[0].length;
    if (VOID.has(tag) || head[2] === "/") return html.slice(start, headEnd);
    const re = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/gi;
    re.lastIndex = headEnd;
    let depth = 1;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      const name = m[3]?.toLowerCase();
      if (!name || name !== tag) continue;
      if (m[2] === "/") depth--;
      else if (m[4] !== "/") depth++;
      if (depth === 0) return html.slice(start, m.index + m[0].length);
    }
    return null;
  }
  function openingTagById(html, id) {
    const at = html.indexOf(`id="${id}"`);
    if (at === -1) return null;
    const open = html.lastIndexOf("<", at);
    const end = html.indexOf(">", at);
    return open === -1 || end === -1 ? null : html.slice(open, end + 1);
  }
  function openingTag(elementHtml) {
    const end = elementHtml.indexOf(">");
    return end === -1 ? elementHtml : elementHtml.slice(0, end + 1);
  }
  function attr(tagHtml, name) {
    const re = new RegExp(`\\s${name.replace(/[-]/g, "\\-")}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
    const m = re.exec(openingTag(tagHtml));
    if (!m) return null;
    return decodeEntities(m[2] ?? m[3] ?? "");
  }
  function textOfClass(scope, ...classes) {
    const el3 = elementWithClass(scope, ...classes);
    return el3 == null ? null : textOf(el3);
  }
  function elementWithClass(scope, ...classes) {
    const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\sclass\s*=\s*"([^"]*)"[^>]*>/g;
    for (let m = re.exec(scope); m; m = re.exec(scope)) {
      const list = (m[2] ?? "").split(/\s+/);
      if (classes.every((c) => list.includes(c))) return elementFrom(scope, m.index);
    }
    return null;
  }

  // core/money.ts
  function parseRupees(text) {
    if (text == null) return null;
    const s = String(text).replace(/&#x20b9;|&#8377;|₹|\bRs\.?|\bINR\b/gi, " ").replace(/&nbsp;| /g, " ").trim();
    const m = /^(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m || m[1] === void 0) return null;
    const whole = m[1].replace(/,/g, "");
    const frac = (m[2] ?? "").padEnd(2, "0");
    const paise = Number(whole) * 100 + Number(frac);
    return Number.isSafeInteger(paise) ? paise : null;
  }
  function rupeesToPaise(value) {
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) return null;
      return Math.round(value * 100);
    }
    if (typeof value === "string") return parseRupees(value);
    return null;
  }

  // core/extract.ts
  function extract(store, html) {
    if (store === "amazon") return amazon(html);
    if (store === "myntra") return myntra(html);
    return flipkart(html);
  }
  function result(partial) {
    return { title: null, price: null, mrp: null, inStock: null, image: null, pid: null, ...partial };
  }
  var READERS_REPORT_PID = { amazon: true, myntra: true, flipkart: false };
  function confirmIdentity(store, linkPid, ex) {
    if (ex.status !== "priced" && ex.status !== "unavailable") return ex;
    const expected = store === "flipkart" ? linkPid.split(".")[0] : linkPid;
    if (ex.pid === expected) return ex;
    if (ex.pid == null && !READERS_REPORT_PID[store]) return ex;
    return { ...ex, status: "unrecognised", price: null, mrp: null, inStock: null, rule: `${ex.rule}+identity-mismatch(${ex.pid ?? "none"})` };
  }
  var AMAZON_ROBOT = ["/errors/validateCaptcha", "Enter the characters you see below", "To discuss automated access to Amazon data"];
  function amazon(html) {
    if (AMAZON_ROBOT.some((m) => html.includes(m))) return result({ status: "blocked", rule: "amazon:robot-check" });
    const titleEl = elementById(html, "productTitle");
    const title = titleEl ? textOf(titleEl) || null : null;
    if (!title) return result({ status: "unrecognised", rule: "amazon:no-title" });
    const titleTag = openingTagById(html, "title_feature_div");
    const pid = titleTag && attr(titleTag, "data-csa-c-asin") || null;
    const imgEl = elementById(html, "landingImage");
    const image = imgEl ? attr(imgEl, "data-old-hires") || attr(imgEl, "src") || null : null;
    const availEl = elementById(html, "availability");
    const availability = availEl ? textOf(availEl) : "";
    const unavailable = /currently unavailable|out of stock|temporarily unavailable/i.test(availability);
    if (unavailable) return result({ status: "unavailable", title, image, pid, inStock: false, rule: "amazon:availability" });
    const core = elementById(html, "corePriceDisplay_desktop_feature_div");
    if (!core) return result({ status: "unrecognised", title, image, rule: "amazon:no-core-price" });
    const pay = elementWithClass(core, "a-price", "priceToPay");
    let price = null;
    if (pay) {
      const whole = textOfClass(pay, "a-price-whole");
      const fraction = textOfClass(pay, "a-price-fraction");
      const digits = whole?.replace(/[^\d,]/g, "");
      const paise = fraction?.replace(/\D/g, "");
      price = parseRupees(digits ? `${digits}${paise ? "." + paise : ""}` : null);
      if (price == null) price = parseRupees(textOfClass(pay, "a-offscreen"));
    }
    if (price == null) return result({ status: "unrecognised", title, image, rule: "amazon:no-price-to-pay" });
    const basis = elementWithClass(core, "a-price", "apex-basisprice-value");
    const mrp = basis ? parseRupees(textOfClass(basis, "a-offscreen")) : null;
    return result({ status: "priced", title, image, pid, price, mrp, inStock: true, rule: "amazon:core-price" });
  }
  function myntra(html) {
    const marker = "window.__myx = ";
    const at = html.indexOf(marker);
    if (at === -1) return result({ status: "unrecognised", rule: "myntra:no-myx" });
    const end = html.indexOf("<\/script>", at);
    let pdp;
    try {
      pdp = JSON.parse(html.slice(at + marker.length, end).trim().replace(/;$/, "")).pdpData;
    } catch {
      return result({ status: "unrecognised", rule: "myntra:bad-json" });
    }
    if (!pdp?.name) return result({ status: "unrecognised", rule: "myntra:no-pdp" });
    const title = pdp.name.replace(/\s+/g, " ").trim();
    const src = pdp.media?.albums?.[0]?.images?.[0]?.secureSrc;
    const image = src ? src.replace("($height)", "480").replace("($qualityPercentage)", "90").replace("($width)", "360") : null;
    const pid = pdp.id != null ? String(pdp.id) : null;
    if (pdp.flags?.outOfStock) return result({ status: "unavailable", title, image, pid, inStock: false, rule: "myntra:flags" });
    const price = rupeesToPaise(pdp.price?.discounted);
    const mrp = rupeesToPaise(pdp.price?.mrp);
    if (price == null) return result({ status: "unrecognised", title, image, rule: "myntra:no-price" });
    return result({ status: "priced", title, image, pid, price, mrp, inStock: true, rule: "myntra:pdpData" });
  }
  var FLIPKART_READER_VERIFIED = false;
  function flipkart(html) {
    if (/Something went wrong!/.test(html) && /\bE00\d\b/.test(html)) return result({ status: "blocked", rule: "flipkart:error-page" });
    if (!FLIPKART_READER_VERIFIED) return result({ status: "unrecognised", title: jsonLdProduct(html).title, rule: "flipkart:reader-not-verified" });
    return { ...jsonLdProduct(html), rule: "flipkart:jsonld" };
  }
  function* jsonLdNodes(html) {
    const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      let data;
      try {
        data = JSON.parse(m[1] ?? "");
      } catch {
        continue;
      }
      const stack = [data];
      while (stack.length) {
        const n = stack.pop();
        if (Array.isArray(n)) stack.push(...n);
        else if (n && typeof n === "object") {
          yield n;
          const g = n["@graph"];
          if (Array.isArray(g)) stack.push(...g);
        }
      }
    }
  }
  var isType = (n, t) => n["@type"] === t || Array.isArray(n["@type"]) && n["@type"].includes(t);
  function jsonLdProduct(html) {
    for (const n of jsonLdNodes(html)) {
      if (!isType(n, "Product")) continue;
      const title = typeof n["name"] === "string" ? n["name"].replace(/\s+/g, " ").trim() || null : null;
      const img = n["image"];
      const image = typeof img === "string" ? img : Array.isArray(img) && typeof img[0] === "string" ? img[0] : img && typeof img === "object" && !Array.isArray(img) && typeof img["url"] === "string" ? img["url"] : null;
      const offersRaw = n["offers"];
      const offer = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
      if (!offer || typeof offer !== "object") return result({ status: "unrecognised", title, image, rule: "jsonld:no-offer" });
      const availability = String(offer["availability"] ?? "");
      if (/OutOfStock|SoldOut|Discontinued/i.test(availability)) return result({ status: "unavailable", title, image, inStock: false, rule: "jsonld" });
      const price = rupeesToPaise(offer["price"] ?? offer["lowPrice"] ?? null);
      if (price == null || !/InStock|LimitedAvailability|OnlineOnly/i.test(availability)) {
        return result({ status: "unrecognised", title, image, rule: "jsonld:no-price" });
      }
      return result({ status: "priced", title, image, price, inStock: true, rule: "jsonld" });
    }
    return result({ status: "unrecognised", rule: "jsonld:none" });
  }

  // core/stores.ts
  var STORES = {
    amazon: {
      id: "amazon",
      name: "Amazon.in",
      hosts: ["amazon.in", "www.amazon.in", "m.amazon.in"],
      shortHosts: ["amzn.in", "amzn.to"],
      serverFetch: "yes",
      measured: '2026-10-26: in-stock /dp/ pages fetched with an honest bot User-Agent (from India, not yet from Cloudflare) returned the price box: \u20B9265, M.R.P. \u20B9299, "In stock".'
    },
    flipkart: {
      id: "flipkart",
      name: "Flipkart",
      hosts: ["flipkart.com", "www.flipkart.com", "dl.flipkart.com"],
      shortHosts: [],
      serverFetch: "refused",
      measured: '2026-10-26: product pages answered "Something went wrong! E002" instead of the product. Prices come from the browser extension.'
    },
    myntra: {
      id: "myntra",
      name: "Myntra",
      hosts: ["myntra.com", "www.myntra.com"],
      shortHosts: [],
      serverFetch: "no_answer",
      measured: "2026-10-26: no response within 25 s to an honest bot User-Agent. Prices come from the browser extension."
    }
  };
  var STORE_IDS = Object.keys(STORES);
  var ASIN = /^[A-Z0-9]{10}$/;
  function storeForHost(host) {
    for (const s of Object.values(STORES)) {
      if (s.hosts.includes(host)) return { store: s.id, short: false };
      if (s.shortHosts.includes(host)) return { store: s.id, short: true };
    }
    return null;
  }
  function parseProductLink(input) {
    let raw = input.trim();
    if (!raw) return { ok: false, reason: "not_a_url" };
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    let u;
    try {
      u = new URL(raw);
    } catch {
      return { ok: false, reason: "not_a_url" };
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "not_a_url" };
    const host = u.hostname.toLowerCase();
    const hit = storeForHost(host);
    if (!hit) return { ok: false, reason: "unsupported_store" };
    if (hit.short) return { ok: false, reason: "short_link", store: hit.store, url: `https://${host}${u.pathname}` };
    if (hit.store === "amazon") return amazon2(u);
    if (hit.store === "flipkart") return flipkart2(u);
    return myntra2(u);
  }
  function ok(store, pid, url) {
    return { ok: true, link: { store, pid, key: `${store}:${pid}`, url } };
  }
  function amazon2(u) {
    const m = /\/(?:dp|gp\/product|gp\/aw\/d|o\/ASIN)\/([A-Za-z0-9]{10})(?=[/?]|$)/.exec(u.pathname);
    const asin = m?.[1]?.toUpperCase();
    if (!asin || !ASIN.test(asin)) return { ok: false, reason: "not_a_product" };
    return ok("amazon", asin, `https://www.amazon.in/dp/${asin}`);
  }
  function flipkart2(u) {
    let path = u.pathname;
    if (u.hostname.toLowerCase() === "dl.flipkart.com") {
      if (!path.startsWith("/dl/")) return { ok: false, reason: "not_a_product" };
      path = path.slice(3);
    }
    const m = /^(\/[^/]+)?\/p\/(itm[a-z0-9]{6,20})\/?$/i.exec(path);
    const itm = m?.[2]?.toLowerCase();
    if (!itm) return { ok: false, reason: "not_a_product" };
    const pidRaw = u.searchParams.get("pid");
    const pid = pidRaw && /^[A-Z0-9]{12,20}$/i.test(pidRaw) ? pidRaw.toUpperCase() : null;
    const clean = `https://www.flipkart.com${path.replace(/\/$/, "")}${pid ? `?pid=${pid}` : ""}`;
    return ok("flipkart", pid ? `${itm}.${pid}` : itm, clean);
  }
  function myntra2(u) {
    const m = /\/(\d{5,10})\/buy\/?$/.exec(u.pathname) ?? /^\/(\d{5,10})\/?$/.exec(u.pathname);
    const id = m?.[1];
    if (!id) return { ok: false, reason: "not_a_product" };
    return ok("myntra", id, `https://www.myntra.com${u.pathname.replace(/\/$/, "")}`);
  }

  // web/api.js
  function rupees(paise) {
    if (paise == null) return "\u2014";
    const r = Math.floor(Math.abs(paise) / 100);
    const p = Math.abs(paise) % 100;
    const d = String(r);
    const g = d.length <= 3 ? d : `${d.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${d.slice(-3)}`;
    return `${paise < 0 ? "-" : ""}\u20B9${g}${p ? "." + String(p).padStart(2, "0") : ""}`;
  }
  var pct = (f) => f == null || !Number.isFinite(f) ? "\u2014" : `${Math.round(f * 100)}%`;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function date(ms) {
    if (ms == null) return "\u2014";
    const d = new Date(ms + 5.5 * 36e5);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  // web/chart.js
  var NS = "http://www.w3.org/2000/svg";
  var el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  function toSpans(points, lastCheckedAt) {
    const out = [];
    points.forEach((p, i) => {
      const to = points[i + 1]?.at ?? Math.max(lastCheckedAt ?? p.at, p.at);
      out.push({ from: p.at, to, price: p.inStock ? p.price : null });
    });
    return out;
  }
  function drawChart(host, view, rangeDays) {
    host.textContent = "";
    const all = toSpans(view.points, view.stats.lastCheckedAt);
    if (!all.length) {
      host.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "No prices recorded yet." }));
      return;
    }
    const end = all[all.length - 1].to;
    const start = rangeDays ? Math.max(all[0].from, end - rangeDays * 864e5) : all[0].from;
    const t0 = start;
    const t1 = end > start ? end : start + 36e5;
    const spans = all.filter((s) => s.to > start || s.to === start && s === all[all.length - 1]).map((s, i, arr) => ({ ...s, from: Math.max(s.from, start), to: i === arr.length - 1 ? Math.max(s.to, t1) : s.to }));
    const W = Math.max(300, Math.round(host.clientWidth - 16) || 720), H = W < 340 ? 150 : W < 500 ? 220 : 260, L = 60, R = 12, T = 14, B = 30;
    const prices = spans.map((s) => s.price).filter((p) => p != null);
    let lo = Math.min(...prices), hi = Math.max(...prices);
    if (!prices.length) {
      lo = 0;
      hi = 1;
    }
    const pad = Math.max((hi - lo) * 0.15, hi * 0.03, 100);
    lo = Math.max(0, lo - pad);
    hi = hi + pad;
    const x = (t) => L + (t - t0) / (t1 - t0) * (W - L - R);
    const y = (p) => T + (1 - (p - lo) / (hi - lo)) * (H - T - B);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Price history" });
    for (let i = 0; i <= 3; i++) {
      const p = lo + (hi - lo) * i / 3;
      svg.append(el("line", { x1: L, x2: W - R, y1: y(p), y2: y(p), class: "grid" }));
      const label = el("text", { x: L - 8, y: y(p) + 4, "text-anchor": "end", class: "axis" });
      label.textContent = rupees(Math.round(p / 100) * 100);
      svg.append(label);
    }
    const ticks = date(t0) === date(t1) || end - start < 864e5 ? [t0] : W < 500 ? [t0, t1] : [t0, (t0 + t1) / 2, t1];
    for (const t of ticks) {
      const label = el("text", { x: x(t), y: H - 8, "text-anchor": t === t0 ? "start" : t === t1 ? "end" : "middle", class: "axis" });
      label.textContent = date(t);
      svg.append(label);
    }
    for (const s of spans) {
      if (s.price == null) svg.append(el("rect", { x: x(s.from), y: T, width: Math.max(1, x(s.to) - x(s.from)), height: H - T - B, class: "gap" }));
    }
    let d = "";
    let prev = null;
    for (const s of spans) {
      if (s.price == null) {
        prev = null;
        continue;
      }
      d += prev == null ? `M${x(s.from)},${y(s.price)}` : `V${y(s.price)}`;
      d += `H${Math.max(x(s.to), x(s.from) + 2)}`;
      prev = s.price;
    }
    svg.append(el("path", { d, class: "line" }));
    const low = view.stats.lowest;
    if (low && low.at >= t0) svg.append(el("circle", { cx: x(low.at), cy: y(low.price), r: 4, class: "low" }));
    const cursor = el("line", { y1: T, y2: H - B, class: "cursor", visibility: "hidden" });
    svg.append(cursor);
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    svg.addEventListener("pointermove", (e) => {
      const box = svg.getBoundingClientRect();
      const px = (e.clientX - box.left) / box.width * W;
      const t = t0 + (px - L) / (W - L - R) * (t1 - t0);
      const s = spans.find((sp) => t >= sp.from && t <= sp.to);
      if (!s || px < L) {
        tip.hidden = true;
        cursor.setAttribute("visibility", "hidden");
        return;
      }
      cursor.setAttribute("x1", px);
      cursor.setAttribute("x2", px);
      cursor.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.textContent = `${s.price == null ? "Out of stock" : rupees(s.price)} \xB7 ${date(t)}`;
      tip.style.left = `${Math.min(Math.max(0, e.clientX - box.left - 60), box.width - 140)}px`;
    });
    svg.addEventListener("pointerleave", () => {
      tip.hidden = true;
      cursor.setAttribute("visibility", "hidden");
    });
    host.append(svg, tip);
  }

  // extension/src/panel.ts
  var CSS = `
:host { all: initial; }
.box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 340px; max-width: calc(100vw - 32px);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--panel);
  border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18); overflow: hidden;
  --bg: #f7f6f2; --panel: #fff; --ink: #17171a; --muted: #5d5d66; --line: #e3e1da; --accent: #0f6b5c; --on-accent: #fff;
  --good: #11734b; --good-bg: #e6f4ec; --bad: #a33a1c; --bad-bg: #fbece6; --neutral-bg: #f0efe9; --gap: #f1d9cf; }
@media (prefers-color-scheme: dark) { .box { --bg: #121315; --panel: #1b1c1f; --ink: #ecebe6; --muted: #a2a1a8; --line: #2c2d31;
  --accent: #4cc3a9; --on-accent: #08201b; --good: #6fd39f; --good-bg: #16291f; --bad: #f08c6c; --bad-bg: #2d1a14; --neutral-bg: #222327; --gap: #3a2620; } }
.head { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 14px; border-bottom: 1px solid var(--line); }
.logo { font-weight: 700; } .logo span { color: var(--accent); }
.mini { flex: 1; min-width: 0; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button { font: inherit; border: 0; background: var(--neutral-bg); color: var(--ink); border-radius: 6px; padding: 2px 9px; cursor: pointer; }
.body { padding: 12px 14px 14px; display: grid; gap: 10px; }
.box.collapsed .body { display: none; }
.price { font-size: 24px; font-weight: 800; } .mrp { color: var(--muted); margin-left: 8px; font-size: 13px; }
.card { border-radius: 8px; padding: 8px 10px; background: var(--neutral-bg); }
.card b { display: block; } .card.good { background: var(--good-bg); } .card.good b { color: var(--good); }
.card.bad { background: var(--bad-bg); } .card.bad b { color: var(--bad); }
.small { font-size: 12px; color: var(--muted); }
.note { font-size: 13px; border-left: 3px solid var(--accent); padding-left: 8px; }
.chart-host { position: relative; }
.chart { width: 100%; height: auto; display: block; }
.chart .grid { stroke: var(--line); } .chart .axis { fill: var(--muted); font-size: 11px; }
.chart .line { fill: none; stroke: var(--accent); stroke-width: 2.5; }
.chart .gap { fill: var(--gap); opacity: .6; } .chart .low { fill: var(--good); }
.chart .cursor { stroke: var(--muted); stroke-dasharray: 3 3; }
.tip { position: absolute; top: 4px; background: var(--ink); color: var(--bg); font-size: 12px; padding: 3px 7px; border-radius: 6px; pointer-events: none; white-space: nowrap; }
[hidden] { display: none !important; }
a.go { display: inline-block; background: var(--accent); color: var(--on-accent); text-decoration: none; font-weight: 600; padding: 7px 12px; border-radius: 8px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
`;
  var VERDICT_CLASS = { buy: "good", wait: "bad" };
  var SALE = {
    real_drop: ["Real price drop", "good"],
    hike_then_drop: ["Raised, then \u201Cdropped\u201D", "bad"],
    no_real_drop: ["No real drop", ""],
    too_early: ["Too early to check this sale", ""],
    unavailable: ["Not on sale: unavailable", ""]
  };
  function el2(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function renderPanel(store) {
    document.querySelector("britto-panel")?.remove();
    const host = document.createElement("britto-panel");
    const root = host.attachShadow({ mode: "closed" });
    const style = el2("style");
    style.textContent = CSS;
    const box = el2("div", "box");
    box.setAttribute("role", "complementary");
    box.setAttribute("aria-label", "Britto price history");
    const head = el2("div", "head");
    const logo = el2("span", "logo", "Brit");
    logo.append(el2("span", "", "to"));
    const mini = el2("span", "mini", "Checking the price\u2026");
    const toggle = el2("button", "", "\u2013");
    toggle.title = "Collapse";
    toggle.addEventListener("click", () => {
      const collapsed = box.classList.toggle("collapsed");
      toggle.textContent = collapsed ? "+" : "\u2013";
      toggle.title = collapsed ? "Expand" : "Collapse";
    });
    const close = el2("button", "", "\xD7");
    close.title = "Hide on this page";
    close.addEventListener("click", () => host.remove());
    head.append(logo, mini, toggle, close);
    const body = el2("div", "body");
    box.append(head, body);
    root.append(style, box);
    document.documentElement.append(host);
    return {
      loading() {
        body.replaceChildren(el2("p", "small", `Reading this ${store === "amazon" ? "Amazon" : store === "flipkart" ? "Flipkart" : "Myntra"} page\u2026`));
      },
      show(reply, ex, problem) {
        body.replaceChildren();
        if (problem) {
          body.append(el2("p", "note", problem));
          const save = el2("button", "", "Save this page for Britto (stays on your computer)");
          save.addEventListener("click", () => savePage(store));
          body.append(save);
        }
        if (!reply.ok) {
          if (reply.code !== "not_tracked") body.append(el2("p", "small", reply.message));
          mini.textContent = problem ? "Price not read" : "Britto is unreachable";
          return;
        }
        const v = reply.product;
        const s = v.stats;
        const priceNow = s.inStock === false ? "Out of stock" : rupees(s.current ?? ex.price);
        mini.textContent = `${priceNow} \xB7 ${v.verdict.headline.split(":")[0]}`;
        const priceRow = el2("div");
        priceRow.append(el2("span", "price", priceNow));
        if (s.currentMrp && s.current && s.currentMrp > s.current) {
          const m = el2("span", "mrp", "M.R.P. ");
          m.append(el2("s", "", rupees(s.currentMrp)));
          priceRow.append(m);
        }
        body.append(priceRow);
        if (reply.recorded === "hold") {
          body.append(el2("p", "note", `This page shows ${rupees(ex.price)}, far from the last price we know. It will appear once another shopper sees the same.`));
        }
        const verdict = el2("div", `card ${VERDICT_CLASS[v.verdict.kind] ?? ""}`);
        verdict.append(el2("b", "", v.verdict.headline), el2("span", "small", v.verdict.reasons[0] ?? ""));
        const [saleTitle, saleClass] = SALE[v.sale.status] ?? ["", ""];
        const sale = el2("div", `card ${saleClass}`);
        sale.append(el2("b", "", saleTitle), el2("span", "small", v.sale.explanation));
        body.append(verdict, sale);
        if (v.points.length) {
          const chart = el2("div", "chart-host");
          body.append(chart);
          drawChart(chart, v, 0);
        }
        const facts = [
          s.lowest ? `Lowest ${rupees(s.lowest.price)} (${date(s.lowest.at)})` : null,
          s.median != null ? `Usual ${rupees(s.median)}` : null,
          v.sale.claimedPct != null ? `Claims ${pct(v.sale.claimedPct)} off M.R.P.` : null
        ].filter(Boolean).join(" \xB7 ");
        if (facts) body.append(el2("p", "small", facts));
        const row = el2("div", "row");
        const go = el2("a", "go", "Full history on Britto");
        go.href = `${"https://britto.amitynoidalibrary.workers.dev"}/p/${encodeURIComponent(v.key)}`;
        go.target = "_blank";
        go.rel = "noopener";
        const bell = el2("a", "go", "Set a price alert");
        bell.href = `${"https://britto.amitynoidalibrary.workers.dev"}/p/${encodeURIComponent(v.key)}#alert`;
        bell.target = "_blank";
        bell.rel = "noopener";
        row.append(go, bell, el2("span", "small", s.trackedSince ? `Tracking since ${date(s.trackedSince)}` : ""));
        body.append(row);
      }
    };
  }
  function savePage(store) {
    const blob = new Blob(["<!-- saved by the Britto extension from ", location.href.replace(/--/g, ""), " -->\n", document.documentElement.outerHTML], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `britto-page-${store}-${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
  }

  // extension/src/content.ts
  var send = (msg) => chrome.runtime.sendMessage(msg);
  var WAITS = [600, 900, 1500, 3e3];
  var handledUrl = "";
  async function readPage(store, pid) {
    let last = null;
    for (const wait of WAITS) {
      await new Promise((r) => setTimeout(r, wait));
      last = confirmIdentity(store, pid, extract(store, document.documentElement.outerHTML));
      if (last.status === "priced" || last.status === "unavailable" || last.status === "blocked") return last;
    }
    return last;
  }
  async function run() {
    const url = location.href;
    if (url === handledUrl) return;
    handledUrl = url;
    const parsed = parseProductLink(url);
    if (!parsed.ok) return;
    const panel = renderPanel(parsed.link.store);
    panel.loading();
    const ex = await readPage(parsed.link.store, parsed.link.pid);
    if (location.href !== url) return;
    let reply;
    if (ex.status === "priced" || ex.status === "unavailable") {
      const observed = { status: ex.status, title: ex.title, image: ex.image, price: ex.price, mrp: ex.mrp };
      reply = await send({ type: "observe", url, observed });
      panel.show(reply, ex, null);
    } else {
      reply = await send({ type: "view", key: parsed.link.key });
      panel.show(reply, ex, ex.status === "unrecognised" ? "Britto cannot read the price on this page yet." : "This page did not load properly.");
    }
  }
  run();
  setInterval(() => {
    if (location.href !== handledUrl) run();
  }, 1e3);
})();
