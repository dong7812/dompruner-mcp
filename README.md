# dompruner-mcp

[한국어](./README.ko.md) | English

![DOM Tree Pruning for DomPruner](assets/banner.png)

> Claude reads the actual page — no small model in between, no summarization loss.

When Claude uses the built-in WebFetch, a smaller model pre-processes the raw HTML and hands Claude a summarized result — adding latency, cost, and a layer of interpretation you didn't ask for. DomPruner skips that step entirely: it strips DOM noise (nav, ads, scripts, footers) via AST parsing and passes the **original content directly to Claude's context**.

Because no intermediate model touches the page, there is no summarization overhead — just the real text, pruned to its structural core. The result: **94–99% fewer tokens than raw HTML**, no API key, no Vector DB, no embedding required.

```
> [DomPruner] stripe.com
> | Raw HTML  | 305,778 tokens |
> | Refined   |     988 tokens |
> | Reduction |        99.7%   |
> Fetch: 1,546ms · Parse: 8.2ms
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

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAVE_API_KEY` | No | Enables `dompruner_search` via Brave Search API. Falls back to DuckDuckGo HTML scraping if unset. |

No other environment variables are needed.

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

Tested on 14 real-world sites across 4 categories. All numbers from live fetches with a representative technical query per page.

*Token estimation: ÷ 4 chars per token. `†` = BM25 no match → full clean content returned.*

| Site | Category | Raw HTML | **DomPruner** | **Reduction** | Mode |
|------|----------|:--------:|:-------------:|:-------------:|:----:|
| Stripe API | API Docs | 437,553 | **916** | **99.8%** | BM25 |
| Anthropic API | API Docs | 240,041 | **1,229** | **99.5%** | BM25 |
| Python asyncio | Language | 44,316 | **1,328** | **97.0%** | BM25 |
| Rust Book ch04 | Language | 14,004 | **718** | **94.9%** | BM25 |
| Go spec | Language | 84,601 | **1,154** | **98.6%** | BM25 |
| TypeScript Handbook | Language | 47,334 | **303** | **99.4%** | full† |
| MDN Fetch API | Language | 45,788 | **1,368** | **97.0%** | BM25 |
| Next.js Routing | Framework | 156,555 | **1,215** | **99.2%** | BM25 |
| React useState | Framework | 110,966 | **1,324** | **98.8%** | BM25 |
| FastAPI Body | Framework | 31,662 | **1,229** | **96.1%** | BM25 |
| Vue Reactivity | Framework | 38,378 | **1,105** | **97.1%** | BM25 |
| Kubernetes Pods | Framework | 132,892 | **1,709** | **98.7%** | BM25 |
| Wikipedia (LLM) | General | 268,164 | **679** | **99.7%** | BM25 |
| Hacker News | General | 8,784 | **923** | **89.5%** | full† |
| **AVERAGE** | | **118,646** | **1,086** | **97.5%** | |

`†` BM25 zero-score fallback: query terms absent from document → full DomPruner output returned automatically (no model, no threshold).

### vs Chunk RAG

| | Chunk RAG | **DomPruner** |
|---|:---:|:---:|
| Avg output tokens | ~1,255 | **~1,086 (13% less)** |
| Token reduction vs raw HTML | ~99% | **~97.5%** |
| Heading / structure preservation | Query-dependent | Consistent |
| Extra infrastructure | Embedding API + Vector DB | **None** |
| Query required upfront | Yes | No (optional) |
| Processing overhead | ~100 ms+ (embed API) | **~1 ms** |
| SSG sites (Next.js / Nuxt) | DOM scrape | **RSC tree walk** |
| Context breaks at chunk boundaries | Yes | No |
| Semantic query fallback | Degrades silently | **Full content, auto** |

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
git clone https://github.com/dong7812/AST-RAG-MCP.git
cd AST-RAG-MCP
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
- [#2](https://github.com/dong7812/AST-RAG-MCP/issues/2) — BFS site crawl via `dompruner_crawl` MCP tool + sitemap.xml support
- [#3](https://github.com/dong7812/AST-RAG-MCP/issues/3) — Image content extraction (local OCR / opt-in VLM captioning)
- [#4](https://github.com/dong7812/AST-RAG-MCP/issues/4) — Structured JSON output mode (deterministic HTML extraction + opt-in LLM schema)

---

## License

MIT
