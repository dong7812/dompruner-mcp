import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── lruSet ────────────────────────────────────────────────────────────────────

function makeLru<V>(max: number) {
  const cache = new Map<string, V>();
  function set(key: string, value: V) {
    if (cache.has(key)) cache.delete(key);
    if (cache.size >= max) cache.delete(cache.keys().next().value!);
    cache.set(key, value);
  }
  return { cache, set };
}

test('lru: does not exceed max', () => {
  const { cache, set } = makeLru<number>(64);
  for (let i = 0; i < 70; i++) set(`k${i}`, i);
  assert.equal(cache.size, 64);
});

test('lru: evicts oldest on overflow', () => {
  const { cache, set } = makeLru<number>(4);
  set('a', 1); set('b', 2); set('c', 3); set('d', 4);
  set('e', 5);
  assert.equal(cache.has('a'), false);
  assert.equal(cache.has('e'), true);
});

test('lru: re-set moves entry to most-recent', () => {
  const { cache, set } = makeLru<number>(3);
  set('a', 1); set('b', 2); set('c', 3);
  set('a', 99); // 'a'를 최신으로 이동
  set('d', 4);  // 'b'가 가장 오래된 항목 → 제거
  assert.equal(cache.has('a'), true);
  assert.equal(cache.has('b'), false);
});

// ── Semaphore ─────────────────────────────────────────────────────────────────

class Semaphore {
  private slots: number;
  private queue: Array<() => void> = [];
  constructor(limit: number) { this.slots = limit; }
  acquire(): Promise<void> {
    if (this.slots > 0) { this.slots--; return Promise.resolve(); }
    return new Promise(resolve => this.queue.push(resolve));
  }
  release(): void {
    const next = this.queue.shift();
    if (next) next(); else this.slots++;
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try { return await fn(); } finally { this.release(); }
  }
}

test('semaphore: limit=1 serializes concurrent calls', async () => {
  const sem = new Semaphore(1);
  const order: number[] = [];
  let fetchCount = 0;

  const run = (id: number) => sem.run(async () => {
    fetchCount++;
    order.push(id);
    await new Promise(r => setTimeout(r, 5));
    return id;
  });

  await Promise.all([run(1), run(2), run(3)]);
  assert.equal(fetchCount, 3);
  assert.equal(order[0], 1); // 첫 번째가 먼저 실행됨
});

test('semaphore: failure releases slot for next waiter', async () => {
  const sem = new Semaphore(1);
  let attempts = 0;

  const fail = () => sem.run(async () => { attempts++; throw new Error('fail'); });
  const ok   = () => sem.run(async () => { attempts++; return 'ok'; });

  await assert.rejects(fail);
  const result = await ok(); // fail 후 sem이 해제됐으면 ok가 실행될 수 있어야 함
  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

// ── page-fault 패턴 ───────────────────────────────────────────────────────────

test('page fault: same URL concurrent calls share one fetch', async () => {
  const l2 = new Map<string, string>();
  const sem = new Semaphore(1);
  let fetchCount = 0;

  const getHtml = (url: string) => sem.run(async () => {
    const hit = l2.get(url);
    if (hit) return hit;                            // L2 hit (double-check)
    fetchCount++;
    await new Promise(r => setTimeout(r, 10));
    const html = `<html>${url}</html>`;
    l2.set(url, html);
    return html;
  });

  const [h1, h2, h3] = await Promise.all([
    getHtml('https://example.com'),
    getHtml('https://example.com'),
    getHtml('https://example.com'),
  ]);

  assert.equal(fetchCount, 1, 'should fetch only once');
  assert.equal(h1, h2);
  assert.equal(h2, h3);
});

test('page fault: different URLs each fetch independently', async () => {
  const sems = new Map<string, Semaphore>();
  const l2 = new Map<string, string>();
  let fetchCount = 0;

  const getSem = (url: string) => {
    if (!sems.has(url)) sems.set(url, new Semaphore(1));
    return sems.get(url)!;
  };

  const getHtml = (url: string) => getSem(url).run(async () => {
    const hit = l2.get(url);
    if (hit) return hit;
    fetchCount++;
    l2.set(url, `<html>${url}</html>`);
    return l2.get(url)!;
  });

  await Promise.all([getHtml('https://a.com'), getHtml('https://b.com')]);
  assert.equal(fetchCount, 2);
});
