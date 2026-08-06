import type { AstRAGRule, RuleContext } from './types.js';
import type { FQNNode } from '../ast/fqn-router.js';
import { codeSignatureRule } from './builtin/code-signature.js';
import { httpEndpointRule } from './builtin/http-endpoint.js';

// ── 빌트인 Rule 목록 (URL 자동 매핑 대상) ────────────────────────────────────
const BUILTIN_RULES: AstRAGRule[] = [
  httpEndpointRule,
  // codeSignatureRule은 범용 API 문서에 무조건 적용하지 않고 명시적으로 선택
];

// ── 외부 등록 (커뮤니티 Rule) ─────────────────────────────────────────────────
const customRules = new Map<string, AstRAGRule>();

export function registerRule(rule: AstRAGRule): void {
  customRules.set(rule.name, rule);
}

export function getRule(name: string): AstRAGRule | undefined {
  return customRules.get(name) ?? BUILTIN_RULES.find(r => r.name === name);
}

/**
 * URL을 받아 자동 매핑된 Rule + 명시적 Rule 목록을 반환한다.
 * 적용 순서: URL 자동 매핑 → 명시적 지정 순
 */
export function resolveRules(
  url: string,
  extra: (AstRAGRule | string)[] = [],
): AstRAGRule[] {
  const auto = BUILTIN_RULES.filter(r => r.match?.(url));

  const explicit = extra.map(r => {
    if (typeof r === 'string') {
      const found = getRule(r);
      if (!found) throw new Error(`AstRAG: unknown rule "${r}"`);
      return found;
    }
    return r;
  });

  // 중복 제거 (name 기준)
  const seen = new Set(auto.map(r => r.name));
  return [...auto, ...explicit.filter(r => !seen.has(r.name))];
}

/**
 * Rule 체인을 FQNNode[]에 순서대로 적용한다.
 */
export function applyRules(
  nodes: FQNNode[],
  ctx: RuleContext,
  rules: AstRAGRule[],
): FQNNode[] {
  return rules.reduce(
    (acc, rule) => rule.transform?.(acc, ctx) ?? acc,
    nodes,
  );
}

// 외부 참조용 re-export
export { codeSignatureRule, httpEndpointRule };
export type { AstRAGRule, RuleContext };
