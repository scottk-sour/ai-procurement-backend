#!/usr/bin/env node

/**
 * Cold Batch 001 — Cardiff + Birmingham Solicitors
 *
 * Sends 18 personalised cold emails to priority solicitor firms.
 * DEFAULT: dry-run mode — all emails go to kinder1975.sd@gmail.com
 * LIVE:    DRY_RUN=false node scripts/send-cold-batch-001.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { sendEmail } from '../services/emailService.js';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const DRY_RUN_RECIPIENT = 'kinder1975.sd@gmail.com';
const FROM = 'Scott Davies <scott.davies@tendorai.com>';
const REPLY_TO = 'scott.davies@tendorai.com';
const PAUSE_MS = 2000;

const FIRMS = [
  { firm: 'Hek Jones Limited', city: 'Cardiff', area: 'commercial law', score: 15, firstName: null, email: 'info@hekjones.com', reportId: '69fb9cc86c8a541d32ccd8ab' },
  { firm: 'Rudge & Co', city: 'Birmingham', area: 'commercial law', score: 15, firstName: null, email: 'addressee@rudgeandco.co.uk', reportId: '69fc65e93659ae37058d8f5e' },
  { firm: 'J R Jones Solicitors', city: 'Birmingham', area: 'conveyancing', score: 21, firstName: 'Shabir', email: 'shabir@jrjones.biz', reportId: '69fc6c6d3659ae37058d930f' },
  { firm: 'Lex House Limited', city: 'Cardiff', area: 'immigration', score: 25, firstName: null, email: 'info@lexhousesolicitors.co.uk', reportId: '69fb9fbb6c8a541d32ccda56' },
  { firm: 'Nissi Solicitors', city: 'Birmingham', area: 'litigation', score: 25, firstName: null, email: 'info@nissisolicitors.co.uk', reportId: '69fc68873659ae37058d90d5' },
  { firm: 'Immigration Rights Solicitors Ltd', city: 'Birmingham', area: 'immigration', score: 25, firstName: 'Saima', email: 'saima_rahman@hotmail.co.uk', reportId: '69fc6c443659ae37058d92fa' },
  { firm: 'Ackland & Co', city: 'Cardiff', area: 'conveyancing', score: 30, firstName: null, email: 'info@acklandslegal.co.uk', reportId: '69fb9b886c8a541d32ccd816' },
  { firm: 'Kingswood Legal Limited', city: 'Birmingham', area: 'immigration', score: 30, firstName: null, email: 'info@kingswood-solicitors.co.uk', reportId: '69fc6b1a3659ae37058d9250' },
  { firm: 'Wright Justice Solicitors Ltd', city: 'Birmingham', area: 'family law', score: 30, firstName: null, email: 'info@wrightjustice.co.uk', reportId: '69fc6e663659ae37058d9420' },
  { firm: 'Goldsmiths Solicitors Limited', city: 'Birmingham', area: 'family law', score: 30, firstName: 'Zeidha', email: 'zeidha@goldsmithssolicitors.co.uk', reportId: '69fc6efd3659ae37058d947e' },
  { firm: 'Bassi Solicitors Limited', city: 'Birmingham', area: 'litigation', score: 31, firstName: null, email: 'bassisolicitors@googlemail.com', reportId: '69fc6b853659ae37058d9291' },
  { firm: 'Campbell Solicitors', city: 'Birmingham', area: 'employment law', score: 34, firstName: 'Lisa', email: 'lcampbell@lisacampbell.co.uk', reportId: '69fc66f53659ae37058d8fe7' },
  { firm: 'Cambridge Solicitors LLP', city: 'Birmingham', area: 'family law', score: 34, firstName: null, email: 'info@cambridgesolicitorsllp.com', reportId: '69fc69be3659ae37058d918c' },
  { firm: 'Nicol Denvir & Purnell', city: 'Cardiff', area: 'family law', score: 35, firstName: 'JP', email: 'jp@ndplegal.com', reportId: '69fb9ca16c8a541d32ccd894' },
  { firm: 'Cousins Business Law', city: 'Birmingham', area: 'litigation', score: 35, firstName: 'Gary', email: 'gary.cousins@business-lawfirm.co.uk', reportId: '69fc67663659ae37058d902e' },
  { firm: 'Midland Solicitors', city: 'Birmingham', area: 'family law', score: 35, firstName: null, email: 'info@midlandsolicitors.com', reportId: '69fc68a73659ae37058d90eb' },
  { firm: 'G Q S Limited', city: 'Birmingham', area: 'criminal law', score: 35, firstName: null, email: 'office@gqs-solicitors.co.uk', reportId: '69fc6af73659ae37058d923b' },
  { firm: 'Loynton & Co Solicitors Ltd', city: 'Birmingham', area: 'conveyancing', score: 35, firstName: null, email: 'mareata@loyntonlaw.co.uk', reportId: '69fc6cb63659ae37058d933d' },
];

function buildBody(f) {
  const greeting = f.firstName ? `Hi ${f.firstName}` : `Hi ${f.firm} team`;
  return `${greeting},

Quick note about how AI assistants are recommending ${f.area} solicitors in ${f.city}.

I run TendorAI, a UK platform that audits how ChatGPT, Claude, Perplexity, Gemini and Copilot recommend SRA-regulated firms. Last week we tested ${f.firm} and the wider ${f.city} solicitor market.

${f.firm} scored ${f.score} out of 100. Full report (no signup needed):
https://www.tendorai.com/aeo-report/results/${f.reportId}

For context, the median score across the 36 Cardiff firms we tested was 40/100. The firms ChatGPT does name in ${f.city} when asked for a ${f.area} solicitor sit at 60+. The gap is fixable — it's a structured-signals problem, not a service problem.

${f.firm} already has a basic profile on TendorAI from the SRA register. It's unclaimed, which means AI can only see your firm name and SRA number — not your specialisms, fee earners, or accreditations.

Claiming is free and takes 2 minutes:
https://www.tendorai.com/vendor-signup

Happy to answer any questions, or send across the methodology if useful.

Best regards,
Scott Davies
Founder, TendorAI Ltd (Companies House 16521860)
The UK's AI Visibility Platform for regulated services firms
https://www.tendorai.com`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`=== Cold Batch 001 — ${FIRMS.length} firms ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (all emails → ' + DRY_RUN_RECIPIENT + ')' : '⚠️  LIVE — sending to real recipients'}`);
  console.log('');

  let sent = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < FIRMS.length; i++) {
    const f = FIRMS[i];
    const realRecipient = f.email;
    const recipient = DRY_RUN ? DRY_RUN_RECIPIENT : realRecipient;
    const subject = DRY_RUN
      ? `[DRY → would send to ${realRecipient}] ${f.firm} — AI visibility score: ${f.score}/100`
      : `${f.firm} — AI visibility score: ${f.score}/100`;

    const body = buildBody(f);

    try {
      const result = await sendEmail({
        to: recipient,
        subject,
        text: body,
        html: `<pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap; line-height: 1.6; font-size: 14px; max-width: 600px;">${body.replace(/https:\/\/www\.tendorai\.com\/aeo-report\/results\/[a-f0-9]+/g, m => `<a href="${m}">${m}</a>`).replace(/https:\/\/www\.tendorai\.com\/vendor-signup/g, m => `<a href="${m}">${m}</a>`).replace(/https:\/\/www\.tendorai\.com$/gm, m => `<a href="${m}">${m}</a>`)}</pre>`,
        from: FROM,
        reply_to: [REPLY_TO],
      });

      sent++;
      console.log(`✓ [${i + 1}/${FIRMS.length}] ${f.firm} (${f.score}/100) — sent to ${recipient} (id: ${result.id || 'ok'})`);
    } catch (err) {
      failed++;
      failures.push({ firm: f.firm, error: err.message });
      console.error(`✗ [${i + 1}/${FIRMS.length}] ${f.firm} — FAILED: ${err.message}`);
    }

    if (i < FIRMS.length - 1) await sleep(PAUSE_MS);
  }

  console.log('');
  console.log(`=== DONE: ${sent} sent, ${failed} failed ===`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach(f => console.log(`  - ${f.firm}: ${f.error}`));
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
