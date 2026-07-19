#!/usr/bin/env node

/**
 * Citation domain breakdown for a stored experiment.
 *
 * Usage:
 *   node scripts/experiments/citationBreakdown.js --study study_2026_07_exp001
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const args = process.argv.slice(2);
const studyIdx = args.indexOf('--study');
if (studyIdx === -1) { console.error('Usage: --study <tag>'); process.exit(1); }
const study = args[studyIdx + 1];

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

await mongoose.connect(MONGODB_URI);

const runs = await ExperimentRun.find({ study, status: 'ok' })
  .select('platform citedUrls')
  .lean();

if (runs.length === 0) {
  console.log(`No clean runs found for study "${study}".`);
  await mongoose.disconnect();
  process.exit(0);
}

const platforms = [...new Set(runs.map(r => r.platform))].sort();
const domainCounts = {};
const zeroCitations = {};
const totalByPlatform = {};

for (const p of platforms) { zeroCitations[p] = 0; totalByPlatform[p] = 0; }

for (const run of runs) {
  totalByPlatform[run.platform] = (totalByPlatform[run.platform] || 0) + 1;
  const urls = run.citedUrls || [];
  if (urls.length === 0) { zeroCitations[run.platform]++; continue; }
  for (const url of urls) {
    const domain = extractDomain(url);
    if (!domainCounts[domain]) domainCounts[domain] = {};
    domainCounts[domain][run.platform] = (domainCounts[domain][run.platform] || 0) + 1;
  }
}

const sorted = Object.entries(domainCounts)
  .map(([domain, counts]) => ({ domain, total: Object.values(counts).reduce((s, n) => s + n, 0), counts }))
  .sort((a, b) => b.total - a.total);

console.log(`\n${'═'.repeat(70)}`);
console.log(`CITATION DOMAIN BREAKDOWN: ${study}`);
console.log(`${'═'.repeat(70)}`);
console.log(`Total clean runs: ${runs.length} | Platforms: ${platforms.join(', ')}\n`);

const colW = 10;
const domainW = 40;
const header = 'Domain'.padEnd(domainW) + platforms.map(p => p.padStart(colW)).join('') + '  Total'.padStart(colW);
console.log(header);
console.log('─'.repeat(header.length));

for (const { domain, total, counts } of sorted) {
  const row = domain.substring(0, domainW - 1).padEnd(domainW)
    + platforms.map(p => String(counts[p] || 0).padStart(colW)).join('')
    + String(total).padStart(colW);
  console.log(row);
}

console.log(`\n${'─'.repeat(50)}`);
console.log('Runs with ZERO citation URLs:');
console.log('─'.repeat(50));
for (const p of platforms) {
  console.log(`  ${p}: ${zeroCitations[p]}/${totalByPlatform[p]} (${totalByPlatform[p] > 0 ? (zeroCitations[p] / totalByPlatform[p] * 100).toFixed(0) : 0}%)`);
}

console.log(`\n${'═'.repeat(70)}\n`);
await mongoose.disconnect();
