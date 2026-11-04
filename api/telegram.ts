// The Telegram bot: send it a product link from any phone, get the price history verdict
// back and set an alert with one tap. No app, no extension, no account.
import { ALERTS, describeRule, suggestTargets } from '../core/alerts.ts';
import { formatRupees } from '../core/money.ts';
import type { AlertRule, SaleStatus } from '../core/types.ts';
import {
  consumeLinkCode, deleteAlert, deleteOwner, linkChat, listAlerts, ownerByChat, setAlert, shortTitle, unlinkChat,
} from './alerts.ts';
import { siteUrl, tg, webhookSecret } from './channels.ts';
import { getProduct, productView, rateLimit, type ProductRow } from './db.ts';
import type { Env } from './env.ts';
import { addProduct, resolveLink } from './refresh.ts';

/** Messages one chat may send per hour (each can cost one store read for a new product). */
export const BOT_MESSAGES_PER_HOUR = 60;

interface TgChat { id: number; type: string }
interface TgMessage { message_id: number; chat: TgChat; text?: string }
interface TgCallback { id: string; from: { id: number }; message?: TgMessage; data?: string }
export interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallback }

type Button = { text: string; callback_data: string } | { text: string; url: string };

const SALE_LINE: Partial<Record<SaleStatus, string>> = {
  real_drop: 'Real price drop',
  hike_then_drop: 'Careful: raised, then "dropped"',
  no_real_drop: 'No real drop',
};

const HELP = [
  'Send me a product link from Amazon.in, Flipkart or Myntra (the Share button in the store app works).',
  'I will show its price history, whether today is a good time to buy, and whether the "sale" is real. Tap a button to get a message when the price drops.',
  '',
  '/alerts  your alerts',
  '/stop  stop all messages',
].join('\n');

export async function handleTelegram(request: Request, env: Env): Promise<Response> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response('not found', { status: 404 });
  if (request.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret(token))) {
    return new Response('forbidden', { status: 401 });
  }
  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response('ok');
  }
  try {
    await handleUpdate(env, update, Date.now());
  } catch (e) {
    console.error('telegram update failed', e);
  }
  // Always 200: anything else makes Telegram send the same update again, and again.
  return new Response('ok');
}

const say = (env: Env, chat: number, text: string, buttons?: Button[][]) =>
  tg(env, 'sendMessage', {
    chat_id: chat,
    text,
    link_preview_options: { is_disabled: true },
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });

