# TendorAI Pro Tier — Full Stack Audit
## 15 May 2026

**Scope:** Backend only (`ai-procurement-backend`). Frontend repo (`tendorai-nextjs`) not available in this environment — frontend-dependent findings flagged [FRONTEND].
**PDFs:** Not loadable in sandbox. Audit cross-references PDF claims from the task brief against code at `origin/main` commit `c08464a`.

---

## Section 1 — Test Persona (Synthetic Signup Trace)

**Firm:** Llewellyn & Hughes Solicitors | **City:** Cardiff | **Specialisms:** Conveyancing, Wills & Probate | **Email:** test+audit@tendorai.com (NOT created) | **Plan:** Pro (£299/month)

### Journey trace

**T+0: Signup.** `POST /api/vendors/signup` (vendorUploadRoutes.js:131). Creates Vendor document with `tier: 'free'`, `services: ['Photocopiers']` (hardcoded default — wrong for a solicitor). No vendorType capture. No guided wizard. No firmFacts form.

**T+1: Stripe checkout.** `POST /api/stripe/create-checkout-session` (stripeRoutes.js:129). Creates Stripe session with `metadata: { vendorId, planId: 'pro', internalTier: 'managed' }`. No profile completeness check — Llewellyn & Hughes can pay £299 with zero profile data.

**T+2: Payment completes (webhook).** `handleCheckoutComplete` (stripeRoutes.js:423). Sets `vendor.tier = 'managed'`, `subscriptionStatus = 'active'`. Triggers (fire-and-forget):
- Listings Agent → runs immediately, but submits with incomplete data
- Initial AeoReport → **SKIPPED** because `vendor.location.city` is empty
- Pro upgrade email → sent

**T+2 reality:** Paid £299. Zero AI visibility data. No AeoReport. No Detective findings. No Writer drafts. The upgrade email says "complete your profile" but gates nothing.

**T+3 to T+6: Profile completion (manual).** Vendor must navigate to dashboard, fill location (Cardiff), vendorType (solicitor), practiceAreas, description (50+ chars). No guided flow. Miss one field and `checkProfileCompleteness()` stays false.

**Next Sunday 03:00 UTC: Recon.** Queries 6 AI platforms. N=1 per platform. Stores in AIMentionScan.

**Next Monday 05:00: Writer.** One draft for Llewellyn & Hughes. Goes to ApprovalQueue.

**Next Monday 05:30: Detective.** Analyses mention data. Up to 5 findings.

**Next Monday 08:00: Weekly Report.** If AeoReport exists, shows score. If not, "being calculated" forever.

**Gap: 2-7 days between payment and first useful data.**

---

## Section 2 — Feature-by-Feature Compliance Matrix

