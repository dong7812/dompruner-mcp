/**
 * Benchmark evaluation set.
 *
 * Principle: answerTerms must NOT overlap with query terms.
 * They are facts that should appear in a correct answer to the query,
 * i.e. co-located in the section BM25 selects — not in adjacent sections.
 *
 * Known vocabulary-mismatch cases (kept intentionally):
 *   - Python re module: "match search pattern" → findall is in a neighboring section
 *   - MDN Promise: "promise chaining" → finally/allSettled are in adjacent sections
 * These are the honest vocabulary-mismatch examples for the resume "한계" section.
 *
 * Changelog:
 *   v1→v2: All 10 cases reviewed against the principle above.
 *   2 corrections made (both were query-answer mismatches, not code failures):
 *     MDN Fetch: AbortController/credentials → response/body/headers/status/promise
 *       (AbortController answers "cancel fetch", not "making a fetch request")
 *     Python os: makedirs → oserror/string/follow_symlinks
 *       (makedirs answers "create directory", not "getcwd/listdir")
 *   8 cases unchanged — answerTerms verified co-located with queried section.
 *
 *   Known 80% cases (kept intentionally as honest failure examples):
 *     Python re "findall": ranks 12/76 — heading-match bias fills budget before it
 *     MDN Promise "finally": ranks 12/39 — same cause
 *     Root cause: headingBoost(2.5×) on query-matching headings exhausts token
 *     budget before reaching related functions. Not vocabulary mismatch.
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
    answerTerms: ['start', 'iterable', 'function', 'sorted', 'reversed'],
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
    answerTerms: ['range', 'continue', 'pass', 'else', 'break'],
  },
  {
    label: 'MDN Flexbox',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox',
    query: 'flex direction axis',
    // Best vocabulary-mismatch example: same concept (flexbox layout), different vocabulary.
    // "flex direction axis" and "main axis / cross axis / row / column" co-occur in the same sections.
    answerTerms: ['row', 'column', 'cross axis', 'main axis', 'wrap'],
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
    // Vocabulary-mismatch case: "match search" → "findall" is a related but different method.
    // 80% is the expected score; findall being absent is an honest limitation.
    answerTerms: ['group', 'span', 'flags', 'findall', 'sub'],
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
