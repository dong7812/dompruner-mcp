import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCacheStats, clearCache } from '../src/pipeline.ts';

// pipeline 내부 캐시에 만료 항목을 직접 주입하기 위해 모듈 내부 접근 대신
// runPipeline 없이 getCacheStats/clearCache만 테스트한다.

test('getCacheStats returns expired count', () => {
  clearCache();
  const stats = getCacheStats();
  assert.equal(stats.total, 0);
  assert.equal(stats.alive, 0);
  assert.equal(stats.expired, 0);
  assert.ok('expired' in stats, 'expired field must exist');
});

test('expired = total - alive', () => {
  clearCache();
  const stats = getCacheStats();
  assert.equal(stats.expired, stats.total - stats.alive);
});
