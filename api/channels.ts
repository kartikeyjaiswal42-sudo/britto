// Where alerts go: a Telegram chat and/or browsers with notifications on. Both channels
// are optional per deployment (no token / no VAPID key = that channel is off, not broken).
import type { Env } from './env.ts';
import { sendPush, type Vapid } from './webpush.ts';

export interface Message { title: string; body: string; url: string; tag?: string }

export interface DeliveryResult {
  telegram: 'sent' | 'failed' | 'blocked' | 'not_connected' | 'off';
  push: { sent: number; gone: number; failed: number };
}

export function siteUrl(env: Env): string {
  return (env.SITE_URL ?? '').replace(/\/+$/, '');
}

export async function sha256hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface TgResult<T> { ok: boolean; result?: T; description?: string; error_code?: number }

/** One Telegram Bot API call. The URL carries the token, so it is never logged. */
export async function tg<T = unknown>(env: Env, method: string, body: object): Promise<TgResult<T>> {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, description: 'no bot token' };
  const base = (env.TELEGRAM_API ?? 'https://api.telegram.org').replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return (await res.json()) as TgResult<T>;
  } catch (e) {
    return { ok: false, description: `${method}: ${(e as Error)?.name ?? 'error'}` };
  }
}

/** Telegram sends this in every webhook call; derived from the token so there is no second secret. */
export async function webhookSecret(token: string): Promise<string> {
  return (await sha256hex(`britto-webhook:${token}`)).slice(0, 48);
}

/**
 * The bot's username, setting up its webhook the first time a token is seen (and again if the
 * token or the site address changes). One D1 read when nothing changed.
 */
export async function telegramBot(env: Env): Promise<string | null> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const want = await sha256hex(`${token}|${siteUrl(env)}`);
  const row = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'telegram'`).first<{ v: string }>();
  if (row) {
    const saved = JSON.parse(row.v) as { hash: string; bot: string };
    if (saved.hash === want) return saved.bot;
  }
  const me = await tg<{ username?: string }>(env, 'getMe', {});
  if (!me.ok || !me.result?.username) {
    console.error('telegram getMe failed', me.error_code, me.description);
    return null;
  }
  const hook = await tg(env, 'setWebhook', {
    url: `${siteUrl(env)}/api/telegram/webhook`,
    secret_token: await webhookSecret(token),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  if (!hook.ok) {
    console.error('telegram setWebhook failed', hook.error_code, hook.description);
    return null;
  }
  await tg(env, 'setMyCommands', {
    commands: [
      { command: 'alerts', description: 'Your price alerts' },
      { command: 'help', description: 'How to use Britto' },
      { command: 'stop', description: 'Stop all messages' },
    ],
  });
  await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('telegram', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`)
    .bind(JSON.stringify({ hash: want, bot: me.result.username }))
    .run();
  return me.result.username;
}

export function vapid(env: Env): Vapid | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return null;
  try {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey, subject: siteUrl(env) || 'https://britto.invalid' };
  } catch {
    console.error('VAPID_PRIVATE_JWK is not JSON');
    return null;
  }
}

/** Send one message to every channel an owner has. Dead channels are removed, not retried forever. */
export async function deliver(env: Env, owner: { id: string; telegram_chat: number | null }, msg: Message, now: number): Promise<DeliveryResult> {
  const out: DeliveryResult = { telegram: env.TELEGRAM_BOT_TOKEN ? 'not_connected' : 'off', push: { sent: 0, gone: 0, failed: 0 } };
  if (owner.telegram_chat != null && env.TELEGRAM_BOT_TOKEN) {
    const r = await tg(env, 'sendMessage', {
      chat_id: owner.telegram_chat,
      text: `${msg.title}\n${msg.body}\n${msg.url}`,
      link_preview_options: { is_disabled: true },
    });
    if (r.ok) out.telegram = 'sent';
    else if (r.error_code === 403) {
      // The shopper blocked the bot or deleted the chat: stop trying.
      out.telegram = 'blocked';
      await env.DB.prepare('UPDATE owners SET telegram_chat = NULL WHERE id = ?').bind(owner.id).run();
    } else {
      out.telegram = 'failed';
      console.error('telegram send failed', r.error_code, r.description);
    }
  }
  const keys = vapid(env);
  if (keys) {
    const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE owner = ?').bind(owner.id).all<{ endpoint: string; p256dh: string; auth: string }>();
    for (const sub of results) {
      const status = await sendPush(sub, msg, keys, now).catch((e) => { console.error('push send failed', String(e)); return 0; });
      if (status >= 200 && status < 300) out.push.sent++;
      else if (status === 404 || status === 410) {
        out.push.gone++;
        await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
      } else {
        out.push.failed++;
        console.error('push refused', status, new URL(sub.endpoint).host);
      }
    }
  }
  return out;
}
