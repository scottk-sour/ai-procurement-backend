import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import {
  passwordResetTemplate,
  vendorWelcomeTemplate,
  quoteRequestTemplate,
  reviewNotificationTemplate,
  reviewResponseTemplate,
  leadNotificationTemplate,
  reviewRequestTemplate,
  verifiedReviewNotificationTemplate
} from './emailTemplates.js';

dotenv.config();

// Create reusable transporter
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ Email credentials not configured. Emails will be logged but not sent.');
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
};

// Helper to send email
const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();

  const mailOptions = {
    from: `"TendorAI" <${process.env.EMAIL_USER || 'noreply@tendorai.com'}>`,
    to,
    subject,
    html,
    text: text || subject // Fallback plain text
  };

  // If no transporter (credentials missing), log the email
  if (!transport) {
    console.log('📧 Email (would send):', { to, subject });
    return { success: true, simulated: true };
  }

  try {
    await transport.sendMail(mailOptions);
    console.log(`✅ Email sent to: ${to}`);
    return { success: true };
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
  sendVerifiedReviewNotification
};
