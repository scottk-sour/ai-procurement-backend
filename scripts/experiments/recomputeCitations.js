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

const totalCount = await ExperimentRun.countDocuments({ study, status: 'ok' });
console.log(`Streaming ${totalCount} clean runs for study "${study}"...\n`);

const cursor = ExperimentRun.find({ study, status: 'ok' }).cursor();
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

  if (changed) {
    bulkOps.push({
      updateOne: {
        filter: { _id: run._id },
        update: { $set: { targets: updatedTargets } },
      },
    });
  }

  if (bulkOps.length >= BULK_SIZE) {
    await ExperimentRun.bulkWrite(bulkOps);
    bulkOps = [];
  }

  if (scanned % 50 === 0) {
    process.stdout.write(`  ${scanned}/${totalCount} scanned, ${flipped} flipped so far\r`);
  }
}

if (bulkOps.length > 0) {
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
