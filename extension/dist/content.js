"use strict";
(() => {
  // core/stores.ts
  var STORES = {
    amazon: {
      id: "amazon",
      num: 1,
      name: "Amazon.in",
      hosts: ["amazon.in", "www.amazon.in", "m.amazon.in"],
      shortHosts: ["amzn.in", "amzn.to"],
      home: "https://www.amazon.in/",
      serverFetch: "yes",
      measured: '2026-10-26: in-stock /dp/ pages fetched with an honest bot User-Agent (from India, not yet from Cloudflare) returned the price box: \u20B9265, M.R.P. \u20B9299, "In stock".'
    },
    flipkart: {
      id: "flipkart",
      num: 2,
      name: "Flipkart",
      hosts: ["flipkart.com", "www.flipkart.com", "dl.flipkart.com"],
      shortHosts: [],
      home: "https://www.flipkart.com/",
      serverFetch: "refused",
      measured: '2026-10-26: product pages answered "Something went wrong! E002" instead of the product. Prices come from the browser extension.'
    },
    myntra: {
      id: "myntra",
      num: 3,
      name: "Myntra",
      hosts: ["myntra.com", "www.myntra.com"],
      shortHosts: [],
      home: "https://www.myntra.com/",
      serverFetch: "no_answer",
      measured: "2026-10-26: no response within 25 s to an honest bot User-Agent. Prices come from the browser extension."
    },
    vijaysales: {
      id: "vijaysales",
      num: 4,
      name: "Vijay Sales",
      hosts: ["vijaysales.com", "www.vijaysales.com"],
      shortHosts: [],
      home: "https://www.vijaysales.com/",
      serverFetch: "yes",
      measured: "2026-10-26: two product pages fetched with an honest bot User-Agent (from a cloud computer in the USA, not yet from Cloudflare) returned the price box: \u20B99,229 (M.R.P. \u20B911,900, the store says out of stock) and \u20B94,999 (M.R.P. \u20B915,999, in stock)."
    },
    reliancedigital: {
      id: "reliancedigital",
      num: 5,
      name: "Reliance Digital",
      hosts: ["reliancedigital.in", "www.reliancedigital.in"],
      shortHosts: [],
      home: "https://www.reliancedigital.in/",
      serverFetch: "yes",
      measured: `2026-10-26: 14 product pages fetched with an honest bot User-Agent (from a cloud computer in the USA, not yet from Cloudflare) all returned the price box, e.g. \u20B9999 (M.R.P. \u20B92,999). Its search-engine data says "in stock" even for items it will not sell; Britto reads the page's own "sellable" flag instead.`
    },
    nykaa: {
      id: "nykaa",
      num: 6,
      name: "Nykaa",
      hosts: ["nykaa.com", "www.nykaa.com"],
      shortHosts: [],
      home: "https://www.nykaa.com/",
      serverFetch: "yes",
      measured: "2026-10-26: 9 product pages fetched with an honest bot User-Agent (from a cloud computer in the USA, not yet from Cloudflare) all returned the product, e.g. \u20B9749 (M.R.P. \u20B91,150). One real listing shows \u20B90; Britto treats that as no price."
    },
    shopclues: {
      id: "shopclues",
      num: 7,
      name: "ShopClues",
      hosts: ["shopclues.com", "www.shopclues.com"],
      shortHosts: [],
      home: "https://www.shopclues.com/",
      serverFetch: "yes",
      measured: '2026-10-26: product pages fetched with an honest bot User-Agent (from a cloud computer in the USA, not yet from Cloudflare) returned the price box, e.g. \u20B9419; old listings say "This product is currently out of stock".'
    }
  };
  var STORE_IDS = Object.keys(STORES);
  var ASIN = /^[A-Z0-9]{10}$/;
  function storeForHost(host2) {
    for (const s of Object.values(STORES)) {
      if (s.hosts.includes(host2)) return { store: s.id, short: false };
      if (s.shortHosts.includes(host2)) return { store: s.id, short: true };
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
    const host2 = u.hostname.toLowerCase();
    const hit = storeForHost(host2);
    if (!hit) return { ok: false, reason: "unsupported_store" };
    if (hit.short) return { ok: false, reason: "short_link", store: hit.store, url: `https://${host2}${u.pathname}` };
    if (hit.store === "amazon") return amazon(u);
    if (hit.store === "flipkart") return flipkart(u);
    if (hit.store === "vijaysales") return vijaysales(u);
    if (hit.store === "reliancedigital") return reliancedigital(u);
    if (hit.store === "nykaa") return nykaa(u);
    if (hit.store === "shopclues") return shopclues(u);
    return myntra(u);
  }
  function ok(store, pid, url) {
    return { ok: true, link: { store, pid, key: `${store}:${pid}`, url } };
  }
  function amazon(u) {
    const m = /\/(?:dp|gp\/product|gp\/aw\/d|o\/ASIN)\/([A-Za-z0-9]{10})(?=[/?]|$)/.exec(u.pathname);
    const asin = m?.[1]?.toUpperCase();
    if (!asin || !ASIN.test(asin)) return { ok: false, reason: "not_a_product" };
    return ok("amazon", asin, `https://www.amazon.in/dp/${asin}`);
  }
  function flipkart(u) {
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
  function myntra(u) {
    const m = /\/(\d{5,10})\/buy\/?$/.exec(u.pathname) ?? /^\/(\d{5,10})\/?$/.exec(u.pathname);
    const id = m?.[1];
    if (!id) return { ok: false, reason: "not_a_product" };
    return ok("myntra", id, `https://www.myntra.com${u.pathname.replace(/\/$/, "")}`);
  }
  function vijaysales(u) {
    const m = /^\/p\/(\d{4,8})\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(u.pathname);
    if (!m) return { ok: false, reason: "not_a_product" };
    return ok("vijaysales", m[1], `https://www.vijaysales.com/p/${m[1]}/${m[2].toLowerCase()}`);
  }
  function reliancedigital(u) {
    const m = /^\/product\/([a-z0-9][a-z0-9-]{2,299})\/?$/i.exec(u.pathname);
    if (!m) return { ok: false, reason: "not_a_product" };
    const slug = m[1].toLowerCase();
    return ok("reliancedigital", slug, `https://www.reliancedigital.in/product/${slug}`);
  }
  function nykaa(u) {
    const m = /^\/([a-z0-9][a-z0-9-]*)\/p\/(\d{5,10})\/?$/i.exec(u.pathname);
    if (!m) return { ok: false, reason: "not_a_product" };
    return ok("nykaa", m[2], `https://www.nykaa.com/${m[1].toLowerCase()}/p/${m[2]}`);
  }
  function shopclues(u) {
    const m = /^\/([a-z0-9][a-z0-9-]*-(\d{6,10}))\.html$/i.exec(u.pathname);
    if (!m) return { ok: false, reason: "not_a_product" };
    return ok("shopclues", m[2], `https://www.shopclues.com/${m[1].toLowerCase()}.html`);
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
  function drawChart(host2, view, rangeDays) {
    host2.textContent = "";
    const all = toSpans(view.points, view.stats.lastCheckedAt);
    if (!all.length) {
      host2.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "No prices recorded yet." }));
      return;
    }
    const end = all[all.length - 1].to;
    const start = rangeDays ? Math.max(all[0].from, end - rangeDays * 864e5) : all[0].from;
    const t0 = start;
    const t1 = end > start ? end : start + 36e5;
    const spans = all.filter((s) => s.to > start || s.to === start && s === all[all.length - 1]).map((s, i, arr) => ({ ...s, from: Math.max(s.from, start), to: i === arr.length - 1 ? Math.max(s.to, t1) : s.to }));
    const W = Math.max(300, Math.round(host2.clientWidth - 16) || 720), H = W < 340 ? 150 : W < 500 ? 220 : 260, L = 60, R = 12, T = 14, B = 30;
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
    host2.append(svg, tip);
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
  function renderPanel(store, savePage) {
    document.querySelector("britto-panel")?.remove();
    const host2 = document.createElement("britto-panel");
    const root = host2.attachShadow({ mode: "closed" });
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
    close.addEventListener("click", () => host2.remove());
    head.append(logo, mini, toggle, close);
    const body = el2("div", "body");
    box.append(head, body);
    root.append(style, box);
    document.documentElement.append(host2);
    return {
      loading() {
        body.replaceChildren(el2("p", "small", `Reading this ${STORES[store].name} page\u2026`));
      },
      show(reply, ex, problem) {
        if (false) host2.dataset["reading"] = JSON.stringify(ex);
        body.replaceChildren();
        if (problem) {
          body.append(el2("p", "note", problem));
          if (savePage) {
            const save = el2("button", "", "Save this page for Britto (stays on your computer)");
            save.addEventListener("click", () => savePage(store));
            body.append(save);
          } else {
            body.append(el2("p", "small", 'Press "Save page" at the top to keep a copy of this page on your phone (nothing is uploaded), so Britto can learn to read it.'));
          }
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
  function savePageAsFile(store) {
    const blob = new Blob(["<!-- saved by the Britto extension from ", location.href.replace(/--/g, ""), " -->\n", document.documentElement.outerHTML], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `britto-page-${store}-${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
  }

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

  // core/select.ts
  var SelectorError = class extends Error {
  };
  var IDENT = /^-?[A-Za-z_][\w-]*/;
  function parseSelector(text) {
    const src = text.trim();
    if (!src) throw new SelectorError("empty selector");
    const parts = [];
    const combinators = [];
    let i = 0;
    const fail = (why) => {
      throw new SelectorError(`${why} at ${i} in "${src}"`);
    };
    const ident = () => {
      const m = IDENT.exec(src.slice(i));
      if (!m) fail("expected a name");
      i += m[0].length;
      return m[0];
    };
    while (i < src.length) {
      const c = { tag: null, id: null, classes: [], attrs: [] };
      if (src[i] === "*") i++;
      else if (/[A-Za-z]/.test(src[i])) c.tag = ident().toLowerCase();
      for (; ; ) {
        const ch = src[i];
        if (ch === "#") {
          i++;
          if (c.id) fail("two ids");
          c.id = ident();
        } else if (ch === ".") {
          i++;
          c.classes.push(ident());
        } else if (ch === "[") {
          i++;
          const m = /^\s*([A-Za-z_][\w:-]*)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*\]/.exec(src.slice(i));
          if (!m) fail("bad attribute test");
          c.attrs.push({ name: m[1].toLowerCase(), op: m[2] ?? "", value: m[3] ?? m[4] ?? m[5] ?? "" });
          i += m[0].length;
        } else break;
      }
      if (!c.tag && !c.id && !c.classes.length && !c.attrs.length && src[i - 1] !== "*") fail("expected a selector");
      parts.push(c);
      const ws = /^\s*/.exec(src.slice(i))[0].length;
      i += ws;
      if (i >= src.length) break;
      if (src[i] === ">") {
        combinators.push(">");
        i++;
        i += /^\s*/.exec(src.slice(i))[0].length;
      } else if (ws > 0) combinators.push(" ");
      else fail(`unsupported "${src[i]}"`);
    }
    if (combinators.length !== parts.length - 1) fail("dangling combinator");
    return { parts, combinators };
  }
  function parseAttrs(openTag) {
    const out = /* @__PURE__ */ new Map();
    const body = openTag.replace(/^<[A-Za-z][\w:-]*/, "").replace(/\/?>$/, "");
    const re = /([^\s"'=<>\/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (let m = re.exec(body); m; m = re.exec(body)) {
      const name = m[1].toLowerCase();
      if (!out.has(name)) out.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ""));
    }
    return out;
  }
  var attrsOf = (el3) => el3.attrs ??= parseAttrs(el3.open);
  function matchCompound(el3, c) {
    if (c.tag && c.tag !== el3.tag) return false;
    if (!c.id && !c.classes.length && !c.attrs.length) return true;
    if (!el3.open.includes("&")) {
      if (c.id && !el3.open.includes(c.id)) return false;
      for (const k of c.classes) if (!el3.open.includes(k)) return false;
    }
    const a = attrsOf(el3);
    if (c.id && a.get("id") !== c.id) return false;
    if (c.classes.length) {
      const list = (a.get("class") ?? "").split(/\s+/);
      if (!c.classes.every((k) => list.includes(k))) return false;
    }
    for (const t of c.attrs) {
      const v = a.get(t.name);
      if (v === void 0) return false;
      switch (t.op) {
        case "":
          break;
        case "=":
          if (v !== t.value) return false;
          break;
        case "~=":
          if (!v.split(/\s+/).includes(t.value)) return false;
          break;
        case "^=":
          if (!t.value || !v.startsWith(t.value)) return false;
          break;
        case "$=":
          if (!t.value || !v.endsWith(t.value)) return false;
          break;
        case "*=":
          if (!t.value || !v.includes(t.value)) return false;
          break;
        case "|=":
          if (v !== t.value && !v.startsWith(`${t.value}-`)) return false;
          break;
      }
    }
    return true;
  }
  function matches(el3, sel, i) {
    if (!matchCompound(el3, sel.parts[i])) return false;
    if (i === 0) return true;
    if (sel.combinators[i - 1] === ">") return el3.parent !== null && matches(el3.parent, sel, i - 1);
    for (let a = el3.parent; a; a = a.parent) if (matches(a, sel, i - 1)) return true;
    return false;
  }
  var VOID2 = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "param"]);
  var RAW = /* @__PURE__ */ new Set(["script", "style", "noscript", "textarea", "title", "template", "xmp"]);
  var SELF_SIBLING = /* @__PURE__ */ new Set(["li", "option", "p", "dt", "dd", "tr", "td", "th"]);
  var closers = /* @__PURE__ */ new Map();
  function closeTagAt(html, name, from) {
    let re = closers.get(name);
    if (!re) closers.set(name, re = new RegExp(`</${name}(?=[\\s/>])`, "gi"));
    re.lastIndex = from;
    return re.exec(html)?.index ?? -1;
  }
  var TAG = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\?[^>]*>|<(\/?)([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  function scan(html, sel, from, to) {
    TAG.lastIndex = from;
    let top = null;
    for (let m = TAG.exec(html); m && m.index < to; m = TAG.exec(html)) {
      const name = m[2]?.toLowerCase();
      if (!name) continue;
      if (m[1] === "/") {
        for (let e = top; e; e = e.parent) if (e.tag === name) {
          top = e.parent;
          break;
        }
        continue;
      }
      if (SELF_SIBLING.has(name) && top?.tag === name) top = top.parent;
      const el3 = { tag: name, open: m[0], start: m.index, parent: top };
      if (matches(el3, sel, sel.parts.length - 1)) return { start: el3.start, tag: el3.tag, open: el3.open, attrs: attrsOf(el3) };
      const selfClosing = /\/\s*>$/.test(m[0]);
      if (RAW.has(name)) {
        const close = closeTagAt(html, name, TAG.lastIndex);
        if (close === -1) return null;
        TAG.lastIndex = close;
        top = el3;
      } else if (!VOID2.has(name) && !selfClosing) {
        top = el3;
      }
    }
    return null;
  }
  function insideRawText(html, pos) {
    if (html.lastIndexOf("<!--", pos) > html.lastIndexOf("-->", pos)) return true;
    const opens = (src, t, at) => {
      let open2 = src.lastIndexOf(`<${t}`, at);
      while (open2 !== -1 && !/[\s>/]/.test(src[open2 + t.length + 1] ?? "")) open2 = src.lastIndexOf(`<${t}`, open2 - 1);
      return open2;
    };
    for (const t of ["script", "style"]) {
      const open2 = opens(html, t, pos);
      if (open2 !== -1 && open2 > html.lastIndexOf(`</${t}`, pos)) return true;
    }
    const from = Math.max(0, pos - 2e4);
    const window = html.slice(from, pos);
    const open = opens(window, "noscript", window.length);
    return open !== -1 && open > window.lastIndexOf("</noscript");
  }
  function* idPositions(html, id) {
    for (let at = html.indexOf(id); at !== -1; at = html.indexOf(id, at + id.length)) {
      const q = html[at - 1];
      const after = html[at + id.length] ?? "";
      let attrStart;
      if (q === '"' || q === "'") {
        if (after !== q) continue;
        attrStart = at - 4;
      } else if (q === "=") {
        if (!/[\s>/]/.test(after)) continue;
        attrStart = at - 3;
      } else continue;
      if (html.slice(attrStart, attrStart + 3).toLowerCase() !== "id=") continue;
      const before = html.charCodeAt(attrStart - 1);
      if (before !== 32 && before !== 10 && before !== 9 && before !== 13) continue;
      const open = html.lastIndexOf("<", at);
      if (open > html.lastIndexOf(">", at) && !insideRawText(html, open)) yield open;
    }
  }
  function* classPositions(html, cls) {
    for (let at = html.indexOf(cls); at !== -1; at = html.indexOf(cls, at + cls.length)) {
      const open = html.lastIndexOf("<", at);
      if (open === -1 || open < html.lastIndexOf(">", at)) continue;
      TAG.lastIndex = open;
      const m = TAG.exec(html);
      if (!m || m.index !== open || !m[2] || m[1] === "/" || open + m[0].length <= at) continue;
      if (!(parseAttrs(m[0]).get("class") ?? "").split(/\s+/).includes(cls) || insideRawText(html, open)) continue;
      yield open;
      at = open + m[0].length - cls.length;
    }
  }
  var cache = /* @__PURE__ */ new Map();
  function compile(selector) {
    let c = cache.get(selector);
    if (!c) {
      c = parseSelector(selector);
      if (cache.size > 500) cache.clear();
      cache.set(selector, c);
    }
    return c;
  }
  function selectFirst(html, selector, full = false) {
    const sel = typeof selector === "string" ? compile(selector) : selector;
    const head = sel.parts[0];
    if (full || !head.id && !head.classes.length) return scan(html, sel, 0, html.length);
    const anchors = head.id ? idPositions(html, head.id) : classPositions(html, head.classes[0]);
    for (const start of anchors) {
      if (sel.parts.length === 1) {
        const hit2 = scan(html, sel, start, start + 1);
        if (hit2) return hit2;
        continue;
      }
      const outer = elementFrom(html, start);
      const hit = scan(html, sel, start, outer ? start + outer.length : html.length);
      if (hit) return hit;
    }
    return null;
  }
  function outerOf(html, found) {
    if (RAW.has(found.tag)) {
      const close = closeTagAt(html, found.tag, found.start + found.open.length);
      const end = close === -1 ? -1 : html.indexOf(">", close);
      return end === -1 ? null : html.slice(found.start, end + 1);
    }
    return elementFrom(html, found.start);
  }
  function innerOf(html, found) {
    const outer = outerOf(html, found);
    if (outer == null) return null;
    if (VOID2.has(found.tag) || /\/\s*>$/.test(found.open)) return "";
    const end = outer.toLowerCase().lastIndexOf(`</${found.tag}`);
    return end === -1 ? null : outer.slice(found.open.length, end);
  }

  // core/recipe.ts
  function jsonPath(root, path) {
    let cur = root;
    for (const seg of path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
      if (cur == null) return void 0;
      if (Array.isArray(cur)) cur = /^\d+$/.test(seg) ? cur[Number(seg)] : cur[0]?.[seg];
      else if (typeof cur === "object") cur = cur[seg];
      else return void 0;
    }
    return cur;
  }

  // core/jsonld.ts
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
  function jsonLdProductNode(html) {
    for (const n of jsonLdNodes(html)) if (isType(n, "Product")) return n;
    return null;
  }
  function jsonLdPath(node, path) {
    if (!node) return null;
    let v = jsonPath(node, path);
    if (v && typeof v === "object" && !Array.isArray(v) && typeof v["url"] === "string") v = v["url"];
    if (Array.isArray(v)) v = v[0];
    return v == null || typeof v === "object" ? null : String(v);
  }

  // core/interpret.ts
  var MIN_PRICE = 100;
  var once = (ctx, key, make) => {
    if (!ctx.memo.has(key)) ctx.memo.set(key, make());
    return ctx.memo.get(key);
  };
  function sourceText(field, ctx) {
    if (field.jsonld) return jsonLdPath(once(ctx, "ld-node", () => jsonLdProductNode(ctx.html)), field.jsonld);
    if (field.global) return ctx.html;
    if (field.attribute === "URL") return ctx.url || null;
    if (!field.selector.length) return null;
    const found = once(ctx, `sel:${field.selector.join(" ")}`, () => selectFirst(ctx.html, field.selector.join(" ")));
    if (!found) return null;
    switch (field.attribute) {
      case "innerText":
      case "textContent": {
        const outer = outerOf(ctx.html, found);
        return outer == null ? null : textOf(outer);
      }
      case "innerHTML":
        return innerOf(ctx.html, found);
      default: {
        const name = field.attribute.startsWith("attr:") ? field.attribute.slice(5).toLowerCase() : field.attribute.toLowerCase();
        return found.attrs.get(name) ?? null;
      }
    }
  }
  function fieldValue(field, html, url = "", memo = /* @__PURE__ */ new Map()) {
    const ctx = { html, url, memo };
    const source = `${field.jsonld ?? ""}|${field.global ? "*" : field.selector.join(" ")}|${field.attribute}`;
    let text = sourceText(field, ctx);
    if (text == null) return null;
    const raw = field.global || field.attribute === "innerHTML";
    if (field.sub_regex) {
      const re = field.sub_regex;
      const m = once(ctx, `sub:${re}:${source}`, () => new RegExp(re).exec(text));
      if (!m) return null;
      text = m[1] ?? m[0];
    }
    if (field.json) {
      const body = text.trim().replace(/;\s*$/, "");
      const parsed = once(ctx, `json:${field.sub_regex ?? ""}:${source}`, () => {
        try {
          return JSON.parse(body);
        } catch {
          return void 0;
        }
      });
      const v = jsonPath(parsed, field.json);
      if (v == null || typeof v === "object") return null;
      text = String(v);
    }
    if (field.squash) text = text.replace(/\s+/g, "");
    if (field.regex) {
      let hit = null;
      for (const src of field.regex) {
        const re = new RegExp(src, "g");
        let n = 0;
        for (let m = re.exec(text); m; m = re.exec(text)) {
          if (n++ === (field.match ?? 0)) {
            hit = m[1] ?? m[0];
            break;
          }
          if (m[0] === "") re.lastIndex++;
        }
        if (hit != null) break;
      }
      if (hit == null) return null;
      text = hit;
    }
    for (const [from, to] of field.replace ?? []) text = text.split(from).join(to);
    const out = (raw && !field.json ? decodeEntities(text) : text).replace(/\s+/g, " ").trim();
    return out || null;
  }
  function firstOf(fields, ctx) {
    for (const f of fields) {
      const v = fieldValue(f, ctx.html, ctx.url, ctx.memo);
      if (v != null) return v;
    }
    return null;
  }
  function result(partial) {
    return { title: null, price: null, mrp: null, inStock: null, image: null, pid: null, ...partial };
  }
  function isBlocked(cfg, html) {
    return (cfg.domRecipe.blocked ?? []).some((all) => all.every((src) => new RegExp(src).test(html)));
  }
  function isUnavailable(cfg, ctx) {
    const av = cfg.domRecipe.availability;
    const hit = (t) => t != null && av.outOfStockText.some((s) => t.toLowerCase().includes(s));
    for (const sel of av.selectors) {
      if (hit(fieldValue({ selector: [sel], attribute: "textContent" }, ctx.html, ctx.url, ctx.memo))) return true;
    }
    for (const f of av.fields ?? []) if (hit(fieldValue(f, ctx.html, ctx.url, ctx.memo))) return true;
    for (const d of cfg.domRecipe.discontinuedText ?? []) {
      const t = fieldValue({ selector: [d.sel], attribute: "textContent" }, ctx.html, ctx.url, ctx.memo);
      if (t != null && t.toLowerCase().includes(d.txt.toLowerCase())) return true;
    }
    return false;
  }
  function readPage(cfg, html, url = "") {
    const rule = (why) => `${cfg.store}:${why}`;
    const d = cfg.domRecipe;
    if (isBlocked(cfg, html)) return result({ status: "blocked", rule: rule("blocked") });
    const ctx = { html, url, memo: /* @__PURE__ */ new Map() };
    if (d.classSelector && !selectFirst(html, d.classSelector)) return result({ status: "unrecognised", rule: rule("class-mismatch") });
    const title = firstOf(d.name, ctx);
    if (cfg.verified == null) return result({ status: "unrecognised", title, rule: rule("reader-not-verified") });
    if (!title) return result({ status: "unrecognised", rule: rule("no-name") });
    const image = firstOf(d.image, ctx);
    const pid = firstOf(d.pid, ctx);
    if (isUnavailable(cfg, ctx)) return result({ status: "unavailable", title, image, pid, inStock: false, rule: rule("unavailable") });
    const price = parseRupees(firstOf(d.price, ctx));
    if (price == null) return result({ status: "unrecognised", title, image, rule: rule("no-price") });
    if (price < MIN_PRICE) return result({ status: "unrecognised", title, image, rule: rule("implausible-price") });
    const mrpRead = parseRupees(firstOf(d.mrp, ctx));
    const mrp = mrpRead != null && mrpRead >= MIN_PRICE ? mrpRead : null;
    return result({ status: "priced", title, image, pid, price, mrp, inStock: true, rule: rule("priced") });
  }
  function confirmIdentity(store, linkPid, ex, reportsPid) {
    if (ex.status !== "priced" && ex.status !== "unavailable") return ex;
    const expected = store === "flipkart" ? linkPid.split(".")[0] : linkPid;
    if (ex.pid === expected) return ex;
    if (ex.pid == null && !reportsPid) return ex;
    return { ...ex, status: "unrecognised", price: null, mrp: null, inStock: null, rule: `${ex.rule}+identity-mismatch(${ex.pid ?? "none"})` };
  }

  // extension/src/reader.ts
  var host;
  var send = (msg) => host.send(msg);
  var WAITS = [600, 900, 1500, 3e3];
  var handledUrl = "";
  async function readThisPage(config, pid) {
    let last = null;
    for (const wait of WAITS) {
      await new Promise((r) => setTimeout(r, wait));
      last = confirmIdentity(config.store, pid, readPage(config, document.documentElement.outerHTML, location.href), config.reportsPid);
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
    const { store, pid, key } = parsed.link;
    const panel = renderPanel(store, host.savePage);
    panel.loading();
    const reader = await send({ type: "getReaderConfig", store, device: host.device });
    if (location.href !== url) return;
    if (!reader?.ok) {
      const none = { status: "unrecognised", title: null, price: null, mrp: null, inStock: null, image: null, pid: null, rule: "no-reader" };
      panel.show(await send({ type: "getProductAnswer", key }), none, `Britto cannot read this page right now: ${reader?.message ?? "no reader"}.`);
      return;
    }
    const ex = await readThisPage(reader.config, pid);
    if (location.href !== url) return;
    if (ex.status === "priced" || ex.status === "unavailable") {
      const observed = { status: ex.status, title: ex.title, image: ex.image, price: ex.price, mrp: ex.mrp };
      panel.show(await send({ type: "postObservation", url, observed, configVersion: reader.version }), ex, null);
    } else {
      void send({ type: "reportTelemetry", store, outcome: ex.status === "blocked" ? "blocked" : "unrecognised", configVersion: reader.version });
      const reply = await send({ type: "getProductAnswer", key });
      panel.show(reply, ex, ex.status === "unrecognised" ? "Britto cannot read the price on this page yet." : "This page did not load properly.");
    }
  }
  function startReader(h) {
    host = h;
    run();
    setInterval(() => {
      if (location.href !== handledUrl) run();
    }, 1e3);
  }

  // extension/src/content.ts
  startReader({ send: (msg) => chrome.runtime.sendMessage(msg), device: "desktop", savePage: savePageAsFile });
})();
