# Writer Pipeline Audit — Why Drafts Are Blocking

**Date:** 2026-07-01  
**Scope:** services/writerAgent.js (runWriterAgentForVendor), all guards  
**Test vendor:** Cardiff Property Partners (estate-agent, Wales, 699757a97712b4369510e6c8)

---

## 1. PIPELINE MAP

```
Draft Generated (Sonnet, temp 0.7)
     │
     ▼
Stage A: Regex fabrication check (detectPossibleFabrication)
     │ blocks on: attributed stat + named/anonymous source
     ▼
Stage B: Haiku fabrication review (reviewDraftForFabrication)
     │ blocks on: fabricatedAttributions, firmClaimsNotInContext, qualityScore < 8.5
     │ repair: deterministic sentence deletion, then re-check
     ▼
Stage C: Deterministic gate (validateDraft — 11 rules)
     │ blocks on: wrong jurisdiction, wrong regulator, wrong statute,
     │   unverified membership, placeholder numbers, letting-law errors,
     │   overclaims, credential exclusivity, advice language, deprecated schema
     │ repair: ONE corrective LLM regeneration (full article, temp 0.7)
     ▼
Stage D: Legal claim check (verifyClaims — Sonnet + web_search)
     │ blocks on: contradicted, firm-unverified, unverifiable claims
     │ repair: up to 2 corrective LLM regenerations (full article, temp 0.7),
     │         each re-runs validateDraft (Stage C) on the rewrite
     ▼
Pass → createApproval (Pending)
Fail → createApproval + flip to Rejected
```

---

## 2. ROOT CAUSES (ranked by blocking frequency)

### RC1: THE REWRITE LOOP BREAKS WORKING DRAFTS (the biggest blocker)
**Category:** (c) rewrite loop breaking working drafts  
**Evidence:** "rewrite reintroduced gate violation, stopping"

The rewrite loop at lines 599-616 does a FULL-ARTICLE regeneration at temperature 0.7 when the legal check flags issues. The regenerated article is then re-checked by validateDraft (line 612). This is the critical sequence:

1. Legal check flags one sentence (e.g. "agents must be registered" → should say "licensed")
2. The entire article is regenerated from scratch with the correction appended as a text instruction
3. The new article — being a completely different generation at temp 0.7 — can contain NEW violations that the original didn't have (wrong jurisdiction terms, fabricated stats, unverified membership claims)
4. validateDraft catches the new violation → `gate.ok === false` → loop breaks
5. claimVerification.status is still 'fail' (from step 1) → draft routes to Rejected

**The fundamental problem:** fixing one sentence by regenerating 1,500 words at temperature 0.7 is like performing surgery with a sledgehammer. A correct draft with one wrong word becomes a completely different draft that may be wrong in different ways.

**Severity:** This is the single most common blocking path. Every time the legal check finds anything (which it does on most drafts — see RC2), the rewrite loop fires, and the rewrite has roughly a coin-flip chance of introducing a new validateDraft violation.

### RC2: LEGAL CHECK IS OVER-STRICT — ALMOST EVERYTHING FAILS
**Category:** (b) guard over-flagging correct content  
**Evidence:** 3, 3, then 1 issues on identical input (non-deterministic)

The VERIFY_SYSTEM prompt says: "A claim PASSES only if it is factually correct, applies to this firm's jurisdiction, and any firm-specific assertions are confirmed in the firm facts. Only genuinely cosmetic wording differences pass as acceptable."

This standard is: **only verified claims pass; everything else fails.** In practice this means:
- "Letting agents must be registered with Rent Smart Wales" → FAILS because the correct word is "licensed", not "registered" (an imprecision, not a material error)
- A claim about "the Property Ombudsman" providing redress → may FAIL as "misleading by omission" because PRS also provides redress
- Any sentence about the firm's services that happens to not appear verbatim in firmFacts → FAILS as firm-unverified

The non-determinism (3, 3, then 1 issues) comes from the web_search tool. Whether the model searches, what it finds, and how it interprets the results varies between calls. A claim that web search confirms on one run may be marked "unverifiable" on the next if the search returns different results.

**Severity:** High. Even a correctly-written draft will typically produce 1-3 issues because the checker is looking for perfection against live web sources with non-deterministic retrieval.

### RC3: REWRITE JSON EXTRACTION STILL USES GREEDY REGEX
**Category:** (d) intermittent error/resilience issue  
**Evidence:** writerAgent.js lines 532 and 607 both use `retryText.match(/\{[\s\S]*\}/)`

The jsonExtract fix (extractFirstJsonObject) was applied to fabricationReview.js and verifyClaims.js, but the TWO rewrite loops in writerAgent.js still use the old greedy regex. If the rewrite model outputs trailing text after the JSON, the parse fails, draftBody keeps the old content, and the loop breaks — leaving claimVerification in its 'fail' state.

**Severity:** Medium. This is the "legal_check_error" path. It's intermittent but wastes an API call and triggers a rejection.

### RC4: OVERLAPPING JURISDICTION/MEMBERSHIP CHECKS BETWEEN GUARDS
**Category:** (b) guard over-flagging + cross-stage conflict  

