import type { AstRAGRule } from '../types.js';

/**
 * http-endpoint rule
 *
 * REST API 문서에서 HTTP 메서드 + 경로 패턴을 감지해 목록 맨 앞으로 올린다.
 * "GET /v1/charges" 같은 엔드포인트가 LLM 컨텍스트 초반에 위치하게 해
 * API 참조 질문의 정확도를 높인다.
 *
 * 자동 적용 대상: stripe.com, docs.github.com, platform.openai.com 등
 */

const HTTP_METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/\S+/;

export const httpEndpointRule: AstRAGRule = {
  name: 'http-endpoint',
  description: 'Float HTTP method + path patterns to the top of the output',

  match: (url) =>
    /stripe\.com|docs\.github\.com|platform\.openai\.com|api\.slack\.com/.test(url),

  transform(nodes) {
    const endpoints = nodes.filter(
      n => (n.tag === 'code' || n.tag === 'pre') && HTTP_METHOD_RE.test(n.text.trim()),
    );
    const rest = nodes.filter(
      n => !((n.tag === 'code' || n.tag === 'pre') && HTTP_METHOD_RE.test(n.text.trim())),
    );
    return [...endpoints, ...rest];
  },
};
