# EXP-001 — 267-row regression gate run (02/09/2026)

**Date:** 2026-09-02
**Commit:** `f90a3ca` (Render shell; merge of PR #188 into `main`)
**Status:** Gate passed and accepted. No code change — this is a record of the run.

## Result

The live production matcher scored **29 total errors at AMBIG=FALSE** and **27 at AMBIG=REAL** on the adjudicated 267-row sample. The rule-selection target was 30. **This is not a failure** — it is the multi-token divergence flagged in the PR #186 body, now confirmed empirically, and the deployed rule scores *better* than the scored variant on this sample.

## Two rules, named distinctly

To keep them from being confused:

- **RETAINED-SUFFIX-SINGLE** — the **deployed** rule (the live `scripts/experiments/lib/mentionMatcher.js`). Applies the retained-suffix form on the **single-token** path; keeps `includes(normFirm)` on the **multi-token** path, unchanged (Hard Rule 7 of PR #186).
- **RETAINED-SUFFIX** — the **scored** variant (the scorer's `ruleRetainedSuffix`). Applies the retained-suffix form **uniformly**, to single- and multi-token firms alike. This is the variant whose 30 / 32 total errors won the rule selection.

The scorer's `CURRENT` column is the live matcher, i.e. RETAINED-SUFFIX-SINGLE; its `RETAINED-SUFFIX` column is the uniform variant.

## Scores

| rule | AMBIG=FALSE | AMBIG=REAL |
|---|---|---|
| RETAINED-SUFFIX-SINGLE (deployed, `CURRENT`) | **29** | **27** |
| RETAINED-SUFFIX (uniform, scored) | 30 | 32 |

Production is one error better at the lower bound and five better at the upper.

## The divergence

`CURRENT` (RETAINED-SUFFIX-SINGLE) and RETAINED-SUFFIX disagree on **exactly 7 rows of 267**, and all seven are **multi-token**:

> `row_uid` 31, 78, 146, 155, 160, 164, 217

Reason: on the multi-token path the deployed rule uses `includes(normFirm)`, which matches a firm's core normalised name even when the trailing generic word is absent from the response; the uniform RETAINED-SUFFIX instead requires the retained phrase (core + one generic word) and misses those. Rows **31, 78, 146, 155 are REAL and are found by production** via `includes()` and missed by the retained-phrase match — which is why the deployed rule has fewer errors on the adjudicated sample. (The per-row breakdown is in the scorer stdout for this run; only the divergent `row_uid`s and the four confirmed-REAL rows are recorded here, from the gate output.)

Plainly: **the deployed rule differs from the scored RETAINED-SUFFIX variant on the multi-token path only.** This was anticipated in the PR #186 description (the "Step-4 regression gate" caveat), and the deployed variant scores better on the adjudicated sample.

## Fixture reproduction

The fixture was rebuilt on the Render box using the frozen pre-#186 definition matcher added in PR #188:

```
node scripts/experiments/buildMentionGroundTruth.js \
  --definition-matcher scripts/experiments/lib/mentionMatcher.pre186.js
```

It reproduced exactly:

- disagreements: **469** (217 perplexity / 252 chatgpt) — the 217 perplexity disagreements are Stratum A
- platform split of disagreements: **217 / 252**
- rows: **267**
- `labelling-view.csv`: **140,382 bytes**
- `labelling-key.csv`: **11,124 bytes**

(Scoring then joins the restored verdicts and evaluates the live matcher — the `CURRENT` column above.)

## Decision

**Accept the deployed rule (RETAINED-SUFFIX-SINGLE) as-is.** Do not change the live matcher; do not change the scorer's rule definitions. The regression gate's expected `CURRENT` total is therefore **29 (AMBIG=FALSE) / 27 (AMBIG=REAL)**, not 30 — recorded as a §13 deviation in `docs/research/EXP-001-labelling-preregistration.md`.

## References

- PR #186 — RETAINED-SUFFIX in the production matcher (the multi-token caveat is in its body).
- PR #187 — `docs/research/EXP-001-frozen-fixture-design.md` (frozen-fixture design; the circularity and both strata's matcher dependence).
- PR #188 — `scripts/experiments/lib/mentionMatcher.pre186.js` (frozen definition matcher) and `--definition-matcher`.
- `docs/research/EXP-001-rule-scoring-six-rules-2026-09-01.md` — the six-rule scoring that selected RETAINED-SUFFIX.
- `data/experiments/DEVIATIONS.md` — 02/09/2026 entry (fixture unrebuildable until the frozen matcher was added).
