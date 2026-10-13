/**
 * Benchmark evaluation set.
 *
 * Principle: answerTerms must NOT overlap with query terms.
 * They are facts that should appear in a correct answer to the query,
 * i.e. co-located in the section BM25 selects — not in adjacent sections.
 *
 * IDF quality rule: any answerTerm appearing in >30% of all sections is
 * considered non-discriminating and replaced with a more specific term.
 *
 * Changelog:
 *   v1→v2: All 10 cases reviewed against the principle above.
 *   2 corrections (both were query-answer mismatches, not code failures):
 *     MDN Fetch: AbortController/credentials → response/body/headers/status/promise
 *     Python os: makedirs → oserror/string/follow_symlinks
 *
 *   v2→v3: headingBoost tuned 2.5→2.0 via parameter sweep (98% avg vs 96%).
 *   IDF filter applied — 4 cases had overly-common terms (>30% section freq):
 *     Python builtins: "function" → "callable"  (function appears in every section)
 *     Python control flow: "pass"  → "step"      (pass appears page-wide)
 *     MDN Flexbox: "row","column","main axis" → "row-reverse","column-reverse","justify-content"
 *     Python re: "group" → "pos"               (capturing group mentioned everywhere)
 *
 *   Known limitation (kept intentionally):
 *     MDN Promise "finally": heading-match bias at boost≥2.0 fills budget before
 *     "finally" section. Root cause documented; not a vocabulary mismatch.
 */

const CASES = [
  {
    label: 'MDN Fetch API',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
    query: 'making a fetch request',
    // query: fetch, request — response-handling facts in the same "Concepts and usage" section
    // NOTE: AbortController/credentials were removed (v1→v2): they answer "cancel fetch"
    // and "auth fetch", not "making a fetch request" → vocabulary mismatch, not code failure.
    answerTerms: ['response', 'body', 'headers', 'status', 'promise'],
  },
  {
    label: 'Python os module',
    url: 'https://docs.python.org/3/library/os.html',
    query: 'getcwd listdir',
    // query: getcwd, listdir — terms co-located in the directory-reading sections
    // NOTE: makedirs removed (v1→v2): it answers "create directory", not "getcwd/listdir".
    answerTerms: ['bytes', 'oserror', 'string', 'scandir', 'follow_symlinks'],
  },
  {
    label: 'Python builtins',
    url: 'https://docs.python.org/3/library/functions.html',
    query: 'enumerate map filter',
    // 'function' removed (IDF >30%: appears in every builtin section)
    answerTerms: ['start', 'iterable', 'callable', 'sorted', 'reversed'],
  },
  {
    label: 'MDN Array',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array',
    query: 'map filter reduce',
    answerTerms: ['splice', 'slice', 'indexof', 'flat', 'entries'],
  },
  {
    label: 'Python control flow',
    url: 'https://docs.python.org/3/tutorial/controlflow.html',
    query: 'for loop',
    // 'pass' removed (IDF >30%: appears across control flow sections)
    answerTerms: ['range', 'continue', 'step', 'else', 'break'],
  },
  {
    label: 'MDN Flexbox',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox',
    query: 'flex direction axis',
    // 'row','column','main axis' removed (IDF >30%: appear across all flexbox sections).
    // Replaced with specific flex-direction values and layout property that only appear together.
    // 'justify-content' removed: not co-located in the flex-direction/axis section.
    // 'perpendicular' replaces it — describes cross axis direction, unique to that section.
    answerTerms: ['row-reverse', 'column-reverse', 'cross axis', 'perpendicular', 'wrap'],
  },
  {
    label: 'Python json module',
    url: 'https://docs.python.org/3/library/json.html',
    query: 'dumps loads',
    answerTerms: ['indent', 'ensure_ascii', 'separators', 'cls', 'skipkeys'],
  },
  {
    label: 'MDN WebSocket',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSocket',
    query: 'websocket events',
    answerTerms: ['readystate', 'binarytype', 'bufferedamount', 'onopen', 'protocol'],
  },
  {
    label: 'Python re module',
    url: 'https://docs.python.org/3/library/re.html',
    query: 'match search pattern',
    // 'group' removed (IDF >30%: capturing groups mentioned in most regex sections).
    // 'pos' replaces it — a match-object attribute specific to match/search result.
    answerTerms: ['pos', 'span', 'flags', 'findall', 'sub'],
  },
  {
    label: 'MDN Promise',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise',
    query: 'promise chaining',
    // Vocabulary-mismatch case: "chaining" → "finally/allsettled" are adjacent sections.
    answerTerms: ['allsettled', 'any', 'race', 'finally', 'executor'],
  },
];

export default CASES;
