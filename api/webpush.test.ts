import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify, type JsonWebKey as NodeJwk } from 'node:crypto';
import { allowedEndpoint, b64url, encryptPush, fromB64url, parseSubscription, vapidAuthorization } from './webpush.ts';

const strip = (s: string) => s.replace(/\s+/g, '');

test('RFC 8291 Appendix A: byte-for-byte the published result', async () => {
  const body = await encryptPush(
    fromB64url('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
    fromB64url(strip('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV- JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4')),
    fromB64url('BTBZMqHH6r4Tts7J_aSIgg'),
    {
      asPublic: fromB64url(strip('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8')),
      asPrivate: fromB64url('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
      salt: fromB64url('DGv6ra1nlYgDCS1FRnbzlw'),
    },
  );
  const header = fromB64url(strip('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8'));
  const cipher = fromB64url(strip('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ'));
  assert.equal(header.length, 86, 'the RFC says an 86-octet header');
  assert.equal(b64url(body), b64url(new Uint8Array([...header, ...cipher])));
});

/** Decrypt as a browser would, written separately with node:crypto (not our WebCrypto code). */
function browserDecrypt(body: Uint8Array, ua: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const asPublic = body.subarray(21, 21 + idlen);
  const secret = ua.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const data = body.subarray(21 + idlen);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  return plain.subarray(0, plain.length - 1).toString('utf8');
}

test('a fresh message decrypts with the browser keys, and each message uses new keys', async () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  const text = JSON.stringify({ title: 'Price drop', body: 'Cello pens are now ₹251.' });
  const a = await encryptPush(new TextEncoder().encode(text), new Uint8Array(ua.getPublicKey()), new Uint8Array(auth));
  const b = await encryptPush(new TextEncoder().encode(text), new Uint8Array(ua.getPublicKey()), new Uint8Array(auth));
  assert.equal(browserDecrypt(a, ua, auth), text);
  assert.notEqual(b64url(a.subarray(0, 16)), b64url(b.subarray(0, 16)), 'salt is random');
  assert.notEqual(b64url(a.subarray(21, 86)), b64url(b.subarray(21, 86)), 'server key is per message');
  const tampered = new Uint8Array(a);
  tampered[tampered.length - 1]! ^= 1;
  assert.throws(() => browserDecrypt(tampered, ua, auth), 'a changed byte fails the GCM tag');
});

test('VAPID: an ES256 JWT for the push service origin that verifies with our public key', async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer));
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const now = Date.UTC(2026, 9, 26);
  const h = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc:def', { publicKey, privateJwk, subject: 'https://britto.example' }, now);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h);
  assert.ok(m, h);
  assert.equal(m[4], publicKey);
  const claims = JSON.parse(Buffer.from(m[2]!, 'base64url').toString());
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'https://britto.example' });
  const pub = createPublicKey({ key: (await crypto.subtle.exportKey('jwk', pair.publicKey)) as NodeJwk, format: 'jwk' });
  const signed = Buffer.from(`${m[1]}.${m[2]}`);
  const sig = Buffer.from(m[3]!, 'base64url');
  assert.equal(verify('sha256', signed, { key: pub, dsaEncoding: 'ieee-p1363' }, sig), true);
  assert.equal(verify('sha256', Buffer.from(`${m[1]}.x${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, sig), false);
});

test('only real push services may be sent to', () => {
  assert.equal(allowedEndpoint('https://fcm.googleapis.com/fcm/send/x'), true);
  assert.equal(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), true);
  assert.equal(allowedEndpoint('https://web.push.apple.com/QM'), true);
  assert.equal(allowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x'), true);
  assert.equal(allowedEndpoint('https://fcm.googleapis.com.evil.example/x'), false);
  assert.equal(allowedEndpoint('http://fcm.googleapis.com/x'), false);
  assert.equal(allowedEndpoint('https://fcm.googleapis.com:8443/x'), false);
  assert.equal(allowedEndpoint('http://169.254.169.254/latest'), false);
  assert.equal(allowedEndpoint('http://127.0.0.1:9999/push/1'), false, 'no test origin configured');
  assert.equal(allowedEndpoint('http://127.0.0.1:9999/push/1', 'http://127.0.0.1:9999'), true);
});

test('subscriptions are shape-checked', () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const keys = { p256dh: b64url(new Uint8Array(ua.getPublicKey())), auth: b64url(new Uint8Array(randomBytes(16))) };
  assert.deepEqual(parseSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys }), { endpoint: 'https://fcm.googleapis.com/x', ...keys });
  assert.equal(parseSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { ...keys, auth: 'short' } }), null);
  assert.equal(parseSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { ...keys, p256dh: keys.p256dh.slice(4) } }), null);
  assert.equal(parseSubscription({ endpoint: 42, keys }), null);
  assert.equal(parseSubscription(null), null);
});
