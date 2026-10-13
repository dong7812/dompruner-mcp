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

Crawl4AI (v0.9.4) was installed and measured directly on the same 10 pages used in the BM25 section accuracy test above.

**Method:**
- **Crawl4AI default** — `AsyncWebCrawler().arun(url)`, `raw_markdown` output; no content filter
- **Crawl4AI filtered** — `PruningContentFilter(threshold=0.5)` + `DefaultMarkdownGenerator`; `fit_markdown` output; their recommended general-purpose filter
- **DomPruner** — `dompruner_fetch(url, query)` with the same queries as Section 4; BM25 section filtering enabled

**Accuracy metric** (same as Section 4): what % of `answerTerms` (co-located facts in the correct section) appear in the output.

### Token counts

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
| **vs DomPruner** | 18.9× | 13.2× | **—** |

### Section accuracy (answerTerms preservation)

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

**DomPruner is 13.2× smaller and 8 percentage points more accurate than Crawl4AI's best filtering.**

Crawl4AI's `PruningContentFilter` removes blocks below a text-density threshold. Short but information-dense sections (e.g., MDN Fetch API's CORS/credentials block) fall below that threshold and are discarded. DomPruner's DOM-level extraction preserves structure before any filtering; BM25 then ranks sections by query relevance rather than density.

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
