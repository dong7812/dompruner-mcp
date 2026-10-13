# dompruner-mcp

English | [한국어](./README.ko.md)

![DOM Tree Pruning for DomPruner](assets/banner.png)

> LLM 웹 파이프라인을 위한 DOM AST 미들웨어 — 레이아웃 노이즈(nav·스크립트·사이드바)를 제거하고 원문을 그대로 전달합니다. query를 넘기면 BM25로 관련 섹션만 추가 필터링합니다.

LLM이 내장 WebFetch를 사용하면 소형 모델이 HTML을 전처리해 요약된 결과를 반환합니다 — 지연, 비용, 원하지 않은 해석이 추가됩니다. DomPruner는 이 단계를 건너뜁니다: DOM AST 파싱으로 노이즈를 제거하고 **원문 콘텐츠를 모델에 직접 전달**합니다.

| 호출 | 동작 |
|---|---|
| `dompruner_fetch(url)` | 레이아웃 노이즈 제거 → 전체 추출 콘텐츠 반환 |
| `dompruner_fetch(url, query)` | 레이아웃 노이즈 제거 → BM25로 관련 섹션만 (매칭 없으면 전체 반환) |

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

### Remote HTTP (설치 불필요, 항상 최신)

HTTP transport를 지원하는 클라이언트라면 Node.js 설치 없이 바로 사용 가능하며, 배포 시마다 자동으로 최신 버전이 적용됩니다:

