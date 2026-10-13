# dompruner-mcp

[한국어](./README.ko.md) | English

![DOM Tree Pruning for DomPruner](assets/banner.png)

> DOM AST middleware for LLM web pipelines — strips layout noise (nav, scripts, sidebars) and passes original text directly. Add a query to filter to relevant sections with BM25.

When an LLM uses the built-in WebFetch, a smaller model pre-processes the HTML and hands back a summarized result — adding latency, cost, and interpretation you didn't ask for. DomPruner skips that entirely: DOM AST parsing strips noise and passes the **original content directly to the model**.

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

| Metric | WebFetch | **DomPruner** |
|---|:---:|:---:|
| Avg context tokens | ~15,735 | **~1,019 (93.5% less)** |
| Answer quality (10 queries) | 9 / 10 | **8 / 10** |
| Avg response time | 5,811 ms | **3,168 ms (45% faster)** |
| Content fidelity | Summarized by small model | **Original text preserved** |
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
| Browser required | Yes — Playwright/Chromium always | **No** (SSR; Playwright only on CSR detection) |
| API key / cloud | Required for MCP ($10/mo+) | **None** |
| Config to filter tokens | Manual `PruningContentFilter` setup | **Zero — just pass `query=`** |

### Token count: same 10 pages, measured today

DomPruner numbers use `dompruner_fetch(url, query)` (BM25 section filtering, the standard agent call).  
Crawl4AI numbers: `raw_markdown` (default output) and `fit_markdown` with `PruningContentFilter(threshold=0.5)` (their best general-purpose filtering option).

| Page | Crawl4AI default | Crawl4AI (PruningFilter) | **DomPruner** |
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
| **Total** | **262,766** | **183,515** | **13,898** |
| **vs DomPruner** | 18.9× more | 13.2× more | **—** |

### Accuracy: does the right content survive?

Token counts only matter if the answer is still in the output. We measured whether the correct section's key facts (`answerTerms`) appear in each tool's output — the same metric used in DomPruner's BM25 section accuracy test.

| Page | Crawl4AI (PruningFilter) | **DomPruner** |
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
| **Avg** | **90%** | **98%** |

DomPruner is **13.2× smaller** and **8 percentage points more accurate** than Crawl4AI's best filtering.

Crawl4AI's `PruningContentFilter` uses text-density heuristics that can drop content-rich but short sections (e.g., MDN Fetch API's CORS/credentials section). DomPruner's DOM-level extraction + BM25 section ranking preserves structure before any filtering decision is made.

> **Crawl4AI's MCP is a cloud service ($10/mo+).** DomPruner's MCP runs locally via `npx` for free.

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

