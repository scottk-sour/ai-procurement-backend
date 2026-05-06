import crypto from 'crypto';
import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import VendorLead from '../models/VendorLead.js';
import Review from '../models/Review.js';
import ReviewOptOut from '../models/ReviewOptOut.js';
import { generateReviewToken } from './reviewTokenService.js';
import { sendReviewRequestEmail } from './emailService.js';

const PRO_TIERS = new Set(['pro', 'managed', 'verified', 'enterprise']);
const DEFAULT_MAX_PER_WEEK = 5;
const MAX_CAP = 20;
const COOLDOWN_DAYS = 30;
const LEAD_AGE_DAYS = 90;

function generateUnsubscribeUrl(email, vendorId) {
  const payload = `${email.toLowerCase()}:${vendorId}`;
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback').update(payload).digest('hex').slice(0, 16);
  const base = process.env.FRONTEND_URL || 'https://www.tendorai.com';
  return `${base}/api/public/review-unsubscribe?email=${encodeURIComponent(email)}&vendor=${vendorId}&sig=${sig}`;
}

export function verifyUnsubscribeSig(email, vendorId, sig) {
  const payload = `${email.toLowerCase()}:${vendorId}`;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback').update(payload).digest('hex').slice(0, 16);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function runReviewsForVendor(vendorId, opts = {}) {
  const startedAt = new Date();
  const weekStart = AgentRun.normaliseWeekStarting(new Date());
  const { dryRun = false } = opts;

  const vendor = await Vendor.findById(vendorId).select('company tier vendorType practiceAreas emailUnsubscribed').lean();
  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  if (!PRO_TIERS.has(vendor.tier)) {
    return AgentRun.create({
      vendorId, agentName: 'reviews', weekStarting: weekStart,
      status: 'failed', startedAt, completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: 'Vendor not on Pro tier', failureReason: 'not_pro_tier',
    });
  }

  const maxPerWeek = Math.min(opts.maxPerWeek || DEFAULT_MAX_PER_WEEK, MAX_CAP);
  const ninetyDaysAgo = new Date(Date.now() - LEAD_AGE_DAYS * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await VendorLead.find({
    vendor: vendorId,
    reviewRequested: false,
    'customer.email': { $exists: true, $ne: '' },
    createdAt: { $gte: ninetyDaysAgo },
  }).sort({ createdAt: -1 }).limit(maxPerWeek * 3).lean();

  const sendList = [];
  const skipped = { cooldown: 0, optedOut: 0, alreadyReviewed: 0 };

  for (const lead of candidates) {
    if (sendList.length >= maxPerWeek) break;
    const email = lead.customer.email.toLowerCase();

    const optedOut = await ReviewOptOut.isOptedOut(email, vendorId);
    if (optedOut) { skipped.optedOut++; continue; }

    const recentReview = await Review.findOne({
      vendor: vendorId, 'reviewer.email': email, createdAt: { $gte: thirtyDaysAgo },
    }).lean();
    if (recentReview) { skipped.alreadyReviewed++; continue; }

    const recentRequest = await VendorLead.findOne({
      vendor: vendorId, 'customer.email': email,
      reviewRequestedAt: { $gte: thirtyDaysAgo },
    }).lean();
    if (recentRequest) { skipped.cooldown++; continue; }

    sendList.push(lead);
  }

  let sentCount = 0;
  let sendErrors = 0;

  for (const lead of sendList) {
    if (dryRun) { sentCount++; continue; }

    try {
      const reviewToken = generateReviewToken();
      const unsubscribeUrl = generateUnsubscribeUrl(lead.customer.email, vendorId);

      await VendorLead.updateOne({ _id: lead._id }, {
        reviewRequested: true,
        reviewRequestedAt: new Date(),
        reviewToken,
        reviewTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await sendReviewRequestEmail(lead.customer.email, {
        customerName: lead.customer.contactName || 'there',
        vendorName: vendor.company,
        category: lead.service || vendor.practiceAreas?.[0] || 'your service',
        reviewToken,
        unsubscribeUrl,
      });

      sentCount++;
    } catch (err) {
      console.error(`[Reviews] Send failed for ${lead.customer.email}:`, err.message);
      sendErrors++;
    }
  }

  const parts = [];
  if (sentCount) parts.push(`${sentCount} review request${sentCount === 1 ? '' : 's'} sent`);
  if (skipped.cooldown) parts.push(`${skipped.cooldown} skipped (cooldown)`);
  if (skipped.optedOut) parts.push(`${skipped.optedOut} skipped (opted out)`);
  if (skipped.alreadyReviewed) parts.push(`${skipped.alreadyReviewed} skipped (already reviewed)`);
  if (sendErrors) parts.push(`${sendErrors} send error${sendErrors === 1 ? '' : 's'}`);
  if (!parts.length) parts.push('No eligible leads found');
  const summary = parts.join('. ') + '.';

  const run = await AgentRun.create({
    vendorId, agentName: 'reviews', weekStarting: weekStart,
    status: sentCount > 0 ? 'completed' : 'partial',
    startedAt, completedAt: new Date(),
    durationMs: Date.now() - startedAt.getTime(),
    summary,
    artifacts: {
      sent: sentCount, skipped, sendErrors,
      totalCandidates: candidates.length,
      gapsIdentified: 0, gaps: [], competitorsAbove: [],
      ...(dryRun ? { dryRun: true } : {}),
    },
  });

  return run;
}

export async function runWeeklyReviewsBatch() {
  const startTime = Date.now();
  const stats = { scanned: 0, sent: 0, skipped: 0, failed: 0 };

  const vendors = await Vendor.find({
    tier: { $in: [...PRO_TIERS] },
    emailUnsubscribed: { $ne: true },
  }).select('_id company tier').lean();

  console.log(`[Reviews] Starting weekly batch for ${vendors.length} vendors`);

  for (const vendor of vendors) {
    try {
      const run = await runReviewsForVendor(vendor._id);
      stats.scanned++;
      if (run.artifacts?.sent > 0) stats.sent += run.artifacts.sent;
      else stats.skipped++;
      console.log(`[Reviews] ${vendor.company}: ${run.status} — ${run.summary}`);
    } catch (err) {
      console.error(`[Reviews] ${vendor.company} failed:`, err.message);
      stats.failed++;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Reviews] Complete in ${durationMs}ms:`, stats);

  try {
    const { sendEmail } = await import('./emailService.js');
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'scott.davies@tendorai.com',
      subject: `Reviews Agent weekly: ${stats.sent} sent, ${stats.skipped} skipped, ${stats.failed} failed`,
      text: `Reviews Agent weekly batch completed in ${durationMs}ms\nVendors: ${vendors.length}\nSent: ${stats.sent}\nSkipped: ${stats.skipped}\nFailed: ${stats.failed}`,
      html: `<pre>Reviews Agent weekly batch completed in ${durationMs}ms\nVendors: ${vendors.length}\nSent: ${stats.sent}\nSkipped: ${stats.skipped}\nFailed: ${stats.failed}</pre>`,
    });
  } catch (err) {
    console.error(`[Reviews] Admin email failed:`, err.message);
  }

  return stats;
}
