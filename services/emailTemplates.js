// Email Templates for TendorAI
// All templates use a consistent design with the TendorAI brand

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

export const reviewRequestTemplate = ({ customerName, vendorName, category, reviewUrl }) => wrapTemplate(`
  <div class="container">
    <div class="header">
      <h1>How was your experience?</h1>
      <p>Share your feedback with ${vendorName}</p>
    </div>
    <div class="content">
      <h2>Hi ${customerName},</h2>
      <p>You recently requested a ${category.toLowerCase()} quote from <strong>${vendorName}</strong> through TendorAI.</p>
      <p>We'd love to hear how it went. Your review helps other businesses find great suppliers — and it only takes 30 seconds.</p>

      <p style="text-align: center; margin: 32px 0;">
        <a href="${reviewUrl}" class="button">Leave a Review →</a>
      </p>

      <div class="info-box">
        <p style="margin: 0; font-size: 14px;">
          <strong>Your review will display a "Verified Quote" badge</strong> because it's linked to a real quote request you made through TendorAI.
        </p>
      </div>

      <p style="color: #6b7280; font-size: 13px;">
        This link is unique to your quote request and expires in 30 days.<br>
        Can't click the button? Copy this link: <a href="${reviewUrl}" style="color: #7c3aed; word-break: break-all;">${reviewUrl}</a>
      </p>
    </div>
    <div class="footer">
      <p>You received this email because you requested a quote on <a href="https://www.tendorai.com">TendorAI</a></p>
      <p>The UK's B2B procurement comparison platform</p>
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
  if (!name || !name.trim()) return 'Hi there,';
  const firstName = name.trim().split(/\s+/)[0];
  const cased = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return `Hi ${cased},`;
}

function getEmailVendorType(category) {
  const solicitor = ['conveyancing', 'family-law', 'criminal-law', 'commercial-law', 'employment-law', 'wills-and-probate', 'immigration', 'personal-injury'];
  const accountant = ['tax-advisory', 'audit-assurance', 'bookkeeping', 'payroll', 'corporate-finance', 'business-advisory', 'vat-services', 'financial-planning'];
  const mortgage = ['residential-mortgages', 'buy-to-let', 'remortgage', 'first-time-buyer', 'equity-release', 'commercial-mortgages', 'protection-insurance'];
  const estate = ['sales', 'lettings', 'property-management', 'block-management', 'auctions', 'commercial-property', 'inventory'];
  if (solicitor.includes(category)) return 'solicitor';
  if (accountant.includes(category)) return 'accountant';
  if (mortgage.includes(category)) return 'mortgage-advisor';
  if (estate.includes(category)) return 'estate-agent';
  return 'other';
}

function getEmailRegulatoryBody(vendorType) {
  if (vendorType === 'solicitor') return 'verified data from the SRA Solicitors Register';
  if (vendorType === 'accountant') return 'data from the ICAEW Chartered Accountant directory';
  if (vendorType === 'mortgage-advisor') return 'data from the FCA Financial Services Register';
  if (vendorType === 'estate-agent') return 'public property directory data';
  return 'publicly available business data';
}

function getIndustryEntityLabel(vendorType) {
  if (vendorType === 'solicitor') return 'solicitors';
  if (vendorType === 'accountant') return 'accountants';
  if (vendorType === 'mortgage-advisor') return 'mortgage advisors';
  if (vendorType === 'estate-agent') return 'estate agents';
  return 'companies';
}

function getIndustryContent(vendorType, displayName, categoryLabel, city, score, aiMentioned, aiPosition) {
  const entityLabel = getIndustryEntityLabel(vendorType);

  // --- Subject line ---
  let subject;
  if (aiMentioned) {
    subject = `AI recommends ${displayName} — but you could rank higher`;
  } else if (vendorType === 'mortgage-advisor') {
    subject = `AI doesn't recommend ${displayName} to homebuyers`;
  } else if (vendorType === 'estate-agent') {
    subject = `AI doesn't recommend ${displayName} to sellers`;
  } else {
    subject = `AI doesn't recommend ${displayName} — here's why`;
  }

  // --- Opening paragraph ---
  let opening;
  if (aiMentioned) {
    const positionText = aiPosition ? ` at position ${aiPosition}` : '';
    opening = `Good news — when we asked AI about ${categoryLabel} in ${city}, <strong>${displayName}</strong> appeared${positionText}. But there's room to improve. Your AI Visibility score is <strong>${score}/100</strong>.`;
  } else if (vendorType === 'solicitor') {
    opening = `We asked ChatGPT, Claude, and Perplexity: <em>"Who are the best ${categoryLabel} solicitors in ${city}?"</em> <strong>${displayName}</strong> wasn't mentioned.`;
  } else if (vendorType === 'accountant') {
    opening = `We asked ChatGPT, Claude, and Perplexity: <em>"Who are the best ${categoryLabel} accountants in ${city}?"</em> <strong>${displayName}</strong> wasn't mentioned.`;
  } else if (vendorType === 'mortgage-advisor') {
    opening = `We asked ChatGPT and Perplexity: <em>"Who are the best mortgage advisors in ${city}?"</em> <strong>${displayName}</strong> didn't appear.`;
  } else if (vendorType === 'estate-agent') {
    opening = `We asked ChatGPT: <em>"Who are the best estate agents in ${city}?"</em> <strong>${displayName}</strong> wasn't listed.`;
  } else {
    opening = `We asked ChatGPT, Claude, and Perplexity: <em>"Who are the best ${categoryLabel} ${entityLabel} in ${city}?"</em> <strong>${displayName}</strong> wasn't mentioned.`;
  }

  // --- Why it matters ---
  let whyItMatters;
  if (aiMentioned) {
    whyItMatters = `Your full report shows exactly who ranks above you, what they're doing differently, and how to climb higher. The ${entityLabel} AI recommends first get the most enquiries.`;
  } else if (vendorType === 'solicitor') {
    whyItMatters = `More clients are asking AI for solicitor recommendations before they search Google. The firms AI recommends are getting enquiries you'll never see in your analytics. Your full report shows exactly who AI recommends instead of you, and what to fix.`;
  } else if (vendorType === 'accountant') {
    whyItMatters = `Business owners are asking AI for accountant recommendations. If AI can't find structured data about your practice — your services, specialisms, client sectors — it recommends your competitors instead.`;
  } else if (vendorType === 'mortgage-advisor') {
    whyItMatters = `First-time buyers and remortgagers are asking AI for mortgage advice before they search Google. The advisors AI recommends are getting leads you never see.`;
  } else if (vendorType === 'estate-agent') {
    whyItMatters = `Vendors are asking AI for estate agent recommendations before checking Rightmove. If AI doesn't know your agency, those instructions go to competitors.`;
  } else {
    whyItMatters = `200M+ people use ChatGPT monthly. Buyers are switching from Google to AI to find suppliers. If AI doesn't recommend you, you're losing leads you'll never know about.`;
  }

  return { subject, opening, whyItMatters };
}

