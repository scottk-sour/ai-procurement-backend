#!/usr/bin/env node

/**
 * scripts/experiments/tendoraiCitationShare.js
 *
 * Self-citation disclosure numbers for the July 2026 report (TAI-R-2026-001).
 *
 * READ-ONLY — find() + lean() only. No writes, no flag recompute, no scan.
 * Uses the SAME run selection ({ study, status: 'ok' }) and the SAME domain
 * classification as scripts/experiments/computeReportStats.js, which produced
 * the banked stats on 22/07/2026. Do NOT add a wave filter until after wave 2
 * has landed — the banked 12,279 figure was computed without one, and the
 * total must reconcile before any figure below it is trusted.
 *
 * Reports:
 *   1. Total citations to tendorai.com (and subdomains), count and % of all
 *   2. Split by engine (perplexity / chatgpt), with denominators
 *   3. Directory bucket share with and without tendorai.com, to 1 dp
 *   4. Firm bucket share, plus which buckets tendorai URLs actually landed in
 *   5. tendorai citations on the prompt's own target profile URLs vs other
 *      tendorai.com pages
 *   6. Top 30 domains in the 'firm' bucket — 'firm' is the CATCH-ALL bucket,
 *      so this is the audit of what the published 74.1% is actually made of
 *
 * Usage: node scripts/experiments/tendoraiCitationShare.js
 * Requires: MONGODB_URI in env (or MONGO_URI), run from anywhere in the repo.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI (or MONGO_URI) required');
  process.exit(1);
}

const STUDY = 'study_2026_07_exp001';
const BANKED_TOTAL = 12279;
const BANKED_DIRECTORY = 2118;

// ─────────────────────────────────────────────────────────────────────────────
// Classification copied verbatim from computeReportStats.js.
// Do not edit these lists here. If a domain is misclassified, fix it in
// computeReportStats.js, restate every published figure, and log the change.
// ─────────────────────────────────────────────────────────────────────────────

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
  'thesolicitordirectory.co.uk',
  'vouchedfor.co.uk',
  'reallymoving.com',
  'lawhive.co.uk',
  'qualitysolicitors.com',
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

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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

function isTendorai(domain) {
  return domain === 'tendorai.com' || domain.endsWith('.tendorai.com');
}

// URL normalisation copied verbatim from auditTendoraiCitations.js, so the
// target-profile match in item 5 uses the same rule as the existing tooling.
function normaliseUrl(url) {
  try {
    const u = new URL(url.replace(/^\/\//, 'https://'));
    return (u.origin + u.pathname)
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  } catch {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Load target profile URLs per prompt from the committed config.
// Resolved relative to THIS FILE, not the shell's working directory, so the
// script behaves the same however it is invoked.
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../../data/experiments/exp001-config.json');

const targetsByPrompt = new Map();
let configLoaded = false;

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  for (const p of config.prompts || []) {
    // Accept either key name rather than assuming which one the config uses.
    const key = p.id ?? p.promptId;
    if (key === undefined) continue;
    targetsByPrompt.set(
      String(key),
      new Set((p.targets || []).map(t => normaliseUrl(t.url)))
    );
  }
  configLoaded = targetsByPrompt.size > 0;
  console.log(`Loaded target URLs for ${targetsByPrompt.size} prompts from ${configPath}`);
} else {
  console.log(`WARNING: config not found at ${configPath} — item 5 target matching will be skipped`);
}

// ─────────────────────────────────────────────────────────────────────────────

await mongoose.connect(MONGODB_URI);

const runs = await ExperimentRun.find({ study: STUDY, status: 'ok' })
  .select('platform citedUrls promptId')
  .lean();

let totalCitations = 0;
const buckets = { firm: 0, directory: 0, forum: 0, media: 0, search: 0 };
const totalByPlatform = {};
const tendoraiByPlatform = {};
const firmDomainCounts = {};
const tendoraiBucketsHit = new Set();
const tendoraiPathCounts = {};
let tendoraiTotal = 0;

for (const run of runs) {
  const platform = run.platform || '(missing)';
  for (const url of run.citedUrls || []) {
    const domain = extractDomain(url);
    const bucket = classifyDomain(domain);

    totalCitations++;
    totalByPlatform[platform] = (totalByPlatform[platform] || 0) + 1;
    buckets[bucket] = (buckets[bucket] || 0) + 1;

    if (bucket === 'firm') {
      firmDomainCounts[domain] = (firmDomainCounts[domain] || 0) + 1;
    }

    if (isTendorai(domain)) {
      tendoraiTotal++;
      tendoraiByPlatform[platform] = (tendoraiByPlatform[platform] || 0) + 1;
      tendoraiBucketsHit.add(bucket);
      let p = '(unparseable)';
      try { p = new URL(url).pathname.replace(/\/+$/, '') || '/'; } catch { /* keep default */ }
      tendoraiPathCounts[p] = (tendoraiPathCounts[p] || 0) + 1;
    }
  }
}

