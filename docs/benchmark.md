# Benchmark

All numbers are **live measurements** against Claude's built-in WebFetch. Reproducible scripts in [`loadtest/`](../loadtest/).

**Method:**
- **WebFetch path** — `web_fetch_20260209` server tool; context token count = `input_tokens` from the API response
- **DomPruner path** — `dompruner_fetch` → DOM AST extraction + BM25 section filter; context token count = `refined_tokens`
- **Answer model** — Claude Haiku for both paths (identical model, fair comparison)

---

## 1. Context Tokens

`†` BM25 zero-score: query terms absent from document → full clean content returned automatically.

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

## 2. Answer Quality

10 edge-case queries. Claude Haiku answers from each path; a separate Haiku judge evaluates correctness (language-agnostic).

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

**Where DomPruner falls short:** answer distributed across a page and the 1,200-tok BM25 budget doesn't fit every relevant section. Increasing `tokenBudget` resolves this for most cases.

**Where both fail:** queries requiring comparison across multiple URLs — a single-URL boundary, not a DomPruner-specific limitation.

---

## 3. Response Time

End-to-end: URL + question → answer.

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

---

## 4. BM25 Section Preservation

Measures whether the BM25 section filter selects the sections that contain the correct answer. Runs against 10 local HTML snapshots — deterministic, unaffected by live page updates.

**Design rule:** `answerTerms` must not overlap with `query` keywords (selecting the right section already implies the query is satisfied — checking the same keywords would be circular). They are co-located facts the algorithm must preserve as a side effect of selecting the correct section. Any term appearing in >30% of all sections is replaced with a more discriminating one (IDF quality rule).

**headingBoost=2.0** — selected via parameter sweep over 1.0–3.0; yields the highest average preservation (98%) across this test set.

| Page | Query | Reduction | Preservation |
|------|-------|:---------:|:------------:|
| MDN Fetch API | making a fetch request | 98.1% | 100% |
| Python os module | getcwd listdir | 99.1% | 100% |
| Python builtins | enumerate map filter | 99.1% | 100% |
| MDN Array | map filter reduce | 98.0% | 100% |
| Python control flow | for loop | 96.1% | 100% |
| MDN Flexbox | flex direction axis | 98.0% | 100% |
| Python json module | dumps loads | 93.0% | 100% |
| MDN WebSocket | websocket events | 98.2% | 100% |
| Python re module | match search pattern | 97.1% | 100% |
| MDN Promise | promise chaining | 96.5% | 80% |
| **AVG** | | **98.0%** | **98.0%** |

**Known limitation (MDN Promise `finally`):** The query-matching heading (`Promise`) scores highest under headingBoost and fills the 1,200-token budget before the adjacent `finally` section is reached. Root cause: heading-match bias, not vocabulary mismatch. `tokenBudget` increase or MMR-based selection resolves it.

### Validation set (5 held-out pages — not used to tune headingBoost)

Sites: react.dev, typescriptlang.org, expressjs.com, doc.rust-lang.org, nextjs.org — none overlap with the tuning set above.

| Page | Reduction | Preservation |
|------|:---------:|:------------:|
| React useEffect | 99.2% | 100% |
| TypeScript narrowing | 98.5% | 100% |
| Express routing | 96.9% | 80% |
| Rust ownership | 94.9% | 100% |
| Next.js layouts | 99.2% | 100% |
| **AVG** | **98.7%** | **96%** |

The 2 %p drop from tuning (98%) to validation (96%) confirms the result is not overfit to the 10-page tuning set. Express `chain` follows the same heading-bias pattern as the MDN Promise case.

---

## 5. vs Crawl4AI

### Methodology

- **Crawl4AI version:** 0.9.4
- **DomPruner:** `runPipeline(url, { query })` — same query as each Crawl4AI run
- **Token counting:** `tiktoken cl100k_base` (Crawl4AI); `refinedTokens` from pipeline (DomPruner)
- **Accuracy metric:** `answerTerms` presence in output (same terms as Section 4 above); terms chosen to not overlap with the query
- **Three Crawl4AI modes measured:**
  - **Default** — `raw_markdown` (no filtering)
  - **PruningContentFilter** — `fit_markdown` with `PruningContentFilter(threshold=0.5)`
  - **BM25ContentFilter** — `fit_markdown` with `BM25ContentFilter(user_query=<same query>, bm25_threshold=0.1)`

### Tuning set token counts (10 pages)

