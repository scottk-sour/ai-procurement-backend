# TendorAI Platform Audit — 8 May 2026

0 paying customers. Cold Batch 001 (18 firms) sent today.
Everything below is measured against one question: **can a solicitor who receives that email end up paying £299/month?**

---

## 1. What TendorAI Actually Is

TendorAI is a B2B SaaS platform that tells UK regulated-services firms (solicitors, accountants, mortgage advisors, estate agents) whether AI assistants recommend them, and sells a £299/month subscription to fix their visibility.

**Backend:** Express 4 on Node 22, MongoDB Atlas via Mongoose 8, deployed to Render from `main`. 1,502-line monolith `index.js` mounting 35 route files over 52 endpoints. 38 Mongoose models.

**Frontend:** Next.js on Vercel (separate repo, not auditable here).

**Core loop:**
1. Bulk-import firms from regulator registers (SRA, ICAEW, FCA, Propertymark) → unclaimed profiles with placeholder emails.
2. Generate free AEO Report per firm (LLM-scored, queries 6 AI platforms).
3. Cold-email the firm: "You scored X/100. Claim your profile."
4. Firm claims profile (free) → sees dashboard → upgrades to Pro (£299/month Stripe checkout).
5. Pro unlocks 6 weekly agents: Reconnaissance (AI mention scan), Detective (competitor analysis), Writer (blog content), Listings (directory submissions), Reviews (automated review requests), Reporter (weekly summary email).

**Revenue model:** Single price point — £299/month ("Pro/Managed" tier). A £99/month Starter tier exists in Stripe config but delivers very little beyond free.

**Current state of the funnel:**
- ~250+ solicitor profiles imported from SRA register
- 18 cold emails sent (Batch 001, Cardiff + Birmingham)
- 0 claimed profiles from cold outreach
- 0 paying customers
- All 6 agents built and cron-scheduled
- Stripe checkout, webhook, and billing portal wired

---

## 2. What Works (Verified End-to-End)

### Stripe Checkout → Pro Upgrade ✅
`POST /api/stripe/create-checkout-session` creates a Stripe session with `internalTier: 'managed'` in metadata. Webhook handler at `handleCheckoutComplete` (stripeRoutes.js:423) reads metadata, sets `vendor.tier = 'managed'`, triggers Listings Agent fire-and-forget, sends confirmation email. Customer portal for cancellation wired. Refund handler downgrades to free.

**Proof:** Metadata is set at checkout creation (line 210), read back on webhook (line 426), assigned at line 441. Fallback logic only fires if metadata is missing — normal flow is correct.

### Vendor Claim Flow ✅
`POST /upload/claim` (vendorUploadRoutes.js:1076). Validates unclaimed status, sets password, flips `listingStatus` to `'claimed'`, notifies admin via email, sends confirmation to claimer. The "Claiming is free and takes 2 minutes" promise in cold emails is accurate.

### AEO Report Generation (System 2) ✅
`POST /api/public/aeo-report` — no auth required. Queries 6 AI platforms, generates HTML report + PDF, emails link. Rate-limited per email+company combo. Deduplicates existing reports. Public viewing at `GET /api/public/aeo-report/:reportId`.

### AEO Audit (System 1) ✅
`POST /api/aeo-audit` — fetches vendor's actual website, runs HTML signal analysis, detects blog presence. Free tier: 1 audit ever. Pro: 1 per 7 days. Saves to AeoAudit collection.

### AI Mention Scanning ✅
`runWeeklyMentionScan()` fires Sunday 03:00 UTC via cron. Queries ChatGPT, Perplexity, Claude, Gemini, Grok, Meta AI for all Pro vendors. Stores results in AIMentionScan. Sends email alerts on mentions.

### All 6 Agent Crons ✅
All registered in `jobs/scheduledReports.js:380-398`. Writer (Monday 05:00), Detective (05:30), Listings (05:45), Reviews (06:15). Each has a `registerXxxAgentCron()` export. Gated behind `ENABLE_CRON=true`.

### Email Service ✅
15 email templates via Resend API in `services/emailService.js`. Covers: welcome, password reset, lead notifications, review requests, AEO reports, quote notifications, schema install notifications, Pro upgrade confirmation, payment failure alerts.

### Cold Outreach Pipeline ✅
`scripts/batch-generate-cold-reports.js` → generates reports. `scripts/send-cold-batch-001.js` → sends 18 hardcoded emails. `scripts/send-cold-daily.js` → data-driven daily sender with dedup via `cold_outreach_log`. `scripts/pull-batch-002.js` → CSV export for next batch.

