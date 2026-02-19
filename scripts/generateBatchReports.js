#!/usr/bin/env node

/**
 * Batch AEO Report Generator
 *
 * Usage:
 *   node scripts/generateBatchReports.js [--limit N] [--category copiers] [--city Cardiff] [--vendorType solicitor]
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
const filterVendorType = getArg('vendorType'); // 'solicitor' or 'equipment'

// ─── Category maps ───────────────────────────────────────────────────────────

// Office equipment: service → AEO category
const EQUIPMENT_CATEGORY_MAP = {
  Photocopiers: 'copiers',
  Telecoms: 'telecoms',
  CCTV: 'cctv',
  IT: 'it',
};

// Solicitors: practice area → AEO category
const SOLICITOR_CATEGORY_MAP = {
  Conveyancing: 'conveyancing',
  'Family Law': 'family-law',
  'Criminal Law': 'criminal-law',
  'Commercial Law': 'commercial-law',
  'Employment Law': 'employment-law',
  'Wills & Probate': 'wills-and-probate',
  Immigration: 'immigration',
  'Personal Injury': 'personal-injury',
};

// Accountants: practice area → AEO category
const ACCOUNTANT_CATEGORY_MAP = {
  'Tax Advisory': 'tax-advisory',
  'Audit & Assurance': 'audit-assurance',
  Bookkeeping: 'bookkeeping',
  Payroll: 'payroll',
  'Corporate Finance': 'corporate-finance',
  'Business Advisory': 'business-advisory',
  VAT: 'vat-services',
  'Financial Planning': 'financial-planning',
};

// Mortgage Advisors: practice area → AEO category
const MORTGAGE_CATEGORY_MAP = {
  'Residential Mortgages': 'residential-mortgages',
  'Buy-to-Let': 'buy-to-let',
  Remortgage: 'remortgage',
  'First-Time Buyer': 'first-time-buyer',
  'Equity Release': 'equity-release',
  'Commercial Mortgages': 'commercial-mortgages',
  'Protection Insurance': 'protection-insurance',
};

// Estate Agents: practice area → AEO category
const ESTATE_AGENT_CATEGORY_MAP = {
  Sales: 'sales',
  Lettings: 'lettings',
  'Property Management': 'property-management',
  'Block Management': 'block-management',
  Auctions: 'auctions',
  'Commercial Property': 'commercial-property',
  Inventory: 'inventory',
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

  // Filter by vendorType
  if (filterVendorType === 'solicitor') {
    query.vendorType = 'solicitor';
  } else if (filterVendorType === 'accountant') {
    query.vendorType = 'accountant';
  } else if (filterVendorType === 'mortgage-advisor') {
    query.vendorType = 'mortgage-advisor';
  } else if (filterVendorType === 'estate-agent') {
    query.vendorType = 'estate-agent';
  } else if (filterVendorType === 'equipment') {
    query.vendorType = { $nin: ['solicitor', 'accountant', 'mortgage-advisor', 'estate-agent'] };
  }

  // Filter by category (maps to service or practiceArea depending on type)
  if (filterCategory) {
    if (filterVendorType === 'solicitor') {
      const paValue = Object.entries(SOLICITOR_CATEGORY_MAP).find(
        ([pa, slug]) => slug === filterCategory.toLowerCase() || pa.toLowerCase() === filterCategory.toLowerCase()
      );
      if (paValue) {
        query.practiceAreas = paValue[0];
      }
    } else if (filterVendorType === 'accountant') {
      const paValue = Object.entries(ACCOUNTANT_CATEGORY_MAP).find(
        ([pa, slug]) => slug === filterCategory.toLowerCase() || pa.toLowerCase() === filterCategory.toLowerCase()
      );
      if (paValue) {
        query.practiceAreas = paValue[0];
      }
    } else if (filterVendorType === 'mortgage-advisor') {
      const paValue = Object.entries(MORTGAGE_CATEGORY_MAP).find(
        ([pa, slug]) => slug === filterCategory.toLowerCase() || pa.toLowerCase() === filterCategory.toLowerCase()
      );
      if (paValue) {
        query.practiceAreas = paValue[0];
      }
    } else if (filterVendorType === 'estate-agent') {
      const paValue = Object.entries(ESTATE_AGENT_CATEGORY_MAP).find(
        ([pa, slug]) => slug === filterCategory.toLowerCase() || pa.toLowerCase() === filterCategory.toLowerCase()
      );
      if (paValue) {
        query.practiceAreas = paValue[0];
      }
    } else {
      const serviceKey = Object.keys(EQUIPMENT_CATEGORY_MAP).find(
        (k) => k.toLowerCase() === filterCategory.toLowerCase() || EQUIPMENT_CATEGORY_MAP[k] === filterCategory.toLowerCase()
      );
      if (serviceKey) {
        query.services = { $regex: new RegExp(serviceKey, 'i') };
      }
    }
  }

  if (filterCity) {
    query.$or = [
      { 'location.city': { $regex: new RegExp(filterCity, 'i') } },
      { 'location.coverage': { $regex: new RegExp(filterCity, 'i') } },
    ];
  }

  const isProfType = ['solicitor', 'accountant', 'mortgage-advisor', 'estate-agent'].includes(filterVendorType);
  const selectFields = isProfType
    ? 'company email practiceAreas location vendorType'
    : 'company email services location vendorType practiceAreas';

  const vendors = await Vendor.find(query)
    .select(selectFields)
    .lean();

  // Filter out vendors that already have reports
  const candidates = vendors.filter(
    (v) => v.company && !existingNames.has(v.company.toLowerCase().trim())
  );

  console.log(`Found ${candidates.length} vendors without full reports (from ${vendors.length} total)`);

  const toProcess = candidates.slice(0, limit);
  console.log(`Processing ${toProcess.length} vendors...\n`);

  // CSV header
  const csvLines = ['companyName,email,score,city,reportUrl,pdfUrl,competitorCount,vendorType,category'];
  const results = [];

  for (let i = 0; i < toProcess.length; i++) {
    const vendor = toProcess[i];
    const companyName = vendor.company;
    const city = vendor.location?.city || filterCity || 'UK';
    const email = vendor.email?.startsWith('unclaimed-') ? '' : vendor.email || '';

    // Determine category based on vendorType
    let category;
    if (vendor.vendorType === 'solicitor') {
      const pa = (vendor.practiceAreas || [])[0] || '';
      category = SOLICITOR_CATEGORY_MAP[pa] || filterCategory || 'conveyancing';
    } else if (vendor.vendorType === 'accountant') {
      const pa = (vendor.practiceAreas || [])[0] || '';
      category = ACCOUNTANT_CATEGORY_MAP[pa] || filterCategory || 'tax-advisory';
    } else if (vendor.vendorType === 'mortgage-advisor') {
      const pa = (vendor.practiceAreas || [])[0] || '';
      category = MORTGAGE_CATEGORY_MAP[pa] || filterCategory || 'residential-mortgages';
    } else if (vendor.vendorType === 'estate-agent') {
      const pa = (vendor.practiceAreas || [])[0] || '';
      category = ESTATE_AGENT_CATEGORY_MAP[pa] || filterCategory || 'sales';
    } else {
      const service = (vendor.services || [])[0] || '';
      category = EQUIPMENT_CATEGORY_MAP[service] || filterCategory || 'it';
    }

    console.log(`[${i + 1}/${toProcess.length}] "${companyName}" — ${category} — ${city} (${vendor.vendorType || 'equipment'})`);

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
          escCsv(vendor.vendorType || 'equipment'),
          escCsv(category),
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
