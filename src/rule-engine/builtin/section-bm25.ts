import type { AstRAGRule, RuleContext } from '../types.js';
import type { FQNNode } from '../../ast/fqn-router.js';
import { estimateTokens } from '../../middleware/serializer.js';

/**
 * section-bm25 rule
 *
 * FQNNode[]를 헤딩 기준 Section으로 그룹화한 뒤 BM25로 스코어링,
 * 토큰 예산 안에서 관련성 높은 섹션만 선택한다.
 *
 * - 토큰 예산 기반 선택: 예산(기본 1,200 tok) 소진까지 상위 섹션 포함
 * - 헤딩 필드 boost (기본 2.5×): 쿼리 키워드가 헤딩에 있으면 높은 점수 부여
 * - 최소 섹션 보장 (기본 2개): 짧은 문서에서도 최소한의 내용 유지
 * - 언어 무관 토크나이저: 영문·한글·숫자 모두 처리
 * - depth 기반 가중치: DOM에서 얕은(shallow) 섹션일수록 높은 점수 — 사이드바·중첩 광고 억제
 */

// ── BM25 파라미터 ─────────────────────────────────────────────────────────────
const K1 = 1.5;
const B  = 0.75;

export interface SectionBm25Options {
  /** 선택할 최대 토큰 수 (기본: 1,200) */
  tokenBudget?: number;
  /** 헤딩 필드 가중치 배율 (기본: 2.5) */
  headingBoost?: number;
  /** 최소 포함 섹션 수 (기본: 2) */
  minSections?: number;
  /**
   * DOM depth 페널티 강도 (기본: 0.4)
   * 0 = depth 무시, 1 = 가장 깊은 섹션 점수 0
   * 범위 내 선형 감쇠: score × (1 - decay × normalizedDepth)
   */
  depthDecay?: number;
  /**
   * budget 채우기 전에 먼저 확보할 heading 섹션 수 (기본: 2)
   * query 관련성 있는 heading 섹션을 우선 선택한 뒤 나머지 budget을 body로 채운다.
   */
  minHeadingSections?: number;
  /**
   * Document Skeleton TOC 삽입 여부 (기본: true)
   * H1-H3 헤딩 목록을 100-150 tok 고정 예산으로 결과 앞에 삽입한다.
   * 선택된 섹션의 상위 헤딩(ancestor)도 항상 포함한다.
   */
  preserveStructure?: boolean;
  /** TOC 최대 토큰 예산 (기본: 120) */
  tocBudget?: number;
}

interface Section {
  heading: FQNNode | null;
  nodes: FQNNode[];
  tokenCount: number;
  /** 섹션의 기준 depth: heading.depth 또는 body 노드 최소 depth */
  anchorDepth: number;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s\p{P}\p{S}]+/u).filter(t => t.length >= 2);
}

export function bm25Score(
  queryTerms: string[],
  docTokens: string[],
  avgDocLen: number,
): number {
  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const docLen = docTokens.length;

  return queryTerms.reduce((score, term) => {
    const f = tf.get(term) ?? 0;
    if (f === 0) return score;
    const idf = Math.log(1 + 1 / (0.5 + f));
    const num = f * (K1 + 1);
    const den = f + K1 * (1 - B + B * (docLen / avgDocLen));
    return score + idf * (num / den);
  }, 0);
}

function headingLevel(tag: string): number {
  const n = parseInt(tag[1] ?? '6', 10);
  return isNaN(n) ? 6 : n;
}

/**
 * Document Skeleton: 전체 섹션에서 H1-H2 헤딩을 실제 FQNNode로 추출.
 * text `<p>` 블록이 아닌 실제 heading 노드를 반환하므로,
 * 헤딩 보존율 지표와 serializer 모두에서 올바르게 인식된다.
 */
function buildDocSkeleton(sections: Section[], maxTokBudget: number): FQNNode[] {
  const nodes: FQNNode[] = [];
  let used = 0;
  for (const s of sections) {
    if (!s.heading) continue;
    const lv = headingLevel(s.heading.tag);
    if (lv > 2) continue; // H1-H2만 골격으로 포함
    const cost = estimateTokens(s.heading.text);
    if (used + cost > maxTokBudget) break;
    nodes.push(s.heading);
    used += cost;
  }
  return nodes;
}

/**
 * 각 섹션 인덱스에 대한 조상(ancestor) 섹션 인덱스 목록을 반환한다.
 * 헤딩 레벨 기준: H1 > H2 > H3 > H4 > H5
 */
