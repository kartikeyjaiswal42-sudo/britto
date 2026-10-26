// Build the extension: `node scripts/build-ext.mjs [--api <origin>] [--out <dir>]`.
// Bundles extension/src (which imports core/ and web/ directly, so the extension reads
// pages with exactly the server's readers) into plain scripts Chrome can load.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const api = arg('--api', 'https://britto.amitynoidalibrary.workers.dev').replace(/\/$/, '');
// resolve, not join: join(ROOT, '/abs/dir') is ROOT + '/abs/dir' (sent a test build into britto/var/…).
const out = resolve(ROOT, arg('--out', 'extension/dist'));
if (!/^https:\/\/|^http:\/\/127\.0\.0\.1(:\d+)?$/.test(api)) throw new Error(`--api must be https:// (or http://127.0.0.1 for tests): ${api}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: { content: 'extension/src/content.ts', background: 'extension/src/background.ts', popup: 'extension/src/popup.ts' },
  absWorkingDir: ROOT,
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  // --test opens the panel's shadow root so scripts/extension.mjs can read it; never ship that.
  define: { BRITTO_API: JSON.stringify(api), BRITTO_SHADOW: JSON.stringify(process.argv.includes('--test') ? 'open' : 'closed') },
  legalComments: 'none',
  logLevel: 'warning',
});
const manifest = readFileSync(join(ROOT, 'extension/static/manifest.json'), 'utf8').replace('__BRITTO_API__', api);
writeFileSync(join(out, 'manifest.json'), manifest);
for (const f of ['popup.html', 'popup.css']) cpSync(join(ROOT, 'extension/static', f), join(out, f));
cpSync(join(ROOT, 'extension/icons'), join(out, 'icons'), { recursive: true });
console.log(`extension built for ${api} -> ${out}`);
