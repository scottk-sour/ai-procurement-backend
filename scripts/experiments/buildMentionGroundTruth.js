#!/usr/bin/env node

/**
 * buildMentionGroundTruth.js - READ-ONLY sampler that builds a human-labelling
 * CSV for the EXP-001 mention matcher.
 *
 * READ-ONLY against MongoDB: find().select().lean() + countDocuments() only.
 * NO insert / update / delete / bulkWrite / replace / mutation, no scan re-run,
 * no config change, no deploy. The database is never written to. It DOES write
 * one local CSV file (data/experiments/mention-ground-truth-sample.csv) - that is
 * a local file, not a database write.
 *
 * It imports and CALLS the real matcher (isFirmMentioned / normaliseFirmName /
 * normaliseResponseText) from lib/mentionMatcher.js - it does not reimplement or
 * modify it. By default current_matcher_result comes from that live matcher;
 * --definition-matcher <path> overrides ONLY that column with the isFirmMentioned
 * of the given module (e.g. the frozen context-gate matcher mentionMatcher.pre186.js
 * that originally defined the fixture). Normalisation and substring matching always
 * use the live matcher.
 *
 * Draws a reproducible, stratified random sample of 150 runs (seed stated below),
 * spread across both platforms and across prompts, then emits one CSV row per
 * target firm on each sampled run (true negatives included). Rows where the
 * current matcher and substring-only matching DISAGREE are sorted first.
 *
 * Usage: node scripts/experiments/buildMentionGroundTruth.js
 *        node scripts/experiments/buildMentionGroundTruth.js \
 *          --definition-matcher scripts/experiments/lib/mentionMatcher.pre186.js
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';
import { isFirmMentioned, normaliseFirmName, normaliseResponseText } from './lib/mentionMatcher.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const STUDY = 'study_2026_07_exp001';
const WAVE = 1;
const PLATFORMS = ['perplexity', 'chatgpt'];
const FILTER = { study: STUDY, wave: WAVE, status: 'ok', platform: { $in: PLATFORMS } };
const SAMPLE_SIZE = 150;
const SEED = 20260811; // reproducible sample seed

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '../../data/experiments/mention-ground-truth-sample.csv');

// ---- Definition matcher (which isFirmMentioned computes current_matcher_result) ----
// Defaults to the live matcher (lib/mentionMatcher.js), so behaviour is unchanged.
// --definition-matcher <path> selects a different module whose isFirmMentioned is
// used for current_matcher_result ONLY. Normalisation (normalised_firm_name,
// token_count, substring_only_result) always uses the live matcher, so only the
// current-matcher column reflects the chosen definition matcher. This lets the
// fixture's membership be regenerated with the frozen context-gate matcher
// (mentionMatcher.pre186.js) that originally defined it, independent of whatever
// the live matcher has since become.
const dmIdx = process.argv.indexOf('--definition-matcher');
let definitionMatcherLabel = 'scripts/experiments/lib/mentionMatcher.js (live, default)';
let isFirmMentionedForCurrent = isFirmMentioned;
if (dmIdx !== -1) {
  const dmArg = process.argv[dmIdx + 1];
  if (!dmArg) { console.error('--definition-matcher requires a module path'); process.exit(1); }
  const dmPath = path.resolve(dmArg);
  if (!fs.existsSync(dmPath)) { console.error(`--definition-matcher module not found: ${dmPath}`); process.exit(1); }
  const dmMod = await import(pathToFileURL(dmPath).href);
  if (typeof dmMod.isFirmMentioned !== 'function') {
    console.error(`--definition-matcher module does not export isFirmMentioned: ${dmPath}`);
    process.exit(1);
  }
  isFirmMentionedForCurrent = dmMod.isFirmMentioned;
  definitionMatcherLabel = dmPath;
}

// ---- seeded PRNG (deterministic; no Math.random) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
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
  .select('_id promptId platform responseText targets')
  .lean();

console.log(`Filter matched ${matchCount} runs (countDocuments); loaded ${runs.length} documents.`);
console.log(`Filter: { study: '${STUDY}', wave: ${WAVE}, status: 'ok', platform in [${PLATFORMS.join(', ')}] }`);
console.log(`Sample seed: ${SEED}`);
console.log(`Definition matcher (current_matcher_result): ${definitionMatcherLabel}\n`);

// ---- Stratified reproducible sample of SAMPLE_SIZE runs ----
// Group by promptId x platform cell. Within each cell, sort runs by _id (stable,
// independent of DB return order) then seeded-shuffle. Round-robin across cells in
// a seeded-shuffled cell order, taking one run per cell per pass, so both platforms
// and a spread of prompts are represented before any cell contributes a second run.
const rng = mulberry32(SEED);
const cellMap = new Map();
for (const r of runs) {
  const k = `${r.promptId}||${r.platform}`;
  if (!cellMap.has(k)) cellMap.set(k, []);
  cellMap.get(k).push(r);
}
const cellOrder = seededShuffle([...cellMap.keys()].sort(), rng);
const pools = new Map();
for (const k of cellOrder) {
  const sorted = cellMap.get(k).slice().sort((a, b) => String(a._id).localeCompare(String(b._id)));
  pools.set(k, seededShuffle(sorted, rng));
}

const sample = [];
let progress = true;
while (sample.length < SAMPLE_SIZE && progress) {
  progress = false;
  for (const k of cellOrder) {
    if (sample.length >= SAMPLE_SIZE) break;
    const pool = pools.get(k);
    if (pool && pool.length) { sample.push(pool.shift()); progress = true; }
  }
}

// ---- Achieved stratification ----
const byPlatform = {}; const promptsSeen = new Set(); const cellCount = {};
for (const r of sample) {
  byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1;
  promptsSeen.add(r.promptId);
  const k = `${r.promptId}||${r.platform}`; cellCount[k] = (cellCount[k] || 0) + 1;
}
const perCellVals = Object.values(cellCount);
console.log('== Achieved stratification ==');
console.log(`  runs sampled: ${sample.length}${sample.length < SAMPLE_SIZE ? ` (only ${sample.length} available)` : ''}`);
for (const p of PLATFORMS) console.log(`  ${p}: ${byPlatform[p] || 0} runs`);
console.log(`  distinct prompts represented: ${promptsSeen.size}`);
console.log(`  distinct cells represented: ${Object.keys(cellCount).length}`);
console.log(`  runs per cell in sample: min=${Math.min(...perCellVals)} max=${Math.max(...perCellVals)}\n`);

// ---- Build rows (one per target on each sampled run) ----
const rows = [];
for (const r of sample) {
  const normText = normaliseResponseText(r.responseText);
  for (const t of (r.targets || [])) {
    const entity = t.entityName;
    const normFirm = entity ? normaliseFirmName(entity) : '';
    const tokenCount = normFirm ? normFirm.split(/\s+/).filter(Boolean).length : 0;
    const current = entity ? (isFirmMentionedForCurrent(r.responseText, entity) === true) : false;
    const substring = normFirm ? normText.includes(normFirm) : false;
    rows.push({
      run_id: String(r._id),
      prompt_id: r.promptId,
      platform: r.platform,
      firm_entity_name: entity == null ? '' : entity,
      normalised_firm_name: normFirm,
      token_count: tokenCount,
      current_matcher_result: current,
      substring_only_result: substring,
      response_text: r.responseText == null ? '' : String(r.responseText),
      disagree: current !== substring,
    });
  }
}

// Disagreements first; then stable secondary ordering.
rows.sort((a, b) => {
  if (a.disagree !== b.disagree) return a.disagree ? -1 : 1;
  if (a.run_id !== b.run_id) return a.run_id.localeCompare(b.run_id);
  return a.firm_entity_name.localeCompare(b.firm_entity_name);
});

// ---- Write CSV (local file, not a DB write) ----
const HEADER = [
  'run_id', 'prompt_id', 'platform', 'firm_entity_name', 'normalised_firm_name',
  'token_count', 'current_matcher_result', 'substring_only_result', 'response_text', 'human_verdict',
];
const lines = [HEADER.join(',')];
for (const r of rows) {
  lines.push([
    r.run_id, r.prompt_id, r.platform, r.firm_entity_name, r.normalised_firm_name,
    r.token_count, r.current_matcher_result, r.substring_only_result, r.response_text, '',
  ].map(csvCell).join(','));
}
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n');
console.log(`Wrote ${rows.length} rows to ${OUT_PATH}\n`);

// ---- Summary ----
function tally(pred) {
  const sub = rows.filter(pred);
  const agree = sub.filter(r => !r.disagree).length;
  const disagree = sub.filter(r => r.disagree).length;
  return { total: sub.length, agree, disagree };
}
const all = tally(() => true);
console.log('== Summary ==');
console.log(`  definition matcher (current_matcher_result): ${definitionMatcherLabel}`);
console.log(`  rows written: ${all.total}  |  agree: ${all.agree}  |  disagree: ${all.disagree}`);
console.log('  by platform:');
for (const p of PLATFORMS) {
  const t = tally(r => r.platform === p);
  console.log(`    ${p.padEnd(11)} total=${t.total}  agree=${t.agree}  disagree=${t.disagree}`);
}
console.log('  by token category:');
for (const [label, pred] of [['single-token', r => r.token_count === 1], ['multi-token', r => r.token_count >= 2], ['zero-token/empty', r => r.token_count === 0]]) {
  const t = tally(pred);
  console.log(`    ${label.padEnd(16)} total=${t.total}  agree=${t.agree}  disagree=${t.disagree}`);
}

await mongoose.disconnect();