const TIER_UNLOCKED_PLATFORMS = {
  free: ['perplexity'],
  starter: ['perplexity', 'chatgpt'],
  pro: ['perplexity', 'chatgpt', 'claude'],
  enterprise: ['perplexity', 'chatgpt', 'claude', 'gemini', 'grok', 'meta'],
};

function buildPlatformSummaryHtml(platformResults, tier) {
  if (!platformResults || platformResults.length === 0) return '';

  const unlocked = TIER_UNLOCKED_PLATFORMS[tier] || TIER_UNLOCKED_PLATFORMS.free;
  const mentionedCount = platformResults.filter(r => r.mentioned).length;
  const totalCount = platformResults.length;
  const lockedCount = totalCount - unlocked.length;

  let rows = '';
  for (const result of platformResults) {
    const isUnlocked = unlocked.includes(result.platform);
    if (isUnlocked) {
      const icon = result.mentioned ? '&#9989;' : '&#10060;';
      const posText = result.mentioned && result.position ? ` (Position #${result.position})` : '';
      rows += `<tr><td style="padding:6px 0;font-size:14px;color:#374151;">${icon} ${result.platformLabel}${posText}</td></tr>`;
    }
  }

  if (lockedCount > 0) {
    rows += `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">&#128274; ${lockedCount} more platform${lockedCount > 1 ? 's' : ''} — <a href="https://www.tendorai.com/for-vendors#pricing" style="color:#7c3aed;text-decoration:none;font-weight:600;">upgrade to see all results</a></td></tr>`;
  }

  return `
          <!-- Platform mention summary -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;">
                <tr><td style="padding:12px 16px 4px;">
                  <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1f2937;">AI Platform Results: Mentioned by ${mentionedCount} of ${totalCount} platforms</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    ${rows}
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>`;
}

