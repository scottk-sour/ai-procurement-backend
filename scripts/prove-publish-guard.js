#!/usr/bin/env node

/**
 * Prove the publish guard blocks drafts containing [FIRM_DATA: ...] placeholders.
 *
 * Read-only: loads the latest writer draft for Cardiff Property Partners,
 * counts placeholders, runs validateContentDraft (the same function the
 * publish path calls), prints the result. Creates nothing, changes nothing.
 *
 * Usage: node scripts/prove-publish-guard.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const VENDOR_ID = '699757a97712b4369510e6c8';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const { default: ApprovalQueue } = await import('../models/ApprovalQueue.js');
  const { validateContentDraft } = await import('../services/contentPlanner/validators.js');

  const approval = await ApprovalQueue.findOne({
    agentName: 'writer',
    vendorId: new mongoose.Types.ObjectId(VENDOR_ID),
    itemType: 'content_draft',
  }).sort({ createdAt: -1 }).lean();

  if (!approval) {
    console.log('No writer draft found for this vendor.');
    await mongoose.disconnect();
    return;
  }

  console.log('=== DRAFT ===');
  console.log('Title:', approval.title);
  console.log('Status:', approval.status);
  console.log('Created:', approval.createdAt);

  const body = approval.draftPayload?.body || '';
  const linkedIn = approval.draftPayload?.linkedInText || '';
  const facebook = approval.draftPayload?.facebookText || '';

  const keyedInBody = body.match(/\[FIRM_DATA:[^\]]+\]/gi) || [];
  const legacyInBody = body.match(/\[FIRM TO PROVIDE[: ][^\]]*\]/gi) || [];
  const keyedInLinkedIn = linkedIn.match(/\[FIRM_DATA:[^\]]+\]/gi) || [];
  const keyedInFacebook = facebook.match(/\[FIRM_DATA:[^\]]+\]/gi) || [];

  console.log('\n=== RAW PLACEHOLDER SCAN ===');
  console.log('Keyed [FIRM_DATA] in body:', keyedInBody.length);
  keyedInBody.forEach((p, i) => console.log('  ' + (i + 1) + '.', p));
  console.log('Keyed [FIRM_DATA] in LinkedIn:', keyedInLinkedIn.length);
  console.log('Keyed [FIRM_DATA] in Facebook:', keyedInFacebook.length);
  console.log('Legacy [FIRM TO PROVIDE] in body:', legacyInBody.length);

  const totalRaw = keyedInBody.length + legacyInBody.length + keyedInLinkedIn.length + keyedInFacebook.length;
  console.log('Total raw placeholders:', totalRaw);

  console.log('\n=== validateContentDraft RESULT ===');
  const result = validateContentDraft(approval.draftPayload);
  console.log('passed:', result.passed);
  console.log('errors:', JSON.stringify(result.errors, null, 2));
  console.log('warnings:', JSON.stringify(result.warnings, null, 2));

  if (!result.passed) {
    console.log('\nPUBLISH GUARD BLOCKED — draft would NOT create a VendorPost');
  } else if (totalRaw > 0) {
    console.log('\nPUBLISH GUARD FAILED — draft has placeholders but validator passed');
  } else {
    console.log('\nPUBLISH GUARD PASSED — draft has no placeholders (clean draft)');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
