#!/usr/bin/env node

/**
 * EXP-001 Config Generator
 *
 * Reads the assignment file and generates the experiment config with
 * prompt templates instantiated per city.
 *
 * Usage:
 *   node scripts/experiments/generateExp001Config.js [--min-firms N] [--max-firms N]
 *
 * Options:
 *   --min-firms N   Only include cities with at least N assigned firms (default: 2)
 *   --max-firms N   Only include cities with at most N assigned firms (default: no limit)
 *
 * Target URLs are restricted to firms in qualifying cities only.
 *
 * Run AFTER generateExp001Assignment.js.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const PROFILE_BASE = 'https://www.tendorai.com/suppliers/vendor';

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

async function main() {
  const assignPath = path.resolve('data/experiments/exp001-assignment.json');
  if (!fs.existsSync(assignPath)) {
    console.error('Run generateExp001Assignment.js first');
    process.exit(1);
  }
  const assignment = JSON.parse(fs.readFileSync(assignPath, 'utf8'));

  const minFirms = parseInt(getArg('min-firms') || '2');
  const maxFirms = parseInt(getArg('max-firms') || '0') || Infinity;

  await mongoose.connect(MONGODB_URI);
  const Vendor = (await import('../../models/Vendor.js')).default;

  const byCity = {};
  for (const firm of assignment.firms) {
    const key = firm.city.toLowerCase();
    if (!byCity[key]) byCity[key] = { display: firm.city, firms: [] };
    byCity[key].firms.push(firm);
  }

  const prompts = [];
  let includedCities = 0;
  let excludedCities = 0;
  let includedFirms = 0;

  for (const [cityKey, { display: city, firms }] of Object.entries(byCity).sort()) {
    if (firms.length < minFirms || firms.length > maxFirms) {
      excludedCities++;
      continue;
    }
    includedCities++;
    includedFirms += firms.length;

    const vendorIds = firms.map(f => f.firmId);
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('company practiceAreas').lean();
    const vendorMap = new Map(vendors.map(v => [String(v._id), v]));
    const specialismCounts = {};
    for (const v of vendors) {
      for (const pa of (v.practiceAreas || [])) {
        specialismCounts[pa] = (specialismCounts[pa] || 0) + 1;
      }
    }
    const topSpecialism = Object.entries(specialismCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'conveyancing';

    const targets = firms.map(f => ({
      url: `${PROFILE_BASE}/${f.slug}`,
      group: f.group,
      entityName: vendorMap.get(f.firmId)?.company || null,
    }));

    const templates = [
      { suffix: 'best', text: `Best conveyancing solicitors in ${city}` },
      { suffix: 'buy', text: `Recommend a solicitor in ${city} for buying a house` },
      { suffix: 'rep', text: `Which solicitors in ${city} have good reputations?` },
      { suffix: 'spec', text: `I need a ${topSpecialism.toLowerCase()} solicitor in ${city} — who should I consider?` },
    ];

    for (const tmpl of templates) {
      prompts.push({
        id: `${cityKey}-${tmpl.suffix}`,
        text: tmpl.text,
        city,
        targets,
      });
    }
  }

  const config = {
    study: 'study_2026_07_exp001',
    description: 'Does JSON-LD LegalService schema on solicitor profile pages increase AI citation?',
    filters: { minFirms, maxFirms: maxFirms === Infinity ? null : maxFirms },
    prompts,
  };

  const outPath = path.resolve('data/experiments/exp001-config.json');
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
  console.log(`Config written to ${outPath}`);
  console.log(`${prompts.length} prompts across ${includedCities} cities (${excludedCities} excluded by firm-count filter)`);
  console.log(`${includedFirms} target firms (min-firms=${minFirms}, max-firms=${maxFirms === Infinity ? 'none' : maxFirms})`);

  await mongoose.disconnect();
}

main().catch(err => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });
