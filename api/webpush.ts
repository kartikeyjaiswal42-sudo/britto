// Web Push, by hand, with WebCrypto only (no library): RFC 8291 message encryption
// (aes128gcm) and RFC 8292 VAPID, so the push service knows the message is ours.
// Checked against RFC 8291 Appendix A's worked example (api/webpush.test.ts) and against an
// independent decryption written with node:crypto.

type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text: string): Bytes {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** A P-256 public key as JWK x/y from its 65-byte uncompressed form (0x04 | x | y). */
function pointToJwk(point: Uint8Array): { kty: 'EC'; crv: 'P-256'; x: string; y: string } {
  if (point.length !== 65 || point[0] !== 4) throw new Error('not an uncompressed P-256 point');
  return { kty: 'EC', crv: 'P-256', x: b64url(point.slice(1, 33)), y: b64url(point.slice(33)) };
}

/** For tests: the application server's fixed key pair and salt (RFC 8291 Appendix A). */
export interface FixedInputs { asPublic: Bytes; asPrivate: Bytes; salt: Bytes }

/**
 * Encrypt one push message for one browser (RFC 8291, single record, rs = 4096).
 * `uaPublic` and `authSecret` come from the browser's PushSubscription (p256dh, auth).
 */
export async function encryptPush(plaintext: Uint8Array, uaPublic: Bytes, authSecret: Bytes, fixed?: FixedInputs): Promise<Bytes> {
  let asPublic: Bytes;
  let asPrivateKey: CryptoKey;
  if (fixed) {
    asPublic = fixed.asPublic;
    asPrivateKey = await crypto.subtle.importKey('jwk', { ...pointToJwk(fixed.asPublic), d: b64url(fixed.asPrivate) }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer);
    asPrivateKey = pair.privateKey;
  }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivateKey, 256));

  // RFC 8291 section 3.4: combine the ECDH secret with the browser's auth secret...
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  // ...then RFC 8188's content-encryption key and nonce.
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const padded = concat(plaintext, new Uint8Array([2])); // 0x02: last (only) record, no padding
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, padded));

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

export interface Vapid {
  /** base64url of the 65-byte uncompressed public key (also given to browsers to subscribe). */
  publicKey: string;
  /** The private key as a JWK (a Worker secret, never in the repo). */
  privateJwk: JsonWebKey;
  /** Contact for the push service: an https URL or mailto:. */
  subject: string;
}

/** `Authorization` header for one push service (RFC 8292): an ES256 JWT for its origin. */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, now: number): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto signs ECDSA as raw r|s (64 bytes), which is exactly what JWS ES256 wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`;
}

export interface PushSub { endpoint: string; p256dh: string; auth: string }

/**
 * Push services we will POST to. The endpoint comes from the browser, so without this list
 * the server could be pointed at any URL (a request forger's dream).
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

export function allowedEndpoint(endpoint: string, testOrigin?: string): boolean {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (testOrigin && u.origin === testOrigin) return true;
  return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
}

/** Shape-check a PushSubscription as the browser serialises it (toJSON()). */
export function parseSubscription(input: unknown): PushSub | null {
  if (typeof input !== 'object' || input === null) return null;
  const s = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof s.endpoint !== 'string' || s.endpoint.length > 1000) return null;
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[A-Za-z0-9_-]+$/.test(p256dh + auth)) return null;
  try {
    const k = fromB64url(p256dh);
    if (k.length !== 65 || k[0] !== 4 || fromB64url(auth).length !== 16) return null;
  } catch { return null; }
  return { endpoint: s.endpoint, p256dh, auth };
}

/** Send one message. Returns the push service's HTTP status (201 = accepted, 404/410 = gone). */
export async function sendPush(sub: PushSub, message: object, vapid: Vapid, now: number): Promise<number> {
  const body = await encryptPush(enc.encode(JSON.stringify(message)), fromB64url(sub.p256dh), fromB64url(sub.auth));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid, now),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(3 * 24 * 3600),
      Urgency: 'normal',
    },
    body,
  });
  await res.body?.cancel();
  return res.status;
}
