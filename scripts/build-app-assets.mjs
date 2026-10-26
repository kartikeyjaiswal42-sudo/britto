// The Android app's assets, built from the repository's own sources (run by Gradle's
// brittoAssets task; see android/app/build.gradle.kts):
//   britto-reader.js  the page reader injected into store pages: android/js/inject.ts, which
//                     is the extension's reader (extension/src/reader.ts) on the app's bridge
//   stores.json       which hosts belong to which store (core/stores.ts, the one registry)
//
//   node scripts/build-app-assets.mjs --out <dir> [--site <origin>] [--test]
// --test opens the panel's shadow root so a browser test can read it; never ship that.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORES, STORE_IDS } from '../core/stores.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(arg('--out', ''));
const site = arg('--site', 'https://britto.amitynoidalibrary.workers.dev').replace(/\/$/, '');
const test = process.argv.includes('--test');
if (!arg('--out', '')) throw new Error('usage: build-app-assets.mjs --out <dir> [--site <origin>] [--test]');
if (!/^https:\/\/|^http:\/\/127\.0\.0\.1(:\d+)?$/.test(site)) throw new Error(`--site must be https:// (or http://127.0.0.1 for tests): ${site}`);

mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(ROOT, 'android/js/inject.ts')],
  outfile: join(out, 'britto-reader.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020', // Android System WebView updates itself through the Play Store
  define: { BRITTO_API: JSON.stringify(site), BRITTO_SHADOW: JSON.stringify(test ? 'open' : 'closed') },
  legalComments: 'none',
  logLevel: 'warning',
});
writeFileSync(join(out, 'stores.json'), JSON.stringify(STORE_IDS.map((id) => {
  const s = STORES[id];
  return { id, name: s.name, hosts: s.hosts, shortHosts: s.shortHosts, home: s.home };
}), null, 1));
console.log(`app assets for ${site} -> ${out}`);