function buildAncestorMap(sections: Section[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  const stack: { level: number; idx: number }[] = [];

  sections.forEach((s, i) => {
    const lv = s.heading ? headingLevel(s.heading.tag) : 99;
    while (stack.length > 0 && stack[stack.length - 1].level >= lv) stack.pop();
    result.set(i, stack.map(h => h.idx));
    if (s.heading) stack.push({ level: lv, idx: i });
  });

  return result;
}

function groupSections(nodes: FQNNode[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: null, nodes: [], tokenCount: 0, anchorDepth: Infinity };

  for (const node of nodes) {
    if (['h1', 'h2', 'h3', 'h4', 'h5'].includes(node.tag)) {
      if (current.nodes.length > 0 || current.heading) sections.push(current);
      current = { heading: node, nodes: [], tokenCount: estimateTokens(node.text), anchorDepth: node.depth };
    } else {
      current.nodes.push(node);
      current.tokenCount += estimateTokens(node.text);
      // heading 없는 섹션은 body 노드 최소 depth를 anchor로 사용
      if (node.depth < current.anchorDepth) current.anchorDepth = node.depth;
    }
  }
  if (current.nodes.length > 0 || current.heading) sections.push(current);
  return sections;
}

export interface SectionBm25Rule extends AstRAGRule {
  /**
   * transform 실행 후 전체 섹션 중 최고 BM25 점수.
   * 0 = 쿼리 용어가 문서 어디에도 없음 (완전 미스, 유일하게 threshold-free한 신호)
   * > 0 = 일부 매칭 (절대값 — 문서 간 비교 불가)
   */
  getLastConfidence(): number;
}

export function createSectionBm25Rule(
  query: string,
  options: SectionBm25Options = {},
): SectionBm25Rule {
  let _lastMaxScore = 0;

  const {
    tokenBudget        = 1_200,
    headingBoost       = 2.5,
    minSections        = 2,
    depthDecay         = 0.4,
    minHeadingSections = 2,
    preserveStructure  = true,
    tocBudget          = 120,
  } = options;

  return {
    name: 'section-bm25',
    description: `BM25 section ranking (budget: ${tokenBudget} tok, boost: ${headingBoost}×, depth: ${depthDecay})`,
    getLastConfidence: () => _lastMaxScore,

    transform(nodes: FQNNode[], _ctx: RuleContext): FQNNode[] {
      if (!query.trim()) return nodes;

      const sections = groupSections(nodes);
      if (sections.length <= minSections) return nodes;

      // 전체 콘텐츠가 이미 budget 이하면 선택 불필요
      const totalTokens = sections.reduce((s, sec) => s + sec.tokenCount, 0);
      if (totalTokens <= tokenBudget) return nodes;

      const queryTerms = tokenize(query);
      if (queryTerms.length === 0) return nodes;

      // 섹션별 BM25 스코어 계산 (heading boost 포함)
      const bodyTexts    = sections.map(s => tokenize(s.nodes.map(n => n.text).join(' ')));
      const headingTexts = sections.map(s => tokenize(s.heading?.text ?? ''));
      const avgBodyLen   = bodyTexts.reduce((a, t) => a + t.length, 0) / sections.length;
      const avgHeadLen   = Math.max(
        1,
        headingTexts.reduce((a, t) => a + t.length, 0) / sections.length,
      );

      // depth 가중치: 얕은 섹션(anchorDepth 작음) = 1.0, 깊은 섹션 = (1 - depthDecay)
      const depths    = sections.map(s => s.anchorDepth === Infinity ? 0 : s.anchorDepth);
      const minDepth  = Math.min(...depths);
      const depthRange = Math.max(1, Math.max(...depths) - minDepth);
      const sectionDepthWeight = (i: number) =>
        1 - depthDecay * ((depths[i] - minDepth) / depthRange);

      // body 기여에만 depth 패널티 적용 — heading 기여는 DOM 깊이와 무관하게 보존
      const scored = sections.map((section, i) => ({
        section,
        i,
        score:
          bm25Score(queryTerms, bodyTexts[i], avgBodyLen) * sectionDepthWeight(i) +
          headingBoost * bm25Score(queryTerms, headingTexts[i], avgHeadLen),
      }));

      // BM25 내림차순 정렬 + confidence 캡처
      const byScore = [...scored].sort((a, b) => b.score - a.score);
      _lastMaxScore = byScore[0]?.score ?? 0;

      // ── 두 단계 선택 ──────────────────────────────────────────────────────────
      // Phase 1: heading 섹션 우선 확보 (query 관련성 있는 것 중 상위 minHeadingSections)
      // Phase 2: 남은 budget을 BM25 전체 순위로 채움
      const headingPriority = byScore
        .filter(s => s.section.heading !== null && s.score > 0)
        .slice(0, minHeadingSections)
        .map(s => s.i);
      const headingSet = new Set(headingPriority);

      // 최종 순서: 확보된 heading 먼저, 나머지 BM25 순
      const ranked = [
        ...byScore.filter(s => headingSet.has(s.i)),
        ...byScore.filter(s => !headingSet.has(s.i)),
      ];

      const selectedIndices = new Set<number>();
      let usedTokens = 0;

      for (const { i, section } of ranked) {
        const isMin = selectedIndices.size < minSections;
        if (usedTokens + section.tokenCount > tokenBudget && !isMin) break;
        selectedIndices.add(i);
        usedTokens += section.tokenCount;
        if (usedTokens >= tokenBudget && selectedIndices.size >= minSections) break;
      }

      // 선택된 섹션의 조상 헤딩도 포함 (Ancestor Preservation)
      if (preserveStructure && selectedIndices.size > 0) {
        const ancestorMap = buildAncestorMap(sections);
        for (const idx of [...selectedIndices]) {
          const ancestors = ancestorMap.get(idx) ?? [];
          for (const a of ancestors) selectedIndices.add(a);
        }
      }

      // 원래 문서 순서 복원
      const result: FQNNode[] = [];
      sections.forEach((section, i) => {
        if (!selectedIndices.has(i)) return;
        if (section.heading) result.push(section.heading);
        result.push(...section.nodes);
      });

      // Document Skeleton 삽입 (preserveStructure 활성화 시)
      // 전체 문서의 H1-H2를 실제 heading FQNNode로 추출해 결과 앞에 prepend.
      // 이미 result에 있는 헤딩은 중복 제거 후 추가한다.
      if (preserveStructure) {
        const skeleton = buildDocSkeleton(sections, tocBudget);
        if (skeleton.length > 0) {
          const inResult = new Set(result.map(n => n.text));
          const missing = skeleton.filter(n => !inResult.has(n.text));
          if (missing.length > 0) return [...missing, ...result];
        }
      }

      return result;
    },
  };
}
