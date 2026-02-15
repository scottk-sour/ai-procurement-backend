#!/usr/bin/env node

/**
 * Send newsletter email to all active subscribers
 *
 * Usage:
 *   node scripts/sendNewsletter.js --subject "Your subject" --html newsletters/my-email.html
 *   node scripts/sendNewsletter.js --subject "Your subject" --body "Plain text message here"
 *   node scripts/sendNewsletter.js --subject "Your subject" --html newsletters/my-email.html --test scott.davies@tendorai.com
 *
 * Options:
 *   --subject   Email subject line (required)
 *   --html      Path to HTML file for email body
 *   --body      Plain text body (used if no --html)
 *   --test      Send only to this address (for testing before full send)
 *   --dry-run   Show what would be sent without actually sending
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Resend } from 'resend';
import Subscriber from '../models/Subscriber.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'TendorAI <noreply@tendorai.com>';

if (!MONGO_URI) {
  console.error('MONGO_URI or MONGODB_URI environment variable is required');
  process.exit(1);
}

if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY environment variable is required');
  process.exit(1);
}

// Parse CLI args
function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const subject = getArg('subject');
const htmlFile = getArg('html');
const bodyText = getArg('body');
const testEmail = getArg('test');
const dryRun = process.argv.includes('--dry-run');

if (!subject) {
  console.error('--subject is required');
  console.error('Usage: node scripts/sendNewsletter.js --subject "Subject" --html file.html');
  process.exit(1);
}

if (!htmlFile && !bodyText) {
  console.error('Either --html or --body is required');
  process.exit(1);
}

// Load HTML content
let htmlContent = null;
let plainText = (bodyText || '').replace(/\\n/g, '\n');

if (htmlFile) {
  const filePath = path.resolve(htmlFile);
  if (!fs.existsSync(filePath)) {
    console.error(`HTML file not found: ${filePath}`);
    process.exit(1);
  }
  htmlContent = fs.readFileSync(filePath, 'utf-8');
}

// Wrap plain text in a simple branded template if no HTML provided
if (!htmlContent && plainText) {
  htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:24px;">TendorAI</h1>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;">
    ${plainText.split('\n').map(p => `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">${p}</p>`).join('\n    ')}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#9ca3af;font-size:12px;text-align:center;">
      You received this because you subscribed at tendorai.com
    </p>
  </div>
</div>
</body></html>`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const resend = new Resend(RESEND_API_KEY);

    // Get recipients
    let recipients;
    if (testEmail) {
      recipients = [{ email: testEmail }];
      console.log(`\nTEST MODE: Sending only to ${testEmail}\n`);
    } else {
      recipients = await Subscriber.find(
        { unsubscribed: { $ne: true } },
        { email: 1 }
      ).lean();
    }

    console.log(`Subject: ${subject}`);
    console.log(`From: ${EMAIL_FROM}`);
    console.log(`Recipients: ${recipients.length}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

    if (dryRun) {
      console.log('Would send to:');
      for (const r of recipients) {
        console.log(`  ${r.email}`);
      }
      console.log('\nDry run complete. Add --test <email> to test, or remove --dry-run to send.');
      await mongoose.disconnect();
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const { data, error } = await resend.emails.send({
          from: EMAIL_FROM,
          to: recipient.email,
          subject,
          html: htmlContent,
          text: plainText || subject,
        });

        if (error) {
          console.error(`  ❌ ${recipient.email}: ${error.message}`);
          failed++;
        } else {
          console.log(`  ✅ ${recipient.email} (${data.id})`);
          sent++;
        }
      } catch (err) {
        console.error(`  ❌ ${recipient.email}: ${err.message}`);
        failed++;
      }

      // Rate limit: ~10 emails/second (Resend allows 10/s on free tier)
      await sleep(150);
    }

    console.log(`\nDone! Sent: ${sent}, Failed: ${failed}`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
