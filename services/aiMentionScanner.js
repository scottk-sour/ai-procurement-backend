import Vendor from '../models/Vendor.js';
import AIMentionScan from '../models/AIMentionScan.js';
import VendorScoreHistory from '../models/VendorScoreHistory.js';
import VendorProduct from '../models/VendorProduct.js';
import Review from '../models/Review.js';
import { queryAllPlatforms } from './platformQuery/index.js';
import { calculateVisibilityScore } from '../utils/visibilityScore.js';
import { sendEmail } from './emailService.js';

// Map vendorType to readable label and prompt templates
const VENDOR_TYPE_CONFIG = {
  solicitor: {
    label: 'solicitor',
    templates: (area, city) => [
      `Who are the best ${area} solicitors in ${city}?`,
      `Can you recommend a ${area} solicitor in ${city}?`,
      `Which ${area} law firm should I use in ${city}?`,
      `Best ${area} lawyers near ${city}`,
      `I need a ${area} solicitor in ${city} — who do you recommend?`,
    ],
    fallbackArea: 'solicitor',
  },
  accountant: {
    label: 'accountant',
    templates: (area, city) => [
      `Best ${area} accountants in ${city}`,
      `Can you recommend an ${area} accountant in ${city}?`,
      `Who are the top ${area} accounting firms in ${city}?`,
      `I need an ${area} accountant in ${city} — who do you recommend?`,
      `Which ${area} accountant should I use in ${city}?`,
    ],
    fallbackArea: 'accountant',
  },
  'mortgage-advisor': {
    label: 'mortgage adviser',
    templates: (area, city) => [
      `Best mortgage advisers in ${city}`,
      `Who should I use for a mortgage in ${city}?`,
      `Can you recommend a mortgage broker in ${city}?`,
      `Best ${area} mortgage advisers near ${city}`,
      `I need a mortgage adviser in ${city} — who do you recommend?`,
    ],
    fallbackArea: 'mortgage adviser',
  },
  'estate-agent': {
    label: 'estate agent',
    templates: (area, city) => [
      `Best estate agents in ${city}`,
      `Who are the top estate agents in ${city}?`,
      `Which estate agent should I use in ${city}?`,
      `Can you recommend a good estate agent in ${city}?`,
      `I need an estate agent in ${city} — who do you recommend?`,
    ],
    fallbackArea: 'estate agent',
  },
  'financial-advisor': {
    label: 'financial adviser',
    templates: (area, city) => [
      `Best financial advisers in ${city}`,
      `Can you recommend a financial adviser in ${city}?`,
      `Who are the top financial advisory firms in ${city}?`,
      `I need a financial adviser in ${city} — who do you recommend?`,
      `Which financial adviser should I use in ${city}?`,
    ],
    fallbackArea: 'financial adviser',
  },
  'insurance-broker': {
    label: 'insurance broker',
    templates: (area, city) => [
      `Best insurance brokers in ${city}`,
      `Can you recommend an insurance broker in ${city}?`,
      `Who are the top insurance brokers in ${city}?`,
      `I need an insurance broker in ${city} — who do you recommend?`,
      `Which insurance broker should I use in ${city}?`,
    ],
    fallbackArea: 'insurance broker',
  },
  'office-equipment': {
    label: 'office equipment supplier',
    templates: (area, city) => [
      `Who are the best ${area} companies in ${city}?`,
      `I need a ${area} supplier in ${city}. Who should I use?`,
      `Can you recommend a good ${area} company near ${city}?`,
      `Best ${area} suppliers in ${city}`,
      `Which ${area} company should I use in ${city}?`,
    ],
    fallbackArea: 'office equipment supplier',
  },
};

// Map platform key from platformQuery to our stored platform value
const PLATFORM_KEY_MAP = {
  chatgpt: 'chatgpt',
  perplexity: 'perplexity',
  claude: 'claude',
  gemini: 'gemini',
  grok: 'grok',
  meta: 'metaai',
};

// Human-readable platform names for email subjects
const PLATFORM_DISPLAY_NAME = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  metaai: 'Meta AI',
  meta: 'Meta AI',
};

/**
 * Send an email alert when a Pro vendor is mentioned by any AI platform.
 */
