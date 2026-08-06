import type { FQNNode } from '../ast/fqn-router.js';
import type { SemanticAnchors } from '../ast/anchor.js';

export interface SerializeResult {
  markdown: string;
  originalTokens: number;
  refinedTokens: number;
  reductionRatio: number;
}

export function estimateTokens(text: string): number {
  const korean = (text.match(/[가-힣]/g) ?? []).length;
  return Math.ceil(korean / 2 + (text.length - korean) / 4);
}

export function serialize(
  nodes: FQNNode[],
  anchors: SemanticAnchors,
  originalHtml: string,
): SerializeResult {
  const lines: string[] = [];

  if (anchors.metaDesc) lines.push(`> ${anchors.metaDesc}`, '');

  let prevTag = '';
  for (const { tag, text } of nodes) {
    if (tag === prevTag && !['h1','h2','h3','h4','h5'].includes(tag)) {
      // 같은 블록 타입 연속 → 빈 줄 없이 이어 붙임
      lines.push(formatNode(tag, text));
    } else {
      if (lines.length > 0) lines.push('');
      lines.push(formatNode(tag, text));
    }
    prevTag = tag;
  }

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const originalTokens = estimateTokens(originalHtml);
  const refinedTokens = estimateTokens(markdown);
  const reductionRatio = originalTokens > 0
    ? 1 - refinedTokens / originalTokens
    : 0;

  return { markdown, originalTokens, refinedTokens, reductionRatio };
}

function formatNode(tag: string, text: string): string {
  switch (tag) {
    case 'h1': return `# ${text}`;
    case 'h2': return `## ${text}`;
    case 'h3': return `### ${text}`;
    case 'h4':
    case 'h5': return `#### ${text}`;
    case 'pre':
    case 'code': return `\`\`\`\n${text}\n\`\`\``;
    case 'blockquote': return `> ${text}`;
    case 'li': return `- ${text}`;
    default: return text;
  }
}