const pct = n => (totalCitations > 0 ? (n / totalCitations * 100).toFixed(1) : '0.0');

console.log(`\nStudy: ${STUDY}`);
console.log(`Filter: { study, status: 'ok' } — no wave filter, matching the banked 22/07 logic`);
console.log(`Clean runs: ${runs.length}`);
console.log(`Total citations: ${totalCitations}   (banked 22/07 figure: ${BANKED_TOTAL})`);

if (totalCitations !== BANKED_TOTAL) {
  console.log(`\n*** MISMATCH: total is ${totalCitations}, banked figure is ${BANKED_TOTAL}.`);
  console.log(`*** Every figure below is measuring a different dataset. Reconcile before quoting anything.`);
}

// ── Platform sanity check ────────────────────────────────────────────────────
const unexpectedPlatforms = Object.keys(totalByPlatform)
  .filter(p => p !== 'perplexity' && p !== 'chatgpt');
if (unexpectedPlatforms.length) {
  console.log(`\n*** Unexpected platform values present: ${unexpectedPlatforms.join(', ')}`);
  console.log(`*** These citations ARE in the totals above but are not in the two-engine split below.`);
}

// ── 1. tendorai.com total ────────────────────────────────────────────────────
console.log(`\n1. tendorai.com citations (incl. subdomains): ${tendoraiTotal}  (${pct(tendoraiTotal)}% of all citations)`);

// ── 2. Engine split ──────────────────────────────────────────────────────────
console.log(`\n2. Split by engine:`);
for (const platform of Object.keys(totalByPlatform).sort()) {
  const t = tendoraiByPlatform[platform] || 0;
  const all = totalByPlatform[platform];
  const share = all > 0 ? (t / all * 100).toFixed(1) : '0.0';
  console.log(`   ${platform.padEnd(12)} ${String(t).padStart(6)} of ${String(all).padStart(6)} citations  (${share}% of that engine's citations)`);
}

// ── 3. Directory bucket ──────────────────────────────────────────────────────
console.log(`\n3. Directory bucket:`);
console.log(`   incl. tendorai.com: ${buckets.directory}  (${pct(buckets.directory)}%)   [banked: ${BANKED_DIRECTORY}]`);
console.log(`   excl. tendorai.com: ${buckets.directory - tendoraiTotal}  (${pct(buckets.directory - tendoraiTotal)}%)`);
if (buckets.directory !== BANKED_DIRECTORY) {
  console.log(`   *** Directory total does not match the banked ${BANKED_DIRECTORY}. Reconcile before quoting.`);
}

// ── 4. Firm bucket ───────────────────────────────────────────────────────────
console.log(`\n4. Firm bucket: ${buckets.firm}  (${pct(buckets.firm)}%)`);
console.log(`   Buckets tendorai.com URLs landed in: ${[...tendoraiBucketsHit].join(', ') || '(none)'}`);
if (tendoraiBucketsHit.size === 1 && tendoraiBucketsHit.has('directory')) {
  console.log(`   Confirmed: all tendorai.com citations are directory-classified, so the firm share is unchanged by the exclusion.`);
} else {
  console.log(`   *** tendorai.com URLs did NOT all land in 'directory'. The firm share IS affected. Investigate before quoting.`);
}

// ── 5. tendorai citations vs study targets ───────────────────────────────────
console.log(`\n5. tendorai.com citations vs study targets:`);

