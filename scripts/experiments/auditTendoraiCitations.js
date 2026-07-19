#!/usr/bin/env node

/**
 * Audit TendorAI citations in stored experiment runs.
 *
 * Finds every run citing a tendorai.com URL, prints each with its promptId
 * and platform, then compares against target profile URLs from the config
 * to identify profile citations that the exact-match cited flag missed.
 *
 * Usage:
 *   node scripts/experiments/auditTendoraiCitations.js --study study_2026_07_exp001
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const args = process.argv.slice(2);
const studyIdx = args.indexOf('--study');
if (studyIdx === -1) { console.error('Usage: --study <tag>'); process.exit(1); }
const study = args[studyIdx + 1];

function normaliseUrl(url) {
  try {
    const u = new URL(url.replace(/^\/\//, 'https://'));
    return (u.origin + u.pathname).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
  }
}

const configPath = path.resolve('data/experiments/exp001-config.json');
let targetUrls = new Set();
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  for (const prompt of config.prompts) {
    for (const t of (prompt.targets || [])) {
      targetUrls.add(normaliseUrl(t.url));
    }
  }
  console.log(`Loaded ${targetUrls.size} unique target profile URLs from config\n`);
} else {
  console.log('Warning: exp001-config.json not found — skipping target comparison\n');
}

await mongoose.connect(MONGODB_URI);

const runs = await ExperimentRun.find({ study, status: 'ok' })
  .select('promptId platform citedUrls targets')
  .lean();

console.log(`${'═'.repeat(70)}`);
console.log(`TENDORAI CITATION AUDIT: ${study}`);
console.log(`${'═'.repeat(70)}`);
console.log(`Total clean runs scanned: ${runs.length}\n`);

const hits = [];

for (const run of runs) {
  for (const url of (run.citedUrls || [])) {
    if (/tendorai\.com/i.test(url)) {
      hits.push({ promptId: run.promptId, platform: run.platform, url, runTargets: run.targets || [] });
    }
  }
}

if (hits.length === 0) {
  console.log('No tendorai.com URLs found in any citation.\n');
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`Found ${hits.length} tendorai.com citation(s):\n`);
console.log(`${'Prompt ID'.padEnd(30)} ${'Platform'.padEnd(12)} URL`);
console.log('─'.repeat(90));
for (const h of hits) {
  console.log(`${h.promptId.padEnd(30)} ${h.platform.padEnd(12)} ${h.url}`);
}

let profileMatchMissed = 0;
let otherPages = 0;
const missedDetails = [];
const otherDetails = [];

for (const h of hits) {
  const normCited = normaliseUrl(h.url);
  const isTargetProfile = targetUrls.has(normCited);

  if (isTargetProfile) {
    const matchingTarget = h.runTargets.find(t => normaliseUrl(t.url) === normCited);
    if (matchingTarget && matchingTarget.cited) {
      // Already correctly flagged — not a miss
    } else {
      profileMatchMissed++;
      missedDetails.push({ url: h.url, promptId: h.promptId, platform: h.platform, storedCited: matchingTarget?.cited ?? 'no matching target' });
    }
  } else {
    otherPages++;
    otherDetails.push({ url: h.url, promptId: h.promptId, platform: h.platform });
  }
}

console.log(`\n${'═'.repeat(70)}`);
console.log('VERDICT');
console.log('═'.repeat(70));
console.log(`Profile URLs the cited flag MISSED: ${profileMatchMissed}`);
if (missedDetails.length > 0) {
  for (const d of missedDetails) {
    console.log(`  ${d.url}  [${d.promptId}/${d.platform}] stored cited=${d.storedCited}`);
  }
}
console.log(`Other tendorai.com pages (city listings, etc.): ${otherPages}`);
if (otherDetails.length > 0) {
  for (const d of otherDetails) {
    console.log(`  ${d.url}  [${d.promptId}/${d.platform}]`);
  }
}
console.log(`\nTotal tendorai.com citations: ${hits.length}`);
console.log(`${'═'.repeat(70)}\n`);

await mongoose.disconnect();
