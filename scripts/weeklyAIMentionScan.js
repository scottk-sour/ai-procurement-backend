#!/usr/bin/env node

/**
 * Weekly AI Mention Scanner
 *
 * Usage: node scripts/weeklyAIMentionScan.js
 * Cron:  Every Monday at 6am UTC
 *
 * Scans all paid vendors by querying 6 AI platforms (ChatGPT, Perplexity,
 * Claude, Gemini, Grok, Meta AI) with organic buyer-like questions per
 * vendor's type and location. Records per-platform mention data.
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { runWeeklyMentionScan } from '../services/aiMentionScanner.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI or MONGODB_URI environment variable is required');
  process.exit(1);
}

// Check for at least one platform API key
const platformKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'GROK_API_KEY', 'GROQ_API_KEY'];
const configuredKeys = platformKeys.filter(k => process.env[k]);
if (configuredKeys.length === 0) {
  console.error('At least one AI platform API key is required. Set one of:', platformKeys.join(', '));
  process.exit(1);
}
console.log(`Configured platform API keys: ${configuredKeys.join(', ')}`);

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const result = await runWeeklyMentionScan();

    console.log('\n=== Final Report ===');
    console.log(JSON.stringify(result, null, 2));

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Scan failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
