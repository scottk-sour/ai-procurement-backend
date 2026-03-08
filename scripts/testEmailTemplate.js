#!/usr/bin/env node

/**
 * Test: Send the AEO report email template to scott.davies@tendorai.com
 * Uses an existing report from MongoDB to populate all dynamic fields.
 * Also saves the HTML to /tmp/test-email.html for preview.
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import AeoReport from '../models/AeoReport.js';
import { sendAeoReportEmail } from '../services/emailService.js';
import { aeoReportTemplate } from '../services/emailTemplates.js';
import { getIndustryConfig } from '../services/industryConfig.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TEST_EMAIL = 'scott.davies@tendorai.com';
const BASE_URL = 'https://www.tendorai.com';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('DB connected');

  // Try to find a report with platformResults first
  let report = await AeoReport.findOne({
    reportType: 'full',
    score: { $gt: 10 },
    'competitors.0': { $exists: true },
    'gaps.0': { $exists: true },
    'platformResults.0': { $exists: true },
  })
    .sort({ createdAt: -1 })
    .select('-pdfBuffer -ipAddress')
    .lean();

  // Fallback: any report with score > 10
  if (!report) {
    console.log('No report with platformResults, trying without...');
    report = await AeoReport.findOne({
      reportType: 'full',
      score: { $gt: 10 },
      'competitors.0': { $exists: true },
    })
      .sort({ createdAt: -1 })
      .select('-pdfBuffer -ipAddress')
      .lean();
  }

  if (!report) {
    console.error('No suitable AEO report found in database');
    await mongoose.disconnect();
    process.exit(1);
  }

  const reportUrl = `${BASE_URL}/aeo-report/results/${report._id}`;
  const config = getIndustryConfig(report.category);
  const categoryLabel = config.industryLabel || report.category;

  console.log(`\nUsing report: ${report._id}`);
  console.log(`  Company:      ${report.companyName}`);
  console.log(`  Category:     ${report.category} (${categoryLabel})`);
  console.log(`  City:         ${report.city}`);
  console.log(`  Score:        ${report.score}/100`);
  console.log(`  Name:         ${report.name || '(none)'}`);
  console.log(`  Competitors:  ${report.competitors?.length || 0} — ${(report.competitors || []).slice(0, 3).map(c => c.name).join(', ')}`);
  console.log(`  Gaps:         ${report.gaps?.length || 0} — ${(report.gaps || []).slice(0, 3).map(g => g.title).join(', ')}`);
  console.log(`  Platforms:    ${report.platformResults?.length || 0}`);
  if (report.platformResults?.length) {
    const mentioned = report.platformResults.filter(r => r.mentioned && !r.error);
    console.log(`  Mentioned by: ${mentioned.length} — ${mentioned.map(r => r.platformLabel).join(', ') || 'none'}`);
  }

  // Generate HTML and save to file for preview
  const html = aeoReportTemplate({
    name: report.name,
    companyName: report.companyName,
    category: report.category,
    categoryLabel,
    city: report.city,
    score: report.score,
    reportUrl,
    platformResults: report.platformResults || [],
    tier: report.tier || 'free',
    competitors: report.competitors || [],
    gaps: report.gaps || [],
  });

  const previewPath = './test-email-preview.html';
  fs.writeFileSync(previewPath, html);
  console.log(`\nHTML preview saved to: ${previewPath}`);

  // Try to send via Resend
  console.log(`\nSending test email to ${TEST_EMAIL}...`);
  try {
    await sendAeoReportEmail(TEST_EMAIL, {
      ...report,
      reportUrl,
      tier: report.tier || 'free',
    });
    console.log('Email sent successfully!');
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
