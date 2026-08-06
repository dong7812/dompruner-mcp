/**
 * Core Content Extractor — Layer 1 → 2 → 3 오케스트레이터
 *
 * Layer 1: FQN Router (routeContentNodes) — 표준 DOM 추출
 * Layer 2: Heading-Block Clustering     — 개발 문서 / 기술 블로그 특화
 * Layer 3: CETD Engine                  — 일반 뉴스 / 커뮤니티 / Wikipedia
 *
 * 각 레이어는 Coverage 기준 미달 시 다음 레이어로 fallback.
 * 외부 라이브러리 없이 parse5 AST만 사용한다.
 */

import { type DefaultTreeAdapterMap } from 'parse5';
import { routeContentNodes, type FQNNode } from './fqn-router.js';
import { clusterByHeadings } from './heading-cluster.js';
import { cetdExtract } from './cetd.js';

/** 충분한 콘텐츠로 판단할 기준: 노드 ≥ 4 AND 총 텍스트 ≥ 300자 */
function hasCoverage(nodes: FQNNode[]): boolean {
  if (nodes.length < 4) return false;
  return nodes.reduce((s, n) => s + n.text.length, 0) >= 300;
}

export function extractContent(
  doc: DefaultTreeAdapterMap['document'],
): FQNNode[] {
  // Layer 1: FQN Router — NOISE_TAGS 기반 subtree prune + content 추출
  const layer1 = routeContentNodes(doc);
  if (hasCoverage(layer1)) return layer1;

  // Layer 2: Heading-Block Clustering — H2-H4 앵커 + link density 검증
  const layer2 = clusterByHeadings(doc);
  if (layer2 !== null && hasCoverage(layer2)) return layer2;

  // Layer 3: CETD — 텍스트 밀도 기반 최고 컨테이너 선택
  const layer3 = cetdExtract(doc);
  if (layer3.length > 0) return layer3;

  // 최종 fallback: Layer 1 결과 (노드가 적어도 반환)
  return layer1.length > 0 ? layer1 : (layer2 ?? []);
}
