// Prove the tests able to fail (CLAUDE.md rule 3): break the code on purpose, run the suite,
// and require that it fails on EXACTLY the expected checks. Every file is restored afterwards,
// also on Ctrl-C or a crash.
//   node scripts/mutate.mjs            every mutant
//   node scripts/mutate.mjs <filter>   mutants whose name contains <filter>
// A mutant: one exact text replacement in one file (the text must occur exactly once), the
// command to run, and patterns for the names of the checks that must fail. Names are read
// from `not ok N - <name>` (node --test), `FAIL  <name>` (prove/extension) and
// `DIFF <name>` (check-readers).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UNIT = ['node', ['--test', 'core/recipe.test.ts', 'core/extract.test.ts', 'core/select.test.ts']];
const CHECK = ['node', ['scripts/check-readers.mjs']];
// The slow ones (a real Worker; prove also makes its real amazon.in requests): run them by name.
const PROVE = ['node', ['scripts/prove.mjs']];
const EXTENSION = ['node', ['scripts/extension.mjs']];

export const MUTANTS = [
  {
    name: 'validator ignores unknown top-level keys',
    file: 'core/recipe.ts', find: "  unknownKeys(input, TOP_KEYS, 'config', errors);\n", replace: '',
    run: UNIT, expect: [/refuses what it does not understand/],
  },
  {
    name: 'validator lets a recipe set identity headers',
    file: 'core/recipe.ts', find: 'if (IDENTITY_HEADER.test(h))', replace: 'if (false && IDENTITY_HEADER.test(h))',
    run: UNIT, expect: [/refuses what it does not understand/],
  },
  {
    name: 'version id ignores the content',
    file: 'core/recipe.ts', find: 'fnv(canonicalJson(c))', replace: "fnv(c.store + c.device)",
    run: UNIT, expect: [/configVersion/],
  },
  {
    name: 'only the first regex alternative is tried',
    file: 'core/interpret.ts', find: '      if (hit != null) break;\n', replace: '      break;\n',
    run: UNIT, expect: [/regex alternatives/],
  },
  {
    name: 'regex match index ignored',
    file: 'core/interpret.ts', find: 'if (n++ === (field.match ?? 0))', replace: 'if (n++ === 0)',
    run: UNIT, expect: [/regex alternatives/],
  },
  {
    name: 'API rows keep rupees (no paise conversion)',
    file: 'core/recipe.ts', find: 'price: f.price ? rupeesToPaise(jsonPath(item, f.price)) : null,', replace: 'price: f.price ? (jsonPath(item, f.price) as number) : null,',
    run: UNIT, expect: [/readApiRows/],
  },
  {
    name: 'API row filter ignores ne',
    file: 'core/recipe.ts', find: 'if (m.ne && fill(m.ne).some((x) => eqLoose(v, x))) return false;', replace: '',
    run: UNIT, expect: [/readApiRows: root fallbacks/],
  },
  {
    name: 'jsonPath does not step into the first array element',
    file: 'core/recipe.ts', find: '(cur[0] as Record<string, unknown> | undefined)?.[seg]', replace: 'undefined',
    run: UNIT, expect: [/jsonPath and fillTemplate/, /jsonld paths/],
  },
  {
    name: 'interpreter falls back to any price on the page',
    file: 'core/interpret.ts',
    find: "  const price = parseRupees(firstOf(d.price, ctx));\n",
    replace: "  const price = parseRupees(firstOf(d.price, ctx)) ?? parseRupees(/₹\\s*([\\d,]+(?:\\.\\d{1,2})?)/.exec(html.replace(/<[^>]+>/g, ''))?.[1]);\n",
    run: UNIT, expect: [/never a price from outside the price fields/, /price box present but no "price to pay"/],
  },
  // ---- config CI (scripts/check-readers.mjs) on the real fixtures
  {
    name: 'Amazon recipe forgets "currently unavailable"',
    file: 'readers/amazon.desktop.json', find: '"currently unavailable", ', replace: '',
    run: CHECK, expect: [/^amazon-boat-variant-unavailable\.html (status|inStock|pid)/, /^amazon-iphone15-unavailable\.html (status|inStock|pid)/],
  },
  {
    name: 'Myntra recipe reads the M.R.P. as the price',
    file: 'readers/myntra.desktop.json', find: '"json": "pdpData.price.discounted"', replace: '"json": "pdpData.price.mrp"',
    run: CHECK, expect: [/^myntra-instock\.html price/],
  },
  {
    name: 'Flipkart recipe loses its error-page markers',
    file: 'readers/flipkart.desktop.json', find: '"blocked": [["Something went wrong!", "\\\\bE00\\\\d\\\\b"]],', replace: '',
    run: CHECK, expect: [/^flipkart-blocked-e002\.html (status|deleting the blocked marker)/],
  },
  {
    name: 'early stop before the price box has arrived',
    file: 'core/interpret.ts', find: '  if (!es.thenUnavailableOr?.length) return true;\n', replace: '  return true;\n',
    run: CHECK, expect: [/^amazon-cello-(25pens|10pens)-instock\.html early stop/, /^amazon-cello-technotip-paise\.html early stop/],
  },
  {
    name: 'interpreter falls back to the price in the page\'s own JSON',
    file: 'core/interpret.ts',
    find: "  const price = parseRupees(firstOf(d.price, ctx));\n",
    replace: "  const price = parseRupees(firstOf(d.price, ctx)) ?? parseRupees(/\"priceAmount\":([\\d.]+)/.exec(html)?.[1]);\n",
    run: CHECK, expect: [/^amazon-cello-(25pens|10pens)-instock\.html deleting the price/, /^amazon-cello-technotip-paise\.html deleting the price/],
  },
  // ---- the config service end to end (scripts/prove.mjs) and the extension (scripts/extension.mjs)
  {
    name: 'prove: config endpoint ignores If-None-Match',
    file: 'api/app.ts', find: "  if (asked.includes(etag) || asked.includes('*')) return new Response(null, { status: 304, headers });\n", replace: '',
    run: PROVE, expect: [/asking again with If-None-Match gets 304/],
  },
  {
    name: 'prove: a D1 override is used without validation',
    file: 'api/readers.ts',
    find: "    if (!v.ok) { console.error('reader override refused', store, device, row.created_at, v.errors.join('; ')); continue; }\n",
    replace: "    if (!v.ok) return { config: parsed as ReaderConfig, version: 'unvalidated', origin: 'd1' };\n",
    run: PROVE, expect: [/an invalid newer row in D1 is skipped/, /that server read used the hot-fix/],
  },
  {
    name: 'extension: the browser drops the image it read (parity)',
    file: 'extension/src/reader.ts',
    find: '    last = confirmIdentity(config.store, pid, readPage(config, document.documentElement.outerHTML, location.href), config.reportsPid);\n',
    replace: '    last = { ...confirmIdentity(config.store, pid, readPage(config, document.documentElement.outerHTML, location.href), config.reportsPid), image: null };\n',
    run: EXTENSION, expect: [/^parity: the browser reads (amazon\.in\/Cello|amazon\.in\/dp\/B09N3ZNHTY|myntra)/],
  },
];

