import { Resend } from 'resend';
import dotenv from 'dotenv';
import {
  passwordResetTemplate,
  vendorWelcomeTemplate,
  quoteRequestTemplate,
  reviewNotificationTemplate,
  reviewResponseTemplate,
  leadNotificationTemplate,
  reviewRequestTemplate,
  verifiedReviewNotificationTemplate,
  aeoReportTemplate,
  formatCompanyName,
  buildAeoSubject,
  newLeadNotificationTemplate
} from './emailTemplates.js';
import { getIndustryConfig } from './industryConfig.js';

dotenv.config();

// Create Resend client
let resendClient = null;

const getResendClient = () => {
  if (resendClient) return resendClient;

  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY not configured. Emails will be logged but not sent.');
    return null;
  }

  resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
};

// Helper to send email
export const sendEmail = async ({ to, subject, html, text, from: customFrom }) => {
  const resend = getResendClient();
  const from = customFrom || process.env.EMAIL_FROM || 'TendorAI <noreply@tendorai.com>';

  // If no client (API key missing), log the email
  if (!resend) {
    console.log('📧 Email (would send):', { to, subject });
    return { success: true, simulated: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text: text || subject,
    });

    if (error) {
      console.error(`❌ Failed to send email to ${to}:`, error.message);
      throw new Error(error.message);
    }

    console.log(`✅ Email sent to: ${to} (id: ${data.id})`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    throw error;
  }
};

// =====================================================
// PASSWORD RESET
// =====================================================

export const sendPasswordResetEmail = async (email, { vendorName, resetToken }) => {
  const resetUrl = `https://www.tendorai.com/vendor-reset-password?token=${resetToken}`;

  return sendEmail({
    to: email,
    subject: 'Reset your TendorAI password',
    html: passwordResetTemplate({ vendorName, resetUrl, expiresIn: '1 hour' }),
    text: `Hi ${vendorName}, use this link to reset your password: ${resetUrl}. This link expires in 1 hour.`
  });
};

// =====================================================
// VENDOR WELCOME
// =====================================================

export const sendVendorWelcomeEmail = async (email, { vendorName }) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard';
  const loginUrl = 'https://www.tendorai.com/vendor-login';

  return sendEmail({
    to: email,
    subject: 'Welcome to TendorAI - Your vendor account is ready!',
    html: vendorWelcomeTemplate({ vendorName, loginUrl, dashboardUrl }),
    text: `Welcome to TendorAI, ${vendorName}! Your vendor account is ready. Log in at: ${loginUrl}`
  });
};

// =====================================================
// QUOTE REQUEST NOTIFICATION
// =====================================================

export const sendQuoteRequestEmail = async (vendorEmail, quoteDetails) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard';

  return sendEmail({
    to: vendorEmail,
    subject: `New Quote Request - ${quoteDetails.service || 'Equipment'}`,
    html: quoteRequestTemplate({
      vendorName: quoteDetails.vendorName || 'Vendor',
      customerName: quoteDetails.customerName,
      customerCompany: quoteDetails.customerCompany,
      service: quoteDetails.service || quoteDetails.machineType || 'Equipment',
      volume: quoteDetails.volume,
      postcode: quoteDetails.postcode,
      features: quoteDetails.features,
      dashboardUrl,
      quoteId: quoteDetails.quoteId
    }),
    text: `New quote request from ${quoteDetails.customerCompany || 'a customer'} for ${quoteDetails.service || 'equipment'}. View in your dashboard: ${dashboardUrl}`
  });
};

// Legacy function name for backward compatibility
export const sendQuoteNotification = sendQuoteRequestEmail;

// =====================================================
// REVIEW NOTIFICATIONS
// =====================================================

export const sendReviewNotification = async (vendorEmail, reviewDetails) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard';

  return sendEmail({
    to: vendorEmail,
    subject: `New ${reviewDetails.rating}-star review received`,
    html: reviewNotificationTemplate({
      vendorName: reviewDetails.vendorName || 'Vendor',
      reviewerName: reviewDetails.reviewerName,
      rating: reviewDetails.rating,
      title: reviewDetails.title,
      content: reviewDetails.content,
      dashboardUrl
    }),
    text: `You received a ${reviewDetails.rating}-star review from ${reviewDetails.reviewerName}. "${reviewDetails.title}" - View in your dashboard: ${dashboardUrl}/reviews`
  });
};

