#!/usr/bin/env node

/**
 * Data-driven daily cold outreach sender.
 *
 * Reads AeoReport collection for candidates, skips already-sent via
 * cold_outreach_log, sends top 20 lowest-scoring firms.
 *
 * DEFAULT: DRY_RUN=true (all emails → kinder1975.sd@gmail.com)
 * LIVE:    DRY_RUN=false node scripts/send-cold-daily.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import AeoReport from '../models/AeoReport.js';
import Vendor from '../models/Vendor.js';
import { sendEmail } from '../services/emailService.js';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const DRY_RUN_RECIPIENT = 'kinder1975.sd@gmail.com';
const FROM = 'Scott Davies <scott.davies@tendorai.com>';
const REPLY_TO = 'scott.davies@tendorai.com';
const PAUSE_MS = 2000;
const LIMIT = 20;

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const outreachLogSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  email: { type: String, required: true },
  firmName: { type: String },
  score: { type: Number },
  sentAt: { type: Date, default: Date.now },
  resendId: { type: String },
  dryRun: { type: Boolean, default: false },
}, { timestamps: true });
outreachLogSchema.index({ vendorId: 1 }, { unique: true });

const ColdOutreachLog = mongoose.models.ColdOutreachLog || mongoose.model('ColdOutreachLog', outreachLogSchema, 'cold_outreach_log');

function buildBody(f) {
  const greeting = f.firstName ? `Hi ${f.firstName}` : `Hi ${f.firmName} team`;
  return `${greeting},

Quick note about how AI assistants are recommending ${f.practiceArea} solicitors in ${f.city}.

I run TendorAI, a UK platform that audits how ChatGPT, Claude, Perplexity, Gemini and Copilot recommend SRA-regulated firms. Last week we tested ${f.firmName} and the wider ${f.city} solicitor market.

${f.firmName} scored ${f.score} out of 100. Full report (no signup needed):
https://www.tendorai.com/aeo-report/results/${f.reportId}

For context, the median score across the UK solicitor firms we tested was around 40/100. The firms ChatGPT does name in ${f.city} when asked for a ${f.practiceArea} solicitor sit at 60+. The gap is fixable — it's a structured-signals problem, not a service problem.

${f.firmName} already has a basic profile on TendorAI from the SRA register. It's unclaimed, which means AI can only see your firm name and SRA number — not your specialisms, fee earners, or accreditations.

Claiming is free and takes 2 minutes:
https://www.tendorai.com/vendor-signup

Happy to answer any questions, or send across the methodology if useful.

Best regards,
Scott Davies
Founder, TendorAI Ltd (Companies House 16521860)
The UK's AI Visibility Platform for regulated services firms
https://www.tendorai.com`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Cold Daily Outreach ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (all emails → ' + DRY_RUN_RECIPIENT + ')' : '⚠️  LIVE — sending to real recipients'}`);
  console.log('');

  await mongoose.connect(MONGODB_URI);

  const alreadySent = await ColdOutreachLog.find({}).select('vendorId').lean();
  const sentVendorIds = new Set(alreadySent.map(s => s.vendorId.toString()));
  console.log(`Already sent: ${sentVendorIds.size} vendors in cold_outreach_log`);

  const reports = await AeoReport.find({
    score: { $ne: null },
    email: { $exists: true, $ne: '', $not: /tendorai\.com$/ },
    vendorId: { $ne: null },
  })
    .sort({ score: 1 })
    .select('_id vendorId companyName score email category city')
    .limit(LIMIT + sentVendorIds.size)
    .lean();

  const candidates = reports.filter(r => !sentVendorIds.has(r.vendorId.toString()));
  const batch = candidates.slice(0, LIMIT);

  console.log(`Reports found: ${reports.length} | After dedup: ${candidates.length} | Batch: ${batch.length}`);
  if (batch.length < LIMIT) {
    console.warn(`⚠️  Only ${batch.length} candidates available (wanted ${LIMIT})`);
  }
  if (batch.length === 0) {
    console.log('No candidates to send. Exiting.');
    await mongoose.disconnect();
    return;
  }

  const vendorIds = batch.map(r => r.vendorId);
  const vendors = await Vendor.find({ _id: { $in: vendorIds } })
    .select('_id company name location.city practiceAreas vendorType email')
    .lean();
  const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

  let sent = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < batch.length; i++) {
    const report = batch[i];
    const vendor = vendorMap.get(report.vendorId.toString());

    const firmName = vendor?.company || report.companyName || 'Unknown';
    const city = vendor?.location?.city || report.city || 'your area';
    const practiceArea = vendor?.practiceAreas?.[0]?.toLowerCase() || report.category || 'legal services';
    const score = report.score;
    const reportId = report._id.toString();
    const realEmail = vendor?.email || report.email;
    const _fw = vendor?.name ? vendor.name.trim().split(/\s+/)[0] : ''; const firstName = vendor?.name && !vendor.name.match(/^(admin|reception|info|office)/i) && !firmName.toLowerCase().includes(_fw.toLowerCase()) ? _fw : null;

    const recipient = DRY_RUN ? DRY_RUN_RECIPIENT : realEmail;
    const subject = DRY_RUN
      ? `[DRY → would send to ${realEmail}] ${firmName} — AI visibility score: ${score}/100`
      : `${firmName} — AI visibility score: ${score}/100`;

    const body = buildBody({ firmName, city, practiceArea, score, reportId, firstName });

    try {
      const result = await sendEmail({
        to: recipient,
        subject,
        text: body,
        html: `<pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap; line-height: 1.6; font-size: 14px; max-width: 600px;">${body.replace(/https:\/\/www\.tendorai\.com\/[^\s]+/g, m => `<a href="${m}">${m}</a>`)}</pre>`,
        from: FROM,
        reply_to: [REPLY_TO],
      });

      const resendId = result.id || 'ok';

      await ColdOutreachLog.create({
        vendorId: report.vendorId,
        email: realEmail,
        firmName,
        score,
        sentAt: new Date(),
        resendId,
        dryRun: DRY_RUN,
      }).catch(err => console.error(`  Log write failed: ${err.message}`));

      sent++;
      console.log(`✓ [${i + 1}/${batch.length}] ${firmName} (${score}/100) — sent to ${recipient} (id: ${resendId})`);
    } catch (err) {
      failed++;
      failures.push({ firm: firmName, error: err.message });
      console.error(`✗ [${i + 1}/${batch.length}] ${firmName} — FAILED: ${err.message}`);
    }

    if (i < batch.length - 1) await sleep(PAUSE_MS);
  }

  console.log('');
  console.log(`=== DONE: ${sent} sent, ${failed} failed ===`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach(f => console.log(`  - ${f.firm}: ${f.error}`));
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });


