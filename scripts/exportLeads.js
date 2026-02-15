#!/usr/bin/env node

/**
 * Export all collected leads/emails from MongoDB
 *
 * Usage: node scripts/exportLeads.js
 *        node scripts/exportLeads.js --csv > leads.csv
 *
 * Queries:
 *   1. Newsletter subscribers
 *   2. AEO Report submissions (email optional)
 *   3. Vendor Leads / quote requests (email required)
 *   4. Quote Requests (authenticated users)
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI or MONGODB_URI environment variable is required');
  process.exit(1);
}

// Import models
import Subscriber from '../models/Subscriber.js';
import AeoReport from '../models/AeoReport.js';
import VendorLead from '../models/VendorLead.js';
import QuoteRequest from '../models/QuoteRequest.js';

const csvMode = process.argv.includes('--csv');

async function main() {
  try {
    await mongoose.connect(MONGO_URI);

    // 1. Newsletter subscribers
    const subscribers = await Subscriber.find(
      { unsubscribed: { $ne: true } },
      { email: 1, source: 1, subscribedAt: 1 }
    ).sort({ subscribedAt: -1 }).lean();

    // 2. AEO Report emails
    const aeoReports = await AeoReport.find(
      { email: { $exists: true, $ne: '', $ne: null } },
      { email: 1, companyName: 1, category: 1, city: 1, createdAt: 1 }
    ).sort({ createdAt: -1 }).lean();

    // 2. Vendor Leads (quote requests from public)
    const vendorLeads = await VendorLead.find(
      { 'customer.email': { $exists: true, $ne: '' } },
      { 'customer.email': 1, 'customer.companyName': 1, 'customer.contactName': 1, 'customer.phone': 1, service: 1, createdAt: 1 }
    ).sort({ createdAt: -1 }).lean();

    // 3. Quote Requests (authenticated)
    const quoteRequests = await QuoteRequest.find(
      { email: { $exists: true, $ne: '' } },
      { email: 1, companyName: 1, contactName: 1, createdAt: 1 }
    ).sort({ createdAt: -1 }).lean();

    // Deduplicate all emails
    const allEmails = new Map();

    for (const s of subscribers) {
      const email = s.email.toLowerCase().trim();
      if (!allEmails.has(email)) {
        allEmails.set(email, { email, source: 'Newsletter', company: '', name: '', phone: '', date: s.subscribedAt });
      }
    }

    for (const r of aeoReports) {
      const email = r.email.toLowerCase().trim();
      if (!allEmails.has(email)) {
        allEmails.set(email, { email, source: 'AEO Report', company: r.companyName || '', name: '', phone: '', date: r.createdAt });
      }
    }

    for (const l of vendorLeads) {
      const email = l.customer.email.toLowerCase().trim();
      if (!allEmails.has(email)) {
        allEmails.set(email, { email, source: 'Quote Request', company: l.customer.companyName || '', name: l.customer.contactName || '', phone: l.customer.phone || '', date: l.createdAt });
      }
    }

    for (const q of quoteRequests) {
      const email = q.email.toLowerCase().trim();
      if (!allEmails.has(email)) {
        allEmails.set(email, { email, source: 'Quote (Auth)', company: q.companyName || '', name: q.contactName || '', date: q.createdAt });
      }
    }

    if (csvMode) {
      console.log('email,name,company,phone,source,date');
      for (const lead of allEmails.values()) {
        console.log(`${lead.email},${lead.name || ''},${lead.company || ''},${lead.phone || ''},${lead.source},${lead.date?.toISOString() || ''}`);
      }
    } else {
      console.log('=== LEAD EXPORT ===\n');
      console.log(`Newsletter subs:      ${subscribers.length}`);
      console.log(`AEO Report emails:    ${aeoReports.length}`);
      console.log(`Vendor Lead emails:   ${vendorLeads.length}`);
      console.log(`Quote Request emails: ${quoteRequests.length}`);
      console.log(`Unique emails (total): ${allEmails.size}\n`);

      console.log('--- Newsletter Subscribers ---');
      for (const s of subscribers) {
        console.log(`  ${s.email} | ${s.subscribedAt?.toISOString()}`);
      }

      console.log('\n--- AEO Report Leads ---');
      for (const r of aeoReports) {
        console.log(`  ${r.email} | ${r.companyName} | ${r.category} | ${r.city} | ${r.createdAt?.toISOString()}`);
      }

      console.log('\n--- Vendor Lead / Quote Request Leads ---');
      for (const l of vendorLeads) {
        console.log(`  ${l.customer.email} | ${l.customer.companyName} | ${l.customer.contactName} | ${l.service} | ${l.createdAt?.toISOString()}`);
      }

      console.log('\n--- Quote Requests (Authenticated) ---');
      for (const q of quoteRequests) {
        console.log(`  ${q.email} | ${q.companyName} | ${q.contactName} | ${q.createdAt?.toISOString()}`);
      }

      console.log('\n--- All Unique Emails ---');
      for (const lead of allEmails.values()) {
        console.log(`  ${lead.email} (${lead.source})`);
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
