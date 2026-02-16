#!/usr/bin/env node

/**
 * Test script: Generate AEO reports for 4 test companies
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { generateFullReport } from '../services/aeoReportGenerator.js';
import { generateReportPdf } from '../services/aeoReportPdf.js';
import AeoReport from '../models/AeoReport.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI or MONGODB_URI environment variable is required');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.tendorai.com';
const API_URL = process.env.API_URL || 'https://ai-procurement-backend.onrender.com';

const testCompanies = [
  { companyName: 'Solutions in Technology', category: 'copiers', city: 'Cwmbran' },
  { companyName: 'Clarity Copiers', category: 'copiers', city: 'Bristol' },
  { companyName: 'Ogi', category: 'telecoms', city: 'Cardiff' },
  { companyName: 'Made Up Company Ltd', category: 'it', city: 'London' },
];

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  for (let i = 0; i < testCompanies.length; i++) {
    const tc = testCompanies[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${i + 1}/4] "${tc.companyName}" — ${tc.category} — ${tc.city}`);
    console.log('='.repeat(60));

    try {
      console.log('Generating report via Claude (this takes 30-60s)...');
      const startTime = Date.now();

      const reportData = await generateFullReport(tc);
      const aiTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`AI research complete in ${aiTime}s`);

      console.log('Generating PDF...');
      const pdfBuffer = await generateReportPdf(reportData);
      console.log(`PDF generated: ${(pdfBuffer.length / 1024).toFixed(1)}KB`);

      console.log('Saving to MongoDB...');
      const report = await AeoReport.create({ ...reportData, pdfBuffer });

      const reportUrl = `${FRONTEND_URL}/aeo-report/results/${report._id}`;
      const pdfUrl = `${API_URL}/api/public/aeo-report/${report._id}/pdf`;

      console.log('\n--- RESULTS ---');
      console.log(`Report ID:    ${report._id}`);
      console.log(`Score:        ${report.score}/100 (${report.score <= 30 ? 'RED' : report.score <= 60 ? 'AMBER' : 'BLUE'})`);
      console.log(`AI Mentioned: ${report.aiMentioned} ${report.aiPosition ? `(position ${report.aiPosition})` : ''}`);
      console.log(`Competitors:  ${report.competitors.length}`);
      report.competitors.forEach((c, j) => {
        console.log(`  ${j + 1}. ${c.name} — ${c.website || 'no URL'}`);
      });
      console.log(`Gaps:         ${report.gaps.length}`);
      report.gaps.forEach((g, j) => {
        console.log(`  ${j + 1}. ${g.title}`);
      });
      console.log(`Web URL:      ${reportUrl}`);
      console.log(`PDF URL:      ${pdfUrl}`);
      console.log(`Breakdown:    website=${reportData.scoreBreakdown.websiteOptimisation} content=${reportData.scoreBreakdown.contentAuthority} directory=${reportData.scoreBreakdown.directoryPresence} reviews=${reportData.scoreBreakdown.reviewSignals} schema=${reportData.scoreBreakdown.structuredData} competitive=${reportData.scoreBreakdown.competitivePosition}`);

    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      console.error(err.stack);
    }

    // 10s delay between reports; retry logic in generator handles rate limits
    if (i < testCompanies.length - 1) {
      console.log('\nWaiting 10s before next report...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  console.log('\n\nAll tests complete.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
