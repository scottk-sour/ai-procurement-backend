#!/usr/bin/env node

/**
 * One-off: fix city-duplicated vendor slugs.
 * e.g. 'cardiff-property-partners-cardiff' → 'cardiff-property-partners'
 * Old slugs stored in vendor.previousSlugs[] for 301 redirect lookup.
 * Delete after running.
 *
 * Usage: node scripts/migrateSlugDuplication.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

function slugifyText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function computeCleanSlug(company, city) {
  const companySlug = slugifyText(company);
  if (!city) return companySlug;
  const citySlug = slugifyText(city);
  if (citySlug && !companySlug.includes(citySlug)) {
    return `${companySlug}-${citySlug}`;
  }
  return companySlug;
}

(async () => {
  try {
    console.log('=== Migrate Slug Duplication ===\n');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

    const vendors = await Vendor.find({
      slug: { $exists: true, $ne: null },
      'location.city': { $exists: true, $ne: '' },
    }).select('_id company slug location.city previousSlugs').lean();

    console.log(`Found ${vendors.length} vendors with slug + city.\n`);

    let updated = 0;
    let unchanged = 0;
    let skippedConflict = 0;

    for (const v of vendors) {
      const cleanSlug = computeCleanSlug(v.company, v.location?.city);

      if (cleanSlug === v.slug) {
        unchanged++;
        continue;
      }

      // Check uniqueness
      const taken = await Vendor.findOne({ slug: cleanSlug, _id: { $ne: v._id } });
      if (taken) {
        console.log(`  SKIP: ${v.company} — clean slug '${cleanSlug}' already taken by ${taken.company}`);
        skippedConflict++;
        continue;
      }

      await Vendor.updateOne(
        { _id: v._id },
        {
          $set: { slug: cleanSlug },
          $addToSet: { previousSlugs: v.slug },
        }
      );

      updated++;
      console.log(`  ✅ ${v.company}: '${v.slug}' → '${cleanSlug}'`);
    }

    console.log('\n=== Summary ===');
    console.log(`Updated:  ${updated}`);
    console.log(`Unchanged: ${unchanged}`);
    console.log(`Skipped (conflict): ${skippedConflict}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();

export { computeCleanSlug, slugifyText };
