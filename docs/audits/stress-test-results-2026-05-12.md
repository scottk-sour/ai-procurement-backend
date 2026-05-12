# Stress Test Results — 12 May 2026

## Summary

| Agent | Tests | Passed | Failed |
|-------|-------|--------|--------|
| Detective (AEO Detector) | 35 | 31 | 4 |
| Reporter (Digest) | 13 | 13 | 0 |
| Writer (Validator) | 21 | 20 | 1 |
| **Total** | **69** | **64** | **5** |

---

## Detective Failures (4)

### FAIL 1 — fixture-1 perfect page scores 57, expected >=70
- **File:** tests/agents/detective.stress.test.js:18
- **Expected:** overallScore >= 70
- **Actual:** 57
- **Severity:** BLOCKER
- **Root cause:** Meta check scores only 5/10 on a well-optimised page. Title at 76 chars exceeds the 70-char cap; description at 186 chars exceeds the 160-char cap. The scoring thresholds in `analyseAeoSignals` are too tight for real-world content. A page that would score well on Google's own guidelines fails TendorAI's detector. This means Detective tells clients to "fix" meta tags that are already good — selling the wrong diagnosis.

### FAIL 2 — fixture-1 perfect page fails meta check
- **File:** tests/agents/detective.stress.test.js:29
- **Expected:** meta.passed === true
- **Actual:** meta.passed === false (score 5, pass threshold 7)
- **Severity:** BLOCKER (same root cause as FAIL 1)
- **Root cause:** Title length range 20-70 chars is too narrow. Industry standard allows up to ~70-80 chars for title, 160-200 for description. The 70/160 upper bounds penalise pages that follow Google's own recommendations.

### FAIL 3 — fixture-3 empty meta page scores 31, expected <=30
- **File:** tests/agents/detective.stress.test.js:112
- **Expected:** overallScore <= 30
- **Actual:** 31
- **Severity:** HIGH
- **Root cause:** SSL (10pts) + viewport (10pts) + speed (10pts) + content (1pt) = 31 even with zero useful meta/schema/social/contact signals. The floor is too high — a page with nothing useful still gets 31/100 because SSL and viewport are "free" points. This reduces the urgency gap between a broken page and a semi-optimised one.

### FAIL 4 — fixture-10 Ascari-style page scores 31, expected <=25
- **File:** tests/agents/detective.stress.test.js:228
- **Expected:** overallScore <= 25
- **Actual:** 31
- **Severity:** HIGH (same root cause as FAIL 3)
- **Root cause:** Identical — SSL+viewport+speed give 30 free points. A page with `<meta name="viewport">`, HTTPS URL, and tiny HTML body scores 31/100 with zero business-useful signals.

---

## Writer Failures (1)

### FAIL 5 — fabrication detection doesn't catch unsourced stats
- **File:** tests/agents/writer.stress.test.js:167
- **Expected:** warnings.length > 0 for content with "5,000 transactions", "99.7%", "£1,200", "97%"
- **Actual:** warnings.length === 0
- **Severity:** HIGH
- **Root cause:** The `findUnsourcedStats` regex (`STAT_PATTERN`) matches `X%` and `£X` patterns. However, the fabricated content includes stats like "5,000" (no £ or % symbol) and "99.7%" which should trigger, but the validator's `findUnsourcedStats` is called on the COMBINED text of body+linkedin+facebook. Looking at the actual regex: `/(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*%|£\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?/gi` — the "97%" and "99.7%" patterns SHOULD match. The "£1,200" should match too. The issue is likely that the body text in the test contains newlines and the regex is matching correctly but the proximity window finds "TendorAI" as a false-positive Tier 1 source match (it's in the TIER_1_SOURCES list). Since the test text doesn't contain any Tier 1 source names... let me re-check. Actually, the body text doesn't have "TendorAI" or any Tier 1 source within 250 chars of the stats. The regex may not be matching the patterns as expected due to the indented template literal with leading whitespace. Need to investigate further.

---

## Reporter Failures (0)

All 13 reporter/digest tests pass. The digest structure is correct for empty-state scenarios. All fields are the right type (number not null for citations.total, arrays for empty collections, Date instances for timestamps).

---

## Fix List — Blockers in Priority Order

| # | File | Location | Fix |
|---|------|----------|-----|
| 1 | services/aeoDetector.js | `analyseAeoSignals` meta check | Widen title upper bound from 70→80 chars and description upper bound from 160→200 chars to match real-world SEO standards |
| 2 | services/weeklyProDigest.js | `buildCitationsSection` line 82 | Compute `change` as this week's mention count minus last week's mention count (query previous week's AIMentionScan) |
| 3 | jobs/scheduledReports.js | Monday 08:00 cron | After digest build, check if vendor has zero AeoReports; if so, trigger `generateFullReport()` once to populate the initial score |
| 4 | services/contentPlanner/validators.js | `findUnsourcedStats` / `validateContentDraft` | Investigate why "97%" and "£1,200" in the test body don't trigger unsourced-stat warnings; fix STAT_PATTERN or proximity logic if broken |
| 5 | services/aeoDetector.js | `analyseAeoSignals` overall scoring | Consider weighting SSL/viewport/speed lower in the raw overallScore (currently they contribute 30 "free" points to pages with zero business signals) |

---

## Recommended Fix Order

1. **Meta check thresholds** (Detective) — BLOCKER, 15-minute fix, highest diagnostic impact
2. **citations.byPlatform.change** (Reporter) — BLOCKER, 1-hour fix, affects frontend chart rendering
3. **Initial AeoReport for new Pro vendors** (Reporter) — BLOCKER, 2-hour fix, affects new customer onboarding
4. **Unsourced stats detection** (Writer) — HIGH, 1-hour investigation + fix, reputation risk
5. **Score floor inflation** (Detective) — HIGH, 30-minute fix, affects urgency messaging

## Which Agent is Most Broken

**Detective.** 4 of 5 test failures are in the Detective's AEO detector. The meta check thresholds are demonstrably wrong (a well-optimised page fails), and the score floor is too high (a bare page scores 31/100). These are the scores that go into cold emails and weekly reports — if they're wrong, the diagnosis is wrong, and the "fix" we sell is wrong.
