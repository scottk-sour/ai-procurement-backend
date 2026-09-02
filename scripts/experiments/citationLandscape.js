#!/usr/bin/env node

/**
 * citationLandscape.js — READ-ONLY open-set citation analysis for the AI-visibility
 * content study (or any study). Reports which domains AI assistants cite, from the
 * full citedUrls[] stored on every run — independent of the target list.
 *
 * NO WRITES of any kind (no insert/update/delete/bulkWrite/save, no file writes).
 * Reads experiment_runs with find().select().lean() only. Node built-ins plus the
 * existing Mongoose connection.
 *
 * It does NOT classify domains into categories (directory / review site / media /
 * firm site / etc.). That judgement is deliberately left to the reader: a script
 * that guessed would bake an unrecorded classification into the results. Domains
 * are reported as bare hostnames, ranked by how many runs cite them.
 *
 * Counting unit: a run "cites" a domain if any of its citedUrls resolves to that
 * host. A domain is counted at most once per run (runs-citing, not URL-count), so
 * a share is "the fraction of runs that cited this domain at least once".
 *
 * Intent (buyer / research) is not stored on the run; it lives on each prompt in
 * the study config. This script reads that config (--config, default
 * data/experiments/visibility-content-config.json) to map promptId -> intent. The
 * by-intent breakdown and the --intent filter require it; if the config is absent
 * they are skipped (or, for --intent, the run stops).
 *
 * Usage:
 *   node scripts/experiments/citationLandscape.js --study study_2026_09_ai_visibility_content
 *   node scripts/experiments/citationLandscape.js --study <tag> --platform perplexity --intent buyer
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// ── CLI ──
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const study = argVal('--study');
if (!study) { console.error('Usage: --study <tag> [--platform <name>] [--intent buyer|research] [--config <path>]'); process.exit(1); }

let platform = argVal('--platform');
if (platform !== null) {
  const platformPath = ExperimentRun.schema.path('platform');
  const PLATFORM_ENUM = (platformPath && (platformPath.enumValues || platformPath.options?.enum)) || [];
  if (!PLATFORM_ENUM.includes(platform)) {
    console.error(`--platform must be one of: ${PLATFORM_ENUM.join(', ') || '(enum unavailable)'} (got: ${platform})`);
    process.exit(1);
  }
}

const intentFilter = argVal('--intent');
if (intentFilter !== null && intentFilter !== 'buyer' && intentFilter !== 'research') {
  console.error(`--intent must be "buyer" or "research" (got: ${intentFilter})`);
  process.exit(1);
}

const configPath = path.resolve(argVal('--config') || path.join(REPO_ROOT, 'data/experiments/visibility-content-config.json'));

// ── promptId -> intent, from the study config (source of truth for intent) ──
const intentByPrompt = new Map();
let intentAvailable = false;
if (fs.existsSync(configPath)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    for (const p of (cfg.prompts || [])) {
      if (p && p.id && (p.intent === 'buyer' || p.intent === 'research')) intentByPrompt.set(p.id, p.intent);
    }
    intentAvailable = intentByPrompt.size > 0;
  } catch (err) {
    console.error(`WARNING: could not parse --config ${configPath}: ${err.message}. Intent breakdown disabled.`);
  }
}
if (intentFilter !== null && !intentAvailable) {
  console.error(`--intent was given but no intent map is available (config: ${configPath}). Cannot filter by intent.`);
  process.exit(1);
}

// ── Helpers ──
function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return String(url || '').toLowerCase(); }
}
function isTendoraiDomain(d) { return d === 'tendorai.com' || d.endsWith('.tendorai.com'); }
const pct = (num, den) => (den > 0 ? (num / den * 100).toFixed(1) + '%' : 'n/a');

// Rank a domain->count map and print (all entries; no truncation).
function printRanked(label, domainRuns, total) {
  console.log(label + `  (n=${total} runs)`);
  const rows = [...domainRuns.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  if (!rows.length) { console.log('  (no domains cited)'); return; }
  for (const [domain, count] of rows) {
    console.log(`  ${String(count).padStart(5)}  ${pct(count, total).padStart(6)}  ${domain}`);
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  try {
    const filter = { study, status: 'ok' };
    if (platform !== null) filter.platform = platform;

    let runs = await ExperimentRun.find(filter).select('promptId platform citedUrls').lean();

    // Apply --intent filter (using the config's promptId -> intent map).
    if (intentFilter !== null) {
      runs = runs.filter((r) => intentByPrompt.get(r.promptId) === intentFilter);
    }

    const totalRuns = runs.length;

    // Per-run distinct domains (a domain counts once per run).
    const runDomains = (r) => new Set((r.citedUrls || []).map(extractDomain));

    // 1. Coverage: runs that cited anything at all.
    let runsWithCites = 0;
    for (const r of runs) if ((r.citedUrls || []).length > 0) runsWithCites++;
    const runsNoCites = totalRuns - runsWithCites;

    // 2. Overall domain -> runs-citing.
    const overall = new Map();
    // 3a. by engine, 3b. by intent.
    const byEngine = new Map();   // platform -> Map(domain->count)
    const engineTotals = new Map();
    const byIntent = new Map();   // intent -> Map(domain->count)
    const intentTotals = new Map();
    // 4. tendorai pages -> Set(promptId).
    const tendoraiPages = new Map(); // full url -> Set(promptId)
    // 5. per prompt -> { runs, domains:Set }.
    const perPrompt = new Map();

    for (const r of runs) {
      const domains = runDomains(r);
      for (const d of domains) overall.set(d, (overall.get(d) || 0) + 1);

      if (!byEngine.has(r.platform)) byEngine.set(r.platform, new Map());
      engineTotals.set(r.platform, (engineTotals.get(r.platform) || 0) + 1);
      const em = byEngine.get(r.platform);
      for (const d of domains) em.set(d, (em.get(d) || 0) + 1);

      const intent = intentByPrompt.get(r.promptId) || 'unknown';
      if (!byIntent.has(intent)) byIntent.set(intent, new Map());
      intentTotals.set(intent, (intentTotals.get(intent) || 0) + 1);
      const im = byIntent.get(intent);
      for (const d of domains) im.set(d, (im.get(d) || 0) + 1);

      if (!perPrompt.has(r.promptId)) perPrompt.set(r.promptId, { runs: 0, domains: new Set() });
      const pp = perPrompt.get(r.promptId);
      pp.runs++;
      for (const d of domains) pp.domains.add(d);

      // tendorai pages (exact cited URL) + which prompt.
      for (const u of (r.citedUrls || [])) {
        if (isTendoraiDomain(extractDomain(u))) {
          if (!tendoraiPages.has(u)) tendoraiPages.set(u, new Set());
          tendoraiPages.get(u).add(r.promptId);
        }
      }
    }

    // ── Report ──
    console.log('='.repeat(74));
    console.log('EXP citation landscape — READ-ONLY (open-set, from citedUrls[])');
    console.log('='.repeat(74));
    console.log(`Filter: ${JSON.stringify(filter)}` + (intentFilter ? `  intent=${intentFilter}` : ''));
    console.log(`Intent map: ${intentAvailable ? `${intentByPrompt.size} prompts from ${path.relative(REPO_ROOT, configPath)}` : 'UNAVAILABLE (by-intent breakdown skipped)'}`);
    console.log('Domains are bare hostnames; NOT classified into categories (by design).');
    console.log('');

    // 1. Coverage
    console.log('-- Coverage --');
    console.log(`  total runs:                 ${totalRuns}`);
    console.log(`  runs citing >=1 URL:        ${runsWithCites}  (${pct(runsWithCites, totalRuns)})`);
    console.log(`  runs citing NOTHING:        ${runsNoCites}  (${pct(runsNoCites, totalRuns)})`);
    if (totalRuns > 0 && runsNoCites / totalRuns >= 0.10) {
      console.log(`  *** ${pct(runsNoCites, totalRuns)} of runs cite nothing. Every domain share below is a fraction`);
      console.log(`      of ALL runs (including those); read them with this in mind. ***`);
    }
    console.log('');

    // 2. Overall
    console.log('-- Cited domains, ranked by runs citing (count | share of all runs | domain) --');
    printRanked('  ALL ENGINES / ALL INTENTS', overall, totalRuns);
    console.log('');

    // 3a. by engine
    console.log('-- By engine --');
    for (const p of [...byEngine.keys()].sort()) {
      printRanked(`  [${p}]`, byEngine.get(p), engineTotals.get(p));
      console.log('');
    }

    // 3b. by intent
    console.log('-- By intent --');
    if (!intentAvailable) {
      console.log('  (intent map unavailable — pass --config to enable this breakdown)');
    } else {
      for (const it of [...byIntent.keys()].sort()) {
        printRanked(`  [${it}]`, byIntent.get(it), intentTotals.get(it));
        console.log('');
      }
    }

    // 4. tendorai
    console.log('-- tendorai.com citations --');
    if (tendoraiPages.size === 0) {
      console.log('  No tendorai.com URL was cited in any run in scope.');
    } else {
      console.log(`  ${tendoraiPages.size} distinct tendorai.com page(s) cited:`);
      const rows = [...tendoraiPages.entries()].sort((a, b) => (b[1].size - a[1].size) || (a[0] < b[0] ? -1 : 1));
      for (const [url, prompts] of rows) {
        console.log(`    ${url}`);
        console.log(`      cited on prompt(s): ${[...prompts].sort().join(', ')}`);
      }
    }
    console.log('');

    // 5. per-prompt distinct domains (phrasing sensitivity)
    console.log('-- Distinct domains per prompt (phrasing sensitivity across the 10 runs) --');
    for (const id of [...perPrompt.keys()].sort()) {
      const pp = perPrompt.get(id);
      const doms = [...pp.domains].sort();
      console.log(`  ${id} (${pp.runs} run(s), ${doms.length} distinct domain(s)): ${doms.join(', ') || '(none)'}`);
    }
    console.log('='.repeat(74));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => { console.error('FATAL:', err.message); mongoose.disconnect().catch(() => {}); process.exit(1); });
