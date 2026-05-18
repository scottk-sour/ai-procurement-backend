#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import { buildAIVisibilityIntelligenceReport } from '../services/reporter/buildReport.js';

(async () => {
  try {
    console.log('=== Dry Run: AI Visibility Intelligence Report ===');
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected.');

    const vendor = await Vendor.findOne({ company: 'Cardiff Property Partners' }).lean();
    if (!vendor) {
      console.log('ERROR: Cardiff Property Partners not found. Listing all Pro vendors:');
      const all = await Vendor.find({ tier: { $in: ['pro', 'managed', 'verified', 'enterprise'] } })
        .select('company vendorType location.city tier')
        .limit(20)
        .lean();
      console.log(JSON.stringify(all, null, 2));
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`Vendor found: ${vendor._id} ${vendor.company} (${vendor.location?.city}, ${vendor.vendorType})`);
    console.log('Building report for week starting Monday 18 May 2026...');

    const weekStart = new Date('2026-05-18T00:00:00Z');
    const report = await buildAIVisibilityIntelligenceReport(vendor._id, weekStart);

    console.log('=== REPORT JSON START ===');
    console.log(JSON.stringify(report.toObject(), null, 2));
    console.log('=== REPORT JSON END ===');

    console.log('\n=== SUMMARY ===');
    console.log(`Report number: ${report.reportNumber}`);
    console.log(`Score: ${report.scoreHeader?.currentScore}/100 (${report.scoreHeader?.weeklyChange >= 0 ? '+' : ''}${report.scoreHeader?.weeklyChange})`);
    console.log(`Rank: ${report.scoreHeader?.rankInCity}/${report.scoreHeader?.totalFirmsInCity}`);
    console.log(`Competitors ahead: ${report.scoreHeader?.competitorsAhead}`);
    console.log(`Revenue exposure: £${report.revenueExposure?.monthlyMin}–£${report.revenueExposure?.monthlyMax}/month`);
    console.log(`Sections populated: ${[
      report.scoreHeader && 'scoreHeader',
      report.boardSummary && 'boardSummary',
      report.shareOfVoice?.length && 'shareOfVoice',
      report.competitors?.length && 'competitors',
      report.revenueExposure && 'revenueExposure',
      report.promptAnalysis?.length && 'promptAnalysis',
      report.authorityGraph && 'authorityGraph',
      report.perceptionAnalysis && 'perceptionAnalysis',
      report.projections && 'projections',
      report.opportunityFeed?.length && 'opportunityFeed',
      report.recommendedActions?.length && 'recommendedActions',
      report.whatsNext?.length && 'whatsNext',
    ].filter(Boolean).join(', ')}`);
    console.log(`Synthetic flags: ${report.syntheticDataFlags?.length || 0}`);

    await mongoose.disconnect();
    console.log('\nDry run complete.');
    process.exit(0);
  } catch (err) {
    console.error('Dry run failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
