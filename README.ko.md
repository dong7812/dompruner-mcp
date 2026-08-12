# dompruner-mcp

English | [한국어](./README.ko.md)

![DOM Tree Pruning for DomPruner](assets/banner.png)

> LLM 웹 파이프라인을 위한 DOM AST 미들웨어 — AST 파싱으로 nav/광고/스크립트를 제거하고, 원본 콘텐츠를 토큰 효율적으로 모든 LLM에 전달합니다.

LLM이 내장 WebFetch를 사용하면 소형 모델이 HTML을 전처리해 요약된 결과를 반환합니다 — 지연, 비용, 원하지 않은 해석이 추가됩니다. DomPruner는 이 단계를 건너뜁니다: DOM AST 파싱으로 노이즈를 제거하고 **원문 콘텐츠를 모델에 직접 전달**합니다.

```
> [DomPruner] docs.python.org
> | Raw HTML  | 44,316 tokens |
> | DomPruner |  1,328 tokens |
> | 절감      |        97.0%  |
> Fetch: 194ms · Parse: 11.2ms
```

**WebFetch 대비 평균 93.5% 토큰 절감. 응답 속도 45% 향상.**
→ [전체 벤치마크](https://github.com/dong7812/dompruner-mcp/blob/main/docs/benchmark.md)

---

## 빠른 시작

설치 없이, API 키 없이:

```bash
npx -y dompruner-mcp
```

### Claude Code

```json
{
  "mcpServers": {
    "dompruner": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "dompruner-mcp"]
    }
  }
}
```

프로젝트 루트의 `.mcp.json` 또는 전역 설정 `~/.claude/.mcp.json`에 추가. `/mcp`로 확인.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 또는 `%APPDATA%\Claude\claude_desktop_config.json` (Windows) 편집:

```json
{
  "mcpServers": {
    "dompruner": {
      "command": "npx",
      "args": ["-y", "dompruner-mcp"]
    }
  }
}
```

### Cursor / Windsurf / 기타 MCP 클라이언트

```json
{
  "mcpServers": {
    "dompruner": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "dompruner-mcp"]
    }
  }
}
```

### LangChain / LangGraph

[`langchain-mcp-adapters`](https://pypi.org/project/langchain-mcp-adapters/)로 MCP stdio 서버를 LangChain 툴로 자동 변환:

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient({
    "dompruner": {
        "command": "npx",
        "args": ["-y", "dompruner-mcp"],
        "transport": "stdio",
    }
})
tools = await client.get_tools()
```

---

## AI가 항상 DomPruner를 사용하도록 설정

툴 설명에 WebFetch 대신 `dompruner_fetch`를 우선 사용하도록 지시가 포함되어 있습니다. 그래도 내장 fetch로 폴백된다면 클라이언트의 지시 파일에 아래 규칙을 추가하세요:

```markdown
URL을 가져올 때 WebFetch 대신 항상 dompruner_fetch를 사용하세요.
- URL 알고 있으면 → dompruner_fetch(url, query?)
- URL 모르면 → 먼저 검색으로 URL을 찾고, dompruner_fetch(url) 호출
```

| 클라이언트 | 지시 파일 |
|--------|-----------------|
| Claude Code | `CLAUDE.md` (프로젝트) 또는 `~/.claude/CLAUDE.md` (전역) |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| GitHub Copilot | `.github/copilot-instructions.md` |

---

## 툴

| 툴 | 설명 |
|------|-------------|
| `dompruner_fetch` | URL → DOM 정제 Markdown. `query` 옵션으로 BM25+ 섹션 필터 활성화. |
| `dompruner_sitemap` | sitemap.xml의 모든 페이지 → 정제된 Document. |
| `dompruner_analyze` | 전체 콘텐츠 없이 토큰 절감 리포트만 반환. |

→ **[툴 레퍼런스](https://github.com/dong7812/dompruner-mcp/blob/main/docs/tools.md)**

---

## 벤치마크 요약

| 지표 | WebFetch | **DomPruner** |
|---|:---:|:---:|
| 평균 컨텍스트 토큰 | ~15,735 | **~1,019 (93.5% 절감)** |
| 답변 품질 (10개 쿼리) | 9 / 10 | **8 / 10** |
| 평균 응답 시간 | 5,811 ms | **3,168 ms (45% 빠름)** |
| 콘텐츠 충실도 | 소형 모델 요약 | **원문 그대로 보존** |
| 추가 API 키 / 인프라 | 없음 | **없음** |

→ **[전체 벤치마크](https://github.com/dong7812/dompruner-mcp/blob/main/docs/benchmark.md)** · **[아키텍처](https://github.com/dong7812/dompruner-mcp/blob/main/docs/architecture.md)**

---

## 관련 프로젝트

- **[dompruner-py](https://github.com/dong7812/dompruner-py)** — Python 포트. LangChain용 `DomPrunerLoader`, `DomPrunerSitemapLoader`, `DomPrunerFetchTool`. `pip install dompruner`.
- **[LangChain 통합 목록](https://docs.langchain.com/oss/python/integrations/document_loaders)** — dompruner-py가 서드파티 웹 로더로 등재.

---

## 라이선스

MIT
