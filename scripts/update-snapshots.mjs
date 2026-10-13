#!/usr/bin/env node
/**
 * Fetch live pages and save as compressed snapshots for deterministic CI.
 *
 * Snapshots store { url, html, renderType, ssgPayload? } — the raw fetch
 * result before any pipeline processing. CI uses these instead of live fetches
 * so benchmark results are affected only by code changes, not page updates.
 *
 * Usage:  node scripts/update-snapshots.mjs
 * Run this when pages change content and you want to refresh the baseline too.
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dir, 'snapshots');

// Import fetch URLs from benchmark cases
const { default: CASES } = await import('./benchmark-cases.mjs');
const { fetchPage } = await import('../dist/ast/fetcher.js');

await mkdir(SNAP_DIR, { recursive: true });

for (const c of CASES) {
  process.stdout.write(`  Fetching: ${c.label} ... `);
  try {
    const r = await fetchPage(c.url);
    const payload = JSON.stringify({ url: r.url, html: r.html, renderType: r.renderType, ssgPayload: r.ssgPayload ?? null });
    const slug = c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const dest = join(SNAP_DIR, `${slug}.json.gz`);
    await streamPipeline(
      Readable.from([payload]),
      createGzip({ level: 9 }),
      createWriteStream(dest),
    );
    const sizePct = Math.round(Buffer.byteLength(payload) / 1024);
    console.log(`saved (${sizePct} KB raw → ${dest.split('/').pop()})`);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}

console.log('\nDone. Commit scripts/snapshots/ and re-run benchmark --baseline to update numbers.');