### Approval Queue System ✅
`models/ApprovalQueue.js` — generic queue for all agent output needing human review. Writer Agent creates drafts with `status: 'pending'`. Admin approves → execution handler creates VendorPost with `status: 'draft'` (not auto-published). IndexNow ping on approval. No auto-publish vulnerability.

---

## 3. What Doesn't Work

### BUG-01: Dual `tier` fields on Vendor model — SEVERITY: HIGH
`models/Vendor.js` has two separate tier fields:
- `account.tier` (line 250): enum `['bronze','silver','gold','platinum','standard']`, default `'standard'`
- `tier` (line 300): enum `['free','starter','pro','basic','managed','enterprise','listed','visible','verified']`, default `'free'`

Stripe webhook sets both (`vendor.tier = 'managed'`, `vendor.account.tier = 'gold'`). But agents only check `vendor.tier`. If any legacy code reads `account.tier` to gate features, it will use a completely different enum. The scheduled report emailer (`jobs/scheduledReports.js`) references `PRO_ACCOUNT_TIERS = ['gold','platinum','pro','verified']` — mixing both tier systems in one query.

**Fix time:** 2 hours. Deprecate `account.tier`, migrate all reads to `vendor.tier`.

### BUG-02: Analytics routes shadow each other — SEVERITY: MEDIUM
`index.js:311` mounts `analyticsRoutes` on `/api/analytics`. Line 315 mounts `vendorAnalyticsRoutes` on the same path. Express processes both, but if either defines the same sub-path, the first wins and the second is unreachable.

**Fix time:** 30 minutes. Mount vendor analytics on `/api/vendor/analytics`.

### BUG-03: No onboarding email sequence — SEVERITY: HIGH (revenue)
After signup or claim, vendor gets exactly one welcome email. No Day 3 profile-completion nudge, no Day 7 "here's what Pro unlocks," no Day 14 upsell. The vendor sees their dashboard once and forgets about TendorAI.

**Fix time:** 4 hours for a 3-email drip. Needs a `lastEmailSent` field and a daily cron.

### BUG-04: ColdOutreachLog model defined inline, not in /models — SEVERITY: LOW
`scripts/send-cold-daily.js:31-42` defines the schema inline with `mongoose.models.ColdOutreachLog || mongoose.model(...)`. Works but fragile — if another file ever references this collection, schema conflicts are possible.

**Fix time:** 15 minutes. Move to `models/ColdOutreachLog.js`.

### BUG-05: `ADMIN_JWT_SECRET` required at startup but never used — SEVERITY: LOW
`config/env.js` lists it as required. No code references it. Devs must set a dummy value to start the app.

**Fix time:** 5 minutes. Remove from required list.

### BUG-06: AEO report score can be null — SEVERITY: MEDIUM
`services/aeoReportGenerator.js` — if both the AI scorer and detector fail, `legacyScore` remains `null`. The cold outreach script (`send-cold-daily.js:84`) filters `score: { $ne: null }`, so these don't get emailed. But the report exists in the DB with no score, and the PDF may render broken.

**Fix time:** 1 hour. Default score to 0 if both scorers fail, or mark report as `status: 'failed'`.

### BUG-07: matrixRoutes defined but never mounted — SEVERITY: LOW
`routes/matrixRoutes.js` exists with functional endpoints but is not mounted in `index.js`. The matrix upload feature is unreachable.

**Fix time:** 10 minutes if intentional, or 1 line to mount.

### BUG-08: No public pricing/feature comparison endpoint — SEVERITY: HIGH (revenue)
`GET /api/stripe/plans` returns plan names and prices but no feature breakdown. A free-tier vendor has no API-served way to see what Pro delivers before clicking "Upgrade." The frontend must hardcode features or guess.

**Fix time:** 2 hours. Add a `/api/stripe/plans-detailed` endpoint with feature matrix.

---

## 4. What to Improve (Ranked by Revenue Impact)

### 1. Build a post-claim → Pro upsell email sequence
**Impact:** Direct conversion. Every claimed vendor should get 3 emails over 14 days showing their score, what competitors are doing, and what Pro fixes. This is the single cheapest lever to turn claims into revenue.
**Effort:** 4 hours.

### 2. Add "Claim & Upgrade" CTA to public AEO report page
**Impact:** The cold email links to the report. The report page currently shows the score but has no clear path to claiming or upgrading. The frontend needs a prominent "This is your firm — claim it free" button, and the backend needs a `POST /api/public/aeo-report/:reportId/claim` endpoint that pre-fills vendor data from the report.
**Effort:** 3 hours backend, frontend is separate repo.

