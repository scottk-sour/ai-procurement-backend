#!/usr/bin/env node

/**
 * Dry-run: manually trigger Writer Agent V1.1 for Cardiff Property Partners.
 * Verifies CTA routing + fabrication guard from PR #65.
 * Delete after testing.
 *
 * Usage: node scripts/dryRunWriterAgent.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import ApprovalQueue from '../models/ApprovalQueue.js';
import { runWriterAgentForVendor } from '../services/writerAgent.js';

(async () => {
  try {
    console.log('=== Dry Run: Writer Agent V1.1 ===');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected.\n');

    const vendor = await Vendor.findOne({ company: 'Cardiff Property Partners' }).lean();
    if (!vendor) {
      console.log('ERROR: Cardiff Property Partners not found. Listing Pro vendors:');
      const all = await Vendor.find({ tier: { $in: ['pro', 'managed', 'verified', 'enterprise'] } })
        .select('company tier slug').limit(10).lean();
      all.forEach(v => console.log(`  ${v.company} (${v.tier}) slug: ${v.slug}`));
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`Vendor: ${vendor._id} ${vendor.company}`);
    console.log(`  Tier: ${vendor.tier}`);
    console.log(`  Type: ${vendor.vendorType}`);
    console.log(`  Slug: ${vendor.slug}`);
    console.log(`  City: ${vendor.location?.city}`);
    console.log(`  Expected CTA URL: https://www.tendorai.com/suppliers/vendor/${vendor.slug}`);

    console.log('\nRunning Writer Agent (dryRun: true)...\n');
    const result = await runWriterAgentForVendor(vendor._id, { dryRun: true });

    console.log('=== RESULT ===');
    console.log(JSON.stringify(result, null, 2));

    if (result.skipped) {
      console.log(`\n⚠️  SKIPPED: ${result.reason}`);
      console.log('The Writer Agent did not generate a draft for this vendor.');
      if (result.reason === 'already_ran_this_week') {
        console.log('Tip: Wait until next week or delete the AgentRun for this week to re-run.');
      }
      await mongoose.disconnect();
      process.exit(0);
    }

    if (!result.success) {
      console.log(`\n❌ FAILED: ${result.error}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Fetch the saved approval to inspect body and flags
    const approval = await ApprovalQueue.findById(result.approvalId).lean();
    if (!approval) {
      console.log('\n❌ ERROR: Approval not found after creation');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('\n=== APPROVAL DOCUMENT ===');
    console.log(`Title: ${approval.draftPayload?.title || '<no title>'}`);
    console.log(`Status: ${approval.status}`);
    console.log(`Item type: ${approval.itemType}`);
    console.log(`Cost: $${result.costEstimateUSD?.toFixed(4)}`);

    const body = approval.draftPayload?.body || '';

    console.log('\n=== CTA CHECK ===');
    const expectedCtaUrl = `https://www.tendorai.com/suppliers/vendor/${vendor.slug}`;
    const ctaContainsProfile = body.includes(expectedCtaUrl) || body.includes('/suppliers/vendor/');
    const ctaContainsAeoReport = body.includes('/aeo-report');

    console.log(`Body contains vendor profile URL: ${ctaContainsProfile ? '✅ YES' : '❌ NO'}`);
    console.log(`Body contains /aeo-report (should be NO for Pro): ${ctaContainsAeoReport ? '❌ YES — CTA not routing correctly' : '✅ NO — correct'}`);

    console.log('\n=== FABRICATION FLAGS ===');
    const flags = approval.metadata?.qualityFlags || [];
    if (flags.length === 0) {
      console.log('✅ No fabrication flags raised');
    } else {
      console.log(`⚠️  ${flags.length} flag(s) raised:`);
      flags.forEach(flag => {
        console.log(`   Type: ${flag.type}, Severity: ${flag.severity}`);
        if (flag.detected) {
          flag.detected.forEach(d => {
            console.log(`     Body: ${d.body}`);
            console.log(`     Excerpt: "${d.excerpt}"`);
          });
        }
      });
    }

    console.log('\n=== BODY EXCERPTS ===');
    console.log('--- First 500 chars ---');
    console.log(body.slice(0, 500));
    console.log('\n--- Last 500 chars (CTA area) ---');
    console.log(body.slice(-500));

    console.log('\n=== LINKEDIN TEXT (first 200 chars) ===');
    console.log((approval.draftPayload?.linkedInText || '').slice(0, 200));

    await mongoose.disconnect();
    console.log('\n✅ Dry run complete');
    process.exit(0);
  } catch (err) {
    console.error('Dry run failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
