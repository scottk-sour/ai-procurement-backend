import cron from 'node-cron';
import Vendor from '../models/Vendor.js';
import AeoReport from '../models/AeoReport.js';
import { generateFullReport } from '../services/aeoReportGenerator.js';
import { generateReportPdf } from '../services/aeoReportPdf.js';
import { sendEmail } from '../services/emailService.js';
import logger from '../services/logger.js';

// ============================================================
// Reverse maps: vendor practiceAreas/services → AEO report category slug
// ============================================================

// Solicitor: practiceArea display name → report slug
const PRACTICE_AREA_TO_SLUG = {
  'Conveyancing': 'conveyancing',
  'Family Law': 'family-law',
  'Criminal Law': 'criminal-law',
  'Commercial Law': 'commercial-law',
  'Employment Law': 'employment-law',
  'Wills & Probate': 'wills-and-probate',
  'Immigration': 'immigration',
  'Personal Injury': 'personal-injury',
  // Accountant practice areas
  'Tax Advisory': 'tax-advisory',
  'Audit & Assurance': 'audit-assurance',
  'Bookkeeping': 'bookkeeping',
  'Payroll': 'payroll',
  'Corporate Finance': 'corporate-finance',
  'Business Advisory': 'business-advisory',
  'VAT': 'vat-services',
  'Financial Planning': 'financial-planning',
};

// Office-equipment: vendor service name → report slug
const SERVICE_TO_SLUG = {
  'Photocopiers': 'copiers',
  'Telecoms': 'telecoms',
  'CCTV': 'cctv',
  'IT': 'it',
};

/**
 * Derive the AEO report category slug from a vendor's data.
 * Returns null if no valid mapping is found.
 */
function deriveCategory(vendor) {
  const vendorType = vendor.vendorType || 'office-equipment';

  if (vendorType === 'solicitor' || vendorType === 'accountant') {
    const area = (vendor.practiceAreas || [])[0];
    if (!area) return null;
    return PRACTICE_AREA_TO_SLUG[area] || null;
  }

  // office-equipment, mortgage-advisor, estate-agent
  const service = (vendor.services || [])[0];
  if (!service) return null;
  return SERVICE_TO_SLUG[service] || null;
}

/**
 * Send the report notification email via Resend.
 */
async function sendReportEmail(vendor, reportUrl, periodLabel) {
  await sendEmail({
    to: vendor.email,
    subject: `Your AI Visibility Report for ${periodLabel} is ready`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Hi ${vendor.name || vendor.company},</h2>
        <p>Your latest AI Visibility (AEO) Report is ready.</p>
        <p>
          <a href="${reportUrl}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View Your Report
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          This report shows how visible your business is to AI assistants like ChatGPT, Claude, and Perplexity,
          and what you can do to improve your ranking.
        </p>
        <p style="color: #999; font-size: 12px;">
          You're receiving this because you have an active ${vendor.tier === 'pro' ? 'Pro' : 'Starter'} subscription on TendorAI.
        </p>
      </div>
    `,
    text: `Hi ${vendor.name || vendor.company}, your latest AI Visibility Report for ${periodLabel} is ready. View it here: ${reportUrl}`,
  });
}

/**
 * Sleep helper for rate limiting between vendors.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate AEO reports for all vendors on a given tier.
 */
async function generateVendorReports(tier) {
  const tierLabel = tier === 'pro' ? 'Pro (weekly)' : 'Starter (monthly)';
  logger.info(`[ScheduledReports] Starting ${tierLabel} report generation...`);

  let vendors;
  try {
    vendors = await Vendor.find({ tier }).lean();
  } catch (err) {
    logger.error(`[ScheduledReports] Failed to query vendors for tier=${tier}:`, err);
    return;
  }

  if (!vendors || vendors.length === 0) {
    logger.info(`[ScheduledReports] No vendors found for tier=${tier}. Skipping.`);
    return;
  }

  logger.info(`[ScheduledReports] Found ${vendors.length} ${tier} vendor(s) to process.`);

  const frontendUrl = process.env.FRONTEND_URL || 'https://www.tendorai.com';

  // Period label for email subject
  const now = new Date();
  const periodLabel = tier === 'pro'
    ? `week of ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const vendor of vendors) {
    try {
      const category = deriveCategory(vendor);
      const city = vendor.location?.city;

      if (!category || !city) {
        logger.warn(`[ScheduledReports] Skipping vendor ${vendor.company} (${vendor._id}): missing category or city`);
        skipCount++;
        continue;
      }

      // Generate the full AEO report
      const reportData = await generateFullReport({
        companyName: vendor.company,
        category,
        city,
        email: vendor.email,
      });

      // Generate PDF
      const pdfBuffer = await generateReportPdf(reportData);

      // Save to AeoReport collection
      const report = await AeoReport.create({
        ...reportData,
        vendorId: vendor._id,
        pdfBuffer,
      });

      const reportUrl = `${frontendUrl}/aeo-report/results/${report._id}`;

      // Send email notification via Resend
      if (vendor.email) {
        try {
          await sendReportEmail(vendor, reportUrl, periodLabel);
          logger.info(`[ScheduledReports] Sent report email to ${vendor.email} for ${vendor.company}`);
        } catch (emailErr) {
          logger.error(`[ScheduledReports] Email failed for ${vendor.company}:`, emailErr.message);
        }
      }

      successCount++;
      logger.info(`[ScheduledReports] Report generated for ${vendor.company} (${vendor._id})`);

      // Rate limit: 10s delay between vendors to respect Claude API limits
      await sleep(10000);
    } catch (err) {
      errorCount++;
      logger.error(`[ScheduledReports] Error processing vendor ${vendor.company} (${vendor._id}):`, err.message);
    }
  }

  logger.info(`[ScheduledReports] ${tierLabel} run complete: ${successCount} success, ${skipCount} skipped, ${errorCount} errors`);
}

/**
 * Register cron jobs and start the scheduler.
 */
export function startScheduledReports() {
  // Starter: 1st of every month at 6am UTC
  cron.schedule('0 6 1 * *', () => {
    logger.info('[ScheduledReports] Triggering monthly Starter reports...');
    generateVendorReports('starter');
  });

  // Pro: every Monday at 6am UTC
  cron.schedule('0 6 * * 1', () => {
    logger.info('[ScheduledReports] Triggering weekly Pro reports...');
    generateVendorReports('pro');
  });

  logger.info('[ScheduledReports] Cron jobs registered:');
  logger.info('  - Starter (monthly): 1st of every month at 06:00 UTC');
  logger.info('  - Pro (weekly): every Monday at 06:00 UTC');
}
