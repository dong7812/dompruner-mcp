# dompruner-mcp

![DOM Tree Pruning for DomPruner](assets/banner.png)

> Claude가 페이지를 직접 읽습니다 — 소형 모델 없이, 요약 손실 없이.

Claude의 내장 WebFetch를 사용하면, 소형 모델이 원본 HTML을 전처리하고 요약된 결과를 Claude에게 전달합니다 — 지연, 비용, 그리고 요청하지 않은 해석 레이어가 추가됩니다. DomPruner는 이 단계를 완전히 건너뜁니다: AST 파싱으로 DOM 노이즈(nav, 광고, 스크립트, 푸터)를 제거하고, **원문 콘텐츠를 Claude의 컨텍스트에 직접 전달**합니다.

중간 모델이 페이지를 처리하지 않으므로 요약 오버헤드가 없습니다 — 구조적 핵심만 남긴 실제 텍스트가 그대로 전달됩니다. 결과적으로 **원본 HTML 대비 97–99% 토큰 절감**, API 키, Vector DB, 임베딩 모두 불필요합니다.

```
> [DomPruner] stripe.com
> | Raw HTML  | 305,778 tokens |
> | Refined   |     988 tokens |
> | Reduction |        99.7%   |
> Fetch: 1,546ms · Parse: 8.2ms
```

**개발자 문서, API 레퍼런스, 릴리즈 노트, 기술 스펙**에 최적화되어 있습니다 — 정확한 문구가 중요하고 요약으로 인한 정밀도 손실이 허용되지 않는 콘텐츠에 적합합니다.

---

## 빠른 시작

설치 없이, API 키 없이:

```bash
npx -y dompruner-mcp
```

### Claude Code

프로젝트 루트의 `.mcp.json`에 추가 (전역 설정은 `~/.claude/.mcp.json`):

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

Claude Code에서 `/mcp`를 실행하면 `dompruner_fetch`와 `dompruner_analyze`가 목록에 나타납니다.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 또는 `%APPDATA%\Claude\claude_desktop_config.json` (Windows) 수정:

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

Claude Desktop을 재시작하면 툴이 자동으로 나타납니다.

### Cursor / Windsurf / 기타 MCP 클라이언트

클라이언트의 MCP 설정 파일(`.cursor/mcp.json` 등)에 동일한 `mcpServers` 블록을 추가:

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

### 환경 변수

| 변수 | 필수 여부 | 설명 |
|------|-----------|------|
| `BRAVE_API_KEY` | 선택 | Brave Search API를 통한 `dompruner_search` 활성화. 미설정 시 DuckDuckGo HTML 스크래핑으로 대체. |

다른 환경 변수는 필요하지 않습니다.

---

## 도구

### `dompruner_fetch`

URL을 가져와 DOM 정제된 Markdown을 반환합니다.

```
dompruner_fetch(url?, query?)
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `url` | string | 조건부* | 가져올 페이지 URL |
| `query` | string | 선택 | 검색 의도 — BM25+ 섹션 필터링 활성화 |

*`url`을 생략하고 `query`만 제공하면, DomPruner는 MCP 샘플링(`createMessage`)을 통해 호스트 LLM에게 URL 해석을 요청합니다. 클라이언트가 샘플링을 지원하지 않는 경우, LLM이 먼저 검색한 뒤 URL을 찾아 `dompruner_fetch`를 다시 호출하도록 안내합니다.

**응답 형식:**

```
> [DomPruner] fastapi.tiangolo.com
> |           | Tokens |
> |-----------|--------|
> | Raw HTML  | 35,905 |
> | Refined   |  2,011 |
> | Reduction |  94.4% |
> Fetch: 83ms · Parse: 20.7ms

# First Steps

