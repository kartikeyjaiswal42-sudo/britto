"use strict";
(() => {
  // web/spend.js
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function parseOrderDate(text) {
    if (!text) return null;
    const s = text.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    let d, m, y;
    let hit = /\b(\d{1,2}) ([a-z]{3,9})\.? (\d{4})\b/.exec(s);
    if (hit) [d, m, y] = [Number(hit[1]), MONTHS.indexOf(hit[2].slice(0, 3)) + 1, Number(hit[3])];
    else if (hit = /\b([a-z]{3,9})\.? (\d{1,2}) (\d{4})\b/.exec(s)) [m, d, y] = [MONTHS.indexOf(hit[1].slice(0, 3)) + 1, Number(hit[2]), Number(hit[3])];
    else if (hit = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s)) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
    if (!d || !m || !y || m < 1 || m > 12) return null;
    const day = new Date(Date.UTC(y, m - 1, d));
    if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function summarize(orders) {
    const months = /* @__PURE__ */ new Map();
    const stores = /* @__PURE__ */ new Map();
    let total = 0;
    for (const o of orders) {
      total += o.total;
      const month = o.date.slice(0, 7);
      const m = months.get(month) ?? { total: 0, orders: 0 };
      months.set(month, { total: m.total + o.total, orders: m.orders + 1 });
      const s = stores.get(o.store) ?? { total: 0, orders: 0 };
      stores.set(o.store, { total: s.total + o.total, orders: s.orders + 1 });
    }
    const days = orders.map((o) => o.date).sort();
    return {
      orders: orders.length,
      total,
      first: days[0] ?? null,
      last: days.at(-1) ?? null,
      byMonth: [...months].map(([month, r]) => ({ month, ...r })).sort((a, b) => b.month.localeCompare(a.month)),
      byStore: [...stores].map(([store, r]) => ({ store, ...r })).sort((a, b) => b.total - a.total || a.store.localeCompare(b.store))
    };
  }

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
      serverFetch: "refused",
      measured: `2026-10-27: refuses our server on Cloudflare (HTTP 403, twice, live), though the same honest bot User-Agent got full product pages from a cloud computer in the USA (14 pages, 2026-10-26) and from India. Prices come from shoppers' own pages (the extension and the app). Its search-engine data says "in stock" even for items it will not sell; Britto reads the page's own "sellable" flag instead.`
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

  // core/spend.ts
  var summarize2 = (orders) => summarize(orders);
  var isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && parseOrderDate(`${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`) === s;
  function isOrder(o) {
    if (!o || typeof o !== "object") return false;
    const x = o;
    return STORE_IDS.includes(x["store"]) && typeof x["orderId"] === "string" && x["orderId"].length > 0 && x["orderId"].length <= 64 && typeof x["date"] === "string" && isDay(x["date"]) && Number.isSafeInteger(x["total"]) && x["total"] >= 0 && Array.isArray(x["items"]) && x["items"].length <= 50 && x["items"].every((i) => typeof i === "string" && i.length <= 200);
  }

  // extension/src/popup.ts
  var site = document.getElementById("site");
  site.href = "https://britto.amitynoidalibrary.workers.dev";
  document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
  var spend = document.getElementById("spend");
  var clear = document.getElementById("spend-clear");
  var rupees = (paise) => `\u20B9${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  async function showSpend() {
    const kept = (await chrome.storage.local.get("spend:orders"))["spend:orders"] ?? [];
    const s = summarize2(kept.filter(isOrder));
    if (s.orders === 0) return;
    spend.textContent = `${rupees(s.total)} on ${s.orders} order${s.orders === 1 ? "" : "s"} (${s.first} to ${s.last}), kept on this computer only. Latest month with orders (${s.byMonth[0]?.month}): ${rupees(s.byMonth[0]?.total ?? 0)}.`;
    clear.hidden = false;
  }
  clear.addEventListener("click", async () => {
    await chrome.storage.local.remove("spend:orders");
    clear.hidden = true;
    spend.textContent = "Deleted from this computer.";
  });
  void showSpend();
})();
