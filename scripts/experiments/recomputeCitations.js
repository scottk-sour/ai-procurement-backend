#!/usr/bin/env node

/**
 * Recompute citation flags on stored experiment runs against corrected
 * target URLs from the config file.
 *
 * No API calls — reads citedUrls from the DB, loads target URLs from config,
 * re-matches with normalised comparison, and updates cited flags in place.
 *
 * Usage:
 *   node scripts/experiments/recomputeCitations.js \
 *     --study study_2026_07_exp001 \
 *     --config data/experiments/exp001-config.json
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

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

function normaliseUrl(url) {
  try {
    const u = new URL(url.replace(/^\/\//, 'https://'));
    return (u.origin + u.pathname)
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
  }
}

// Build lookup: promptId → [ { url (normalised), rawUrl, group, entityName } ]
const configTargets = new Map();
for (const prompt of config.prompts) {
  const targets = (prompt.targets || []).map(t => ({
    normUrl: normaliseUrl(t.url),
    rawUrl: t.url,
    group: t.group,
    entityName: t.entityName || null,
  }));
  configTargets.set(prompt.id, targets);
}

console.log(`Loaded targets for ${configTargets.size} prompts from config\n`);

await mongoose.connect(MONGODB_URI);

const runs = await ExperimentRun.find({ study, status: 'ok' });
console.log(`Found ${runs.length} clean runs for study "${study}"\n`);

let updated = 0;
let flipped = 0;
const promptStats = {};

for (const run of runs) {
  const cfgTargets = configTargets.get(run.promptId);
  if (!cfgTargets) continue;

  const normCited = new Set((run.citedUrls || []).map(normaliseUrl));
  let changed = false;

  if (!promptStats[run.promptId]) promptStats[run.promptId] = { before: 0, after: 0, total: 0 };

  // Rebuild targets from config, re-match cited flags
  const newTargets = cfgTargets.map(ct => {
    const cited = normCited.has(ct.normUrl) ||
      [...normCited].some(c => c.startsWith(ct.normUrl));

    // Find the existing stored target for this URL (might be under old URL pattern)
    const existing = run.targets.find(t =>
      normaliseUrl(t.url) === ct.normUrl || t.url === ct.rawUrl
    );
    const wasCited = existing?.cited ?? false;

    promptStats[run.promptId].total++;
    if (wasCited) promptStats[run.promptId].before++;
    if (cited) promptStats[run.promptId].after++;

    if (wasCited !== cited) {
      flipped++;
      const dir = cited ? 'false->true' : 'true->false';
      console.log(`  [${run.promptId}/${run.platform}] ${ct.rawUrl}: ${dir}`);
    }

    return {
      url: ct.rawUrl,
      group: ct.group,
      cited,
      mentioned: existing?.mentioned ?? false,
      entityName: ct.entityName || existing?.entityName || null,
    };
  });

  // Check if targets actually changed
  const targetsChanged = newTargets.some((nt, i) => {
    const old = run.targets[i];
    return !old || old.cited !== nt.cited || old.url !== nt.url || old.entityName !== nt.entityName;
  }) || newTargets.length !== run.targets.length;

  if (targetsChanged) {
    run.targets = newTargets;
    run.markModified('targets');
    await run.save();
    changed = true;
  }

  if (changed) updated++;
}

console.log(`\n${'─'.repeat(60)}`);
console.log('Per-prompt cited totals (before -> after):');
console.log('─'.repeat(60));
for (const [promptId, stats] of Object.entries(promptStats).sort((a, b) => a[0].localeCompare(b[0]))) {
  const flag = stats.after > stats.before ? ' ^' : stats.after < stats.before ? ' v' : '';
  console.log(`  ${promptId}: ${stats.before}/${stats.total} -> ${stats.after}/${stats.total}${flag}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Done: ${updated} runs updated, ${flipped} cited flags flipped (${runs.length} total runs scanned)`);
console.log('='.repeat(60));
await mongoose.disconnect();
