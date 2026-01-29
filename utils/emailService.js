// utils/emailService.js
// TendorAI Email Service using Nodemailer

import nodemailer from 'nodemailer';
import { logger } from '../logger.js';
import {
  getQuoteRequestTemplate,
  getQuoteReceivedTemplate,
  getVendorNotificationTemplate,
  getWelcomeTemplate,
  getPasswordResetTemplate,
  getSubscriptionConfirmTemplate,
} from './emailTemplates.js';

// Email configuration
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

// Create reusable transporter
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport(EMAIL_CONFIG);
  }
  return transporter;
};

// Verify transporter connection
export const verifyEmailConnection = async () => {
  try {
    const transport = getTransporter();
    await transport.verify();
    logger.info('Email service connected successfully');
    return true;
  } catch (error) {
    logger.error('Email service connection failed:', error.message);
    return false;
  }
};

// Base email sending function
const sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  try {
    const transport = getTransporter();

    const mailOptions = {
      from: `"TendorAI" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      attachments,
    };

    const info = await transport.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${to}`, { messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Failed to send email:', { to, subject, error: error.message });
    return { success: false, error: error.message };
  }
};

// Send quote request confirmation to customer
export const sendQuoteRequestConfirmation = async (customer, quoteDetails) => {
  const { email, name } = customer;
  const html = getQuoteRequestTemplate({
    customerName: name,
    service: quoteDetails.service,
    quoteId: quoteDetails.quoteId,
    submittedAt: quoteDetails.submittedAt || new Date(),
    requirements: quoteDetails.requirements,
  });

  return sendEmail({
    to: email,
    subject: `Quote Request Received - ${quoteDetails.service} | TendorAI`,
    html,
  });
};

// Send notification to vendor about new quote
export const sendVendorQuoteNotification = async (vendor, quoteDetails, customer) => {
  const { email, businessName } = vendor;
  const html = getVendorNotificationTemplate({
    vendorName: businessName,
    customerName: customer.name,
    service: quoteDetails.service,
    location: customer.postcode,
    quoteId: quoteDetails.quoteId,
    requirements: quoteDetails.requirements,
  });

  return sendEmail({
    to: email,
    subject: `New Quote Request - ${quoteDetails.service} | TendorAI`,
    html,
  });
};

// Send quote received confirmation to customer (when vendor responds)
export const sendQuoteReceivedNotification = async (customer, vendorName, quoteDetails) => {
  const { email, name } = customer;
  const html = getQuoteReceivedTemplate({
    customerName: name,
    vendorName,
    service: quoteDetails.service,
    quoteId: quoteDetails.quoteId,
  });

  return sendEmail({
    to: email,
    subject: `New Quote Received from ${vendorName} | TendorAI`,
    html,
  });
};

// Send welcome email to new user
export const sendWelcomeEmail = async (user, userType = 'customer') => {
  const { email, name } = user;
  const html = getWelcomeTemplate({
    name,
    userType,
  });

  return sendEmail({
    to: email,
    subject: `Welcome to TendorAI${userType === 'vendor' ? ' Partner Program' : ''}!`,
    html,
  });
};

// Send password reset email
export const sendPasswordResetEmail = async (user, resetToken) => {
  const { email, name } = user;
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const html = getPasswordResetTemplate({
    name,
    resetUrl,
    expiresIn: '1 hour',
  });

  return sendEmail({
    to: email,
    subject: 'Password Reset Request | TendorAI',
    html,
  });
};

// Send subscription confirmation
export const sendSubscriptionConfirmation = async (vendor, planDetails) => {
  const { email, businessName } = vendor;
  const html = getSubscriptionConfirmTemplate({
    vendorName: businessName,
    planName: planDetails.planName,
    price: planDetails.price,
    features: planDetails.features,
    nextBillingDate: planDetails.nextBillingDate,
  });

  return sendEmail({
    to: email,
    subject: `Subscription Confirmed - ${planDetails.planName} Plan | TendorAI`,
    html,
  });
};

// Bulk email sending with rate limiting
export const sendBulkEmails = async (emails, rateLimit = 10) => {
  const results = [];
  const chunks = [];

  // Split into chunks based on rate limit
  for (let i = 0; i < emails.length; i += rateLimit) {
    chunks.push(emails.slice(i, i + rateLimit));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(email => sendEmail(email))
    );
    results.push(...chunkResults);

    // Wait 1 second between chunks to respect rate limits
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  logger.info(`Bulk email complete: ${successful} sent, ${failed} failed`);

  return { total: emails.length, successful, failed, results };
};

export default {
  verifyEmailConnection,
  sendQuoteRequestConfirmation,
  sendVendorQuoteNotification,
  sendQuoteReceivedNotification,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendSubscriptionConfirmation,
  sendBulkEmails,
};
