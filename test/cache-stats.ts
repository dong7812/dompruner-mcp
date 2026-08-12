import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCacheStats, clearCache } from '../src/pipeline.ts';

test('getCacheStats returns l1 and l2 with expired fields', () => {
  clearCache();
  const stats = getCacheStats();
  assert.ok('l1' in stats && 'l2' in stats, 'must have l1 and l2 tiers');
  assert.ok('expired' in stats.l1 && 'expired' in stats.l2, 'each tier must have expired');
  assert.equal(stats.l1.total, 0);
  assert.equal(stats.l2.total, 0);
});

test('expired = total - alive (both tiers)', () => {
  clearCache();
  const stats = getCacheStats();
  assert.equal(stats.l1.expired, stats.l1.total - stats.l1.alive);
  assert.equal(stats.l2.expired, stats.l2.total - stats.l2.alive);
});