The simplest FastAPI file could look like this:
...
```

### `dompruner_analyze`

전체 페이지 콘텐츠 없이 토큰 절감 리포트와 Semantic Anchor 목록을 반환합니다 — 수집 전 페이지 감사에 유용합니다.

```
dompruner_analyze(url)
```

렌더 타입(SSR / SSG / CSR), 원본 vs 정제 토큰 수, 절감률, 발견된 heading 및 메타 앵커 목록을 보고합니다.

### `dompruner_workflow` 프롬프트

서버는 연결 시 호스트 LLM에 `dompruner_workflow` 프롬프트를 전달하여 올바른 사용 패턴을 주입합니다:

- **URL 알고 있을 때** → `dompruner_fetch(url)` 직접 호출
- **URL 모를 때** → 네이티브 웹 검색으로 URL을 찾은 뒤 `dompruner_fetch(url)` 호출

DomPruner는 콘텐츠 정제를 담당하고, URL 탐색은 호스트 LLM의 역할입니다.

---

## 동작 방식

```
URL
 └─▶ fetchPage()       — 단계적 fetch: 직접 → UA 로테이션 → Playwright 폴백
      │
      ├─▶ [SSG]  extractSsgMarkdown()
      │           __NEXT_DATA__ RSC 트리 탐색 → 클린 Markdown  (≥ 90% 절감)
      │           DOM 파싱 완전 생략
      │
      └─▶ [SSR/CSR]  <script>/<style>/<svg> 사전 제거 (80–92% 크기 감소)
                └─▶ parse5 DOM 트리
                     └─▶ FQN 라우터 (L1)        p / h1–h5 / li / pre / code 유지
                          │                      nav / footer / aside / form 제거
                          └─▶ Heading Cluster (L2)  개발자 문서 구조 탐지
                               └─▶ CETD 엔진 (L3)  텍스트 밀도 점수 폴백
                                    └─▶ BM25+ 섹션 필터  쿼리 인식 랭킹
                                         └─▶ Semantic Anchor  heading 계층 + 메타
                                              └─▶ Compact Markdown  ──▶  LLM 컨텍스트
