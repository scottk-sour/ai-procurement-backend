#!/usr/bin/env node

/**
 * Weekly Vendor Email Sender
 *
 * Usage: node scripts/sendWeeklyVendorEmails.js
 * Cron:  Every Monday at 8am UK time
 *
 * Sends personalised AI visibility reports to all active vendors.
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import { generateWeeklyEmail } from '../services/vendorEmailService.js';
import { sendEmail } from '../services/emailService.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI or MONGODB_URI environment variable is required');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all vendors eligible for weekly email
    const vendors = await Vendor.find({
      email: { $exists: true, $ne: '' },
      emailUnsubscribed: { $ne: true },
      'account.status': 'active',
    })
      .select('_id company email')
      .lean();

    console.log(`Found ${vendors.length} eligible vendors`);

    let sent = 0;
    let failed = 0;

    for (const vendor of vendors) {
      try {
        const emailData = await generateWeeklyEmail(vendor._id);

        if (!emailData) {
          console.log(`  Skipped: ${vendor.company || vendor.email} (no email data)`);
          continue;
        }

        const result = await sendEmail(emailData);

        if (result.success) {
          console.log(`  Sent to: ${vendor.company || 'Unknown'} (${vendor.email})`);
          sent++;
        } else {
          console.error(`  Failed: ${vendor.company || 'Unknown'} (${vendor.email})`);
          failed++;
        }
      } catch (err) {
        console.error(`  Error for ${vendor.company || vendor.email}: ${err.message}`);
        failed++;
      }

      // Rate limiting — 1 second between sends
      await sleep(1000);
    }

    console.log('\n=== Weekly Email Summary ===');
    console.log(`Sent: ${sent}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${vendors.length - sent - failed}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Weekly email script failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
