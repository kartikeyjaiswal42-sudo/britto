// Publish a reader hot-fix into D1 (table reader_configs) — no deploy, no client release.
// The Worker serves the newest valid row for a store and device within ~1 minute
// (api/readers.ts), and clients pick it up within 10 minutes.
//
//   node scripts/publish-reader.mjs <candidate.json> --local <persist dir>
//   node scripts/publish-reader.mjs <candidate.json> --remote          (production: the owner)
//   node scripts/publish-reader.mjs --clear <store>.<device> --local <dir> | --remote
//                                       delete every override: back to the bundled reader
//   node scripts/publish-reader.mjs --list --local <dir> | --remote
//
// The candidate is dry-run first (scripts/check-readers.mjs --candidate): it is inserted only
// if it is valid and every saved page still reads exactly as test/fixtures/expected.json says.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const local = arg('--local');
const remote = argv.includes('--remote');
if (!local === !remote) { console.error('say where: --local <persist dir> or --remote'); process.exit(2); }

const d1 = (sql) => {
  const where = remote ? ['--remote'] : ['--local', '--persist-to', resolve(local)];
  const out = execFileSync(WRANGLER, ['d1', 'execute', 'britto', ...where, '--json', '--command', sql], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out)[0]?.results ?? [];
};
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;

if (argv.includes('--list')) {
  for (const r of d1('SELECT store, device, created_at, length(json) AS bytes FROM reader_configs ORDER BY store, device, created_at DESC')) {
    console.log(`${r.store}.${r.device}  ${new Date(r.created_at).toISOString()}  ${r.bytes} bytes`);
  }
  process.exit(0);
}

const clear = arg('--clear');
if (clear) {
  const m = /^([a-z]+)\.(desktop|mobile)$/.exec(clear);
  if (!m) { console.error('--clear <store>.<desktop|mobile>'); process.exit(2); }
  d1(`DELETE FROM reader_configs WHERE store = ${quote(m[1])} AND device = ${quote(m[2])}`);
  console.log(`cleared every ${clear} override: the bundled reader is served again within a minute`);
  process.exit(0);
}

const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--local');
if (!file) { console.error('usage: publish-reader.mjs <candidate.json> --local <dir> | --remote'); process.exit(2); }
const text = readFileSync(resolve(file), 'utf8');
const config = JSON.parse(text);

console.log(`dry run of ${file} against every saved page…`);
const dry = spawnSync('node', [join(ROOT, 'scripts/check-readers.mjs'), '--candidate', resolve(file)], { cwd: ROOT, encoding: 'utf8' });
process.stdout.write(dry.stdout);
if (dry.status !== 0) {
  process.stderr.write(dry.stderr);
  console.error('NOT published: the dry run found differences (above).');
  process.exit(1);
}
// Stored compact: the version id hashes the content, not the formatting.
const now = Date.now();
d1(`INSERT INTO reader_configs (store, device, created_at, json) VALUES (${quote(config.store)}, ${quote(config.device)}, ${now}, ${quote(JSON.stringify(config))})`);
console.log(`published ${config.store}.${config.device} at ${new Date(now).toISOString()} (${remote ? 'production' : local})`);
