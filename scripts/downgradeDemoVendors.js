#!/usr/bin/env node

/**
 * One-off script: downgrade 7 demo vendors to free tier.
 * Keeps only Cardiff Property Partners as the sole Pro demo account.
 * Delete this script after running.
 *
 * Usage: node scripts/downgradeDemoVendors.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

const KEEP_AS_PRO = '699757a97712b4369510e6c8'; // Cardiff Property Partners

const TO_DOWNGRADE_COMPANY_NAMES = [
  'Cardiff Mortgage Solutions',
  'CopyTech Wales',
  'Dragon Law Solicitors',
  'Harrison & Co Solicitors',
  'SecureView Accountants',
  'Severn Business Systems',
  'Valleys Tech',
];

(async () => {
  try {
    console.log('=== Downgrade Demo Vendors to Free Tier ===');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected.\n');

    // PREVIEW: show what will change before changing it
    console.log('=== PREVIEW: Vendors that WILL be downgraded ===');
    const toDowngrade = await Vendor.find({
      company: { $in: TO_DOWNGRADE_COMPANY_NAMES },
      _id: { $ne: KEEP_AS_PRO },
    }).select('_id company tier email').lean();

    if (toDowngrade.length === 0) {
      console.log('No vendors matching the downgrade list found.');
      console.log('Listing all current Pro/managed/verified vendors for reference:');
      const allPro = await Vendor.find({
        tier: { $in: ['pro', 'managed', 'verified', 'enterprise'] },
      }).select('_id company tier email').lean();
      allPro.forEach(v => console.log(`  ${v.company} (${v._id}) — ${v.tier} — ${v.email}`));
      await mongoose.disconnect();
      process.exit(1);
    }

    toDowngrade.forEach(v => {
      console.log(`  ${v.company} (${v._id}) — current tier: ${v.tier} — email: ${v.email}`);
    });

    console.log(`\n=== PREVIEW: Vendor that will be KEPT as Pro ===`);
    const keepVendor = await Vendor.findById(KEEP_AS_PRO).select('_id company tier email').lean();
    if (keepVendor) {
      console.log(`  ${keepVendor.company} (${keepVendor._id}) — tier: ${keepVendor.tier}`);
    } else {
      console.log(`  WARNING: ${KEEP_AS_PRO} not found! Aborting before changes.`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Apply the downgrade
    console.log('\n=== APPLYING DOWNGRADE ===');
    const result = await Vendor.updateMany(
      {
        company: { $in: TO_DOWNGRADE_COMPANY_NAMES },
        _id: { $ne: KEEP_AS_PRO },
      },
      {
        $set: { tier: 'free' },
      }
    );

    console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

    // Verify post-state
    console.log('\n=== VERIFICATION ===');
    const allProAfter = await Vendor.find({
      tier: { $in: ['pro', 'managed', 'verified', 'enterprise'] },
    }).select('_id company tier').lean();

    console.log(`\nVendors remaining as Pro/managed/verified (${allProAfter.length} total):`);
    allProAfter.forEach(v => console.log(`  ${v.company} (${v._id}) — ${v.tier}`));

    if (allProAfter.length === 1 && String(allProAfter[0]._id) === KEEP_AS_PRO) {
      console.log('\n✅ SUCCESS: Only Cardiff Property Partners remains as Pro.');
    } else {
      console.log('\n⚠️  WARNING: Pro vendor count is not exactly 1. Review above.');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Downgrade failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
