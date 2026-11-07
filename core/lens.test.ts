import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWords, LENS, LENS_MODELS, lensDay, lensInput, neuronsOf, parseLens, sniffImage } from './lens.ts';

test('a reply in the asked format: words, brand and whether the model read them', () => {
  assert.deepEqual(parseLens('NAME: Cello Butterflow ball pen pack of 25\nBRAND: Cello\nSURE: yes'),
    { found: true, words: 'Cello Butterflow ball pen pack of 25', brand: 'Cello', sure: true });
  assert.deepEqual(parseLens('**NAME:** boAt Airdopes 141\n**BRAND:** boAt\n**SURE:** no, guessing from the case'),
    { found: true, words: 'boAt Airdopes 141', brand: 'boAt', sure: false });
});

test('no product in the photo: found false, nothing to search', () => {
  assert.deepEqual(parseLens('NONE'), { found: false, words: '', brand: null, sure: false });
  assert.deepEqual(parseLens(' none. '), { found: false, words: '', brand: null, sure: false });
  assert.deepEqual(parseLens('NAME: none\nBRAND: unknown\nSURE: no'), { found: false, words: '', brand: null, sure: false });
});

test('an unknown brand is null, not the word "unknown"', () => {
  assert.equal(parseLens('NAME: steel water bottle 1 litre\nBRAND: unknown\nSURE: no')?.brand, null);
  assert.equal(parseLens('NAME: steel water bottle 1 litre\nBRAND: Not visible\nSURE: no')?.brand, null);
});

test('the three lines without their labels (llama-4-scout did this once) still read', () => {
  assert.deepEqual(parseLens('Cello Butterflow Simply Ball\nCello\nyes'), { found: true, words: 'Cello Butterflow Simply Ball', brand: 'Cello', sure: true });
  assert.equal(parseLens('Cello Butterflow Simply Ball\nCello\nmaybe'), null);
});

test('a reply that ignores the format is refused (null), not guessed at', () => {
  assert.equal(parseLens('This looks like a pen.'), null);
  assert.equal(parseLens(''), null);
});

test('search words: no markup, no links, at most 10 words', () => {
  assert.equal(cleanWords('<b>Cello</b> "Butterflow"!! pen'), 'b Cello b Butterflow pen');
  assert.equal(cleanWords('Visit https://evil.example/x now'), 'Visit https evil.example/x now');
  assert.equal(cleanWords('one two three four five six seven eight nine ten eleven twelve').split(' ').length, LENS.maxWords);
  assert.equal(cleanWords('Haldiram’s भुजिया 400g'), "Haldiram's भुजिया 400g");
  assert.equal(cleanWords('Samsung Galaxy M35 5G (8GB/128GB)'), 'Samsung Galaxy M35 5G 8GB/128GB');
});

test('the photo is judged by its bytes, not by what it claims to be', () => {
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])), 'image/jpeg');
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(sniffImage(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')), 'image/webp');
  assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8])), null);
  // A JPEG's third byte is 0xff too (the next marker): two right bytes are not a JPEG.
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0x00, 0x10])), null);
});

test('neurons: the reply\'s own figure first, else its tokens × the price table', () => {
  const m = '@cf/meta/llama-4-scout-17b-16e-instruct' as const;
  assert.equal(neuronsOf(m, { neurons: 12.5, prompt_tokens: 1, completion_tokens: 1 }), 12.5);
  // 1,000 in × 24,545/M + 20 out × 77,273/M = 24.545 + 1.54546
  assert.equal(Math.round(neuronsOf(m, { prompt_tokens: 1000, completion_tokens: 20 })! * 1e5) / 1e5, 26.09046);
  assert.equal(neuronsOf(m, {}), null);
  assert.equal(neuronsOf(m, null), null);
  for (const p of Object.values(LENS_MODELS)) assert.ok(p.input > 0 && p.output > 0);
});

test('the model input carries the photo as a data: URI and a short answer budget', () => {
  const i = lensInput('data:image/jpeg;base64,AAAA');
  const part = (i.messages[0]!.content as { type: string; image_url?: { url: string } }[]).find((p) => p.type === 'image_url');
  assert.equal(part?.image_url?.url, 'data:image/jpeg;base64,AAAA');
  assert.equal(i.max_tokens, LENS.maxTokens);
  assert.equal(i.temperature, 0);
});

test('neurons are counted by UTC day, as Workers AI resets at 00:00 UTC (05:30 IST)', () => {
  assert.equal(lensDay(Date.UTC(2026, 10, 7, 23, 59)), '2026-11-07');
  assert.equal(lensDay(Date.UTC(2026, 10, 8, 0, 0)), '2026-11-08');
});
