// Alerts in the database: who owns them, setting and removing them, and checking them after a
// reading. The decision itself is core/alerts.ts (pure, edge-triggered, tested).
import { ALERTS, decideAlert, describeRule, newAlert } from '../core/alerts.ts';
import type { AlertRule, AlertState, AlertView, MeView, ProductKey, StoreId } from '../core/types.ts';
import { deliver, sha256hex, siteUrl, type DeliveryResult } from './channels.ts';
import { getProduct, type ProductRow } from './db.ts';
import type { D1Database, Env } from './env.ts';

export interface OwnerRow { id: string; token_hash: string | null; telegram_chat: number | null; created_at: number }

interface AlertRow {
  id: string;
  owner: string;
  key: string;
  kind: AlertRule['kind'];
  target: number | null;
  pct: number | null;
  armed: number;
  base_price: number | null;
  last_fired_at: number | null;
  last_message: string | null;
  created_at: number;
}

export function randomToken(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A new browser owner. The token is returned once; we keep only its hash. */
export async function createDeviceOwner(db: D1Database, now: number): Promise<{ token: string; owner: OwnerRow }> {
  const token = randomToken(32);
  const owner: OwnerRow = { id: randomToken(12), token_hash: await sha256hex(token), telegram_chat: null, created_at: now };
  await db.prepare('INSERT INTO owners (id, token_hash, telegram_chat, created_at) VALUES (?, ?, NULL, ?)').bind(owner.id, owner.token_hash, now).run();
  return { token, owner };
}

export async function ownerByToken(db: D1Database, token: string): Promise<OwnerRow | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  return db.prepare('SELECT * FROM owners WHERE token_hash = ?').bind(await sha256hex(token)).first<OwnerRow>();
}

/** The owner behind a Telegram chat, created on first use when `create` is set. */
export async function ownerByChat(db: D1Database, chat: number, create: boolean, now: number): Promise<OwnerRow | null> {
  const found = await db.prepare('SELECT * FROM owners WHERE telegram_chat = ?').bind(chat).first<OwnerRow>();
  if (found || !create) return found;
  const id = randomToken(12);
  await db.prepare('INSERT OR IGNORE INTO owners (id, token_hash, telegram_chat, created_at) VALUES (?, NULL, ?, ?)').bind(id, chat, now).run();
  return db.prepare('SELECT * FROM owners WHERE telegram_chat = ?').bind(chat).first<OwnerRow>();
}

function ruleOf(r: AlertRow): AlertRule {
  if (r.kind === 'below') return { kind: 'below', target: r.target ?? 0 };
  if (r.kind === 'drop') return { kind: 'drop', pct: r.pct ?? ALERTS.minDropPct };
  return { kind: 'in_stock' };
}

function stateOf(r: AlertRow): AlertState {
  return { rule: ruleOf(r), armed: r.armed === 1, basePrice: r.base_price, lastFiredAt: r.last_fired_at };
}

async function recountWatchers(db: D1Database, keys: string[]): Promise<void> {
  if (!keys.length) return;
  await db.batch(keys.map((k) => db.prepare('UPDATE products SET watchers = (SELECT COUNT(*) FROM alerts WHERE key = ?) WHERE key = ?').bind(k, k)));
}

export type SetAlertOutcome = { ok: true; alert: AlertView } | { ok: false; status: number; code: string; message: string };

