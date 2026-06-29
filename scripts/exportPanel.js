#!/usr/bin/env node
/**
 * Export a fixed research panel to JSON for researchPanelScan.js.
 * Same firms every month = clean trend data. Captures cause-fields
 * (hasWebsite, hasSra) at build time so outcome rows can later be
 * correlated against them. Includes ALL firms (no website filter) so
 * the panel isn't biased toward the more-visible firms.
 * Usage:
 *   node scripts/exportPanel.js --type solicitor --city Cardiff --limit 100 --out data/research-panel/cardiff-solicitors.json
 */
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

function arg(flag, def = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : def;
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) { console.error('MONGO_URI required'); process.exit(1); }

  const type = arg('--type', 'solicitor');
  const city = arg('--city', 'Cardiff');
  const limit = parseInt(arg('--limit', '100'), 10);
  const out = arg('--out', `data/research-panel/${city.toLowerCase()}-${type}s.json`);

  await mongoose.connect(MONGO_URI);

  const docs = await Vendor.find({
    vendorType: type,
    'location.city': new RegExp(`^${city}$`, 'i'),
  })
    .select('_id company contactInfo.website sraNumber')
    .limit(limit)
    .lean();

  const panel = docs.map(d => ({
    vendorId: String(d._id),
    name: d.company,
    website: d.contactInfo?.website || null,
    hasWebsite: Boolean(d.contactInfo?.website),
    sraNumber: d.sraNumber || null,
    hasSra: Boolean(d.sraNumber),
  }));

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(panel, null, 2));
  console.log(`Wrote ${panel.length} firms to ${out}`);
  console.log(`  with website: ${panel.filter(p => p.hasWebsite).length}`);
  console.log(`  with SRA number: ${panel.filter(p => p.hasSra).length}`);

  await mongoose.disconnect();
  process.exit(0);
}
main();