if (!configLoaded) {
  console.log(`   SKIPPED — config not loaded.`);
} else {
  let onTargetProfile = 0;
  let otherTendoraiPages = 0;
  let citationsWithNoTargetSet = 0;
  const promptsWithTendoraiCitations = new Set();
  const runPromptIdsSeen = new Set();
  let runsWithNoTargetSet = 0;

  for (const run of runs) {
    const key = String(run.promptId);
    runPromptIdsSeen.add(key);
    const targets = targetsByPrompt.get(key);
    if (!targets) runsWithNoTargetSet++;

    for (const url of run.citedUrls || []) {
      if (!isTendorai(extractDomain(url))) continue;
      promptsWithTendoraiCitations.add(key);
      if (!targets) {
        citationsWithNoTargetSet++;
      } else if (targets.has(normaliseUrl(url))) {
        onTargetProfile++;
      } else {
        otherTendoraiPages++;
      }
    }
  }

  const matchedPromptIds = [...runPromptIdsSeen].filter(k => targetsByPrompt.has(k)).length;
  console.log(`   Prompt-ID join: ${matchedPromptIds} of ${runPromptIdsSeen.size} distinct run promptIds matched a config prompt.`);

  if (matchedPromptIds === 0) {
    console.log(`   *** ZERO prompt IDs matched. The run promptId and the config prompt key are different fields.`);
    console.log(`   *** Sample run promptIds : ${[...runPromptIdsSeen].slice(0, 3).join(', ')}`);
    console.log(`   *** Sample config keys   : ${[...targetsByPrompt.keys()].slice(0, 3).join(', ')}`);
    console.log(`   *** The on-target / other split below is meaningless until this is fixed.`);
  } else if (runsWithNoTargetSet > 0) {
    console.log(`   *** ${runsWithNoTargetSet} runs had no matching config prompt; ${citationsWithNoTargetSet} tendorai citations could not be classified.`);
  }

  console.log(`   Citations to the prompt's own target profile URLs: ${onTargetProfile}`);
  console.log(`   Citations to other tendorai.com pages:             ${otherTendoraiPages}`);
  console.log(`   Unclassifiable (no matching config prompt):        ${citationsWithNoTargetSet}`);
  console.log(`   Distinct prompts with any tendorai citation:       ${promptsWithTendoraiCitations.size}`);
}

// Most-cited tendorai.com paths — shows whether it is profile pages or
// city listings and the homepage doing the work.
const tendoraiPathsSorted = Object.entries(tendoraiPathCounts).sort((a, b) => b[1] - a[1]);
if (tendoraiPathsSorted.length) {
  console.log(`\n   Top 10 tendorai.com paths cited (of ${tendoraiPathsSorted.length} distinct):`);
  for (const [p, c] of tendoraiPathsSorted.slice(0, 10)) {
    console.log(`     ${String(c).padStart(5)}  ${p}`);
  }
}

// ── 6. Top 30 'firm' bucket domains ──────────────────────────────────────────
// 'firm' is the CATCH-ALL bucket: anything not in the directory/forum/media/
// search lists and not .gov.uk or .ac.uk. Any aggregator or directory missing
// from the classification lists is counted here as a firm website, which is
// what the published 74.1% rests on. Read this table before publishing.

const firmSorted = Object.entries(firmDomainCounts).sort((a, b) => b[1] - a[1]);
console.log(`\n6. Top 30 'firm' bucket domains (of ${firmSorted.length} distinct):\n`);
console.log('Domain'.padEnd(45) + 'Count'.padStart(7) + '   % of firm bucket' + '   % of all citations');
console.log('─'.repeat(92));
for (const [domain, count] of firmSorted.slice(0, 30)) {
  const pctFirm = buckets.firm > 0 ? (count / buckets.firm * 100).toFixed(1) : '0.0';
  console.log(
    domain.padEnd(45) +
    String(count).padStart(7) +
    `   ${pctFirm.padStart(6)}%` +
    `            ${pct(count).padStart(5)}%`
  );
}
console.log('─'.repeat(92));

const top30Total = firmSorted.slice(0, 30).reduce((s, [, c]) => s + c, 0);
const tailCount = Math.max(0, firmSorted.length - 30);
console.log(
  `Top 30 account for ${top30Total}/${buckets.firm} firm-bucket citations` +
  ` (${buckets.firm > 0 ? (top30Total / buckets.firm * 100).toFixed(1) : '0.0'}%);` +
  ` remaining ${tailCount} domains: ${buckets.firm - top30Total}`
);

// Explicit cross-check against the domain computeReportStats.js already
// singles out with its "excl gardnerchampion" lines.
const gc = firmDomainCounts['gardnerchampion.co.uk'] || 0;
console.log(`\ngardnerchampion.co.uk: ${gc} citations` +
  ` (${buckets.firm > 0 ? (gc / buckets.firm * 100).toFixed(1) : '0.0'}% of firm bucket,` +
  ` ${pct(gc)}% of all citations)`);
console.log(`Firm bucket excl. gardnerchampion.co.uk: ${buckets.firm - gc}  (${pct(buckets.firm - gc)}% of all citations)`);

await mongoose.disconnect();
process.exit(0);
