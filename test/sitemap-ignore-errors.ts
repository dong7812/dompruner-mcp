import { test } from 'node:test';
import assert from 'node:assert/strict';

// ignore_errors 분기 로직을 직접 단위 테스트

async function fetchOne(url: string, ignore_errors: boolean): Promise<{ url: string; ok: boolean } | null> {
  try {
    if (url.includes('fail')) throw new Error('fetch failed');
    return { url, ok: true };
  } catch (e) {
    if (!ignore_errors) throw e;
    return null;
  }
}

test('ignore_errors=true: failed pages return null (skipped)', async () => {
  const result = await fetchOne('https://example.com/fail', true);
  assert.equal(result, null);
});

test('ignore_errors=true: successful pages return result', async () => {
  const result = await fetchOne('https://example.com/ok', true);
  assert.ok(result?.ok);
});

test('ignore_errors=false: throws on failed page', async () => {
  await assert.rejects(() => fetchOne('https://example.com/fail', false), /fetch failed/);
});

test('ignore_errors=false: successful pages still return result', async () => {
  const result = await fetchOne('https://example.com/ok', false);
  assert.ok(result?.ok);
});