### 3. Unify the tier system
**Impact:** Prevents silent tier mismatches that could block a paying customer's agents from running. One field, one enum, one truth.
**Effort:** 2 hours + migration script.

### 4. Add a "Pro Preview" to the free dashboard
**Impact:** Show free vendors a locked sample of what the Detective, Writer, and Reconnaissance agents produce. "Here's what you'd see this week if you were on Pro." Creates desire.
**Effort:** 3 hours for mock data endpoint, frontend work separate.

### 5. Send a weekly "state of your AI visibility" email to free vendors
**Impact:** Keeps TendorAI in the vendor's inbox even before they pay. Score + 1 competitor insight + CTA. Uses existing AEO report data — no new scanning needed.
**Effort:** 3 hours. Cron + email template.

### 6. Add Stripe trial (14-day free Pro)
**Impact:** Removes the £299 objection. Vendor experiences agents for 2 weeks, then converts or downgrades. Stripe supports trials natively.
**Effort:** 1 hour backend (add `trial_period_days: 14` to checkout session), frontend separate.

### 7. Track cold email → claim → upgrade attribution
**Impact:** You can't optimise what you don't measure. Add UTM params to cold email links, store `acquisitionSource` on Vendor, track funnel in a simple `events` collection.
**Effort:** 3 hours.

### 8. Fix the "what does Pro actually do" page
**Impact:** When a solicitor asks "what do I get for £299/month?" the answer must be instant and clear. Backend should serve a structured features endpoint; frontend renders a comparison table.
**Effort:** 2 hours backend.

### 9. Add SMS/WhatsApp notification option for leads
**Impact:** Solicitors live on their phones, not email. A lead notification via SMS gets opened in seconds vs hours. Twilio integration is straightforward.
**Effort:** 4 hours.

### 10. Expose agent run results in a weekly digest email
**Impact:** Pro vendors need to *feel* the value every Monday. "This week: 2 new blog drafts, 3 directory submissions, competitor X overtook you on Perplexity." The data already exists in AgentRun artifacts — just needs a template.
**Effort:** 3 hours (Reporter agent partially does this, wire it to email).

---

## 5. What TendorAI Should Act Like (But Doesn't)

### It should act like a personal AI visibility consultant, not a dashboard.
Right now TendorAI is passive. A vendor signs up, logs into a dashboard, and sees... data. The platform should be opinionated and pushy. "Your competitor Harrison & Co just appeared on Perplexity for 'conveyancing solicitor Cardiff.' Here's what they did differently. Click here to fix it." The Detective agent produces these insights but they sit in AgentRun artifacts. They need to land in the vendor's inbox and push them toward action.

### It should act like it's already working for you before you pay.
The cold email says "you scored 35/100" — that's a great hook. But after the vendor clicks through, they see a static report and nothing else. TendorAI should feel like it's already running in the background: "We noticed your Google Business Profile is missing structured data. We noticed ChatGPT doesn't mention you for family law in Birmingham. Here's what we'd fix this week." The reconnaissance data is already being generated for cold outreach — surface it as a "free preview" on the claimed profile.

### It should act like a weekly retainer, not a monthly subscription.
£299/month feels abstract. "Every Monday we run 6 agents for your firm" is concrete. The Monday morning email should feel like a weekly report from a marketing agency: here's what we did, here's what changed, here's what to do next. The Reporter agent and AgentRun system have the data — it just needs to be packaged as a human-readable email that justifies the spend every single week.

### It should act like an urgency machine.
Competitors are the best motivator. "3 firms in Cardiff scored higher than you this week. One of them just claimed their profile." The data for this exists in AeoReport and AIMentionScan. No new scanning needed — just a comparison query and an email trigger. Free vendors should get this too (it's the upsell hook).

### It should act like the signup process is 60 seconds, not 6 clicks.
The cold email links to the report. The report should have a "Claim This Profile" button. Clicking it should pre-fill everything from SRA data. One password field. Done. Claimed. Then immediately: "Want us to start fixing this? Start your free 14-day trial." Two decisions, one minute, zero friction.

---

## Single highest-leverage action this weekend: Build a 3-email post-claim drip sequence (Day 1: "Your profile is live — here's your score vs competitors." Day 7: "Here's what Pro vendors in your city got this week." Day 14: "Start your free 14-day Pro trial.") — it costs 4 hours and converts every future claim into a trial, which is the only thing between you and revenue.