const only = process.argv[2];
const backups = new Map();
const restore = () => { for (const [file, text] of backups) writeFileSync(join(ROOT, file), text); backups.clear(); };
process.on('exit', restore);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restore(); process.exit(130); });

function failingNames(output) {
  const names = [];
  for (const line of output.split('\n')) {
    const m = /^not ok \d+ - (.*)$/.exec(line.trim()) ?? /^FAIL\s+(.*?)(?:\s+—.*)?$/.exec(line) ?? /^DIFF\s+(.*)$/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

let good = 0;
let bad = 0;
for (const m of MUTANTS) {
  if (only && !m.name.includes(only)) continue;
  const path = join(ROOT, m.file);
  const original = readFileSync(path, 'utf8');
  const count = original.split(m.find).length - 1;
  if (count !== 1) { console.log(`BROKEN MUTANT ${m.name}: text found ${count} times in ${m.file}`); bad++; continue; }
  backups.set(m.file, original);
  writeFileSync(path, original.replace(m.find, m.replace));
  let output = '';
  let exit = 0;
  try {
    output = execFileSync(m.run[0], m.run[1], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: m.timeout ?? 600_000 });
  } catch (e) {
    exit = e.status ?? 1;
    output = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
  }
  restore();
  // node --test also reports each failing FILE as a failed test: drop those lines.
  const names = failingNames(output).filter((n) => !/\.(ts|mjs)$/.test(n));
  const unexpected = names.filter((n) => !m.expect.some((re) => re.test(n)));
  const missing = m.expect.filter((re) => !names.some((n) => re.test(n)));
  const ok = exit !== 0 && names.length > 0 && !unexpected.length && !missing.length;
  ok ? good++ : bad++;
  console.log(`${ok ? '  red as expected' : 'WRONG'}  ${m.name}`);
  for (const n of names) console.log(`        failed: ${n}`);
  if (!ok) console.log(`        exit ${exit}; unexpected ${JSON.stringify(unexpected)}; missing ${missing.map(String).join(', ') || 'none'}`);
}
console.log(`\n${good} mutants caught exactly, ${bad} not`);
process.exit(bad ? 1 : 0);
