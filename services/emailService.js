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
  aeoReportTemplate
} from './emailTemplates.js';

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
export const sendEmail = async ({ to, subject, html, text }) => {
  const resend = getResendClient();
  const from = process.env.EMAIL_FROM || 'TendorAI <noreply@tendorai.com>';

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
  const resetUrl = `https://tendorai.com/vendor-reset-password?token=${resetToken}`;

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
  const dashboardUrl = 'https://tendorai.com/vendor-dashboard';
  const loginUrl = 'https://tendorai.com/vendor-login';

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
  const dashboardUrl = 'https://tendorai.com/vendor-dashboard';

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
  const dashboardUrl = 'https://tendorai.com/vendor-dashboard';

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
  const dashboardUrl = 'https://tendorai.com/vendor-dashboard';

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
  const reviewUrl = `https://tendorai.com/review?token=${reviewToken}`;

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
  const dashboardUrl = 'https://tendorai.com/vendor-dashboard';

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
// AEO REPORT (to lead)
// =====================================================

export const sendAeoReportEmail = async (email, reportData) => {
  const categoryLabels = {
    copiers: 'copier and managed print',
    telecoms: 'telecoms and VoIP',
    cctv: 'CCTV and security',
    it: 'IT support',
  };

  return sendEmail({
    to: email,
    subject: `Your AI Visibility Report — ${reportData.companyName}`,
    html: aeoReportTemplate({
      companyName: reportData.companyName,
      category: categoryLabels[reportData.category] || reportData.category,
      city: reportData.city,
      aiMentioned: reportData.aiMentioned,
      aiPosition: reportData.aiPosition,
      aiRecommendations: reportData.aiRecommendations,
      competitorsOnTendorAI: reportData.competitorsOnTendorAI,
    }),
    text: reportData.aiMentioned
      ? `AI Visibility Report for ${reportData.companyName}: AI mentions you at position #${reportData.aiPosition} for ${categoryLabels[reportData.category] || reportData.category} in ${reportData.city}. Protect your ranking — claim your free listing at https://tendorai.com/vendor-signup`
      : `AI Visibility Report for ${reportData.companyName}: AI does NOT recommend you for ${categoryLabels[reportData.category] || reportData.category} in ${reportData.city}. Fix this — claim your free listing at https://tendorai.com/vendor-signup`
  });
};

// =====================================================
// QUOTE NOTIFICATION STUBS (for quoteRoutes.js compatibility)
// These are called with optional chaining, so they won't crash if they fail
// =====================================================

export const sendVendorContactRequest = async ({ vendorId, vendorName, quoteId, customerName, customerMessage, customerEmail }) => {
  console.log(`📧 Vendor contact request: ${customerName} -> ${vendorName}`);
  // TODO: Implement actual email sending
  return { success: true, simulated: true };
};

export const sendQuoteAcceptedNotification = async ({ vendorEmail, vendorName, customerName, quoteDetails }) => {
  console.log(`📧 Quote accepted notification: ${customerName} accepted quote from ${vendorName}`);
  // TODO: Implement actual email sending
  return { success: true, simulated: true };
};

export const sendQuoteDeclinedNotification = async ({ vendorEmail, vendorName, customerName, reason }) => {
  console.log(`📧 Quote declined notification: ${customerName} declined quote from ${vendorName}`);
  // TODO: Implement actual email sending
  return { success: true, simulated: true };
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
  sendReviewRequestEmail,
  sendVerifiedReviewNotification,
  sendAeoReportEmail,
  sendVendorContactRequest,
  sendQuoteAcceptedNotification,
  sendQuoteDeclinedNotification
};
