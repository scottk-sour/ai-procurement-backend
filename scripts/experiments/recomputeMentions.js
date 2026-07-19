#!/usr/bin/env node

/**
 * Recompute mention flags on stored experiment runs using the fixed matcher
 * and current config file (which has correct entityName values).
 *
 * Streams runs via cursor (constant memory), batches writes via bulkWrite,
 * never resets flags before computing — each record is read, recomputed,
 * and written in one pass.
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

const totalCount = await ExperimentRun.countDocuments({ study, status: 'ok' });
console.log(`Streaming ${totalCount} clean runs for study "${study}"...\n`);

const cursor = ExperimentRun.find({ study, status: 'ok' }).cursor();
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
    const configEntityName = entityLookup.get(`${run.promptId}::${target.url}`) || target.entityName || null;
    const wasMentioned = target.mentioned;
    const nowMentioned = isFirmMentioned(run.responseText, configEntityName);

    promptStats[run.promptId].total++;
    if (wasMentioned) promptStats[run.promptId].before++;
    if (nowMentioned) { promptStats[run.promptId].after++; totalMentioned++; }
    if (wasMentioned !== nowMentioned || target.entityName !== configEntityName) changed = true;
    if (wasMentioned !== nowMentioned) flipped++;

    return {
      ...target.toObject ? target.toObject() : target,
      mentioned: nowMentioned,
      entityName: configEntityName || target.entityName || null,
    };
  });

  if (changed) {
    bulkOps.push({
      updateOne: {
        filter: { _id: run._id },
        update: { $set: { targets: updatedTargets } },
      },
    });
  }

  if (bulkOps.length >= BULK_SIZE) {
    await ExperimentRun.bulkWrite(bulkOps);
    bulkOps = [];
  }

  if (scanned % 50 === 0) {
    process.stdout.write(`  ${scanned}/${totalCount} scanned, ${flipped} flipped so far\r`);
  }
}

if (bulkOps.length > 0) {
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
