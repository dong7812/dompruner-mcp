#!/usr/bin/env node
/**
 * DomPruner benchmark: token reduction + information preservation rate
 *
 * Preservation rate = (answerTerms found in output) / total answerTerms
 *
 * Design rule: answerTerms must NOT overlap with query terms.
 * BM25 selects sections by query keywords — checking those same keywords
 * would be circular. answerTerms are co-located facts the algorithm must
 * happen to preserve as a side effect of selecting the right sections.
 *
 * Usage:  node scripts/benchmark.mjs [--json]
 */

import { runPipeline } from '../dist/pipeline.js';

const CASES = [
  {
    label: 'MDN Fetch API',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
    query: 'making a fetch request',
    // query: fetch, request — answerTerms are co-located API names NOT in query
    answerTerms: ['abortcontroller', 'signal', 'readablestream', 'credentials', 'mode'],
  },
  {
    label: 'Python os module',
    url: 'https://docs.python.org/3/library/os.html',
    query: 'getcwd listdir',
    // query: getcwd, listdir — answer must include related params/returns
    answerTerms: ['bytes', 'encoding', 'scandir', 'makedirs', 'environ'],
  },
  {
    label: 'Python builtins',
    url: 'https://docs.python.org/3/library/functions.html',
    query: 'enumerate map filter',
    // query: enumerate, map, filter — check non-query builtins preserved nearby
    answerTerms: ['start', 'iterable', 'function', 'sorted', 'reversed'],
  },
  {
    label: 'MDN Array',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array',
    query: 'map filter reduce',
    // query: map, filter, reduce — check mutation/accessor methods nearby
    answerTerms: ['splice', 'slice', 'indexof', 'flat', 'entries'],
  },
  {
    label: 'Python control flow',
    url: 'https://docs.python.org/3/tutorial/controlflow.html',
    query: 'for loop',
    // query: for, loop — check co-located control-flow concepts
    answerTerms: ['range', 'continue', 'pass', 'else', 'break'],
  },
  {
    label: 'MDN Flexbox',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox',
    query: 'flex direction axis',
    // query: flex, direction, axis — check layout properties NOT in query
    answerTerms: ['justify-content', 'align-items', 'flex-wrap', 'order', 'cross'],
  },
  {
    label: 'Python json module',
    url: 'https://docs.python.org/3/library/json.html',
    query: 'dumps loads',
    // query: dumps, loads — check encoding options NOT in query
    answerTerms: ['indent', 'ensure_ascii', 'separators', 'cls', 'skipkeys'],
  },
  {
    label: 'MDN WebSocket',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSocket',
    query: 'websocket events',
    // query: websocket, events — check API surface NOT in query
    answerTerms: ['readystate', 'binarytype', 'bufferedamount', 'onopen', 'protocol'],
  },
  {
    label: 'Python re module',
    url: 'https://docs.python.org/3/library/re.html',
    query: 'match search pattern',
    // query: match, search, pattern — check return types / flags NOT in query
    answerTerms: ['group', 'span', 'flags', 'findall', 'sub'],
  },
  {
    label: 'MDN Promise',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise',
    query: 'promise chaining',
    // query: promise, chaining — check concurrency methods NOT in query
    answerTerms: ['allsettled', 'any', 'race', 'finally', 'executor'],
  },
];

const asJson = process.argv.includes('--json');

function preservation(markdown, terms) {
  const lower = markdown.toLowerCase();
  const found = terms.filter(t => lower.includes(t.toLowerCase()));
  return { found: found.length, total: terms.length, rate: found.length / terms.length };
}

function bar(ratio, width = 10) {
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

if (!asJson) {
  console.log('\nDomPruner Benchmark — token reduction + information preservation');
  console.log('(preservation measured on answer terms NOT present in query)\n');
  console.log('─'.repeat(93));
}

const rows = [];
let totalOriginal = 0, totalRefined = 0;

for (const c of CASES) {
  if (!asJson) process.stdout.write(`  Fetching: ${c.label} ... `);
  try {
    const r = await runPipeline(c.url, { query: c.query });
    const p = preservation(r.markdown, c.answerTerms);
    totalOriginal += r.originalTokens;
    totalRefined  += r.refinedTokens;
    rows.push({ ...c, r, p });
    if (!asJson) console.log(`done (${r.refinedTokens.toLocaleString()} tok, ${(p.rate*100).toFixed(0)}% preserved)`);
  } catch (e) {
    rows.push({ ...c, error: e.message });
    if (!asJson) console.log(`ERROR: ${e.message}`);
  }
}

const successRows  = rows.filter(r => !r.error);
const avgReduction = 1 - totalRefined / totalOriginal;
const avgPreserved = successRows.reduce((s, r) => s + r.p.rate, 0) / successRows.length;
const above80      = successRows.filter(r => r.p.rate >= 0.8).length;

if (asJson) {
  const output = {
    avgReductionPct: +(avgReduction * 100).toFixed(1),
    avgPreservationPct: +(avgPreserved * 100).toFixed(1),
    above80of: `${above80}/${successRows.length}`,
    pages: successRows.map(r => ({
      label: r.label,
      originalTokens: r.r.originalTokens,
      refinedTokens: r.r.refinedTokens,
      reductionPct: +(r.r.reductionRatio * 100).toFixed(1),
      preservationPct: +(r.p.rate * 100).toFixed(0),
      missingTerms: r.answerTerms.filter(t => !r.r.markdown.toLowerCase().includes(t)),
    })),
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

console.log('\n' + '─'.repeat(93));
console.log(
  'Page'.padEnd(28) +
  'Original'.padStart(10) +
  'Refined'.padStart(10) +
  'Reduction'.padStart(11) +
  '  Preserved'.padEnd(20) +
  'Missing terms',
);
console.log('─'.repeat(93));

for (const row of rows) {
  if (row.error) {
    console.log(row.label.padEnd(28) + '  ERROR: ' + row.error);
    continue;
  }
  const reduction = (row.r.reductionRatio * 100).toFixed(1) + '%';
  const presRate  = (row.p.rate * 100).toFixed(0) + '%';
  const missing   = row.answerTerms.filter(t => !row.r.markdown.toLowerCase().includes(t));
  console.log(
    row.label.padEnd(28) +
    row.r.originalTokens.toLocaleString().padStart(10) +
    row.r.refinedTokens.toLocaleString().padStart(10) +
    reduction.padStart(11) +
    `  ${bar(row.p.rate)} ${presRate}`.padEnd(20) +
    (missing.length ? missing.join(', ') : '—'),
  );
}

console.log('─'.repeat(93));
console.log(
  'TOTAL / AVG'.padEnd(28) +
  totalOriginal.toLocaleString().padStart(10) +
  totalRefined.toLocaleString().padStart(10) +
  `${(avgReduction*100).toFixed(1)}%`.padStart(11) +
  `  ${bar(avgPreserved)} ${(avgPreserved*100).toFixed(1)}%`.padEnd(20),
);
console.log(`\n  ✦ Pages ≥80% preservation: ${above80}/${successRows.length}`);
console.log('─'.repeat(93) + '\n');
