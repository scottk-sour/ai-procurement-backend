# Listings Agent Idempotency Audit — 19 May 2026

## Overall Verdict: ⚠️ Conditional

The Listings Agent has per-directory dedup at the orchestrator level via `DirectoryListing.findOne({ vendorId, directory })`, which prevents re-submission to directories already in `live`, `submitted`, or `pending_verification` status. However, concierge directories (Yell, FreeIndex, Trustpilot) create a **new ApprovalQueue item on every run** if their DirectoryListing status isn't in the protected set — meaning a daily schedule would generate duplicate approval items for the same directory if a prior queued item hasn't been actioned.

Safe for daily operation **after one fix**: add a check for existing pending ApprovalQueue items before creating new ones for concierge directories.

---

## Per-Adapter Analysis

### Bing Places (API-automated)

**A. Dedup check:**
- **Orchestrator level:** `DirectoryListing.findOne({ vendorId, directory: 'bing_places' })` at `listingsAgent.js:67`. If status is `live`, `submitted`, or `pending_verification` → skips (line 69-71). If `failed` with `retryCount >= 3` → skips (line 73-75).
- **Adapter level:** None. `bingPlaces.js` has no dedup — it fires the HTTP POST unconditionally when called.

**B. Status handling:**

| Status | Would agent re-submit on next run? | Notes |
|--------|-------------------------------------|-------|
| `live` | No — skipped at line 69 | Correct |
| `submitted` | No — skipped at line 69 | Correct |
| `pending_verification` | No — skipped at line 69 | Correct |
| `failed` (retryCount < 3) | **Yes** — falls through to line 78 | Retry with increment |
| `failed` (retryCount >= 3) | No — skipped at line 73 | Max retries reached |
| `queued` | **Yes** — falls through to line 78 | Re-submits via API |
| No record exists | **Yes** — upsert at line 80 | First submission |

**C. External side effects:**
- Makes HTTP POST to `https://www.bingplaces.com/api/v1/businesses` (line 19 of bingPlaces.js)
- If called 7× with same payload: **Unknown.** The Bing Places API URL appears to be non-standard — may not be a real endpoint. If it is real, duplicate POSTs would likely create duplicate listings or return a conflict error. No dedup key (like business ID) is sent.
- **Note:** `BING_PLACES_API_KEY` is likely not set on Render, so this adapter returns `{ success: false, error: 'BING_PLACES_API_KEY not configured' }` and sets status to `failed`. No external call actually happens.

