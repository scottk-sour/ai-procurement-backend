#!/usr/bin/env node

/**
 * runIndependenceAudit.js - READ-ONLY audit of repeat-run independence for EXP-001.
 *
 * READ-ONLY. Uses only countDocuments() + find().select().lean(). Performs NO
 * insert / update / delete / bulkWrite / replace / mutation, re-runs no scan,
 * changes no config, deploys nothing. The database is never written to. The only
 * output is human-readable text to stdout.
 *
 * Question: within each promptId x platform cell (design: 136 cells x 10 runs),
 * are the 10 repeats independent observations, or effectively one repeated? This
 * bears on the effective sample size for any power calculation. Two lenses:
 *   (a) distinct stored responseText (byte-identical comparison) per cell;
 *   (b) distinct sets of mentioned firm names per cell.
 *
 * Filter:
 *   study: 'study_2026_07_exp001', wave: 1, status: 'ok',
 *   platform in ['perplexity', 'chatgpt']
 *
 * Usage: node scripts/experiments/runIndependenceAudit.js
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const STUDY = 'study_2026_07_exp001';
const WAVE = 1;
const PLATFORMS = ['perplexity', 'chatgpt'];
const FILTER = { study: STUDY, wave: WAVE, status: 'ok', platform: { $in: PLATFORMS } };
const DESIGN_RUNS = 10;

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN; }
function median(arr) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// Byte-exact key for a stored responseText. JSON.stringify is a faithful, printable
// encoding: distinct strings map to distinct keys, and null/undefined maps to "null"
// (distinct from the string "null", which encodes as "\"null\""). No delimiter needed.
function responseKey(responseText) {
  return JSON.stringify(responseText === undefined ? null : responseText);
}
// Canonical key for a run's set of mentioned firms (entityName preferred, url fallback).
// JSON.stringify of the sorted unique array is unambiguous and printable.
function mentionedSetKey(targets) {
  const ids = [];
  for (const t of (targets || [])) {
    if (t && t.mentioned === true) ids.push(t.entityName || t.url || '');
  }
  return JSON.stringify([...new Set(ids)].sort()); // "[]" means "no firms mentioned"
}
function histogram(values) {
  const h = new Map();
  for (const v of values) h.set(v, (h.get(v) || 0) + 1);
  return [...h.entries()].sort((a, b) => a[0] - b[0]);
}

await mongoose.connect(MONGODB_URI);

const matchCount = await ExperimentRun.countDocuments(FILTER);
if (matchCount === 0) {
  console.error('STOP');
  console.error(`Filter matched ZERO runs: { study: '${STUDY}', wave: ${WAVE}, status: 'ok', platform in [${PLATFORMS.join(', ')}] }`);
  console.error('The filter was NOT broadened or altered. Treat this as a data/integrity finding.');
  await mongoose.disconnect();
  process.exit(1);
}

const runs = await ExperimentRun.find(FILTER)
  .select('promptId platform responseText targets')
  .lean();

console.log(`Filter matched ${matchCount} runs (countDocuments); loaded ${runs.length} documents.`);
console.log(`Filter: { study: '${STUDY}', wave: ${WAVE}, status: 'ok', platform in [${PLATFORMS.join(', ')}] }\n`);

// -- Group by promptId x platform --
const cells = new Map(); // key -> { promptId, platform, responseKeys:[], mentionKeys:[] }
for (const r of runs) {
  const key = `${r.promptId}||${r.platform}`;
  if (!cells.has(key)) cells.set(key, { promptId: r.promptId, platform: r.platform, responseKeys: [], mentionKeys: [] });
  const c = cells.get(key);
  c.responseKeys.push(responseKey(r.responseText));
  c.mentionKeys.push(mentionedSetKey(r.targets));
}

const cellList = [...cells.values()].map(c => ({
  promptId: c.promptId,
  platform: c.platform,
  runCount: c.responseKeys.length,
  distinctResponses: new Set(c.responseKeys).size,
  distinctMentionSets: new Set(c.mentionKeys).size,
}));

console.log(`Distinct prompt x platform cells: ${cellList.length} (design target 136 = 68 prompts x 2 platforms)`);
const offSize = cellList.filter(c => c.runCount !== DESIGN_RUNS);
console.log(`Cells whose run count != ${DESIGN_RUNS}: ${offSize.length}`);
for (const c of offSize.sort((a, b) => a.promptId.localeCompare(b.promptId))) {
  console.log(`   ${c.promptId} / ${c.platform}: ${c.runCount} runs`);
}
console.log('(Buckets below use the literal thresholds; a cell with fewer than 10 runs cannot reach "all 10".)\n');

// -- 1. distinct responseText buckets + full distribution (overall) --
function bucketize(list) {
  const identical = list.filter(c => c.distinctResponses === 1).length;      // all runs byte-identical
  const partial = list.filter(c => c.distinctResponses >= 2 && c.distinctResponses <= 9).length;
  const allDistinct = list.filter(c => c.distinctResponses === 10).length;   // all 10 distinct
  return { identical, partial, allDistinct };
}
const ov = bucketize(cellList);
console.log('== 1. Distinct responseText per cell - OVERALL ==');
console.log(`  all-identical (distinct=1):     ${ov.identical}`);
console.log(`  2-9 distinct:                   ${ov.partial}`);
console.log(`  all-distinct (distinct=10):     ${ov.allDistinct}`);
console.log('  full distribution (distinctResponses -> #cells):');
for (const [k, n] of histogram(cellList.map(c => c.distinctResponses))) console.log(`     ${k}: ${n}`);

// -- 2. same split by platform --
console.log('\n== 2. Distinct responseText per cell - BY PLATFORM ==');
for (const p of PLATFORMS) {
  const sub = cellList.filter(c => c.platform === p);
  const b = bucketize(sub);
  console.log(`  ${p} (${sub.length} cells): identical=${b.identical}, 2-9=${b.partial}, all-distinct=${b.allDistinct}`);
  console.log('    distribution:', JSON.stringify(histogram(sub.map(c => c.distinctResponses))));
}

// -- 3. distinct mentioned-firm sets per cell (full distribution) --
console.log('\n== 3. Distinct sets of mentioned firms per cell ==');
console.log('  full distribution (distinctMentionSets -> #cells) OVERALL:');
for (const [k, n] of histogram(cellList.map(c => c.distinctMentionSets))) console.log(`     ${k}: ${n}`);
for (const p of PLATFORMS) {
  const sub = cellList.filter(c => c.platform === p);
  console.log(`  ${p}:`, JSON.stringify(histogram(sub.map(c => c.distinctMentionSets))));
}

// -- 4. median and mean distinct-response count per cell, by platform --
console.log('\n== 4. Distinct-response count per cell - mean & median by platform ==');
for (const p of PLATFORMS) {
  const vals = cellList.filter(c => c.platform === p).map(c => c.distinctResponses);
  console.log(`  ${p}: mean=${mean(vals).toFixed(2)}  median=${median(vals)}  (n=${vals.length} cells)`);
}
const allVals = cellList.map(c => c.distinctResponses);
console.log(`  overall: mean=${mean(allVals).toFixed(2)}  median=${median(allVals)}  (n=${allVals.length} cells)`);

await mongoose.disconnect();
