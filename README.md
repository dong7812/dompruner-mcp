# astrag-mcp

> MCP server that cuts web page token cost by **90%+** via DOM AST extraction — no API key required.

AstRAG fetches a URL, walks the DOM as an Abstract Syntax Tree, strips noise (nav, ads, footers), and returns compact Markdown. The average raw HTML page costs ~50,000 tokens; AstRAG returns the same information in ~800 tokens.

## How it works

```
Raw HTML (50,000 tok)
  → FQN Router (L1)          — semantic selector matching
  → Heading-Block Cluster (L2) — dev-doc structure detection
  → CETD Engine (L3)         — text-density scoring fallback
  → BM25+ Section Filter     — query-aware ranking with H1/H2 skeleton
  → Compact Markdown (~800 tok)
```

## Quickstart — Claude Code

Add to your MCP config (`~/.claude/claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "astrag": {
      "command": "npx",
      "args": ["-y", "astrag-mcp"]
    }
  }
}
```

That's it — no API keys, no environment variables.

## Tools

### `astrag_fetch`

Fetch a URL and return DOM-refined Markdown with a token stats header.

```
astrag_fetch(url, query?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Page to fetch |
| `query` | string? | Search intent — enables BM25 section filtering |

**Response header** (always prepended):

```
> [AstRAG] stripe.com
> |                        | Tokens |
> |------------------------|--------|
> | Raw HTML               | 305,778 |
> | AstRAG refined         | 988     |
> | Saved                  | 304,790 (99.7%) |
> Fetch: 1546ms · Parse: 8.2ms
```

### `astrag_analyze`

Returns a token-reduction report without the full content — useful for quick audits.

```
astrag_analyze(url)
```

## Benchmark (9 sites, 2026-08)

| | Chunk RAG | AstRAG + BM25+ |
|--|-----------|----------------|
| Avg tokens | 1,240 | **883** |
| Avg reduction vs Raw | — | **98.6%** |
| Heading preservation wins | 1 / 9 | **4 / 9** (4 ties) |

Sites tested: Stripe API, GitHub REST, MDN, React.dev, FastAPI, Wikipedia ×2, Anthropic API, TypeScript Handbook.

## Prompts

The server exposes an `astrag_workflow` prompt that explains the correct usage pattern to the host LLM:

- **URL known** → call `astrag_fetch(url)` directly
- **URL unknown** → use native web search to find the URL, then call `astrag_fetch(url)`

AstRAG handles content refinement; URL discovery is left to the host.

## Architecture

```
src/
  mcp-server.ts          — MCP stdio transport + tool handlers
  pipeline.ts            — Orchestrator: fetch → parse → extract → rules → serialize
  ast/
    fetcher.ts           — Tiered HTTP: native → UA rotation → playwright fallback
    parser.ts            — parse5 HTML parser
    core-extractor.ts    — L1→L2→L3 cascade
    fqn-router.ts        — L1: FQN semantic selector matching
    heading-cluster.ts   — L2: heading-block clustering for dev docs
    cetd.ts              — L3: text-density CETD scoring
    ssg-extractor.ts     — Next.js / Nuxt / Gatsby RSC payload extraction
    anchor.ts            — Semantic anchor extraction (title, meta, h1-h3)
  middleware/
    serializer.ts        — FQNNode[] → Markdown + token estimation
  rule-engine/
    registry.ts          — Rule resolution and chaining
    builtin/
      section-bm25.ts    — BM25+ with H1/H2 skeleton + ancestor preservation
      http-endpoint.ts   — HTTP method/path/response reformatter
      code-signature.ts  — Code block signature extraction
```

## Fetching strategy

| Level | Trigger | Method |
|-------|---------|--------|
| L1 | Default | Native `fetch` |
| L2 | 403 / 429 | User-Agent rotation (3 agents) |
| L3 | CSR detected or L2 fails | `playwright-core` (optional dep) |

playwright-core is not in `dependencies` — install separately only if you need CSR rendering:

```bash
npm install playwright-core
npx playwright install chromium
```

## Development

```bash
git clone https://github.com/dong7812/astrag-mcp
cd astrag-mcp
npm install
npm run dev    # runs mcp-server via tsx (no build step)
npm run build  # tsc → dist/
```

## License

MIT