export async function handleUpdate(env: Env, u: TgUpdate, now: number): Promise<void> {
  if (u.callback_query) return onButton(env, u.callback_query, now);
  const m = u.message;
  if (!m || m.chat.type !== 'private' || typeof m.text !== 'string') return;
  const chat = m.chat.id;
  if (!(await rateLimit(env.DB, `tg:${chat}`, BOT_MESSAGES_PER_HOUR, 3_600_000, now))) return;
  const text = m.text.trim().slice(0, 2000);

  const cmd = /^\/([a-z]+)(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
  if (cmd) {
    const name = cmd[1]!.toLowerCase();
    if (name === 'start' && cmd[2]) return onLink(env, chat, cmd[2], now);
    if (name === 'start' || name === 'help') return void (await say(env, chat, `Hi! I'm Britto.\n\n${HELP}`));
    if (name === 'alerts') return onList(env, chat, now);
    if (name === 'stop') return onStop(env, chat, now);
    return void (await say(env, chat, HELP));
  }

  // A shared product usually arrives inside a sentence: "Check out this product … https://amzn.in/d/x".
  const tokens = text.split(/\s+/).filter((t) => /[a-z0-9-]+\.[a-z]{2,}\//i.test(t)).slice(0, 5);
  let lastProblem: string | null = null;
  for (const t of tokens) {
    // Only a store's own short link (amzn.in) costs a request; everything else is parsed locally.
    const link = await resolveLink(env, t, `tg:${chat}`, now);
    if (!link.ok) { lastProblem = link.message; continue; }
    const added = await addProduct(env, link.link, `tg:${chat}`, now);
    if (!added.ok) return void (await say(env, chat, added.message));
    return sendProduct(env, chat, added.row);
  }
  await say(env, chat, lastProblem ?? `That isn't a product link I can read.\n\n${HELP}`);
}

async function sendProduct(env: Env, chat: number, row: ProductRow): Promise<void> {
  const v = await productView(env.DB, row);
  const s = v.stats;
  const price = s.inStock === false ? 'Out of stock' : s.current != null ? formatRupees(s.current) : 'No price yet';
  const mrp = s.current != null && s.currentMrp != null && s.currentMrp > s.current ? ` (M.R.P. ${formatRupees(s.currentMrp)})` : '';
  const lines = [shortTitle(v.title ?? 'Product'), `${v.store.name} · ${price}${mrp}`, ''];
  if (v.pending) lines.push(v.pending);
  else {
    lines.push(v.verdict.headline);
    const sale = SALE_LINE[v.sale.status];
    if (sale) lines.push(`${sale}: ${v.sale.explanation}`);
    if (s.lowest && s.changes > 0) lines.push(`Lowest ${formatRupees(s.lowest.price)} · usual ${formatRupees(s.median)}`);
  }
  const page = `${siteUrl(env)}/p/${encodeURIComponent(v.key)}`;
  lines.push('', `Price history: ${page}`);

  const buttons: Button[][] = [];
  const priced = s.current != null && s.inStock !== false;
  const cb = (data: string, text: string): Button | null => (new TextEncoder().encode(data).length <= 64 ? { text, callback_data: data } : null);
  if (priced) {
    const drop = cb(`d|${v.key}`, '🔔 Any price drop');
    if (drop) buttons.push([drop]);
    const below = suggestTargets(s.current).map((t) => cb(`b|${t}|${v.key}`, `🔔 Below ${formatRupees(t)}`)).filter((b): b is Button => b != null);
    if (below.length) buttons.push(below);
  } else {
    const stock = cb(`s|${v.key}`, s.current == null && s.inStock !== false ? '🔔 Tell me the first price' : '🔔 Back in stock');
    if (stock) buttons.push([stock]);
  }
  buttons.push([{ text: 'Open price history', url: page }]);
  await say(env, chat, lines.join('\n'), buttons);
}

async function onButton(env: Env, q: TgCallback, now: number): Promise<void> {
  const chat = q.message?.chat.id ?? q.from.id;
  const answer = (text: string) => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text });
  const parts = (q.data ?? '').split('|');
  const kind = parts[0];
  if (kind === 'x') {
    const owner = await ownerByChat(env.DB, chat, false, now);
    const gone = owner ? await deleteAlert(env.DB, owner.id, parts[1] ?? '') : false;
    await answer(gone ? 'Alert removed' : 'Already removed');
    return;
  }
  let rule: AlertRule;
  let key: string | undefined;
  if (kind === 'd') { rule = { kind: 'drop', pct: ALERTS.minDropPct }; key = parts[1]; }
  else if (kind === 's') { rule = { kind: 'in_stock' }; key = parts[1]; }
  else if (kind === 'b' && Number.isSafeInteger(Number(parts[1]))) { rule = { kind: 'below', target: Number(parts[1]) }; key = parts[2]; }
  else { await answer('That button is out of date.'); return; }

  const product = key ? await getProduct(env.DB, key) : null;
  if (!product) { await answer('That product is not tracked any more.'); return; }
  const owner = await ownerByChat(env.DB, chat, true, now);
  if (!owner) { await answer('Something went wrong. Try again.'); return; }
  const res = await setAlert(env.DB, owner.id, product, rule, now);
  if (!res.ok) { await answer(res.message); return; }
  await answer('Alert set');
  await say(env, chat, `Alert set: ${shortTitle(product.title)}, ${describeRule(rule)}. I'll message you here.\n/alerts to see them all.`);
}

async function onList(env: Env, chat: number, now: number): Promise<void> {
  const owner = await ownerByChat(env.DB, chat, false, now);
  const alerts = owner ? await listAlerts(env.DB, owner.id) : [];
  if (!alerts.length) return void (await say(env, chat, `You have no alerts yet. Send me a product link to set one.`));
  const lines = ['Your alerts:'];
  const buttons: Button[][] = [];
  for (const a of alerts) {
    const line = `• ${shortTitle(a.title)}: ${a.description} (now ${a.inStock === false ? 'out of stock' : formatRupees(a.price)})`;
    if (lines.join('\n').length + line.length > 3500) { lines.push(`…and ${alerts.length - buttons.length} more on the website.`); break; }
    lines.push(line);
    buttons.push([{ text: `Remove: ${shortTitle(a.title).slice(0, 40)}`, callback_data: `x|${a.id}` }]);
  }
  await say(env, chat, lines.join('\n'), buttons);
}

async function onStop(env: Env, chat: number, now: number): Promise<void> {
  const owner = await ownerByChat(env.DB, chat, false, now);
  if (!owner) return void (await say(env, chat, 'You have no alerts. Nothing to stop.'));
  if (owner.token_hash == null) {
    const n = await deleteOwner(env.DB, owner.id);
    return void (await say(env, chat, `Done. I removed your ${n === 1 ? 'alert' : `${n} alerts`} and won't message you again.`));
  }
  await unlinkChat(env.DB, owner.id);
  await say(env, chat, `Done. I won't message you here. Your alerts are still on the Britto website in the browser you connected from.`);
}

async function onLink(env: Env, chat: number, code: string, now: number): Promise<void> {
  const ownerId = await consumeLinkCode(env.DB, code, now);
  if (!ownerId) return void (await say(env, chat, 'That link has expired or was already used. Press "Connect Telegram" on the website again.'));
  await linkChat(env.DB, ownerId, chat);
  await say(env, chat, `Connected. Britto will message you here when one of your alerts fires.\n\nYou can also send me any product link.`);
}