The same content is checked for jurisdiction correctness by THREE guards:
- **validateDraft** (ruleJurisdiction, ruleLettingJurisdiction) — deterministic, checks forbidden terms
- **Haiku fabrication review** — may flag regulatory mentions as firmClaimsNotInContext
- **verifyClaims** — checks applicability claims and firm-status claims with web search

A draft can pass validateDraft's contrast-aware jurisdiction check (which allows forbidden terms in deliberate comparisons) but fail verifyClaims' stricter standard (which treats any mention of the wrong jurisdiction's terms as a failure). There is no coordination between the guards about what "correct enough" means.

Similarly, ruleUnverifiedMembershipClaim (validateDraft) and the firm-status extraction (verifyClaims) both check membership claims, but with different sensitivity and different definitions of "firm voice."

**Severity:** Medium-low in isolation, but compounds RC1 — the rewrite to fix a legal-check issue may trip a validateDraft rule the original draft avoided.

### RC5: COST CAP BLOCKS LEGAL VERIFICATION → AUTO-REJECT
**Category:** (d) resilience issue  
**Evidence:** writerAgent.js line 576

The cost cap check runs at the top of EACH legal-check pass (line 574-579). If the monthly cost is near the $75 cap, the legal check returns `{ status: 'not_run' }`, and since `status !== 'pass'`, the draft routes straight to Rejected with "Legal verification did not complete (not_run: cost_cap_exceeded)."

The draft may be perfect — it passed fabrication review and validateDraft — but because the legal check couldn't run (budget), it's rejected. There is no path to approve a draft that wasn't legally verified, even if all deterministic guards passed.

**Severity:** Low currently (only one Pro vendor, cost is low), but will increase as more vendors are added.

---

## 3. THE SINGLE BIGGEST BLOCKER

**RC1: The full-article rewrite at temperature 0.7.**

When the legal check finds one issue, the entire article is regenerated. The regeneration is unconstrained (same system prompt, same temperature as the original generation). The new article routinely introduces new violations that the original didn't have, tripping validateDraft on the rewrite and causing the "rewrite reintroduced gate violation, stopping" exit.

This creates a deadlock: the legal check demands a change, the rewrite makes it, the gate blocks the rewrite for an unrelated reason, and the draft is rejected. The original draft (which was mostly good) is thrown away.

---

## 4. RECOMMENDED FIX SEQUENCE

### Fix 1 (highest impact): Replace full-article rewrite with surgical sentence replacement
Instead of regenerating the entire article, extract only the specific sentences flagged by verifyClaims (`issue.sentence`), generate replacement sentences at temperature 0 with the repair text as guidance, and splice them in. This preserves the 95% of the article that already passed the gate and only changes the failing sentences. Run validateDraft on the spliced result — if it still passes, proceed.

### Fix 2: Lower the legal check strictness for imprecision
Change the VERIFY_SYSTEM prompt so that "imprecise but not misleading" claims (like "registered" instead of "licensed") return as imprecise (not contradicted) and do not fail the draft. The current prompt says "Only genuinely cosmetic wording differences pass" — this should be widened to "directionally correct claims that would not mislead a reasonable reader pass."

### Fix 3: Apply jsonExtract to rewrite loops
Replace the two `retryText.match(/\{[\s\S]*\}/)` calls in writerAgent.js (lines 532 and 607) with `extractFirstJsonObject(retryText)` from the shared util. This prevents the rewrite parse from failing on trailing text.

### Fix 4: Allow deterministic-gate-only approval when legal check cannot run
When `claimVerification.status === 'not_run'` (cost cap, missing key), do not auto-reject. Instead, let the draft through to Pending with a `needsManualReview: true` flag and the reason. The deterministic gate already passed — the firm's jurisdiction, membership claims, and placeholder numbers are all verified. The legal check adds value but its unavailability should not block a draft that every other guard cleared.

### Fix 5: Deduplicate jurisdiction checking
Let validateDraft be the authoritative jurisdiction/membership gate (it's deterministic and fast). Remove jurisdiction and firm-status claim types from verifyClaims' extraction prompt so the LLM legal check focuses only on what it does better: verifying specific legal/regulatory facts against official sources, not re-checking what the deterministic gate already handled.

---

## Cross-Stage Conflicts Identified

| Guard A | Guard B | Conflict |
|---|---|---|
| validateDraft (contrast-aware: allows forbidden terms near correct-regime context) | verifyClaims (fails any mention of wrong jurisdiction's terms) | A draft can pass validateDraft's contrast check but fail verifyClaims for the same text |
| validateDraft (ruleUnverifiedMembershipClaim: blocks firm-voice claims without number on file) | verifyClaims (firm-status extraction: flags membership claims not in firmFacts) | Same sentence checked twice with different sensitivity; repair for one may not satisfy the other |
| ORG_NAME_BAN ("Do NOT emit placeholders in the body") | SYSTEM_PROMPT_WRITER_V1_1 Rule 22 ("emit placeholders for missing firm data") | Writer gets contradictory instructions — ORG_NAME_BAN overrides since it comes last, but the conflict means the model sometimes oscillates between qualitative and placeholder modes |

---

## One-Line Summary

Drafts are blocking because the legal checker flags 1-3 sentences, the rewrite loop regenerates the entire article to fix them, and the new article introduces new gate violations — creating a deadlock where fixing one problem causes another.
