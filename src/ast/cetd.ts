/**
 * Layer 3: In-house CETD Engine (Content Extraction via Text Density)
 *
 * 외부 라이브러리 없이 parse5 DOM AST 위에서 텍스트 밀도 기반으로
 * 최고 점수 컨테이너 노드를 선택해 본문을 추출한다.
 *
 * score = (textLen / tagCount) × (1 - linkLen / textLen)
 *
 * Layer 2(heading-cluster) 조건 미달인 일반 뉴스, 커뮤니티, 위키 페이지에서 구동.
 */

import { isElement, isText, walkNodes } from './parser.js';
import type { P5Node, P5Element } from './parser.js';
import type { FQNNode } from './fqn-router.js';
import { isNoiseByAttribute } from '../rules.js';

// 컨테이너 후보로 평가할 태그
const CONTAINER_TAGS = new Set([
  'article', 'main', 'section', 'div', 'td',
]);

// 인라인 태그 (태그 카운트 가중치 낮춤)
const INLINE_TAGS = new Set([
  'a', 'strong', 'em', 'b', 'i', 'code', 'span', 'small',
]);

// 콘텐츠로 직렬화할 블록 태그
const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'pre', 'code', 'blockquote', 'td', 'th',
]);

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

interface ContainerScore {
  node: P5Element;
  textLen: number;
  tagCount: number;
  linkLen: number;
  depth: number;
  score: number;
}

function getTextLength(node: P5Node): number {
  let len = 0;
  walkNodes(node, n => {
    if (isText(n)) len += n.value.trim().length;
  });
  return len;
}

function getLinkTextLength(node: P5Node): number {
  let len = 0;
  walkNodes(node, n => {
    if (isElement(n) && n.nodeName === 'a') {
      len += getTextLength(n);
      return false; // a 내부 재귀 불필요
    }
  });
  return len;
}

function getTagCount(node: P5Node): number {
  let count = 0;
  walkNodes(node, n => {
    if (isElement(n)) {
      // 인라인 태그는 절반 가중치
      count += INLINE_TAGS.has(n.nodeName) ? 0.5 : 1;
    }
  });
  return Math.max(count, 1);
}

function scoreContainer(node: P5Element, depth: number): ContainerScore {
  const textLen = getTextLength(node);
  const tagCount = getTagCount(node);
  const linkLen = getLinkTextLength(node);
  const density = textLen / tagCount;
  const linkRatio = textLen > 0 ? linkLen / textLen : 1;
  // depth 페널티: 너무 깊은 컨테이너(사이드바/광고) 억제
  const depthPenalty = Math.max(0, 1 - depth * 0.04);
  const score = density * (1 - linkRatio) * depthPenalty;
  return { node, textLen, tagCount, linkLen, depth, score };
}

function extractBlockNodes(node: P5Node, results: FQNNode[], depth = 0): void {
  walkNodes(node, (n, d) => {
    if (!isElement(n)) return;
    const tag = n.nodeName;
    if (isNoiseByAttribute(n)) return false;
    if (BLOCK_TAGS.has(tag)) {
      const text = getTextLength(n) > 0
        ? (() => {
            const parts: string[] = [];
            walkNodes(n, t => { if (isText(t)) parts.push(t.value); });
            return parts.join('').replace(/\s+/g, ' ').trim();
          })()
        : '';
      if (text.length >= (HEADING_TAGS.has(tag) ? 2 : 10)) {
        results.push({ tag, text, depth: depth + d });
      }
      return false; // 블록 내부 재귀 생략 (중복 방지)
    }
  });
}

export function cetdExtract(doc: P5Node): FQNNode[] {
  const candidates: ContainerScore[] = [];

  walkNodes(doc, (node, depth) => {
    if (!isElement(node)) return;
    if (!CONTAINER_TAGS.has(node.nodeName)) return;
    if (isNoiseByAttribute(node)) return false;

    const textLen = getTextLength(node);
    if (textLen < 200) return; // 너무 짧은 컨테이너 제외

    candidates.push(scoreContainer(node, depth));
  });

  if (candidates.length === 0) return [];

  // 최고 점수 컨테이너 선택
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  const results: FQNNode[] = [];
  extractBlockNodes(best.node, results);
  return results;
}