export const sendReviewResponseNotification = async (reviewerEmail, details) => {
  return sendEmail({
    to: reviewerEmail,
    subject: `${details.vendorName} responded to your review`,
    html: reviewResponseTemplate({
      reviewerName: details.reviewerName,
      vendorName: details.vendorName,
      responseContent: details.responseContent
    }),
    text: `${details.vendorName} responded to your review: "${details.responseContent}"`
  });
};

// =====================================================
// LEAD NOTIFICATIONS (for paid vendors)
// =====================================================

export const sendLeadNotification = async (vendorEmail, leadDetails) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard';

  return sendEmail({
    to: vendorEmail,
    subject: `New Lead - ${leadDetails.customerInfo.companyName} needs ${leadDetails.service}`,
    html: leadNotificationTemplate({
      vendorName: leadDetails.vendorName || 'Vendor',
      customerInfo: leadDetails.customerInfo,
      service: leadDetails.service,
      requirements: leadDetails.requirements,
      dashboardUrl,
      leadId: leadDetails.leadId
    }),
    text: `New lead from ${leadDetails.customerInfo.companyName} for ${leadDetails.service}. Contact: ${leadDetails.customerInfo.email}. View details: ${dashboardUrl}/leads`
  });
};

// =====================================================
// REVIEW REQUEST (sent to customer to request review)
// =====================================================

export const sendReviewRequestEmail = async (customerEmail, { customerName, vendorName, category, reviewToken }) => {
  const reviewUrl = `https://www.tendorai.com/review?token=${reviewToken}`;

  return sendEmail({
    to: customerEmail,
    subject: `How was your experience with ${vendorName}? | TendorAI`,
    html: reviewRequestTemplate({
      customerName: customerName || 'there',
      vendorName,
      category: category || 'office equipment',
      reviewUrl
    }),
    text: `Hi ${customerName || 'there'}, we'd love to hear how your ${category || 'quote'} experience went with ${vendorName}. Leave a review: ${reviewUrl}`
  });
};

// =====================================================
// VERIFIED REVIEW NOTIFICATION (to vendor)
// =====================================================

export const sendVerifiedReviewNotification = async (vendorEmail, reviewDetails) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard';

  return sendEmail({
    to: vendorEmail,
    subject: `New ${reviewDetails.rating}-Star Verified Review | TendorAI`,
    html: verifiedReviewNotificationTemplate({
      vendorName: reviewDetails.vendorName || 'Vendor',
      reviewerName: reviewDetails.reviewerName,
      reviewerCompany: reviewDetails.reviewerCompany,
      rating: reviewDetails.rating,
      title: reviewDetails.title,
      content: reviewDetails.content,
      dashboardUrl
    }),
    text: `You received a ${reviewDetails.rating}-star verified review from ${reviewDetails.reviewerName}. "${reviewDetails.title}" - View in your dashboard: ${dashboardUrl}/reviews`
  });
};

// =====================================================
// AI VISIBILITY REPORT (to lead)
// =====================================================

export const sendAeoReportEmail = async (email, reportData) => {
  const config = getIndustryConfig(reportData.category);
  const displayName = formatCompanyName(reportData.companyName);
  const categoryLabel = config.industryLabel || reportData.category;
  const tier = reportData.tier || 'free';
  const platformResults = reportData.platformResults || [];

  const subject = buildAeoSubject({ displayName });

  return sendEmail({
    to: email,
    subject,
    html: aeoReportTemplate({
      name: reportData.name,
      companyName: reportData.companyName,
      category: reportData.category,
      categoryLabel,
      city: reportData.city,
      score: reportData.score,
      reportUrl: reportData.reportUrl,
      platformResults,
      tier,
      competitors: reportData.competitors || [],
      gaps: reportData.gaps || [],
    }),
    text: `Your AI Visibility Report for ${displayName} is ready. Score: ${reportData.score}/100. We asked 6 AI platforms who they recommend for ${categoryLabel} in ${reportData.city}. See why AI recommends your competitors: ${reportData.reportUrl}`
  });
};

// =====================================================
// NEW LEAD NOTIFICATION (sent to vendor when a VendorLead is created)
// =====================================================

