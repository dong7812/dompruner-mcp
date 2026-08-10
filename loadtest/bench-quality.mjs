/**
 * DomPruner 품질 벤치마크
 *
 * 토큰 절감이 아닌 "답변 품질이 유지되는가"를 측정한다.
 * 각 케이스: DomPruner 출력을 Claude에 넣고 질문 → 핵심 사실 포함 여부 판정.
 *
 * 사용법:
 *   ANTHROPIC_API_KEY=sk-ant-... node loadtest/bench-quality.mjs
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
if (!apiKey) { console.error('ANTHROPIC_API_KEY 필요'); process.exit(1); }

const client = new Anthropic({ apiKey });

// ── 테스트 케이스 ──────────────────────────────────────────────────────────────
// mustContain: 답변에 반드시 포함돼야 할 핵심 사실 (소문자 포함 여부로 체크)
// category: 엣지케이스 유형
const CASES = [
  {
    label: '정확한 사실 — create_task 반환값',
    url: 'https://docs.python.org/3/library/asyncio-task.html',
    query: 'asyncio.create_task return value type',
    question: 'asyncio.create_task()의 반환값 타입은 무엇인가요?',
    mustContain: ['task', 'Task'],
    category: 'factual',
  },
  {
    label: '코드 예시 — FastAPI request body',
    url: 'https://fastapi.tiangolo.com/tutorial/body/',
    query: 'request body BaseModel example code',
    question: 'FastAPI에서 request body를 받는 최소 코드 예시를 보여주세요.',
    mustContain: ['BaseModel', 'class', 'def '],
    category: 'code',
  },
  {
    label: '크로스 섹션 — React state 불변성',
    url: 'https://react.dev/reference/react/useState',
    query: 'why state immutable update',
    question: 'React에서 state를 직접 수정하면 안 되는 이유는 무엇인가요?',
    mustContain: ['render', 'rerender', 're-render', 'detect', 'trigger', 'trigger'],
    category: 'conceptual',
  },
  {
    label: '의미 추론 폴백 — Vue 반응형 내부',
    url: 'https://vuejs.org/guide/essentials/reactivity-fundamentals',
    query: 'how reactivity tracking works internally proxy',
    question: 'Vue의 반응형 시스템은 내부적으로 어떻게 변경을 감지하나요?',
    mustContain: ['Proxy', 'proxy', 'track', 'getter', 'setter'],
    category: 'semantic-fallback',
  },
  {
    label: '깊이 중첩 — TypeScript infer 예시',
    url: 'https://www.typescriptlang.org/docs/handbook/2/conditional-types.html',
    query: 'infer keyword conditional type example',
    question: 'TypeScript infer 키워드 사용 예시 코드를 보여주세요.',
    mustContain: ['infer', 'extends', '=>'],
    category: 'deep-content',
  },
  {
    label: '오류 해결 — CORS 에러',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS',
    query: 'CORS error fix Access-Control-Allow-Origin',
    question: 'CORS 에러가 발생할 때 서버에서 해결하는 방법은?',
    mustContain: ['Access-Control-Allow-Origin', 'header', 'Header'],
    category: 'troubleshooting',
  },
  {
    label: '목록 완전성 — Stripe charge 필드',
    url: 'https://docs.stripe.com/api/charges/object',
    query: 'charge object fields amount currency status',
    question: 'Stripe Charge 오브젝트의 주요 필드를 나열해주세요.',
    mustContain: ['amount', 'currency', 'status', 'id'],
    category: 'completeness',
  },
  {
    label: '정보 없음 — graceful 처리',
    url: 'https://fastapi.tiangolo.com/tutorial/body/',
    query: 'author page published date',
    question: '이 페이지의 작성자 이름과 작성 날짜는 언제인가요?',
    // 없는 정보 → Claude가 "모른다"고 답해야 함. mustContain은 비움.
    mustContain: [],
    expectNoInfo: true,
    category: 'no-answer',
  },
  {
    label: '버전 특정 — Next.js App Router vs Pages',
    url: 'https://nextjs.org/docs/app/building-your-application/routing',
    query: 'app router vs pages router difference',
    question: 'Next.js App Router와 Pages Router의 핵심 차이점은 무엇인가요?',
    mustContain: ['app', 'App', 'layout', 'Layout', 'server', 'Server'],
    category: 'version-specific',
  },
  {
    label: '의미 불일치 — "성능이 좋은가"',
    url: 'https://react.dev/reference/react/useState',
    query: 'performance fast slow optimization',
    question: 'React useState는 성능 면에서 어떤 특성을 갖나요?',
    mustContain: ['batch', 'render', 'Batch', 'Render', 'perform', 'optim'],
    category: 'semantic-mismatch',
  },
];

// ── DomPruner 경로: fetch+parse → Haiku 추론 ─────────────────────────────────
async function runDomPrunerPath(url, query, question) {
  // Phase 1: DomPruner fetch + extraction
  const t0 = Date.now();
  const dp = await runPipeline(url, { query });
  const fetchParseMs = Date.now() - t0;

  // Phase 2: Haiku 추론 (줄어든 컨텍스트)
  const t1 = Date.now();
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content:
        `다음은 ${url} 페이지의 추출된 내용입니다:\n\n` +
        dp.markdown +
        `\n\n---\n\n질문: ${question}\n\n위 내용만을 근거로 답하세요. 내용에 없으면 솔직히 "해당 정보 없음"으로 답하세요.`,
    }],
  });
  const inferMs = Date.now() - t1;

  const answer = resp.content[0]?.type === 'text' ? resp.content[0].text : '';
  return {
    answer,
    dpTokens: dp.refinedTokens,
    bm25Confidence: dp.bm25Confidence,
    fetchParseMs,
    inferMs,
    totalMs: Date.now() - t0,
    inputTokens: resp.usage?.input_tokens ?? 0,
  };
}

// ── WebFetch 경로: 단일 Claude 호출 (fetch + 추론 포함) ─────────────────────────
async function runWebFetchPath(url, question) {
  const t0 = Date.now();
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', allowed_callers: ['direct'] }],
    tool_choice: { type: 'any' },
    system:
      'You are a helpful assistant. Fetch the given URL with web_fetch, then answer the user question ' +
      'based ONLY on the fetched content. If the answer is not in the content, say so.',
    messages: [{ role: 'user', content: `URL: ${url}\n\n질문: ${question}` }],
  });
  const totalMs = Date.now() - t0;

  const answer = resp.content.find(b => b.type === 'text')?.text ?? '';
  const fetched = resp.content.some(b => b.type === 'web_fetch_tool_result');
  const wfTokens = Math.max(0, (resp.usage?.input_tokens ?? 0) - 30); // 오버헤드 제외

  return { answer, totalMs, wfTokens, fetched, inputTokens: resp.usage?.input_tokens ?? 0 };
}

// ── Claude 판정 (품질 평가) ────────────────────────────────────────────────────
async function judge(question, answer, mustContain, expectNoInfo) {
  const judgePrompt = expectNoInfo
    ? `질문: "${question}"\n답변: "${answer}"\n\n답변이 "정보가 없다"고 올바르게 인정하나요?\nJSON: {"pass": true/false, "reason": "한 줄"}`
    : `질문: "${question}"\n기대 핵심 개념: ${mustContain.join(', ')}\n답변: "${answer}"\n\n답변이 질문에 실질적으로 답하고 핵심 개념을 다루나요? (언어 무관)\nJSON: {"pass": true/false, "reason": "한 줄"}`;

  const judgeResp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    messages: [{ role: 'user', content: judgePrompt }],
  });
  const text = judgeResp.content[0]?.type === 'text' ? judgeResp.content[0].text : '{}';
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return { pass: !!j.pass, reason: j.reason ?? '판정 불가' };
  } catch {
    return { pass: false, reason: '판정 파싱 실패' };
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
console.log('\n🧪  DomPruner vs WebFetch — 품질 + 응답 속도 비교\n');
console.log('DomPruner: runPipeline (fetch+parse) + Haiku 추론');
console.log('WebFetch:  web_fetch server tool 포함 단일 Haiku 호출 (fetch+추론 합산)\n');

const results = [];

for (const tc of CASES) {
  console.log(`  [${ tc.category}] ${tc.label}`);

  let dp, wf, dpJudge, wfJudge;

  // DomPruner 경로
  try {
    dp = await runDomPrunerPath(tc.url, tc.query, tc.question);
    dpJudge = await judge(tc.question, dp.answer, tc.mustContain, tc.expectNoInfo);
  } catch (e) {
    console.log(`    DP ❌ 오류: ${e.message}\n`);
    dp = { totalMs: 0, dpTokens: 0, fetchParseMs: 0, inferMs: 0, answer: '' };
    dpJudge = { pass: false, reason: e.message };
  }

  // WebFetch 경로
  try {
    wf = await runWebFetchPath(tc.url, tc.question);
    wfJudge = await judge(tc.question, wf.answer, tc.mustContain, tc.expectNoInfo);
  } catch (e) {
    console.log(`    WF ❌ 오류: ${e.message}\n`);
    wf = { totalMs: 0, wfTokens: 0, answer: '' };
    wfJudge = { pass: false, reason: e.message };
  }

  const mode = dp.bm25Confidence === 0 ? 'full†' : 'BM25';
  const dpIcon = dpJudge.pass ? '✅' : '❌';
  const wfIcon = wfJudge.pass ? '✅' : '❌';
  const speedDiff = wf.totalMs > 0
    ? (wf.totalMs > dp.totalMs
        ? `DP ${wf.totalMs - dp.totalMs}ms 빠름`
        : `WF ${dp.totalMs - wf.totalMs}ms 빠름`)
    : '';

  console.log(`    DomPruner: ${dp.dpTokens} tok [${mode}]  fetch+parse ${dp.fetchParseMs}ms + 추론 ${dp.inferMs}ms = ${dp.totalMs}ms  ${dpIcon}`);
  console.log(`    WebFetch:  ${wf.wfTokens} tok (컨텍스트)                          합산 ${wf.totalMs}ms  ${wfIcon}   ← ${speedDiff}`);
  if (!dpJudge.pass) console.log(`    DP 실패: ${dpJudge.reason}`);
  if (!wfJudge.pass) console.log(`    WF 실패: ${wfJudge.reason}`);
  console.log('');

  results.push({
    label: tc.label,
    category: tc.category,
    dpTokens: dp.dpTokens,
    wfTokens: wf.wfTokens,
    mode,
    dpMs: dp.totalMs,
    wfMs: wf.totalMs,
    dpPass: dpJudge.pass,
    wfPass: wfJudge.pass,
    dpFetchMs: dp.fetchParseMs,
    dpInferMs: dp.inferMs,
  });
}

// ── 결과 요약 ──────────────────────────────────────────────────────────────────
const dpPassed = results.filter(r => r.dpPass).length;
const wfPassed = results.filter(r => r.wfPass).length;
const total    = results.length;

const avgDpMs  = Math.round(results.reduce((s, r) => s + r.dpMs, 0) / total);
const avgWfMs  = Math.round(results.reduce((s, r) => s + r.wfMs, 0) / total);
const avgDpTok = Math.round(results.reduce((s, r) => s + r.dpTokens, 0) / total);
const avgWfTok = Math.round(results.reduce((s, r) => s + r.wfTokens, 0) / total);

console.log('━'.repeat(72));
console.log(`\n📊  최종 결과\n`);
console.log(`${''.padEnd(20)} ${'품질'.padStart(6)} ${'컨텍스트'.padStart(10)} ${'응답시간'.padStart(10)}`);
console.log(`${'DomPruner'.padEnd(20)} ${`${dpPassed}/${total}`.padStart(6)} ${`~${avgDpTok} tok`.padStart(10)} ${`${avgDpMs}ms`.padStart(10)}`);
console.log(`${'WebFetch'.padEnd(20)} ${`${wfPassed}/${total}`.padStart(6)} ${`~${avgWfTok} tok`.padStart(10)} ${`${avgWfMs}ms`.padStart(10)}`);
console.log('');

console.log(`${'카테고리'.padEnd(20)} ${'DP tok'.padStart(7)} ${'WF tok'.padStart(7)} ${'DP ms'.padStart(7)} ${'WF ms'.padStart(7)}  품질(DP/WF)`);
console.log('-'.repeat(72));
for (const r of results) {
  const q = `${r.dpPass ? '✅' : '❌'}/${r.wfPass ? '✅' : '❌'}`;
  const faster = r.dpMs < r.wfMs ? '⚡DP' : '⚡WF';
  console.log(
    `${r.category.padEnd(20)} ${String(r.dpTokens).padStart(7)} ${String(r.wfTokens).padStart(7)} ` +
    `${String(r.dpMs).padStart(7)} ${String(r.wfMs).padStart(7)}  ${q}  ${faster}`
  );
}
console.log('');
console.log('† BM25 미매칭 → 전체 DomPruner 출력 자동 전환');
