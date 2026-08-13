#!/usr/bin/env node

/**
 * Read-only inventory of banked EXP-001 wave 1 baseline runs.
 *
 * READ-ONLY — find() / countDocuments() / aggregate() only.
 * No writes, no updates, no deletes, no $set, no bulkWrite.
 *
 * Scope: study 'study_2026_07_exp001', wave 1, status 'ok',
 * platforms perplexity and chatgpt only.
 *
 * Prints to stdout:
 *   1. Runs per promptId × platform, with first and last runAt
 *   2. Distribution of group sizes (groups with 10 runs, 9, 8, ...)
 *   3. Total runs in scope and total distinct prompt×platform groups
 *   4. Max time span within any single group, in minutes
 *   5. Runs with empty citedUrls, split by platform
 *   6. Documents outside this filter (other studies/waves/platforms/status) — counts only
 *
 * Also writes a JSON summary to data/experiments/inventory-wave1.json
 * (local file output only — the database is never written to).
 *
 * Usage:
 *   node scripts/experiments/inventoryRuns.js
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const STUDY = 'study_2026_07_exp001';
const WAVE = 1;
const PLATFORMS = ['perplexity', 'chatgpt'];
const FILTER = { study: STUDY, wave: WAVE, status: 'ok', platform: { $in: PLATFORMS } };

const OUT_PATH = path.resolve('data/experiments/inventory-wave1.json');

await mongoose.connect(MONGODB_URI);

const runs = await ExperimentRun.find(FILTER)
  .select('promptId platform runAt citedUrls')
  .lean();

// ── 6. Everything in the collection OUTSIDE the filter (counts only) ──
// Computed up front so that, if the filter matches nothing, we can show
// what actually exists instead of guessing at study/wave values.

const allCombos = await ExperimentRun.aggregate([
  { $group: {
      _id: { study: '$study', wave: '$wave', platform: '$platform', status: '$status' },
      n: { $sum: 1 },
  } },
  { $sort: { '_id.study': 1, '_id.wave': 1, '_id.platform': 1, '_id.status': 1 } },
]);

const inScope = c =>
  c._id.study === STUDY && c._id.wave === WAVE &&
  c._id.status === 'ok' && PLATFORMS.includes(c._id.platform);
const outsideCombos = allCombos.filter(c => !inScope(c));

if (runs.length === 0) {
  console.error(`STOP: no documents match { study: '${STUDY}', wave: ${WAVE}, status: 'ok', platform in [${PLATFORMS.join(', ')}] }.`);
  console.error('Not guessing at study/wave. The collection actually contains:');
  if (allCombos.length === 0) {
    console.error('  (collection is empty)');
  } else {
    for (const c of allCombos) {
      console.error(`  study=${c._id.study} wave=${c._id.wave} platform=${c._id.platform} status=${c._id.status}: ${c.n}`);
    }
  }
  await mongoose.disconnect();
  process.exit(1);
}

// ── 1. Group by promptId × platform ──

const groups = {};
for (const run of runs) {
  const key = `${run.promptId}::${run.platform}`;
  if (!groups[key]) groups[key] = { promptId: run.promptId, platform: run.platform, n: 0, first: run.runAt, last: run.runAt, emptyCited: 0 };
  const g = groups[key];
  g.n++;
  if (run.runAt < g.first) g.first = run.runAt;
  if (run.runAt > g.last) g.last = run.runAt;
  if (!run.citedUrls || run.citedUrls.length === 0) g.emptyCited++;
}

const groupList = Object.values(groups).sort((a, b) =>
  a.promptId === b.promptId ? a.platform.localeCompare(b.platform) : a.promptId.localeCompare(b.promptId));

console.log(`\n${'═'.repeat(100)}`);
console.log(`RUN INVENTORY: ${STUDY} wave ${WAVE}, status ok, platforms ${PLATFORMS.join('+')}`);
console.log('═'.repeat(100));

console.log(`\n1. Runs per promptId × platform:\n`);
console.log('Prompt ID'.padEnd(30) + 'Platform'.padEnd(12) + 'Runs'.padStart(5) + '  ' + 'First runAt'.padEnd(26) + 'Last runAt');
console.log('─'.repeat(100));
for (const g of groupList) {
  console.log(
    g.promptId.padEnd(30) + g.platform.padEnd(12) + String(g.n).padStart(5) + '  '
    + new Date(g.first).toISOString().padEnd(26) + new Date(g.last).toISOString()
  );
}

// ── 2. Distribution of group sizes ──

const sizeDist = {};
for (const g of groupList) sizeDist[g.n] = (sizeDist[g.n] || 0) + 1;

console.log(`\n2. Distribution of group sizes:\n`);
for (const size of Object.keys(sizeDist).map(Number).sort((a, b) => b - a)) {
  console.log(`   groups with ${String(size).padStart(2)} runs: ${sizeDist[size]}`);
}

// ── 3. Totals ──

console.log(`\n3. Total runs matching filter: ${runs.length}`);
console.log(`   Distinct prompt×platform groups: ${groupList.length}`);

// ── 4. Max time span within any single group ──

let maxSpan = null;
for (const g of groupList) {
  const spanMin = (new Date(g.last) - new Date(g.first)) / 60000;
  if (maxSpan === null || spanMin > maxSpan.spanMin) {
    maxSpan = { promptId: g.promptId, platform: g.platform, spanMin };
  }
}
console.log(`\n4. Max time span within a single group: ${maxSpan.spanMin.toFixed(1)} minutes`);
console.log(`   (${maxSpan.promptId}/${maxSpan.platform})`);

// ── 5. Empty citedUrls, split by platform ──

const emptyByPlatform = {};
const missingField = { perplexity: 0, chatgpt: 0 };
const totalByPlatform = {};
for (const p of PLATFORMS) { emptyByPlatform[p] = 0; totalByPlatform[p] = 0; }
for (const run of runs) {
  totalByPlatform[run.platform]++;
  if (!Array.isArray(run.citedUrls)) {
    missingField[run.platform]++;
    emptyByPlatform[run.platform]++;
  } else if (run.citedUrls.length === 0) {
    emptyByPlatform[run.platform]++;
  }
}

console.log(`\n5. Runs with empty citedUrls:\n`);
for (const p of PLATFORMS) {
  console.log(`   ${p.padEnd(12)} ${emptyByPlatform[p]}/${totalByPlatform[p]}`
    + (missingField[p] > 0 ? `  (of which ${missingField[p]} have the field missing/null rather than [])` : ''));
}
console.log(`   total        ${PLATFORMS.reduce((s, p) => s + emptyByPlatform[p], 0)}/${runs.length}`);

// ── 6. Documents outside the filter ──

console.log(`\n6. Documents in experiment_runs OUTSIDE this filter (counts only):\n`);
if (outsideCombos.length === 0) {
  console.log('   none — every document in the collection matches the filter');
} else {
  for (const c of outsideCombos) {
    console.log(`   study=${c._id.study} wave=${c._id.wave} platform=${c._id.platform} status=${c._id.status}: ${c.n}`);
  }
}

console.log(`\n${'═'.repeat(100)}\n`);

// ── JSON summary ──

const summary = {
  generatedAt: new Date().toISOString(),
  filter: { study: STUDY, wave: WAVE, status: 'ok', platforms: PLATFORMS },
  totals: {
    runs: runs.length,
    groups: groupList.length,
  },
  groupSizeDistribution: sizeDist,
  maxGroupSpanMinutes: +maxSpan.spanMin.toFixed(1),
  maxGroupSpanGroup: { promptId: maxSpan.promptId, platform: maxSpan.platform },
  emptyCitedUrls: {
    byPlatform: emptyByPlatform,
    missingFieldByPlatform: missingField,
    total: PLATFORMS.reduce((s, p) => s + emptyByPlatform[p], 0),
  },
  groups: groupList.map(g => ({
    promptId: g.promptId,
    platform: g.platform,
    runs: g.n,
    firstRunAt: new Date(g.first).toISOString(),
    lastRunAt: new Date(g.last).toISOString(),
    emptyCitedUrls: g.emptyCited,
  })),
  outsideFilter: outsideCombos.map(c => ({
    study: c._id.study, wave: c._id.wave, platform: c._id.platform, status: c._id.status, count: c.n,
  })),
};

fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2) + '\n');
console.log(`JSON summary written to ${OUT_PATH}\n`);

await mongoose.disconnect();
