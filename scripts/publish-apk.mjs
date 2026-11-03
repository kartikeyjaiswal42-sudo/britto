// Build the signed release APK and publish it on the site (web/download/), with the facts the
// /app page shows: version, size, SHA-256 of the file, and the signing certificate.
//   node scripts/publish-apk.mjs      reads the key from ~/.britto/release.env (never printed)
// The same key must sign every version, or a phone cannot update the app it has.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(homedir(), '.britto', 'release.env');
const env = { ...process.env };
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2];
}
if (!env.BRITTO_KEYSTORE) throw new Error(`${envFile} names no BRITTO_KEYSTORE`);

execFileSync('./gradlew', ['--no-daemon', '-q', 'assembleRelease'], { cwd: join(ROOT, 'android'), env, stdio: 'inherit' });
const apk = join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk');
const meta = JSON.parse(readFileSync(join(dirname(apk), 'output-metadata.json'), 'utf8')).elements[0];

// Check the signature with the SDK's own apksigner, and that it is OUR key, not the debug one.
const sdk = /sdk\.dir=(.*)/.exec(readFileSync(join(ROOT, 'android/local.properties'), 'utf8'))[1].trim();
const tools = readdirSync(join(sdk, 'build-tools')).sort().at(-1);
const verify = execFileSync(join(sdk, 'build-tools', tools, 'apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8' });
const cert = /Signer #1 certificate SHA-256 digest: ([0-9a-f]+)/.exec(verify)?.[1];
const want = execFileSync('keytool', ['-list', '-keystore', env.BRITTO_KEYSTORE, '-storepass', env.BRITTO_KEYSTORE_PASS, '-alias', env.BRITTO_KEY_ALIAS ?? 'britto'], { encoding: 'utf8' });
const wantCert = /SHA-256\): ([0-9A-F:]+)/.exec(want)?.[1].replaceAll(':', '').toLowerCase();
if (!cert || cert !== wantCert) throw new Error(`APK is not signed with the release key (${cert} vs ${wantCert})`);

const bytes = readFileSync(apk);
const out = join(ROOT, 'web/download');
mkdirSync(out, { recursive: true });
copyFileSync(apk, join(out, 'britto.apk'));
const info = {
  version: meta.versionName, versionCode: meta.versionCode, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), cert, builtAt: Date.now(),
};
writeFileSync(join(out, 'britto.json'), `${JSON.stringify(info, null, 2)}\n`);
console.log(`published Britto ${info.version} (${info.versionCode}): ${info.bytes} bytes, sha256 ${info.sha256}, signed by ${cert.slice(0, 16)}…`);
