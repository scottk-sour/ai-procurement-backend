/**
 * Weekly Vendor Email Service
 *
 * Generates and sends weekly AI visibility reports to vendors.
 * Uses tables + inline CSS for Gmail/Outlook/Apple Mail compatibility.
 */

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';
import AIMentionScan from '../models/AIMentionScan.js';
import { calculateVisibilityScore } from '../utils/visibilityScore.js';
import { sendEmail } from './emailService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.tendorai.com';
const BACKEND_URL = process.env.BACKEND_URL || 'https://ai-procurement-backend-q35u.onrender.com';
const JWT_SECRET = process.env.JWT_SECRET || process.env.VENDOR_JWT_SECRET || 'tendorai-secret';

/**
 * Generate unsubscribe token (no expiry)
 */
function generateUnsubscribeToken(vendorId) {
  return jwt.sign({ vendorId: vendorId.toString(), purpose: 'unsubscribe' }, JWT_SECRET);
}

/**
 * Get week-over-week mention data for a vendor
 */
async function getWeeklyMentionData(vendorId) {
  const now = new Date();

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  const [mentionsThisWeek, mentionsLastWeek, totalMentions30d, competitorAgg] = await Promise.all([
    AIMentionScan.countDocuments({
      vendorId, mentioned: true,
      scanDate: { $gte: thisWeekStart },
    }).catch(() => 0),

    AIMentionScan.countDocuments({
      vendorId, mentioned: true,
      scanDate: { $gte: lastWeekStart, $lt: thisWeekStart },
    }).catch(() => 0),

    AIMentionScan.countDocuments({
      vendorId, mentioned: true,
      scanDate: { $gte: thirtyDaysAgo },
    }).catch(() => 0),

    // Competitor mentions this week
    AIMentionScan.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          scanDate: { $gte: thisWeekStart },
        },
      },
      { $unwind: '$competitorsMentioned' },
      {
        $group: {
          _id: '$competitorsMentioned',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 3 },
    ]).catch(() => []),
  ]);

  const totalCompetitorMentions = competitorAgg.reduce((s, c) => s + c.count, 0);
  const topCompetitor = competitorAgg[0] || null;

  return {
    mentionsThisWeek,
    mentionsLastWeek,
    totalMentions30d,
    totalCompetitorMentions,
    topCompetitor,
    competitorCount: competitorAgg.length,
  };
}

/**
 * Generate weekly email HTML for a vendor
 */
