#!/usr/bin/env node

/**
 * EXP-001 Config Generator
 *
 * Reads the assignment file and generates the experiment config with
 * prompt templates instantiated per city.
 *
 * Usage:
 *   node scripts/experiments/generateExp001Config.js
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

const PROFILE_BASE = 'https://www.tendorai.com/solicitors';

async function main() {
  const assignPath = path.resolve('data/experiments/exp001-assignment.json');
  if (!fs.existsSync(assignPath)) {
    console.error('Run generateExp001Assignment.js first');
    process.exit(1);
  }
  const assignment = JSON.parse(fs.readFileSync(assignPath, 'utf8'));

  await mongoose.connect(MONGODB_URI);
  const Vendor = (await import('../../models/Vendor.js')).default;

  const byCity = {};
  for (const firm of assignment.firms) {
    const key = firm.city.toLowerCase();
    if (!byCity[key]) byCity[key] = { display: firm.city, firms: [] };
    byCity[key].firms.push(firm);
  }

  const prompts = [];

  for (const [cityKey, { display: city, firms }] of Object.entries(byCity).sort()) {
    const vendorIds = firms.map(f => f.firmId);
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('practiceAreas').lean();
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
      entityName: null,
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
    prompts,
  };

  const outPath = path.resolve('data/experiments/exp001-config.json');
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
  console.log(`Config written to ${outPath}`);
  console.log(`${prompts.length} prompts across ${Object.keys(byCity).length} cities`);
  console.log(`${assignment.firms.length} target URLs`);

  await mongoose.disconnect();
}

main().catch(err => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });
