// The only messages between the content script and the service worker.
import type { ProductView } from '../../core/types.ts';

export interface ObservedPayload {
  status: 'priced' | 'unavailable';
  title: string | null;
  image: string | null;
  price: number | null;
  mrp: number | null;
}

export type Request =
  | { type: 'observe'; url: string; observed: ObservedPayload }
  | { type: 'view'; key: string };

export type Reply =
  | { ok: true; product: ProductView; recorded?: 'accept' | 'hold' | 'skip'; reason?: string }
  | { ok: false; code: string; message: string };