export const aeoReportTemplate = ({ name, companyName, category, categoryLabel, city, score, aiMentioned, aiPosition, reportUrl, platformResults, tier }) => {
  const vendorType = getEmailVendorType(category);
  const displayName = formatCompanyName(companyName);
  const greeting = formatGreetingName(name);

  const scoreColor = score <= 25 ? '#dc2626' : score <= 50 ? '#ea580c' : score <= 75 ? '#65a30d' : '#16a34a';
  const scoreLabel = score <= 25 ? 'Needs attention' : score <= 50 ? 'Room to grow' : score <= 75 ? 'Good start' : 'Strong';

  const { opening, whyItMatters } = getIndustryContent(vendorType, displayName, categoryLabel, city, score, aiMentioned, aiPosition);
  const trustLine = getEmailRegulatoryBody(vendorType);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your AI Visibility Report — ${displayName}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">

          <!-- Logo bar -->
          <tr>
            <td style="background:#ffffff;padding:24px 40px 16px;text-align:center;border-bottom:1px solid #f3f4f6;">
              <img src="https://www.tendorai.com/logo.png" alt="TendorAI" width="140" style="display:inline-block;max-width:140px;height:auto;" />
            </td>
          </tr>

          <!-- Score hero -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td align="center">
                    <div style="width:140px;height:140px;border-radius:50%;border:8px solid ${scoreColor};text-align:center;line-height:124px;margin:0 auto;">
                      <span style="font-size:52px;font-weight:700;color:${scoreColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${score}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:12px;">
                    <span style="display:inline-block;background:${scoreColor};color:#ffffff;font-size:13px;font-weight:600;padding:4px 16px;border-radius:20px;letter-spacing:0.3px;">${scoreLabel}</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:8px;">
                    <p style="margin:0;color:#6b7280;font-size:14px;">${displayName} — AI Visibility Score</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${buildPlatformSummaryHtml(platformResults, tier)}

          <!-- Main content -->
          <tr>
            <td style="padding:0 40px 32px;">

              <h2 style="color:#1f2937;font-size:20px;margin:0 0 16px;font-weight:600;">${greeting}</h2>

              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">${opening}</p>

              <!-- Why it matters -->
              <div style="background:#faf5ff;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
                <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;"><strong style="color:#7c3aed;">Why this matters:</strong> ${whyItMatters}</p>
              </div>

              <!-- Social proof -->
              <p style="text-align:center;color:#6b7280;font-size:13px;margin:20px 0;font-style:italic;">Over 12,000 UK businesses are already on TendorAI.</p>

              <!-- What's in your report -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin:20px 0;">
                <tr><td style="padding:16px 20px 8px;">
                  <p style="margin:0 0 12px;color:#1f2937;font-size:15px;font-weight:600;">What's in your report:</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr><td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.6;">&#10003;&nbsp;&nbsp;Your AI Visibility score with detailed breakdown</td></tr>
                    <tr><td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.6;">&#10003;&nbsp;&nbsp;What AI knows (and doesn't know) about your business</td></tr>
                    <tr><td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.6;">&#10003;&nbsp;&nbsp;Who AI recommends instead — with website links</td></tr>
                    <tr><td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.6;">&#10003;&nbsp;&nbsp;Specific gaps holding you back</td></tr>
                    <tr><td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.6;">&#10003;&nbsp;&nbsp;Downloadable PDF report</td></tr>
                  </table>
                </td></tr>
              </table>

              <!-- Primary CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 12px;">
                    <a href="${reportUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;letter-spacing:0.3px;">View Your Full Report</a>
                  </td>
                </tr>
              </table>

              <!-- Secondary CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:4px 0 8px;">
                    <a href="https://www.tendorai.com/for-vendors" style="display:inline-block;border:2px solid #7c3aed;color:#7c3aed;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Claim Your Free Profile</a>
                  </td>
                </tr>
              </table>

              <!-- Trust line -->
              <p style="color:#9ca3af;font-size:12px;text-align:center;margin:20px 0 0;">This report was generated using ${trustLine} and AI analysis across ChatGPT, Claude, Perplexity, and Google AI Overviews.</p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:13px;font-weight:600;">TendorAI</p>
              <p style="margin:0 0 12px;color:#9ca3af;font-size:12px;">The UK's AI Visibility Platform</p>
              <p style="margin:0;color:#9ca3af;font-size:11px;">
                <a href="https://www.tendorai.com" style="color:#7c3aed;text-decoration:none;">tendorai.com</a>
                &nbsp;&bull;&nbsp;
                <a href="https://www.tendorai.com/unsubscribe" style="color:#9ca3af;text-decoration:none;">Unsubscribe</a>
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

// Export helpers for use in emailService.js
export { getEmailVendorType, formatCompanyName, getIndustryContent };

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
  newLeadNotificationTemplate
};
