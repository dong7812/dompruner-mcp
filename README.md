# dompruner-mcp

[한국어](./README.ko.md) | English

![DOM Tree Pruning for DomPruner](assets/banner.png)

> Claude reads the actual page — no small model in between, no summarization loss.

When Claude uses the built-in WebFetch, a smaller model pre-processes the raw HTML and hands Claude a summarized result — adding latency, cost, and a layer of interpretation you didn't ask for. DomPruner skips that step entirely: it strips DOM noise (nav, ads, scripts, footers) via AST parsing and passes the **original content directly to Claude's context**.

Because no intermediate model touches the page, there is no summarization overhead — just the real text, pruned to its structural core. The result: **93.5% fewer context tokens than WebFetch** on average, no API key, no Vector DB, no embedding required.

```
> [DomPruner] docs.python.org
> | Raw HTML          | 44,316 tokens |
> | DomPruner 정제 후 |  1,328 tokens |
> | 절감              |        97.0%  |
> Fetch: 194ms · Parse: 11.2ms

# WebFetch context: 21,783 tokens → DomPruner: 1,328 tokens (93.9% reduction)
```

Best suited for **developer documentation, API references, release notes, and technical specs** — content where the exact wording matters and summarization loses precision.

---

## Quick Start

No installation, no API key:

```bash
npx -y dompruner-mcp
```

### Claude Code

Add to `.mcp.json` in your project root (or `~/.claude/.mcp.json` for global):

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

Run `/mcp` in Claude Code to verify — you should see `dompruner` with `dompruner_fetch` and `dompruner_analyze` listed.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop. Tools appear in the tool picker automatically.

### Cursor / Windsurf / other MCP clients

Add the same `mcpServers` block to your client's MCP config file (`.cursor/mcp.json`, etc.):

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

