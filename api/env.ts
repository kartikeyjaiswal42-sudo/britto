// The Cloudflare bindings this Worker uses, declared structurally. Deliberately not
// @cloudflare/workers-types: its Response/ReadableStream clash with the DOM lib.

export interface D1Result<T> {
  results: T[];
  success: boolean;
  meta: { changes?: number; rows_read?: number; rows_written?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]>;
}

export interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Public origin, e.g. https://britto.example.workers.dev — named in the bot's User-Agent. */
  SITE_URL?: string;
  /** From @BotFather. A Worker secret; without it the Telegram bot is simply off. */
  TELEGRAM_BOT_TOKEN?: string;
  /** Tests only: a fake Telegram server. Production uses https://api.telegram.org. */
  TELEGRAM_API?: string;
  /** Web Push (VAPID). The public key is public (browsers need it to subscribe); the private
   * key is a Worker secret holding a JWK. Without both, browser notifications are off. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  /** Tests only: an extra origin a push subscription may point at (a fake push service). */
  PUSH_TEST_ORIGIN?: string;
  /** Tests only: how long (ms) an isolate keeps a reader config; default 60 000 (api/readers.ts). */
  READER_MEMO_MS?: string;
  /** Workers AI (Product Lens). Without it, search by photo answers 503 lens_off. */
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  /** Neurons Lens may spend per UTC day (default LENS.perDay in core/lens.ts). */
  LENS_NEURONS_PER_DAY?: string;
  /** A model id from core/lens.ts LENS_MODELS, to switch model without a code change. */
  LENS_MODEL?: string;
  /** Tests only: a fake model server; the Worker POSTs {model, input} to it instead of Workers AI. */
  LENS_FAKE_AI?: string;
}

export interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}
