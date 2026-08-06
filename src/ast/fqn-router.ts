import { type DefaultTreeAdapterMap } from 'parse5';
import { isElement, isText, walkNodes } from './parser.js';
import { isNoiseByAttribute, isBoilerplateText } from '../rules.js';

export interface FQNNode {
  tag: string;
  text: string;
  depth: number;
}

const NOISE_TAGS = new Set([
  'script', 'style', 'nav', 'footer', 'header', 'aside',
  'noscript', 'iframe', 'form', 'head', 'button', 'svg',
]);

const CONTENT_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5',
  'li', 'td', 'th', 'blockquote', 'pre', 'code',
]);

// 헤딩은 3자 이상이면 유효 ("API", "FAQ" 등), 단락/리스트는 10자 이상
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5']);
const MIN_LENGTH: Record<string, number> = { heading: 3, body: 10 };

function extractText(node: DefaultTreeAdapterMap['node']): string {
  if (isText(node)) return node.value;
  if (!('childNodes' in node)) return '';
  return node.childNodes.map(extractText).join('').replace(/\s+/g, ' ').trim();
}

export function routeContentNodes(
  doc: DefaultTreeAdapterMap['document'],
): FQNNode[] {
  const results: FQNNode[] = [];

  walkNodes(doc, (node, depth) => {
    if (!isElement(node)) return;

    const tag = node.nodeName;

    if (NOISE_TAGS.has(tag)) return false;
    // issue #1: attribute rule — 콘텐츠 태그(p, li 등) 자체엔 적용하지 않음.
    // wrapper/structural 엘리먼트에만 적용해 false-positive 방지.
    if (!CONTENT_TAGS.has(tag) && isNoiseByAttribute(node)) return false;

    if (CONTENT_TAGS.has(tag)) {
      const text = extractText(node).trim();
      const minLen = HEADING_TAGS.has(tag) ? MIN_LENGTH.heading : MIN_LENGTH.body;
      if (text.length >= minLen && !isBoilerplateText(text))
        results.push({ tag, text, depth });
      return false;
    }
  });

  return deduplicate(results);
}

function deduplicate(nodes: FQNNode[]): FQNNode[] {
  const seen = new Set<string>();
  return nodes.filter(({ text }) => {
    if (seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}
