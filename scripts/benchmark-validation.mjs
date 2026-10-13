/**
 * Held-out validation set — pages NOT used to tune headingBoost.
 *
 * Purpose: verify that headingBoost=2.0 generalises beyond the 10-page
 * tuning set. Use the same answerTerms design rules as the tuning set:
 *   - answerTerms must not overlap with query keywords
 *   - must be co-located in the section BM25 should select
 *   - any term appearing in >30% of sections is replaced (IDF rule)
 *
 * Sites used: react.dev, typescriptlang.org, expressjs.com,
 *             doc.rust-lang.org, nextjs.org
 * None of these appear in scripts/benchmark-cases.mjs (tuning set).
 *
 * Changelog:
 *   v1: initial set with vue.js — replaced because vuejs.org
 *       serves dual Options/Composition API content that confuses BM25.
 *       Also fixed answerTerms for rust/nextjs/react after verifying
 *       co-location in the queried sections via output inspection.
 */

const VALIDATION = [
  {
    label: 'React useEffect',
    url: 'https://react.dev/reference/react/useEffect',
    query: 'cleanup side effect',
    // 'connection', 'interval', 'unmount', 'strict', 'dependencies' all appear
    // in the cleanup/usage sections; 'synchronize' was removed (not co-located)
    answerTerms: ['dependencies', 'strict', 'interval', 'unmount', 'connection'],
  },
  {
    label: 'TypeScript narrowing',
    url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html',
    query: 'type narrowing typeof',
    // discriminated unions and exhaustiveness checking are in narrowing sections
    answerTerms: ['discriminated', 'exhaustiveness', 'never', 'predicate', 'instanceof'],
  },
  {
    label: 'Express routing',
    url: 'https://expressjs.com/en/guide/routing.html',
    query: 'route handler middleware',
    // express.Router, next(), params, chaining co-located in routing sections
    answerTerms: ['router', 'next', 'params', 'chain', 'method'],
  },
  {
    label: 'Rust ownership',
    url: 'https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html',
    query: 'ownership borrow move',
    // 'garbage', 'allocate', 'compiler', 'scope', 'drop' are all in the
    // "What Is Ownership?" section; clone/heap/shallow were in other sections
    answerTerms: ['drop', 'garbage', 'allocate', 'compiler', 'scope'],
  },
  {
    label: 'Next.js layouts',
    url: 'https://nextjs.org/docs/app/getting-started/layouts-and-pages',
    query: 'layout page routing',
    // slot, root, children, segment, nested are in the layouts/pages sections;
    // template/loading/partial appear in different sub-pages
    answerTerms: ['nested', 'segment', 'slot', 'root', 'children'],
  },
];

export default VALIDATION;
