#!/usr/bin/env node
/**
 * runSearchableMirror.js — run the Searchable API mirror once, standalone.
 *
 * Connects to MongoDB, calls pullSearchableSnapshots() (the same function the
 * nightly cron runs), prints how many documents were written per endpoint with
 * their collection_status, then disconnects.
 *
 * Usage: node scripts/runSearchableMirror.js
 * Requires: SEARCHABLE_API_KEY and MONGODB_URI (or MONGO_URI) in env.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { pullSearchableSnapshots } from '../jobs/searchableMirror.js';
import SearchableSnapshot from '../models/SearchableSnapshot.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB connected.');

  const summary = await pullSearchableSnapshots();

  // Per-endpoint x collection_status breakdown for this run.
  const rows = await SearchableSnapshot.aggregate([
    { $match: { run_id: summary.runId } },
    { $group: { _id: { endpoint: '$endpoint', status: '$collection_status' }, count: { $sum: 1 } } },
    { $sort: { '_id.endpoint': 1, '_id.status': 1 } },
  ]);

  console.log(`\n=== Searchable mirror run ${summary.runId} ===`);
  console.log(`Documents written: ${summary.docs} ` +
    `(ok=${summary.ok}, partial=${summary.partial}, skipped=${summary.skipped}, failed=${summary.failed})\n`);

  console.log('Per endpoint:');
  let currentEndpoint = null;
  for (const r of rows) {
    if (r._id.endpoint !== currentEndpoint) {
      currentEndpoint = r._id.endpoint;
      console.log(`  ${currentEndpoint}`);
    }
    console.log(`      ${r._id.status.padEnd(8)} ${r.count}`);
  }

  await mongoose.disconnect();
  console.log('\nMongoDB disconnected.');
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
