#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import Vendor from '../models/Vendor.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const OUTPUT = '/tmp/solicitors-batch-002-2026-05-07.csv';
const LIMIT = 250;

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const vendors = await Vendor.find({
    vendorType: 'solicitor',
    $or: [{ tier: 'free' }, { tier: null }],
    email: { $exists: true, $ne: '', $not: /placeholder\.tendorai\.com/ },
    'contactInfo.website': { $exists: true, $ne: '' },
    'location.city': { $exists: true, $ne: '', $not: /cardiff|birmingham/i },
  })
    .select('_id company email contactInfo.phone contactInfo.website location.city location.postcode sraNumber slug practiceAreas')
    .limit(LIMIT)
    .lean();

  console.log(`Found ${vendors.length} solicitors (limit ${LIMIT})\n`);

  const cityCounts = {};
  for (const v of vendors) {
    const city = v.location?.city || 'unknown';
    cityCounts[city] = (cityCounts[city] || 0) + 1;
  }
  const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('Top 15 cities:');
  for (const [city, count] of topCities) {
    console.log(`  ${String(count).padStart(4)}  ${city}`);
  }
  console.log('');

  const header = 'vendor_id,firm_name,email,phone,website,city,postcode,sra_number,slug,practice_areas';
  const rows = vendors.map(v => [
    v._id.toString(),
    csvEscape(v.company),
    v.email,
    v.contactInfo?.phone || '',
    v.contactInfo?.website || '',
    v.location?.city || '',
    v.location?.postcode || '',
    v.sraNumber || '',
    v.slug || '',
    csvEscape((v.practiceAreas || []).join('|')),
  ].join(','));

  fs.writeFileSync(OUTPUT, [header, ...rows].join('\n') + '\n');
  console.log(`Written ${vendors.length} rows to ${OUTPUT}`);

  await mongoose.disconnect();
}

main().catch(err => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });
