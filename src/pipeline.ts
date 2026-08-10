import { fetchPage } from './ast/fetcher.js';
import { parseHtml } from './ast/parser.js';
import { extractContent } from './ast/core-extractor.js';
import { extractAnchors, type SemanticAnchors } from './ast/anchor.js';
import { extractSsgMarkdown } from './ast/ssg-extractor.js';
import { serialize, estimateTokens } from './middleware/serializer.js';
import { resolveRules, applyRules, type AstRAGRule } from './rule-engine/registry.js';
import { createSectionBm25Rule, tokenize, bm25Score } from './rule-engine/builtin/section-bm25.js';

export interface PipelineOptions {
  rules?: (AstRAGRule | string)[];
  query?: string;
}

export interface PipelineResult {
  url: string;
  renderType: string;
  markdown: string;
  anchors: SemanticAnchors;
  originalTokens: number;
  refinedTokens: number;
  reductionRatio: number;
  fetchMs: number;
  parseMs: number;
  totalMs: number;
  appliedRules: string[];
  cached?: boolean;
  /**
   * BM25 최고 점수. query 없으면 undefined.
   * 0 = 쿼리 용어가 문서 어디에도 없음 → 자동으로 전체 DomPruner 출력 반환.
   */
  bm25Confidence?: number;
}

// ── SSG 마크다운 BM25 섹션 필터 ──────────────────────────────────────────────
function filterSsgByQuery(markdown: string, query: string, budget = 1_200): string {
  const queryTerms = tokenize(query);
  if (!queryTerms.length) return markdown;

  // 헤딩(##/###/####) 기준으로 섹션 분리
  const lines = markdown.split('\n');
  const sections: { heading: string; body: string[]; tokens: number }[] = [];
  let cur = { heading: '', body: [] as string[], tokens: 0 };

  for (const line of lines) {
    if (/^#{1,4} /.test(line)) {
      if (cur.heading || cur.body.length) sections.push(cur);
      cur = { heading: line, body: [], tokens: estimateTokens(line) };
    } else {
      cur.body.push(line);
      cur.tokens += estimateTokens(line);
    }
  }
  if (cur.heading || cur.body.length) sections.push(cur);

  if (sections.length <= 2) return markdown;

  const totalTokens = sections.reduce((s, sec) => s + sec.tokens, 0);
  if (totalTokens <= budget) return markdown;

  const avgLen = sections.reduce((s, sec) =>
    s + tokenize(sec.heading + ' ' + sec.body.join(' ')).length, 0) / sections.length;

  const scored = sections.map(sec => {
    const headingTokens = tokenize(sec.heading);
    const bodyTokens    = tokenize(sec.body.join(' '));
    const headingScore  = bm25Score(queryTerms, headingTokens, avgLen) * 2.5;
    const bodyScore     = bm25Score(queryTerms, bodyTokens, avgLen);
    return { sec, score: headingScore + bodyScore };
  });

  scored.sort((a, b) => b.score - a.score);

  const picked: typeof sections = [];
  let remaining = budget;
  for (const { sec } of scored) {
    if (remaining <= 0 && picked.length >= 2) break;
    picked.push(sec);
    remaining -= sec.tokens;
  }

  // 원문 순서 복원
  const pickedSet = new Set(picked);
  return sections
    .filter(s => pickedSet.has(s))
    .map(s => [s.heading, ...s.body].join('\n'))
    .join('\n\n')
    .trim();
}

// ── URL 결과 캐시 (TTL: 5분) ──────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1_000;
const resultCache = new Map<string, { result: PipelineResult; expiresAt: number }>();

export function getCacheStats() {
  const now = Date.now();
  const alive = [...resultCache.values()].filter(e => e.expiresAt > now).length;
  return { total: resultCache.size, alive };
}

export function clearCache() {
  resultCache.clear();
}

