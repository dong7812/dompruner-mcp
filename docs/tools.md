# Tool Reference

## `dompruner_fetch`

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
...
```

---

## `dompruner_sitemap`

Fetch all pages listed in a sitemap.xml and return DOM-refined Markdown for each.

```
dompruner_sitemap(sitemap_url, query?, filter_urls?, max_pages?, concurrency?, ignore_errors?)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sitemap_url` | string | required | URL of the sitemap.xml |
| `query` | string | — | BM25 filter query applied to every page |
| `filter_urls` | string[] | — | Only include pages whose URL starts with one of these prefixes |
| `max_pages` | number | 20 | Max pages to fetch (hard cap: 100) |
| `concurrency` | number | 8 | Max simultaneous page fetches |
| `ignore_errors` | boolean | true | If false, any fetch error aborts the entire crawl |

Handles sitemap indexes (sitemaps of sitemaps) automatically via recursive URL collection.

---

## `dompruner_analyze`

Returns a token-reduction report without full page content — useful for auditing before retrieval.

```
dompruner_analyze(url)
```

Reports: render type (SSR / SSG / CSR), raw vs refined token counts, reduction %, and Semantic Anchors (headings + meta).

---

## `dompruner_workflow` prompt

Registered on connection. Sets the correct usage pattern for the host LLM:

- **URL known** → call `dompruner_fetch(url)` directly
- **URL unknown** → use native web search to resolve the URL, then call `dompruner_fetch(url)`

DomPruner handles content refinement; URL discovery is the host LLM's job.
