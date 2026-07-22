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

// ── Five-bucket domain classification ──

const LEGAL_DIRECTORY = new Set([
  'reviewsolicitors.co.uk',
  'solicitors.com',
  'solicitorsup.co.uk',
  'solicitor.info',
  'lawyersolicitor.co.uk',
  'legalrank.uk',
  'samconveyancing.co.uk',
  'findlaw.co.uk',
  'lawyerlocator.co.uk',
  'legal500.com',
  'chambers.com',
  'legalcheek.com',
  'yell.com',
  'trustpilot.com',
  'bark.com',
  'checkatrade.com',
  'yelp.co.uk',
  'yelp.com',
  'tendorai.com',
]);

const FORUM_SOCIAL = new Set([
  'reddit.com',
  'mumsnet.com',
  'quora.com',
  'facebook.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'medium.com',
]);

const MEDIA_REFERENCE = new Set([
  'bbc.co.uk',
  'theguardian.com',
  'telegraph.co.uk',
  'independent.co.uk',
  'dailymail.co.uk',
  'thisismoney.co.uk',
  'wikipedia.org',
  'en.wikipedia.org',
  'gov.uk',
  'citizensadvice.org.uk',
  'sra.org.uk',
  'lawsociety.org.uk',
  'which.co.uk',
  'moneysupermarket.com',
  'comparethemarket.com',
]);

const SEARCH = new Set([
  'google.com',
  'google.co.uk',
]);

const BUCKET_LABELS = {
  firm: 'Individual firm website',
  directory: 'Legal directory / review platform',
  forum: 'Forum / social',
  media: 'Media / reference',
  search: 'Search engine',
};

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function inSet(domain, set) {
  if (set.has(domain)) return true;
  for (const entry of set) {
    if (domain.endsWith('.' + entry)) return true;
  }
  return false;
}