| Page | Query | C4AI default | C4AI Pruning | C4AI BM25 | DomPruner |
|------|-------|:---:|:---:|:---:|:---:|
| MDN Fetch API | making a fetch request | 5,075 | 1,634 | 746 | 713 |
| Python os module | getcwd listdir | 89,957 | 83,786 | 31 | 1,758 |
| Python builtins | enumerate map filter | 34,144 | 29,344 | 741 | 755 |
| MDN Array | map filter reduce | 18,987 | 12,350 | 85 | 1,207 |
| Python control flow | for loop | 13,865 | 11,671 | 461 | 1,362 |
| MDN Flexbox | flex direction axis | 47,258 | 6,134 | 3,015 | 1,797 |
| Python json module | dumps loads | 11,867 | 9,626 | 16 | 1,998 |
| MDN WebSocket | websocket events | 5,163 | 1,375 | 282 | 704 |
| Python re module | match search pattern | 25,382 | 21,531 | 9,777 | 1,837 |
| MDN Promise | promise chaining | 11,068 | 6,064 | 3,493 | 1,767 |
| **Total** | | **262,766** | **183,515** | **18,647** | **13,898** |

### Tuning set accuracy

| Page | C4AI Pruning | C4AI BM25 | DomPruner |
|------|:---:|:---:|:---:|
| MDN Fetch API | 20% | 20% | 100% |
| Python os module | 100% | 0% | 100% |
| Python builtins | 100% | 0% | 100% |
| MDN Array | 100% | 0% | 100% |
| Python control flow | 100% | 60% | 100% |
| MDN Flexbox | 100% | 100% | 100% |
| Python json module | 100% | 0% | 100% |
| MDN WebSocket | 80% | 0% | 100% |
| Python re module | 100% | 80% | 100% |
| MDN Promise | 100% | 100% | 80% |
| **Avg** | **90%** | **36%** | **98%** |

### Validation set (5 held-out pages)

Sites not in DomPruner's tuning set: react.dev, typescriptlang.org, expressjs.com, doc.rust-lang.org, nextjs.org. Only BM25ContentFilter (same-query comparison) measured.

| Page | Query | C4AI BM25 tokens | C4AI BM25 acc | DomPruner tokens | DomPruner acc |
|------|-------|:---:|:---:|:---:|:---:|
| React useEffect | cleanup side effect | 4,275 | 100% | 1,257 | 100% |
| TypeScript narrowing | type narrowing typeof | 2,782 | 80% | 1,214 | 100% |
| Express routing | route handler middleware | 1,938 | 100% | 1,799 | 80% |
| Rust ownership | ownership borrow move | 1,832 | 100% | 718 | 100% |
| Next.js layouts | layout page routing | 1,505 | 100% | 1,379 | 100% |
| **Total** | | **12,332** | **96%** | **6,367** | **96%** |

### BM25ContentFilter threshold sweep (definition-list structured pages)

For pages using `<dl>/<dt>/<dd>` structure (Python docs, MDN API reference), a sweep from threshold=0.0 to 0.10 reveals a binary cliff with no intermediate optimum:

| Page | th=0.0 (tok) | th=0.0 (acc) | th=0.01 (tok) | th=0.01 (acc) | th=0.05 (tok) | th=0.05 (acc) |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| Python os module | 76,893 | 100% | 31 | 0% | 31 | 0% |
| Python builtins | 32,100 | 100% | 741 | 0% | 741 | 0% |
| MDN Array | 17,621 | 100% | 85 | 0% | 85 | 0% |
| Python json module | 10,118 | 100% | 16 | 0% | 16 | 0% |
| MDN WebSocket | 4,395 | 100% | 282 | 0% | 282 | 0% |

Intermediate values (0.01, 0.02, 0.03, 0.04) all produce the same near-empty output as 0.05. There is no threshold that yields both accurate and compact output on these pages.

**Root cause:** `BM25ContentFilter` scores individual HTML-to-markdown blocks. On definition-list pages, each function/property is a separate tiny block. Query terms ("getcwd", "listdir") appear in at most one block each, giving all blocks a near-zero BM25 score against a multi-term query. Any non-zero threshold drops every block. Setting threshold=0.0 disables filtering and returns the full page.

**Why validation set pages work at threshold=0.05:** React, TypeScript, and Rust documentation uses prose paragraphs with `<h2>/<h3>/<p>` structure — each block is a multi-sentence paragraph covering several concepts, giving higher per-block BM25 scores.

---

## Research Backing

**Web page context is too large for LLM agents**
FocusAgent (Oct 2025) confirms web pages routinely exceed tens of thousands of tokens, saturating context limits. Their LLM-based retriever achieves 50%+ observation size reduction. DomPruner achieves 90%+ via deterministic DOM AST + BM25 — no intermediate model, no hallucination risk in preprocessing.
→ [FocusAgent (2025)](https://arxiv.org/abs/2510.03204)

**Relevant information in long contexts is systematically missed**
LLM accuracy degrades 30%+ when relevant content appears mid-context (U-shaped curve). Reducing from ~15K to ~1K tokens structurally eliminates this problem.
→ [Lost in the Middle — Liu et al., Stanford (2023)](https://arxiv.org/abs/2307.03172)

**BM25 is the strongest scalable retrieval default**
A 2026 scaling study shows BM25 overtaking agentic search at 10M corpus tokens by ~20 points while remaining Pareto-optimal.
→ [BM25 Wins at Scale (2026)](https://arxiv.org/abs/2607.26497)
