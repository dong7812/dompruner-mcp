import type { SemanticAnchors } from './anchor.js';

export interface SsgExtractResult {
  markdown: string;
  anchors: SemanticAnchors;
}

// Duck typing: React Server Components 마커는 버전에 따라 '$r', '$' 등으로 다를 수 있음.
// '$'로 시작하는 모든 마커 + tagName이 string + props가 object|null 형식이면 허용.
type RscTuple = [string, string, string | null, Record<string, unknown>];

function isRscTuple(v: unknown): v is RscTuple {
  if (!Array.isArray(v) || v.length < 4) return false;
  const [marker, tag, , props] = v;
  if (typeof marker !== 'string' || !marker.startsWith('$')) return false;
  if (typeof tag !== 'string') return false;
  if (props !== null && typeof props !== 'object') return false;
  return true;
}

// Components that produce no output
const SKIP_TAGS = new Set(['InlineToc', 'Meta', 'SandpackWithHTMLOutput']);

// Layout/wrapper components — recurse into children transparently
const PASS_THROUGH_TAGS = new Set([
  'MaxWidth', 'Intro', 'Note', 'Callout', 'CanaryBadge', 'Canary',
  'Deprecated', 'Experimental', 'Added', 'Wip', 'CodeStep',
  'div', 'section', 'article', 'main', 'aside', 'header', 'footer',
  'nav', 'figure', 'figcaption', 'details', 'summary',
]);

// Inline HTML tags handled by renderInline
const INLINE_TAGS = new Set(['code', 'strong', 'b', 'em', 'i', 'a', 'span', 'small', 'sup', 'sub', 'mark']);

function renderInline(node: unknown): string {
  if (typeof node === 'string') return node;
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'number') return '';
  if (!Array.isArray(node)) return '';

  if (isRscTuple(node)) {
    const [, tag, , props] = node;
    const ch = props.children;
    switch (tag) {
      case 'code':   return `\`${renderInline(ch)}\``;
      case 'strong':
      case 'b':      return `**${renderInline(ch)}**`;
      case 'em':
      case 'i':      return `_${renderInline(ch)}_`;
      case 'a':      return renderInline(ch);
      default:       return renderInline(ch ?? '');
    }
  }

  return (node as unknown[]).map(renderInline).join('');
}

function renderBlock(node: unknown, listDepth = 0): string[] {
  if (typeof node === 'string') return node.trim() ? [node.trim()] : [];
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'number') return [];

  if (!Array.isArray(node)) return [];

  if (!isRscTuple(node)) {
    return (node as unknown[]).flatMap(child => renderBlock(child, listDepth));
  }

  const [, tag, , props] = node;
  const ch = props.children;

  if (SKIP_TAGS.has(tag)) return [];

  if (PASS_THROUGH_TAGS.has(tag)) return renderBlock(ch, listDepth);

  if (INLINE_TAGS.has(tag)) {
    const text = renderInline(node).trim();
    return text ? [text] : [];
  }

  switch (tag) {
    case 'h1': return [`# ${renderInline(ch).trim()}`];
    case 'h2': return [`## ${renderInline(ch).trim()}`];
    case 'h3': return [`### ${renderInline(ch).trim()}`];
    case 'h4':
    case 'h5': return [`#### ${renderInline(ch).trim()}`];

    case 'p': {
      const text = renderInline(ch).trim();
      return text ? [text] : [];
    }

    case 'pre': {
      let lang = '';
      let code = '';
      if (isRscTuple(ch as unknown)) {
        const [, , , codeProps] = ch as RscTuple;
        lang = ((codeProps.className as string) ?? '').replace('language-', '');
        code = typeof codeProps.children === 'string'
          ? codeProps.children
          : renderInline(codeProps.children);
      } else {
        code = renderInline(ch);
      }
      return ['```' + lang, code.trimEnd(), '```'];
    }

    case 'ul':
    case 'ol':
      return renderBlock(ch, listDepth);

    case 'li': {
      const inner = renderInline(ch).trim();
      return inner ? [`${'  '.repeat(listDepth)}- ${inner}`] : [];
    }

    case 'blockquote': {
      return renderBlock(ch, listDepth).map(l => `> ${l}`);
    }

    case 'hr': return ['---'];
    case 'br': return [''];

    default:
      // Unknown component — recurse
      return renderBlock(ch, listDepth);
  }
}

function dedup(lines: string[]): string[] {
  const out: string[] = [];
  let prevBlank = false;
  for (const line of lines) {
    const blank = line.trim() === '';
    if (blank && prevBlank) continue;
    out.push(line);
    prevBlank = blank;
  }
  return out;
}

function getNextJsRscContent(payload: unknown): unknown {
  try {
    const p = payload as Record<string, unknown>;
    const pageProps = (p.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
    if (!pageProps) return null;

    // react.dev: pageProps.content is a doubly-encoded JSON string
    const raw = pageProps.content;
    if (typeof raw === 'string') return JSON.parse(raw);
    if (raw !== null && raw !== undefined) return raw;
    return null;
  } catch {
    return null;
  }
}

function getMetaDesc(payload: unknown): string {
  try {
    const p = payload as Record<string, unknown>;
    const pageProps = (p.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
    return (pageProps?.description as string) ?? '';
  } catch {
    return '';
  }
}

export function extractSsgMarkdown(ssgPayload: unknown): SsgExtractResult | null {
  try {
    return _extractSsgMarkdown(ssgPayload);
  } catch {
    // RSC 스키마 변경 또는 예상치 못한 구조 → DOM fallback 신호 (null)
    return null;
  }
}

function _extractSsgMarkdown(ssgPayload: unknown): SsgExtractResult | null {
  const content = getNextJsRscContent(ssgPayload);
  if (!content) return null;

  const rawLines = renderBlock(content);
  const lines = dedup(rawLines);
  const markdown = lines.join('\n').trim();
  // 유효 콘텐츠 최소 임계값: 100자 미만이면 DOM fallback
  if (!markdown || markdown.length < 100) return null;

  // Extract anchors from heading lines
  const anchors = lines
    .filter(l => /^#{1,3} /.test(l))
    .map(l => {
      const m = l.match(/^(#{1,3}) (.+)/);
      if (!m) return null;
      return { level: m[1].length as 1 | 2 | 3, text: m[2].trim() };
    })
    .filter((a): a is { level: 1 | 2 | 3; text: string } => a !== null);

  const title = anchors.find(a => a.level === 1)?.text ?? anchors[0]?.text ?? '';
  const metaDesc = getMetaDesc(ssgPayload);

  return { markdown, anchors: { title, anchors, metaDesc } };
}
