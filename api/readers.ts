// Which reader config the Worker uses and serves for a store (BLUEPRINT §6.3). The newest D1
// override (table reader_configs, written by scripts/publish-reader.mjs) that passes
// validateReader wins; otherwise the bundled readers/<store>.<device>.json. An override that
// fails validation is skipped and logged, never half-used. Results are kept for 60 s per
// isolate, so a hot-fix reaches every isolate within a minute and costs one D1 read a minute.
import { configVersion, validateReader, type Device, type ReaderConfig } from '../core/recipe.ts';
import type { Millis, StoreId } from '../core/types.ts';
import { bundledReader } from '../readers/index.ts';
import type { D1Database, Env } from './env.ts';

export interface ServedReader {
  config: ReaderConfig;
  version: string;
  origin: 'bundled' | 'd1';
}

export const READER_MEMO_MS = 60_000;
/** Overrides looked at per store and device, newest first (an invalid newest one falls back). */
const OVERRIDES_SCANNED = 5;

const memo = new Map<string, { at: Millis; reader: ServedReader | null }>();
const logged = new Set<string>();

/** Tests only: forget what this isolate has cached. */
export function forgetReaders(): void {
  memo.clear();
  logged.clear();
}

async function newestOverride(db: D1Database, store: StoreId, device: Device): Promise<ServedReader | null> {
  const { results } = await db
    .prepare('SELECT created_at, json FROM reader_configs WHERE store = ? AND device = ? ORDER BY created_at DESC LIMIT ?')
    .bind(store, device, OVERRIDES_SCANNED)
    .all<{ created_at: number; json: string }>();
  for (const row of results) {
    let parsed: unknown;
    try { parsed = JSON.parse(row.json); } catch { console.error('reader override is not JSON', store, device, row.created_at); continue; }
    const v = validateReader(parsed);
    if (!v.ok) { console.error('reader override refused', store, device, row.created_at, v.errors.join('; ')); continue; }
    if (v.config.store !== store || v.config.device !== device) { console.error('reader override for another store/device', store, device, row.created_at); continue; }
    return { config: v.config, version: configVersion(v.config), origin: 'd1' };
  }
  return null;
}

/** The reader for one store and device, or null when there is none for that device. */
export async function getReader(env: Pick<Env, 'DB' | 'READER_MEMO_MS'>, store: StoreId, device: Device, now: Millis = Date.now()): Promise<ServedReader | null> {
  const key = `${store}.${device}`;
  const hit = memo.get(key);
  const keep = env.READER_MEMO_MS === undefined ? READER_MEMO_MS : Number(env.READER_MEMO_MS);
  if (hit && now - hit.at < keep) return hit.reader;
  const bundled = bundledReader(store, device);
  const reader = (await newestOverride(env.DB, store, device)) ?? (bundled ? { ...bundled, origin: 'bundled' as const } : null);
  memo.set(key, { at: now, reader });
  if (reader && !logged.has(reader.version)) {
    logged.add(reader.version);
    await env.DB.prepare('INSERT OR IGNORE INTO config_log (version, store, device, origin, first_seen_at) VALUES (?, ?, ?, ?, ?)')
      .bind(reader.version, store, device, reader.origin, now)
      .run();
  }
  return reader;
}

const HOUR = 3_600_000;

export type HealthSource = 'server' | 'extension' | 'app';

/** Count one reading outcome in this hour's reader-health row. */
export async function countReading(
  db: D1Database,
  h: { store: StoreId; source: HealthSource; configVersion: string; readerVersion: string; outcome: string },
  now: Millis,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reader_health (hour, store, source, config_version, reader_version, outcome, n) VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT (hour, store, source, config_version, reader_version, outcome) DO UPDATE SET n = n + 1`,
    )
    .bind(Math.floor(now / HOUR) * HOUR, h.store, h.source, h.configVersion, h.readerVersion, h.outcome)
    .run();
}

/** Thresholds for the reader-health warnings (BLUEPRINT §20). */
export const HEALTH = {
  window: 24 * HOUR,
  recent: 6 * HOUR,
  activeWithin: 7 * 24 * HOUR,
  failShare: 0.5,
  failMinReads: 5,
  /** Rows older than this are swept by the cron (sweepRate). */
  keep: 30 * 24 * HOUR,
} as const;

export interface HealthReport {
  computedAt: Millis;
  since: Millis;
  stores: {
    store: StoreId;
    reads: number;
    byOutcome: Record<string, number>;
    bySource: Record<string, number>;
    byConfigVersion: Record<string, number>;
    /** (unrecognised + blocked) / reads over the last 24 h; null with no reads. */
    failRate: number | null;
    recent: { reads: number; failed: number };
  }[];
  warnings: { store: StoreId; code: 'no_reads' | 'failing'; message: string }[];
  configs: { version: string; origin: string; firstSeenAt: Millis }[];
}

const FAILED = new Set(['unrecognised', 'blocked']);

/** Reader health for the operator: what each store's readings did in the last 24 hours. */
export async function healthReport(db: D1Database, stores: readonly StoreId[], now: Millis): Promise<HealthReport> {
  const since = Math.floor((now - HEALTH.window) / HOUR) * HOUR;
  const { results } = await db
    .prepare('SELECT hour, store, source, config_version, outcome, n FROM reader_health WHERE hour >= ?')
    .bind(Math.min(since, now - HEALTH.activeWithin))
    .all<{ hour: number; store: StoreId; source: string; config_version: string; outcome: string; n: number }>();
  const recentFrom = now - HEALTH.recent;
  const report: HealthReport = { computedAt: now, since, stores: [], warnings: [], configs: [] };
  for (const store of stores) {
    const rows = results.filter((r) => r.store === store);
    const day = rows.filter((r) => r.hour >= since);
    // An hour row counts as recent when any part of its hour is inside the window.
    const recent = rows.filter((r) => r.hour + HOUR > recentFrom);
    const sum = (rs: typeof rows) => rs.reduce((a, r) => a + r.n, 0);
    const by = (k: 'outcome' | 'source' | 'config_version') => {
      const out: Record<string, number> = {};
      for (const r of day) out[r[k]] = (out[r[k]] ?? 0) + r.n;
      return out;
    };
    const reads = sum(day);
    const failedDay = sum(day.filter((r) => FAILED.has(r.outcome)));
    const recentReads = sum(recent);
    const recentFailed = sum(recent.filter((r) => FAILED.has(r.outcome)));
    report.stores.push({
      store, reads, byOutcome: by('outcome'), bySource: by('source'), byConfigVersion: by('config_version'),
      failRate: reads ? failedDay / reads : null, recent: { reads: recentReads, failed: recentFailed },
    });
    if (rows.length && recentReads === 0) {
      report.warnings.push({ store, code: 'no_reads', message: `${store}: read in the last 7 days, but not once in the last 6 hours` });
    }
    if (recentReads >= HEALTH.failMinReads && recentFailed / recentReads >= HEALTH.failShare) {
      report.warnings.push({ store, code: 'failing', message: `${store}: ${recentFailed} of ${recentReads} readings in the last 6 hours were unrecognised or blocked` });
    }
  }
  const log = await db
    .prepare('SELECT version, origin, first_seen_at FROM config_log ORDER BY first_seen_at DESC LIMIT 50')
    .all<{ version: string; origin: string; first_seen_at: number }>();
  report.configs = log.results.map((r) => ({ version: r.version, origin: r.origin, firstSeenAt: r.first_seen_at }));
  return report;
}