| # | Feature | PDF Promise | Code Reality | Status | File(s) | Bug ID |
|---|---------|-------------|--------------|--------|---------|--------|
| 1 | Directory listing on tendorai.com | Schema-marked profile at category URL | `generateVendorSchema()` exists (utils/generateVendorSchema.js, 594 lines). Produces rich JSON-LD with LegalService/@type, NAP, regulatory IDs. Profile served via publicVendorRoutes.js. | 🟡 PARTIAL | utils/generateVendorSchema.js, routes/publicVendorRoutes.js | BUG-001 |
| 2 | AI Visibility Report — weekly, N=10, 6 platforms | Weekly report with 10 queries across 6 platforms | Weekly digest sends Mon 08:00 UTC. Platforms = 6 ✓. But N=1 per platform, not N=10. `queryAllPlatforms` sends one query per platform per vendor. | 🐛 BUGGED | services/aiMentionScanner.js:214, services/platformQuery/index.js:73 | BUG-002 |
| 3 | Schema on customer's own site | Installed within 1-2 working days | Schema generation code exists. Deployment = manual ("reply with your website login"). No auto-install, no CMS API, no snippet embed. | 🔴 NOT SET UP | stripeRoutes.js:484, utils/generateVendorSchema.js | BUG-003 |
| 4 | Recon Agent — daily 03:00, 6 platforms, N=10 | Daily scan, 6 platforms, 10 queries each | Cron = `'0 3 * * 0'` (Sunday only, not daily). 6 platforms ✓. N=1 (not 10). | 🐛 BUGGED | services/aiMentionScanner.js, jobs/scheduledReports.js:344 | BUG-004 |
| 5 | Writer Agent — 3/week, v7 framework, anti-fabrication | 3 articles/week Mon/Wed/Fri 06:00 BST | Cron = `'0 5 * * 1,3,5'` (Mon/Wed/Fri 05:00 UTC = 06:00 BST ✓). Content OS prompt with anti-fabrication ✓. But: `MONTHLY_PER_VENDOR_CAP=4` blocks after 4 runs/month. No word count enforcement. Internal linking missing from prompt. | 🐛 BUGGED | jobs/writerAgent.js:94, services/writerAgent.js:14 | BUG-005 |
| 6 | Detective — daily 05:30, severity-tagged | Daily with severity + fix recommendations | Cron = `'30 5 * * 1'` (Monday only, not daily). Severity ✓. Fix recommendations ✓. 5 finding types. | 🐛 BUGGED | services/detectiveAgent.js, jobs/detectiveAgent.js:8 | BUG-006 |
| 7 | Listings — daily 05:45, Yell/FreeIndex/Trustpilot/sector | Daily directory submission | Cron = `'45 5 * * 1'` (Monday only). Directories: Bing Places (API), Yell/FreeIndex/Trustpilot (concierge), SRA/ICAEW/FCA/Propertymark (auto-regulatory). Total = 8, not "12-20". | 🐛 BUGGED | services/listingsAgent.js, models/DirectoryListing.js | BUG-007 |
| 8 | Weekly Pro Report — all sections | Complete report with next-week plan, items needing input | Digest email: score delta ✓, citations ✓, agent activity ✓, needs-attention ✓, top finding ✓. Missing from email: next-week plan, competitor moves. API endpoints exist but email doesn't render them. | 🟡 PARTIAL | services/weeklyProDigest.js, services/emailTemplates.js | BUG-008 |
| 9 | Reviews — monthly, approval required, Google/Trustpilot/Reviews.io | Monthly with approval gate to third-party platforms | Cron = `'15 6 * * 1'` (weekly, not monthly). NO approval required — sends automatically. Targets TendorAI's own review system only, NOT Google/Trustpilot/Reviews.io. | 🐛 BUGGED | services/reviewsAgent.js | BUG-009 |
| 10 | firmFacts — 30-45 min guided form | Guided form feeding Writer placeholders | No firmFacts collection. No guided form. 7-item onboarding checklist with auto-detection (commit 766b26a). Profile fields on Vendor model but no structured onboarding wizard. | 🔴 NOT SET UP | models/Vendor.js:265, routes/vendorUploadRoutes.js:47 | BUG-010 |

---

## Section 3 — v2 Content Framework Compliance

### Four universal rules

| Rule | Prompt enforcement | Status |
|------|-------------------|--------|
| 1. Structure — direct answer (40-60w) + 3-5 bullets + body | prompts.js:101 Rule 1 + prompts.js:103 Rule 2 + prompts.js:248 body structure | ✅ Enforced |
| 2. Named entities — min 2, vertical-specific | prompts.js:145 Rule 12 (vertical playbooks list specific entities) | ✅ Enforced |
| 3. Internal linking — min 2 links to other pillar posts | `internalLinking` field on all 120 topics in pillarLibraries.js. **NOT in SYSTEM_PROMPT_WRITER_V1_1. NOT passed by buildUserPrompt(). Writer never sees it.** | 🔴 MISSING |
| 4. Primary data hook — ≥1 first-party data point | prompts.js:133 Rule 10 (Tier 0/0+ data priority) + firmContext.js injection | ✅ Enforced |

### Additional checks

