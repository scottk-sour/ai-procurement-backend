#!/usr/bin/env node
/**
 * Research Panel Scan — fixed firms, fixed prompts, browsing platforms only.
 * Runs the SAME panel every month so trends accumulate. Only BROWSING_PLATFORMS
 * are queried and written, so data stays browsing-grade (no claude-haiku).
 * Usage: node scripts/researchPanelScan.js --panel data/research-panel/cardiff-solicitors.json
 * Panel format: [{ "vendorId":"...", "name":"Acme Law", "website":"https://..." }, ...]
 */
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import mongoose from 'mongoose';
import AIMentionScan from '../models/AIMentionScan.js';
import { BROWSING_PLATFORMS } from '../lib/config/browsingPlatforms.js';
import { querySinglePlatform } from '../services/platformQuery/index.js';
import { buildPrompt } from '../services/platformQuery/prompt.js';

const CITY = 'Cardiff';
const CATEGORY_PROMPTS = [
  'conveyancing solicitor',
  'commercial solicitor',
  'family law solicitor',
  'wills and probate solicitor',
];
// Real model per platform — never leave aiModel as the claude-haiku default.
const PLATFORM_MODEL = {
  perplexity: 'sonar',
  chatgpt: 'gpt-4o-mini-search-preview',
  gemini: 'gemini-2.0-flash',
};

function normalisePosition(p, mentioned) {
  if (p === 'first' || p === 'top3' || p === 'mentioned') return p;
  return mentioned ? 'mentioned' : 'not_mentioned';
}

function loadPanel() {
  const i = process.argv.indexOf('--panel');
  const path = i > -1 ? process.argv[i + 1] : null;
  if (!path) { console.error('Pass --panel <file.json>'); process.exit(1); }
  const firms = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!Array.isArray(firms) || !firms.length) { console.error('Panel must be a non-empty JSON array'); process.exit(1); }
  return firms;
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) { console.error('MONGO_URI required'); process.exit(1); }
  const platforms = BROWSING_PLATFORMS.filter(p => PLATFORM_MODEL[p]);
  const firms = loadPanel();
  console.log(`Panel: ${firms.length} firms x ${CATEGORY_PROMPTS.length} prompts x ${platforms.length} platforms = ${firms.length*CATEGORY_PROMPTS.length*platforms.length} scans`);
  console.log(`Browsing platforms: ${platforms.join(', ')}`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');
  let written = 0, errors = 0;
  for (const firm of firms) {
    for (const categoryLabel of CATEGORY_PROMPTS) {
      const promptText = buildPrompt({ companyName: firm.name, categoryLabel, city: CITY });
      for (const platformKey of platforms) {
        try {
          const r = await querySinglePlatform(platformKey, {
            companyName: firm.name, categoryLabel, city: CITY, websiteUrl: firm.website || null,
          });
          await AIMentionScan.create({
            vendorId: firm.vendorId,
            prompt: promptText,
            mentioned: r.mentioned ?? null,
            position: normalisePosition(r.position, r.mentioned),
            status: r.status === 'checked' ? 'ok' : (r.status || 'ok'),
            aiModel: PLATFORM_MODEL[platformKey],
            platform: platformKey,
            competitorsMentioned: Array.isArray(r.competitors) ? r.competitors.slice(0, 20) : [],
            category: categoryLabel,
            location: CITY,
            responseSnippet: (r.snippet || r.rawResponse || '').slice(0, 500),
            source: 'research_panel',
          });
          written++;
        } catch (e) { errors++; console.error(`  ${firm.name} | ${categoryLabel} | ${platformKey}: ${e.message}`); }
      }
    }
    console.log(`done: ${firm.name}`);
  }
  console.log(`\n=== Run complete ===\nrows written: ${written}\nerrors: ${errors}`);
  await mongoose.disconnect();
  process.exit(0);
}
main();
