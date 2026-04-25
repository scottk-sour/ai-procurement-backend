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

---

## Item 4 — 90-day guarantee infrastructure

**Verdict:** PARTIAL

**Evidence:**

*What exists:*
- `models/VendorScoreHistory.js` — full schema for weekly score snapshots: `vendorId`, `score` (Number, required), `breakdown` sub-doc with seven component scores (`profile`, `products`, `reviews`, `aiMentions`, `engagement`, `tier`, `verified`), `weekStarting` (Date, required), timestamps. Indexes on `{vendorId: 1, weekStarting: -1}` and `{weekStarting: -1}` — built for "give me this vendor's score over time" queries.
- `services/aiMentionScanner.js:331-388` — `saveScoreHistory(vendor, weekStarting)` is called from inside the weekly scan loop (line 472). Uses `findOneAndUpdate` keyed on `{vendorId, weekStarting}` so re-runs of the same week upsert rather than duplicate. Computes the breakdown live each Sunday.
- `routes/visibilityRoutes.js` reads from `VendorScoreHistory` (only consumer outside the scanner).
- `routes/stripeRoutes.js:404` — `case 'charge.refunded':` Stripe webhook branch.
- `routes/stripeRoutes.js:668-732` — `handleChargeRefunded(charge)` reacts to a Stripe refund: downgrades the vendor to `free` tier, sets `subscriptionStatus: 'cancelled'`, appends a system note with the charge id and amount, logs an admin-action log line, and emails a refund confirmation to the vendor.
- `routes/stripeRoutes.js:494, 503` — welcome email body and SMS-style text variant both quote the 90-day guarantee promise verbatim ("90-day guarantee — score improves or full refund").

*What is missing:*
- No baseline-score field. No `baselineScore`, `scoreAtInstall`, or `installScore` anywhere in `models/`.
- No install-date marker on Vendor. Schema-install completion lives on `SchemaInstallRequest.completedAt`, but no Vendor field captures "your guarantee window started on X".
- No 90-day window query. `grep -r "baseline" "90.day" "scoreAtInstall"` across `routes/`, `services/`, `models/` returns zero matches outside the welcome-email copy, the Stripe handler comments, and an unrelated "last 90 days" rule in the content-planner library.
- No refund-eligibility decision code. Nothing reads `VendorScoreHistory`, compares against a baseline, applies the "improved by ≥10 points within 90 days from install" rule, and either flags or auto-refunds.
- No refund-initiation code. `handleChargeRefunded` is webhook-only — it processes a refund that has *already happened* in Stripe. To issue the refund, an operator clicks a button in the Stripe dashboard.

**Assessment:** The first two ingredients of a 90-day guarantee — measuring score over time, and reacting to a refund event — are real and live. Everything in between (baseline capture at install, install-date marker on Vendor, automated 90-day-window comparison, refund-eligibility decision, refund initiation) is missing. In practice this means the guarantee is enforced by a human reading the dashboard and making a judgment call, then issuing the refund manually in Stripe; the backend webhook only handles the bookkeeping after the fact. The promise text exists in the welcome email copy. The machinery to back it up at scale does not.

