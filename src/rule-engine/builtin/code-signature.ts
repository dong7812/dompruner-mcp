import type { AstRAGRule } from '../types.js';

/**
 * code-signature rule
 *
 * <pre> / <code> 블록에서 함수/클래스 시그니처 첫 줄만 남기고
 * 구현 본문·예제 코드는 제거한다.
 *
 * 대상 패턴:
 *   public/private/protected fun/class/function/def/async
 *   type / interface / const (선언)
 *   export 키워드
 *
 * 100~150 토큰 목표의 "API Reference 정밀 추출" 모드에서 사용.
 */

const SIG_RE = /^(export\s+)?(public|private|protected|static|async\s+)*(fun|class|function|def|const|let|type|interface|enum)\s+\w/;

export const codeSignatureRule: AstRAGRule = {
  name: 'code-signature',
  description: 'Extract only the first signature line from code blocks, drop implementation bodies',

  transform(nodes) {
    return nodes.map(node => {
      if (node.tag !== 'pre' && node.tag !== 'code') return node;

      const lines = node.text.split('\n').map(l => l.trim()).filter(Boolean);
      const sigIdx = lines.findIndex(l => SIG_RE.test(l));

      if (sigIdx === -1) return node;

      // 시그니처 줄 + 닫는 괄호까지 (멀티라인 시그니처 대응)
      const sigLines: string[] = [lines[sigIdx]];
      if (!lines[sigIdx].includes(')') && !lines[sigIdx].includes('{')) {
        for (let i = sigIdx + 1; i < Math.min(sigIdx + 4, lines.length); i++) {
          sigLines.push(lines[i]);
          if (lines[i].includes(')') || lines[i].includes('{')) break;
        }
      }

      return { ...node, text: sigLines.join(' ').replace(/\s*\{\s*$/, '').trim() };
    });
  },
};
