import type { FQNNode } from './fqn-router.js';
import { decodeHtmlEntities } from '../rules.js';

export interface Anchor {
  level: 1 | 2 | 3;
  text: string;
}

export interface SemanticAnchors {
  title: string;
  anchors: Anchor[];
  metaDesc: string;
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3']);

export function extractAnchors(nodes: FQNNode[], html: string): SemanticAnchors {
  const headings = nodes.filter(n => HEADING_TAGS.has(n.tag));

  const title = headings.find(n => n.tag === 'h1')?.text ?? '';

  const anchors: Anchor[] = headings.map(n => ({
    level: parseInt(n.tag[1]) as 1 | 2 | 3,
    text: n.text,
  }));

  // meta description은 NOISE_TAGS에 걸려 FQNNode에 없으므로 raw HTML에서 추출
  const rawMetaDesc =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']{1,300})["']/i)?.[1]
    ?? html.match(/<meta\s+content=["']([^"']{1,300})["']\s+name=["']description["']/i)?.[1]
    ?? '';

  const metaDesc = decodeHtmlEntities(rawMetaDesc);  // issue #2

  return { title, anchors, metaDesc };
}
