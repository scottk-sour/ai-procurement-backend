# Feature Audit — 25 April 2026

Read-only audit. No code changed. Verdicts based on inspection of `models/`, `routes/`, `services/`, `jobs/`, and `scripts/` against the seven sales-sheet claims.

---

## Item 1 — Weekly AI scans across 6 platforms

**Verdict:** LIVE

**Evidence:**
- `jobs/scheduledReports.js:1` — `import cron from 'node-cron';`
- `jobs/scheduledReports.js:310` — `cron.schedule('0 3 * * 0', ...)` fires every Sunday 03:00 UTC, calls `runWeeklyMentionScan()` (line 313).
- `index.js:1444` — server startup: `import('./jobs/scheduledReports.js').then(m => m.startScheduledReports())` — confirms the cron is actually registered when the server boots.
- `services/aiMentionScanner.js:391` — `export async function runWeeklyMentionScan()` body iterates every paid vendor (lines 401-413 query `Vendor.find({ tier: { $in: PAID_TIERS }, ... })`).
- `services/platformQuery/index.js:14-21` — six platform entries with their query functions and env-key gates: `perplexity`, `chatgpt`, `claude`, `gemini`, `grok`, `meta` (Meta routed via the GROQ API key).
- Per-platform implementations: `services/platformQuery/{chatgpt,claude,gemini,grok,meta,perplexity}.js`.
- `models/AIMentionScan.js` — every scan row stored: `platform` enum includes all six (`chatgpt | perplexity | claude | gemini | grok | metaai`), plus `prompt`, `mentioned`, `position`, `competitorsMentioned[]`, `responseSnippet`, `source: 'weekly_scan' | 'live_test'`.
- `services/aiMentionScanner.js:331` — `saveScoreHistory()` writes a weekly snapshot to `VendorScoreHistory` after each vendor's scan.

**Assessment:** Fully wired end-to-end. A real `node-cron` schedule fires weekly, iterates every paid vendor, fans out to all six platform query functions in parallel, parses each response, persists results to `AIMentionScan`, and writes a weekly score snapshot to `VendorScoreHistory`. The collection name (`ai_mention_scans`) and indexes confirm it's been engineered for query patterns the dashboard would use. One operational caveat: `services/platformQuery/index.js:73-76` filters platforms by `process.env[envKey]` — if any of the six API keys are unset on Render, that platform silently drops out of the scan. The code path is real for all six; coverage in production depends on env config.

---

## Item 2 — Email alerts when AI recommends you

**Verdict:** LIVE

**Evidence:**
- `services/aiMentionScanner.js:115-157` — `sendMentionAlert(vendor, platformKey, query, mentionCount, totalPlatforms)` builds the email (subject, HTML, plain text) and sends via `sendEmail`.
- `services/aiMentionScanner.js:455-468` — call site inside the weekly scan loop: when a Pro-tier vendor has at least one mention in the cycle's records and hasn't been notified yet (`!vendorsNotified.has(vendorKey)`), the alert fires for the first platform that mentioned them. `alertsSent++` counter feeds the cycle summary.
- Pro-tier gate: `PRO_ALERT_TIERS = ['pro', 'managed', 'enterprise']` (line 396) plus the equivalent legacy `account.tier` set.
- `services/emailService.js:1` — `import { Resend } from 'resend';`. Email backend is **Resend**.
- `services/emailService.js:37` — `sendEmail({to, subject, html, text, from, reply_to})` — single shared sender used across the codebase.
- `services/emailService.js:43-46` — graceful degradation: when `RESEND_API_KEY` is missing the email is logged but not sent, returning `{success: true, simulated: true}`.
- "Already-emailed" filter: `vendorsNotified` Set tracked across each scan cycle (line 432, 458-459) — at most one alert per vendor per scan cycle.

