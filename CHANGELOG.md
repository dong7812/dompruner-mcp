# Changelog

All notable changes to astrag-mcp are documented here.

## [0.1.0] — 2026-08-06

### Added

- `astrag_fetch(url, query?)` — fetch any URL and return DOM-refined Markdown with 90%+ token reduction
- `astrag_analyze(url)` — token reduction report + render type + Semantic Anchor list
- `astrag_workflow` prompt — injected on MCP connection to set correct usage pattern in the host LLM
- Tiered fetch: native HTTP → UA rotation (403/429) → Playwright fallback (CSR)
- SSR/SSG/CSR render type detection
- SSG path: `__NEXT_DATA__` RSC tree walk for Next.js / Nuxt sites (skips DOM parse)
- L1 FQN Router — CSS-path-level noise pruning (`nav`, `footer`, `aside`, `form`)
- L2 Heading Cluster — developer doc structure detection
- L3 CETD Engine — text-density scoring fallback
- BM25+ section filter with heading boost (2.5×), depth decay (0.4), and ancestor preservation
- Built-in rules: `http-endpoint`, `code-signature`
- 5-minute TTL URL cache
- MCP stdio transport via `@modelcontextprotocol/sdk`
