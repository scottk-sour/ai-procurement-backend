#!/usr/bin/env node

/**
 * Recompute mention flags on stored experiment runs using the fixed matcher
 * and current config file (which has correct entityName values).
 *
 * Only touches the `mentioned` and `entityName` fields on each target.
 * The `cited` field is carried over from the stored value untouched —
 * it is never read, recomputed, or defaulted by this script.
 *
 * Streams runs via cursor (constant memory), batches writes via bulkWrite.
 *
 * Usage:
 *   node scripts/experiments/recomputeMentions.js \
 *     --study study_2026_07_exp001 \
 *     --config data/experiments/exp001-config.json
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';
import { isFirmMentioned } from './lib/mentionMatcher.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const BULK_SIZE = 500;

const args = process.argv.slice(2);
const studyIdx = args.indexOf('--study');
const configIdx = args.indexOf('--config');
if (studyIdx === -1 || configIdx === -1) {
  console.error('Usage: --study <tag> --config <path>');
  process.exit(1);
}
const study = args[studyIdx + 1];
const configPath = args[configIdx + 1];

// ── Scope + safety flags (guardrail; see the bulkWrite notes further down) ──
// --wave / --platform narrow the destructive rewrite; --dry-run computes and
// prints the tally without writing; --all-waves is the explicit opt-in to
// rewrite the entire study when no scope is given.
const waveIdx = args.indexOf('--wave');
const platformIdx = args.indexOf('--platform');
const DRY_RUN = args.includes('--dry-run');
const ALL_WAVES = args.includes('--all-waves');

let wave = null;
if (waveIdx !== -1) {
  const waveRaw = args[waveIdx + 1];
  if (!waveRaw || !/^\d+$/.test(waveRaw)) {
    console.error(`--wave must be a non-negative integer (got: ${waveRaw ?? '<missing>'})`);
    process.exit(1);
  }
  wave = parseInt(waveRaw, 10);
}

let platform = null;
if (platformIdx !== -1) {
  platform = args[platformIdx + 1];
  const platformPath = ExperimentRun.schema.path('platform');
  const PLATFORM_ENUM = (platformPath && (platformPath.enumValues || platformPath.options?.enum)) || [];
  if (!platform || !PLATFORM_ENUM.includes(platform)) {
    console.error(`--platform must be one of: ${PLATFORM_ENUM.join(', ') || '(enum unavailable)'} (got: ${platform ?? '<missing>'})`);
    process.exit(1);
  }
}

// Build the query filter ONCE and reuse it at every query site below.
const filter = { study, status: 'ok' };
if (wave !== null) filter.wave = wave;
if (platform !== null) filter.platform = platform;

if (!fs.existsSync(configPath)) { console.error(`Config not found: ${configPath}`); process.exit(1); }
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const entityLookup = new Map();
for (const prompt of config.prompts) {
  for (const target of (prompt.targets || [])) {
    if (target.entityName) {
      entityLookup.set(`${prompt.id}::${target.url}`, target.entityName);
    }
  }
}

console.log(`Loaded ${entityLookup.size} entity names from config`);

await mongoose.connect(MONGODB_URI);

// ── Scope announcement: make the blast radius visible before anything runs ──
const totalCount = await ExperimentRun.countDocuments(filter);
console.log(`Filter:  ${JSON.stringify(filter)}`);
console.log(`Matches: ${totalCount} document(s)`);
console.log(`Mode:    ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE (will rewrite stored mention flags)'}\n`);

// ── Refuse an unscoped destructive run ──
// No --wave and no --platform on a LIVE run would rewrite mention flags across
// EVERY wave and platform of the study — including closed wave-1 history and the
// wave-2 Perplexity rows the published figure rests on. Require --all-waves to
// proceed deliberately; otherwise stop and show the operator the exact scope.
if (wave === null && platform === null && !DRY_RUN && !ALL_WAVES) {
  const waves = await ExperimentRun.distinct('wave', filter);
  const platforms = await ExperimentRun.distinct('platform', filter);
  console.error('REFUSING to run: no --wave and no --platform on a LIVE run.');
  console.error(`This would rewrite stored mention flags across the ENTIRE study "${study}":`);
  console.error(`  waves:     ${waves.slice().sort((a, b) => a - b).join(', ') || '(none)'}`);
  console.error(`  platforms: ${platforms.slice().sort().join(', ') || '(none)'}`);
  console.error(`  documents: ${totalCount}`);
  console.error('\nRe-run scoped, e.g.:');
  console.error('  node scripts/experiments/recomputeMentions.js \\');
  console.error(`    --study ${study} --config ${configPath} --wave <n> --platform <name> --dry-run`);
  console.error('\nOr pass --all-waves to deliberately rewrite the entire study.');
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`Streaming ${totalCount} clean runs for study "${study}"...\n`);

const cursor = ExperimentRun.find(filter).cursor();
let scanned = 0;
let flipped = 0;
let totalMentioned = 0;
let bulkOps = [];
const promptStats = {};

for await (const run of cursor) {
  scanned++;

  if (!promptStats[run.promptId]) promptStats[run.promptId] = { before: 0, after: 0, total: 0 };

  let changed = false;
  const updatedTargets = run.targets.map(target => {
    const raw = target.toObject ? target.toObject() : { ...target };

    const configEntityName = entityLookup.get(`${run.promptId}::${raw.url}`) || raw.entityName || null;
    const wasMentioned = raw.mentioned ?? false;
    const nowMentioned = isFirmMentioned(run.responseText, configEntityName);

    promptStats[run.promptId].total++;
    if (wasMentioned) promptStats[run.promptId].before++;
    if (nowMentioned) { promptStats[run.promptId].after++; totalMentioned++; }
    if (wasMentioned !== nowMentioned) flipped++;

    if (wasMentioned !== nowMentioned || raw.entityName !== configEntityName) {
      changed = true;
    }

    return {
      ...raw,
      mentioned: nowMentioned,
      entityName: configEntityName,
      // cited is carried over from raw — never touched
    };
  });

  if (!DRY_RUN && changed) {
    bulkOps.push({
      updateOne: {
        filter: { _id: run._id },
        update: { $set: { targets: updatedTargets } },
      },
    });
  }

  if (!DRY_RUN && bulkOps.length >= BULK_SIZE) {
    // NOTE: writes flush in BULK_SIZE batches with NO surrounding transaction.
    // A mid-run failure leaves documents partially recomputed with no rollback.
    // (This has happened in production — do not assume all-or-nothing here.)
    await ExperimentRun.bulkWrite(bulkOps);
    bulkOps = [];
  }

  if (scanned % 50 === 0) {
    process.stdout.write(`  ${scanned}/${totalCount} scanned, ${flipped} flipped so far\r`);
  }
}

if (!DRY_RUN && bulkOps.length > 0) {
  // NOTE: final batch flush — same no-transaction / no-rollback caveat as the
  // in-loop flush above.
  await ExperimentRun.bulkWrite(bulkOps);
}

console.log(`\n\n${'─'.repeat(60)}`);
console.log('Per-prompt mention totals (before -> after):');
console.log('─'.repeat(60));
for (const [promptId, stats] of Object.entries(promptStats).sort((a, b) => a[0].localeCompare(b[0]))) {
  const flag = stats.after > stats.before ? ' ^' : stats.after < stats.before ? ' v' : '';
  console.log(`  ${promptId}: ${stats.before}/${stats.total} -> ${stats.after}/${stats.total}${flag}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Done: ${scanned} runs scanned, ${flipped} mention flags changed, ${totalMentioned} total mentioned`);
console.log('='.repeat(60));
await mongoose.disconnect();