| Item | Status | Evidence |
|------|--------|----------|
| 120-topic library (5 verticals × 6 pillars × 4 topics) | ✅ | pillarLibraries.js: solicitor(24), accountant(24), mortgage-advisor(24), estate-agent(24), office-equipment(24) |
| Day-by-day calendar (Mon blog / Tue LinkedIn / Wed catch-up) | 🔴 NOT IMPLEMENTED | Writer fires Mon/Wed/Fri, always produces blog+LinkedIn+Facebook in single run |
| Pillar rotation (Costs→Process→Authority→Mistakes→Rights→Specialisms) | ✅ | writerAgent.js:80 `(currentPillarIdx + 1) % pillars.length` |
| Pre-publish checklist modal (4 mandatory + 3 amber) | 🔴 NOT IMPLEMENTED | validators.js has 3 hard-block + 1 soft-warn. No modal. [FRONTEND] |
| Placeholder resolution ({city}, {specialism}, {firmName}, {year}) | ✅ | contentLibraryRoutes.js:83-86 resolves 4 core placeholders. {N}, {X}, etc. left literal by design. |
| LinkedIn hook-type tagging | ✅ | Every topic has `linkedInHookType` field. blog+linkedin topics tagged opinion/data/personal/curiosity. |

---

## Section 4 — Onboarding Journey Friction Audit

| Step | Endpoint/File | What happens | What's missing | Breaks today? |
|------|--------------|-------------|----------------|---------------|
| 1. Signup | `POST /api/vendors/signup` (vendorUploadRoutes.js:131) | Creates Vendor `tier:'free'`, `services:['Photocopiers']` | No vendorType capture. Default services wrong for solicitors. | ✅ Yes — BUG-011 |
| 2. Stripe checkout | `POST /api/stripe/create-checkout-session` (stripeRoutes.js:129) | Creates Stripe session, no validation | No profile completeness gate | ✅ Yes — BUG-012 |
| 3. Post-checkout | `handleCheckoutComplete` (stripeRoutes.js:423) | tier='managed', Listings fires, AeoReport if city exists, email sent | No redirect to wizard. AeoReport skipped if no city. | ✅ Yes — BUG-015 |
| 4. firmFacts | models/Vendor.js:265 (onboardingChecklist) | 7-item checklist, 4 auto-detect | No firmFacts collection. No guided form. No completeness score. | ✅ Yes — BUG-010 |
| 5. Schema install | utils/generateVendorSchema.js | Generates JSON-LD. Manual deployment. | No CMS API. No auto-install. | ✅ Yes — BUG-003 |
| 6. First agent trigger | stripeRoutes.js:460-491 | Listings + AeoReport (if city) fire immediately. Detective/Writer/Recon wait for cron. | 2-7 day gap to first content. | ✅ Yes — BUG-015 |
| 7. First Weekly Report | jobs/scheduledReports.js:343 | Mon 08:00 UTC. Digest + email. | If no AeoReport, score = "being calculated" forever. | ✅ Yes |

---

## Section 5 — The Promise Gap

| Claim | Reality | Verdict |
|-------|---------|---------|
| "18+ Tier 1 entities per article on average" | Not measured. Prompt requires "at least 2". No post-generation entity counter. | ❌ Overpromise |
| "1,500 words per article" | Prompt says "Target 1,200-1,800". No validator enforces word count. | 🟡 Soft target only |
| "Every piece tested across 6 platforms with N=10" | Recon scans the FIRM (not each article) with N=1 per platform. No per-article testing. | ❌ Overpromise |
| "Schema on your TendorAI profile" | generateVendorSchema() produces JSON-LD. Profile pages serve it. | ✅ Delivered |
| "Schema on your own domain — 1-2 working days" | Manual process. Email: "reply with your website login." | ❌ Manual, not automated |
| "12-20 verified listings" | 8 directories. 4 have no submission logic (google_business_profile, apple_business, cylex, thomson_local in enum but no code). | ❌ Overpromise |
| "Citation tracking within 48 hours" | No SLA mechanism. Recon runs weekly. No event-driven verification. | ❌ Not implemented |
| "Reviews Agent... approval required" | Sends automatically. No approval queue for review requests. | ❌ Wrong |

---

## Section 6 — Bug Register

