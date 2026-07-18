#!/usr/bin/env node

/**
 * EXP-001 Assignment Generator
 *
 * Loads all live solicitor profile firms, performs a seeded stratified shuffle
 * (by city), and splits 50/50 into treatment/control groups.
 *
 * Usage:
 *   node scripts/experiments/generateExp001Assignment.js
 *
 * Outputs:
 *   data/experiments/exp001-assignment.json
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const SEED = 20260718;

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const Vendor = (await import('../../models/Vendor.js')).default;

  const vendors = await Vendor.find({
    vendorType: 'solicitor',
    company: { $exists: true, $ne: '' },
    'location.city': { $exists: true, $ne: '' },
    slug: { $exists: true, $ne: '' },
  }).select('_id company slug location.city practiceAreas').lean();

  console.log(`Total solicitor vendors with profiles: ${vendors.length}`);

  const byCity = {};
  for (const v of vendors) {
    const city = v.location?.city?.trim();
    if (!city) continue;
    const key = city.toLowerCase();
    if (!byCity[key]) byCity[key] = { display: city, firms: [] };
    byCity[key].firms.push(v);
  }

  const rng = seededRandom(SEED);
  const assignment = [];
  const excludedCities = [];
  const citySummary = [];

  const cityKeys = Object.keys(byCity).sort();

  for (const key of cityKeys) {
    const { display: city, firms } = byCity[key];
    if (firms.length < 2) {
      excludedCities.push({ city, count: firms.length });
      continue;
    }

    const shuffled = seededShuffle(firms, rng);
    const half = Math.floor(shuffled.length / 2);

    let treatCount = 0, ctrlCount = 0;
    for (let i = 0; i < shuffled.length; i++) {
      const group = i < half ? 'treatment' : 'control';
      assignment.push({
        firmId: String(shuffled[i]._id),
        slug: shuffled[i].slug,
        city,
        group,
      });
      if (group === 'treatment') treatCount++;
      else ctrlCount++;
    }
    citySummary.push({ city, total: firms.length, treatment: treatCount, control: ctrlCount });
  }

  const output = {
    study: 'study_2026_07_exp001',
    seed: SEED,
    generatedAt: new Date().toISOString(),
    totalFirms: assignment.length,
    treatment: assignment.filter(a => a.group === 'treatment').length,
    control: assignment.filter(a => a.group === 'control').length,
    firms: assignment,
  };

  const outPath = path.resolve('data/experiments/exp001-assignment.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nAssignment written to ${outPath}`);

  console.log(`\n=== EXP-001 Assignment Summary ===`);
  console.log(`Seed: ${SEED}`);
  console.log(`Total included firms: ${assignment.length}`);
  console.log(`  Treatment: ${output.treatment}`);
  console.log(`  Control:   ${output.control}`);
  console.log(`Excluded cities (< 2 firms): ${excludedCities.length}`);

  console.log(`\nIncluded cities (${citySummary.length}):`);
  for (const c of citySummary.sort((a, b) => b.total - a.total).slice(0, 30)) {
    console.log(`  ${c.city}: ${c.total} firms (${c.treatment}T / ${c.control}C)`);
  }
  if (citySummary.length > 30) console.log(`  ... and ${citySummary.length - 30} more cities`);

  await mongoose.disconnect();
}

main().catch(err => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });
