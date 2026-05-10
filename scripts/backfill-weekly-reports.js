#!/usr/bin/env node

/**
 * Backfill Weekly Report Snapshots
 *
 * Retroactively generates WeeklyReport snapshots for Pro vendors
 * across past Mondays. Uses the same buildWeeklyProDigest() function
 * as the production Monday 08:00 cron.
 *
 * Idempotent — WeeklyReport.findOrCreate skips existing snapshots.
 * No emails sent. No agents triggered. Pure database writes.
 *
 * Usage:
 *   node scripts/backfill-weekly-reports.js                    # last 4 Mondays, all Pro vendors
 *   node scripts/backfill-weekly-reports.js --dry-run           # build digests but skip writes
 *   node scripts/backfill-weekly-reports.js --weeks=8           # last 8 Mondays
 *   node scripts/backfill-weekly-reports.js --vendor=64a1b2c3…  # single vendor
 *   node scripts/backfill-weekly-reports.js --help              # usage
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import WeeklyReport from '../models/WeeklyReport.js';
import { buildWeeklyProDigest } from '../services/weeklyProDigest.js';

const PRO_TIERS = ['pro', 'managed', 'verified', 'enterprise'];
const PRO_ACCOUNT_TIERS = ['gold', 'platinum', 'pro', 'verified'];

function parseArgs(argv) {
  const args = { dryRun: false, weeks: 4, vendor: null, tier: null, help: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--weeks=')) {
      const n = parseInt(arg.split('=')[1], 10);
      args.weeks = (n > 0 && n <= 12) ? n : 4;
    }
    else if (arg.startsWith('--vendor=')) args.vendor = arg.split('=')[1];
    else if (arg.startsWith('--tier=')) args.tier = arg.split('=')[1];
  }
  return args;
}

function printHelp() {
  console.log(`
Backfill Weekly Report Snapshots

Generates WeeklyReport documents for Pro vendors across past Mondays.
Idempotent — safe to re-run. No emails sent.

Usage:
  node scripts/backfill-weekly-reports.js [options]

Options:
  --dry-run         Build digests but skip database writes
  --weeks=N         Number of past Mondays to backfill (default: 4, max: 12)
  --vendor=<id>     Limit to a single vendor by ObjectId
  --tier=<tier>     Limit to a specific tier (default: all Pro tiers)
  --help, -h        Print this help message
`);
}

function resolveWeeks(count) {
  const now = new Date();
  const currentMonday = AgentRun.normaliseWeekStarting(now);
  const weeks = [];
  for (let i = count - 1; i >= 0; i--) {
    const monday = new Date(currentMonday);
    monday.setUTCDate(monday.getUTCDate() - (i * 7));
    weeks.push(monday);
  }
  return weeks;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }

  console.log('=== Backfill Weekly Report Snapshots ===');
  console.log(`Mode: ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (writing to DB)'}`);
  console.log(`Weeks: ${args.weeks}`);
  if (args.vendor) console.log(`Vendor filter: ${args.vendor}`);
  if (args.tier) console.log(`Tier filter: ${args.tier}`);
  console.log('');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const startTime = Date.now();

  const weeks = resolveWeeks(args.weeks);
  console.log(`Target weeks (${weeks.length}):`);
  for (const w of weeks) {
    console.log(`  ${w.toISOString().slice(0, 10)} (Monday)`);
  }
  console.log('');

  let vendorQuery;
  if (args.vendor) {
    vendorQuery = { _id: new mongoose.Types.ObjectId(args.vendor) };
  } else if (args.tier) {
    vendorQuery = { $or: [{ tier: args.tier }, { 'account.tier': args.tier }] };
  } else {
    vendorQuery = {
      $or: [
        { tier: { $in: PRO_TIERS } },
        { 'account.tier': { $in: PRO_ACCOUNT_TIERS } },
      ],
    };
  }

  const vendors = await Vendor.find(vendorQuery)
    .select('_id company tier')
    .lean();

  console.log(`Found ${vendors.length} vendor(s) to process.\n`);

  if (vendors.length === 0) {
    console.log('No vendors found. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  let created = 0;
  let alreadyExisted = 0;
  let errors = 0;
  let skippedDryRun = 0;
  const failures = [];

  const total = vendors.length * weeks.length;
  let processed = 0;

  for (let vi = 0; vi < vendors.length; vi++) {
    const vendor = vendors[vi];
    for (let wi = 0; wi < weeks.length; wi++) {
      const weekStarting = weeks[wi];
      processed++;
      const label = `[${vi + 1}/${vendors.length} ${vendor.company} | week ${wi + 1}/${weeks.length} ${weekStarting.toISOString().slice(0, 10)}]`;

      try {
        const digest = await buildWeeklyProDigest(vendor._id, weekStarting);

        if (args.dryRun) {
          skippedDryRun++;
          console.log(`${label} DRY RUN — digest built (score: ${digest.score.current ?? 'null'}, citations: ${digest.citations.total})`);
          continue;
        }

        const existing = await WeeklyReport.findOne({ vendorId: vendor._id, weekStarting });
        if (existing) {
          alreadyExisted++;
          console.log(`${label} Already exists — skipped`);
          continue;
        }

        await WeeklyReport.findOrCreate(vendor._id, weekStarting, digest);
        created++;
        console.log(`${label} Created (score: ${digest.score.current ?? 'null'}, citations: ${digest.citations.total})`);
      } catch (err) {
        errors++;
        failures.push({ vendor: vendor.company, vendorId: String(vendor._id), week: weekStarting.toISOString().slice(0, 10), error: err.message });
        console.error(`${label} ERROR: ${err.message}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('=== Summary ===');
  console.log(`Vendors processed: ${vendors.length}`);
  console.log(`Weeks attempted:   ${weeks.length}`);
  console.log(`Total pairs:       ${total}`);
  console.log(`Snapshots created: ${created}`);
  console.log(`Already existed:   ${alreadyExisted}`);
  if (args.dryRun) console.log(`Skipped (dry run): ${skippedDryRun}`);
  console.log(`Errors:            ${errors}`);
  console.log(`Elapsed:           ${elapsed}s`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  - ${f.vendor} (${f.vendorId}), week ${f.week}: ${f.error}`);
    }
  }

  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1]?.endsWith('backfill-weekly-reports.js')) {
  main().catch(err => {
    console.error('FATAL:', err);
    mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

export { parseArgs, resolveWeeks };
