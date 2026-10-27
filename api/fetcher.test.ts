import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchProduct } from './fetcher.ts';
import { bundledReader } from '../readers/index.ts';
import type { ReaderConfig } from '../core/recipe.ts';

// A saved Amazon page (~1 MB, so the early-stop check runs while it streams).
const PAGE = readFileSync(new URL('../test/fixtures/amazon-cello-25pens-instock.html', import.meta.url), 'utf8');
const AMAZON = bundledReader('amazon', 'desktop')!.config;

/** fetchProduct with the network replaced by one saved page. */
async function fetchWith(config: ReaderConfig) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
  try {
    return await fetchProduct(config, 'https://www.amazon.in/dp/B09X5DK382', undefined);
  } finally {
    globalThis.fetch = real;
  }
}

test('fetcher: the saved page through the stubbed network reads as priced', async () => {
  const out = await fetchWith(AMAZON);
  assert.equal(out.ok && out.extracted.status, 'priced');
});

test('fetcher: a reader that throws is a recorded failure, never an exception', async () => {
  // A config no saved page exercised: readPage throws on it.
  const broken = { ...AMAZON, domRecipe: { ...AMAZON.domRecipe, name: null } } as unknown as ReaderConfig;
  const out = await fetchWith(broken);
  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.code, 'reader_error');
  assert.match(!out.ok ? out.detail : '', /TypeError/);
});

test('fetcher: a reader that cannot decide "enough" reads on, and the page still reads', async () => {
  const noEnough = { ...AMAZON, domRecipe: { ...AMAZON.domRecipe, earlyStop: { complete: null } } } as unknown as ReaderConfig;
  const out = await fetchWith(noEnough);
  assert.equal(out.ok && out.extracted.status, 'priced', JSON.stringify(out));
});