No separate package needed. [`langchain-mcp-adapters`](https://pypi.org/project/langchain-mcp-adapters/) wraps any MCP stdio server as LangChain tools automatically:

```bash
pip install langchain-mcp-adapters
```

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
# dompruner_fetch and dompruner_analyze are now LangChain-compatible tools
```

The same pattern works for **CrewAI**, **LlamaIndex**, and any other framework with MCP support.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAVE_API_KEY` | No | Enables `dompruner_search` via Brave Search API. Falls back to DuckDuckGo HTML scraping if unset. |

No other environment variables are needed.

---

## Ensuring Your AI Always Uses DomPruner

DomPruner's tool description already tells clients to prefer `dompruner_fetch` over WebFetch. If your client still falls back to its built-in fetch, add the rule below to its persistent instruction file:

```markdown
When retrieving a URL, always use dompruner_fetch instead of WebFetch.
- URL known → dompruner_fetch(url, query?)
- URL unknown → search for the URL first, then dompruner_fetch(url)
```

| Client | Instruction file |
|--------|-----------------|
| Claude Code | `CLAUDE.md` (project) or `~/.claude/CLAUDE.md` (global) |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Continue | `config.json` → `systemMessage` field |

---

## Tools

### `dompruner_fetch`

Fetch a URL and return DOM-refined Markdown.

```
dompruner_fetch(url?, query?)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | No* | Page to fetch and refine |
| `query` | string | No | Search intent — enables BM25+ section filtering |

*If `url` is omitted and only `query` is provided, DomPruner requests URL resolution from the host LLM via MCP sampling (`createMessage`). If the client does not support sampling, a guide is returned asking the LLM to search first and call `dompruner_fetch` again with the resolved URL.

**Response format:**

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

Returns a token-reduction report and Semantic Anchor list without the full page content — useful for auditing a page before retrieval.

```
dompruner_analyze(url)
```

Reports: render type (SSR / SSG / CSR), raw vs refined token counts, reduction %, and the list of headings and meta anchors found.

### `dompruner_workflow` prompt

The server registers an `dompruner_workflow` prompt that is delivered to the host LLM on connection. It sets the correct usage pattern:

- **URL known** → call `dompruner_fetch(url)` directly
- **URL unknown** → use native web search to resolve the URL, then call `dompruner_fetch(url)`

DomPruner handles content refinement; URL discovery is the host LLM's job.

---

## How It Works

```
URL
 └─▶ fetchPage()       — tiered fetch: direct → UA rotation → Playwright fallback
      │
      ├─▶ [SSG]  extractSsgMarkdown()
      │           walks __NEXT_DATA__ RSC tree → clean Markdown  (≥ 90% reduction)
      │           skips DOM parse entirely
      │
      └─▶ [SSR/CSR]  pre-strip <script>/<style>/<svg>  (80–92% size ↓)
                └─▶ parse5 DOM Tree
                     └─▶ FQN Router (L1)        keeps p / h1–h5 / li / pre / code
                          │                      prunes nav / footer / aside / form
                          └─▶ Heading Cluster (L2)  dev-doc structure detection
                               └─▶ CETD Engine (L3)  text-density scoring fallback
                                    └─▶ BM25+ Section Filter  query-aware ranking
                                         └─▶ Semantic Anchor  heading hierarchy + meta
                                              └─▶ Compact Markdown  ──▶  LLM context
```

### Render Type Detection

| Type | Signal | Strategy |
|------|--------|----------|
| SSG | `__NEXT_DATA__`, `window.__NUXT__`, `window.page` | RSC tree walk — DOM parse skipped |
| SSR | Body text density ≥ 2% | Full DOM AST pipeline (L1→L2→L3) |
| CSR | Body text density < 2% | DOM AST pipeline (partial content) |

### Tiered Fetch

Plain HTTP fails silently on many documentation sites (HTTP 403, UA blocks, JS-gated content). DomPruner runs three tiers before giving up:

| Level | Trigger | Method |
|-------|---------|--------|
| L1 | Default | Native `fetch` |
| L2 | 403 / 429 response | User-Agent rotation (3 browser UA strings) |
| L3 | CSR detected or L2 fails | `playwright-core` headless browser |

`playwright-core` is an optional peer dependency — install it only if you need L3:

```bash
npm install playwright-core
npx playwright install chromium
```

### BM25+ Section Filter

When `query` is provided, the extracted sections are ranked by BM25+ score. Two weighting adjustments are applied:

- **Heading boost (2.5×)** — sections under a relevant heading rank higher, suppressing sidebar noise
- **Depth decay (0.4)** — deeply nested sections score lower than top-level content
- **Ancestor preservation** — parent headings of selected sections are always included for context

Result: only the most relevant sections enter the LLM context, within a 1,200-token budget.

**Zero-score fallback:** if the query terms appear nowhere in the document (BM25 max score = 0), DomPruner automatically returns the full clean content instead of the filtered subset. This is the only threshold-free reliable signal — no arbitrary cutoff, no small model. On semantic queries where vocabulary doesn't directly match the document, the LLM still receives the full noise-reduced content (~3,000 tokens vs ~50,000 raw HTML) and reasons directly. The stats block marks this case:

```
> [DomPruner] typescriptlang.org  `[BM25: no match → full content]`
> | Raw HTML            | 47,334 |
> | DomPruner 정제 후   |    303 |
> | 절감                | 99.4%  |
```

---

## Benchmark

All numbers are **live measurements** against Claude's built-in WebFetch — the tool DomPruner replaces. Reproducible scripts in [`loadtest/`](./loadtest/).

**Method:**
- **WebFetch path** — `web_fetch_20260209` server tool (the actual Anthropic-hosted fetch Claude uses); context token count = `input_tokens` from the API response
- **DomPruner path** — `dompruner_fetch` → DOM AST extraction + BM25 section filter; context token count = `refined_tokens`
- **Answer model** — Claude Haiku for both paths (identical model, fair comparison)

---

### 1. Context Tokens

How many tokens actually enter the LLM's context window per page fetch.

`†` BM25 zero-score: query terms absent from document → full clean content returned automatically (no model, no threshold).

| Site | WebFetch | **DomPruner** | **Reduction** | Mode |
|------|:--------:|:-------------:|:-------------:|:----:|
| Python asyncio | 21,783 | **1,328** | **93.9%** | BM25 |
| Rust Book ch04 | 10,083 | **718** | **92.9%** | BM25 |
| React useState | 12,347 | **1,324** | **89.3%** | BM25 |
| FastAPI Body | 10,903 | **1,229** | **88.7%** | BM25 |
| MDN Fetch API | 15,965 | **1,368** | **91.4%** | BM25 |
| Stripe API | 2,960 | **916** | **69.1%** | BM25 |
| Next.js Routing | 6,263 | **1,215** | **80.6%** | BM25 |
| Wikipedia (LLM) | 56,754 | **679** | **98.8%** | BM25 |
| TypeScript Handbook | 8,729 | **303** | **96.5%** | full† |
| Vue Reactivity | 11,560 | **1,105** | **90.4%** | BM25 |
| **Average** | **15,735** | **1,019** | **93.5%** | |

---

### 2. Answer Quality

10 edge-case queries spanning factual lookup, code examples, conceptual questions, semantic mismatches, and graceful no-answer handling. Claude Haiku answers from each path's output; a separate Haiku judge evaluates whether the answer addresses the question (language-agnostic).

| Query type | DomPruner | WebFetch | Notes |
|---|:---:|:---:|---|
| Factual — `asyncio.create_task` return type | ❌ | ✅ | Info spread across page; BM25 1,200-tok budget excluded it |
| Code example — FastAPI request body | ✅ | ✅ | |
| Conceptual — React state immutability | ✅ | ✅ | |
| Semantic fallback — Vue Proxy internals | ✅ | ✅ | BM25 score > 0; correct section selected |
| Deep content — TypeScript `infer` keyword | ✅ | ✅ | |
| Troubleshooting — CORS `Access-Control-Allow-Origin` | ✅ | ✅ | |
| Completeness — Stripe Charge object fields | ✅ | ✅ | |
| No-answer — page author / publish date | ✅ | ✅ | Both correctly said "not in content" |
| Cross-page — App Router vs Pages Router diff | ❌ | ❌ | URL only covers App Router; both paths lack the data |
| Semantic mismatch — "is useState fast?" | ✅ | ✅ | BM25 retrieved relevant perf section despite vague query |
| **Result** | **8 / 10** | **9 / 10** | |

**Where DomPruner falls short:** when the answer is distributed across a page and the BM25 token budget (1,200 tok) doesn't fit every relevant section. Increasing the budget via `tokenBudget` option resolves this for most cases.

**Where both fail:** queries that require comparing information across multiple URLs — a single-URL middleware boundary, not a DomPruner-specific limitation.

---

### 3. Response Time

End-to-end: from "I have a URL and a question" to "I have an answer."

- DomPruner = `runPipeline` (fetch + parse + BM25) + Haiku inference on ~1,500 tok
- WebFetch = single Haiku API call with `web_fetch` tool (fetch + inference on ~17,000 tok, all in one turn)

| Query type | DomPruner | WebFetch | Faster |
|---|:---:|:---:|:---:|
| Factual | 1,934 ms | 4,517 ms | **DP −2,583 ms** |
| Code example | 2,892 ms | 5,876 ms | **DP −2,984 ms** |
| Conceptual | 3,220 ms | 6,035 ms | **DP −2,815 ms** |
| Semantic fallback | 4,943 ms | 6,946 ms | **DP −2,003 ms** |
| Deep content | 2,680 ms | 7,083 ms | **DP −4,403 ms** |
| Troubleshooting | 3,762 ms | 6,428 ms | **DP −2,666 ms** |
| Completeness | 5,097 ms | 5,907 ms | **DP −810 ms** |
| No-answer | 1,856 ms | 3,663 ms | **DP −1,807 ms** |
| Cross-page | 1,986 ms | 5,478 ms | **DP −3,492 ms** |
| Semantic mismatch | 3,311 ms | 6,180 ms | **DP −2,869 ms** |
| **Average** | **3,168 ms** | **5,811 ms** | **DP −2,643 ms (45% faster)** |

DomPruner is faster in all 10 cases. The gap is largest on pages where WebFetch pulls large context (Wikipedia, Stripe) — more tokens in context means more inference time.

---

### Summary

| Metric | WebFetch | **DomPruner** |
|---|:---:|:---:|
| Avg context tokens | ~15,735 | **~1,019 (93.5% less)** |
| Answer quality (10 queries) | 9 / 10 | **8 / 10** |
| Avg response time | 5,811 ms | **3,168 ms (45% faster)** |
| Content fidelity | Summarized by small model | **Original text preserved** |
| Extra API key / infra | No | **No** |
| SSG sites (Next.js / Nuxt) | DOM scrape | **RSC tree walk** |
| Semantic query fallback | Silent degradation | **Full content, auto** |

DomPruner trades 1 quality point (one factual case where info was spread across the page) for a **93.5% token reduction and 45% faster responses**. For agentic workflows that make multiple web fetches per session, the compounding savings are significant.

---

## Research Backing

**Web page context is too large for LLM agents — a recognized research problem**
FocusAgent (Oct 2025) confirms that web pages routinely exceed tens of thousands of tokens, saturating context limits and increasing cost. Their LLM-based retriever achieves 50%+ observation size reduction. DomPruner achieves 90%+ reduction via deterministic DOM AST + BM25 — no intermediate model, no hallucination risk in the preprocessing step.
→ [FocusAgent: Simple Yet Effective Ways of Trimming the Large Context of Web Agents (2025)](https://arxiv.org/abs/2510.03204)

**Relevant information in long contexts is systematically missed**
LLM performance follows a U-shaped curve over input position: accuracy degrades 30%+ when relevant content is positioned in the middle of a long context. Reducing from ~15K to ~1K tokens structurally eliminates this problem.
→ [Lost in the Middle: How Language Models Use Long Contexts — Liu et al., Stanford (2023)](https://arxiv.org/abs/2307.03172)

**BM25 is the strongest scalable retrieval default**
A 2026 controlled scaling study shows BM25 overtaking agentic search at 10M corpus tokens, leading by ~20 points at full scale while remaining Pareto-optimal without LLM-based construction. BM25 is also directly cited in FocusAgent's related work as an established DOM pruning technique.
→ [BM25 Wins at Scale: A Scaling Study of RAG Paradigms (2026)](https://arxiv.org/abs/2607.26497)

---

## Architecture

```
src/
  mcp-server.ts          — MCP stdio transport + tool/prompt handlers
  pipeline.ts            — Orchestrator: fetch → parse → extract → rules → serialize
                           Includes 5-min TTL URL cache
  ast/
    fetcher.ts           — Tiered HTTP fetch (native → UA rotation → Playwright)
    parser.ts            — Pre-strip (<script>/<style>/<svg>) + parse5 DOM builder
    core-extractor.ts    — L1→L2→L3 extraction cascade
    fqn-router.ts        — L1: FQN semantic selector matching + noise pruning
    heading-cluster.ts   — L2: heading-block clustering for developer docs
    cetd.ts              — L3: Content/Tag-Density scoring fallback
    ssg-extractor.ts     — Next.js / Nuxt / Gatsby __NEXT_DATA__ RSC tree walk
    anchor.ts            — Semantic anchor extraction (title, meta description, h1–h3)
  middleware/
    serializer.ts        — FQNNode[] → Compact Markdown + token estimator
  rule-engine/
    registry.ts          — URL pattern → Rule set resolution and chaining
    types.ts             — Rule interface definitions
    builtin/
      section-bm25.ts    — BM25+ with heading boost + ancestor preservation
      http-endpoint.ts   — HTTP method/path/response block reformatter
      code-signature.ts  — Code block function/class signature extractor
```

---

## Development

```bash
git clone https://github.com/dong7812/dompruner-mcp.git
cd dompruner-mcp
npm install
npm run dev    # tsx watch — no build step needed
npm run build  # tsc → dist/
```

To test a tool call locally:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"dompruner_fetch","arguments":{"url":"https://fastapi.tiangolo.com","query":"routing"}}}' \
  | npm run dev 2>/dev/null
```

---

## Roadmap

- [#1](https://github.com/dong7812/AST-RAG-MCP/issues/1) — PDF & Office file extraction via Content-Type routing
- [#2](https://github.com/dong7812/AST-RAG-MCP/issues/2) ~~BFS site crawl via `dompruner_crawl` MCP tool + sitemap.xml support~~ → **Done** — `dompruner_sitemap` tool ships in v0.4.0
- [#3](https://github.com/dong7812/AST-RAG-MCP/issues/3) — Image content extraction (local OCR / opt-in VLM captioning)
- [#4](https://github.com/dong7812/AST-RAG-MCP/issues/4) — Structured JSON output mode (deterministic HTML extraction + opt-in LLM schema)

---

## Related

- **[dompruner-py](https://github.com/dong7812/dompruner-py)** — Python port. Provides `DomPrunerLoader` (LangChain `BaseLoader`), `DomPrunerFetchTool` (LangChain `BaseTool`), and `DomPrunerSitemapLoader` for full-site ingestion. Install via `pip install dompruner`.
- **[LangChain integrations overview](https://docs.langchain.com/oss/python/integrations/document_loaders)** — dompruner-py is listed as a third-party web loader. LangChain's current policy links out to maintainer repos rather than hosting integration docs directly.

---

## License

MIT