**Gap (PARTIAL → LIVE):** To call this LIVE, four pieces are needed:
1. A `baselineScore` field (and `baselineCapturedAt` date) on Vendor, written when `SchemaInstallRequest.status` flips to `completed`.
2. A scheduled job (or on-demand admin endpoint) that, for every Pro vendor whose `baselineCapturedAt` is between 80 and 90 days old, computes the latest `VendorScoreHistory.score` and the delta against baseline.
3. A flag or admin queue listing vendors whose 90-day delta is < 10 points so an operator can see them without inferring it themselves.
4. Optionally: an automated Stripe `refunds.create` call when the rule fires, gated behind manual approval. (Manual remains a defensible choice — the auto-decision step is what's missing.)

---

## Item 5 — Competitor comparison

**Verdict:** LIVE

**Evidence:**
- `models/AIMentionScan.js:20` — `competitorsMentioned: [String]` on every scan row. One row per `(vendor, prompt, platform)`, so competitors are captured **per query, per platform, per scan**.
- `services/platformQuery/prompt.js:260-310` — `parsePlatformResponse(...)` extraction logic builds a `competitors` array (line 260: `const competitors = [];`) by walking the AI response and collecting up to 10 named firms per response (line 335: `competitors: competitors.slice(0, 10)`). Three fallback passes — first cited-by-reason, then plain mentions, then last-resort scan — so a competitor mentioned anywhere in the response gets captured.
- `services/platformQuery/index.js:59, 97, 116` — error / timeout / no-key fallback branches all default `competitors: []` so the field is always present in the result shape.
- Persistence: every `AIMentionScan` insert in `services/aiMentionScanner.js` carries the parsed `competitorsMentioned[]` array; the field is indexed indirectly via the per-vendor / per-platform indexes on `models/AIMentionScan.js:30-33`.
- API: `routes/aiMentionRoutes.js:158-316` — `GET /api/ai-mentions/competitors`. Two branches:
  - Free tier (lines 179-226): aggregate counts only — total competitor count and the top three competitor mention-counts, no names.
  - Paid tier (lines 237-313): full per-competitor list with names. Lines 280-296 build `topCompetitors` by querying `Vendor.find({_id: {$in: competitorIds}})` to enrich competitor entries with company names where the competitor is itself a TendorAI vendor; external firms (not TendorAI vendors) appear as raw strings from `competitorsMentioned[]`.
- Per-query history: `routes/aiMentionRoutes.js:89` — the per-vendor mentions list endpoint already selects `competitorsMentioned` alongside `prompt` and `platform`, so the dashboard can show "for this query on this platform, these competitors were cited".

**Assessment:** Competitor capture is real, comprehensive, and end-to-end. Every weekly scan and every live AI search test (Item 6) populates `competitorsMentioned[]` on the scan row. The parser uses the deterministic name-matching layer from `services/platformQuery/nameMatch.js` (the work that fixed the "firm cited as its own competitor" bug), so suffix variations like `Ltd` / `Limited` and URL-only citations don't fall through. Free-tier vendors see counts to motivate an upgrade; paid-tier vendors see names. Where a competitor is itself a registered TendorAI vendor the response includes resolvable identity; external firms appear as strings. One narrow caveat against the sales sheet wording: "see who AI recommends instead" reads as substitutive ("who got recommended *in your place*"), but the captured competitor list includes any firm named in the AI response, not just firms recommended ahead of the vendor. In practice this is what a dashboard wants — broader coverage, not narrower — but worth knowing.

---

## Item 6 — Live AI Search Test

**Verdict:** PARTIAL

**Evidence:**
- `routes/aiSearchTestRoutes.js` (299 lines) — single router, two endpoints:
  - `POST /` (line 151) — vendor submits a query, server runs it, returns parsed response.
  - `GET /history` (line 259) — vendor's past live tests.
- `routes/aiSearchTestRoutes.js:14-19` — tier-aware limits enforced via `checkUsageLimits(vendorId, tier)`:
  - Free: `FREE_LIMIT = 3` total tests ever (lifetime cap).
  - Starter / basic / visible / verified: `STARTER_MONTHLY_LIMIT = 10` per calendar month, counted via `AIMentionScan.countDocuments({vendorId, source: 'live_test', scanDate: {$gte: startOfMonth}})` (lines 44-48).
  - Pro / managed / enterprise: unlimited (returns `unlimited: true`, `remaining: 999`).
- `routes/aiSearchTestRoutes.js:189-200` — the actual AI call:
  ```js
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: '...recommend UK suppliers/service providers...',
    messages: [{ role: 'user', content: query.trim() }],
  });
  ```
  — single model, single API.
- `routes/aiSearchTestRoutes.js:215-226` — result is parsed via `parseAIResponse(aiResponse, vendor.company)` (extracting `vendorFound`, `vendorPosition`, `competitorsInResponse`) and persisted as an `AIMentionScan` row with `source: 'live_test'` and `aiModel: 'claude-haiku'`. Same model the weekly scan stores into, just tagged differently.
- The 6-platform fan-out helper `queryAllPlatforms(...)` from `services/platformQuery/index.js:73` (the one used by the weekly scan in Item 1) is **not** imported into `routes/aiSearchTestRoutes.js`. The live-test endpoint does not fan out to multiple platforms.
- No admin / debug variant. There's only the vendor-facing endpoint.

**Assessment:** The endpoint is real. It accepts a query, runs it, parses for the vendor's company name, identifies competitors, persists, and returns. Tier-aware rate limiting works (lifetime cap for free, monthly for starter, unlimited for pro). Results coexist with the weekly scan rows in `ai_mention_scans` and are distinguishable via `source: 'live_test'`. But it queries **only Claude Haiku via the Anthropic SDK** — a single model on a single platform — while the sales sheet's "run real-time queries against AI platforms" (plural) implies the same six-platform fan-out the weekly scan uses. The multi-platform infrastructure already exists in the codebase (`services/platformQuery/index.js`); it's just not wired into this endpoint. The live test answers "would *this* model recommend you?" — useful, but narrower than the copy implies.

**Gap (PARTIAL → LIVE):** Replace the inline Anthropic-only call (lines 189-200) with `queryAllPlatforms({ companyName, category, city, categoryLabel })` from `services/platformQuery/index.js`, persist one `AIMentionScan` row per platform (mirroring how the weekly scan stores results), and surface a per-platform breakdown in the response. Tier-aware limits would then need to count platforms-tested rather than queries-issued, since a single live test would create up to six rows. No new infrastructure required — this is a wiring change in one route file.
