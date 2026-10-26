"use strict";
(() => {
  // core/select.ts
  var SelectorError = class extends Error {
  };
  var IDENT = /^-?[A-Za-z_][\w-]*/;
  function parseSelector(text2) {
    const src = text2.trim();
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

  // core/recipe.ts
  var ATTRS = /* @__PURE__ */ new Set(["innerText", "innerHTML", "textContent", "content", "href", "alt", "URL"]);
  var FIELD_KEYS = /* @__PURE__ */ new Set(["selector", "attribute", "regex", "match", "global", "sub_regex", "squash", "json", "jsonld", "replace"]);
  var TOP_KEYS = /* @__PURE__ */ new Set(["schema", "store", "device", "revision", "verified", "reportsPid", "toCacheLong", "domRecipe", "apiRecipes"]);
  var DOM_KEYS = /* @__PURE__ */ new Set([
    "classSelector",
    "name",
    "price",
    "mrp",
    "image",
    "pid",
    "itm",
    "availability",
    "discontinuedText",
    "blocked",
    "earlyStop",
    "rating",
    "ratingsCount",
    "reviewsCount",
    "brand",
    "categoryPath",
    "seller",
    "pincodeFromStorageKeys",
    "offers"
  ]);
  var AVAIL_KEYS = /* @__PURE__ */ new Set(["selectors", "outOfStockText", "fields"]);
  var API_KEYS = /* @__PURE__ */ new Set(["url", "method", "headers", "bodyTemplate", "parse", "imageTemplateReplacements"]);
  var PARSE_KEYS = /* @__PURE__ */ new Set(["root", "match", "fields", "oos", "oosDefault"]);
  var API_FIELD_KEYS = /* @__PURE__ */ new Set(["product_id", "price", "mrp", "productName", "image", "groupId"]);
  var IDENTITY_HEADER = /^(user-agent|origin|referer|cookie|authorization|host|forwarded|x-forwarded-|x-real-ip|true-client-ip|proxy-|sec-)/i;
  function isObj(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function unknownKeys(o, known, where, errors) {
    for (const k of Object.keys(o)) if (!known.has(k)) errors.push(`${where}: unknown key "${k}"`);
  }
  var isPath = (x) => typeof x === "string" && x.length > 0;
  function checkRegex(src, where, errors) {
    if (typeof src !== "string" || !src) {
      errors.push(`${where}: regex must be a non-empty string`);
      return;
    }
    try {
      new RegExp(src);
    } catch (e) {
      errors.push(`${where}: bad regex (${e.message})`);
    }
  }
  function checkSelector(src, where, errors) {
    if (typeof src !== "string") {
      errors.push(`${where}: selector must be a string`);
      return;
    }
    try {
      compile(src);
    } catch (e) {
      errors.push(`${where}: ${e instanceof SelectorError ? e.message : String(e)}`);
    }
  }
  function checkField(f, where, errors) {
    if (!isObj(f)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    unknownKeys(f, FIELD_KEYS, where, errors);
    if (!Array.isArray(f["selector"])) errors.push(`${where}.selector: must be an array`);
    else f["selector"].forEach((s, i) => checkSelector(s, `${where}.selector[${i}]`, errors));
    const a = f["attribute"];
    if (typeof a !== "string" || !(ATTRS.has(a) || /^attr:[A-Za-z_][\w:-]*$/.test(a))) errors.push(`${where}.attribute: unknown "${String(a)}"`);
    const usesSource = f["global"] === true || typeof f["jsonld"] === "string" || a === "URL";
    if (Array.isArray(f["selector"]) && f["selector"].length === 0 && !usesSource) errors.push(`${where}: an empty selector needs attribute "URL", global or jsonld`);
    if (f["regex"] !== void 0) {
      if (!Array.isArray(f["regex"]) || !f["regex"].length) errors.push(`${where}.regex: must be a non-empty array`);
      else f["regex"].forEach((r, i) => checkRegex(r, `${where}.regex[${i}]`, errors));
    }
    if (f["sub_regex"] !== void 0) checkRegex(f["sub_regex"], `${where}.sub_regex`, errors);
    if (f["match"] !== void 0 && !(Number.isInteger(f["match"]) && f["match"] >= 0)) errors.push(`${where}.match: must be a whole number`);
    for (const k of ["global", "squash"]) if (f[k] !== void 0 && typeof f[k] !== "boolean") errors.push(`${where}.${k}: must be true/false`);
    for (const k of ["json", "jsonld"]) if (f[k] !== void 0 && (typeof f[k] !== "string" || !f[k])) errors.push(`${where}.${k}: must be a path string`);
    if (f["replace"] !== void 0 && !(Array.isArray(f["replace"]) && f["replace"].every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "string")))) {
      errors.push(`${where}.replace: must be [from, to] string pairs`);
    }
  }
  function checkFields(v, where, errors, required) {
    if (v === void 0 && !required) return;
    if (!Array.isArray(v)) {
      errors.push(`${where}: must be an array of fields`);
      return;
    }
    v.forEach((f, i) => checkField(f, `${where}[${i}]`, errors));
  }
  function checkApiRecipe(r, where, errors) {
    if (!isObj(r) || typeof r["url"] !== "string" || !r["url"] || r["method"] !== "GET" && r["method"] !== "POST" || !isObj(r["parse"])) {
      errors.push(`${where}: needs url, method GET|POST and parse`);
      return;
    }
    unknownKeys(r, API_KEYS, where, errors);
    const p = r["parse"];
    unknownKeys(p, PARSE_KEYS, `${where}.parse`, errors);
    if (!Array.isArray(p["root"]) || !p["root"].length || !p["root"].every(isPath)) errors.push(`${where}.parse.root: must be a non-empty list of paths`);
    const f = p["fields"];
    if (!isObj(f)) errors.push(`${where}.parse.fields: must be an object`);
    else {
      unknownKeys(f, API_FIELD_KEYS, `${where}.parse.fields`, errors);
      for (const [k, v] of Object.entries(f)) {
        const ok2 = k === "productName" ? Array.isArray(v) && v.length > 0 && v.every(isPath) : isPath(v);
        if (!ok2) errors.push(`${where}.parse.fields.${k}: must be ${k === "productName" ? "a non-empty list of paths" : "a path"}`);
      }
    }
    if (p["match"] !== void 0 && !(Array.isArray(p["match"]) && p["match"].every((m) => isObj(m) && isPath(m["path"]) && Object.keys(m).every((k) => ["path", "eq", "ne"].includes(k)) && (m["eq"] === void 0 || Array.isArray(m["eq"])) && (m["ne"] === void 0 || Array.isArray(m["ne"]))))) {
      errors.push(`${where}.parse.match: must be [{path, eq?: [], ne?: []}]`);
    }
    if (p["oos"] !== void 0 && !(Array.isArray(p["oos"]) && p["oos"].every((o) => isObj(o) && isPath(o["path"]) && Array.isArray(o["oos"]) && Object.keys(o).length === 2))) {
      errors.push(`${where}.parse.oos: must be [{path, oos: []}]`);
    }
    if (p["oosDefault"] !== void 0 && p["oosDefault"] !== 0 && p["oosDefault"] !== 1) errors.push(`${where}.parse.oosDefault: must be 0 or 1`);
    if (r["headers"] !== void 0) {
      if (!isObj(r["headers"])) errors.push(`${where}.headers: must be an object`);
      else for (const [h, v] of Object.entries(r["headers"])) {
        if (IDENTITY_HEADER.test(h)) errors.push(`${where}.headers: "${h}" is not ours to set (rule 1)`);
        if (typeof v !== "string" && typeof v !== "number") errors.push(`${where}.headers.${h}: must be text or a number`);
      }
    }
    const itr = r["imageTemplateReplacements"];
    if (itr !== void 0 && !(isObj(itr) && Object.values(itr).every((v) => typeof v === "string"))) errors.push(`${where}.imageTemplateReplacements: must map text to text`);
  }
  function validateReader(input) {
    const errors = [];
    if (!isObj(input)) return { ok: false, errors: ["config must be an object"] };
    unknownKeys(input, TOP_KEYS, "config", errors);
    if (input["schema"] !== 1) errors.push("schema: must be 1");
    if (!STORE_IDS.includes(String(input["store"]))) errors.push(`store: unknown "${String(input["store"])}"`);
    if (input["device"] !== "desktop" && input["device"] !== "mobile") errors.push("device: must be desktop or mobile");
    if (!Number.isInteger(input["revision"]) || input["revision"] < 1) errors.push("revision: must be a whole number >= 1");
    const v = input["verified"];
    if (v !== null && !(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) errors.push("verified: must be null or YYYY-MM-DD");
    if (typeof input["reportsPid"] !== "boolean") errors.push("reportsPid: must be true/false");
    if (input["toCacheLong"] !== void 0 && typeof input["toCacheLong"] !== "boolean") errors.push("toCacheLong: must be true/false");
    const d = input["domRecipe"];
    if (!isObj(d)) errors.push("domRecipe: must be an object");
    else {
      unknownKeys(d, DOM_KEYS, "domRecipe", errors);
      for (const k of ["name", "price", "mrp", "image", "pid", "itm"]) checkFields(d[k], `domRecipe.${k}`, errors, true);
      if (d["pincodeFromStorageKeys"] !== void 0 && !(Array.isArray(d["pincodeFromStorageKeys"]) && d["pincodeFromStorageKeys"].every(isPath))) {
        errors.push("domRecipe.pincodeFromStorageKeys: must be a list of names");
      }
      for (const k of ["rating", "ratingsCount", "reviewsCount", "brand", "categoryPath", "seller"]) checkFields(d[k], `domRecipe.${k}`, errors, false);
      if (d["classSelector"] !== void 0) checkSelector(d["classSelector"], "domRecipe.classSelector", errors);
      const of = d["offers"];
      if (of !== void 0) {
        if (!isObj(of)) errors.push("domRecipe.offers: must be an object");
        else {
          unknownKeys(of, /* @__PURE__ */ new Set(["items", "title", "text", "count", "code", "max"]), "domRecipe.offers", errors);
          checkSelector(of["items"], "domRecipe.offers.items", errors);
          checkField(of["title"], "domRecipe.offers.title", errors);
          checkField(of["text"], "domRecipe.offers.text", errors);
          if (of["count"] !== void 0) checkField(of["count"], "domRecipe.offers.count", errors);
          if (of["code"] !== void 0) checkField(of["code"], "domRecipe.offers.code", errors);
          if (of["max"] !== void 0 && !(Number.isInteger(of["max"]) && of["max"] >= 1 && of["max"] <= 20)) errors.push("domRecipe.offers.max: 1 to 20");
        }
      }
      const av = d["availability"];
      if (!isObj(av)) errors.push("domRecipe.availability: must be an object");
      else {
        unknownKeys(av, AVAIL_KEYS, "domRecipe.availability", errors);
        if (!Array.isArray(av["selectors"])) errors.push("domRecipe.availability.selectors: must be an array");
        else av["selectors"].forEach((s, i) => checkSelector(s, `domRecipe.availability.selectors[${i}]`, errors));
        if (!Array.isArray(av["outOfStockText"]) || !av["outOfStockText"].every((t) => typeof t === "string" && t === t.toLowerCase() && t.length > 0)) {
          errors.push("domRecipe.availability.outOfStockText: must be lower-case strings");
        }
        checkFields(av["fields"], "domRecipe.availability.fields", errors, false);
      }
      if (d["blocked"] !== void 0) {
        if (!Array.isArray(d["blocked"]) || !d["blocked"].every((alt) => Array.isArray(alt) && alt.length > 0)) errors.push("domRecipe.blocked: must be a list of regex lists");
        else d["blocked"].forEach((alt, i) => alt.forEach((r, j) => checkRegex(r, `domRecipe.blocked[${i}][${j}]`, errors)));
      }
      if (d["discontinuedText"] !== void 0) {
        if (!Array.isArray(d["discontinuedText"])) errors.push("domRecipe.discontinuedText: must be an array");
        else d["discontinuedText"].forEach((x, i) => {
          if (!isObj(x) || typeof x["txt"] !== "string") errors.push(`domRecipe.discontinuedText[${i}]: needs sel and txt`);
          else checkSelector(x["sel"], `domRecipe.discontinuedText[${i}].sel`, errors);
        });
      }
      const es = d["earlyStop"];
      if (es !== void 0) {
        const ids = (x) => Array.isArray(x) && x.every((s) => typeof s === "string" && /^[\w:-]+$/.test(s));
        if (!isObj(es) || !ids(es["complete"]) || es["thenUnavailableOr"] !== void 0 && !ids(es["thenUnavailableOr"])) {
          errors.push("domRecipe.earlyStop: complete / thenUnavailableOr must be lists of element ids");
        }
      }
    }
    if (input["apiRecipes"] !== void 0) {
      if (!Array.isArray(input["apiRecipes"])) errors.push("apiRecipes: must be an array");
      else input["apiRecipes"].forEach((r, i) => checkApiRecipe(r, `apiRecipes[${i}]`, errors));
    }
    return errors.length ? { ok: false, errors } : { ok: true, config: input };
  }
  function canonicalJson(v) {
    if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
    if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
    return JSON.stringify(v);
  }
  function fnv(text2) {
    let a = 2166136261;
    let b = 16777619 ^ 1540483477;
    for (let i = 0; i < text2.length; i++) {
      const c = text2.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619) >>> 0;
      b = Math.imul(b ^ c, 1540483477) >>> 0;
    }
    return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
  }
  function configVersion(c) {
    return `${c.store}.${c.device}.r${c.revision}.${fnv(canonicalJson(c)).slice(0, 12)}`;
  }
  function configFromServed(body) {
    if (!isObj(body) || typeof body["version"] !== "string") return { ok: false, errors: ["not a served reader config"] };
    const { version, storeNumber: _n, features, ...rest } = body;
    const v = validateReader(rest);
    if (!v.ok) return v;
    if (configVersion(v.config) !== version) return { ok: false, errors: [`content does not match version ${String(version)}`] };
    return { ok: true, config: v.config, version, deviceFallback: isObj(features) && features["deviceFallback"] === true };
  }

  // extension/src/messages.ts
  var STORES2 = new Set(STORE_IDS);
  var isObj2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  var text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
  var VERSION = /^[\w.-]{1,80}$/;
  var nullable = (v, ok2) => v === null || ok2(v);
  var paise = (v) => Number.isSafeInteger(v) && v > 0;
  function isRequest(m) {
    if (!isObj2(m)) return false;
    switch (m["type"]) {
      case "getReaderConfig":
        return STORES2.has(String(m["store"])) && (m["device"] === "desktop" || m["device"] === "mobile");
      case "postObservation": {
        const o = m["observed"];
        return text(m["url"], 2e3) && typeof m["configVersion"] === "string" && VERSION.test(m["configVersion"]) && isObj2(o) && (o["status"] === "priced" || o["status"] === "unavailable") && nullable(o["title"], (x) => text(x, 500)) && nullable(o["image"], (x) => text(x, 1e3)) && nullable(o["price"], paise) && nullable(o["mrp"], paise);
      }
      case "getProductAnswer":
        return text(m["key"], 120);
      case "reportTelemetry":
        return STORES2.has(String(m["store"])) && (m["outcome"] === "blocked" || m["outcome"] === "unrecognised") && typeof m["configVersion"] === "string" && VERSION.test(m["configVersion"]);
      default:
        return false;
    }
  }

  // extension/src/background.ts
  var RESEND_AFTER = 30 * 6e4;
  var READER_VERSION = chrome.runtime.getManifest().version;
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
  var inFlight = /* @__PURE__ */ new Map();
  async function readerConfig(store, device) {
    const key = `reader:${store}.${device}`;
    const cached = (await chrome.storage.session.get(key))[key];
    const use = (body) => {
      const c = configFromServed(body);
      return c.ok ? { ok: true, config: c.config, version: c.version } : { ok: false, code: "bad_config", message: `Britto sent a reader it could not check (${c.errors[0] ?? ""})` };
    };
    if (cached && Date.now() - cached.at < 6e5) return use(cached.body);
    try {
      const res = await fetch(`${"https://britto.amitynoidalibrary.workers.dev"}/api/config/reader?store=${encodeURIComponent(store)}&device=${device}&v=${READER_VERSION}`, {
        headers: cached ? { "if-none-match": cached.etag } : {},
        cache: "no-store"
        // the session cache above is the only cache: one place to reason about
      });
      if (res.status === 304 && cached) {
        await chrome.storage.session.set({ [key]: { ...cached, at: Date.now() } });
        return use(cached.body);
      }
      if (!res.ok) return cached ? use(cached.body) : { ok: false, code: `http_${res.status}`, message: `Britto has no reader for this store (${res.status})` };
      const body = await res.json();
      const reply = use(body);
      if (reply.ok) await chrome.storage.session.set({ [key]: { at: Date.now(), etag: res.headers.get("etag") ?? "", body } });
      return reply;
    } catch (e) {
      return cached ? use(cached.body) : { ok: false, code: "network", message: `Could not reach Britto (${String(e)})` };
    }
  }
  async function handle(msg) {
    switch (msg.type) {
      case "getReaderConfig": {
        const key = `${msg.store}.${msg.device}`;
        let p = inFlight.get(key);
        if (!p) {
          p = readerConfig(msg.store, msg.device).finally(() => inFlight.delete(key));
          inFlight.set(key, p);
        }
        return p;
      }
      case "getProductAnswer":
        return call(`/api/products/${encodeURIComponent(msg.key)}`);
      case "reportTelemetry":
        await call("/api/telemetry", { method: "POST", body: JSON.stringify({ feature: "read", store: msg.store, outcome: msg.outcome, configVersion: msg.configVersion, readerVersion: READER_VERSION, client: "extension" }) });
        return { ok: true };
      case "postObservation": {
        const parsed = parseProductLink(msg.url);
        if (!parsed.ok) return { ok: false, code: "not_a_product", message: "Not a product page." };
        const o = msg.observed;
        if (await sentRecently(`${parsed.link.key}|${o.status}|${o.price}|${o.mrp}`)) {
          const view = await call(`/api/products/${encodeURIComponent(parsed.link.key)}`);
          if (view.ok) return { ...view, recorded: "skip", reason: "sent_recently" };
        }
        return call("/api/observations", {
          method: "POST",
          body: JSON.stringify({ url: msg.url, observed: o, configVersion: msg.configVersion, readerVersion: READER_VERSION, client: "extension" })
        });
      }
    }
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !isRequest(msg)) return false;
    handle(msg).then(sendResponse);
    return true;
  });
})();
