#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

(async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected.');

    const collection = mongoose.connection.collection('weeklyreports');

    // List existing indexes
    const indexes = await collection.indexes();
    console.log('=== Existing indexes ===');
    indexes.forEach(idx => console.log(JSON.stringify(idx, null, 2)));

    // Drop the stale index
    try {
      await collection.dropIndex('vendorId_1_weekStarting_1');
      console.log('✅ Dropped stale index vendorId_1_weekStarting_1');
    } catch (err) {
      if (err.codeName === 'IndexNotFound') {
        console.log('⚠️  Index vendorId_1_weekStarting_1 not found (already dropped?)');
      } else {
        throw err;
      }
    }

    // List indexes again
    const indexesAfter = await collection.indexes();
    console.log('=== Indexes after cleanup ===');
    indexesAfter.forEach(idx => console.log(JSON.stringify(idx, null, 2)));

    // Delete any documents from the old schema that have weekStarting
    // but no weekStartDate (they're orphaned)
    const orphaned = await collection.countDocuments({
      weekStarting: { $exists: true },
      weekStartDate: { $exists: false },
    });
    console.log(`Found ${orphaned} orphaned reports from old schema`);

    if (orphaned > 0) {
      const result = await collection.deleteMany({
        weekStarting: { $exists: true },
        weekStartDate: { $exists: false },
      });
      console.log(`Deleted ${result.deletedCount} orphaned reports`);
    }

    // Delete any reports with weekStarting: null from failed dry-runs
    const failedInserts = await collection.countDocuments({ weekStarting: null });
    console.log(`Found ${failedInserts} reports with weekStarting: null (from failed dry-runs)`);

    if (failedInserts > 0) {
      const result = await collection.deleteMany({ weekStarting: null });
      console.log(`Deleted ${result.deletedCount} failed-insert reports`);
    }

    await mongoose.disconnect();
    console.log('Cleanup complete.');
    process.exit(0);
  } catch (err) {
    console.error('Cleanup failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