export async function generateWeeklyEmail(vendorId) {
  const vendor = await Vendor.findById(vendorId)
    .select('company email name tier services location')
    .lean();

  if (!vendor || !vendor.email) return null;

  const products = await VendorProduct.find({
    $or: [{ vendorId }, { vendorId: vendorId.toString() }],
    isActive: { $ne: false },
  }).lean();

  const mentions = await getWeeklyMentionData(vendorId);

  // Calculate visibility score
  const mentionData = {
    mentionsThisWeek: mentions.mentionsThisWeek,
    mentionsLastWeek: mentions.mentionsLastWeek,
    totalMentions30d: mentions.totalMentions30d,
    avgPosition: null,
  };
  const scoreData = calculateVisibilityScore(vendor, products, mentionData, null);

  const vendorName = vendor.company || vendor.name || 'there';
  const tier = (vendor.tier || 'free').toLowerCase();
  const isPaid = ['basic', 'visible', 'managed', 'enterprise', 'verified'].includes(tier);
  const category = vendor.services?.[0] || 'your category';
  const location = vendor.location?.city || 'your area';

  // Week date
  const weekOf = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Unsubscribe link
  const unsubscribeToken = generateUnsubscribeToken(vendorId);
  const unsubscribeUrl = `${BACKEND_URL}/api/public/unsubscribe?token=${unsubscribeToken}`;
  const dashboardUrl = `${FRONTEND_URL}/vendor-dashboard`;
  const upgradeUrl = `${FRONTEND_URL}/vendor-dashboard/upgrade`;

  // Subject line — competitor count hooks
  let subject;
  if (mentions.totalCompetitorMentions > 0 && mentions.mentionsThisWeek === 0) {
    subject = `${vendorName}: Your competitors were mentioned ${mentions.totalCompetitorMentions} times this week`;
  } else if (mentions.mentionsThisWeek > 0) {
    subject = `AI search update: Here's where you stand, ${vendorName}`;
  } else {
    subject = `Your AI Visibility Report — Week of ${weekOf}`;
  }

  // Score change indicator
  const scoreDiff = mentions.mentionsThisWeek - mentions.mentionsLastWeek;
  let trendIcon = '&#8212;'; // em dash = same
  let trendColour = '#6b7280';
  if (scoreDiff > 0) { trendIcon = '&#9650;'; trendColour = '#22c55e'; }
  else if (scoreDiff < 0) { trendIcon = '&#9660;'; trendColour = '#ef4444'; }

  // Score colour
  const scoreColour = scoreData.colour || '#7c3aed';

  // Top tip
  const topTip = scoreData.tips?.[0];

  // Build HTML (tables + inline CSS for email clients)
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly AI Visibility Report</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);padding:30px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">TendorAI</h1>
              <p style="margin:8px 0 0;color:#e9d5ff;font-size:14px;">Your Weekly AI Visibility Report</p>
              <p style="margin:4px 0 0;color:#c4b5fd;font-size:12px;">Week of ${weekOf}</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:30px 40px 10px;">
              <p style="margin:0;font-size:16px;color:#374151;">Hi ${vendorName},</p>
              <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Here's how AI tools see your business this week.</p>
            </td>
          </tr>

          <!-- Section 1: Scores -->
          <tr>
            <td style="padding:10px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:20px;text-align:center;width:50%;border-right:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">AI Visibility Score</p>
                    <p style="margin:8px 0 4px;font-size:36px;font-weight:700;color:${scoreColour};">${scoreData.score}</p>
                    <p style="margin:0;font-size:12px;color:#9ca3af;">out of 100</p>
                  </td>
                  <td style="padding:20px;text-align:center;width:50%;">
                    <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">AI Mentions</p>
                    <p style="margin:8px 0 4px;font-size:36px;font-weight:700;color:#374151;">${mentions.mentionsThisWeek}</p>
                    <p style="margin:0;font-size:12px;color:${trendColour};">${trendIcon} ${Math.abs(scoreDiff)} vs last week</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Section 2: AI Mentions Detail -->
          <tr>
            <td style="padding:15px 40px;">
              ${mentions.mentionsThisWeek === 0 && !isPaid ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;border:1px solid #fecaca;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:14px;color:#991b1b;font-weight:600;">You weren't mentioned by any AI tools this week.</p>
                    <p style="margin:8px 0 0;font-size:13px;color:#b91c1c;">Paid vendors are 3x more likely to be recommended by AI assistants.</p>
                    <p style="margin:12px 0 0;">
                      <a href="${upgradeUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Upgrade to Visible &mdash; &pound;99/mo</a>
                    </p>
                  </td>
                </tr>
              </table>
              ` : mentions.mentionsThisWeek === 0 ? `
              <p style="margin:0;font-size:14px;color:#6b7280;">You weren't mentioned in AI searches this week. Your profile improvements will take effect in next week's scan.</p>
              ` : `
              <p style="margin:0;font-size:14px;color:#374151;">You were mentioned in <strong>${mentions.mentionsThisWeek}</strong> AI search${mentions.mentionsThisWeek !== 1 ? 'es' : ''} for ${category} in ${location} this week.</p>
              `}
            </td>
          </tr>

          <!-- Section 3: Competitor Snapshot -->
          <tr>
            <td style="padding:10px 40px;">
              ${isPaid && mentions.topCompetitor ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Competitor Snapshot</p>
                    <p style="margin:8px 0 0;font-size:14px;color:#374151;">Top competitor: <strong>${mentions.topCompetitor._id}</strong> &mdash; mentioned ${mentions.topCompetitor.count} time${mentions.topCompetitor.count !== 1 ? 's' : ''}</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${mentions.competitorCount} competitor${mentions.competitorCount !== 1 ? 's' : ''} detected across ${mentions.totalCompetitorMentions} mention${mentions.totalCompetitorMentions !== 1 ? 's' : ''}</p>
                  </td>
                </tr>
              </table>
              ` : !isPaid && mentions.totalCompetitorMentions > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:14px;color:#92400e;font-weight:600;">${mentions.competitorCount} competitor${mentions.competitorCount !== 1 ? 's were' : ' was'} analysed this week.</p>
                    <p style="margin:8px 0 0;font-size:13px;color:#a16207;">Upgrade to see who's outranking you in AI search.</p>
                    <p style="margin:12px 0 0;">
                      <a href="${upgradeUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">See Your Competitors</a>
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>

          <!-- Section 4: Top Improvement -->
          <tr>
            <td style="padding:10px 40px;">
              ${topTip ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Quick Win</p>
                    <p style="margin:8px 0 0;font-size:14px;color:#1e40af;">${topTip.message}</p>
                    ${topTip.action ? `<p style="margin:4px 0 0;font-size:12px;color:#3b82f6;">${topTip.action}</p>` : ''}
                  </td>
                </tr>
              </table>
              ` : `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Quick Win</p>
                    <p style="margin:8px 0 0;font-size:14px;color:#1e40af;">Run your free GEO Audit to find out what's holding your score back.</p>
                    <p style="margin:12px 0 0;">
                      <a href="${dashboardUrl}/geo-audit" style="display:inline-block;background:#3b82f6;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Run GEO Audit</a>
                    </p>
                  </td>
                </tr>
              </table>
              `}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:20px 40px;text-align:center;">
              <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">View Your Dashboard &rarr;</a>
              ${!isPaid ? `
              <p style="margin:12px 0 0;">
                <a href="${upgradeUrl}" style="font-size:13px;color:#7c3aed;text-decoration:underline;">Upgrade to Visible &mdash; &pound;99/mo</a>
              </p>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you're listed on TendorAI.</p>
              <p style="margin:8px 0 0;font-size:12px;">
                <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">TendorAI &bull; tendorai.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to: vendor.email, subject, html };
}