/** Set (or replace) this owner's alert of this kind on this product. */
export async function setAlert(db: D1Database, ownerId: string, product: ProductRow, rule: AlertRule, now: number): Promise<SetAlertOutcome> {
  const count = await db
    .prepare('SELECT COUNT(*) AS n FROM alerts WHERE owner = ? AND NOT (key = ? AND kind = ?)')
    .bind(ownerId, product.key, rule.kind)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= ALERTS.maxPerOwner) {
    return { ok: false, status: 422, code: 'too_many_alerts', message: `You can have ${ALERTS.maxPerOwner} alerts. Remove one first.` };
  }
  const st = newAlert(rule, product.price, product.in_stock == null ? null : product.in_stock === 1);
  const target = rule.kind === 'below' ? rule.target : null;
  const pct = rule.kind === 'drop' ? rule.pct : null;
  await db
    .prepare(
      `INSERT INTO alerts (id, owner, key, kind, target, pct, armed, base_price, last_fired_at, last_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
       ON CONFLICT (owner, key, kind) DO UPDATE SET target = excluded.target, pct = excluded.pct, armed = excluded.armed,
         base_price = excluded.base_price, last_fired_at = NULL, last_message = NULL, created_at = excluded.created_at`,
    )
    .bind(randomToken(9), ownerId, product.key, rule.kind, target, pct, st.armed ? 1 : 0, st.basePrice, now)
    .run();
  await recountWatchers(db, [product.key]);
  const alert = (await listAlerts(db, ownerId)).find((a) => a.key === product.key && a.rule.kind === rule.kind);
  if (!alert) return { ok: false, status: 500, code: 'insert_failed', message: 'The alert could not be saved.' };
  return { ok: true, alert };
}

export async function deleteAlert(db: D1Database, ownerId: string, id: string): Promise<boolean> {
  const row = await db.prepare('DELETE FROM alerts WHERE id = ? AND owner = ? RETURNING key').bind(id, ownerId).first<{ key: string }>();
  if (row) await recountWatchers(db, [row.key]);
  return row != null;
}

/** Remove a Telegram-only owner and everything they set (the bot's /stop). */
export async function deleteOwner(db: D1Database, ownerId: string): Promise<number> {
  const { results } = await db.prepare('SELECT DISTINCT key FROM alerts WHERE owner = ?').bind(ownerId).all<{ key: string }>();
  await db.batch([
    db.prepare('DELETE FROM alerts WHERE owner = ?').bind(ownerId),
    db.prepare('DELETE FROM push_subs WHERE owner = ?').bind(ownerId),
    db.prepare('DELETE FROM link_codes WHERE owner = ?').bind(ownerId),
    db.prepare('DELETE FROM owners WHERE id = ?').bind(ownerId),
  ]);
  await recountWatchers(db, results.map((r) => r.key));
  return results.length;
}

type ListedRow = AlertRow & { store: StoreId; title: string | null; image: string | null; price: number | null; in_stock: number | null };

export async function listAlerts(db: D1Database, ownerId: string): Promise<AlertView[]> {
  const { results } = await db
    .prepare(
      `SELECT a.*, p.store, p.title, p.image, p.price, p.in_stock FROM alerts a JOIN products p ON p.key = a.key
       WHERE a.owner = ? ORDER BY a.created_at DESC`,
    )
    .bind(ownerId)
    .all<ListedRow>();
  return results.map((r) => ({
    id: r.id,
    key: r.key,
    store: r.store,
    title: r.title,
    image: r.image,
    price: r.price,
    inStock: r.in_stock == null ? null : r.in_stock === 1,
    rule: ruleOf(r),
    description: describeRule(ruleOf(r)),
    armed: r.armed === 1,
    lastFiredAt: r.last_fired_at,
    lastMessage: r.last_message,
    createdAt: r.created_at,
  }));
}

export async function meView(db: D1Database, owner: OwnerRow): Promise<MeView> {
  const push = await db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE owner = ?').bind(owner.id).first<{ n: number }>();
  return { telegram: owner.telegram_chat != null, push: push?.n ?? 0, alerts: await listAlerts(db, owner.id) };
}

// ---- linking a Telegram chat to a browser ("Connect Telegram")

export const LINK_CODE_MS = 15 * 60_000;

export async function createLinkCode(db: D1Database, ownerId: string, now: number): Promise<string> {
  const code = randomToken(18); // 24 characters, within Telegram's 64-character /start limit
  await db.batch([
    db.prepare('DELETE FROM link_codes WHERE expires < ?').bind(now),
    db.prepare('INSERT INTO link_codes (code_hash, owner, expires) VALUES (?, ?, ?)').bind(await sha256hex(code), ownerId, now + LINK_CODE_MS),
  ]);
  return code;
}

/** One use only. Returns the owner the code was made for, or null if unknown or expired. */
export async function consumeLinkCode(db: D1Database, code: string, now: number): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  const row = await db.prepare('DELETE FROM link_codes WHERE code_hash = ? RETURNING owner, expires').bind(await sha256hex(code)).first<{ owner: string; expires: number }>();
  return row && row.expires >= now ? row.owner : null;
}

