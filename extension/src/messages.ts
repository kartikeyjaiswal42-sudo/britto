// The only messages between the content script and the service worker (BLUEPRINT §7.5).
// The content script never calls the server itself: the service worker owns caching,
// politeness and the network. Every message is checked by isRequest(); anything else is
// dropped without an answer.
import type { ReaderConfig } from '../../core/recipe.ts';
import { STORE_IDS } from '../../core/stores.ts';
import type { ProductView, StoreId } from '../../core/types.ts';

export interface ObservedPayload {
  status: 'priced' | 'unavailable';
  title: string | null;
  image: string | null;
  price: number | null;
  mrp: number | null;
}

export type Request =
  | { type: 'getReaderConfig'; store: StoreId; device: 'desktop' | 'mobile' }
  | { type: 'postObservation'; url: string; observed: ObservedPayload; configVersion: string }
  | { type: 'getProductAnswer'; key: string }
  | { type: 'reportTelemetry'; store: StoreId; outcome: 'blocked' | 'unrecognised'; configVersion: string };

export type ConfigReply =
  | { ok: true; config: ReaderConfig; version: string }
  | { ok: false; code: string; message: string };

export type Reply =
  | { ok: true; product: ProductView; recorded?: 'accept' | 'hold' | 'skip'; reason?: string }
  | { ok: false; code: string; message: string };

const STORES = new Set<string>(STORE_IDS);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
const VERSION = /^[\w.-]{1,80}$/;
const nullable = (v: unknown, ok: (x: unknown) => boolean) => v === null || ok(v);
const paise = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;

/** A message the service worker will act on. Shapes only; the server re-checks every value. */
export function isRequest(m: unknown): m is Request {
  if (!isObj(m)) return false;
  switch (m['type']) {
    case 'getReaderConfig':
      return STORES.has(String(m['store'])) && (m['device'] === 'desktop' || m['device'] === 'mobile');
    case 'postObservation': {
      const o = m['observed'];
      return text(m['url'], 2000) && typeof m['configVersion'] === 'string' && VERSION.test(m['configVersion']) && isObj(o)
        && (o['status'] === 'priced' || o['status'] === 'unavailable')
        && nullable(o['title'], (x) => text(x, 500)) && nullable(o['image'], (x) => text(x, 1000))
        && nullable(o['price'], paise) && nullable(o['mrp'], paise);
    }
    case 'getProductAnswer':
      return text(m['key'], 120);
    case 'reportTelemetry':
      return STORES.has(String(m['store'])) && (m['outcome'] === 'blocked' || m['outcome'] === 'unrecognised')
        && typeof m['configVersion'] === 'string' && VERSION.test(m['configVersion']);
    default:
      return false;
  }
}
