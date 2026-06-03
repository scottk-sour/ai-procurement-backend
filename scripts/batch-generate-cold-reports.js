#!/usr/bin/env node

/**
 * Batch Cold Outreach Report Generator
 *
 * Generates real AEO reports for free-tier vendors for cold outreach prep.
 * All emails go to CONFIG.emailOverride — NEVER to the vendor.
 *
 * Usage: node scripts/batch-generate-cold-reports.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import AeoReport from '../models/AeoReport.js';
import { generateFullReport } from '../services/aeoReportGenerator.js';
import { generateReportPdf } from '../services/aeoReportPdf.js';
import { sendEmail } from '../services/emailService.js';

// ================================================================
// CONFIG — edit these before each run
// ================================================================
const CONFIG = {
  vendorType: 'estate-agent',
  cityRegex: /cardiff/i,        // change the word for another city, or set to /.*/ for nationwide
  limit: 30,
  emailOverride: 'kinder1975.sd@gmail.com',
  pauseMs: 5000,
};
// ================================================================

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.tendorai.com';

const PRACTICE_AREA_TO_SLUG = {
  'Conveyancing': 'conveyancing', 'Family Law': 'family-law',
  'Criminal Law': 'criminal-law', 'Commercial Law': 'commercial-law',
  'Employment Law': 'employment-law', 'Wills & Probate': 'wills-and-probate',
  'Immigration': 'immigration', 'Personal Injury': 'personal-injury',
  'Tax Advisory': 'tax-advisory', 'Audit & Assurance': 'audit-assurance',
  'Bookkeeping': 'bookkeeping', 'Payroll': 'payroll',
};

function deriveCategory(vendor) {
  const area = (vendor.practiceAreas || [])[0];
  if (area && PRACTICE_AREA_TO_SLUG[area]) return PRACTICE_AREA_TO_SLUG[area];
  if (vendor.vendorType === 'solicitor') return 'conveyancing';
  if (vendor.vendorType === 'accountant') return 'tax-advisory';
  if (vendor.vendorType === 'mortgage-advisor') return 'residential-mortgages';
  if (vendor.vendorType === 'estate-agent') return 'sales';
  return vendor.vendorType || 'other';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Batch Cold Outreach Report Generator ===');
  console.log(`Config: vendorType=${CONFIG.vendorType}, city=${CONFIG.cityRegex}, limit=${CONFIG.limit}`);
  console.log(`Email override: ${CONFIG.emailOverride}`);
  console.log(`SAFETY: All emails go to ${CONFIG.emailOverride}, NOT to vendors.\n`);

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const vendors = await Vendor.find({
    vendorType: CONFIG.vendorType,
    tier: 'free',
    'contactInfo.website': { $exists: true, $ne: '' },
    'location.city': CONFIG.cityRegex,
  })
    .select('_id company email vendorType practiceAreas services location contactInfo name')
    .limit(CONFIG.limit)
    .lean();

  console.log(`Found ${vendors.length} vendors matching criteria.\n`);

  if (vendors.length === 0) {
    console.log('No vendors found. Exiting.');
    await mongoose.disconnect();
    return;
  }

  if (process.env.COUNT_ONLY === 'true') {
    console.log(`COUNT_ONLY: ${vendors.length} estate-agent vendors match (with website). Sample:`);
    vendors.slice(0, 10).forEach(v => console.log(`  - ${v.company} (${v.location?.city})`));
    await mongoose.disconnect();
    return;
  }

  const eligible = vendors;

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const results = [];

  const periodLabel = `week of ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  for (let i = 0; i < eligible.length; i++) {
    const vendor = eligible[i];
    const category = deriveCategory(vendor);
    const city = vendor.location?.city;

    if (!city) {
      console.log(`[${i + 1}/${eligible.length}] SKIP ${vendor.company} — no city`);
      skipped++;
      continue;
    }

    const websiteUrl = vendor.contactInfo?.website || undefined;
    if (!websiteUrl) {
      console.log(`[${i + 1}/${eligible.length}] SKIP ${vendor.company} — no website URL`);
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${eligible.length}] ${vendor.company} (${city}, ${category})...`);

    try {
      const reportData = await generateFullReport({
        companyName: vendor.company,
        category,
        city,
        email: CONFIG.emailOverride,
        websiteUrl,
      });

      const pdfBuffer = await generateReportPdf(reportData);

      const report = await AeoReport.create({
        ...reportData,
        email: CONFIG.emailOverride,
        vendorId: vendor._id,
        pdfBuffer,
      });

      const reportUrl = `${FRONTEND_URL}/aeo-report/results/${report._id}`;

      // Send email to ME, not the vendor
      try {
        await sendEmail({
          to: CONFIG.emailOverride,
          subject: `AI Visibility Report: ${vendor.company} (${city}) — Score: ${reportData.score || 'N/A'}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>${vendor.company}</h2>
              <p><strong>City:</strong> ${city}</p>
              <p><strong>Category:</strong> ${category}</p>
              <p><strong>Score:</strong> ${reportData.score || 'N/A'}/100</p>
              <p><strong>Vendor email:</strong> ${vendor.email}</p>
              <p><a href="${reportUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px;">View Report</a></p>
            </div>
          `,
          text: `Report for ${vendor.company} (${city}). Score: ${reportData.score || 'N/A'}/100. View: ${reportUrl}`,
        });
      } catch (emailErr) {
        console.error(`  Email send failed: ${emailErr.message}`);
      }

      const score = reportData.score || 0;
      results.push({ company: vendor.company, city, score, reportUrl, vendorEmail: vendor.email, reportId: report._id.toString() });
      completed++;
      console.log(`  ✓ Score: ${score}/100 | ${reportUrl}`);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      failed++;
    }

    if (i < eligible.length - 1) {
      await sleep(CONFIG.pauseMs);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total: ${eligible.length} | Completed: ${completed} | Failed: ${failed} | Skipped: ${skipped}`);

  if (results.length > 0) {
    console.log('\n=== RESULTS (lowest score first) ===');
    results.sort((a, b) => a.score - b.score);
    for (const r of results) {
      console.log(`  ${String(r.score).padStart(3)}/100 | ${r.company.padEnd(40)} | ${r.vendorEmail} | ${r.reportUrl}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
