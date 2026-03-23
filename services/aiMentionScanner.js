import Vendor from '../models/Vendor.js';
import AIMentionScan from '../models/AIMentionScan.js';
import { queryAllPlatforms } from './platformQuery/index.js';
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
  let totalRecords = 0;
  let totalMentions = 0;
  let platformErrors = 0;
  let alertsSent = 0;
  const vendorsScanned = new Set();
  const vendorsNotified = new Set();

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
