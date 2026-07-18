#!/usr/bin/env node

/**
 * Show random sample responses from an experiment's stored runs.
 *
 * Usage:
 *   node scripts/experiments/showSamples.js --study study_2026_07_exp001 --n 5
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const args = process.argv.slice(2);
const studyIdx = args.indexOf('--study');
const nIdx = args.indexOf('--n');

if (studyIdx === -1) { console.error('Usage: --study <tag> [--n <count>]'); process.exit(1); }

const study = args[studyIdx + 1];
const n = parseInt(args[nIdx !== -1 ? nIdx + 1 : undefined] || '5');

await mongoose.connect(MONGODB_URI);

const samples = await ExperimentRun.aggregate([
  { $match: { study, status: 'ok' } },
  { $sample: { size: n } },
  { $project: { promptId: 1, platform: 1, responseText: 1, _id: 0 } },
]);

if (samples.length === 0) {
  console.log(`No runs found for study "${study}".`);
} else {
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`Sample ${i + 1}/${samples.length}  |  promptId: ${s.promptId}  |  platform: ${s.platform}`);
    console.log('═'.repeat(70));
    console.log(s.responseText || '(empty response)');
  }
}

await mongoose.disconnect();
