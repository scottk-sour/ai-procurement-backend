#!/usr/bin/env node

/**
 * Recompute citation flags on stored experiment runs against corrected
 * target URLs from the config file.
 *
 * Only touches the `cited`, `url`, `group`, and `entityName` fields on each
 * target. The `mentioned` field is carried over from the stored value
 * untouched — it is never read, recomputed, or defaulted by this script.
 *
 * Streams runs via cursor (constant memory), batches writes via bulkWrite.
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

const BULK_SIZE = 500;

const args = process.argv.slice(2);
const studyIdx = args.indexOf('--study');
const configIdx = args.indexOf('--config');
if (studyIdx === -1 || configIdx === -1) {
  console.error('Usage: --study <tag> --config <path>');
  process.exit(1);
}
const study = args[studyIdx + 1];
const configPath = args[configIdx + 1];

// ── Scope + safety flags (guardrail; see the bulkWrite notes further down) ──
// --wave / --platform narrow the destructive rewrite; --dry-run computes and
// prints the tally without writing; --all-waves is the explicit opt-in to
// rewrite the entire study when no scope is given.
const waveIdx = args.indexOf('--wave');
const platformIdx = args.indexOf('--platform');
const DRY_RUN = args.includes('--dry-run');
const ALL_WAVES = args.includes('--all-waves');

let wave = null;
if (waveIdx !== -1) {
  const waveRaw = args[waveIdx + 1];
  if (!waveRaw || !/^\d+$/.test(waveRaw)) {
    console.error(`--wave must be a non-negative integer (got: ${waveRaw ?? '<missing>'})`);
    process.exit(1);
  }
  wave = parseInt(waveRaw, 10);
}

let platform = null;
if (platformIdx !== -1) {
  platform = args[platformIdx + 1];
  const platformPath = ExperimentRun.schema.path('platform');
  const PLATFORM_ENUM = (platformPath && (platformPath.enumValues || platformPath.options?.enum)) || [];
  if (!platform || !PLATFORM_ENUM.includes(platform)) {
    console.error(`--platform must be one of: ${PLATFORM_ENUM.join(', ') || '(enum unavailable)'} (got: ${platform ?? '<missing>'})`);
    process.exit(1);
  }
}

// Build the query filter ONCE and reuse it at every query site below.
const filter = { study, status: 'ok' };
if (wave !== null) filter.wave = wave;
if (platform !== null) filter.platform = platform;

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

// Config lookup keyed by (promptId, normUrl) → { rawUrl, group, entityName }
const configLookup = new Map();
for (const prompt of config.prompts) {
  for (const t of (prompt.targets || [])) {
    configLookup.set(`${prompt.id}::${normaliseUrl(t.url)}`, {
      rawUrl: t.url,
      group: t.group,
      entityName: t.entityName || null,
    });
  }
}

console.log(`Loaded ${configLookup.size} target entries from config`);

await mongoose.connect(MONGODB_URI);

// ── Scope announcement: make the blast radius visible before anything runs ──
const totalCount = await ExperimentRun.countDocuments(filter);
console.log(`Filter:  ${JSON.stringify(filter)}`);
console.log(`Matches: ${totalCount} document(s)`);
console.log(`Mode:    ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE (will rewrite stored citation flags)'}\n`);

// ── Refuse an unscoped destructive run ──
// No --wave and no --platform on a LIVE run would rewrite citation flags across
// EVERY wave and platform of the study — including closed wave-1 history and the
// wave-2 Perplexity rows the published figure rests on. Require --all-waves to
// proceed deliberately; otherwise stop and show the operator the exact scope.
if (wave === null && platform === null && !DRY_RUN && !ALL_WAVES) {
  const waves = await ExperimentRun.distinct('wave', filter);
  const platforms = await ExperimentRun.distinct('platform', filter);
  console.error('REFUSING to run: no --wave and no --platform on a LIVE run.');
  console.error(`This would rewrite stored citation flags across the ENTIRE study "${study}":`);
  console.error(`  waves:     ${waves.slice().sort((a, b) => a - b).join(', ') || '(none)'}`);
  console.error(`  platforms: ${platforms.slice().sort().join(', ') || '(none)'}`);
  console.error(`  documents: ${totalCount}`);
  console.error('\nRe-run scoped, e.g.:');
  console.error('  node scripts/experiments/recomputeCitations.js \\');
  console.error(`    --study ${study} --config ${configPath} --wave <n> --platform <name> --dry-run`);
  console.error('\nOr pass --all-waves to deliberately rewrite the entire study.');
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`Streaming ${totalCount} clean runs for study "${study}"...\n`);

const cursor = ExperimentRun.find(filter).cursor();
let scanned = 0;
let flipped = 0;
let totalCited = 0;
let bulkOps = [];
const promptStats = {};

for await (const run of cursor) {
  scanned++;

  const normCited = new Set((run.citedUrls || []).map(normaliseUrl));
  const normCitedArr = [...normCited];

  if (!promptStats[run.promptId]) promptStats[run.promptId] = { before: 0, after: 0, total: 0 };

  let changed = false;
  const updatedTargets = run.targets.map(target => {
    const raw = target.toObject ? target.toObject() : { ...target };
    const normUrl = normaliseUrl(raw.url);

    const cfg = configLookup.get(`${run.promptId}::${normUrl}`);
    const correctUrl = cfg?.rawUrl || raw.url;
    const correctGroup = cfg?.group || raw.group;
    const correctEntityName = cfg?.entityName || raw.entityName || null;

    const cited = normCited.has(normaliseUrl(correctUrl)) ||
      normCitedArr.some(c => c.startsWith(normaliseUrl(correctUrl)));

    const wasCited = raw.cited ?? false;

    promptStats[run.promptId].total++;
    if (wasCited) promptStats[run.promptId].before++;
    if (cited) { promptStats[run.promptId].after++; totalCited++; }
    if (wasCited !== cited) flipped++;

    if (wasCited !== cited || raw.url !== correctUrl || raw.entityName !== correctEntityName) {
      changed = true;
    }

    return {
      ...raw,
      url: correctUrl,
      group: correctGroup,
      cited,
      entityName: correctEntityName,
      // mentioned is carried over from raw — never touched
    };
  });

  if (!DRY_RUN && changed) {
    bulkOps.push({
      updateOne: {
        filter: { _id: run._id },
        update: { $set: { targets: updatedTargets } },
      },
    });
  }

  if (!DRY_RUN && bulkOps.length >= BULK_SIZE) {
    // NOTE: writes flush in BULK_SIZE batches with NO surrounding transaction.
    // A mid-run failure leaves documents partially recomputed with no rollback.
    // (This has happened in production — do not assume all-or-nothing here.)
    await ExperimentRun.bulkWrite(bulkOps);
    bulkOps = [];
  }

  if (scanned % 50 === 0) {
    process.stdout.write(`  ${scanned}/${totalCount} scanned, ${flipped} flipped so far\r`);
  }
}

if (!DRY_RUN && bulkOps.length > 0) {
  // NOTE: final batch flush — same no-transaction / no-rollback caveat as the
  // in-loop flush above.
  await ExperimentRun.bulkWrite(bulkOps);
}

console.log(`\n\n${'─'.repeat(60)}`);
console.log('Per-prompt cited totals (before -> after):');
console.log('─'.repeat(60));
for (const [promptId, stats] of Object.entries(promptStats).sort((a, b) => a[0].localeCompare(b[0]))) {
  const flag = stats.after > stats.before ? ' ^' : stats.after < stats.before ? ' v' : '';
  console.log(`  ${promptId}: ${stats.before}/${stats.total} -> ${stats.after}/${stats.total}${flag}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Done: ${scanned} runs scanned, ${flipped} cited flags changed, ${totalCited} total cited`);
console.log('='.repeat(60));
await mongoose.disconnect();
