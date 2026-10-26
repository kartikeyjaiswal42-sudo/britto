"use strict";
(() => {
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
    if (hit.store === "amazon") return amazon(u);
    if (hit.store === "flipkart") return flipkart(u);
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

  // extension/src/background.ts
  var RESEND_AFTER = 30 * 6e4;
  async function call(path, init) {
    try {
      const res = await fetch("https://britto.amitynoidalibrary.workers.dev" + path, { ...init, headers: { "content-type": "application/json", ...init?.headers ?? {} } });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        const err = body?.["error"] ?? {};
        return { ok: false, code: err.code ?? `http_${res.status}`, message: err.message ?? `Britto answered ${res.status}` };
      }
      return { ok: true, ...body };
    } catch (e) {
      return { ok: false, code: "network", message: `Could not reach Britto (${String(e)})` };
    }
  }
  async function sentRecently(signature) {
    const key = `sent:${signature}`;
    const got = await chrome.storage.session.get(key);
    const at = got[key];
    if (at && Date.now() - at < RESEND_AFTER) return true;
    await chrome.storage.session.set({ [key]: Date.now() });
    return false;
  }
  async function handle(msg) {
    if (msg.type === "view") return call(`/api/products/${encodeURIComponent(msg.key)}`);
    const parsed = parseProductLink(msg.url);
    if (!parsed.ok) return { ok: false, code: "not_a_product", message: "Not a product page." };
    const o = msg.observed;
    if (await sentRecently(`${parsed.link.key}|${o.status}|${o.price}|${o.mrp}`)) {
      const view = await call(`/api/products/${encodeURIComponent(parsed.link.key)}`);
      if (view.ok) return { ...view, recorded: "skip", reason: "sent_recently" };
    }
    return call("/api/observations", { method: "POST", body: JSON.stringify({ url: msg.url, observed: o }) });
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handle(msg).then(sendResponse);
    return true;
  });
})();