function classifyDomain(domain) {
  if (inSet(domain, SEARCH)) return 'search';
  if (inSet(domain, LEGAL_DIRECTORY)) return 'directory';
  if (inSet(domain, FORUM_SOCIAL)) return 'forum';
  if (inSet(domain, MEDIA_REFERENCE)) return 'media';
  if (domain.endsWith('.gov.uk')) return 'media';
  if (domain.endsWith('.ac.uk')) return 'media';
  return 'firm';
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

const promptIds = new Set(runs.map(r => r.promptId));
console.log(`Distinct prompts: ${promptIds.size}`);

// ── Top 40 domains with buckets (for manual verification) ──

const globalDomainCounts = {};
for (const run of runs) {
  for (const url of (run.citedUrls || [])) {
    const domain = extractDomain(url);
    globalDomainCounts[domain] = (globalDomainCounts[domain] || 0) + 1;
  }
}
const globalSorted = Object.entries(globalDomainCounts).sort((a, b) => b[1] - a[1]);

console.log(`\n${'═'.repeat(70)}`);
console.log('TOP 40 DOMAINS — with assigned bucket (VERIFY THIS)');
console.log('═'.repeat(70));
console.log('Domain'.padEnd(40) + 'Count'.padStart(7) + '  Bucket');
console.log('─'.repeat(70));
for (const [domain, count] of globalSorted.slice(0, 40)) {
  const bucket = classifyDomain(domain);
  const label = BUCKET_LABELS[bucket] || bucket;
  console.log(`${domain.padEnd(40)}${String(count).padStart(7)}  ${label}`);
}

// ── Per-platform stats with five buckets ──

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

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${platform.toUpperCase()} — Top 10 cited domains`);
  console.log('═'.repeat(70));
  console.log(`Total citations: ${totalCitations} across ${platformRuns.length} runs\n`);
  console.log('Domain'.padEnd(40) + 'Count'.padStart(7) + '  Share');
  console.log('─'.repeat(60));
  for (const [domain, count] of sorted.slice(0, 10)) {
    const pct = (count / totalCitations * 100).toFixed(1);
    console.log(`${domain.padEnd(40)}${String(count).padStart(7)}  ${pct}%`);
  }

  // Five-bucket breakdown
  const buckets = { firm: 0, directory: 0, forum: 0, media: 0, search: 0 };
  let firmExGardner = 0;
  for (const [domain, count] of sorted) {
    const bucket = classifyDomain(domain);
    buckets[bucket] += count;
    if (bucket === 'firm' && domain !== 'gardnerchampion.co.uk') firmExGardner += count;
  }

  console.log(`\nFive-bucket breakdown:`);
  for (const [key, label] of Object.entries(BUCKET_LABELS)) {
    const count = buckets[key];
    const pct = totalCitations > 0 ? (count / totalCitations * 100).toFixed(1) : '0.0';
    console.log(`  ${label.padEnd(38)} ${String(count).padStart(6)}  (${pct}%)`);
  }

  const firmTotal = buckets.firm;
  const firmPct = totalCitations > 0 ? (firmTotal / totalCitations * 100).toFixed(1) : '0.0';
  const firmExPct = totalCitations > 0 ? (firmExGardner / totalCitations * 100).toFixed(1) : '0.0';
  console.log(`\n  Firm share (incl gardnerchampion):    ${String(firmTotal).padStart(6)}  (${firmPct}%)`);
  console.log(`  Firm share (excl gardnerchampion):    ${String(firmExGardner).padStart(6)}  (${firmExPct}%)`);

  const firmDomains = sorted.filter(([d]) => classifyDomain(d) === 'firm');
  console.log(`  Distinct firm domains cited:          ${firmDomains.length}`);
}

// ── Cross-platform stats ──

console.log(`\n${'═'.repeat(70)}`);
console.log('CROSS-PLATFORM STATS');
console.log('═'.repeat(70));

let allCitations = 0;
const allBuckets = { firm: 0, directory: 0, forum: 0, media: 0, search: 0 };
let allFirmExGardner = 0;
const allFirmDomains = new Set();

for (const [domain, count] of globalSorted) {
  allCitations += count;
  const bucket = classifyDomain(domain);
  allBuckets[bucket] += count;
  if (bucket === 'firm') {
    allFirmDomains.add(domain);
    if (domain !== 'gardnerchampion.co.uk') allFirmExGardner += count;
  }
}

const top5Total = globalSorted.slice(0, 5).reduce((s, [, c]) => s + c, 0);
console.log(`\nTop-5 domain concentration: ${top5Total}/${allCitations} (${(top5Total / allCitations * 100).toFixed(1)}%)`);
console.log('Top 5:');
for (const [domain, count] of globalSorted.slice(0, 5)) {
  console.log(`  ${domain}: ${count} (${(count / allCitations * 100).toFixed(1)}%)`);
}

console.log(`\nFive-bucket breakdown (both engines):`);
for (const [key, label] of Object.entries(BUCKET_LABELS)) {
  const count = allBuckets[key];
  const pct = allCitations > 0 ? (count / allCitations * 100).toFixed(1) : '0.0';
  console.log(`  ${label.padEnd(38)} ${String(count).padStart(6)}  (${pct}%)`);
}

console.log(`\n  Firm share (incl gardnerchampion):    ${String(allBuckets.firm).padStart(6)}  (${(allBuckets.firm / allCitations * 100).toFixed(1)}%)`);
console.log(`  Firm share (excl gardnerchampion):    ${String(allFirmExGardner).padStart(6)}  (${(allFirmExGardner / allCitations * 100).toFixed(1)}%)`);
console.log(`\nDistinct firm domains cited (both engines): ${allFirmDomains.size}`);

// Most-cited single firm
const firmSorted = globalSorted.filter(([d]) => classifyDomain(d) === 'firm');
if (firmSorted.length > 0) {
  const [topFirmDomain, topFirmCount] = firmSorted[0];
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

const zeroCitationRuns = runs.filter(r => !r.citedUrls || r.citedUrls.length === 0).length;
console.log(`\nRuns with zero citations: ${zeroCitationRuns}/${runs.length}`);

// ── Classification reference ──

console.log(`\n${'═'.repeat(70)}`);
console.log('DOMAIN CLASSIFICATION REFERENCE');
console.log('═'.repeat(70));
console.log(`\n(b) Legal directory / review platform (${LEGAL_DIRECTORY.size}):`);
console.log(`    ${[...LEGAL_DIRECTORY].sort().join(', ')}`);
console.log(`\n(c) Forum / social (${FORUM_SOCIAL.size}):`);
console.log(`    ${[...FORUM_SOCIAL].sort().join(', ')}`);
console.log(`\n(d) Media / reference (${MEDIA_REFERENCE.size}):`);
console.log(`    ${[...MEDIA_REFERENCE].sort().join(', ')}`);
console.log(`\n(e) Search (${SEARCH.size}):`);
console.log(`    ${[...SEARCH].sort().join(', ')}`);
console.log(`\n(a) Individual firm website: everything else`);
console.log(`    Also: any .gov.uk or .ac.uk domain → media/reference`);

console.log(`\n${'═'.repeat(70)}\n`);
await mongoose.disconnect();
