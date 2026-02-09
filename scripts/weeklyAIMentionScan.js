#!/usr/bin/env node

/**
 * Weekly AI Mention Scanner
 *
 * Usage: node scripts/weeklyAIMentionScan.js
 * Cron:  Every Monday at 6am UTC
 *
 * Scans all active vendors by querying Claude Haiku with buyer-like
 * questions for each category+location combination. Records whether
 * each vendor was mentioned, their position, and which competitors appeared.
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

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

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
