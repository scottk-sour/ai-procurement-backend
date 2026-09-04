# AI-visibility content study — Wave 2 claim-use measurement

**Study:** `study_2026_09_ai_visibility_content`
**Panel:** `buyer_research_30`
**Applies from:** Wave 2 (pre-registered rerun)
**Date:** 04/09/2026
**Status:** Capability added ahead of Wave 2 collection. Sibling to the Wave 1 panel doc (`visibility-content-panel-wave1-2026-09-02.md`) — that record is not edited.

This note records what Wave 2 additionally captures and why Wave 1 cannot be retrofitted to the same level. It does not change the Wave 1 result or its interpretation.

## What Wave 2 additionally captures

1. **Raw API response.** The scan runner (`runExperimentScan.js`) now persists the full Perplexity API response object verbatim in a new `ExperimentRun.rawResponse` field (Mixed) — **Perplexity path only, wave ≥ 2 only.** Wave 1 documents and the ChatGPT/Gemini paths are unchanged: `rawResponse` is simply absent on them. `responseText` and `citedUrls` are still written exactly as Wave 1 wrote them (raw `content`, raw `citations` array — no normalisation, dedup or reorder).
2. **A frozen claim registry** (`data/experiments/visibility-content-claims.json`). Each entry binds a `targetClaim` (the exact proposition an article was written to supply) to an `articleUrl`. Binding is **by URL, not by prompt**: a claim attaches to a citation only when the stored citation URL matches the registry `articleUrl` after the same normalisation the runner uses for target matching. The registry starts unfrozen (`frozen: null`); the export refuses to run for wave ≥ 2 until it is frozen.
3. **A separate label collection** (`claim_use_labels`, one document per run × citation index). Its identifying/observational fields are derived read-only from the immutable run and the frozen registry at export time; its judgement fields start null and are filled only by a human via label import. `citationIndex` (the zero-based index into the stored `citedUrls[]`) is the stable citation identity and is never recomputed after export.

The measurement itself — did the answer *use* the target proposition — is a **human** label (`claimUsed` ∈ {0,1,2,3}). No script infers it; there is no classifier and no manufactured citation→passage attribution.

## Three evidence levels

| Level | Question | Evidence needed | Wave 1 | Wave 2 |
|---|---|---|---|---|
| **1 — Source citation** | Was a domain/URL cited at all? | `citedUrls[]` (already stored) | ✅ available | ✅ available |
| **2 — Citation attribution** | Does a cited URL correspond to a *registered target article*, so a specific claim is in scope? | a claim registry (URL → claim) frozen before collection | ❌ no registry existed | ✅ registry + URL binding |
| **3 — Claim use** | When the target article was cited, was its specific proposition actually used in the answer? | a target claim in scope + the full answer + a human judgement recorded against that claim | ❌ not recoverable | ✅ human label on target rows |

## Why Wave 1 sits at level 1 and cannot be retrofitted

- **No target claims existed at Wave 1.** Every prompt in the frozen config carries `targets: []`; there is no proposition recorded that an answer could be judged to have used. A claim registry created now is a *pre-registration for Wave 2*, not a description of what Wave 1 measured. Attaching claims to Wave 1 retrospectively would be inventing the thing being measured.
- **Wave 1 is immutable.** No script here reads a Wave-1 document for mutation, and none backfills it. The claim-use export refuses `wave < 2` outright.
- **Level 3 needs a judgement made against a claim that was in scope.** That judgement is human and prospective; it cannot be reconstructed from stored text after the fact without a classifier, which is deliberately not built.

Wave 1 therefore remains a **level-1** open-set citation record (which domains/URLs were cited), exactly as its panel doc describes. Wave 2 adds levels 2 and 3 for TendorAI target articles, without changing anything about Wave 1.

## Operating notes

- The panel config (`visibility-content-config.json`) stays frozen and is not edited; intent continues to live only there and is copied onto each label row at export time.
- Freeze the claim registry (`frozen`) only once its claims are settled; the export enforces this (no bypass flag; tests use a fixture copy with a frozen date).
- Re-running the export is safe: it inserts only new `(runId, citationIndex)` pairs and never updates an existing label, even if a registry claim later changes.

## References

- `models/ExperimentRun.js` — adds `rawResponse` (Mixed, no default, not indexed).
- `data/experiments/visibility-content-claims.json` — the claim registry (starts unfrozen).
- `lib/experiments/loadClaims.js` — read-only registry loader/validator.
- `models/ClaimUseLabel.js` — the `claim_use_labels` collection.
- `scripts/experiments/exportClaimUseSheet.js` — builds the labelling CSV + inserts null-label documents (read-only against `experiment_runs`).
- `scripts/experiments/importClaimUseLabels.js` — applies human labels onto `claim_use_labels` only.
