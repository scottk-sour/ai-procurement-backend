#!/usr/bin/env node

/**
 * One-time migration: Generate URL slugs for all vendors.
 * Handles duplicates by appending city, then a numeric suffix.
 *
 * Usage: node --experimental-vm-modules scripts/generateSlugs.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('DB connected\n');

  const vendors = await Vendor.find({}, { company: 1, 'location.city': 1, slug: 1 }).lean();
  console.log(`Found ${vendors.length} vendors\n`);

  // Track used slugs to detect duplicates
  const usedSlugs = new Set();
  let updated = 0;
  let skipped = 0;
  let duplicatesResolved = 0;

  // Sort by _id for deterministic ordering
  vendors.sort((a, b) => a._id.toString().localeCompare(b._id.toString()));

  for (const vendor of vendors) {
    // Skip if already has a slug
    if (vendor.slug) {
      usedSlugs.add(vendor.slug);
      skipped++;
      continue;
    }

    let slug = toSlug(vendor.company);

    // If duplicate, append city
    if (usedSlugs.has(slug) && vendor.location?.city) {
      slug = `${slug}-${toSlug(vendor.location.city)}`;
      duplicatesResolved++;
    }

    // If still duplicate, append numeric suffix
    if (usedSlugs.has(slug)) {
      let suffix = 2;
      while (usedSlugs.has(`${slug}-${suffix}`)) suffix++;
      slug = `${slug}-${suffix}`;
    }

    usedSlugs.add(slug);

    await Vendor.updateOne({ _id: vendor._id }, { $set: { slug } });
    updated++;
  }

  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already had slug): ${skipped}`);
  console.log(`Duplicates resolved with city: ${duplicatesResolved}`);
  console.log(`Total unique slugs: ${usedSlugs.size}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
