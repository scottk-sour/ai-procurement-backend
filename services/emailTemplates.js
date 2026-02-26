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
// AEO REPORT (to lead)
// =====================================================

function getEmailRegulatoryBody(category) {
  const lower = (category || '').toLowerCase();
  const legal = ['conveyancing', 'family law', 'criminal law', 'commercial law', 'employment law', 'wills and probate', 'wills-and-probate', 'immigration', 'personal injury', 'personal-injury', 'family-law', 'criminal-law', 'commercial-law', 'employment-law'];
  const accountants = ['tax advisory', 'tax-advisory', 'audit', 'audit-assurance', 'audit & assurance', 'bookkeeping', 'payroll', 'corporate finance', 'corporate-finance', 'business advisory', 'business-advisory', 'vat', 'vat-services', 'financial planning', 'financial-planning'];
  const mortgage = ['mortgage', 'mortgages', 'residential-mortgages', 'residential mortgages', 'buy-to-let', 'buy to let', 'remortgage', 'first-time-buyer', 'first time buyer', 'equity-release', 'equity release', 'commercial-mortgages', 'commercial mortgages', 'protection-insurance', 'protection insurance'];
  const estate = ['sales', 'lettings', 'property-management', 'property management', 'block-management', 'block management', 'auctions', 'commercial-property', 'commercial property', 'inventory', 'estate agent'];

  if (legal.some(k => lower.includes(k))) return 'the SRA Solicitors Register';
  if (accountants.some(k => lower.includes(k))) return 'the ICAEW directory';
  if (mortgage.some(k => lower.includes(k))) return 'the FCA Financial Services Register';
  if (estate.some(k => lower.includes(k))) return 'public property directories';
  return 'publicly available business data';
}

export const aeoReportTemplate = ({ companyName, category, city, score, aiMentioned, reportUrl }) => {
  const scoreColor = score <= 30 ? '#ef4444' : score <= 60 ? '#f59e0b' : '#1B4F72';
  const scoreLabel = score <= 20 ? 'Critical' : score <= 35 ? 'Poor' : score <= 50 ? 'Below Average' : score <= 65 ? 'Average' : 'Good';

  const verdictHeader = aiMentioned
    ? `${companyName} — AI Visibility Score: ${score}/100`
    : `${companyName} — AI Visibility Score: ${score}/100`;

  const verdictMessage = aiMentioned
    ? `<p>When we asked AI "Who are the best ${category} companies in ${city}?", <strong>${companyName}</strong> was mentioned — but competitors rank higher. Your full report shows exactly who AI recommends instead and what you can do about it.</p>`
    : `<p>When we asked AI "Who are the best ${category} companies in ${city}?", <strong>${companyName}</strong> was <strong>not mentioned</strong>. Your full report shows who AI recommends instead, what gaps are holding you back, and how to fix it.</p>`;

  return wrapTemplate(`
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, ${scoreColor} 0%, #1C1C1C 100%);">
      <h1>${verdictHeader}</h1>
      <p>Your AI Visibility Report is Ready</p>
    </div>
    <div class="content">
      <h2>Hi,</h2>
      ${verdictMessage}

      <p style="color:#6b7280;font-size:13px;margin:16px 0 0;text-align:center;">This report was generated using data from ${getEmailRegulatoryBody(category)} and AI analysis of your online presence across ChatGPT, Claude, Perplexity, and Google AI Overviews.</p>

      <div style="text-align:center;margin:30px 0;">
        <div style="display:inline-block;width:120px;height:120px;border-radius:50%;border:6px solid ${scoreColor};text-align:center;line-height:108px;">
          <span style="font-size:42px;font-weight:bold;color:${scoreColor};">${score}</span>
        </div>
        <p style="color:#6b7280;font-size:14px;margin-top:8px;">${scoreLabel} — out of 100</p>
      </div>

      <h3>Your report includes:</h3>
      <ul style="color:#374151;line-height:2;">
        <li>Your AI visibility score with detailed breakdown</li>
        <li>What AI knows (and doesn't know) about your business</li>
        <li>Who AI recommends instead — with website links</li>
        <li>Specific gaps holding you back</li>
        <li>Downloadable PDF report</li>
      </ul>

      <p style="text-align: center; margin-top: 30px;">
        <a href="${reportUrl}" class="button">View Your Full Report</a>
      </p>

      <div class="info-box" style="margin-top:24px;">
        <h3>Why this matters</h3>
        <p style="margin:0;">200M+ people use ChatGPT monthly. 100M+ use Perplexity. Buyers are switching from Google to AI to find suppliers. If AI doesn't recommend you, you're losing leads you'll never know about.</p>
      </div>

      <p style="text-align: center; margin-top: 20px;">
        <a href="https://www.tendorai.com/vendor-signup" class="button" style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);">Claim Your Free Profile on TendorAI</a>
      </p>
    </div>
    <div class="footer">
      <p>This report was generated by <a href="https://www.tendorai.com">TendorAI</a></p>
      <p>The UK's AI-powered supplier directory</p>
    </div>
  </div>
`);
};

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
