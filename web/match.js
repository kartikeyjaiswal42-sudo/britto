// Is this search result the product the shopper is looking at? (shop compare, core/shop.ts)
// Plain JS run by the site in the browser (web/app.js); web/match.d.ts types it for TypeScript
// callers, and core/shop.test.ts checks it.
//
// Stores name one product differently ("boAt Airdopes 141 Gen 2, 4 Mics…" on Amazon, "boAt
// Airdopes 141 Gen 2 … BT v5.4" on Flipkart), and their searches return look-alikes first as
// often as the product itself. So a result is called the SAME product only when nothing in the
// titles says otherwise: the brand is there, every model number of the product is there (141 is
// not 141 ANC, Gen 2 is not Gen 3), no variant word is added or missing (Pro, Max, Lite…), and no
// quantity disagrees (pack of 10 is not pack of 25, 128 GB is not 256 GB, 500 ml is not 1 l).
// A result that shares most words but cannot pass that is 'close': shown as "similar, check it is
// the same item", never as the same product. Everything else is not a match at all.
const STOP = new Set([
  'a', 'an', 'the', 'and', 'with', 'for', 'of', 'in', 'on', 'to', 'by', 'from', 'at', 'or', 'new', 'latest', 'launch', 'launched',
  'best', 'buy', 'online', 'india', 'free', 'delivery', 'offer', 'sale', 'combo', 'up', 'upto', 'all', 'type', 'is', 'your',
]);
/** Words that make a different product of the same line. */
const VARIANT = new Set(['pro', 'max', 'plus', 'lite', 'ultra', 'mini', 'neo', 'prime', 'elite', 'anc', 'se', 'fe', 'air', 'nano']);

/** Lower-case words, with "gen 2" / "mark 3" / "series 7" joined into one model word. */
export function words(title) {
  const t = title.normalize('NFKC').toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\b(gen|generation|mark|mk|series|version|ver)\s*\.?\s*(\d+)\b/g, (_, w, n) => `${w.startsWith('gen') ? 'gen' : w}${n}`)
    // "128 GB" and "128GB" are one word, so stores that space them differently still agree.
    .replace(/(\d)\s+(gb|tb|ml|ltr|l|g|gm|kg|mah|w|mm|cm|inch|h|hrs|db)\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}.]+/gu, ' ');
  return t.split(' ').map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w && !STOP.has(w))
    // "pens" and "pen" are one word (plural "s" only: "glass", "plus", "bonus" keep theirs).
    .map((w) => (w.length > 3 && /[a-z]s$/.test(w) && !/(ss|us|is)$/.test(w) && !VARIANT.has(w) ? w.slice(0, -1) : w));
}

// Quantities that make two listings different products when they disagree. Each is turned into
// one base unit so "1 l" and "1000 ml" agree.
/** @type {[RegExp, string, number][]} */
const QTY = [
  [/(\d+(?:\.\d+)?)\s*(?:ml|millilitres?|milliliters?)\b/g, 'ml', 1],
  [/(\d+(?:\.\d+)?)\s*(?:l|ltr|litres?|liters?)\b/g, 'ml', 1000],
  [/(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?)\b/g, 'g', 1],
  [/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)\b/g, 'g', 1000],
  [/(\d+(?:\.\d+)?)\s*gb\b/g, 'gb', 1],
  [/(\d+(?:\.\d+)?)\s*tb\b/g, 'gb', 1024],
  [/(?:pack|set|box|pair)\s+of\s+(\d+)\b/g, 'count', 1],
  [/(\d+)\s*(?:pcs|pieces|pc|units|count|tablets|capsules|sheets)\b/g, 'count', 1],
];
/** Every quantity a title states, by dimension ("count" → {10}). */
export function quantities(title) {
  const t = title.normalize('NFKC').toLowerCase();
  /** @type {Map<string, Set<number>>} */
  const out = new Map();
  for (const [re, dim, mult] of QTY) {
    for (const m of t.matchAll(re)) {
      const v = Math.round(Number(m[1]) * mult * 100) / 100;
      if (!Number.isFinite(v) || v <= 0) continue;
      (out.get(dim) ?? out.set(dim, new Set()).get(dim)).add(v);
    }
  }
  return out;
}

/** Words that name a model: letters and digits ("111v2", "a15", "gen2"), or a number that is not a quantity. */
function isModel(w) {
  if (!/\d/.test(w)) return false;
  if (/^(19|20)\d\d$/.test(w)) return false; // a year ("2026 launch")
  if (/^v?\d+\.\d+$/.test(w)) return false; // a version ("v5.4")
  if (/^\d+(?:\.\d+)?(ml|l|ltr|g|gm|gms|kg|gb|tb|mah|w|mm|cm|inch|in|h|hr|hrs|hours|db|m|pcs|pc|x)$/.test(w)) return false; // a measure ("48h", "10mm")
  return true;
}

