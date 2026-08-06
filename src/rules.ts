/**
 * AstRAG Filtering & Transform Rules
 *
 * Issue #1: attribute-based noise rules (class/id/role 기반 subtree prune)
 * Issue #2: HTML entity decode rule (텍스트 후처리)
 *
 * 새 규칙 추가 시 이 파일만 수정하면 fqn-router / serializer 모두에 반영됨.
 */

import type { P5Element } from './ast/parser.js';

// ── Noise Element Rules (Issue #1) ──────────────────────────────────────────

/** role 속성 기반 노이즈 판별 */
const NOISE_ROLES = new Set([
  'navigation', 'menu', 'menubar', 'menuitem',
  'banner', 'complementary', 'search',
]);

/**
 * class/id 에 포함되면 노이즈로 판별하는 키워드.
 * 의도: tag name으로 못 잡는 케이스만 커버.
 * 주의: 'header', 'footer', 'nav', 'sidebar' 는 이미 NOISE_TAGS 에 있거나
 *       콘텐츠 wrapper class name으로 흔히 쓰여 false-positive 위험 → 제외.
 */
const NOISE_CLASS_PATTERNS = [
  'skip-link', 'skip-to',          // skip navigation links
  'breadcrumb',                     // breadcrumb nav
  'cookie-banner', 'cookie-notice', // cookie consent
  'advertisement', 'ad-container',  // ads
  'popup', 'modal-overlay',         // overlays
  'topbar', 'toolbar',              // fixed bars
];
const NOISE_CLASS_RE = new RegExp(
  `\\b(${NOISE_CLASS_PATTERNS.join('|')})\\b`,
  'i',
);

/**
 * 태그 이름만으로 잡히지 않는 노이즈 엘리먼트를 attribute rule로 판별.
 * true 반환 시 해당 엘리먼트와 그 서브트리를 prune.
 */
export function isNoiseByAttribute(el: P5Element): boolean {
  const attrs = Object.fromEntries((el.attrs ?? []).map(a => [a.name, a.value]));

  if (NOISE_ROLES.has(attrs['role'] ?? '')) return true;

  const classId = `${attrs['class'] ?? ''} ${attrs['id'] ?? ''}`;
  if (NOISE_CLASS_RE.test(classId)) return true;

  // aria-label 이 명시적으로 nav 의미를 나타낼 때
  const ariaLabel = (attrs['aria-label'] ?? '').toLowerCase();
  if (['navigation', 'breadcrumb', 'table of contents'].includes(ariaLabel)) return true;

  return false;
}

// ── Text Content Rules ───────────────────────────────────────────────────────

/**
 * 추출된 텍스트가 접근성 skip link, 쿠키 배너 등
 * 보일러플레이트 패턴에 해당하면 true.
 * <li> 내부의 <a class="skiplink"> 처럼 tag/attr 만으로
 * 걸러지지 않는 케이스를 커버.
 */
const BOILERPLATE_TEXT_RE = [
  /^skip (to|navigation|main|content)/i,
  /^jump to (content|main|navigation)/i,
  /^go to (main content|content|navigation)/i,
];

export function isBoilerplateText(text: string): boolean {
  const t = text.trim();
  return BOILERPLATE_TEXT_RE.some(re => re.test(t));
}

// ── Text Transform Rules (Issue #2) ─────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#x27;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&copy;': '©',
  '&reg;': '®',
};

const ENTITY_RE = /&(?:#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g;

/** HTML 엔티티를 Unicode 문자로 디코딩 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(ENTITY_RE, (entity) => {
    if (entity in HTML_ENTITIES) return HTML_ENTITIES[entity];

    const hexMatch = entity.match(/&#x([0-9a-fA-F]+);/);
    if (hexMatch) return String.fromCharCode(parseInt(hexMatch[1], 16));

    const decMatch = entity.match(/&#([0-9]+);/);
    if (decMatch) return String.fromCharCode(parseInt(decMatch[1], 10));

    return entity; // 알 수 없는 엔티티는 원문 유지
  });
}
