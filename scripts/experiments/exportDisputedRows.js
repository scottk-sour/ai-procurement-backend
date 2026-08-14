#!/usr/bin/env node

/**
 * exportDisputedRows.js - READ-ONLY export of matcher-vs-substring DISPUTED rows.
 *
 * READ-ONLY against MongoDB: find().select().lean() + countDocuments() only.
 * NO insert / update / delete / bulkWrite / replace / mutation, no scan re-run,
 * no config change, no deploy. The database is never written to. It writes one
 * local CSV (data/experiments/disputed-rows.csv) - a local file, not a DB write.
 *
 * Imports and CALLS the real matcher (isFirmMentioned / normaliseFirmName /
 * normaliseResponseText) from lib/mentionMatcher.js - does not modify it.
 *
 * SAMPLING: this script REPLICATES the sampling logic of buildMentionGroundTruth.js
 * verbatim (same SEED 20260811, same cell grouping, same seeded round-robin), NOT
 * by import (that script has no exported sampler and runs with side effects). Given
 * the same run set + seed + matcher, the 150-run sample and per-target rows are
 * identical to that script's, so the disputed subset here matches its disagreements.
 *
 * Emits ONLY rows where current_matcher_result != substring_only_result, with a
 * +/-250-char context window around the firm-name occurrence instead of full text,
 * then marks a reproducible 150-row labelling subsample (in_label_sample = Y).
 *
 * Usage: node scripts/experiments/exportDisputedRows.js
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';
import { isFirmMentioned, normaliseFirmName, normaliseResponseText } from './lib/mentionMatcher.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const STUDY = 'study_2026_07_exp001';
const WAVE = 1;
const PLATFORMS = ['perplexity', 'chatgpt'];
const FILTER = { study: STUDY, wave: WAVE, status: 'ok', platform: { $in: PLATFORMS } };
const SAMPLE_SIZE = 150;          // must equal buildMentionGroundTruth.js
const SEED = 20260811;            // must equal buildMentionGroundTruth.js
const LABEL_SUBSAMPLE_SIZE = 150; // disputed rows to mark for human labelling
const SUBSAMPLE_SEED = 20260812;  // separate, stated seed for the labelling subsample
const CONTEXT = 250;
const EXPECTED_DISPUTED = 469;    // reported for reference only; never forced

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '../../data/experiments/disputed-rows.csv');

// ---- seeded PRNG + shuffle (COPIED VERBATIM from buildMentionGroundTruth.js) ----
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

// Context windows: up to first 3 occurrences of the (single-token) normalised firm
// name in the RAW response (case-insensitive, so original commas/quotes/newlines are
// preserved for human review), each +/-CONTEXT chars, matched span wrapped >>> <<<.
// Falls back to the normalised text only if the raw search finds nothing.
function contextWindows(raw, normFirm) {
  if (!normFirm || !raw) return '';
  const esc = normFirm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc, 'gi');
  const wins = [];
  let m;
  while ((m = re.exec(raw)) !== null && wins.length < 3) {
    const idx = m.index, len = m[0].length;
    const s = Math.max(0, idx - CONTEXT);
    const e = Math.min(raw.length, idx + len + CONTEXT);
    wins.push(raw.slice(s, idx) + '>>>' + raw.slice(idx, idx + len) + '<<<' + raw.slice(idx + len, e));
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  if (wins.length === 0) {
    const nt = normaliseResponseText(raw);
    let i = nt.indexOf(normFirm);
    while (i !== -1 && wins.length < 3) {
      const s = Math.max(0, i - CONTEXT);
      const e = Math.min(nt.length, i + normFirm.length + CONTEXT);
      wins.push('[normalised] ' + nt.slice(s, i) + '>>>' + nt.slice(i, i + normFirm.length) + '<<<' + nt.slice(i + normFirm.length, e));
      i = nt.indexOf(normFirm, i + normFirm.length);
    }
  }
  return wins.join(' ||| ');
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
console.log(`Sample seed: ${SEED} (replicated from buildMentionGroundTruth.js); labelling-subsample seed: ${SUBSAMPLE_SEED}\n`);

// ---- 150-run stratified sample (VERBATIM replication of buildMentionGroundTruth.js) ----
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
console.log(`Sample drawn: ${sample.length} runs (identical to buildMentionGroundTruth.js by construction: same run set + seed + logic).\n`);

// ---- Build disputed rows (one per target where current != substring) ----
const disputed = [];
for (const r of sample) {
  const normText = normaliseResponseText(r.responseText);
  for (const t of (r.targets || [])) {
    const entity = t.entityName;
    const normFirm = entity ? normaliseFirmName(entity) : '';
    const current = entity ? (isFirmMentioned(r.responseText, entity) === true) : false;
    const substring = normFirm ? normText.includes(normFirm) : false;
    if (current === substring) continue; // agreement -> not disputed
    disputed.push({
      run_id: String(r._id),
      prompt_id: r.promptId,
      platform: r.platform,
      firm_entity_name: entity == null ? '' : entity,
      normalised_firm_name: normFirm,
      context_window: contextWindows(r.responseText == null ? '' : String(r.responseText), normFirm),
    });
  }
}
// Stable row_id in generation order (deterministic: sample order x target order).
disputed.forEach((d, i) => { d.row_id = i + 1; });

// ---- Reproducible 150-row labelling subsample ----
const subRng = mulberry32(SUBSAMPLE_SEED);
const chosen = new Set(seededShuffle(disputed.map(d => d.row_id), subRng).slice(0, Math.min(LABEL_SUBSAMPLE_SIZE, disputed.length)));
for (const d of disputed) d.in_label_sample = chosen.has(d.row_id) ? 'Y' : 'N';

// Y first, then by row_id.
disputed.sort((a, b) => {
  if (a.in_label_sample !== b.in_label_sample) return a.in_label_sample === 'Y' ? -1 : 1;
  return a.row_id - b.row_id;
});

// ---- Write CSV (local file, not a DB write) ----
const HEADER = ['row_id', 'run_id', 'prompt_id', 'platform', 'firm_entity_name', 'normalised_firm_name', 'context_window', 'in_label_sample', 'human_verdict'];
const lines = [HEADER.join(',')];
for (const d of disputed) {
  lines.push([d.row_id, d.run_id, d.prompt_id, d.platform, d.firm_entity_name, d.normalised_firm_name, d.context_window, d.in_label_sample, ''].map(csvCell).join(','));
}
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n');
const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);

// ---- Summary ----
const yRows = disputed.filter(d => d.in_label_sample === 'Y');
const nRows = disputed.filter(d => d.in_label_sample === 'N');
console.log('== Summary ==');
console.log(`  total disputed rows found: ${disputed.length}`);
if (disputed.length !== EXPECTED_DISPUTED) {
  console.log(`  NOTE: actual disputed count is ${disputed.length}, NOT the reference ${EXPECTED_DISPUTED}. Reporting the actual number; nothing was adjusted to reach ${EXPECTED_DISPUTED}.`);
} else {
  console.log(`  (matches the reference expected count of ${EXPECTED_DISPUTED}.)`);
}
console.log(`  rows marked Y (labelling): ${yRows.length}`);
console.log(`  rows marked N:             ${nRows.length}`);
console.log(`  file: ${OUT_PATH} (${sizeKB} KB)`);

const byPlat = {}; const byPrompt = {};
for (const d of yRows) { byPlat[d.platform] = (byPlat[d.platform] || 0) + 1; byPrompt[d.prompt_id] = (byPrompt[d.prompt_id] || 0) + 1; }
console.log('  labelling rows (Y) by platform:');
for (const p of PLATFORMS) console.log(`    ${p}: ${byPlat[p] || 0}`);
console.log('  labelling rows (Y) by prompt:');
for (const [pid, n] of Object.entries(byPrompt).sort((a, b) => a[0].localeCompare(b[0]))) console.log(`    ${pid}: ${n}`);

await mongoose.disconnect();