/** How far the first words of a title go to identify it (the rest is a store's keyword list). */
const HEAD = 7;

/**
 * kind: 'same' | 'close' | 'none'; score 0..1: how much of the product's own name the result
 * carries; why: why it is not the same product, in plain words, when it is not.
 */
export function matchTitle(want, got) {
  // The product's NAME is its title up to the first list of features ("boAt Airdopes 141 Gen 2"
  // of "boAt Airdopes 141 Gen 2, 4 Mics ENx Tech, 48H Battery"): only there do numbers name a
  // model ("4 Mics" does not).
  const wAll = words(want);
  const gAll = words(got);
  const head = words(searchWordsFor(want) ?? want).slice(0, HEAD);
  const gotHead = words(searchWordsFor(got) ?? got).slice(0, HEAD + 2);
  if (!head.length || !gAll.length) return { kind: 'none', score: 0, why: 'no words to compare' };
  const gotSet = new Set(gAll);
  const wantSet = new Set(wAll);
  // The brand is the first word on every store measured (Amazon, Flipkart, Croma, Reliance
  // Digital, Tata CLiQ, Myntra, Ajio, Nykaa titles all start with it); "1 X 10 Cello…" skips the count.
  const brand = head.find((x) => /\p{L}/u.test(x) && x !== 'x') ?? head[0];
  if (!gotSet.has(brand)) return { kind: 'none', score: 0, why: `not ${brand}` };
  let total = 0;
  let found = 0;
  head.forEach((x, i) => {
    const weight = (x === brand ? 2 : isModel(x) ? 3 : 1) * (i < 4 ? 1.5 : 1);
    total += weight;
    if (gotSet.has(x)) found += weight;
  });
  const score = total ? found / total : 0;
  // And the other way: how much of the RESULT's name is in the product's title. Clothes carry no
  // model number, so "Levis Men Printed T-shirt" fits a dozen shirts: only this tells them apart.
  const back = gotHead.length ? gotHead.filter((x) => wantSet.has(x)).length / gotHead.length : 0;
  const wantModels = head.filter(isModel);
  const missing = wantModels.filter((m) => !gotSet.has(m));
  const extraModel = gotHead.filter(isModel).filter((m) => !wantSet.has(m));
  const variantDiff = [...new Set(head.filter((x) => VARIANT.has(x) && !gotSet.has(x)).concat(gotHead.filter((x) => VARIANT.has(x) && !wantSet.has(x))))];
  const qw = quantities(want);
  const qg = quantities(got);
  for (const [dim, vals] of qw) {
    const other = qg.get(dim);
    if (other && ![...vals].some((v) => other.has(v))) {
      const why = dim === 'count' ? `pack of ${[...other].join('/')}, not ${[...vals].join('/')}` : `${[...other].join('/')} ${dim}, not ${[...vals].join('/')} ${dim}`;
      return { kind: 'none', score, why };
    }
  }
  // A model number missing, or a variant word added or dropped, is a different product.
  if (missing.length) return { kind: 'none', score, why: `no "${missing.join(' ')}" in its name` };
  if (variantDiff.length) return { kind: 'none', score, why: `"${variantDiff.join(' ')}" differs` };
  const sure = wantModels.length ? score >= 0.75 && back >= 0.5 : score >= 0.9 && back >= 0.75;
  if (sure && !extraModel.length) return { kind: 'same', score, why: null };
  if (score >= 0.55) return { kind: 'close', score, why: extraModel.length ? `its name adds "${extraModel.join(' ')}"` : 'check it is the same item' };
  return { kind: 'none', score, why: 'too few words in common' };
}

/** The store's result for this product: the cheapest SAME one, else the closest close one, else null. */
export function bestMatch(want, rows) {
  let same = null;
  let close = null;
  for (const row of rows) {
    const m = matchTitle(want, row.title);
    if (m.kind === 'same' && (!same || row.price < same.row.price)) same = { row, kind: 'same', score: m.score, why: null };
    if (m.kind === 'close' && (!close || m.score > close.score || (m.score === close.score && row.price < close.row.price))) close = { row, kind: 'close', score: m.score, why: m.why };
  }
  return same ?? close;
}

/** What to search the other stores for: the product's name up to its first list of features. */
export function searchWordsFor(title) {
  const name = title.normalize('NFKC').replace(/\s[-–|]\s.*$/, '').replace(/[|,(:[].*$/, '');
  const list = name.replace(/[^\p{L}\p{N}\s.+&'-]/gu, ' ').split(/\s+/).filter((x) => x && !STOP.has(x.toLowerCase()));
  const out = list.slice(0, 6).join(' ').trim();
  return out.length >= 3 ? out : null;
}
