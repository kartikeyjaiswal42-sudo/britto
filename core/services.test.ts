import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTOR_NAMES, SERVICES } from './services.ts';
import { STORES, STORE_IDS } from './stores.ts';

test('services: one per sector, each opening on one of its own hosts', () => {
  assert.deepEqual(SERVICES.map((s) => s.sector).sort(), Object.keys(SECTOR_NAMES).sort(), 'exactly one service per sector');
  assert.equal(new Set(SERVICES.map((s) => s.id)).size, SERVICES.length);
  const storeHosts = new Set(STORE_IDS.flatMap((id) => [...STORES[id].hosts, ...STORES[id].shortHosts]));
  for (const s of SERVICES) {
    const home = new URL(s.home);
    assert.equal(home.protocol, 'https:', s.id);
    assert.ok(s.hosts.includes(home.hostname), `${s.id}: home is on its own hosts`);
    for (const h of s.hosts) {
      assert.equal(h, h.toLowerCase(), `${s.id}: ${h} lower-case`);
      assert.ok(!storeHosts.has(h), `${s.id}: ${h} is not also a store host`);
    }
    assert.match(s.measured, /^\d{4}-\d{2}-\d{2}: /, `${s.id}: says when it was measured`);
  }
});
