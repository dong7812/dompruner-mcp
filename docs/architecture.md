# Architecture

## Pipeline

```
URL
 └─▶ fetchPage()       — tiered fetch: direct → UA rotation → Playwright fallback
      │
      ├─▶ [SSG]  extractSsgMarkdown()
      │           walks __NEXT_DATA__ RSC tree → clean Markdown
      │           falls back to DOM pipeline if payload structure unrecognised
      │
      └─▶ [SSR/CSR]  DOM AST pipeline
                └─▶ FQN Router (L1)        keeps p / h1–h5 / li / pre / code / table
                     │                     prunes nav / footer / aside / form
                     └─▶ Heading Cluster (L2)  dev-doc structure detection
                          └─▶ CETD Engine (L3)  text-density scoring fallback
                               └─▶ BM25+ Section Filter  query-aware ranking
                                    └─▶ Compact Markdown  ──▶  LLM context
```

---

## Render Type Detection

| Type | Signal | Strategy |
|------|--------|----------|
| SSG | `__NEXT_DATA__`, `window.__NUXT__`, `window.page` | RSC tree walk; falls back to DOM pipeline if structure unrecognised |
| SSR | Body text density ≥ 2% | Full DOM AST pipeline (L1→L2→L3) |
| CSR | Body text density < 2% | DOM AST pipeline on sparse HTML; Playwright retry attempted |

---

## Tiered Fetch

| Level | Trigger | Method |
|-------|---------|--------|
| L1 | Default | Native `fetch` |
| L2 | 403 / 429 response | User-Agent rotation (3 browser UA strings) |
| L3 | CSR detected or L2 exhausted | `playwright-core` headless browser (optional) |

`playwright-core` is an optional peer dependency:

```bash
npm install playwright-core
npx playwright install chromium
```

---

## BM25+ Section Filter

When `query` is provided **and** extracted content exceeds 1,200 tokens **and** there are more than 2 sections, sections are scored and ranked. Three adjustments over standard BM25:

- **Heading boost (2.5×)** — sections under a relevant heading rank higher
- **Depth decay (0.4)** — deeply nested nodes score lower than top-level content
- **Ancestor preservation** — parent headings of selected sections always included for context

Sections are selected greedily until a 1,200-token budget is reached.

**Zero-score fallback:** if query terms match nothing (BM25 max = 0), full clean content is returned instead of an empty result. `bm25Confidence` is set to `0` in this case.

---

## Cache

2-tier page-fault cache:

```
L1 (result cache): key = url+query+rules  LRU 256  TTL 5 min
L2 (fetch cache):  key = url              LRU 64   TTL 2 min
```

**Page-fault flow:**
```
L1 hit → return immediately

L1 miss
  └─ per-URL Semaphore(limit=1) acquired
       L2 hit  → sem released → run pipeline on cached HTML → store L1
       L2 miss → HTTP fetch → store L2 → sem released → run pipeline → store L1
```

Same URL with different queries reuses L2 (HTML fetch skipped). Semaphore failure releases the slot so the next waiter retries independently.

---

## Module Map

```
src/
  mcp-server.ts          — MCP stdio transport + tool/prompt handlers
  pipeline.ts            — Orchestrator: fetch → parse → extract → rules → serialize
                           2-tier LRU+TTL cache + per-URL Semaphore
  ast/
    fetcher.ts           — Tiered HTTP fetch (native → UA rotation → Playwright)
    parser.ts            — Pre-strip (<script>/<style>/<svg>) + parse5 DOM builder
    core-extractor.ts    — L1→L2→L3 extraction cascade
    fqn-router.ts        — L1: FQN semantic selector + noise pruning
    heading-cluster.ts   — L2: heading-block clustering for developer docs
    cetd.ts              — L3: Content/Tag-Density scoring fallback
    ssg-extractor.ts     — Next.js / Nuxt / Gatsby __NEXT_DATA__ RSC tree walk
    anchor.ts            — Semantic anchor extraction (title, meta, h1–h3)
    sitemap.ts           — sitemap.xml recursive URL collector
  middleware/
    serializer.ts        — FQNNode[] → Compact Markdown + token estimator
  rule-engine/
    registry.ts          — URL pattern → Rule set resolution
    types.ts             — Rule interface
    builtin/
      section-bm25.ts    — BM25+ with heading boost + ancestor preservation
      http-endpoint.ts   — HTTP method/path/response block reformatter
      code-signature.ts  — Code block function/class signature extractor
```
