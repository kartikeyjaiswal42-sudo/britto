// Product Lens (P11 part 4, BLUEPRINT §19): a shopper's photo → the words to search for.
// The vision model only NAMES the product; prices come from Britto's own index and the stores'
// own searches (the page opens /search?q=<words>). Pure: no I/O, so it is tested in Node.

/**
 * Workers AI prices in neurons per MILLION tokens, from
 * https://developers.cloudflare.com/workers-ai/platform/pricing/ (read 2026-11-07). Used only
 * when a reply does not report its own neurons.
 */
export const LENS_MODELS = {
  '@cf/meta/llama-4-scout-17b-16e-instruct': { input: 24_545, output: 77_273 },
  '@cf/mistralai/mistral-small-3.1-24b-instruct': { input: 31_876, output: 50_488 },
} as const;
export type LensModel = keyof typeof LENS_MODELS;

export const LENS = {
  // Measured 2026-11-07 (HISTORY): mistral-small-3.1 kept the format on every photo and costs
  // ~18 neurons at 512 px (534 tokens); llama-4-scout ~41 (1,609 tokens at any size tried).
  model: '@cf/mistralai/mistral-small-3.1-24b-instruct' as LensModel,
  /** The page shrinks a photo to `side` px on its long side before sending it. */
  side: 512,
  maxBytes: 400_000,
  maxTokens: 60,
  /** Neurons a call may cost, checked against what is left of the day BEFORE calling. */
  estimate: 25,
  /** Default daily budget (Worker var LENS_NEURONS_PER_DAY overrides). */
  perDay: 1_000,
  perNetworkPerDay: 15,
  maxWords: 10,
} as const;

export const LENS_PROMPT = [
  'This is a photo a shopper in India took of a product they want to buy, to search for it in online stores.',
  'Reply with exactly three lines and nothing else:',
  'NAME: the words a shopper would type into a store search to find this product: the brand, product line and model as printed on it, then what kind of product it is (for example ball pens, slippers, earbuds). Add a size, weight or pack count ONLY if it is printed in the photo; never guess one. At most 10 words. No prices, no colours, no adjectives like "best" or "premium".',
  'BRAND: the brand name as printed on the product, or unknown',
  'SURE: yes if you can read the brand or model on the product in the photo, no if you are guessing from its look',
  'If the photo does not show a product someone could buy, reply with the single word NONE.',
].join('\n');

export interface LensAnswer {
  found: boolean;
  words: string;
  brand: string | null;
  sure: boolean;
}

/** The model's reply → an answer, or null when it did not follow the format. */
export function parseLens(reply: string): LensAnswer | null {
  const text = reply.replace(/\*\*/g, '').trim();
  if (/^none\.?$/i.test(text)) return { found: false, words: '', brand: null, sure: false };
  const line = (key: string) => new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, 'im').exec(text)?.[1]?.trim() ?? null;
  let name = line('NAME');
  let brandLine = line('BRAND');
  let sureLine = line('SURE');
  // A reply that dropped the labels but kept the three lines (seen once from llama-4-scout).
  const bare = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (name == null && bare.length === 3 && /^(yes|no)\b/i.test(bare[2]!)) [name, brandLine, sureLine] = bare as [string, string, string];
  if (name == null) return null;
  if (/^(none|no product|nothing)\b/i.test(name)) return { found: false, words: '', brand: null, sure: false };
  const words = cleanWords(name);
  if (!words) return null;
  const b = cleanWords(brandLine ?? '');
  const brand = b && !/^(unknown|none|n\/?a|not visible)$/i.test(b) ? b : null;
  return { found: true, words, brand, sure: /^yes\b/i.test(sureLine ?? '') };
}

/**
 * Search words a store's search box can take: letters (any script), digits and a few joining
 * marks, at most LENS.maxWords words. Anything else the model wrote is dropped, so text in a
 * photo cannot put markup or a link into the search.
 */
export function cleanWords(s: string): string {
  return s.normalize('NFKC').replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}&+.\-/' ]+/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-/']+|[.\-/']+$/g, ''))
    .filter(Boolean)
    .slice(0, LENS.maxWords)
    .join(' ')
    .slice(0, 100);
}

/** What the photo really is, by its first bytes (the Content-Type header is a claim). */
export function sniffImage(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export interface Usage { prompt_tokens?: number; completion_tokens?: number; neurons?: number }

/** A call's neurons: the reply's own figure when it gives one, else its tokens × the price table. */
export function neuronsOf(model: LensModel, usage: Usage | null | undefined): number | null {
  if (typeof usage?.neurons === 'number' && Number.isFinite(usage.neurons)) return usage.neurons;
  if (typeof usage?.prompt_tokens !== 'number' || typeof usage?.completion_tokens !== 'number') return null;
  const p = LENS_MODELS[model];
  return (usage.prompt_tokens * p.input + usage.completion_tokens * p.output) / 1_000_000;
}

/** The model's input for one photo (Workers AI chat schema: an image as a data: URI part). */
export function lensInput(dataUri: string) {
  return {
    messages: [{ role: 'user', content: [{ type: 'text', text: LENS_PROMPT }, { type: 'image_url', image_url: { url: dataUri } }] }],
    max_tokens: LENS.maxTokens,
    temperature: 0,
  };
}

/** The UTC day a neuron is counted in (Workers AI's allowance resets at 00:00 UTC). */
export const lensDay = (now: number) => new Date(now).toISOString().slice(0, 10);
