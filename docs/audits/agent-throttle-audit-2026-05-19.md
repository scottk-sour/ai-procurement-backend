# Agent Throttle Audit — 19 May 2026

Investigating whether Detective, Listings, Reviews, and Recon agents have the same stale weekly throttle bug fixed in the Writer Agent (PR #67).

## Summary table

| Agent | Cron schedule | Cron frequency | Has throttle? | Throttle window | Uses findOrCreateRun? | Run creation | Verdict |
|-------|---------------|----------------|---------------|-----------------|----------------------|--------------|---------|
| Writer | `0 5 * * 1,3,5` | Mon/Wed/Fri | ✅ Yes (per-day) | Same UTC day | ❌ No (fixed PR #67) | `new AgentRun()` | ✅ Fixed PR #67 |
| Detective | `30 5 * * 1` | Monday only | ❌ None | N/A | ❌ No | `AgentRun.create()` | ✅ No bug |
| Listings | `45 5 * * 1` | Monday only | ❌ None | N/A | ❌ No | `AgentRun.create()` | ✅ No bug |
| Reviews | `15 6 * * 1` | Monday only | ❌ None | N/A | ❌ No | `AgentRun.create()` | ✅ No bug |
| Recon | `0 3 * * 0` | Sunday only | ❌ None | N/A | ❌ No | `AgentRun.create()` | ✅ No bug |
| Reporter | `0 8 * * 1` | Monday only | ✅ Yes (idempotency) | Same vendor+week | ❌ No | `WeeklyReport.create()` | ✅ Correct |

## Key finding

**None of the other agents have the throttle bug.** The Writer Agent was the only one affected because it was the only agent with a multi-day cron schedule (Mon/Wed/Fri) combined with a weekly throttle.

Detective, Listings, Reviews, and Recon all:
1. Run on a single day per week (Monday or Sunday)
2. Use `AgentRun.create()` directly — not `findOrCreateRun`
3. Have NO throttle/dedup check at all — they simply create a new AgentRun on every invocation

This means if any of these agents' cron schedules are bumped to daily in the future (as the PDFs promise), they would NOT have the throttle bug because they don't throttle. However, they would create duplicate runs if the cron fired twice on the same day (no safety net). This is a low-priority concern — cron double-fires are rare on Render.

---

## Detective Agent

- **File:** `services/detectiveAgent.js`
- **Cron:** `jobs/detectiveAgent.js:8` → `'30 5 * * 1'` (Monday 05:30 UTC)
- **Throttle:** None. No `findOrCreateRun`, no `AgentRun.findOne` dedup check.
- **Run creation:** `AgentRun.create()` directly at lines 19, 32, and 189.

```javascript
// services/detectiveAgent.js:11-25
export async function runDetectiveForVendor(vendorId) {
  const startedAt = new Date();
  const weekStart = AgentRun.normaliseWeekStarting(new Date());

  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  if (!PRO_TIERS.has(vendor.tier)) {
    return AgentRun.create({
      vendorId, agentName: 'detective', weekStarting: weekStart,
      status: 'failed', ...
    });
  }
  // No throttle check — proceeds directly to analysis
```

- **Verdict:** ✅ No bug. Weekly cron + no throttle = runs once per week correctly. If schedule changes to daily, would need a per-day throttle added.

---

## Listings Agent

- **File:** `services/listingsAgent.js`
- **Cron:** `jobs/listingsAgent.js:8` → `'45 5 * * 1'` (Monday 05:45 UTC)
- **Throttle:** None. No dedup check.
- **Run creation:** `AgentRun.create()` directly at lines 35, 45, 55, and 140.
- **Additional safety:** Per-directory dedup via `DirectoryListing.findOne({ vendorId, directory })` at line 71 — if already live/submitted/pending, skips that directory. This is a content-level dedup, not a run-level throttle.

```javascript
// services/listingsAgent.js:29-41
const weekStart = AgentRun.normaliseWeekStarting(new Date());
const vendor = await Vendor.findById(vendorId).lean();
// ... tier check, placeholder check, missing fields check ...
// No run-level throttle — proceeds to per-directory checks
```

- **Verdict:** ✅ No bug. Weekly cron + per-directory dedup = correct behaviour.

---

## Reviews Agent

- **File:** `services/reviewsAgent.js`
- **Cron:** `jobs/reviewsAgent.js:8` → `'15 6 * * 1'` (Monday 06:15 UTC)
- **Throttle:** None at the run level. Has a per-email cooldown (30 days) and per-customer dedup (won't re-request from same email within cooldown), but no `AgentRun.findOne` to prevent duplicate runs.
- **Run creation:** `AgentRun.create()` at line 42 (early exit for non-Pro), and at line ~130 (success).

```javascript
// services/reviewsAgent.js:33-48
export async function runReviewsForVendor(vendorId, opts = {}) {
  const startedAt = new Date();
  const weekStart = AgentRun.normaliseWeekStarting(new Date());
  // ... tier check ...
  // No run-level throttle — proceeds to lead scanning
```

- **Verdict:** ✅ No bug. Weekly cron + per-email cooldown = correct behaviour.

---

## Reconnaissance Agent (AI Mention Scanner)

- **File:** `services/aiMentionScanner.js`
- **Cron:** `jobs/scheduledReports.js:324` → `'0 3 * * 0'` (Sunday 03:00 UTC)
- **Throttle:** None. No dedup check.
- **Run creation:** `AgentRun.create()` at lines 484 and 503 (per-vendor, after scanning).

```javascript
// services/aiMentionScanner.js:484-493
await AgentRun.create({
  vendorId: vendor._id,
  agentName: 'reconnaissance',
  weekStarting: AgentRun.normaliseWeekStarting(new Date()),
  status: completedPlatforms === mentionDocs.length ? 'completed' : 'partial',
  // ... no prior-run check
});
```

- **Verdict:** ✅ No bug. Weekly cron + no throttle = runs once per week correctly.

---

## Reporter Agent

- **File:** `jobs/scheduledReports.js:343`
- **Cron:** `'0 8 * * 1'` (Monday 08:00 UTC)
- **Throttle:** Idempotency check via `WeeklyReport.findOne({ vendorId, weekStartDate })` at line 363. If report exists for this vendor+week, skips.
- **Run creation:** Via `buildAIVisibilityIntelligenceReport()` which calls `WeeklyReport.create()`.
- **Verdict:** ✅ Correct. Weekly cron + idempotency check = runs once per week, safe to re-trigger.

---

## Recommendation

No fix PRs needed for Detective, Listings, Reviews, or Recon. The throttle bug was unique to the Writer Agent because it was the only agent with:
1. A multi-day cron schedule (Mon/Wed/Fri)
2. A weekly throttle via `findOrCreateRun`

**Future-proofing:** If any agent's cron schedule is bumped from weekly to daily (as the PDFs promise), add a per-day throttle check before creating the AgentRun. Copy the pattern from the Writer Agent fix (PR #67):

```javascript
if (!dryRun) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const existingToday = await AgentRun.findOne({
    vendorId, agentName: '<agent>',
    createdAt: { $gte: todayStart, $lt: todayEnd },
    status: { $in: ['completed', 'partial'] },
  });
  if (existingToday) return { skipped: true, reason: 'already_ran_today' };
}
```

**Estimated effort per agent if schedule changes:** Small (15 minutes each — copy the Writer pattern).

---

## PDF vs code schedule drift (reminder)

| Agent | PDF promise | Code reality | Drift |
|-------|-------------|--------------|-------|
| Detective | Daily | Monday only | 7× less frequent |
| Listings | Daily | Monday only | 7× less frequent |
| Reviews | Monthly 1st | Monday weekly | 4× more frequent |
| Recon | Daily | Sunday only | 7× less frequent |

This is a separate issue from the throttle bug — documented in `docs/audits/pro-tier-full-audit-2026-05-15.md` as BUG-004, BUG-006, BUG-007.
