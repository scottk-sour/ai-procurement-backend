#!/usr/bin/env node

/**
 * Compute statistics for "The UK AI Visibility Report for Solicitors — July 2026"
 *
 * READ-ONLY — no writes, no updates, no recompute of any flags.
 * Aggregates across ALL runs. Does not split by treatment/control.
 *
 * Usage:
 *   node scripts/experiments/computeReportStats.js
 *
 * Requires: MONGODB_URI in env or .env
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const STUDY = 'study_2026_07_exp001';

// Domain classification: directories/review platforms vs firm websites
const DIRECTORY_DOMAINS = new Set([
  'reviewsolicitors.co.uk',
  'solicitors.com',
  'lawsociety.org.uk',
  'sra.org.uk',
  'checkatrade.com',
  'trustpilot.com',
  'yell.com',
  'google.com',
  'google.co.uk',
  'reddit.com',
  'yelp.co.uk',
  'yelp.com',
  'bark.com',
  'lawyerlocator.co.uk',
  'findlaw.co.uk',
  'chambers.com',
  'legal500.com',
  'legalcheek.com',
  'moneysupermarket.com',
  'comparethemarket.com',
  'which.co.uk',
  'citizensadvice.org.uk',
  'gov.uk',
  'wikipedia.org',
  'en.wikipedia.org',
  'facebook.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'tendorai.com',
  'www.tendorai.com',
  'bbc.co.uk',
  'theguardian.com',
  'telegraph.co.uk',
  'independent.co.uk',
  'dailymail.co.uk',
  'thisismoney.co.uk',
  'mumsnet.com',
  'quora.com',
  'medium.com',
]);

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function classifyDomain(domain) {
  if (DIRECTORY_DOMAINS.has(domain)) return 'directory_review_platform';
  if (domain.endsWith('.gov.uk') || domain.endsWith('.org.uk') || domain.endsWith('.ac.uk')) return 'directory_review_platform';
  return 'firm_website';
}

await mongoose.connect(MONGODB_URI);

const runs = await ExperimentRun.find({ study: STUDY, status: 'ok' })
  .select('platform citedUrls promptId')
  .lean();

console.log(`Total clean runs: ${runs.length}`);
console.log(`Study: ${STUDY}\n`);

// Load config for practice area count
const configPath = path.resolve('data/experiments/exp001-config.json');
let practiceAreaCount = '?';
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const specs = new Set();
  for (const p of config.prompts) {
    if (p.id.endsWith('-spec')) {
      const match = p.text.match(/I need a (.+?) solicitor in/i);
      if (match) specs.add(match[1].toLowerCase());
    }
  }
  practiceAreaCount = specs.size;
  console.log(`Practice areas in prompt panel: ${practiceAreaCount} (${[...specs].join(', ')})`);
}

// Prompt count
const promptIds = new Set(runs.map(r => r.promptId));
console.log(`Distinct prompts: ${promptIds.size}`);

// ── Per-platform domain tables ──

for (const platform of ['perplexity', 'chatgpt']) {
  const platformRuns = runs.filter(r => r.platform === platform);
  const domainCounts = {};
  let totalCitations = 0;

  for (const run of platformRuns) {
    for (const url of (run.citedUrls || [])) {
      const domain = extractDomain(url);
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      totalCitations++;
    }
  }

  const sorted = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
  const top10 = sorted.slice(0, 10);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${platform.toUpperCase()} — Top 10 cited domains`);
  console.log('═'.repeat(60));
  console.log(`Total citations: ${totalCitations} across ${platformRuns.length} runs\n`);
  console.log('Domain'.padEnd(35) + 'Count'.padStart(8) + '  Share');
  console.log('─'.repeat(55));
  for (const [domain, count] of top10) {
    const pct = (count / totalCitations * 100).toFixed(1);
    console.log(`${domain.padEnd(35)}${String(count).padStart(8)}  ${pct}%`);
  }

  // Directory vs firm split
  let dirCount = 0, firmCount = 0;
  for (const [domain, count] of sorted) {
    if (classifyDomain(domain) === 'directory_review_platform') dirCount += count;
    else firmCount += count;
  }
  console.log(`\nDirectory/review/platform: ${dirCount} (${(dirCount/totalCitations*100).toFixed(1)}%)`);
  console.log(`Individual firm websites:  ${firmCount} (${(firmCount/totalCitations*100).toFixed(1)}%)`);

  // Distinct firm domains
  const firmDomains = sorted.filter(([d]) => classifyDomain(d) === 'firm_website');
  console.log(`Distinct firm domains cited: ${firmDomains.length}`);
}

// ── Cross-platform stats ──

console.log(`\n${'═'.repeat(60)}`);
console.log('CROSS-PLATFORM STATS');
console.log('═'.repeat(60));

const allDomainCounts = {};
let allCitations = 0;
const allFirmDomains = new Set();

for (const run of runs) {
  for (const url of (run.citedUrls || [])) {
    const domain = extractDomain(url);
    allDomainCounts[domain] = (allDomainCounts[domain] || 0) + 1;
    allCitations++;
    if (classifyDomain(domain) === 'firm_website') allFirmDomains.add(domain);
  }
}

const sortedAll = Object.entries(allDomainCounts).sort((a, b) => b[1] - a[1]);
const top5Total = sortedAll.slice(0, 5).reduce((s, [, c]) => s + c, 0);
console.log(`\nTop-5 domain concentration: ${top5Total}/${allCitations} (${(top5Total/allCitations*100).toFixed(1)}%)`);
console.log('Top 5:');
for (const [domain, count] of sortedAll.slice(0, 5)) {
  console.log(`  ${domain}: ${count} (${(count/allCitations*100).toFixed(1)}%)`);
}

console.log(`\nDistinct firm domains cited (both engines): ${allFirmDomains.size}`);

// Most-cited single firm
const firmSorted = sortedAll.filter(([d]) => classifyDomain(d) === 'firm_website');
if (firmSorted.length > 0) {
  const [topFirmDomain, topFirmCount] = firmSorted[0];
  // Count distinct prompts this firm appeared in
  const promptsWithFirm = new Set();
  for (const run of runs) {
    for (const url of (run.citedUrls || [])) {
      if (extractDomain(url) === topFirmDomain) {
        promptsWithFirm.add(run.promptId);
        break;
      }
    }
  }
  console.log(`Most-cited firm domain: ${topFirmDomain} — ${topFirmCount} citations across ${promptsWithFirm.size} of ${promptIds.size} prompts`);
}

// Zero-citation runs
const zeroCitationRuns = runs.filter(r => !r.citedUrls || r.citedUrls.length === 0).length;
console.log(`\nRuns with zero citations: ${zeroCitationRuns}/${runs.length}`);

console.log(`\n${'═'.repeat(60)}`);
console.log('DOMAIN CLASSIFICATION USED');
console.log('═'.repeat(60));
console.log('The following domains are classified as directory/review/platform:');
console.log([...DIRECTORY_DOMAINS].sort().join(', '));
console.log('\nEverything else is classified as an individual firm website.');

console.log(`\n${'═'.repeat(60)}\n`);
await mongoose.disconnect();