async function sendMentionAlert(vendor, platformKey, query, mentionCount, totalPlatforms) {
  const platformName = PLATFORM_DISPLAY_NAME[platformKey] || platformKey;
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard/analytics';
  // Approximate AI Visibility Score: percentage of platforms that mentioned the vendor
  const visibilityScore = Math.round((mentionCount / totalPlatforms) * 100);

  const subject = `${platformName} recommended ${vendor.company} this week`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">${platformName} Recommended You This Week</h2>
      <p style="color: #374151; line-height: 1.6;">
        Great news — <strong>${platformName}</strong> recommended <strong>${vendor.company}</strong> when asked:
      </p>
      <blockquote style="border-left: 4px solid #7c3aed; margin: 16px 0; padding: 12px 16px; background: #f5f3ff; color: #374151; font-style: italic;">
        "${query}"
      </blockquote>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Platform</td>
          <td style="padding: 8px 0; font-weight: 600;">${platformName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">AI Visibility Score</td>
          <td style="padding: 8px 0; font-weight: 600;">${visibilityScore}/100</td>
        </tr>
      </table>
      <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 8px;">View Full Results</a>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        You're receiving this because your TendorAI Pro plan includes AI mention alerts across all 6 platforms.
      </p>
    </div>
  `;

  const text = `${platformName} recommended ${vendor.company} this week. Query: "${query}". Your AI Visibility Score: ${visibilityScore}/100. View full results: ${dashboardUrl}`;

  try {
    await sendEmail({ to: vendor.email, subject, html, text });
    console.log(`  📧 Mention alert sent to ${vendor.email} (${platformName})`);
  } catch (err) {
    console.error(`  ❌ Failed to send mention alert to ${vendor.email}:`, err.message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate organic prompts for a vendor based on vendorType, practiceAreas, and location.
 */
function generatePrompts(vendor) {
  const vendorType = vendor.vendorType || 'office-equipment';
  const config = VENDOR_TYPE_CONFIG[vendorType] || VENDOR_TYPE_CONFIG['office-equipment'];
  const city = vendor.location?.city || '';

  if (!city) return [];

  // Use first practiceArea if available, otherwise fall back to vendorType label
  const practiceArea = vendor.practiceAreas?.[0] || config.fallbackArea;
  // Normalize: "Conveyancing" -> "conveyancing"
  const area = practiceArea.charAt(0).toLowerCase() + practiceArea.slice(1);

  return config.templates(area, city);
}

/**
 * Convert a platformQuery position (number) to our position enum.
 */
function positionToLabel(position, mentioned) {
  if (!mentioned) return 'not_mentioned';
  if (position === 1) return 'first';
  if (position !== null && position <= 3) return 'top3';
  return 'mentioned';
}

/**
 * Scan a single vendor across all 6 platforms.
 * queryAllPlatforms uses its own organic prompt builder internally,
 * so we call it once per vendor and store the representative prompt as metadata.
 * Returns array of mention documents to insert.
 */
async function scanVendor(vendor, scanDate, source = 'weekly_scan') {
  const prompts = generatePrompts(vendor);
  if (prompts.length === 0) {
    console.log(`  Skipping ${vendor.company} — no city set`);
    return [];
  }

  const vendorType = vendor.vendorType || 'office-equipment';
  const config = VENDOR_TYPE_CONFIG[vendorType] || VENDOR_TYPE_CONFIG['office-equipment'];
  const city = vendor.location?.city || '';
  const categoryLabel = vendor.practiceAreas?.[0] || config.fallbackArea;
  // Use the first organic prompt as representative metadata
  const representativePrompt = prompts[0];

  let platformResults;
  try {
    platformResults = await queryAllPlatforms({
      companyName: vendor.company,
      category: vendor.services?.[0] || vendorType,
      city,
      categoryLabel,
    });
  } catch (err) {
    console.error(`  Platform query failed for ${vendor.company}:`, err.message);
    return [];
  }

  const mentionDocs = [];
  let mentionCount = 0;

  for (const result of platformResults) {
    const platformKey = PLATFORM_KEY_MAP[result.platform] || result.platform;
    const mentioned = result.mentioned === true;
    if (mentioned) mentionCount++;

    mentionDocs.push({
      vendorId: vendor._id,
      scanDate,
      prompt: representativePrompt,
      mentioned,
      position: positionToLabel(result.position, mentioned),
      aiModel: result.platform,
      platform: platformKey,
      competitorsMentioned: result.competitors || [],
      category: vendor.services?.[0] || vendorType,
      location: city,
      responseSnippet: (result.rawResponse || result.snippet || '').substring(0, 500),
      source,
    });
  }

  console.log(`  ${vendor.company}: ${mentionCount} mentions across ${mentionDocs.length} platform queries`);
  return mentionDocs;
}

/**
 * Run a single-vendor scan (used for first scan on profile completion).
 * @param {string} vendorId - The vendor's MongoDB ObjectId
 */
export async function runSingleVendorScan(vendorId) {
  const vendor = await Vendor.findById(vendorId)
    .select('_id company vendorType services practiceAreas location tier account.tier')
    .lean();

  if (!vendor) {
    console.error(`[SingleScan] Vendor ${vendorId} not found`);
    return null;
  }

  console.log(`[SingleScan] First scan triggered for vendor ${vendorId} — ${vendor.company}`);

  const scanDate = new Date();
  const mentionDocs = await scanVendor(vendor, scanDate, 'weekly_scan');

  if (mentionDocs.length > 0) {
    await AIMentionScan.insertMany(mentionDocs, { ordered: false });
  }

  // Mark first scan as complete
  await Vendor.findByIdAndUpdate(vendorId, { $set: { firstScanTriggered: true } });

  const mentions = mentionDocs.filter(d => d.mentioned).length;
  console.log(`[SingleScan] Complete for ${vendor.company}: ${mentionDocs.length} records, ${mentions} mentions`);

  return {
    vendorId,
    company: vendor.company,
    recordsSaved: mentionDocs.length,
    mentions,
  };
}

/**
 * Send a real-time mention notification email when Perplexity recommends a Pro vendor.
 */
async function sendMentionNotificationEmail(vendor, platformLabel, categoryLabel, snippet, score) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://www.tendorai.com';
  const dashboardUrl = `${frontendUrl}/vendor-dashboard`;
  const profileUrl = `${frontendUrl}/vendor-dashboard/settings`;

  await sendEmail({
    to: vendor.email,
    subject: `🎯 ${platformLabel} recommended ${vendor.company} this week`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Hi ${vendor.name || vendor.company},</h2>
        <p>Good news — this week when we asked ${platformLabel} to recommend a ${categoryLabel} in ${vendor.location?.city || 'your area'}, they recommended <strong>${vendor.company}</strong>.</p>
        <p>Here's what ${platformLabel} said:</p>
        <blockquote style="border-left: 3px solid #6366f1; padding: 10px 16px; background: #f8f7ff; margin: 16px 0; color: #333; font-style: italic;">
          "${snippet || 'Your firm was mentioned in the AI response.'}"
        </blockquote>
        <p>This means potential clients asking the same question are likely seeing your firm recommended right now.</p>
        <p style="font-weight: bold; color: #1a1a2e;">Your current AI Visibility Score: ${score}/100</p>
        <p>
          <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 8px;">
            View Your Full Visibility Dashboard
          </a>
        </p>
        <p>
          <a href="${profileUrl}" style="display: inline-block; padding: 10px 20px; background-color: #1B4F72; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Complete Your Profile to Get More Recommendations
          </a>
        </p>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">The TendorAI Team</p>
        <p style="color: #999; font-size: 12px;">P.S. Share this with your team — being recommended by AI is worth shouting about.</p>
      </div>
    `,
    text: `Hi ${vendor.name || vendor.company}, good news — ${platformLabel} recommended ${vendor.company} this week when asked for a ${categoryLabel} in ${vendor.location?.city || 'your area'}. Your AI Visibility Score: ${score}/100. View your dashboard: ${dashboardUrl}`,
  });
}