export const sendNewLeadNotification = async (vendorEmail, { vendorName, service, postcode, requirements, timeline, leadId }) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard/quotes';

  // Build a human-readable requirements summary
  const summaryParts = [];
  if (requirements) {
    if (requirements.volume) summaryParts.push(`Volume: ${requirements.volume} pages/mo`);
    if (requirements.colour) summaryParts.push(`Colour: ${requirements.colour}`);
    if (requirements.a3) summaryParts.push(`A3: ${requirements.a3}`);
    if (requirements.devices) summaryParts.push(`Devices: ${requirements.devices}`);
    if (requirements.users) summaryParts.push(`Users: ${requirements.users}`);
    if (requirements.cameras) summaryParts.push(`Cameras: ${requirements.cameras}`);
    if (requirements.cameraLocation) summaryParts.push(`Location: ${requirements.cameraLocation}`);
    if (Array.isArray(requirements.features) && requirements.features.length) summaryParts.push(`Features: ${requirements.features.join(', ')}`);
    if (Array.isArray(requirements.telecomsServices) && requirements.telecomsServices.length) summaryParts.push(`Services: ${requirements.telecomsServices.join(', ')}`);
    if (Array.isArray(requirements.securityServices) && requirements.securityServices.length) summaryParts.push(`Services: ${requirements.securityServices.join(', ')}`);
    if (Array.isArray(requirements.itServices) && requirements.itServices.length) summaryParts.push(`Services: ${requirements.itServices.join(', ')}`);
    if (Array.isArray(requirements.brands) && requirements.brands.length) summaryParts.push(`Brands: ${requirements.brands.join(', ')}`);
  }

  const timelineLabels = { urgent: 'ASAP', soon: '1-3 months', planning: '3-6 months', future: 'Just researching' };
  const timelineLabel = timelineLabels[timeline] || timeline || '';
  if (timelineLabel) summaryParts.push(`Timeline: ${timelineLabel}`);

  return sendEmail({
    to: vendorEmail,
    from: 'TendorAI <scott.davies@tendorai.com>',
    subject: `New Lead: ${service || 'Business'} enquiry in ${postcode || 'your area'}`,
    html: newLeadNotificationTemplate({
      vendorName: vendorName || 'there',
      service: service || 'Business services',
      postcode: postcode || 'Not specified',
      requirementsSummary: summaryParts,
      timelineLabel,
      dashboardUrl,
    }),
    text: `Hi ${vendorName || 'there'}, you have a new ${service} lead in ${postcode || 'your area'}. ${summaryParts.join('. ')}. View in your dashboard: ${dashboardUrl}`
  });
};

// =====================================================
// VENDOR CONTACT REQUEST
// =====================================================

export const sendVendorContactRequest = async ({ vendorId, vendorName, quoteId, customerName, customerMessage, customerEmail }) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard/quotes';

  // Look up vendor email from vendorId
  let vendorEmail;
  try {
    const { default: Vendor } = await import('../models/Vendor.js');
    const vendor = await Vendor.findById(vendorId).select('email').lean();
    vendorEmail = vendor?.email;
  } catch {
    console.error(`Could not look up vendor email for ${vendorId}`);
  }

  if (!vendorEmail) {
    console.warn(`No email found for vendor ${vendorId} — skipping contact request email`);
    return { success: false, reason: 'no_vendor_email' };
  }

  return sendEmail({
    to: vendorEmail,
    subject: `New enquiry from ${customerName} via TendorAI`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">New Enquiry via TendorAI</h2>
        <p style="color: #374151; line-height: 1.6;">
          <strong>${customerName}</strong> has sent you an enquiry through your TendorAI profile.
        </p>
        <div style="background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 12px 16px; margin: 16px 0; color: #374151;">
          ${customerMessage || 'No message provided.'}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px 0; color: #6b7280;">Customer</td><td style="padding: 8px 0; font-weight: 600;">${customerName}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Reply to</td><td style="padding: 8px 0; font-weight: 600;">${customerEmail}</td></tr>
        </table>
        <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 8px;">View in Dashboard</a>
      </div>
    `,
    text: `New enquiry from ${customerName} (${customerEmail}) via TendorAI: "${customerMessage || 'No message'}". View at ${dashboardUrl}`
  });
};

// =====================================================
// QUOTE ACCEPTED NOTIFICATION
// =====================================================

export const sendQuoteAcceptedNotification = async ({ vendorEmail, vendorName, customerName, quoteDetails }) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard/quotes';
  const service = quoteDetails?.service || 'your service';

  return sendEmail({
    to: vendorEmail,
    subject: `Good news — ${customerName} accepted your quote`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Quote Accepted!</h2>
        <p style="color: #374151; line-height: 1.6;">
          Great news, ${vendorName} — <strong>${customerName}</strong> has accepted your quote for <strong>${service}</strong>.
        </p>
        <h3 style="color: #374151; margin-top: 24px;">Next steps</h3>
        <ul style="color: #374151; line-height: 1.8;">
          <li>Reach out to ${customerName} to confirm details</li>
          <li>Agree a start date and timeline</li>
          <li>Mark the quote as won in your dashboard</li>
        </ul>
        <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 8px;">View in Dashboard</a>
      </div>
    `,
    text: `Good news, ${vendorName} — ${customerName} accepted your quote for ${service}. View details at ${dashboardUrl}`
  });
};

