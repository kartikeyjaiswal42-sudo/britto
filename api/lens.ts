// POST /api/lens: a photo → the words to search for (CONTRACT.md "Product Lens"). The photo is
// read in memory and dropped: nothing about it is written anywhere but the day's neuron total.
import { LENS, LENS_MODELS, lensDay, lensInput, neuronsOf, parseLens, sniffImage, type LensModel, type Usage } from '../core/lens.ts';
import type { D1Database, Env } from './env.ts';

export type LensResult =
  | { ok: true; body: { lens: ReturnType<typeof parseLens> & object; neurons: number; left: number } }
  | { ok: false; status: number; code: string; message: string };

const no = (status: number, code: string, message: string): LensResult => ({ ok: false, status, code, message });

/** The model this Worker calls: LENS_MODEL when it names one Britto has prices for, else the default. */
export function lensModel(env: Env): LensModel {
  return env.LENS_MODEL && env.LENS_MODEL in LENS_MODELS ? env.LENS_MODEL as LensModel : LENS.model;
}

export function lensBudget(env: Env): number {
  const n = Number(env.LENS_NEURONS_PER_DAY);
  return Number.isFinite(n) && n >= 0 ? n : LENS.perDay;
}

export async function usedToday(db: D1Database, now: number): Promise<number> {
  const row = await db.prepare('SELECT neurons FROM ai_usage WHERE day = ?').bind(lensDay(now)).first<{ neurons: number }>();
  return row?.neurons ?? 0;
}

async function addUsage(db: D1Database, now: number, neurons: number): Promise<void> {
  await db.prepare(`INSERT INTO ai_usage (day, neurons, calls) VALUES (?, ?, 1)
    ON CONFLICT (day) DO UPDATE SET neurons = neurons + excluded.neurons, calls = calls + 1`).bind(lensDay(now), neurons).run();
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Runs the model: the AI binding, or (tests only) a fake server at LENS_FAKE_AI. */
async function runModel(env: Env, model: LensModel, input: unknown): Promise<{ response?: unknown; usage?: Usage } | null> {
  if (env.LENS_FAKE_AI) {
    const r = await fetch(env.LENS_FAKE_AI, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input }) });
    return r.ok ? await r.json() as { response?: unknown; usage?: Usage } : null;
  }
  return await env.AI!.run(model, input) as { response?: unknown; usage?: Usage };
}

/**
 * The whole check, in order: the AI is there · the type and size · the bytes really are an
 * image · this network's photos today · the day's budget (BEFORE calling) · one call · the
 * reply's neurons added to the day, whatever the reply said.
 */
export async function lens(request: Request, env: Env, network: string, allowed: (bucket: string, max: number, windowMs: number) => Promise<boolean>, now = Date.now()): Promise<LensResult> {
  if (!env.AI && !env.LENS_FAKE_AI) return no(503, 'lens_off', 'Search by photo is not switched on.');
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return no(415, 'bad_image', 'Send a JPEG, PNG or WebP photo.');
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > LENS.maxBytes) return no(413, 'too_big', `The photo must be under ${Math.round(LENS.maxBytes / 1000)} KB.`);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > LENS.maxBytes) return no(413, 'too_big', `The photo must be under ${Math.round(LENS.maxBytes / 1000)} KB.`);
  const real = sniffImage(bytes);
  if (!real || real !== type) return no(415, 'bad_image', 'That file is not the photo it says it is.');
  // The day's budget first, so a photo refused for it does not use up one of this network's.
  if ((await usedToday(env.DB, now)) + LENS.estimate > lensBudget(env)) {
    return no(503, 'lens_budget', 'Today’s photo searches are used up. They come back at 5:30 am. Type the product’s name instead.');
  }
  const day = 86_400_000;
  if (!(await allowed(`lens:${network}`, LENS.perNetworkPerDay, day))) {
    return no(429, 'rate_limited', `At most ${LENS.perNetworkPerDay} photo searches a day from one network. Type the product's name instead.`);
  }
  const model = lensModel(env);
  let reply: { response?: unknown; usage?: Usage } | null = null;
  try { reply = await runModel(env, model, lensInput(`data:${real};base64,${base64(bytes)}`)); } catch { reply = null; }
  // Whatever came back, its cost is counted (a failed call reports none and costs none).
  const neurons = neuronsOf(model, reply?.usage) ?? (reply ? LENS.estimate : 0);
  if (neurons > 0) await addUsage(env.DB, now, neurons);
  const answer = typeof reply?.response === 'string' ? parseLens(reply.response) : null;
  if (!answer) return no(502, 'lens_failed', 'Britto could not read that photo. Try again, closer and in good light, or type the product’s name.');
  // Searches left for this network today: the bucket was just counted, so read it back.
  const start = Math.floor(now / day) * day;
  const row = await env.DB.prepare('SELECT count FROM rate WHERE bucket = ?').bind(`lens:${network}:${start}`).first<{ count: number }>();
  return { ok: true, body: { lens: answer, neurons: Math.round(neurons * 100) / 100, left: Math.max(0, LENS.perNetworkPerDay - (row?.count ?? 0)) } };
}
