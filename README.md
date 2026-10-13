# dompruner-mcp

[한국어](./README.ko.md) | English

![DOM Tree Pruning for DomPruner](assets/banner.png)

> DOM AST middleware for LLM web pipelines — strips layout noise (nav, scripts, sidebars) and passes original text directly. Add a query to filter to relevant sections with BM25.

When an LLM uses a web fetch tool, the raw page HTML is converted to text and passed into the model's context — often tens of thousands of tokens of navigation, sidebars, and boilerplate the model doesn't need. DomPruner strips that at the DOM level and passes only the **original content directly to the model**.

| Call | Behavior |
|---|---|
| `dompruner_fetch(url)` | Strips layout noise → returns full extracted content |
| `dompruner_fetch(url, query)` | Strips layout noise → BM25 filters to relevant sections (falls back to full content if no match) |

```
> [DomPruner] docs.python.org
> | Raw HTML  | 44,316 tokens |
> | DomPruner |  1,328 tokens |
> | Reduction |        97.0%  |
> Fetch: 194ms · Parse: 11.2ms
```

**93.5% fewer context tokens than WebFetch on average. 45% faster end-to-end.**
→ [Full benchmark](https://github.com/dong7812/dompruner-mcp/blob/main/docs/benchmark.md)

---

## Quick Start

No installation, no API key:

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

Add to `.mcp.json` in your project root, or `~/.claude/.mcp.json` for global. Run `/mcp` to verify.

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

### Cursor / Windsurf / other MCP clients

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

### Remote HTTP (no install, always up to date)

For clients that support HTTP transport — no Node.js install required, always runs the latest version:

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

[`langchain-mcp-adapters`](https://pypi.org/project/langchain-mcp-adapters/) wraps any MCP stdio server as LangChain tools automatically:

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

## Ensuring Your AI Always Uses DomPruner

DomPruner's tool description already tells clients to prefer `dompruner_fetch` over WebFetch. If your client still falls back, add this to its instruction file:

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

---

## Tools

| Tool | Description |
|------|-------------|
| `dompruner_fetch` | Fetch a URL → DOM-refined Markdown. Optional `query` enables BM25+ section filtering. |
| `dompruner_sitemap` | Fetch all pages in a sitemap.xml → one refined Document per page. |
| `dompruner_analyze` | Token-reduction report for a URL without full content. |

→ **[Full tool reference](https://github.com/dong7812/dompruner-mcp/blob/main/docs/tools.md)**

---

## Benchmark Summary

### vs WebFetch (live comparison, Claude Haiku)

Measured using Anthropic's `web_fetch_20260209` server tool — the tool fetches the URL, converts HTML to markdown, and passes the full content into the model's context. `input_tokens` from the Claude API response captures the actual page tokens, with both paths run under identical conditions (same model, same system prompt, same tool definitions).

| Metric | `web_fetch` tool | **DomPruner** |
|---|:---:|:---:|
| Avg context tokens | ~15,735 | **~1,019 (93.5% less)** |
| Answer quality (10 queries) | 9 / 10 | **8 / 10** |
| Avg response time | 5,811 ms | **3,168 ms (45% faster)** |
| Content fidelity | Raw page content (full HTML → text) | **DOM-extracted original text** |
| Extra API key / infra | No | **No** |

### BM25 Section Accuracy (snapshot-based, deterministic)

| Set | Pages | Avg reduction | Section preservation |
|---|:---:|:---:|:---:|
| Tuning (MDN, docs.python.org) | 10 | 98.0% | **98.0%** |
| **Validation (held-out sites)** | 5 | 98.7% | **96.0%** |

headingBoost=2.0 was selected by running a parameter sweep (1.0–3.0) on the tuning set. The validation set uses five sites not present in the tuning set (react.dev, typescriptlang.org, expressjs.com, doc.rust-lang.org, nextjs.org) to confirm the result is not overfit. The 2 %p gap is within the known heading-bias limitation.

→ **[Full benchmark](https://github.com/dong7812/dompruner-mcp/blob/main/docs/benchmark.md)** · **[Architecture](https://github.com/dong7812/dompruner-mcp/blob/main/docs/architecture.md)**

---

## vs Crawl4AI

Crawl4AI is a crawler framework — browser automation, JS rendering, click/scroll interaction, JSON extraction, deep crawl. DomPruner is LLM context middleware — a single-purpose layer that reduces token cost when an agent already knows the URL.

**They solve different problems.** But both can be used to read a web page inside an MCP agent, so the comparison is real.

### Setup

| | Crawl4AI | **DomPruner** |
|---|:---:|:---:|
| Install | `pip install crawl4ai && crawl4ai-setup` (Chromium ~300 MB) | **`npx -y dompruner-mcp`** |
| Browser required | Default install includes Chromium; HTTP-only mode available | **No** (SSR; Playwright only on CSR detection) |
| MCP server | Requires running the Crawl4AI Docker server | **`npx -y dompruner-mcp` — no server** |
| Config to filter tokens | Pass a filter object in code (`BM25ContentFilter(user_query=...)`) | **Zero — just pass `query=`** |

### Held-out validation: 5 sites not in DomPruner's tuning set

The most defensible comparison: five sites that were **not** used to tune DomPruner's parameters (react.dev, typescriptlang.org, expressjs.com, doc.rust-lang.org, nextjs.org). Both tools use the same query.

| Page | C4AI BM25ContentFilter | **DomPruner** |
|------|:---:|:---:|
| React useEffect | 4,275 | **1,257** |
| TypeScript narrowing | 2,782 | **1,214** |
| Express routing | 1,938 | **1,799** |
| Rust ownership | 1,832 | **718** |
| Next.js layouts | 1,505 | **1,379** |
| **Total** | **12,332** | **6,367** |
| **Accuracy** | **96%** | **96%** |

**On sites DomPruner was not tuned on: 1.9× fewer tokens with the same accuracy (96%).**

### Tuning set: 10 pages (MDN, docs.python.org)

Three Crawl4AI modes against DomPruner for reference:
- **Default** — raw markdown (no filtering)
- **PruningContentFilter** — text-density heuristic filter (their general-purpose option)
- **BM25ContentFilter(user_query=...)** — their query-based filter using the same query as DomPruner

| Page | C4AI default | C4AI Pruning | C4AI BM25 | **DomPruner** |
|------|:---:|:---:|:---:|:---:|
| MDN Fetch API | 5,075 | 1,634 | 746 | **713** |
| Python os module | 89,957 | 83,786 | 31 | **1,758** |
| Python builtins | 34,144 | 29,344 | 741 | **755** |
| MDN Array | 18,987 | 12,350 | 85 | **1,207** |
| Python control flow | 13,865 | 11,671 | 461 | **1,362** |
| MDN Flexbox | 47,258 | 6,134 | 3,015 | **1,797** |
| Python json module | 11,867 | 9,626 | 16 | **1,998** |
| MDN WebSocket | 5,163 | 1,375 | 282 | **704** |
| Python re module | 25,382 | 21,531 | 9,777 | **1,837** |
| MDN Promise | 11,068 | 6,064 | 3,493 | **1,767** |
| **Total** | **262,766** | **183,515** | **18,647** | **13,898** |
| **vs DomPruner** | 18.9× more | 13.2× more | 1.3× more | **—** |

#### Accuracy on tuning set

| Page | C4AI Pruning | C4AI BM25 | **DomPruner** |
|------|:---:|:---:|:---:|
| MDN Fetch API | 20% ✗ | 20% ✗ | **100% ✓** |
| Python os module | 100% ✓ | 0% ✗ | **100% ✓** |
| Python builtins | 100% ✓ | 0% ✗ | **100% ✓** |
| MDN Array | 100% ✓ | 0% ✗ | **100% ✓** |
| Python control flow | 100% ✓ | 60% ✓ | **100% ✓** |
| MDN Flexbox | 100% ✓ | 100% ✓ | **100% ✓** |
| Python json module | 100% ✓ | 0% ✗ | **100% ✓** |
| MDN WebSocket | 80% ✓ | 0% ✗ | **100% ✓** |
| Python re module | 100% ✓ | 80% ✓ | **100% ✓** |
| MDN Promise | 100% ✓ | 100% ✓ | 80% ✓ |
| **Avg** | **90%** | **36%** | **98%** |

**Why BM25ContentFilter returns near-empty on 5 of 10 pages:** `BM25ContentFilter` operates on block-level chunks from Crawl4AI's HTML-to-markdown converter. Python docs and MDN API reference pages use `<dl>/<dt>/<dd>` definition-list structure — each function or property is isolated in its own tiny block. A threshold sweep from 0.0 to 0.10 shows a cliff at threshold=0.01: below it, the full page is returned (17,000–77,000 tokens, 100% accuracy); above it, near-empty output (16–741 tokens, 0% accuracy). There is no intermediate threshold that gives both accurate and compact output on these pages. Setting threshold=0.0 recovers accuracy but disables filtering entirely. Prose-heavy pages (React, TypeScript, Rust — as shown in the validation set above) have larger mixed-content sections where `BM25ContentFilter` works correctly at 96% accuracy.

**Why PruningContentFilter drops the MDN Fetch API CORS section:** text-density heuristics discard content-rich but short sections. DomPruner is **13.2× smaller** and **8 pp more accurate** than PruningContentFilter.

---

## Related

- **[dompruner-py](https://github.com/dong7812/dompruner-py)** — Python port. `DomPrunerLoader`, `DomPrunerSitemapLoader`, `DomPrunerFetchTool` for LangChain. `pip install dompruner`.
- **[LangChain integrations](https://docs.langchain.com/oss/python/integrations/document_loaders)** — dompruner-py listed as a third-party web loader.

---

## Glama Score
[![dompruner-mcp MCP server](https://glama.ai/mcp/servers/dong7812/dompruner-mcp/badges/card.svg)](https://glama.ai/mcp/servers/dong7812/dompruner-mcp)

---
## License

MIT

