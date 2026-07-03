// Email Templates for TendorAI
// All templates use a consistent design with the TendorAI brand

import { getIndustryConfig } from './industryConfig.js';

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; padding: 30px 40px; text-align: center; }
  .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
  .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
  .content { padding: 40px; color: #374151; line-height: 1.6; }
  .content h2 { color: #1f2937; margin-top: 0; }
  .button { display: inline-block; background: #7c3aed; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  .button:hover { background: #6d28d9; }
  .info-box { background: #f3f4f6; border-radius: 6px; padding: 20px; margin: 20px 0; }
  .info-box h3 { margin-top: 0; color: #4b5563; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
  .footer { background: #f9fafb; padding: 30px 40px; text-align: center; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb; }
  .footer a { color: #7c3aed; text-decoration: none; }
  .rating-stars { color: #f59e0b; font-size: 20px; }
  .highlight { background: #fef3c7; padding: 2px 6px; border-radius: 4px; }
`;

const wrapTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TendorAI</title>
  <style>${baseStyles}</style>
</head>
<body>
  ${content}
</body>
</html>
`;

// =====================================================
// PASSWORD RESET
// =====================================================

export const passwordResetTemplate = ({ vendorName, resetUrl, expiresIn = '1 hour' }) => wrapTemplate(`
  <div class="container">
    <div class="header">
      <h1>TendorAI</h1>
      <p>Password Reset Request</p>
    </div>
    <div class="content">
      <h2>Hi ${vendorName},</h2>
      <p>We received a request to reset your password for your TendorAI vendor account.</p>
      <p>Click the button below to create a new password:</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <div class="info-box">
        <p style="margin: 0;"><strong>This link expires in ${expiresIn}.</strong></p>
        <p style="margin: 10px 0 0;">If you didn't request this reset, you can safely ignore this email. Your password won't be changed.</p>
      </div>
      <p style="color: #6b7280; font-size: 13px;">
        Can't click the button? Copy this link into your browser:<br>
        <a href="${resetUrl}" style="color: #7c3aed; word-break: break-all;">${resetUrl}</a>
      </p>
    </div>
    <div class="footer">
      <p>This email was sent by <a href="https://www.tendorai.com">TendorAI</a></p>
      <p>The UK's B2B procurement comparison platform</p>
    </div>
  </div>
`);

// =====================================================
// VENDOR WELCOME / SIGNUP
// =====================================================

export const vendorWelcomeTemplate = ({ vendorName, loginUrl, dashboardUrl }) => wrapTemplate(`
  <div class="container">
    <div class="header">
      <h1>Welcome to TendorAI!</h1>
      <p>Your vendor account is ready</p>
    </div>
    <div class="content">
      <h2>Hi ${vendorName},</h2>
      <p>Thank you for joining TendorAI! Your vendor account has been created successfully.</p>
      <p>You're now part of the UK's leading B2B procurement platform, connecting suppliers with businesses looking for photocopiers, CCTV, telecoms, and more.</p>

      <div class="info-box">
        <h3>What's Next?</h3>
        <ul style="margin: 0; padding-left: 20px;">
          <li><strong>Complete your profile</strong> - Add your services, coverage areas, and company details</li>
          <li><strong>Upload products</strong> - Add your product catalogue to appear in searches</li>
          <li><strong>Respond to leads</strong> - Quote requests will arrive directly in your dashboard</li>
        </ul>
      </div>

      <p style="text-align: center;">
        <a href="${dashboardUrl}" class="button">Go to Dashboard</a>
      </p>

      <p>Need help getting started? Check out our <a href="https://www.tendorai.com/for-vendors" style="color: #7c3aed;">Vendor Guide</a> or reply to this email.</p>
    </div>
    <div class="footer">
      <p>Welcome to <a href="https://www.tendorai.com">TendorAI</a></p>
      <p>Questions? Contact us at scott.davies@tendorai.com</p>
    </div>
  </div>
`);

// =====================================================
// NEW QUOTE REQUEST
// =====================================================

export const quoteRequestTemplate = ({ vendorName, customerName, customerCompany, service, volume, postcode, features, dashboardUrl, quoteId }) => wrapTemplate(`
  <div class="container">
    <div class="header">
      <h1>New Quote Request</h1>
      <p>A potential customer is looking for ${service}</p>
    </div>
    <div class="content">
      <h2>Hi ${vendorName},</h2>
      <p>Good news! You've received a new quote request through TendorAI.</p>

      <div class="info-box">
        <h3>Customer Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #6b7280;">Company:</td><td style="padding: 8px 0;"><strong>${customerCompany || 'Not specified'}</strong></td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Contact:</td><td style="padding: 8px 0;"><strong>${customerName || 'Not specified'}</strong></td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Location:</td><td style="padding: 8px 0;"><strong>${postcode || 'Not specified'}</strong></td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Service:</td><td style="padding: 8px 0;"><strong>${service}</strong></td></tr>
          ${volume ? `<tr><td style="padding: 8px 0; color: #6b7280;">Volume:</td><td style="padding: 8px 0;"><strong>${volume} pages/month</strong></td></tr>` : ''}
          ${features && features.length > 0 ? `<tr><td style="padding: 8px 0; color: #6b7280;">Requirements:</td><td style="padding: 8px 0;"><strong>${features.join(', ')}</strong></td></tr>` : ''}
        </table>
      </div>

      <p><strong>Tip:</strong> Responding quickly increases your chances of winning this business. The average winning quote is submitted within 2 hours.</p>

      <p style="text-align: center;">
        <a href="${dashboardUrl}/quotes${quoteId ? `/${quoteId}` : ''}" class="button">View & Respond</a>
      </p>
    </div>
    <div class="footer">
      <p>This lead was sent via <a href="https://www.tendorai.com">TendorAI</a></p>
      <p>Manage your notifications in <a href="${dashboardUrl}/settings">account settings</a></p>
    </div>
  </div>
`);

// =====================================================
// NEW REVIEW NOTIFICATION
// =====================================================

export const reviewNotificationTemplate = ({ vendorName, reviewerName, rating, title, content, dashboardUrl }) => {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  return wrapTemplate(`
  <div class="container">
    <div class="header">
      <h1>New Review Received</h1>
      <p>A customer has left you a review</p>
    </div>
    <div class="content">
      <h2>Hi ${vendorName},</h2>
      <p>You've received a new review on TendorAI!</p>

      <div class="info-box">
        <p style="margin-bottom: 10px;"><span class="rating-stars">${stars}</span> <strong>${rating}/5</strong></p>
        <h3 style="margin: 10px 0 5px; text-transform: none; font-size: 16px;">"${title}"</h3>
        <p style="color: #4b5563; margin-bottom: 10px;">${content.length > 200 ? content.substring(0, 200) + '...' : content}</p>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">— ${reviewerName}</p>
      </div>

      <p>This review is pending moderation and will appear on your profile once approved. You'll be able to respond to it from your dashboard.</p>

      <p style="text-align: center;">
        <a href="${dashboardUrl}/reviews" class="button">View All Reviews</a>
      </p>
    </div>
    <div class="footer">
      <p><a href="https://www.tendorai.com">TendorAI</a> - Building trust through transparency</p>
    </div>
  </div>
`);
};

// =====================================================
// REVIEW RESPONSE NOTIFICATION (to reviewer)
// =====================================================

export const reviewResponseTemplate = ({ reviewerName, vendorName, responseContent }) => wrapTemplate(`
  <div class="container">
    <div class="header">
      <h1>TendorAI</h1>
      <p>${vendorName} has responded to your review</p>
    </div>
    <div class="content">
      <h2>Hi ${reviewerName},</h2>
      <p>${vendorName} has responded to the review you left on TendorAI:</p>

      <div class="info-box">
        <h3>Their Response</h3>
        <p style="color: #374151; font-style: italic;">"${responseContent}"</p>
      </div>

      <p>Thank you for taking the time to share your experience. Your feedback helps other businesses make informed decisions.</p>
    </div>
    <div class="footer">
      <p>You received this email because you left a review on <a href="https://www.tendorai.com">TendorAI</a></p>
    </div>
  </div>
`);

// =====================================================
// LEAD NOTIFICATION (for paid vendors)
// =====================================================

export const leadNotificationTemplate = ({ vendorName, customerInfo, service, requirements, dashboardUrl, leadId }) => wrapTemplate(`
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">
      <h1>New Lead!</h1>
      <p>A business is interested in your ${service} services</p>
    </div>
    <div class="content">
      <h2>Hi ${vendorName},</h2>
      <p>A new lead has been generated for your business through TendorAI.</p>

      <div class="info-box">
        <h3>Lead Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #6b7280;">Company:</td><td style="padding: 8px 0;"><strong>${customerInfo.companyName}</strong></td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Contact:</td><td style="padding: 8px 0;"><strong>${customerInfo.contactName}</strong></td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Email:</td><td style="padding: 8px 0;"><strong>${customerInfo.email}</strong></td></tr>
          ${customerInfo.phone ? `<tr><td style="padding: 8px 0; color: #6b7280;">Phone:</td><td style="padding: 8px 0;"><strong>${customerInfo.phone}</strong></td></tr>` : ''}
          <tr><td style="padding: 8px 0; color: #6b7280;">Location:</td><td style="padding: 8px 0;"><strong>${customerInfo.postcode}</strong></td></tr>
        </table>
      </div>

      ${requirements ? `
      <div class="info-box">
        <h3>Requirements</h3>
        <p style="margin: 0;">${requirements}</p>
      </div>
      ` : ''}

      <p><strong>Act fast!</strong> This lead may have been sent to other suppliers in your area.</p>

      <p style="text-align: center;">
        <a href="${dashboardUrl}/leads${leadId ? `/${leadId}` : ''}" class="button" style="background: #059669;">View Lead Details</a>
      </p>
    </div>
    <div class="footer">
      <p>Lead generated via <a href="https://www.tendorai.com">TendorAI</a></p>
    </div>
  </div>
`);

// =====================================================
// REVIEW REQUEST EMAIL (sent to customer after quote)
// =====================================================

export const reviewRequestTemplate = ({ customerName, vendorName, category, reviewUrl, unsubscribeUrl }) => wrapTemplate(`
  <div class="container">
    <div class="header">
      <h1>How was your experience?</h1>
      <p>Share your feedback with ${vendorName}</p>
    </div>
    <div class="content">
      <h2>Hi ${customerName},</h2>
      <p>You recently requested a ${category.toLowerCase()} quote from <strong>${vendorName}</strong> through TendorAI.</p>
      <p>We'd appreciate hearing how it went. Your review helps other businesses find reliable suppliers.</p>

      <p style="text-align: center; margin: 32px 0;">
        <a href="${reviewUrl}" class="button">Leave a Review</a>
      </p>

      <div class="info-box">
        <p style="margin: 0; font-size: 14px;">
          <strong>Your review will display a "Verified Quote" badge</strong> because it's linked to a real quote request you made through TendorAI.
        </p>
      </div>

      <p style="font-size: 13px; color: #6b7280;">
        This email was sent on behalf of <strong>${vendorName}</strong> by TendorAI, who manage their customer feedback. You are receiving this because you contacted ${vendorName} via TendorAI.
      </p>

      <p style="color: #6b7280; font-size: 13px;">
        This link is unique to your quote request and expires in 30 days.<br>
        Can't click the button? Copy this link: <a href="${reviewUrl}" style="color: #7c3aed; word-break: break-all;">${reviewUrl}</a>
      </p>
      <p style="margin-top: 24px;">The TendorAI Team</p>
    </div>
    <div class="footer">
      <p>You received this email because you requested a quote on <a href="https://tendorai.com">TendorAI</a></p>
      <p>The UK's B2B procurement platform</p>
      ${unsubscribeUrl ? `<p style="margin-top: 8px;"><a href="${unsubscribeUrl}" style="color: #9ca3af; font-size: 11px;">Unsubscribe from review requests</a></p>` : ''}
    </div>
  </div>
`);

// =====================================================
// VERIFIED REVIEW NOTIFICATION (to vendor)
// =====================================================

export const verifiedReviewNotificationTemplate = ({ vendorName, reviewerName, reviewerCompany, rating, title, content, dashboardUrl }) => {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  return wrapTemplate(`
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">
      <h1>New Verified Review!</h1>
      <p>A customer you quoted has left feedback</p>
    </div>
    <div class="content">
      <h2>Hi ${vendorName},</h2>
      <p>Great news! A customer you quoted through TendorAI has left a <strong>verified review</strong>:</p>

      <div class="info-box" style="background: #ecfdf5; border: 1px solid #10b981;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">✓ Verified Quote</span>
        </div>
        <p style="margin-bottom: 10px;"><span class="rating-stars">${stars}</span> <strong>${rating}/5</strong></p>
        <h3 style="margin: 10px 0 5px; text-transform: none; font-size: 16px;">"${title}"</h3>
        <p style="color: #4b5563; margin-bottom: 10px;">${content}</p>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">— ${reviewerName}${reviewerCompany ? `, ${reviewerCompany}` : ''}</p>
      </div>

      <p>This review has been automatically published on your profile because it comes from a verified quote request.</p>

      <p style="text-align: center;">
        <a href="${dashboardUrl}/reviews" class="button" style="background: #059669;">View & Respond →</a>
      </p>
    </div>
    <div class="footer">
      <p><a href="https://www.tendorai.com">TendorAI</a> - Building trust through verified reviews</p>
    </div>
  </div>
`);
};

// =====================================================
// AI VISIBILITY REPORT (to lead)
// =====================================================

function formatCompanyName(name) {
  if (!name) return 'your business';
  let formatted = name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  formatted = formatted.replace(/\s+(Limited|Ltd|Llp|Plc|Inc|Corp)\.?$/i, '').trim();
  return formatted;
}

function formatGreetingName(name) {
  if (!name || !name.trim()) return null;
  const firstName = name.trim().split(/\s+/)[0];
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

const TIER_UNLOCKED_PLATFORMS = {
  free: ['perplexity'],
  starter: ['perplexity', 'chatgpt', 'claude'],
  pro: ['perplexity', 'chatgpt', 'claude', 'gemini', 'grok', 'meta'],
};

const CATEGORY_LABEL_PLURAL = {
  conveyancing: 'conveyancing solicitors',
  'family-law': 'family law solicitors',
  'criminal-law': 'criminal law solicitors',
  'commercial-law': 'commercial law solicitors',
  'employment-law': 'employment law solicitors',
  'wills-and-probate': 'wills and probate solicitors',
  immigration: 'immigration solicitors',
  'personal-injury': 'personal injury solicitors',
  'tax-advisory': 'tax advisory accountants',
  'audit-assurance': 'audit and assurance accountants',
  bookkeeping: 'bookkeeping accountants',
  payroll: 'payroll services accountants',
  'corporate-finance': 'corporate finance accountants',
  'business-advisory': 'business advisory accountants',
  'vat-services': 'VAT services accountants',
  'financial-planning': 'financial planning accountants',
  'residential-mortgages': 'residential mortgage advisers',
  'buy-to-let': 'buy-to-let mortgage advisers',
  remortgage: 'remortgage advisers',
  'first-time-buyer': 'first-time buyer mortgage advisers',
  'equity-release': 'equity release advisers',
  'commercial-mortgages': 'commercial mortgage advisers',
  'protection-insurance': 'protection insurance advisers',
  sales: 'estate agents for sales',
  lettings: 'lettings agents',
  'property-management': 'property management agents',
  'block-management': 'block management agents',
  auctions: 'property auctioneers',
  'commercial-property': 'commercial property agents',
  inventory: 'inventory clerks',
  copiers: 'photocopier suppliers',
  telecoms: 'business telecoms suppliers',
  cctv: 'CCTV installers',
  it: 'IT support providers',
  other: 'service providers',
};

export function getCategoryLabelPlural(category) {
  return CATEGORY_LABEL_PLURAL[category] || CATEGORY_LABEL_PLURAL.other;
}

function buildAeoSubject({ displayName, categoryLabelPlural, city }) {
  return `Who AI recommends for ${categoryLabelPlural} in ${city} — and why it isn’t ${displayName}`;
}

export const aeoReportTemplate = ({ name, companyName, category, city, score, reportUrl, platformResults, competitors, gaps, aiMentioned, regulatorNote, unclaimedProfile }) => {
  const displayName = formatCompanyName(companyName);
  const firstName = formatGreetingName(name);
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const scorePercent = Math.min(100, Math.max(0, score || 0));
  const categoryLabelPlural = getCategoryLabelPlural(category);

  const liveWebPlatforms = (platformResults || [])
    .filter(r => r.dataSource === 'live_web' && r.status === 'checked')
    .map(r => r.platformLabel)
    .filter(Boolean);
  const liveWebLine = liveWebPlatforms.length > 0
    ? liveWebPlatforms.join(' and ')
    : 'AI assistants with live web search';

  let mentionResultHtml;
  if (aiMentioned) {
    mentionResultHtml = `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;"><strong>${displayName}</strong> was mentioned &mdash; the full report shows where and how prominently.</p>`;
  } else {
    mentionResultHtml = `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;"><strong>${displayName}</strong> wasn&rsquo;t one of the firms they named.</p>`;
  }

  const competitorItems = (competitors || []).slice(0, 3).map(c => {
    const cName = typeof c === 'string' ? c : (c.name || c.companyName || '');
    return cName || null;
  }).filter(Boolean);

  const competitorBlock = competitorItems.length > 0
    ? `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 8px;">Instead, they recommended firms like:</p>
              <ul style="margin:0 0 16px;padding-left:24px;">${competitorItems.map(n => `<li style="padding:4px 0;color:#374151;font-size:15px;line-height:1.6;">${n}</li>`).join('')}</ul>
              <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 24px;">These firms aren&rsquo;t necessarily better &mdash; their websites and public profiles are structured in a way AI systems can verify.</p>`
    : '';

  const gapItems = (gaps || []).slice(0, 3).map(g => {
    const title = typeof g === 'string' ? g : (g.title || g.gap || '');
    return title || null;
  }).filter(Boolean);

  const gapBlock = gapItems.length > 0
    ? `<p style="color:#1A56A0;font-size:15px;line-height:1.7;margin:0 0 8px;font-weight:600;">Key gaps affecting your visibility:</p>
              <ul style="margin:0 0 24px;padding-left:24px;">${gapItems.map(g => `<li style="padding:4px 0;color:#374151;font-size:15px;line-height:1.6;">${g}</li>`).join('')}</ul>`
    : '';

  const unclaimedBlock = unclaimedProfile
    ? `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px;"><strong>${displayName}</strong> is already listed on TendorAI &mdash; built from the ${unclaimedProfile.regulatoryBody} &mdash; but the profile is unclaimed.</p>`
    : '';

  const footerNote = regulatorNote
    ? `TendorAI is the UK&rsquo;s AI visibility platform for regulated professional services. ${regulatorNote} Combined with live AI assistant analysis.`
    : 'TendorAI is the UK&rsquo;s AI visibility platform. This report is based on live AI assistant analysis and publicly available data.';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Visibility Report &mdash; ${displayName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Who AI recommends for ${categoryLabelPlural} in ${city}.</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:#ffffff;padding:24px 40px 16px;text-align:center;border-bottom:1px solid #e5e7eb;">
              <img src="https://www.tendorai.com/logo.png" alt="TendorAI" width="140" style="display:inline-block;max-width:140px;height:auto;" />
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px;">

              <p style="color:#374151;font-size:16px;line-height:1.7;margin:0 0 16px;">${greeting}</p>

              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">We asked AI assistants with live web search &mdash; ${liveWebLine} &mdash; to name ${categoryLabelPlural} in ${city}.</p>

              ${mentionResultHtml}
              ${competitorBlock}

              <h3 style="color:#1A56A0;font-size:16px;font-weight:700;margin:0 0 8px;">Your AI Visibility Score: ${scorePercent} / 100</h3>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background:#e5e7eb;border-radius:6px;overflow:hidden;height:14px;padding:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="${scorePercent}%" style="height:14px;">
                      <tr>
                        <td style="background:#1A56A0;border-radius:6px;height:14px;line-height:14px;font-size:1px;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px;">The average across firms we&rsquo;ve analysed is 34.</p>

              ${gapBlock}

              ${unclaimedBlock}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 28px;">
                    <a href="${reportUrl}" style="display:inline-block;background:#1A56A0;color:#ffffff;padding:16px 36px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;letter-spacing:0.3px;">See your full report &rarr;</a>
                  </td>
                </tr>
              </table>

              <div style="padding-top:16px;border-top:1px solid #e5e7eb;">
                <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 4px;">Best regards,</p>
                <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 4px;font-weight:600;">Scott Davies</p>
                <p style="color:#6b7280;font-size:13px;line-height:1.4;margin:0;">Founder, TendorAI</p>
                <p style="color:#6b7280;font-size:13px;line-height:1.4;margin:0;"><a href="mailto:scott.davies@tendorai.com" style="color:#1A56A0;text-decoration:none;">scott.davies@tendorai.com</a></p>
              </div>

            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">${footerNote}</p>
              <p style="margin:12px 0 0;color:#9ca3af;font-size:11px;">
                <a href="https://www.tendorai.com" style="color:#1A56A0;text-decoration:none;">tendorai.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export { formatCompanyName, buildAeoSubject, TIER_UNLOCKED_PLATFORMS, CATEGORY_LABEL_PLURAL };

// =====================================================
// NEW LEAD NOTIFICATION (sent to vendor on VendorLead creation)
// =====================================================

export const newLeadNotificationTemplate = ({ vendorName, service, postcode, requirementsSummary, timelineLabel, dashboardUrl }) => {
  const requirementRows = requirementsSummary.map(item => `
    <tr><td style="padding: 6px 0; color: #374151; font-size: 14px;">${item}</td></tr>
  `).join('');

  const timelineColor = timelineLabel === 'ASAP' ? '#ef4444' : '#7c3aed';

  return wrapTemplate(`
  <div class="container">
    <div class="header">
      <h1>New Lead</h1>
      <p>${service} enquiry in ${postcode}</p>
    </div>
    <div class="content">
      <h2>Hi ${vendorName},</h2>
      <p>A business is looking for <strong>${service}</strong> in <strong>${postcode}</strong> and you've been matched as a supplier.</p>

      ${requirementRows ? `
      <div class="info-box">
        <h3>Requirements Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${requirementRows}
        </table>
      </div>
      ` : ''}

      ${timelineLabel ? `
      <p style="margin: 16px 0;">
        <strong>Timeline:</strong> <span style="color: ${timelineColor}; font-weight: 600;">${timelineLabel}</span>
      </p>
      ` : ''}

      <p><strong>Respond quickly</strong> — leads contacted within 2 hours are 3x more likely to convert.</p>

      <p style="text-align: center;">
        <a href="${dashboardUrl}" class="button">View Lead</a>
      </p>
    </div>
    <div class="footer">
      <p>This lead was sent via <a href="https://www.tendorai.com">TendorAI</a></p>
      <p>Manage your notifications in <a href="https://www.tendorai.com/vendor-dashboard/settings">account settings</a></p>
    </div>
  </div>
`);
};

// =====================================================
// WEEKLY PRO DIGEST
// =====================================================

export const weeklyProDigestTemplate = (digest) => {
  const { vendor, weekStarting, weekEnding, score, citations, agentActivity, needsAttention } = digest;

  const firstName = vendor.firstName || 'there';
  const firmName = vendor.firmName || 'your firm';

  const startDay = new Date(weekStarting).getUTCDate();
  const endDate = new Date(weekEnding);
  const endDay = endDate.getUTCDate();
  const monthName = endDate.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const year = endDate.getUTCFullYear();
  const dateRange = `${startDay}–${endDay} ${monthName} ${year}`;

  const scoreDisplay = score.current != null ? `${score.current}/100` : 'being calculated';
  let deltaDisplay = '';
  if (score.delta != null && score.delta !== 0) {
    const sign = score.delta > 0 ? '+' : '';
    deltaDisplay = ` (${sign}${score.delta} from last week)`;
  }

  const platformsWithCitations = Object.values(citations.byPlatform).filter(p => p.mentioned > 0).length;

  let citationLine;
  if (citations.total === 0) {
    citationLine = 'No citations captured this week — Detective is investigating why';
  } else {
    citationLine = `${citations.total} AI citation${citations.total !== 1 ? 's' : ''} captured across ${platformsWithCitations} platform${platformsWithCitations !== 1 ? 's' : ''}`;
  }

  const agentActions =
    (agentActivity.writer.draftsProduced || 0) +
    (agentActivity.listings.submitted || 0) +
    (agentActivity.reviews.sent || 0) +
    (agentActivity.detective.findingsCount || 0) +
    (agentActivity.reconnaissance.queriesScanned || 0);

  const isNewVendor = (() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return score.current == null && agentActions === 0 && citations.total === 0;
  })();

  const topFinding = agentActivity.detective.topFinding;

  let needsAttentionHtml = '';
  if (needsAttention.length > 0) {
    const items = needsAttention.slice(0, 5).map(item =>
      `<li style="padding:3px 0;color:#374151;font-size:14px;line-height:1.5;">${item.title}</li>`
    ).join('');
    needsAttentionHtml = `
              <div style="margin:24px 0 0;">
                <p style="color:#1A56A0;font-size:15px;font-weight:600;margin:0 0 8px;">Items needing your input (${needsAttention.length}):</p>
                <ul style="margin:0 0 8px;padding-left:24px;">${items}</ul>
                <p style="margin:0;"><a href="https://www.tendorai.com/vendor-dashboard/approvals" style="color:#1A56A0;font-size:14px;text-decoration:none;">Review in dashboard &rarr;</a></p>
              </div>`;
  }

  let topFindingHtml = '';
  if (topFinding) {
    topFindingHtml = `
              <div style="background:#f0f4f8;border-left:4px solid #1A56A0;border-radius:0 6px 6px 0;padding:14px 18px;margin:24px 0 0;">
                <p style="color:#1A56A0;font-size:14px;font-weight:600;margin:0 0 4px;">Top diagnosis this week</p>
                <p style="color:#374151;font-size:14px;line-height:1.5;margin:0 0 6px;"><strong>${topFinding.title}</strong></p>
                <p style="color:#374151;font-size:14px;line-height:1.5;margin:0;">${topFinding.recommendation}</p>
              </div>`;
  }

  let mainContent;
  if (isNewVendor) {
    mainContent = `
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px;">Setting up your TendorAI account this week — full report next Monday.</p>`;
  } else {
    mainContent = `
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 8px;font-weight:600;">This week:</p>
              <ul style="margin:0 0 24px;padding-left:24px;">
                <li style="padding:3px 0;color:#374151;font-size:14px;line-height:1.5;">AI Visibility Score: <strong>${scoreDisplay}</strong>${deltaDisplay}</li>
                <li style="padding:3px 0;color:#374151;font-size:14px;line-height:1.5;">${citationLine}</li>
                <li style="padding:3px 0;color:#374151;font-size:14px;line-height:1.5;">${agentActions} action${agentActions !== 1 ? 's' : ''} completed by your TendorAI agents</li>
              </ul>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your TendorAI week — ${firmName}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Score: ${scoreDisplay}${deltaDisplay} | ${citationLine}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:#ffffff;padding:24px 40px 16px;text-align:center;border-bottom:1px solid #e5e7eb;">
              <img src="https://www.tendorai.com/logo.png" alt="TendorAI" width="140" style="display:inline-block;max-width:140px;height:auto;" />
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px;">

              <p style="color:#374151;font-size:16px;line-height:1.7;margin:0 0 4px;">Hi ${firstName},</p>
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">Your weekly TendorAI report is ready.</p>

              ${mainContent}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 24px;">
                    <a href="https://www.tendorai.com/vendor-dashboard" style="display:inline-block;background:#1A56A0;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">View Full Report &rarr;</a>
                  </td>
                </tr>
              </table>

              ${needsAttentionHtml}
              ${topFindingHtml}

              <div style="padding-top:24px;border-top:1px solid #e5e7eb;margin-top:24px;">
                <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 4px;">— Scott</p>
                <p style="color:#6b7280;font-size:13px;line-height:1.4;margin:0;">TendorAI</p>
              </div>

            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                <a href="https://www.tendorai.com/vendor-dashboard/settings" style="color:#6b7280;text-decoration:none;">Manage email preferences</a>
                &nbsp;&middot;&nbsp;
                <a href="https://www.tendorai.com/unsubscribe" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
              </p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">Sent every Monday morning to ${vendor.id ? 'your account email' : 'you'}.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export function weeklyProDigestSubject(digest) {
  const firmName = digest.vendor.firmName || 'your firm';
  const endDate = new Date(digest.weekEnding);
  const startDay = new Date(digest.weekStarting).getUTCDate();
  const endDay = endDate.getUTCDate();
  const monthName = endDate.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const year = endDate.getUTCFullYear();
  return `Your TendorAI week — ${firmName}, ${startDay}–${endDay} ${monthName} ${year}`;
}

// Export all templates
export default {
  passwordResetTemplate,
  vendorWelcomeTemplate,
  quoteRequestTemplate,
  reviewNotificationTemplate,
  reviewResponseTemplate,
  leadNotificationTemplate,
  reviewRequestTemplate,
  verifiedReviewNotificationTemplate,
  aeoReportTemplate,
  newLeadNotificationTemplate,
  weeklyProDigestTemplate,
  weeklyProDigestSubject,
};