/**
 * Give this chat to `ownerId`. If the chat already belonged to someone (alerts set in the bot
 * before connecting), those alerts move over; a duplicate (same product and kind) keeps the
 * browser's version. A Telegram-only owner left with nothing is removed.
 */
export async function linkChat(db: D1Database, ownerId: string, chat: number): Promise<void> {
  const prev = await db.prepare('SELECT * FROM owners WHERE telegram_chat = ? AND id != ?').bind(chat, ownerId).first<OwnerRow>();
  const statements = [];
  if (prev) {
    statements.push(
      db.prepare('UPDATE OR IGNORE alerts SET owner = ? WHERE owner = ?').bind(ownerId, prev.id),
      db.prepare('DELETE FROM alerts WHERE owner = ?').bind(prev.id),
      db.prepare('UPDATE push_subs SET owner = ? WHERE owner = ?').bind(ownerId, prev.id),
      prev.token_hash == null
        ? db.prepare('DELETE FROM owners WHERE id = ?').bind(prev.id)
        : db.prepare('UPDATE owners SET telegram_chat = NULL WHERE id = ?').bind(prev.id),
    );
  }
  statements.push(db.prepare('UPDATE owners SET telegram_chat = ? WHERE id = ?').bind(chat, ownerId));
  await db.batch(statements);
  if (prev) {
    const { results } = await db.prepare('SELECT DISTINCT key FROM alerts WHERE owner = ?').bind(ownerId).all<{ key: string }>();
    await recountWatchers(db, results.map((r) => r.key));
  }
}

export async function unlinkChat(db: D1Database, ownerId: string): Promise<void> {
  await db.prepare('UPDATE owners SET telegram_chat = NULL WHERE id = ?').bind(ownerId).run();
}

// ---- checking alerts after a reading

export function shortTitle(title: string | null): string {
  if (!title) return 'Your product';
  return title.length > 70 ? `${title.slice(0, 67).trimEnd()}…` : title;
}

/**
 * Decide every alert on this product against its latest stored reading, save the new states,
 * and send what fired. Idempotent: deciding again on the same reading sends nothing.
 */
export async function evaluateAlerts(env: Env, key: ProductKey, now: number): Promise<{ fired: number; deliveries: DeliveryResult[] }> {
  const product = await getProduct(env.DB, key);
  if (!product || product.last_checked_at == null) return { fired: 0, deliveries: [] };
  const { results } = await env.DB
    .prepare('SELECT a.*, o.telegram_chat FROM alerts a JOIN owners o ON o.id = a.owner WHERE a.key = ?')
    .bind(key)
    .all<AlertRow & { telegram_chat: number | null }>();
  const reading = { price: product.price, inStock: product.in_stock === 1 };
  const updates = [];
  const sends: { owner: { id: string; telegram_chat: number | null }; message: string }[] = [];
  for (const row of results) {
    const before = stateOf(row);
    const d = decideAlert(before, reading, now, shortTitle(product.title));
    const after = d.next;
    if (after.armed === before.armed && after.basePrice === before.basePrice && after.lastFiredAt === before.lastFiredAt) continue;
    updates.push(
      env.DB.prepare('UPDATE alerts SET armed = ?, base_price = ?, last_fired_at = ?, last_message = COALESCE(?, last_message) WHERE id = ?')
        .bind(after.armed ? 1 : 0, after.basePrice, after.lastFiredAt, d.fire ? d.message : null, row.id),
    );
    if (d.fire && d.message) sends.push({ owner: { id: row.owner, telegram_chat: row.telegram_chat }, message: d.message });
  }
  // Save first: if a send fails, the alert must not fire again on the next reading.
  if (updates.length) await env.DB.batch(updates);
  const deliveries = [];
  for (const s of sends) {
    deliveries.push(await deliver(env, s.owner, { title: 'Britto price alert', body: s.message, url: `${siteUrl(env)}/p/${encodeURIComponent(key)}`, tag: key }, now));
  }
  if (sends.length) console.log('alerts', key, JSON.stringify(deliveries));
  return { fired: sends.length, deliveries };
}
