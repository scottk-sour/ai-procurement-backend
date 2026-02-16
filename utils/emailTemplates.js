// utils/emailTemplates.js
// TendorAI Email Templates - Professional HTML emails

// TendorAI brand colors
const BRAND = {
  primary: '#1e40af',
  secondary: '#3b82f6',
  accent: '#f97316',
  dark: '#1f2937',
  light: '#f8fafc',
  border: '#e5e7eb',
};

// Base email layout wrapper
const emailWrapper = (content, previewText = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>TendorAI</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; background-color: ${BRAND.light}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%); padding: 32px 24px; text-align: center; }
    .header img { max-width: 150px; height: auto; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 16px 0 0 0; font-weight: 700; }
    .content { padding: 32px 24px; color: ${BRAND.dark}; line-height: 1.6; }
    .content h2 { font-size: 20px; color: ${BRAND.primary}; margin: 0 0 16px 0; }
    .content p { margin: 0 0 16px 0; font-size: 16px; }
    .button { display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%); color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 16px 0; }
    .button:hover { opacity: 0.9; }
    .info-box { background: ${BRAND.light}; border-left: 4px solid ${BRAND.accent}; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0; }
    .info-box h3 { margin: 0 0 8px 0; color: ${BRAND.dark}; font-size: 16px; }
    .info-box p { margin: 0; font-size: 14px; color: #6b7280; }
    .details-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .details-table td { padding: 12px 16px; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; }
    .details-table td:first-child { font-weight: 600; color: ${BRAND.dark}; width: 40%; background: ${BRAND.light}; }
    .footer { background: ${BRAND.light}; padding: 24px; text-align: center; border-top: 1px solid ${BRAND.border}; }
    .footer p { margin: 0 0 8px 0; font-size: 12px; color: #6b7280; }
    .footer a { color: ${BRAND.primary}; text-decoration: none; }
    .social-links { margin: 16px 0; }
    .social-links a { display: inline-block; margin: 0 8px; }
    @media only screen and (max-width: 600px) {
      .content { padding: 24px 16px; }
      .header { padding: 24px 16px; }
      .button { display: block; text-align: center; }
    }
  </style>
</head>
<body>
  <div style="display: none; max-height: 0; overflow: hidden;">${previewText}</div>
  <div style="display: none; max-height: 0; overflow: hidden;">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.light}; padding: 32px 16px;">
    <tr>
      <td align="center">
        <div class="email-container" style="border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          ${content}
          <div class="footer">
            <p><strong>TendorAI</strong> - Smart Procurement, Simplified</p>
            <p>Compare quotes from verified UK suppliers for photocopiers, telecoms, CCTV, and IT services.</p>
            <div class="social-links">
              <a href="https://www.tendorai.com">Website</a> |
              <a href="https://www.tendorai.com/contact">Contact</a> |
              <a href="https://www.tendorai.com/faq">FAQ</a>
            </div>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 16px;">
              © ${new Date().getFullYear()} TendorAI. All rights reserved.<br>
              <a href="https://www.tendorai.com/privacy-policy" style="color: #9ca3af;">Privacy Policy</a> |
              <a href="https://www.tendorai.com/terms-of-service" style="color: #9ca3af;">Terms of Service</a>
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Quote Request Confirmation (sent to customer)
export const getQuoteRequestTemplate = ({ customerName, service, quoteId, submittedAt, requirements }) => {
  const formattedDate = new Date(submittedAt).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const content = `
    <div class="header">
      <h1>Quote Request Received</h1>
    </div>
    <div class="content">
      <h2>Hi ${customerName},</h2>
      <p>Thank you for your quote request! We've received your enquiry and our verified suppliers are ready to provide competitive quotes.</p>

      <div class="info-box">
        <h3>What happens next?</h3>
        <p>Our matched suppliers will review your requirements and send you competitive quotes within 24-48 hours. You'll receive email notifications as quotes arrive.</p>
      </div>

      <table class="details-table">
        <tr>
          <td>Reference ID</td>
          <td><strong>${quoteId}</strong></td>
        </tr>
        <tr>
          <td>Service Type</td>
          <td>${service}</td>
        </tr>
        <tr>
          <td>Submitted</td>
          <td>${formattedDate}</td>
        </tr>
        ${requirements ? `
        <tr>
          <td>Your Requirements</td>
          <td>${requirements}</td>
        </tr>
        ` : ''}
      </table>

      <p style="text-align: center;">
        <a href="https://www.tendorai.com/quotes-requested" class="button">View Your Quotes</a>
      </p>

      <p style="font-size: 14px; color: #6b7280;">Need to make changes? <a href="https://www.tendorai.com/contact" style="color: ${BRAND.primary};">Contact our support team</a>.</p>
    </div>
  `;

  return emailWrapper(content, `Your quote request for ${service} has been received - Reference: ${quoteId}`);
};

// Vendor Notification (sent to vendor about new quote)
export const getVendorNotificationTemplate = ({ vendorName, customerName, service, location, quoteId, requirements }) => {
  const content = `
    <div class="header">
      <h1>New Quote Request</h1>
    </div>
    <div class="content">
      <h2>Hi ${vendorName},</h2>
      <p>Great news! You've received a new quote request matching your services. Act quickly to provide a competitive quote.</p>

      <div class="info-box" style="border-left-color: #10b981;">
        <h3>🎯 Hot Lead</h3>
        <p>Customers who receive quotes within 2 hours are 3x more likely to convert.</p>
      </div>

      <table class="details-table">
        <tr>
          <td>Quote Reference</td>
          <td><strong>${quoteId}</strong></td>
        </tr>
        <tr>
          <td>Customer</td>
          <td>${customerName}</td>
        </tr>
        <tr>
          <td>Service Required</td>
          <td>${service}</td>
        </tr>
        <tr>
          <td>Location</td>
          <td>${location}</td>
        </tr>
        ${requirements ? `
        <tr>
          <td>Requirements</td>
          <td>${requirements}</td>
        </tr>
        ` : ''}
      </table>

      <p style="text-align: center;">
        <a href="https://www.tendorai.com/vendor-dashboard" class="button">Respond to Quote</a>
      </p>

      <p style="font-size: 14px; color: #6b7280;">
        <strong>Tip:</strong> Include detailed pricing, delivery timeframes, and any special offers to stand out from competitors.
      </p>
    </div>
  `;

  return emailWrapper(content, `New ${service} quote request from ${customerName} in ${location}`);
};

// Quote Received (sent to customer when vendor responds)
export const getQuoteReceivedTemplate = ({ customerName, vendorName, service, quoteId }) => {
  const content = `
    <div class="header">
      <h1>New Quote Received!</h1>
    </div>
    <div class="content">
      <h2>Hi ${customerName},</h2>
      <p>Exciting news! <strong>${vendorName}</strong> has submitted a quote for your ${service} request.</p>

      <div class="info-box" style="border-left-color: #10b981;">
        <h3>✅ Quote Ready to Review</h3>
        <p>Log in to your dashboard to compare this quote with others and make an informed decision.</p>
      </div>

      <table class="details-table">
        <tr>
          <td>Quote Reference</td>
          <td><strong>${quoteId}</strong></td>
        </tr>
        <tr>
          <td>Supplier</td>
          <td>${vendorName}</td>
        </tr>
        <tr>
          <td>Service</td>
          <td>${service}</td>
        </tr>
      </table>

      <p style="text-align: center;">
        <a href="https://www.tendorai.com/quote-details/${quoteId}" class="button">View Quote Details</a>
      </p>

      <p style="font-size: 14px; color: #6b7280;">
        <strong>Pro tip:</strong> Compare multiple quotes to ensure you're getting the best value. More suppliers may respond shortly.
      </p>
    </div>
  `;

  return emailWrapper(content, `${vendorName} has submitted a quote for your ${service} request`);
};

// Welcome Email
export const getWelcomeTemplate = ({ name, userType }) => {
  const isVendor = userType === 'vendor';

  const content = `
    <div class="header">
      <h1>Welcome to TendorAI!</h1>
    </div>
    <div class="content">
      <h2>Hi ${name},</h2>
      <p>Welcome to TendorAI${isVendor ? "'s Partner Program" : ''}! We're thrilled to have you on board.</p>

      ${isVendor ? `
        <div class="info-box">
          <h3>🚀 Grow Your Business</h3>
          <p>Connect with thousands of UK businesses actively seeking your services. Complete your profile to start receiving qualified leads.</p>
        </div>

        <p><strong>Get started in 3 easy steps:</strong></p>
        <ol style="padding-left: 20px; margin: 16px 0;">
          <li style="margin-bottom: 8px;">Complete your company profile with services and coverage areas</li>
          <li style="margin-bottom: 8px;">Add your portfolio and certifications</li>
          <li style="margin-bottom: 8px;">Set up your notification preferences</li>
        </ol>

        <p style="text-align: center;">
          <a href="https://www.tendorai.com/vendor-dashboard" class="button">Complete Your Profile</a>
        </p>
      ` : `
        <div class="info-box">
          <h3>💡 Save Time & Money</h3>
          <p>Compare quotes from verified UK suppliers for photocopiers, telecoms, CCTV, and IT services - all in one place.</p>
        </div>

        <p><strong>What you can do:</strong></p>
        <ul style="padding-left: 20px; margin: 16px 0;">
          <li style="margin-bottom: 8px;">Request free, no-obligation quotes from multiple suppliers</li>
          <li style="margin-bottom: 8px;">Compare prices and services side-by-side</li>
          <li style="margin-bottom: 8px;">Read reviews from other businesses</li>
          <li style="margin-bottom: 8px;">Save time with our AI-powered matching</li>
        </ul>

        <p style="text-align: center;">
          <a href="https://www.tendorai.com/suppliers" class="button">Find Suppliers Now</a>
        </p>
      `}

      <p>Have questions? Our support team is here to help at <a href="mailto:scott.davies@tendorai.com" style="color: ${BRAND.primary};">scott.davies@tendorai.com</a></p>
    </div>
  `;

  return emailWrapper(content, `Welcome to TendorAI${isVendor ? ' Partner Program' : ''} - Let's get started!`);
};

// Password Reset Email
export const getPasswordResetTemplate = ({ name, resetUrl, expiresIn }) => {
  const content = `
    <div class="header">
      <h1>Password Reset</h1>
    </div>
    <div class="content">
      <h2>Hi ${name},</h2>
      <p>We received a request to reset your password. Click the button below to create a new password.</p>

      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>

      <div class="info-box" style="border-left-color: #ef4444;">
        <h3>⏰ Link expires in ${expiresIn}</h3>
        <p>For security reasons, this link will expire. If you need a new link, please request another password reset.</p>
      </div>

      <p style="font-size: 14px; color: #6b7280;">
        If you didn't request this password reset, please ignore this email or <a href="https://www.tendorai.com/contact" style="color: ${BRAND.primary};">contact support</a> if you have concerns.
      </p>

      <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
        Button not working? Copy and paste this link into your browser:<br>
        <a href="${resetUrl}" style="color: ${BRAND.primary}; word-break: break-all;">${resetUrl}</a>
      </p>
    </div>
  `;

  return emailWrapper(content, 'Reset your TendorAI password - Link expires in ' + expiresIn);
};

// Subscription Confirmation
export const getSubscriptionConfirmTemplate = ({ vendorName, planName, price, features, nextBillingDate }) => {
  const formattedDate = new Date(nextBillingDate).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const content = `
    <div class="header">
      <h1>Subscription Confirmed</h1>
    </div>
    <div class="content">
      <h2>Thank you, ${vendorName}!</h2>
      <p>Your subscription to the <strong>${planName}</strong> plan has been confirmed. You now have access to all premium features.</p>

      <div class="info-box" style="border-left-color: #10b981;">
        <h3>🎉 You're all set!</h3>
        <p>Your upgraded features are active immediately. Start receiving more leads today.</p>
      </div>

      <table class="details-table">
        <tr>
          <td>Plan</td>
          <td><strong>${planName}</strong></td>
        </tr>
        <tr>
          <td>Monthly Price</td>
          <td>£${price}/month</td>
        </tr>
        <tr>
          <td>Next Billing Date</td>
          <td>${formattedDate}</td>
        </tr>
      </table>

      ${features && features.length > 0 ? `
        <p><strong>Your plan includes:</strong></p>
        <ul style="padding-left: 20px; margin: 16px 0;">
          ${features.map(f => `<li style="margin-bottom: 8px;">${f}</li>`).join('')}
        </ul>
      ` : ''}

      <p style="text-align: center;">
        <a href="https://www.tendorai.com/vendor-dashboard" class="button">Go to Dashboard</a>
      </p>

      <p style="font-size: 14px; color: #6b7280;">
        Need to manage your subscription? Visit your <a href="https://www.tendorai.com/manage-account" style="color: ${BRAND.primary};">account settings</a>.
      </p>
    </div>
  `;

  return emailWrapper(content, `${planName} subscription confirmed - Thank you for upgrading!`);
};

export default {
  getQuoteRequestTemplate,
  getQuoteReceivedTemplate,
  getVendorNotificationTemplate,
  getWelcomeTemplate,
  getPasswordResetTemplate,
  getSubscriptionConfirmTemplate,
};
