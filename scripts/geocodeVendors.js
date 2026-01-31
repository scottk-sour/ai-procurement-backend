// scripts/geocodeVendors.js
// One-time script to geocode all vendor postcodes and store coordinates

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from '../models/Vendor.js';
import { lookupPostcode } from '../utils/postcodeUtils.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function geocodeVendors() {
  console.log('🌍 Starting vendor geocoding...\n');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all vendors with postcodes but no coordinates
    const vendors = await Vendor.find({
      'location.postcode': { $exists: true, $ne: '' },
      $or: [
        { 'location.coordinates.latitude': { $exists: false } },
        { 'location.coordinates.latitude': null }
      ]
    }).select('company location');

    console.log(`📍 Found ${vendors.length} vendors needing geocoding\n`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const vendor of vendors) {
      const postcode = vendor.location?.postcode;

      if (!postcode) {
        console.log(`⏭️  Skipping ${vendor.company} - no postcode`);
        skipped++;
        continue;
      }

      try {
        const result = await lookupPostcode(postcode);

        if (result.valid) {
          await Vendor.updateOne(
            { _id: vendor._id },
            {
              $set: {
                'location.coordinates.latitude': result.latitude,
                'location.coordinates.longitude': result.longitude,
                'location.region': result.region || vendor.location.region
              }
            }
          );
          console.log(`✅ ${vendor.company}: ${postcode} → (${result.latitude}, ${result.longitude})`);
          success++;
        } else {
          console.log(`❌ ${vendor.company}: ${postcode} - ${result.error}`);
          failed++;
        }

        // Rate limit: postcodes.io allows 3 requests/second
        await new Promise(resolve => setTimeout(resolve, 350));

      } catch (error) {
        console.log(`❌ ${vendor.company}: ${postcode} - ${error.message}`);
        failed++;
      }
    }

    console.log('\n📊 Geocoding Summary:');
    console.log(`   ✅ Success: ${success}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📍 Total: ${vendors.length}`);

    // Verify results
    const withCoords = await Vendor.countDocuments({
      'location.coordinates.latitude': { $exists: true, $ne: null }
    });
    const total = await Vendor.countDocuments();
    console.log(`\n📍 Vendors with coordinates: ${withCoords}/${total}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

geocodeVendors();