/**
 * Save the current visibility score to history for trend tracking.
 */
async function saveScoreHistory(vendor, weekStarting) {
  try {
    const products = await VendorProduct.find({
      $or: [{ vendorId: vendor._id }, { vendorId: vendor._id.toString() }],
    }).lean();

    // Mention data for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [mentions30d, mentionsThisWeek, mentionsLastWeek] = await Promise.all([
      AIMentionScan.countDocuments({ vendorId: vendor._id, mentioned: true, scanDate: { $gte: thirtyDaysAgo } }),
      AIMentionScan.countDocuments({ vendorId: vendor._id, mentioned: true, scanDate: { $gte: sevenDaysAgo } }),
      AIMentionScan.countDocuments({ vendorId: vendor._id, mentioned: true, scanDate: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
    ]);

    const reviewData = await Review.aggregate([
      { $match: { vendor: vendor._id } },
      { $group: { _id: null, count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
    ]);

    const result = calculateVisibilityScore(
      vendor,
      products,
      { totalMentions30d: mentions30d, mentionsThisWeek, mentionsLastWeek },
      { reviewCount: reviewData[0]?.count || 0, averageRating: reviewData[0]?.avgRating || 0 },
      {},
      {}
    );

    await VendorScoreHistory.findOneAndUpdate(
      { vendorId: vendor._id, weekStarting },
      {
        vendorId: vendor._id,
        score: result.score,
        breakdown: {
          profile: result.breakdown.profile.earned,
          products: result.breakdown.products.earned,
          reviews: result.breakdown.reviews.earned,
          aiMentions: result.breakdown.mentions.earned,
          engagement: result.breakdown.engagement.earned,
          tier: result.breakdown.plan.earned,
          verified: result.breakdown.verified.earned,
        },
        weekStarting,
      },
      { upsert: true, new: true }
    );

    return result.score;
  } catch (err) {
    console.error(`  Failed to save score history for ${vendor.company}:`, err.message);
    return null;
  }
}

/**
 * Run the weekly AI mention scanner for all paid vendors.
 */
export async function runWeeklyMentionScan() {
  console.log('=== AI Mention Scanner Starting ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Tiers eligible for email mention alerts
  const PRO_ALERT_TIERS = ['pro', 'managed', 'enterprise'];
  const PRO_ALERT_ACCOUNT_TIERS = ['gold', 'platinum', 'pro'];

  // Pull only PAID vendors
  const PAID_TIERS = ['starter', 'basic', 'visible', 'pro', 'managed', 'verified', 'enterprise'];
  const PAID_ACCOUNT_TIERS = ['silver', 'bronze', 'gold', 'platinum', 'starter', 'pro', 'verified'];

  const vendors = await Vendor.find({
    company: { $exists: true, $ne: '' },
    $and: [
      { $or: [
        { tier: { $in: PAID_TIERS } },
        { 'account.tier': { $in: PAID_ACCOUNT_TIERS } },
      ] },
      { $or: [
        { 'location.city': { $exists: true, $ne: '' } },
      ] },
    ],
  }).select('_id company vendorType services practiceAreas location tier account.tier email').lean();

  console.log(`Found ${vendors.length} paid vendors to scan (free vendors excluded)`);

  const scanDate = new Date();
  // Calculate weekStarting as this Monday (or today if Monday)
  const weekStarting = new Date(scanDate);
  const dayOfWeek = weekStarting.getDay();
  const diffToMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  weekStarting.setDate(weekStarting.getDate() + diffToMonday);
  weekStarting.setHours(0, 0, 0, 0);

  let totalRecords = 0;
  let totalMentions = 0;
  let platformErrors = 0;
  let alertsSent = 0;
  const vendorsScanned = new Set();
  const vendorsNotified = new Set(); // Track which vendors got a mention email this cycle

  // Pro tier values for notification email eligibility
  const PRO_TIERS = new Set(['pro', 'managed', 'verified', 'enterprise']);

  for (let i = 0; i < vendors.length; i++) {
    const vendor = vendors[i];
    console.log(`\n[${i + 1}/${vendors.length}] Scanning ${vendor.company}...`);

    try {
      const mentionDocs = await scanVendor(vendor, scanDate);

      if (mentionDocs.length > 0) {
        await AIMentionScan.insertMany(mentionDocs, { ordered: false });
        totalRecords += mentionDocs.length;
        const mentions = mentionDocs.filter(d => d.mentioned);
        totalMentions += mentions.length;
        platformErrors += mentionDocs.filter(d => d.responseSnippet?.startsWith('API error')).length;

        // Send email alerts for Pro vendors mentioned by any platform
        const vendorTier = (vendor.tier || '').toLowerCase();
        const accountTier = (vendor.account?.tier || '').toLowerCase();
        const isProTier = PRO_ALERT_TIERS.includes(vendorTier) || PRO_ALERT_ACCOUNT_TIERS.includes(accountTier);
        const vendorKey = vendor._id.toString();

        if (isProTier && vendor.email && mentions.length > 0 && !vendorsNotified.has(vendorKey)) {
          vendorsNotified.add(vendorKey);
          // Send one alert for the first platform that mentioned them
          const firstMention = mentions[0];
          await sendMentionAlert(
            vendor,
            firstMention.platform,
            firstMention.prompt,
            mentions.length,
            mentionDocs.length
          );
          alertsSent++;
        }

        // Save score history for this vendor (if not already saved via notification path)
        if (!vendorsNotified.has(vendor._id.toString())) {
          await saveScoreHistory(vendor, weekStarting);
        }
      }

      vendorsScanned.add(vendor._id.toString());
    } catch (err) {
      console.error(`  Failed to scan ${vendor.company}:`, err.message);
      platformErrors++;
    }

    // 30-second delay between vendors to avoid rate limits
    if (i < vendors.length - 1) {
      console.log(`  Waiting 30s before next vendor...`);
      await sleep(30000);
    }
  }

  console.log('\n=== Scan Complete ===');
  console.log(`Weekly scan complete: ${vendorsScanned.size} vendors scanned, ${totalMentions} mentions found, ${platformErrors} platform errors, ${alertsSent} email alerts sent`);
  console.log(`Total records saved: ${totalRecords}`);

  return {
    vendorsScanned: vendorsScanned.size,
    totalMentions,
    recordsSaved: totalRecords,
    platformErrors,
    alertsSent,
  };
}