```json
{
  "mcpServers": {
    "dompruner": {
      "url": "https://dompruner-mcp.vercel.app/api/mcp"
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

### WebFetch 비교 (라이브 측정, Claude Haiku)

| 지표 | WebFetch | **DomPruner** |
|---|:---:|:---:|
| 평균 컨텍스트 토큰 | ~15,735 | **~1,019 (93.5% 절감)** |
| 답변 품질 (10개 쿼리) | 9 / 10 | **8 / 10** |
| 평균 응답 시간 | 5,811 ms | **3,168 ms (45% 빠름)** |
| 콘텐츠 충실도 | 소형 모델 요약 | **원문 그대로 보존** |
| 추가 API 키 / 인프라 | 없음 | **없음** |

### BM25 섹션 선택 정확도 (스냅샷 기반 결정적 측정)

| 평가셋 | 페이지 수 | 평균 절감율 | 섹션 보존율 |
|---|:---:|:---:|:---:|
| 튜닝셋 (MDN, docs.python.org) | 10 | 98.0% | **98.0%** |
| **검증셋 (미사용 사이트)** | 5 | 98.7% | **96.0%** |

headingBoost=2.0은 튜닝셋에서 파라미터 스윕(1.0–3.0)으로 선정됐습니다. 검증셋은 튜닝에 쓰이지 않은 5개 사이트(react.dev, typescriptlang.org, expressjs.com, doc.rust-lang.org, nextjs.org)로 구성해 과적합 여부를 확인했습니다. 2%p 차이는 알려진 heading-bias 한계 범위 내에 있습니다.

→ **[전체 벤치마크](https://github.com/dong7812/dompruner-mcp/blob/main/docs/benchmark.md)** · **[아키텍처](https://github.com/dong7812/dompruner-mcp/blob/main/docs/architecture.md)**

---

## Crawl4AI와 비교

Crawl4AI는 크롤러 프레임워크입니다 — 브라우저 자동화, JS 렌더링, 클릭/스크롤 인터랙션, JSON 구조화 추출, 딥 크롤. DomPruner는 LLM 컨텍스트 미들웨어입니다 — 에이전트가 이미 URL을 알고 있을 때 페이지를 읽는 토큰 비용을 최소화하는 단일 목적 계층.

**해결하는 문제가 다릅니다.** 그러나 둘 다 MCP 에이전트 안에서 웹 페이지를 읽는 데 쓸 수 있으므로, 비교는 유효합니다.

### 설치

| | Crawl4AI | **DomPruner** |
|---|:---:|:---:|
| 설치 | `pip install crawl4ai && crawl4ai-setup` (Chromium ~300MB 다운로드) | **`npx -y dompruner-mcp`** |
| 브라우저 필요 | 항상 (Playwright/Chromium) | **없음** (SSR; CSR 감지 시만 Playwright) |
| API key / 유료 | MCP는 클라우드 유료 ($10/월~) | **없음** |
| 토큰 절감 설정 | 수동 `PruningContentFilter` 코드 필요 | **없음 — `query=` 파라미터만** |

### 토큰 수 실측: 동일 10개 페이지, 직접 측정

DomPruner 수치: `dompruner_fetch(url, query)` (BM25 섹션 필터 적용, 에이전트 표준 호출).  
Crawl4AI 수치: `raw_markdown`(기본 출력)과 `fit_markdown` (`PruningContentFilter(threshold=0.5)` 적용, 최선 필터링 옵션).

| 페이지 | Crawl4AI 기본 | Crawl4AI (PruningFilter) | **DomPruner** |
|------|:---:|:---:|:---:|
| MDN Fetch API | 5,075 | 1,634 | **713** |
| Python os module | 89,957 | 83,786 | **1,758** |
| Python builtins | 34,144 | 29,344 | **755** |
| MDN Array | 18,987 | 12,350 | **1,207** |
| Python control flow | 13,865 | 11,671 | **1,362** |
| MDN Flexbox | 47,258 | 6,134 | **1,797** |
| Python json module | 11,867 | 9,626 | **1,998** |
| MDN WebSocket | 5,163 | 1,375 | **704** |
| Python re module | 25,382 | 21,531 | **1,837** |
| MDN Promise | 11,068 | 6,064 | **1,767** |
| **합계** | **262,766** | **183,515** | **13,898** |
| **DomPruner 대비** | 18.9배 많음 | 13.2배 많음 | **—** |

### 정확도: 정답 내용이 실제로 살아남는가?

토큰 수만으로는 부족합니다. 올바른 섹션의 핵심 사실(`answerTerms`)이 각 도구의 출력에 포함되는지 측정했습니다 — DomPruner BM25 섹션 정확도 테스트와 동일한 기준.

| 페이지 | Crawl4AI (PruningFilter) | **DomPruner** |
|------|:---:|:---:|
| MDN Fetch API | 20% ✗ | **100% ✓** |
| Python os module | 100% ✓ | **100% ✓** |
| Python builtins | 100% ✓ | **100% ✓** |
| MDN Array | 100% ✓ | **100% ✓** |
| Python control flow | 100% ✓ | **100% ✓** |
| MDN Flexbox | 100% ✓ | **100% ✓** |
| Python json module | 100% ✓ | **100% ✓** |
| MDN WebSocket | 80% ✓ | **100% ✓** |
| Python re module | 100% ✓ | **100% ✓** |
| MDN Promise | 100% ✓ | 80% ✓ |
| **평균** | **90%** | **98%** |

DomPruner는 Crawl4AI 최선 필터링 대비 **13.2배 작으면서** 정확도는 **8%p 더 높습니다**.

Crawl4AI의 `PruningContentFilter`는 텍스트 밀도 기반 휴리스틱으로, 내용은 풍부하지만 짧은 섹션을 제거할 수 있습니다 (예: MDN Fetch API의 CORS/credentials 섹션). DomPruner는 DOM 레벨 추출 + BM25 섹션 랭킹으로 필터링 결정 이전에 구조를 보존합니다.

> **Crawl4AI MCP는 클라우드 유료 서비스($10/월~)입니다.** DomPruner MCP는 `npx`로 로컬에서 무료 실행됩니다.

---

## 관련 프로젝트

- **[dompruner-py](https://github.com/dong7812/dompruner-py)** — Python 포트. LangChain용 `DomPrunerLoader`, `DomPrunerSitemapLoader`, `DomPrunerFetchTool`. `pip install dompruner`.
- **[LangChain 통합 목록](https://docs.langchain.com/oss/python/integrations/document_loaders)** — dompruner-py가 서드파티 웹 로더로 등재.

---

## 라이선스

MIT