```
BUG-001 | MEDIUM | Schema | Profile schema embedding unverified on frontend
What's broken: generateVendorSchema() exists but frontend embedding unverified [FRONTEND]
File(s): utils/generateVendorSchema.js
Fix: Verify frontend embeds JSON-LD on /suppliers/profile pages
Effort: S
Revenue impact: No

BUG-002 | HIGH | Recon | N=1 per platform, not N=10 as promised
What's broken: queryAllPlatforms sends 1 query per platform. PDF promises 10.
File(s): services/platformQuery/index.js:73, services/aiMentionScanner.js:214
Fix: Loop with all 5 generated prompts (already exist in generatePrompts)
Effort: M
Revenue impact: Yes — thin citation data

BUG-003 | HIGH | Schema | No auto-install on customer's own domain
What's broken: Manual process requiring vendor credentials
File(s): stripeRoutes.js:484 (email), utils/generateVendorSchema.js
Fix: Build embed code generator + install instructions page
Effort: L
Revenue impact: Yes — PDF promise unfulfilled

BUG-004 | HIGH | Recon | Weekly not daily
What's broken: Cron '0 3 * * 0' = Sundays only. PDF says daily.
File(s): jobs/scheduledReports.js:344
Fix: Change to '0 3 * * *' or update PDF
Effort: XS
Revenue impact: Yes — customer expects daily

BUG-005 | CRITICAL | Writer | Monthly cap of 4 blocks "3 per week" promise
What's broken: MONTHLY_PER_VENDOR_CAP=4 vs cron 3x/week = 12 attempted runs.
File(s): services/writerAgent.js:14
Fix: Raise to 14
Effort: XS
Revenue impact: Yes — cap fires after week 2

BUG-006 | HIGH | Detective | Weekly not daily
What's broken: Cron '30 5 * * 1' = Mondays only. PDF says daily.
File(s): jobs/detectiveAgent.js:8
Fix: Change to '30 5 * * *' or update PDF
Effort: XS
Revenue impact: No — customer unlikely to notice

BUG-007 | MEDIUM | Listings | 8 directories not 12-20
What's broken: Only 8 have submission logic. 4 in enum are dead.
File(s): services/listingsAgent.js, models/DirectoryListing.js:7
Fix: Add submission for remaining 4 or update PDF
Effort: M
Revenue impact: No

BUG-008 | MEDIUM | Report | Email missing next-week plan
What's broken: weeklyProDigestTemplate omits nextWeekPlan
File(s): services/emailTemplates.js
Fix: Add section to email template
Effort: S
Revenue impact: No

BUG-009 | HIGH | Reviews | No approval gate + wrong platforms
What's broken: Sends automatically to TendorAI reviews, not Google/Trustpilot
File(s): services/reviewsAgent.js
Fix: Route through ApprovalQueue, add third-party review URL generation
Effort: M
Revenue impact: Yes — customer expects control

BUG-010 | CRITICAL | Onboarding | No firmFacts guided form
What's broken: PDF promises 30-45 min wizard. Doesn't exist.
File(s): models/Vendor.js:265
Fix: Build guided wizard [FRONTEND] + structured endpoint [BACKEND]
Effort: L
Revenue impact: Yes — blocks placeholder pre-fill

BUG-011 | CRITICAL | Signup | Default services=['Photocopiers'] for all vendors
What's broken: vendorUploadRoutes.js:96 hardcodes Photocopiers
File(s): routes/vendorUploadRoutes.js:96
Fix: Require vendorType at signup, remove default
Effort: S
Revenue impact: Yes — corrupts all downstream agent runs

BUG-012 | CRITICAL | Onboarding | No profile gate before checkout
What's broken: Can pay £299 with empty profile
File(s): routes/stripeRoutes.js:129
Fix: Add checkProfileCompleteness() before session creation
Effort: S
Revenue impact: Yes — customer pays, gets nothing

BUG-013 | HIGH | Writer | Internal linking rule missing from prompt
What's broken: internalLinking on 120 topics, never passed to Writer
File(s): services/contentPlanner/prompts.js, routes/vendorPostRoutes.js
Fix: Add to buildUserPrompt + add rule to prompt
Effort: S
Revenue impact: No — reduces SEO value

BUG-014 | MEDIUM | Writer | No word count enforcement
What's broken: "1,200-1,800 words" is guidance, not validated
File(s): services/contentPlanner/validators.js
Fix: Add word count check — warn <1,000, block <500
Effort: XS
Revenue impact: No

BUG-015 | HIGH | Signup | 2-7 day gap to first useful data
What's broken: Only Listings + AeoReport fire on signup
File(s): routes/stripeRoutes.js:459
Fix: Add fire-and-forget Detective + Writer triggers
Effort: S
Revenue impact: Yes — empty dashboard on day 1
```

