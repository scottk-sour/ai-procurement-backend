# EXP-001 — Frozen fixture design: making the 267-row regression gate reproducible independently of the matcher

**Date:** 2026-09-02
**Status:** Design note for review. **Docs only — no builder or scorer change is implemented by this note.**
**Scope:** The 267-row mention-matcher regression gate (Stratum A = 217, Stratum B = 50) used to select and validate `isFirmMentioned` rules for EXP-001.

---

## 1. What happened

After RETAINED-SUFFIX was merged into the production matcher (PR #186) and deployed, the fixture pipeline could no longer be regenerated:

- `buildMentionGroundTruth.js` produced **298** current-vs-substring disagreements instead of **469**.
- `buildLabellingView.js` produced **202** rows instead of **267**.
- `restoreVerdicts.js` refused (its `body.length !== EXPECTED_ROWS` guard, `restoreVerdicts.js:226`) and the scorer refused (its `EXPECTED_TOTAL` / stratum-split gates). Nothing was written.

This is not a bug in PR #186. It is a **structural fault in how the fixture is defined**: its membership is derived from the live matcher, so changing the matcher changes the fixture, and a fixture that moves with the rule under test cannot act as a regression gate for that rule.

## 2. Root cause

### 2.1 Both strata depend on the matcher under test

`buildMentionGroundTruth.js` imports the **live** `isFirmMentioned` (`buildMentionGroundTruth.js:34`) and writes, per row:

- `current_matcher_result = isFirmMentioned(responseText, entity)` (`:145`) — depends on the matcher.
- `substring_only_result  = normText.includes(normFirm)` (`:146`) — does **not** (it uses `normaliseResponseText` / `normaliseFirmName`, which PR #186 did not touch).

`buildLabellingView.js` then derives **both** strata from the `current_matcher_result` column:

- **Stratum A** — `isDispute = current !== substring` (`buildLabellingView.js:247`), Perplexity only (`:229`).
- **Stratum B** — bottom-k of rows where `current === true` (`:250`), 25 single-token + 25 multi-token.

So the matcher under test defines Stratum A (as one side of the disagreement) **and** Stratum B (directly, as the positive set). RETAINED-SUFFIX behaves much closer to a substring match than the old context-gated rule did, so the disagreement census collapsed (469 → 298) and the Perplexity view shrank (267 → 202). Both strata moved.

### 2.2 The positional `row_uid` binding

`row_uid` is **not** a stable identity of a row. `buildLabellingView.js` assigns it `1..N` by **shuffle position** (`buildLabellingView.js:281–282`), *after* the matcher-derived strata are combined. The committed verdicts (`docs/research/EXP-001-rule-scoring-2026-08-28.md`) are keyed by `row_uid`, and `restoreVerdicts.js` fills the view by matching `row_uid` positionally (`restoreVerdicts.js:240–249`).

The stable content identity of a row — `(run_id, firm_entity_name)` — is **never committed**. It exists only in the gitignored, regenerated `labelling-key.csv` (`row_uid, stratum, run_id, …`; note it does not even carry `firm_entity_name`, which lives in the view) and `labelling-view.csv`. So a verdict is bound to a firm only through a position in a set that is re-derived from the live matcher on every run. Change the set or the shuffle and verdict *N* attaches to a different firm.

### 2.3 The circularity

The live matcher is used **both** to define the evaluation set (§2.1) **and** as the `CURRENT` rule the scorer evaluates against that set. Evaluating a new matcher therefore changes the very set it is evaluated on. A regression gate built this way is self-referential: it cannot register a regression, because the goalposts move with the matcher.

## 3. Design principle

**Separate the set from the evaluation.** The 267 rows and their adjudicated verdicts are a fixed evaluation set, established once at adjudication. Any matcher — the live one, or a candidate — is *applied to* that fixed set to produce predictions; it must never *determine* the set. Concretely:

- Row **membership** (which 267 rows, their stratum) is frozen and committed.
- Row **identity** is the content key `(run_id, firm_entity_name)`, not a regenerated `row_uid` position.
- **Verdicts** are frozen and committed (already true — in the scoring artefact).
- `current_matcher_result` / `substring_only_result` may still be **computed for reporting**, but never used to select or order rows.

## 4. The frozen manifest

A single small, committed artefact that is the canonical definition of the fixture. One record per row, 267 records.

### 4.1 Schema

| field | type | frozen? | why it is in the manifest |
|---|---|---|---|
| `row_uid` | int 1..267 | yes | Continuity with the committed verdict artefact, which is keyed by `row_uid`. Becomes a **stored attribute**, not a regenerated shuffle position. |
| `stratum` | `A` / `B` | yes | Was matcher-derived; now fixed. Preserves the 217/50 split the scorer gates on. |
| `run_id` | string | yes | Half of the stable content identity; joins `response_text` from the DB. |
| `firm_entity_name` | string | yes | Other half of the identity. `(run_id, firm_entity_name)` is unique per row (entityName is unique within a prompt/run — the scorer already relies on this to join). |
| `normalised_firm_name` | string | yes | The scorer cross-checks the joined row's `normalised_firm_name` against the view (`scoreCandidateRules.js`, mis-join guard). Freezing it makes the manifest the source of truth and turns a future `normaliseFirmName` change into a detectable mismatch rather than a silent shift. |
| `token_count` | int | yes | Same cross-check; also determines Stratum B's single/multi split. Frozen for the same reason. |
| `human_verdict` | `REAL` / `FALSE` / `AMBIGUOUS` | yes | The adjudicated verdict. Sourced from `docs/research/EXP-001-rule-scoring-2026-08-28.md`; committed here so the gate no longer depends on a positional restore. |

Optional hardening (not required for the primary fix):

| field | type | why |
|---|---|---|
| `response_sha256` | hex | `sha256` of the run's `response_text`, letting a DB-sourced response be verified against what was adjudicated, guarding against DB drift without committing ~24 MB of text. Keyed per `run_id` (responses are per-run, shared across a run's firms), so it may live in a small companion table rather than per row. |

### 4.2 Deliberately excluded

- `current_matcher_result`, `substring_only_result` — matcher-derived; excluding them from the frozen identity is the whole point. They may be **recomputed at scoring time for reporting**, never for membership.
- `response_text` — ~24 MB; pulled from the DB by `run_id` at materialisation (optionally verified via `response_sha256`). Raw responses are immutable under the study's rules.
- `context_window`, `occurrence_count`, `context_window_flag` — human-labelling presentation only; the regression gate scores against `response_text`, not the window.

### 4.3 Serialisation format

Recommend **JSON** for the committed manifest (e.g. an array of 267 objects, or an object keyed by `row_uid`):

- The repo already treats CSV as *generated/ephemeral*: `.gitignore:36` ignores `*.csv` globally, with only `!data/samples/*.csv` exempted (`.gitignore:37`), and the fixture CSVs are explicitly ignored (`.gitignore:80–81`). Committing a CSV manifest would require a further negation and fights that convention.
- The repo's *committed* structured data is JSON (`data/experiments/exp001-config.json`, `exp001-assignment.json`).
- JSON diffs cleanly in review, which matters for an artefact whose whole purpose is to be audited and to stay fixed.

The **materialised** gate inputs the scorer consumes (`labelling-view.csv`, `labelling-key.csv`, `mention-ground-truth-sample.csv`) stay CSV/RFC4180 and stay gitignored — they are regenerated from `manifest + DB`. (Alternative: keep the manifest as CSV under an explicit `!data/experiments/…` negation, at the cost of the two points above. Decide at implementation time.)

### 4.4 Location

`data/experiments/labelling-fixture-manifest.json` (proposed), **committed**. If a CSV form is chosen instead, it must be exempted from the `*.csv` ignore with an explicit `!` negation.

## 5. How the gate works once the manifest exists (described, not implemented)

1. **Materialise** — join `response_text` from the DB onto the manifest by `(run_id, firm_entity_name)` (optionally verifying `response_sha256`). This produces the scorer's inputs **without** calling `isFirmMentioned` to decide membership. Stratum, verdict and `row_uid` come from the manifest; only `response_text` comes from the DB.
2. **Score** — the matcher under test is applied to the frozen set to produce predictions; the scorer counts errors against the frozen verdicts. `current_matcher_result` is computed here **as the rule under test**, not as a membership selector.

This breaks the circularity: the set is fixed; the matcher is measured against it. A future matcher change moves predictions and error counts — which is exactly what a regression gate should surface — but never the row set, the stratum split, or the verdict binding.

## 6. Provenance — how the manifest is first built (procedure, to be implemented later)

A rebuild at the pre-#186 SHA is **not** required. The pre-#186 filled `labelling-view.csv` and `labelling-key.csv` from the 28/08/2026 session survive outside the repo and will be supplied. The manifest is built from them:

1. Join the supplied view (`row_uid → firm_entity_name, normalised_firm_name, token_count, human_verdict`) and key (`row_uid → stratum, run_id`) on `row_uid`.
2. **Cross-check every verdict against the committed artefact** `docs/research/EXP-001-rule-scoring-2026-08-28.md`. **All 267 must agree; any disagreement stops the build and nothing is written.** (This mirrors `restoreVerdicts.js`'s existing cross-check discipline.)
3. Emit the manifest with the schema in §4.1.

After this one-time capture, the manifest is the source of truth and the supplied files are no longer needed.

## 7. Follow-on work (out of scope for this note)

- **Builder change** — `buildLabellingView.js` stops deriving strata from `current_matcher_result`; membership comes from the manifest. `buildMentionGroundTruth.js` is reduced to (or replaced by) a materialiser that attaches `response_text` to the frozen set. Not implemented here.
- **Scorer / restoreVerdicts change** — key verdicts off the committed manifest (by `(run_id, firm_entity_name)` / stored `row_uid`) rather than a regenerated position. Not implemented here.
- **Pinned definition-matcher** — if the *original* sample ever needs re-deriving from scratch, the builder should take the definition matcher (the selection-time context-gate rule) as an explicit, version-pinned parameter, never the live `isFirmMentioned`. This is a **documentation matter for later**, deferred; it addresses provenance, not the gate's stability, and is not needed once membership is frozen.

## 8. Non-goals

- No change to research methodology, the prompt panel, assignment, ground-truth verdicts, or raw responses.
- No re-adjudication and no change to the 267 verdicts.
- No enlargement of the sample.
- The exclusion rule remains a separate methodology decision, not created or applied here.
