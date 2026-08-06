import { parse, type DefaultTreeAdapterMap } from 'parse5';

export type P5Node = DefaultTreeAdapterMap['node'];
export type P5Element = DefaultTreeAdapterMap['element'];
export type P5Text = DefaultTreeAdapterMap['textNode'];

/**
 * parse5 투입 전 JS/CSS/SVG 블록을 정규식으로 제거.
 * JS-heavy 사이트(Stripe, Anthropic 등)에서 HTML 크기를 80~92% 줄여
 * parse5 처리 시간을 90~96% 단축한다. strip 자체 비용 ≈ 0.5ms.
 *
 * meta/og 태그가 필요한 단계(extractAnchors)는 원본 HTML을 그대로 받으므로
 * 이 함수는 parseHtml 직전에만 호출한다.
 */
export function preStripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');
}

export function parseHtml(html: string): DefaultTreeAdapterMap['document'] {
  return parse(preStripHtml(html));
}

export function isElement(node: P5Node): node is P5Element {
  return node.nodeName !== '#text' && node.nodeName !== '#document'
    && node.nodeName !== '#comment' && 'childNodes' in node;
}

export function isText(node: P5Node): node is P5Text {
  return node.nodeName === '#text';
}

export function walkNodes(
  node: P5Node,
  visitor: (node: P5Node, depth: number) => boolean | void,
  depth = 0,
): void {
  const keepGoing = visitor(node, depth);
  if (keepGoing === false) return;
  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      walkNodes(child, visitor, depth + 1);
    }
  }
}
