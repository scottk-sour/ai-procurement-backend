#!/usr/bin/env node

/**
 * Recompute mention flags on stored experiment runs using the fixed matcher.
 * No API calls — reads responseText and targets from the DB, re-runs the
 * matcher, and updates the mentioned booleans in place.
 *
 * Usage:
 *   node scripts/experiments/recomputeMentions.js --study study_2026_07_exp001
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';
import { isFirmMentioned } from './lib/mentionMatcher.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const args = process.argv.slice(2);
const studyIdx = args.indexOf('--study');
if (studyIdx === -1) { console.error('Usage: --study <tag>'); process.exit(1); }
const study = args[studyIdx + 1];

await mongoose.connect(MONGODB_URI);

const runs = await ExperimentRun.find({ study, status: 'ok' });
console.log(`Found ${runs.length} clean runs for study "${study}"`);

let updated = 0;
let flipped = 0;

for (const run of runs) {
  let changed = false;

  for (const target of run.targets) {
    const wasMentioned = target.mentioned;
    const nowMentioned = isFirmMentioned(run.responseText, target.entityName);

    if (wasMentioned !== nowMentioned) {
      target.mentioned = nowMentioned;
      changed = true;
      flipped++;
      const dir = nowMentioned ? 'false→true' : 'true→false';
      console.log(`  [${run.promptId}/${run.platform}] ${target.entityName || target.url}: ${dir}`);
    }
  }

  if (changed) {
    run.markModified('targets');
    await run.save();
    updated++;
  }
}

console.log(`\nDone: ${updated} runs updated, ${flipped} mention flags flipped (${runs.length} total runs scanned)`);
await mongoose.disconnect();
