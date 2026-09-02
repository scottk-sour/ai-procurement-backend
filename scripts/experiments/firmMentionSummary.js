#!/usr/bin/env node

/**
 * firmMentionSummary.js — READ-ONLY firm-level mention summary for EXP-001.
 *
 * NO WRITES of any kind (no insert/update/delete/bulkWrite/save). Reads
 * experiment_runs with find().select().lean() only. Node built-ins plus the
 * existing Mongoose connection (same pattern as reportExperiment.js /
 * computeReportStats.js).
 *
 * Reports, at FIRM level, over the eligible answers selected by
 * --study / --wave / --platform (status:'ok' only):
 *   - total distinct firms in the panel (by entityName)
 *   - firms never mentioned in any eligible answer, and that as a percentage
 *   - firms mentioned at least once
 *   - the distribution of per-firm mention counts
 *   - overall mention rate = mentions / firm-answer observations
 *   - the never-named count broken down by treatment / control group
 *
 * PROVENANCE OF THE PUBLISHED FIGURES — READ THIS.
 * The published headline (TAI-R-2026-002: 1,214 firms, 1,003 never named = 82.6%,
 * 2,279 mentions of 48,560 = 4.69%) is "Frame C" — WAVE 2, PERPLEXITY ONLY
 * (docs/research/EXP-001-position.md §13; EXP-001-labelling-preregistration.md).
 * NO committed script in this repository computes those figures, so the exact
 * original counting could NOT be verified from the repository. In particular the
 * docs write the denominator as "1,214 firms × 40 answers = 48,560" — a NOMINAL
 * product, where 40 = 4 prompts × 10 runs × 1 platform. Whether the published
 * 48,560 was that nominal product or an actual observation count is not
 * established anywhere in the repo.
 *
 * This script therefore adopts an EXPLICIT definition and prints enough to see
 * whether it reconciles to the published number:
 *   - A "firm-answer observation" is ONE target entry on ONE eligible run.
 *   - The denominator is the ACTUAL count of such observations (not firms × 40).
 *   - It also prints distinct-firms × 40 (the nominal product) and flags whether
 *     the actual count equals it, and prints the observations-per-firm spread, so
 *     any gap between the actual count and the nominal 48,560 is visible.
 * Run `--study study_2026_07_exp001 --wave 2 --platform perplexity` for Frame C.
 *
 * Firm identity is entityName (the field the matcher and recompute key on); the
 * distinct target-url count is printed alongside as a cross-check (the docs state
 * both equal 1,214 and agree 1:1). Observations whose entityName is null/empty
 * cannot be attributed to a firm; they are reported separately.
 *
 * Usage:
 *   node scripts/experiments/firmMentionSummary.js --study <tag> [--wave <n>] [--platform <name>]
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

// 40 = 4 prompts × 10 runs × 1 platform (the docs' Frame C construction).
const NOMINAL_ANSWERS_PER_FIRM = 40;

// ── CLI ──
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const study = argVal('--study');
if (!study) { console.error('Usage: --study <tag> [--wave <n>] [--platform <name>]'); process.exit(1); }

const waveRaw = argVal('--wave');
let wave = null;
if (waveRaw !== null) {
  if (!/^\d+$/.test(waveRaw)) { console.error(`--wave must be a non-negative integer (got: ${waveRaw})`); process.exit(1); }
  wave = parseInt(waveRaw, 10);
}

let platform = argVal('--platform');
if (platform !== null) {
  const platformPath = ExperimentRun.schema.path('platform');
  const PLATFORM_ENUM = (platformPath && (platformPath.enumValues || platformPath.options?.enum)) || [];
  if (!PLATFORM_ENUM.includes(platform)) {
    console.error(`--platform must be one of: ${PLATFORM_ENUM.join(', ') || '(enum unavailable)'} (got: ${platform})`);
    process.exit(1);
  }
}

// Eligibility filter. status:'ok' = a clean/eligible answer (same definition
// reportExperiment.js and computeReportStats.js use). --wave / --platform narrow.
const filter = { study, status: 'ok' };
if (wave !== null) filter.wave = wave;
if (platform !== null) filter.platform = platform;

const pct1 = (num, den) => (den > 0 ? (num / den * 100).toFixed(1) + '%' : 'n/a');
const pct2 = (num, den) => (den > 0 ? (num / den * 100).toFixed(2) + '%' : 'n/a');

async function main() {
  await mongoose.connect(MONGODB_URI);
  try {
    const runs = await ExperimentRun.find(filter).select('targets').lean();

    // ── Aggregate at firm level (firm key = entityName) ──
    const firms = new Map(); // entityName -> { obs, mentions, groups:Set }
    const urlSet = new Set();
    let totalObs = 0;
    let totalMentions = 0;
    let nullEntityObs = 0;
    let nullEntityMentions = 0;

    for (const run of runs) {
      for (const t of (run.targets || [])) {
        totalObs++;
        const mentioned = t.mentioned === true;
        if (mentioned) totalMentions++;
        if (t.url) urlSet.add(t.url);

        const name = (t.entityName == null || t.entityName === '') ? null : t.entityName;
        if (name === null) {
          nullEntityObs++;
          if (mentioned) nullEntityMentions++;
          continue;
        }
        let f = firms.get(name);
        if (!f) { f = { obs: 0, mentions: 0, groups: new Set() }; firms.set(name, f); }
        f.obs++;
        if (mentioned) f.mentions++;
        if (t.group) f.groups.add(t.group);
      }
    }

    // ── Firm-level tallies ──
    const distinctFirms = firms.size;
    let neverNamed = 0, mentionedAtLeastOnce = 0;
    let neverTreatment = 0, neverControl = 0, neverMixedOrUnknown = 0;
    const mentionCountHist = new Map(); // k mentions -> number of firms
    const obsHist = new Map();          // k observations -> number of firms
    const mixedGroupFirms = [];
    let minObs = Infinity, maxObs = 0;

    for (const [name, f] of firms) {
      mentionCountHist.set(f.mentions, (mentionCountHist.get(f.mentions) || 0) + 1);
      obsHist.set(f.obs, (obsHist.get(f.obs) || 0) + 1);
      if (f.obs < minObs) minObs = f.obs;
      if (f.obs > maxObs) maxObs = f.obs;

      const singleGroup = f.groups.size === 1 ? [...f.groups][0] : null;
      if (singleGroup === null) mixedGroupFirms.push(name);

      if (f.mentions === 0) {
        neverNamed++;
        if (singleGroup === 'treatment') neverTreatment++;
        else if (singleGroup === 'control') neverControl++;
        else neverMixedOrUnknown++;
      } else {
        mentionedAtLeastOnce++;
      }
    }
    if (!firms.size) minObs = 0;

    // ── Report ──
    console.log('='.repeat(72));
    console.log('EXP-001 firm-level mention summary — READ-ONLY (no writes)');
    console.log('='.repeat(72));
    console.log(`Filter:  ${JSON.stringify(filter)}`);
    console.log(`Eligible answers (runs): ${runs.length}   |   eligible = status:'ok'`);
    console.log(`Firm identity: entityName.`);
    console.log('');

    console.log('-- Panel --');
    console.log(`  distinct firms (by entityName):      ${distinctFirms}`);
    console.log(`  distinct target URLs (cross-check):  ${urlSet.size}`);
    console.log('');

    console.log('-- Never named --');
    console.log(`  never mentioned in any eligible answer: ${neverNamed}  (${pct1(neverNamed, distinctFirms)} of ${distinctFirms})`);
    console.log(`  mentioned at least once:                ${mentionedAtLeastOnce}  (${pct1(mentionedAtLeastOnce, distinctFirms)})`);
    console.log(`  never-named by group:  treatment ${neverTreatment}  |  control ${neverControl}`
      + (neverMixedOrUnknown ? `  |  mixed/unknown-group ${neverMixedOrUnknown}` : ''));
    console.log('');

    console.log('-- Mention-count distribution (firms by number of eligible answers naming them) --');
    for (const k of [...mentionCountHist.keys()].sort((a, b) => a - b)) {
      console.log(`  ${String(k).padStart(4)} mention(s): ${mentionCountHist.get(k)} firm(s)`);
    }
    console.log('');

    console.log('-- Firm-answer observations --');
    console.log(`  total firm-answer observations (ACTUAL): ${totalObs}`);
    console.log(`  total mentions (mentioned === true):     ${totalMentions}`);
    console.log(`  overall mention rate = mentions / observations: ${pct2(totalMentions, totalObs)}  (${totalMentions}/${totalObs})`);
    if (nullEntityObs) {
      console.log(`  NOTE: ${nullEntityObs} observation(s) have null/empty entityName (${nullEntityMentions} of them mentioned);`);
      console.log(`        they are counted in totalObs/totalMentions above but not attributed to any firm.`);
    }
    console.log('');

    console.log('-- Reconciliation to the published Frame C denominator (48,560) --');
    console.log(`  observations per firm: min ${minObs}, max ${maxObs}`
      + (distinctFirms && minObs === maxObs ? `  (every firm has exactly ${maxObs})` : distinctFirms ? '  (UNEVEN — spread below)' : ''));
    if (distinctFirms && minObs !== maxObs) {
      for (const k of [...obsHist.keys()].sort((a, b) => a - b)) {
        console.log(`     ${String(k).padStart(4)} obs: ${obsHist.get(k)} firm(s)`);
      }
    }
    const nominal = distinctFirms * NOMINAL_ANSWERS_PER_FIRM;
    console.log(`  distinct firms × ${NOMINAL_ANSWERS_PER_FIRM} (nominal, how the docs write 48,560): ${nominal}`);
    console.log(`  ACTUAL observations ${totalObs === nominal ? 'EQUALS' : 'does NOT equal'} distinct firms × ${NOMINAL_ANSWERS_PER_FIRM}`
      + (totalObs === nominal ? '.' : ` (actual ${totalObs} vs nominal ${nominal}).`));
    console.log('');

    console.log('-- Provenance --');
    console.log('  No committed script computes the published 48,560 / 1,003, so the exact');
    console.log('  original counting is NOT verified from the repo. This script counts ACTUAL');
    console.log('  firm-answer observations (one target on one eligible run) and prints');
    console.log('  firms × 40 alongside. Frame C = --wave 2 --platform perplexity');
    console.log('  (docs/research/EXP-001-position.md §13).');
    if (mixedGroupFirms.length) {
      console.log('');
      console.log(`  WARNING: ${mixedGroupFirms.length} firm(s) appear under more than one group across`);
      console.log(`  observations (expected 0): ${mixedGroupFirms.slice(0, 20).join(', ')}${mixedGroupFirms.length > 20 ? ' …' : ''}`);
    }
    console.log('='.repeat(72));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => { console.error('FATAL:', err.message); mongoose.disconnect().catch(() => {}); process.exit(1); });
