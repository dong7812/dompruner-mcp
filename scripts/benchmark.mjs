#!/usr/bin/env node
/**
 * DomPruner benchmark: token reduction + information preservation rate
 *
 * Preservation rate = (answerTerms found in output) / total answerTerms
 *
 * Design rule: answerTerms must NOT overlap with query terms.
 * BM25 selects sections by query keywords — checking those same keywords
 * would be circular. answerTerms are co-located facts the algorithm must
 * preserve as a side effect of selecting the right sections.
 * See scripts/benchmark-cases.mjs for the changelog.
 *
 * Usage:
 *   node scripts/benchmark.mjs          # pretty print (live fetch)
 *   node scripts/benchmark.mjs --json   # JSON output  (live fetch)
 *   node scripts/benchmark.mjs --check  # regression check against baseline
 *                                         uses snapshots/ if present, else live fetch
 */

import { readFileSync, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import CASES from './benchmark-cases.mjs';
import { runPipeline } from '../dist/pipeline.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dir, 'snapshots');

const asJson  = process.argv.includes('--json');
const asCheck = process.argv.includes('--check');

// ── snapshot loader ───────────────────────────────────────────────────────────

async function loadSnapshot(label) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const path = join(SNAP_DIR, `${slug}.json.gz`);
  if (!existsSync(path)) return null;
  const chunks = [];
  await streamPipeline(
    (await import('node:fs')).createReadStream(path),
    createGunzip(),
    new Writable({ write(chunk, _enc, cb) { chunks.push(chunk); cb(); } }),
  );
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// ── run benchmark ─────────────────────────────────────────────────────────────

function preservation(markdown, terms) {
  const lower = markdown.toLowerCase();
  const found = terms.filter(t => lower.includes(t.toLowerCase()));
  return { found: found.length, total: terms.length, rate: found.length / terms.length };
}

function bar(ratio, width = 10) {
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

if (!asJson && !asCheck) {
  console.log('\nDomPruner Benchmark — token reduction + information preservation');
  console.log('(preservation: answer terms NOT in query, co-located in queried section)\n');
  console.log('─'.repeat(93));
}

const rows = [];
let totalOriginal = 0, totalRefined = 0;

for (const c of CASES) {
  if (!asJson && !asCheck) process.stdout.write(`  ${c.label} ... `);
  try {
    // Use snapshot when available (--check mode for deterministic CI),
    // fall back to live fetch otherwise.
    const snap = (asCheck || !asJson) ? await loadSnapshot(c.label) : null;
    const opts = snap
      ? { query: c.query, prefetched: { html: snap.html, renderType: snap.renderType, ssgPayload: snap.ssgPayload } }
      : { query: c.query };
    const r = await runPipeline(c.url, opts);
    const p = preservation(r.markdown, c.answerTerms);
    totalOriginal += r.originalTokens;
    totalRefined  += r.refinedTokens;
    rows.push({ ...c, r, p, fromSnapshot: !!snap });
    if (!asJson && !asCheck) {
      const src = snap ? '[snap]' : '[live]';
      console.log(`${src} ${r.refinedTokens.toLocaleString()} tok, ${(p.rate*100).toFixed(0)}% preserved`);
    }
  } catch (e) {
    rows.push({ ...c, error: e.message });
    if (!asJson && !asCheck) console.log(`ERROR: ${e.message}`);
  }
}

const successRows  = rows.filter(r => !r.error);
const avgReduction = 1 - totalRefined / totalOriginal;
const avgPreserved = successRows.reduce((s, r) => s + r.p.rate, 0) / successRows.length;
const above80      = successRows.filter(r => r.p.rate >= 0.8).length;
const snapCount    = successRows.filter(r => r.fromSnapshot).length;

// ── --json output ─────────────────────────────────────────────────────────────

if (asJson) {
  const output = {
    avgReductionPct: +(avgReduction * 100).toFixed(1),
    avgPreservationPct: +(avgPreserved * 100).toFixed(1),
    above80of: `${above80}/${successRows.length}`,
    snapshotsUsed: snapCount,
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

// ── --check: per-page delta regression against baseline ───────────────────────

if (asCheck) {
  const DELTA_THRESHOLD = 10; // %p
  const baselinePath = join(__dir, 'benchmark-baseline.json');
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const baseMap = new Map(baseline.pages.map(p => [p.label, p]));

  const snapshotNote = snapCount === CASES.length
    ? `(${snapCount} snapshots, deterministic)`
    : snapCount > 0
      ? `(${snapCount} snapshots + ${CASES.length - snapCount} live fetches)`
      : '(live fetches — run update-snapshots.mjs for deterministic CI)';
  console.log(`\nRegression check ${snapshotNote}\n`);

  let failed = false;
  for (const row of successRows) {
    const base = baseMap.get(row.label);
    if (!base) continue;
    const curReduction    = +(row.r.reductionRatio * 100).toFixed(1);
    const curPreservation = +(row.p.rate * 100).toFixed(0);
    const reductionDelta    = base.reductionPct    - curReduction;
    const preservationDelta = base.preservationPct - curPreservation;

    if (reductionDelta > DELTA_THRESHOLD || preservationDelta > DELTA_THRESHOLD) {
      console.error(
        `❌ REGRESSION [${row.label}]: ` +
        `reduction ${base.reductionPct}% → ${curReduction}% (Δ${reductionDelta.toFixed(1)}%p), ` +
        `preservation ${base.preservationPct}% → ${curPreservation}% (Δ${preservationDelta.toFixed(1)}%p)`,
      );
      failed = true;
    } else {
      console.log(`✅ [${row.label}]: reduction ${curReduction}%, preservation ${curPreservation}%`);
    }
  }
  console.log('');
  if (failed) process.exit(1);
  console.log('✅ All pages within regression threshold.');
  process.exit(0);
}

// ── pretty print ──────────────────────────────────────────────────────────────

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
if (snapCount > 0) console.log(`  ✦ Used snapshots: ${snapCount}/${CASES.length}`);
console.log('─'.repeat(93) + '\n');
