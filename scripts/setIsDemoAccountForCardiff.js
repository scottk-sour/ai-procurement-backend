#!/usr/bin/env node

/**
 * One-off: set isDemoAccount: true for Cardiff Property Partners.
 * Delete after running.
 *
 * Usage: node scripts/setIsDemoAccountForCardiff.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

    const result = await Vendor.updateOne(
      { _id: '699757a97712b4369510e6c8' },
      { $set: { isDemoAccount: true } }
    );
    console.log(`Modified: ${result.modifiedCount}`);

    const v = await Vendor.findById('699757a97712b4369510e6c8').select('company isDemoAccount tier').lean();
    console.log(`${v?.company} isDemoAccount: ${v?.isDemoAccount} tier: ${v?.tier}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
