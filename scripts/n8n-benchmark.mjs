/**
 * n8n DomPruner 비교 벤치마크
 *
 * n8n 포럼 시나리오: 뉴스 기사를 AI가 요약하는 워크플로우에서
 * HTML 전달 방식에 따른 토큰/비용 차이를 측정합니다.
 *
 * 3가지 방식 비교:
 *   ① Raw HTTP   — HTTP Request 노드 원본 HTML 그대로
 *   ② HTML 노드  — n8n HTML 노드 방식 (태그 제거, 텍스트만)
 *   ③ DomPruner  — /api/refine 엔드포인트
 *
 * 사용법:
 *   node scripts/n8n-benchmark.mjs
 *   node scripts/n8n-benchmark.mjs --endpoint http://localhost:3000/api/refine
 */

import https from 'https';
import http from 'http';

// ── 테스트 기사 목록 ───────────────────────────────────────────────────────────
const ARTICLES = [
  { url: 'https://techcrunch.com/2024/01/15/openai-sam-altman/',         query: 'OpenAI Sam Altman' },
  { url: 'https://www.theverge.com/2024/1/18/24042038/apple-vision-pro', query: 'Apple Vision Pro release' },
  { url: 'https://arstechnica.com/ai/2024/01/gemini-ultra/',             query: 'Google Gemini Ultra' },
  { url: 'https://www.wired.com/story/crypto-2024-predictions/',         query: 'crypto predictions 2024' },
  { url: 'https://www.bbc.com/news/technology-68023346',                 query: 'AI regulation news' },
];

// ── 비용 상수 (Claude Haiku 기준, 2024) ───────────────────────────────────────
const COST_PER_1M_INPUT_TOKENS = 0.25; // USD
const KRW_PER_USD = 1350;
const DAILY_RUNS  = 1000;
const DAYS        = 30;

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function stripHtmlTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const REQUEST_TIMEOUT_MS = 30_000;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; benchmark/1.0)' }, timeout: REQUEST_TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error(`fetch timed out: ${url}`)));
    req.on('error', reject);
  });
}

function callRefineEndpoint(endpoint, html, query, url) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ html, query, url });
    const parsed = new URL(endpoint);
    const isHttps = parsed.protocol === 'https:';
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = (isHttps ? https : http).request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (data.error) return reject(new Error(data.error));
          resolve(data);
        } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('refine endpoint timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function krw(usd) {
  return `₩${Math.round(usd * KRW_PER_USD).toLocaleString()}`;
}

function monthlyCost(tokens) {
  const costUsd = (tokens / 1_000_000) * COST_PER_1M_INPUT_TOKENS * DAILY_RUNS * DAYS;
  return krw(costUsd);
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
const endpoint = process.argv.includes('--endpoint')
  ? process.argv[process.argv.indexOf('--endpoint') + 1]
  : 'https://dompruner-mcp.vercel.app/api/refine';

console.log(`\nDomPruner n8n 비교 벤치마크`);
console.log(`엔드포인트: ${endpoint}`);
console.log(`기사 수: ${ARTICLES.length} | 일 실행: ${DAILY_RUNS.toLocaleString()}회 | 비용 기준: Claude Haiku\n`);

const rows = [];

for (const article of ARTICLES) {
  process.stdout.write(`  Fetching ${article.url} ... `);
  let html;
  try {
    html = await fetchUrl(article.url);
    process.stdout.write(`${html.length.toLocaleString()}자\n`);
  } catch (e) {
    process.stdout.write(`실패 (${e.message})\n`);
    continue;
  }

  const stripped = stripHtmlTags(html);
  let domprunerResult;
  try {
    domprunerResult = await callRefineEndpoint(endpoint, html, article.query, article.url);
  } catch (e) {
    console.error(`  DomPruner 오류: ${e.message}`);
    continue;
  }

  rows.push({
    url: new URL(article.url).hostname.replace('www.', ''),
    raw:       html.length,
    htmlNode:  stripped.length,
    dompruner: domprunerResult.refinedChars,
    dpTokens:  domprunerResult.estimatedTokens,
  });
}

if (rows.length === 0) {
  console.log('측정된 기사가 없습니다.');
  process.exit(1);
}

// ── 결과 출력 ─────────────────────────────────────────────────────────────────
const avgRaw       = Math.round(rows.reduce((s, r) => s + r.raw, 0) / rows.length);
const avgHtmlNode  = Math.round(rows.reduce((s, r) => s + r.htmlNode, 0) / rows.length);
const avgDomPruner = Math.round(rows.reduce((s, r) => s + r.dompruner, 0) / rows.length);
const avgDpTokens  = Math.round(rows.reduce((s, r) => s + r.dpTokens, 0) / rows.length);

const rawTokensAvg      = Math.round(avgRaw / 4);
const htmlNodeTokensAvg = Math.round(avgHtmlNode / 4);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`${'지표'.padEnd(24)} ${'① Raw HTML'.padStart(14)} ${'② HTML 노드'.padStart(14)} ${'③ DomPruner'.padStart(14)}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`${'기사 1개 평균 글자 수'.padEnd(24)} ${String(avgRaw.toLocaleString()).padStart(14)} ${String(avgHtmlNode.toLocaleString()).padStart(14)} ${String(avgDomPruner.toLocaleString()).padStart(14)}`);
console.log(`${'추정 토큰 수'.padEnd(24)} ${String(rawTokensAvg.toLocaleString()).padStart(14)} ${String(htmlNodeTokensAvg.toLocaleString()).padStart(14)} ${String(avgDpTokens.toLocaleString()).padStart(14)}`);
console.log(`${'실행 1회 비용'.padEnd(24)} ${String(krw((rawTokensAvg / 1_000_000) * COST_PER_1M_INPUT_TOKENS * KRW_PER_USD)).padStart(14)} ${String(krw((htmlNodeTokensAvg / 1_000_000) * COST_PER_1M_INPUT_TOKENS * KRW_PER_USD)).padStart(14)} ${String(krw((avgDpTokens / 1_000_000) * COST_PER_1M_INPUT_TOKENS * KRW_PER_USD)).padStart(14)}`);
console.log(`${'하루 1,000회 × 30일'.padEnd(24)} ${monthlyCost(rawTokensAvg).padStart(14)} ${monthlyCost(htmlNodeTokensAvg).padStart(14)} ${monthlyCost(avgDpTokens).padStart(14)}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('개별 기사:');
for (const r of rows) {
  const reduction = ((1 - r.dompruner / r.raw) * 100).toFixed(1);
  console.log(`  ${r.url.padEnd(35)} Raw:${String(r.raw.toLocaleString()).padStart(8)}자  HTML노드:${String(r.htmlNode.toLocaleString()).padStart(8)}자  DomPruner:${String(r.dompruner.toLocaleString()).padStart(7)}자  절감:${reduction}%`);
}
console.log('');