**Assessment:** Real email infrastructure (Resend), real call site inside the live scan loop, real Pro-tier gating. The mention-alert email is hand-built inline in `aiMentionScanner.js` rather than living in `services/emailTemplates.js` — minor inconsistency with the rest of the codebase but functionally fine. One caveat worth flagging against the sales sheet wording: the copy implies *one alert per platform that recommends you*, but the implementation emits **one alert per scan cycle** and names the first platform that cited the vendor (line 460-465). If a vendor is cited by ChatGPT, Perplexity, and Claude in the same Sunday scan, they get one email naming whichever platform was processed first, with a visibility-score summary across the others. Cross-week deduplication is **not** in place — a vendor cited every week gets one email every week. That's a reasonable design but it doesn't match the literal sales-sheet phrasing of "alert when any AI platform recommends you" if read as per-platform.

---

## Item 3 — Schema installed on website

**Verdict:** LIVE

**Evidence:**
- `utils/generateVendorSchema.js:419` — `export function generateVendorSchema(vendor, products, reviews)` (594-line module). Maps `vendorType` → schema.org `@type` (LegalService, AccountingService, FinancialService, RealEstateAgent), produces full JSON-LD with PostalAddress, GeoCoordinates, AggregateRating, Review, EducationalOccupationalCredential, OpeningHoursSpecification, OfferCatalog, Brand, CommunicateAction.
- `routes/schemaRoutes.js` — multiple delivery formats:
  - `GET /:id.json` (line 159) — raw JSON-LD with `Content-Type: application/ld+json` (line 177).
  - `GET /:id.js` (line 113) — self-injecting script that adds JSON-LD + badge to a vendor's page.
  - `GET /:id.badge.js` (line 67) — badge-only fallback for starter/verified tiers.
  - `GET /:vendorId/export` (line 191) — vendor-authed export for download.
  - `GET /:vendorId/validate` (line 216) — vendor-authed validator.
  - `POST /install-request` (line 348) — vendor submits CMS credentials and notes for done-for-you install.
  - `GET /install-request/latest` (line 397) — vendor checks current request status.
- `models/SchemaInstallRequest.js` — full request lifecycle model with `status` enum `['pending', 'in_progress', 'completed', 'failed']`, `cmsPlatform` enum, encrypted `cmsUsername` / `cmsPassword` (AES-256-CBC via `SCHEMA_ENCRYPT_KEY` env), `adminNotes`, `completedAt`, `completedBy`. Pre-save hook auto-encrypts credentials (line 56-66).
- `routes/adminRoutes.js:879-977` — admin flow: `GET /api/admin/schema-requests` (list/filter), `PATCH /api/admin/schema-requests/:id` (status transitions), `GET /api/admin/schema-requests/:id/credentials` (decrypt for the install operator).
- `services/emailService.js:416` — `sendSchemaInstallAdminNotification({vendorName, vendorEmail, websiteUrl, cmsPlatform})` fires on request submission.
- `services/emailService.js:439` — `sendSchemaInstallCompleteNotification(vendorEmail, {vendorName, websiteUrl})` fires on completion.

**Assessment:** Every link in the workflow is real: vendor submits credentials → admin gets notified → admin uses the decrypt endpoint to fetch credentials → admin manually installs the snippet on the vendor's CMS → admin marks the request `completed` → vendor gets a completion email. Generation, delivery, request tracking, admin tooling, and the bookend emails are all implemented. The "done-for-you installation" promise is honoured by an admin doing the actual work (with stored encrypted credentials), not by automation — that matches the "done-for-you" framing. The "within 48 hours" promise is an operational SLA, not a code-level guarantee; nothing monitors the request age and escalates. One mismatch worth flagging: the new `onboardingChecklist.schemaCallScheduled` field on Vendor (added in PR #37) is vendor-tickable and tracks whether the vendor has scheduled a call, not whether the install completed. There is no auto-flag on Vendor that flips when `SchemaInstallRequest.status` becomes `completed` — the install-completion state lives only on the SchemaInstallRequest collection. The frontend would need to query that separately to render an accurate "schema installed" tick on the getting-started checklist. Not a vapor — the install record exists — but the bridge between the install-tracking system and the onboarding-checklist system is missing.
