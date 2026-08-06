/**
 * Layer 2: Heading-Block Clustering
 *
 * 개발 문서 / 기술 블로그 특화 추출기.
 * H2-H4 헤딩을 Anchor 삼아 직후 블록들을 Cluster로 묶고,
 * link density < 0.3 클러스터만 콘텐츠로 확정한다.
 *
 * 적용 조건: H2-H4 ≥ 2개 AND 헤딩당 평균 텍스트 ≥ 400자
 * 조건 불충족 시 null 반환 → Layer 3(CETD)로 fallback
 */

import { isElement, isText, walkNodes } from './parser.js';
import type { P5Node, P5Element } from './parser.js';
import type { FQNNode } from './fqn-router.js';
import { isNoiseByAttribute } from '../rules.js';

const CONTENT_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'pre', 'code', 'blockquote', 'td', 'th',
]);

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// Dev-doc detection: count only H2-H4 (structural headings, not page title H1)
const DEV_DOC_HEADING_TAGS = new Set(['h2', 'h3', 'h4']);

// Section boundary: H1-H4 create new clusters
const CLUSTER_BOUNDARY_TAGS = new Set(['h1', 'h2', 'h3', 'h4']);

const NOISE_TAGS = new Set([
  'script', 'style', 'nav', 'footer', 'header', 'aside',
  'noscript', 'iframe', 'form', 'button', 'svg',
]);

interface ContentBlock {
  fqn: FQNNode;
  linkTextLen: number;
}

interface Cluster {
  heading: FQNNode | null;
  blocks: ContentBlock[];
  totalTextLen: number;
  totalLinkTextLen: number;
}

function extractText(node: P5Node): string {
  if (isText(node)) return node.value;
  if (!('childNodes' in node)) return '';
  return (node as P5Element).childNodes.map(extractText).join('').replace(/\s+/g, ' ').trim();
}

function getLinkTextLen(node: P5Node): number {
  let len = 0;
  walkNodes(node, n => {
    if (isElement(n) && n.nodeName === 'a') {
      len += extractText(n).length;
      return false;
    }
  });
  return len;
}

function findMainContainer(doc: P5Node): P5Element | null {
  let found: P5Element | null = null;
  walkNodes(doc, node => {
    if (found) return false;
    if (!isElement(node)) return;
    const tag = node.nodeName;
    if (tag === 'main' || tag === 'article') {
      found = node;
      return false;
    }
    const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
    if (attrs['role'] === 'main') {
      found = node;
      return false;
    }
  });
  return found;
}

function extractFlatBlocks(container: P5Node): ContentBlock[] {
  const results: ContentBlock[] = [];

  walkNodes(container, (node, depth) => {
    if (!isElement(node)) return;
    const tag = node.nodeName;
    if (NOISE_TAGS.has(tag)) return false;
    if (isNoiseByAttribute(node)) return false;

    if (CONTENT_TAGS.has(tag)) {
      const text = extractText(node).trim();
      const minLen = HEADING_TAGS.has(tag) ? 2 : 10;
      if (text.length < minLen) return false;

      results.push({
        fqn: { tag, text, depth },
        linkTextLen: getLinkTextLen(node),
      });
      return false; // 블록 내부 재귀 생략 (중복 방지)
    }
  });

  return results;
}

function groupClusters(blocks: ContentBlock[]): Cluster[] {
  const clusters: Cluster[] = [];
  let cur: Cluster = { heading: null, blocks: [], totalTextLen: 0, totalLinkTextLen: 0 };

  for (const block of blocks) {
    if (CLUSTER_BOUNDARY_TAGS.has(block.fqn.tag)) {
      if (cur.blocks.length > 0 || cur.heading !== null) clusters.push(cur);
      cur = {
        heading: block.fqn,
        blocks: [],
        totalTextLen: block.fqn.text.length,
        totalLinkTextLen: block.linkTextLen,
      };
    } else {
      cur.blocks.push(block);
      cur.totalTextLen += block.fqn.text.length;
      cur.totalLinkTextLen += block.linkTextLen;
    }
  }
  if (cur.blocks.length > 0 || cur.heading !== null) clusters.push(cur);

  return clusters;
}

export function clusterByHeadings(doc: P5Node): FQNNode[] | null {
  const container = findMainContainer(doc) ?? doc;
  const blocks = extractFlatBlocks(container);
  if (blocks.length === 0) return null;

  const clusters = groupClusters(blocks);

  // Dev-doc structure check: H2-H4 ≥ 2 AND avg text-per-heading ≥ 400 chars
  const devHeadingClusters = clusters.filter(
    c => c.heading !== null && DEV_DOC_HEADING_TAGS.has(c.heading.tag),
  );
  if (devHeadingClusters.length < 2) return null;

  const avgTextPerHeading =
    devHeadingClusters.reduce((s, c) => s + c.totalTextLen, 0) / devHeadingClusters.length;
  if (avgTextPerHeading < 400) return null;

  // Filter clusters with high link density (navigation menus, sidebar links)
  const goodClusters = clusters.filter(c => {
    if (c.totalTextLen === 0) return false;
    return c.totalLinkTextLen / c.totalTextLen < 0.3;
  });
  if (goodClusters.length === 0) return null;

  const result: FQNNode[] = [];
  for (const cluster of goodClusters) {
    if (cluster.heading) result.push(cluster.heading);
    result.push(...cluster.blocks.map(b => b.fqn));
  }

  return result.length >= 3 ? result : null;
}
