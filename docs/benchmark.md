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
