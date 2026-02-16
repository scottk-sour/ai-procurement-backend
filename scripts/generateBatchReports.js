#!/usr/bin/env node

/**
 * Batch AEO Report Generator
 *
 * Usage:
 *   node scripts/generateBatchReports.js [--limit N] [--category copiers] [--city Cardiff]
 *
 * Generates full AEO visibility reports for vendors that don't have one yet.
 * Outputs a CSV with report URLs for cold outreach.
 *
 * Required env vars: MONGO_URI / MONGODB_URI, ANTHROPIC_API_KEY
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { generateFullReport } from '../services/aeoReportGenerator.js';
import { generateReportPdf } from '../services/aeoReportPdf.js';
import AeoReport from '../models/AeoReport.js';
import Vendor from '../models/Vendor.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI or MONGODB_URI environment variable is required');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const limit = parseInt(getArg('limit') || '10');
const filterCategory = getArg('category');
const filterCity = getArg('city');

const CATEGORY_MAP = {
  Photocopiers: 'copiers',
  Telecoms: 'telecoms',
  CCTV: 'cctv',
  IT: 'it',
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.tendorai.com';
const API_URL = process.env.API_URL || 'https://ai-procurement-backend.onrender.com';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  // Find vendors that don't have a full report yet
  const existingReports = await AeoReport.find({ reportType: 'full' }).select('companyName').lean();
  const existingNames = new Set(existingReports.map((r) => r.companyName.toLowerCase().trim()));

  const query = {};
  if (filterCategory) {
    const serviceKey = Object.keys(CATEGORY_MAP).find(
      (k) => k.toLowerCase() === filterCategory.toLowerCase() || CATEGORY_MAP[k] === filterCategory.toLowerCase()
    );
    if (serviceKey) {
      query.services = { $regex: new RegExp(serviceKey, 'i') };
    }
  }
  if (filterCity) {
    query.$or = [
      { 'location.city': { $regex: new RegExp(filterCity, 'i') } },
      { 'location.coverage': { $regex: new RegExp(filterCity, 'i') } },
    ];
  }

  const vendors = await Vendor.find(query)
    .select('company email services location')
    .lean();

  // Filter out vendors that already have reports
  const candidates = vendors.filter(
    (v) => v.company && !existingNames.has(v.company.toLowerCase().trim())
  );

  console.log(`Found ${candidates.length} vendors without full reports (from ${vendors.length} total)`);

  const toProcess = candidates.slice(0, limit);
  console.log(`Processing ${toProcess.length} vendors...\n`);

  // CSV header
  const csvLines = ['companyName,email,score,city,reportUrl,pdfUrl,competitorCount'];
  const results = [];

  for (let i = 0; i < toProcess.length; i++) {
    const vendor = toProcess[i];
    const companyName = vendor.company;
    const city = vendor.location?.city || filterCity || 'UK';
    const email = vendor.email?.startsWith('unclaimed-') ? '' : vendor.email || '';

    // Determine category from vendor services
    const service = (vendor.services || [])[0] || '';
    const category = CATEGORY_MAP[service] || filterCategory || 'it';

    console.log(`[${i + 1}/${toProcess.length}] "${companyName}" — ${category} — ${city}`);

    try {
      const reportData = await generateFullReport({ companyName, category, city, email });
      const pdfBuffer = await generateReportPdf(reportData);
      const report = await AeoReport.create({ ...reportData, pdfBuffer });

      const reportUrl = `${FRONTEND_URL}/aeo-report/results/${report._id}`;
      const pdfUrl = `${API_URL}/api/public/aeo-report/${report._id}/pdf`;

      console.log(`  Score: ${report.score}/100 | Competitors: ${report.competitors?.length || 0}`);
      console.log(`  URL: ${reportUrl}`);

      const escCsv = (s) => {
        const str = String(s || '');
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      };

      csvLines.push(
        [
          escCsv(companyName),
          escCsv(email),
          report.score,
          escCsv(city),
          escCsv(reportUrl),
          escCsv(pdfUrl),
          report.competitors?.length || 0,
        ].join(',')
      );

      results.push({ companyName, success: true, score: report.score });
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ companyName, success: false, error: err.message });
    }

    // 5s delay between reports
    if (i < toProcess.length - 1) {
      console.log('  Waiting 5s...\n');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  // Output CSV
  const csv = csvLines.join('\n');
  console.log('\n\n=== CSV OUTPUT ===');
  console.log(csv);
  console.log('=== END CSV ===\n');

  // Summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Done. ${succeeded} succeeded, ${failed} failed out of ${results.length} total.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
