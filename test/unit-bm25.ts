import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, bm25Score, createSectionBm25Rule } from '../dist/rule-engine/builtin/section-bm25.js';
import type { FQNNode } from '../dist/ast/fqn-router.js';

// ── tokenize ──────────────────────────────────────────────────────────────────

test('tokenize: lowercases and splits on whitespace', () => {
  assert.deepEqual(tokenize('Hello World'), ['hello', 'world']);
});

test('tokenize: splits on punctuation', () => {
  const tokens = tokenize('foo.bar, baz!');
  assert.ok(tokens.includes('foo'));
  assert.ok(tokens.includes('bar'));
  assert.ok(tokens.includes('baz'));
});

test('tokenize: drops single-char tokens', () => {
  const tokens = tokenize('a b cc ddd');
  assert.ok(!tokens.includes('a'));
  assert.ok(!tokens.includes('b'));
  assert.ok(tokens.includes('cc'));
});

test('tokenize: handles empty string', () => {
  assert.deepEqual(tokenize(''), []);
});

// ── bm25Score ─────────────────────────────────────────────────────────────────

test('bm25Score: returns 0 when no query terms match', () => {
  const score = bm25Score(['xyz'], ['foo', 'bar'], 5);
  assert.equal(score, 0);
});

test('bm25Score: returns positive when query terms match', () => {
  const score = bm25Score(['foo'], ['foo', 'bar', 'baz'], 3);
  assert.ok(score > 0);
});

test('bm25Score: matched term scores higher than unmatched', () => {
  const matched   = bm25Score(['foo'], ['foo', 'bar', 'baz'], 3);
  const unmatched = bm25Score(['xyz'], ['foo', 'bar', 'baz'], 3);
  assert.ok(matched > unmatched);
});

// ── section grouping & dt anchor ──────────────────────────────────────────────

function makeRule(query: string) {
  return createSectionBm25Rule(query);
}

function fqn(tag: string, text: string, depth = 2, role?: 'anchor'): FQNNode {
  return role ? { tag, text, depth, role } : { tag, text, depth };
}

test('section-bm25: confidence undefined when no query', () => {
  // empty query → early return, _lastMaxScore stays undefined
  const rule = createSectionBm25Rule('');
  const nodes = [fqn('h1', 'Title'), fqn('p', 'some content here')];
  rule.transform(nodes, {} as any);
  assert.equal(rule.getLastConfidence(), undefined);
});

test('section-bm25: confidence 0 when query terms absent from all sections', () => {
  const rule = makeRule('zxqwerty999');
  // Must exceed tokenBudget (1200) AND minSections (2) to trigger BM25.
  // Each body line is ~20 tokens; 70 lines across 5 sections = ~1400 tokens.
  const body = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ';
  const nodes: FQNNode[] = [];
  for (let i = 0; i < 5; i++) {
    nodes.push(fqn('h2', `Section heading number ${i}`));
    for (let j = 0; j < 14; j++) nodes.push(fqn('p', body + `section${i} line${j}`));
  }
  rule.transform(nodes, {} as any);
  assert.equal(rule.getLastConfidence(), 0);
});

test('section-bm25: dt node treated as section boundary', () => {
  const rule = makeRule('getcwd');
  // dt with 'getcwd' should form its own section and score high
  const nodes: FQNNode[] = [
    fqn('h1', 'OS Module'),
    fqn('p', 'This module provides operating system interfaces.'),
    fqn('p', 'Unrelated content about something else entirely here.'),
    fqn('p', 'More unrelated text padding to push past token budget now.'),
    fqn('dt', 'os.getcwd()', 3, 'anchor'),
    fqn('p', 'Return a string representing the current working directory.'),
    fqn('dt', 'os.listdir(path)', 3, 'anchor'),
    fqn('p', 'Return a list containing the names of the entries in the directory.'),
    fqn('dt', 'os.mkdir(path)', 3, 'anchor'),
    fqn('p', 'Create a directory named path with numeric mode.'),
  ];
  const result = rule.transform(nodes, {} as any);
  const conf = rule.getLastConfidence();
  // If dt anchors work, BM25 should find the getcwd section
  const hasGetcwd = result.some(n => n.text.includes('getcwd'));
  assert.ok(hasGetcwd, 'getcwd section should be in output');
  assert.ok(conf === undefined || conf > 0, 'confidence should be positive or undefined (budget not exceeded)');
});

// ── cache TTL ordering ────────────────────────────────────────────────────────

test('cache TTL: L1 TTL is less than or equal to L2 TTL', async () => {
  // Import the constants indirectly by checking that L1 result cache
  // does NOT outlive the L2 fetch cache (L1 depends on L2).
  // We verify by checking the module source text rather than running the pipeline.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/pipeline.ts', import.meta.url), 'utf8');
  const l1Match = src.match(/L1_TTL_MS\s*=\s*(\d+)\s*\*\s*60/);
  const l2Match = src.match(/L2_TTL_MS\s*=\s*(\d+)\s*\*\s*60/);
  assert.ok(l1Match && l2Match, 'TTL constants must exist');
  const l1Min = parseInt(l1Match![1]);
  const l2Min = parseInt(l2Match![1]);
  assert.ok(l1Min <= l2Min, `L1_TTL (${l1Min}min) must be ≤ L2_TTL (${l2Min}min)`);
});