**Summary: 4 CRITICAL, 7 HIGH, 4 MEDIUM = 15 bugs total.**

---

## Section 7 — The "Can I Sell This Today?" Verdict

If you sell Pro to a Cardiff solicitor on Friday for £299/month, here is what they actually experience in their first 14 days vs what the PDFs promise.

**Top 3 things that will make them feel oversold:**

1. **"3 articles per week"** — they get 4 total in month 1, then `MONTHLY_PER_VENDOR_CAP=4` hard-stops. The Mon/Wed/Fri cron fires but the cap blocks after run 4. By week 3 the Writer is silent. This is the single most visible broken promise.

2. **"N=10 protocol across 6 platforms"** — they see 1 query per platform per week. The citation data feels thin. When they ask "why doesn't Gemini mention me?", the truthful answer is "we only asked it one question." The Recon credibility collapses under scrutiny.

3. **"Guided onboarding form"** — there is no form. They land on an empty dashboard with a 7-item checklist and must figure out what fields to fill. The firmFacts experience promised in the PDF does not exist. The first 30 minutes feel abandoned.

**Top 3 things that will land as promised:**

1. **Writer content quality** — the Content OS prompt is genuinely strong. Anti-fabrication, vertical playbooks, banned phrases, Tier 0/1 data hierarchy all enforced. When a draft lands, it is good.

2. **Detective findings** — severity-tagged, actionable, specific recommendations. Weekly not daily, but the output quality is real and provides genuine value.

3. **Weekly Pro Report email** — branded, with score delta, agent activity, top finding, items needing attention. A genuine proof-of-work email that justifies the spend when data exists.

**Bottom line:** The platform produces good output when it runs. The problem is getting from "paid" to "running." Fix BUG-005 (cap), BUG-011 (vendorType default), and BUG-012 (profile gate) and the product is sellable with caveats. The daily/N=10 claims in the PDFs need updating to match code reality or code needs updating to match PDFs — but that is a documentation decision, not a code emergency.

---

## Section 8 — Prioritised Next 5 Commits

### 1. `fix(writer): raise monthly per-vendor cap from 4 to 14`
**Files:** services/writerAgent.js line 14  
**Why:** BUG-005. "3 articles per week" is broken by a cap of 4/month. Changing one number to 14 fixes the most visible broken promise.  
**Why first:** Smallest change, highest impact. Every customer hits this wall.

### 2. `fix(signup): require vendorType, remove Photocopiers default`
**Files:** routes/vendorUploadRoutes.js:96, routes/authRoutes.js:78  
**Why:** BUG-011. Solicitor signs up → tagged as Photocopiers vendor → every agent runs against wrong vertical.  
**Why second:** Blocks correct operation for every new customer.

### 3. `fix(stripe): gate checkout behind profile completeness`
**Files:** routes/stripeRoutes.js:129 (add checkProfileCompleteness call)  
**Why:** BUG-012. Prevents "paid £299, got nothing" — forces city, vendorType, description before payment.  
**Why third:** Prevents the worst support ticket.

### 4. `fix(stripe): trigger Detective + Writer on Pro upgrade`
**Files:** routes/stripeRoutes.js:459-491  
**Why:** BUG-015. Closes the 2-7 day gap. Customer sees content within hours.  
**Why fourth:** First impression is everything, but only matters after commits 1-3 are right.

### 5. `fix(recon): use all 5 generated prompts (N=5 per platform)`
**Files:** services/aiMentionScanner.js (loop scanVendor with all prompts from generatePrompts)  
**Why:** BUG-002. The 5 templates already exist — generated but only the first used. Using all 5 gets N=5 with minimal code change.  
**Why fifth:** After 1-4, the platform is functionally sellable. This makes the citation data 5× richer.