// =====================================================
// QUOTE DECLINED NOTIFICATION
// =====================================================

export const sendQuoteDeclinedNotification = async ({ vendorEmail, vendorName, customerName, reason }) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard/quotes';
  const reasonText = reason ? `<p style="color: #374151; line-height: 1.6;"><strong>Reason given:</strong> ${reason}</p>` : '';

  return sendEmail({
    to: vendorEmail,
    subject: `Quote update from ${customerName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Quote Update</h2>
        <p style="color: #374151; line-height: 1.6;">
          ${customerName} has decided not to proceed with your quote this time.
        </p>
        ${reasonText}
        <p style="color: #374151; line-height: 1.6;">
          Don't worry — every quote improves your visibility on TendorAI. Keep your profile up to date and you'll be matched with more enquiries.
        </p>
        <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 8px;">View Your Quotes</a>
      </div>
    `,
    text: `Quote update: ${customerName} has decided not to proceed this time.${reason ? ` Reason: ${reason}.` : ''} View your quotes at ${dashboardUrl}`
  });
};

// =====================================================
// SCHEMA INSTALL REQUEST NOTIFICATIONS
// =====================================================

export const sendSchemaInstallAdminNotification = async ({ vendorName, vendorEmail, websiteUrl, cmsPlatform }) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'support@tendorai.com';
  const dashboardUrl = 'https://www.tendorai.com/admin/schema-requests';

  return sendEmail({
    to: adminEmail,
    subject: `New Schema Install Request — ${vendorName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">New Schema Install Request</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">Vendor</td><td style="padding: 8px 0; font-weight: 600;">${vendorName}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;">${vendorEmail}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Website</td><td style="padding: 8px 0;">${websiteUrl}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">CMS</td><td style="padding: 8px 0;">${cmsPlatform}</td></tr>
        </table>
        <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View in Admin Dashboard</a>
      </div>
    `,
    text: `New schema install request from ${vendorName} (${vendorEmail}). Website: ${websiteUrl}, CMS: ${cmsPlatform}. View at ${dashboardUrl}`
  });
};

export const sendSchemaInstallCompleteNotification = async (vendorEmail, { vendorName, websiteUrl }) => {
  const dashboardUrl = 'https://www.tendorai.com/vendor-dashboard';

  return sendEmail({
    to: vendorEmail,
    subject: `Your TendorAI Schema is Live — ${vendorName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Your Schema is Live!</h2>
        <p style="color: #374151; line-height: 1.6;">
          Great news — we've successfully installed your TendorAI Schema.org markup on <strong>${websiteUrl}</strong>.
        </p>
        <p style="color: #374151; line-height: 1.6;">
          AI assistants like ChatGPT, Claude, and Perplexity can now read your structured data, which helps them recommend your business with confidence.
        </p>
        <p style="color: #374151; line-height: 1.6;">
          You can verify it's working by running the Schema Test from your dashboard.
        </p>
        <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">Go to Dashboard</a>
      </div>
    `,
    text: `Your TendorAI Schema is now live on ${websiteUrl}. You can verify it's working by running the Schema Test from your dashboard at ${dashboardUrl}.`
  });
};

// Default export for compatibility
export default {
  sendEmail,
  sendPasswordResetEmail,
  sendVendorWelcomeEmail,
  sendQuoteRequestEmail,
  sendQuoteNotification,
  sendReviewNotification,
  sendReviewResponseNotification,
  sendLeadNotification,
  sendNewLeadNotification,
  sendReviewRequestEmail,
  sendVerifiedReviewNotification,
  sendAeoReportEmail,
  sendVendorContactRequest,
  sendQuoteAcceptedNotification,
  sendQuoteDeclinedNotification,
  sendSchemaInstallAdminNotification,
  sendSchemaInstallCompleteNotification
};
