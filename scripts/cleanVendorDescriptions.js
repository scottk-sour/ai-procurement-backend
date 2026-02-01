/**
 * Clean Vendor Descriptions Script
 * Removes personal notes and internal comments from vendor descriptions
 *
 * Run: node scripts/cleanVendorDescriptions.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

// Patterns that indicate internal/personal notes to be removed
const PATTERNS_TO_CLEAR = [
  /YOUR EMPLOYER/i,
  /your employer/i,
  /Potential competitor/i,
  /Limited online presence/i,
  /Limited information/i,
  /\bcompetitor\b/i,
  /\bterritory\b/i,
  /may be commercial printing rather than/i,
  /^[A-Z][a-z]+(?:\s[A-Z]\.?)?\s*\([^)]*(?:Proprietor|Director|Managing Director)[^)]*\)/i,
  /\([^)]*(?:Proprietor|Director|Managing Director)[^)]*\)/i
];

// Function to check if description should be cleared
function shouldClearDescription(description) {
  if (!description || typeof description !== 'string') return false;

  for (const pattern of PATTERNS_TO_CLEAR) {
    if (pattern.test(description)) {
      return true;
    }
  }
  return false;
}

// Function to check if description has useful business info
function hasUsefulContent(description) {
  if (!description || description.length < 20) return false;

  // Keywords that suggest useful business content
  const usefulKeywords = [
    /\d+\+?\s*years?\s*(experience|in\s*business|established)/i,
    /founded\s*\d{4}/i,
    /established\s*\d{4}/i,
    /since\s*\d{4}/i,
    /specialist/i,
    /service/i,
    /solution/i,
    /customer/i,
    /support/i,
    /maintenance/i,
    /install/i,
    /supply/i,
    /provider/i,
    /dealer/i,
    /partner/i,
    /certified/i,
    /accredited/i
  ];

  for (const keyword of usefulKeywords) {
    if (keyword.test(description)) {
      return true;
    }
  }

  return false;
}

async function cleanVendorDescriptions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully.\n');

    // Get the vendors collection directly
    const db = mongoose.connection.db;
    const vendorsCollection = db.collection('vendors');

    // Find all vendors with descriptions
    const vendors = await vendorsCollection.find({
      'businessProfile.description': { $exists: true, $ne: '', $ne: null }
    }).toArray();

    console.log(`Found ${vendors.length} vendors with descriptions.\n`);
    console.log('='.repeat(80));

    let cleanedCount = 0;
    const changes = [];

    for (const vendor of vendors) {
      const description = vendor.businessProfile?.description;

      if (!description) continue;

      if (shouldClearDescription(description)) {
        // Check if there's useful content mixed in
        const hasUseful = hasUsefulContent(description);

        // For now, just clear problematic descriptions
        // In a production scenario, you might want manual review for mixed content

        changes.push({
          vendorId: vendor._id,
          company: vendor.company,
          before: description,
          after: '',
          reason: 'Contains internal notes/personal info'
        });

        // Update the document
        await vendorsCollection.updateOne(
          { _id: vendor._id },
          { $set: { 'businessProfile.description': '' } }
        );

        cleanedCount++;
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('CLEANUP SUMMARY');
    console.log('='.repeat(80));

    if (changes.length === 0) {
      console.log('\nNo descriptions needed cleaning.');
    } else {
      console.log(`\nCleaned ${cleanedCount} vendor description(s):\n`);

      for (const change of changes) {
        console.log('-'.repeat(80));
        console.log(`VENDOR: ${change.company}`);
        console.log(`ID: ${change.vendorId}`);
        console.log(`REASON: ${change.reason}`);
        console.log('\nBEFORE:');
        console.log(`  "${change.before}"`);
        console.log('\nAFTER:');
        console.log(`  "${change.after || '(empty)'}""`);
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log(`Total vendors processed: ${vendors.length}`);
    console.log(`Descriptions cleaned: ${cleanedCount}`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

// Run the script
cleanVendorDescriptions();
