#!/usr/bin/env node

/**
 * One-off: drop 3 stale weekStarting indexes from weeklyreports collection.
 * These were from the old PR #45 schema that used weekStarting (now weekStartDate).
 * Delete this script after running.
 *
 * Usage: node scripts/dropStaleWeekStartingIndexes.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

const STALE_INDEXES = [
  'weekStarting_1',
  'vendorId_1_weekStarting_-1',
  'weekStarting_-1',
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    const collection = mongoose.connection.collection('weeklyreports');

    const before = await collection.indexes();
    console.log('=== Existing indexes ===');
    before.forEach(idx => console.log(`  ${idx.name}`));

    for (const indexName of STALE_INDEXES) {
      try {
        await collection.dropIndex(indexName);
        console.log(`✅ Dropped ${indexName}`);
      } catch (err) {
        if (err.codeName === 'IndexNotFound') {
          console.log(`⚠️  ${indexName} not found (already dropped?)`);
        } else throw err;
      }
    }

    const after = await collection.indexes();
    console.log('\n=== Indexes after cleanup ===');
    after.forEach(idx => console.log(`  ${idx.name}`));

    await mongoose.disconnect();
    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
