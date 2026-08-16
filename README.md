# dompruner-mcp

[한국어](./README.ko.md) | English

![DOM Tree Pruning for DomPruner](assets/banner.png)

> DOM AST middleware for LLM web pipelines — strips nav/ads/scripts via AST parsing, passes original content token-efficient to any LLM.

When an LLM uses the built-in WebFetch, a smaller model pre-processes the HTML and hands back a summarized result — adding latency, cost, and interpretation you didn't ask for. DomPruner skips that entirely: DOM AST parsing strips noise and passes the **original content directly to the model**.

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

| Metric | WebFetch | **DomPruner** |
|---|:---:|:---:|
| Avg context tokens | ~15,735 | **~1,019 (93.5% less)** |
| Answer quality (10 queries) | 9 / 10 | **8 / 10** |
| Avg response time | 5,811 ms | **3,168 ms (45% faster)** |
| Content fidelity | Summarized by small model | **Original text preserved** |
| Extra API key / infra | No | **No** |

→ **[Full benchmark](https://github.com/dong7812/dompruner-mcp/blob/main/docs/benchmark.md)** · **[Architecture](https://github.com/dong7812/dompruner-mcp/blob/main/docs/architecture.md)**

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

