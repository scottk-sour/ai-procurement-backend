#!/usr/bin/env node

/**
 * Recompute mention flags on stored experiment runs using the fixed matcher
 * and current config file (which has correct entityName values).
 *
 * No API calls — reads responseText from the DB, loads firm names from config,
 * re-runs the matcher, and updates the mentioned + entityName fields in place.
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

const runs = await ExperimentRun.find({ study, status: 'ok' });
console.log(`Found ${runs.length} clean runs for study "${study}"\n`);

let updated = 0;
let flipped = 0;
const promptStats = {};

for (const run of runs) {
  let changed = false;

  if (!promptStats[run.promptId]) promptStats[run.promptId] = { before: 0, after: 0, total: 0 };

  for (const target of run.targets) {
    const configEntityName = entityLookup.get(`${run.promptId}::${target.url}`) || target.entityName || null;
    const wasMentioned = target.mentioned;
    const nowMentioned = isFirmMentioned(run.responseText, configEntityName);

    promptStats[run.promptId].total++;
    if (wasMentioned) promptStats[run.promptId].before++;
    if (nowMentioned) promptStats[run.promptId].after++;

    if (wasMentioned !== nowMentioned || target.entityName !== configEntityName) {
      target.mentioned = nowMentioned;
      if (configEntityName && target.entityName !== configEntityName) {
        target.entityName = configEntityName;
      }
      changed = true;
      if (wasMentioned !== nowMentioned) {
        flipped++;
        const dir = nowMentioned ? 'false→true' : 'true→false';
        console.log(`  [${run.promptId}/${run.platform}] ${configEntityName || target.url}: ${dir}`);
      }
    }
  }

  if (changed) {
    run.markModified('targets');
    await run.save();
    updated++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log('Per-prompt mention totals (before → after):');
console.log('─'.repeat(60));
for (const [promptId, stats] of Object.entries(promptStats).sort((a, b) => a[0].localeCompare(b[0]))) {
  const flag = stats.after > stats.before ? ' ↑' : stats.after < stats.before ? ' ↓' : '';
  console.log(`  ${promptId}: ${stats.before}/${stats.total} → ${stats.after}/${stats.total}${flag}`);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`Done: ${updated} runs updated, ${flipped} mention flags flipped (${runs.length} total runs scanned)`);
console.log('═'.repeat(60));
await mongoose.disconnect();