export async function runPipeline(
  url: string,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  // URL 자동 매핑 + 명시적 rule 목록
  const baseRules = resolveRules(url, options.rules ?? []);

  // BM25는 반드시 presentation rule(http-endpoint 등) 앞에 실행해야
  // 문서 원래 순서로 섹션을 그룹화한 뒤, 선택된 섹션에 재배치 rule이 적용된다.
  const bm25Rule = options.query ? createSectionBm25Rule(options.query) : null;
  const rules = bm25Rule ? [bm25Rule, ...baseRules] : baseRules;

  // 캐시 키: URL + query + rule 이름
  const cacheKey = [url, options.query ?? '', ...rules.map(r => r.name)].join('::');
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, cached: true, fetchMs: 0, parseMs: 0, totalMs: 0 };
  }

  const t0 = performance.now();

  const fetched = await fetchPage(url);
  const fetchMs = performance.now() - t0;

  const t1 = performance.now();

  let result: PipelineResult;

  if (fetched.renderType === 'SSG' && fetched.ssgPayload) {
    const ssgExtracted = extractSsgMarkdown(fetched.ssgPayload);
    const originalTokens = estimateTokens(fetched.html);
    const parseMs = performance.now() - t1;

    if (ssgExtracted) {
      const markdown = options.query
        ? filterSsgByQuery(ssgExtracted.markdown, options.query)
        : ssgExtracted.markdown;
      const refinedTokens = estimateTokens(markdown);
      result = {
        url: fetched.url,
        renderType: fetched.renderType,
        markdown,
        anchors: ssgExtracted.anchors,
        originalTokens,
        refinedTokens,
        reductionRatio: 1 - refinedTokens / originalTokens,
        fetchMs,
        parseMs,
        totalMs: performance.now() - t0,
        appliedRules: options.query ? ['section-bm25-ssg'] : [],
      };
    } else {
      // Fallback: JSON 덤프 (구조 파악 불가 시)
      const ssgText = JSON.stringify(fetched.ssgPayload, null, 0);
      const refinedTokens = estimateTokens(ssgText);
      result = {
        url: fetched.url,
        renderType: fetched.renderType,
        markdown: '```json\n' + ssgText + '\n```',
        anchors: { title: '', anchors: [], metaDesc: '' },
        originalTokens,
        refinedTokens,
        reductionRatio: 1 - refinedTokens / originalTokens,
        fetchMs,
        parseMs,
        totalMs: performance.now() - t0,
        appliedRules: [],
      };
    }
  } else {
    // SSR / CSR 경로: DOM AST 파이프라인
    const doc    = parseHtml(fetched.html);
    const ctx    = { url, html: fetched.html, renderType: fetched.renderType };
    const rawNodes = extractContent(doc);              // ← Layer 1→2→3
    const nodes  = applyRules(rawNodes, ctx, rules);   // ← Rule 체인 적용

    // BM25 confidence 캡처 — transform 실행 후에 점수가 확정됨
    const bm25Confidence = bm25Rule?.getLastConfidence();

    // maxScore === 0: 쿼리 용어가 문서 어디에도 없음 → BM25 필터 없는 전체 DomPruner 출력
    // threshold 없음 — 0은 유일하게 임의성 없는 "완전 미스" 신호
    const outputNodes = (bm25Confidence === 0)
      ? applyRules(rawNodes, ctx, baseRules)
      : nodes;
    const anchors = extractAnchors(outputNodes, fetched.html);

    // Rule이 custom serializer를 제공하면 우선 사용
    const customSerializer = rules.findLast(r => r.serialize);
    const { markdown, originalTokens, refinedTokens, reductionRatio } =
      customSerializer
        ? (() => {
            const md = customSerializer.serialize!(outputNodes, anchors, ctx);
            const orig = estimateTokens(fetched.html);
            const ref  = estimateTokens(md);
            return { markdown: md, originalTokens: orig, refinedTokens: ref, reductionRatio: 1 - ref / orig };
          })()
        : serialize(outputNodes, anchors, fetched.html);

    const parseMs = performance.now() - t1;

    result = {
      url: fetched.url,
      renderType: fetched.renderType,
      markdown,
      anchors,
      originalTokens,
      refinedTokens,
      reductionRatio,
      fetchMs,
      parseMs,
      totalMs: performance.now() - t0,
      appliedRules: rules.map(r => r.name),
      bm25Confidence,
    };
  }

  // 캐시 저장
  resultCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  return result;
}
