/**
 * DomPruner vs WebFetch 실측 벤치마크
 *
 * 측정 방식:
 *   WebFetch 페이지 토큰 = web_fetch_20260209 server tool 실행 후 input_tokens
 *                          (user 메시지 ~12 tok 오버헤드 제외)
 *                          → Anthropic이 fetch한 페이지 내용이 Claude 컨텍스트에
 *                            실제로 들어오는 토큰 수.
 *   DomPruner 토큰     = 동일 URL DOM AST 정제 후 refined_tokens.
 *
 * 사용법:
 *   ANTHROPIC_API_KEY=sk-ant-... node loadtest/bench-vs-webfetch.mjs
 */

import Anthropic from '@anthropic-ai/sdk';
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { runPipeline } = await import(
  pathToFileURL(join(__dirname, '../dist/pipeline.js')).href
);

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('❌  ANTHROPIC_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const client = new Anthropic({ apiKey });

// 요청 메시지 오버헤드 (user prompt "Fetch {url}" 부분)
const MSG_OVERHEAD = 15;

const CASES = [
  { url: 'https://docs.python.org/3/library/asyncio-task.html',              query: 'async task creation',         label: 'Python asyncio' },
  { url: 'https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html',   query: 'ownership borrow rules',      label: 'Rust Book ch04' },
  { url: 'https://react.dev/reference/react/useState',                       query: 'state update batching',       label: 'React useState' },
  { url: 'https://fastapi.tiangolo.com/tutorial/body/',                      query: 'request body validation',     label: 'FastAPI Body' },
  { url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch', query: 'CORS error handling', label: 'MDN Fetch API' },
  { url: 'https://docs.stripe.com/api/charges',                              query: 'charge object fields',        label: 'Stripe API' },
  { url: 'https://nextjs.org/docs/app/building-your-application/routing',   query: 'server component routing',    label: 'Next.js Routing' },
  { url: 'https://en.wikipedia.org/wiki/Large_language_model',               query: 'transformer architecture',    label: 'Wikipedia LLM' },
  { url: 'https://www.typescriptlang.org/docs/handbook/2/types-from-types.html', query: 'conditional types',     label: 'TypeScript Handbook' },
  { url: 'https://vuejs.org/guide/essentials/reactivity-fundamentals',      query: 'reactive state',              label: 'Vue Reactivity' },
];

// ── WebFetch 실측 ──────────────────────────────────────────────────────────────
async function measureWebFetch(url) {
  const t0 = Date.now();
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,     // 응답 최소화 — input_tokens(페이지 내용)만 측정
      tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', allowed_callers: ['direct'] }],
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: `Fetch: ${url}` }],
    });

    const fetched = resp.content.some(b => b.type === 'web_fetch_tool_result');
    if (!fetched) {
      return { tokens: 0, ms: Date.now() - t0, error: 'web_fetch not executed' };
    }

    // input_tokens = user_msg_overhead + 실제 페이지 내용 토큰
    const pageTokens = Math.max(0, (resp.usage?.input_tokens ?? 0) - MSG_OVERHEAD);
    return { tokens: pageTokens, ms: Date.now() - t0 };
  } catch (e) {
    return { tokens: 0, ms: Date.now() - t0, error: e.message?.slice(0, 60) };
  }
}

// ── DomPruner 실측 ─────────────────────────────────────────────────────────────
async function measureDomPruner(url, query) {
  const t0 = Date.now();
  try {
    const r = await runPipeline(url, { query });
    return {
      tokens: r.refinedTokens,
      originalTokens: r.originalTokens,
      bm25Confidence: r.bm25Confidence,
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { tokens: 0, ms: Date.now() - t0, error: e.message };
  }
}

// ── 출력 ───────────────────────────────────────────────────────────────────────
console.log('\n📊  DomPruner vs WebFetch 실측 벤치마크');
console.log('    WebFetch 토큰 = web_fetch server tool이 Claude 컨텍스트에 넣는 페이지 토큰 (input_tokens 기준)');
console.log('    DomPruner 토큰 = DOM AST 정제 후 refined_tokens\n');

const W = [22, 10, 11, 8, 6, 6, 6];
const headers = ['Site', 'WebFetch', 'DomPruner', '절감', 'WF ms', 'DP ms', 'Mode'];
const sep = W.map(w => '-'.repeat(w)).join('-+-');
console.log(headers.map((h, i) => h.padStart(W[i])).join(' | '));
console.log(sep);

const results = [];

for (const { url, query, label } of CASES) {
  process.stdout.write(`  ${label.padEnd(22)} ...`);

  const [wf, dp] = await Promise.all([
    measureWebFetch(url),
    measureDomPruner(url, query),
  ]);

  const saved =
    wf.tokens > 0 && dp.tokens > 0
      ? (((wf.tokens - dp.tokens) / wf.tokens) * 100).toFixed(1) + '%'
      : 'N/A';

  const mode = dp.bm25Confidence === 0 ? 'full†' : 'BM25';
  const note = wf.error ? ` ⚠ ${wf.error}` : '';

  const row = [label, wf.tokens || 'ERR', dp.tokens, saved, wf.ms, dp.ms, mode]
    .map((v, i) => String(v).padStart(W[i]))
    .join(' | ') + note;

  process.stdout.write('\r' + row + '\n');

  if (!wf.error && !dp.error) {
    results.push({ label, wfTokens: wf.tokens, dpTokens: dp.tokens });
  }
}

if (results.length > 0) {
  const avgWf = Math.round(results.reduce((s, r) => s + r.wfTokens, 0) / results.length);
  const avgDp = Math.round(results.reduce((s, r) => s + r.dpTokens, 0) / results.length);
  const avgSaved = (((avgWf - avgDp) / avgWf) * 100).toFixed(1);
  console.log(sep);
  console.log(
    ['AVERAGE', avgWf, avgDp, avgSaved + '%', '', '', '']
      .map((v, i) => String(v).padStart(W[i]))
      .join(' | ')
  );
}

console.log('\n† BM25 미매칭 → 전체 DomPruner 출력 자동 전환');
console.log('WebFetch 비용: Haiku input_tokens 기준 (페이지 내용만, user msg 오버헤드 제외)');