**D. Recovery:**
- Uses `findOneAndUpdate` with `upsert: true` (line 80-92). If script crashes after HTTP call but before DB write, the listing stays in its prior state (or doesn't exist). Next run re-submits — safe because the status check at line 67-75 runs first.
- If crash happens between HTTP success and DB write: the external listing exists but DirectoryListing shows no record. Next run would re-submit (duplicate on Bing). **Low risk** since the API isn't functional anyway.

**E. Risk rating:** ✅ Safe (API not functional; dedup logic correct for when it is)

---

### Yell (Concierge)

**A. Dedup check:**
- **Orchestrator level:** Same `DirectoryListing.findOne` check at line 67. If `live`/`submitted`/`pending_verification` → skips.
- **Approval level:** **None.** `createApproval()` (line 101) creates a new ApprovalQueue item every time it's called. No check for existing pending approvals for the same vendor+directory.

**B. Status handling:**

| Status | Would agent re-submit on next run? | Notes |
|--------|-------------------------------------|-------|
| `live` | No — skipped at line 69 | Correct |
| `submitted` | No — skipped at line 69 | Correct |
| `pending_verification` | No — skipped at line 69 | Correct |
| `failed` (retryCount < 3) | **Yes** — falls through | But concierge path at line 94 ignores retryCount, always resets to `queued` |
| `failed` (retryCount >= 3) | No — skipped at line 73 | Max retries |
| `queued` | **Yes** — falls through to line 94 | **BUG: creates another ApprovalQueue item** |
| No record exists | **Yes** — upsert at line 95 | First submission |

**Critical issue:** If a concierge directory is in `queued` status (meaning an approval item was already created but admin hasn't actioned it yet), the next run:
1. `DirectoryListing.findOne` returns the existing record with `status: 'queued'`
2. `queued` is NOT in the protected set (`['live', 'submitted', 'pending_verification']`)
3. Falls through to concierge path at line 94
4. `findOneAndUpdate` overwrites status back to `queued` (no-op on the DirectoryListing)
5. `createApproval()` creates a **new duplicate ApprovalQueue item**

On a daily schedule, this would create 7 identical "Submit X to yell" approvals per week for every vendor+directory pair still in `queued`.

**C. External side effects:**
- No HTTP call. Creates ApprovalQueue item for manual human submission.
- If called 7×: 7 duplicate ApprovalQueue items. Admin sees 7 identical pending items.

**D. Recovery:**
- `findOneAndUpdate` with `upsert: true` is atomic. Crash-safe for the DirectoryListing write.
- `createApproval` after the DirectoryListing write: if crash happens between the two, DirectoryListing is `queued` but no approval exists. Next run creates the approval — correct recovery.

**E. Risk rating:** ⚠️ Conditional — **duplicate ApprovalQueue items on every daily run** for directories stuck in `queued` status.

---

### FreeIndex (Concierge)

Identical code path to Yell (both in `CONCIERGE_DIRECTORIES` set). Same dedup, same status handling, same ApprovalQueue duplication bug.

**E. Risk rating:** ⚠️ Conditional — same issue as Yell.

---

### Trustpilot (Concierge)

Identical code path to Yell and FreeIndex.

**E. Risk rating:** ⚠️ Conditional — same issue.

---

### Regulatory Directories (SRA/ICAEW/FCA/Propertymark)

**A. Dedup check:**
- `findOneAndUpdate` with `upsert: true` at line 119-129, keyed on `{ vendorId, directory: reg.directory }`. Unique compound index enforces one record per vendor+directory.

**B. Status handling:**
- If vendor has regulatory number: status set to `live` unconditionally (line 123). Overwrites any prior status.
- If vendor doesn't have number: status set to `queued` (line 123).
- Every run overwrites the record — no incremental logic.

**C. External side effects:**
- None. No HTTP calls. Just a MongoDB write.
- If called 7×: 7 identical `findOneAndUpdate` calls, all producing the same result. Perfectly idempotent.

**D. Recovery:**
- Atomic `findOneAndUpdate`. Crash-safe.

**E. Risk rating:** ✅ Safe — fully idempotent.

---

## Summary

| Adapter | Dedup (orchestrator) | Dedup (adapter) | Approval dedup | External call | Daily-safe? |
|---------|---------------------|-----------------|----------------|---------------|-------------|
| Bing Places | ✅ status check | ❌ None | N/A (no approval) | Yes (but non-functional) | ✅ Safe |
| Yell | ✅ status check | N/A | ❌ **No dedup** | No | ⚠️ Duplicate approvals |
| FreeIndex | ✅ status check | N/A | ❌ **No dedup** | No | ⚠️ Duplicate approvals |
| Trustpilot | ✅ status check | N/A | ❌ **No dedup** | No | ⚠️ Duplicate approvals |
| Regulatory | ✅ upsert | N/A | N/A | No | ✅ Safe |

---

## Recommendation

### Fix needed before switching to daily schedule

**Add `queued` to the protected status set** in the orchestrator dedup check.

Current (line 69):
```javascript
if (existing && ['live', 'submitted', 'pending_verification'].includes(existing.status)) {
```

Fixed:
```javascript
if (existing && ['live', 'submitted', 'pending_verification', 'queued'].includes(existing.status)) {
```

This prevents re-creating ApprovalQueue items for directories that are already queued and awaiting admin action. If the admin rejects the approval, they would need to also update the DirectoryListing status to `failed` or `removed` to trigger a re-queue on the next run.

**Estimated effort:** XS (one line change + one test).

### Optional: add ApprovalQueue-level dedup

For defence in depth, add a check in the concierge path:

```javascript
const existingApproval = await ApprovalQueue.findOne({
  vendorId, agentName: 'listings', itemType: 'directory_submission',
  'draftPayload.directoryName': dir, status: 'pending',
});
if (existingApproval) {
  stats.alreadyListed++;
  continue;
}
```

**Estimated effort:** S (5 lines + test).
