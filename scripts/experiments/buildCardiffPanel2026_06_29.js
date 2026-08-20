#!/usr/bin/env node

/**
 * buildCardiffPanel2026_06_29.js — reconstruct the exact 29/06/2026 research_panel
 * Cardiff firm set from stored data and write it to source control.
 *
 * READ-ONLY against MongoDB: distinct() + find().lean() only. No writes to the DB.
 * The only write is the local JSON panel file.
 *
 * Recovers the panel exactly as instructed:
 *   AIMentionScan.distinct('vendorId', { source: 'research_panel' })  -> expected 81 ids
 * then joins each id to Vendor for company / website / SRA number. Ids whose Vendor
 * no longer exists are KEPT and flagged { missing: true } (never dropped), so the
 * 81-firm set stays complete and reproducible.
 *
 * Output: data/research-panel/cardiff-solicitors-2026-06-29.json
 * Ids are sorted ascending so the file is byte-stable across re-runs.
 *
 * Usage: node scripts/experiments/buildCardiffPanel2026_06_29.js
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import AIMentionScan from '../../models/AIMentionScan.js';
import Vendor from '../../models/Vendor.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const EXPECTED = 81;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '../../data/research-panel/cardiff-solicitors-2026-06-29.json');

await mongoose.connect(MONGODB_URI);

// Exact recovery query as specified — do not add filters.
const rawIds = await AIMentionScan.distinct('vendorId', { source: 'research_panel' });
const ids = rawIds.map(String).sort();

console.log(`research_panel distinct vendorIds: ${ids.length} (expected ${EXPECTED})`);
if (ids.length !== EXPECTED) {
  console.warn(`*** WARNING: got ${ids.length}, not ${EXPECTED}. This query returns ALL research_panel ids;`);
  console.warn(`*** if other cities were later scanned under source:'research_panel', the set is not Cardiff-only.`);
  console.warn(`*** Inspect before committing — do NOT assume this is the 29/06 Cardiff set.`);
}

const vendors = await Vendor.find({ _id: { $in: ids } })
  .select('_id company contactInfo.website sraNumber')
  .lean();
const byId = new Map(vendors.map(v => [String(v._id), v]));

let missing = 0;
const panel = ids.map(id => {
  const v = byId.get(id);
  if (!v) { missing++; return { vendorId: id, name: null, website: null, sraNumber: null, missing: true }; }
  return {
    vendorId: id,
    name: v.company ?? null,
    website: v.contactInfo?.website || null,
    sraNumber: v.sraNumber || null,
    missing: false,
  };
});

const output = {
  edition: '2026-06-29',
  source: 'research_panel',
  city: 'Cardiff',
  recoveredVia: "AIMentionScan.distinct('vendorId', { source: 'research_panel' }) joined to Vendor",
  count: panel.length,
  missingCount: missing,
  firms: panel,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote ${panel.length} firms (${missing} missing from Vendor) to ${OUT_PATH}`);

await mongoose.disconnect();
