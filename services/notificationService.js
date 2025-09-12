import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

// Function to send quote request notification email to vendors
export const sendQuoteNotification = async (vendorEmail, quoteDetails) => {
    try {
        // Set up the email transporter
        const transporter = nodemailer.createTransporter({
            service: 'Gmail', // Change if using another provider (e.g., SendGrid, SMTP)
            auth: {
                user: process.env.EMAIL_USER, // Your email (from .env)
                pass: process.env.EMAIL_PASS, // Your email password (from .env)
            },
        });

        // Email content
        const mailOptions = {
            from: `"AI Procurement Platform" <${process.env.EMAIL_USER}>`,
            to: vendorEmail,
            subject: "New Quote Request Received",
            html: `
                <h3>New Quote Request</h3>
                <p>A potential customer is looking for a <b>${quoteDetails.machineType}</b>.</p>
                <p><strong>Volume:</strong> ${quoteDetails.volume} pages/month</p>
                <p><strong>Budget:</strong> £${quoteDetails.budget}</p>
                <br>
                <a href="https://your-platform.com/vendor-dashboard" 
                   style="background-color: #007bff; color: white; padding: 10px 15px; text-decoration: none; font-weight: bold;">
                   View Quote Request
                </a>
            `,
        };

        // Send the email
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to vendor: ${vendorEmail}`);
    } catch (error) {
        console.error(`❌ Error sending email to ${vendorEmail}:`, error);
    }
};

// Default export for compatibility with existing imports
export default {
    sendQuoteNotification
};