```

### 렌더 타입 탐지

| 타입 | 신호 | 전략 |
|------|------|------|
| SSG | `__NEXT_DATA__`, `window.__NUXT__`, `window.page` | RSC 트리 탐색 — DOM 파싱 생략 |
| SSR | 본문 텍스트 밀도 ≥ 2% | 전체 DOM AST 파이프라인 (L1→L2→L3) |
| CSR | 본문 텍스트 밀도 < 2% | DOM AST 파이프라인 (부분 콘텐츠) |

### 단계적 Fetch

많은 문서 사이트에서 일반 HTTP 요청이 실패합니다(HTTP 403, UA 차단, JS 게이팅). DomPruner는 포기하기 전 세 단계를 시도합니다:

| 단계 | 트리거 | 방법 |
|------|--------|------|
| L1 | 기본 | 네이티브 `fetch` |
| L2 | 403 / 429 응답 | User-Agent 로테이션 (3종 브라우저 UA) |
| L3 | CSR 감지 또는 L2 실패 | `playwright-core` 헤드리스 브라우저 |

`playwright-core`는 선택적 의존성입니다 — L3가 필요한 경우에만 설치:

```bash
npm install playwright-core
npx playwright install chromium
```

### BM25+ 섹션 필터

`query`가 제공되면 추출된 섹션을 BM25+ 점수로 랭킹합니다. 두 가지 가중치 조정이 적용됩니다:

- **Heading 부스트 (2.5×)** — 관련 heading 아래의 섹션이 더 높게 랭킹되어 사이드바 노이즈 억제
- **깊이 감쇠 (0.4)** — 깊이 중첩된 섹션은 최상위 콘텐츠보다 낮은 점수
- **조상 보존** — 선택된 섹션의 부모 heading은 항상 컨텍스트를 위해 포함

결과: 가장 관련성 높은 섹션만 설정 가능한 토큰 예산 내에서 LLM 컨텍스트에 포함됩니다.

---

## 벤치마크

4개 카테고리의 실제 사이트 9곳 테스트. 모든 수치는 실제 fetch 결과입니다.

*토큰 추정: 한국어 ÷ 2, 기타 ÷ 4 문자/토큰.*

| 사이트 | 카테고리 | Raw HTML | Chunk RAG | DomPruner | **DomPruner+BM25** | **절감률** |
|--------|----------|:--------:|:---------:|:---------:|:------------------:|:----------:|
| Stripe API | API 문서 | 305,767 | 1,255 | 1,495 | **988** | **99.7%** |
| Anthropic API | API 문서 | 236,773 | 1,255 | 2,255 | **979** | **99.6%** |
| GitHub REST | API 문서 | 71,434 | 1,255 | 500 | **500** | **99.3%** |
| TypeScript Handbook | 언어 | 47,334 | 1,180 | 303 | **303** | **99.4%** |
| MDN Fetch API | 언어 | 38,087 | 1,194 | 726 | **726** | **98.1%** |
| React useState | 프레임워크 | 110,966 | 1,255 | 5,491 | **1,158** | **99.0%** |
| FastAPI | 프레임워크 | 38,300 | 1,255 | 3,436 | **1,029** | **97.3%** |
| Wikipedia REST | 일반 | 44,816 | 1,255 | 3,283 | **1,158** | **97.4%** |
| Wikipedia AST | 일반 | 44,551 | 1,255 | 2,758 | **1,106** | **97.5%** |
| **평균** | | | **1,240** | **2,250** | **883** | **98.6%** |

DomPruner+BM25는 Chunk RAG 대비 평균 **29% 더 적은 토큰**을 사용합니다.

### vs Chunk RAG

| | Chunk RAG | **DomPruner+BM25** |
|---|:---:|:---:|
| 평균 출력 토큰 | ~1,240 | **~883 (29% 감소)** |
| 원본 HTML 대비 토큰 절감 | ~99% | **~99%** |
| Heading / 구조 보존 | 쿼리 의존적 | 일관적 |
| 추가 인프라 | 임베딩 API + Vector DB | **없음** |
| 사전 쿼리 필요 | 필수 | 선택 사항 |
| 처리 오버헤드 | ~100ms+ (임베딩 API) | **~1ms** |
| SSG 사이트 (Next.js / Nuxt) | DOM 스크래핑 | **RSC 트리 탐색** |
| 청크 경계 컨텍스트 단절 | 있음 | 없음 |

---

## 아키텍처

```
src/
  mcp-server.ts          — MCP stdio 전송 + 툴/프롬프트 핸들러
  pipeline.ts            — 오케스트레이터: fetch → parse → extract → rules → serialize
                           5분 TTL URL 캐시 포함
  ast/
    fetcher.ts           — 단계적 HTTP fetch (네이티브 → UA 로테이션 → Playwright)
    parser.ts            — 사전 제거(<script>/<style>/<svg>) + parse5 DOM 빌더
    core-extractor.ts    — L1→L2→L3 추출 캐스케이드
    fqn-router.ts        — L1: FQN 시맨틱 셀렉터 매칭 + 노이즈 제거
    heading-cluster.ts   — L2: 개발자 문서용 heading-block 클러스터링
    cetd.ts              — L3: 콘텐츠/태그 밀도 점수 폴백
    ssg-extractor.ts     — Next.js / Nuxt / Gatsby __NEXT_DATA__ RSC 트리 탐색
    anchor.ts            — Semantic Anchor 추출 (title, meta description, h1–h3)
  middleware/
    serializer.ts        — FQNNode[] → Compact Markdown + 토큰 추정기
  rule-engine/
    registry.ts          — URL 패턴 → Rule 세트 해석 및 체이닝
    types.ts             — Rule 인터페이스 정의
    builtin/
      section-bm25.ts    — BM25+ (heading 부스트 + 조상 보존)
      http-endpoint.ts   — HTTP 메서드/경로/응답 블록 재포맷터
      code-signature.ts  — 코드 블록 함수/클래스 시그니처 추출기
```

---

## 개발

```bash
git clone https://github.com/dong7812/dompruner-mcp.git
cd dompruner-mcp
npm install
npm run dev    # tsx watch — 빌드 단계 불필요
npm run build  # tsc → dist/
```

로컬 툴 호출 테스트:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"dompruner_fetch","arguments":{"url":"https://fastapi.tiangolo.com","query":"routing"}}}' \
  | npm run dev 2>/dev/null
```

---

## 로드맵

- [#1](https://github.com/dong7812/dompruner-mcp/issues/1) — Content-Type 라우팅을 통한 PDF & Office 파일 추출
- [#2](https://github.com/dong7812/dompruner-mcp/issues/2) — `dompruner_crawl` MCP 툴 + sitemap.xml 지원을 통한 BFS 사이트 크롤
- [#3](https://github.com/dong7812/dompruner-mcp/issues/3) — 이미지 콘텐츠 추출 (로컬 OCR / 선택적 VLM 캡셔닝)
- [#4](https://github.com/dong7812/dompruner-mcp/issues/4) — 구조화된 JSON 출력 모드 (결정론적 HTML 추출 + 선택적 LLM 스키마)

---

## 라이선스

MIT
