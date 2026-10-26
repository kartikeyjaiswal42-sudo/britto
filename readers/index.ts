// The bundled reader configs (BLUEPRINT §6): data, validated when this module loads, so a
// malformed recipe fails the build and the tests instead of reaching a shopper. The Worker
// serves these through GET /api/config/reader (a newer D1 row can override one without a
// deploy; see api/readers.ts). Clients never bundle them: they fetch what the server serves.
import { configVersion, validateReader, type Device, type ReaderConfig } from '../core/recipe.ts';
import type { StoreId } from '../core/types.ts';
import amazon from './amazon.desktop.json' with { type: 'json' };
import flipkart from './flipkart.desktop.json' with { type: 'json' };
import myntra from './myntra.desktop.json' with { type: 'json' };

export interface Reader { config: ReaderConfig; version: string }

function load(json: unknown): Reader {
  const v = validateReader(json);
  if (!v.ok) throw new Error(`invalid bundled reader config: ${v.errors.join('; ')}`);
  return { config: v.config, version: configVersion(v.config) };
}

const ALL: Reader[] = [amazon, flipkart, myntra].map(load);

/** The bundled config for a store and device, or null when there is none for that device. */
export function bundledReader(store: StoreId, device: Device = 'desktop'): Reader | null {
  return ALL.find((r) => r.config.store === store && r.config.device === device) ?? null;
}

export const BUNDLED_READERS: readonly Reader[] = ALL;
