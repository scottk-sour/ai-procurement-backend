# Experiment Deviations Log

Pre-registered studies: EXP-001 (`study_2026_07_exp001`), EXP-002 (`study_2026_07_exp002`).
Record every deviation from the pre-registration here, with date and corrective action.

---

## 18/07/2026 — EXP-001 baseline scan: OpenAI quota outage

**What happened:** The wave 1 baseline scan (`runExperimentScan.js --wave 1`) hit an OpenAI API quota limit mid-scan. ChatGPT platform calls began returning 429 errors, leaving some prompts with fewer than 10 clean runs for the `chatgpt` platform.

**Corrective action:** Scan paused. After the quota reset, the scan was resumed. The runner's idempotency logic (counts existing clean runs per prompt/platform and tops up to 10) ensured no duplicates were created and all prompts reached the target 10 clean runs.

**Impact on analysis:** None. All 10 clean runs per prompt per platform were collected before the baseline was banked. The retry-to-10 design handled the outage as intended.

---

## 18/07/2026 — EXP-001 config wiped by Render deploy mid-scan

**What happened:** A Render deploy during the baseline scan replaced the running container, which wiped the locally generated `exp001-config.json` (the config generator writes to disk but the file had not yet been committed to the repo). The scan process was killed by the deploy.

**Corrective action:** Config regenerated from the committed assignment file (`exp001-assignment.json`, commit `52e31a9`) using `generateExp001Config.js --min-firms 4`. The regenerated config is deterministic given the same assignment file and database state. Scan resumed using the idempotent runner. Config committed to the repo (`2337dc6`) to prevent recurrence.

**Impact on analysis:** None. The regenerated config is identical to the original (deterministic generation from the same inputs). No scan data was lost — incomplete prompts were topped up by the idempotent runner.

---

## 18–19/07/2026 — EXP-001 mention-matcher false zeros

**What happened:** The baseline scan stored 874 false-zero `mentioned` flags. Two bugs combined:

1. `generateExp001Config.js` set `entityName: null` for every target firm (commit `2337dc6`). The scan runner's `checkTargets` function checked `isFirmMentioned(responseText, entityName)`, which returned `false` for null — so every target was recorded as not mentioned regardless of the response content.
2. The first version of `recomputeMentions.js` read `entityName` from the stored run targets (all null) rather than from the corrected config file, so re-running it produced the same false zeros.

**How it was found:** Manual inspection of stored responses via `showSamples.js` — responses clearly named tracked firms (e.g. "Hek Jones", "Howells Solicitors", "JWP Solicitors") but all mention flags were `false`.

**Corrective action:**
1. `generateExp001Config.js` updated to populate `entityName` from `Vendor.company` in the database (commit `ba79da0`).
2. New `mentionMatcher.js` library built with normalised firm-name matching: strips suffixes (Ltd, LLP, Solicitors, Law, Practice, & Co), treats `&`/`and` as equivalent, strips markdown bold, requires multi-token names as contiguous phrases and single-token names in list-marker context to prevent false positives. 24 unit tests using real stored response fixtures.
3. `recomputeMentions.js` rewritten to load entity names from the `--config` file rather than stored targets (commit `8bdf525`).
4. All mention flags rebuilt from stored `responseText`, pre-treatment.

**Impact on analysis:** None. All corrections applied to wave 1 (baseline) data before any treatment was deployed. Corrected mention rate: 3.3% treatment / 2.8% control.

---

## 19/07/2026 — EXP-001 baseline citation URL pattern bug

**What happened:** The experiment config (`generateExp001Config.js`) emitted target URLs as `https://www.tendorai.com/solicitors/[slug]`, but live vendor profile pages are served at `https://www.tendorai.com/suppliers/vendor/[slug]`. The `cited` flag on every stored run compared AI-returned citation URLs against the wrong target pattern, producing 0/97,120 citation matches — an artefact, not a real measurement.

**How it was found:** `auditTendoraiCitations.js` showed Perplexity citing `tendorai.com/suppliers/vendor/wingrove-law-york` 9 times while the stored target used the `/solicitors/` pattern.

**Corrective action:**
1. `generateExp001Config.js` corrected to emit `/suppliers/vendor/[slug]` (confirmed against `routes/schemaRoutes.js:87` and `routes/sitemap.js:357`).
2. `recomputeCitations.js` written to re-match stored `citedUrls` against corrected target URLs. Two bugs fixed during development:
   - v1 loaded all 1,360 runs into memory, causing a JavaScript heap OOM crash that left the database with partially written flags. Rewritten to stream via MongoDB cursor with bulkWrite batches of 500.
   - v1 and `recomputeMentions.js` clobbered each other's flags: each rebuilt the full targets array via `$set` but only computed its own field, defaulting the other to `false`. After `recomputeMentions` restored 3,008 mention flags, running `recomputeCitations` zeroed them all. Both scripts rewritten to spread the stored target object and overwrite only their own field.
3. All flags rebuilt from stored raw responses (`responseText` and `citedUrls`), pre-treatment. No data loss — raw responses were never affected.
4. `checkConfigUrls.js` added: spot-checks a sample of target URLs with HEAD requests and fails non-zero on 404, preventing a wrong pattern from silently shipping again.
5. Corrected config committed (`43099c7`).

**Corrected baseline (wave 1, pre-treatment):**
- Mention rate: 3.3% treatment / 2.8% control
- Citation rate: 0 treatment / 9 control (single firm, `york-spec` prompt, Perplexity only)
- Baseline z-test "significance" is a pre-treatment single-firm imbalance, not a treatment effect. The difference-in-differences analysis design (comparing change from baseline within groups, not raw endpoint levels) was specified on 19/07/2026, pre-treatment, so this imbalance does not bias the treatment effect estimate.

**Impact on analysis:** None. All corrections were applied to wave 1 (baseline) data before any treatment was deployed. The treatment (JSON-LD schema injection) has not yet been applied to any profile page.

---

## 02/09/2026 — EXP-001 fixture unrebuildable after the matcher change

**What happened:** After PR #186 replaced the single-token path of the live `isFirmMentioned` with RETAINED-SUFFIX and was deployed, the 267-row fixture could no longer be regenerated: `buildMentionGroundTruth.js` produced 298 current-vs-substring disagreements instead of 469 and `buildLabellingView.js` produced 202 rows instead of 267, so `restoreVerdicts.js` and the scorer refused. Both strata are derived from the live matcher's `current_matcher_result` (Stratum A = current≠substring; Stratum B = current positives), so changing the matcher changed the fixture. Render clones shallow with **no remote**, so git history is unavailable on the box and the pre-#186 matcher that had defined the fixture could not be recovered there to rebuild it.

**Corrective action:** The pre-#186 context-gate matcher was committed as a frozen, verbatim copy of `scripts/experiments/lib/mentionMatcher.js` at commit `a080129` → `scripts/experiments/lib/mentionMatcher.pre186.js`, and `buildMentionGroundTruth.js` gained `--definition-matcher <path>` (both in PR #188). Rebuilding with `--definition-matcher scripts/experiments/lib/mentionMatcher.pre186.js` reproduced the fixture exactly (469 disagreements = 217 perplexity / 252 chatgpt; 267 rows; `labelling-view.csv` 140,382 bytes; `labelling-key.csv` 11,124 bytes). The frozen matcher is used only to reproduce fixture membership and must never be used for scoring or recomputation. The underlying design is recorded in `docs/research/EXP-001-frozen-fixture-design.md` (PR #187); the gate run in `docs/research/EXP-001-regression-2026-09-02.md`.

**Impact on analysis:** None. The 267 rows and their adjudicated verdicts are unchanged; the frozen definition matcher reproduces the same fixture membership, and the deployed rule was accepted on its own regression score (29 / 27) at commit `f90a3ca`.

---

## 04/09/2026 — AI-visibility content study: claim-use capture added (pre-registered change, not a deviation)

**Study:** `study_2026_09_ai_visibility_content`, panel `buyer_research_30`.

**What changed, and why it is pre-registered rather than a deviation:** ahead of the Wave 2 rerun (and before any Wave 2 collection), the schema and tooling gained the ability to measure *claim use* — whether, when a TendorAI target article was cited, the specific proposition it was written to supply was actually used in the answer. This is an **additive** capability declared before the data it applies to exists, so it is recorded here as a pre-registered change, not a correction of something already collected.

- `ExperimentRun` gains a `rawResponse` field (Mixed, no default, not indexed). It is written **only on the Perplexity path and only for wave ≥ 2**. Wave 1 documents and the ChatGPT/Gemini paths are unchanged (`rawResponse` absent); `responseText` and `citedUrls` continue to be written exactly as before. Serialisability of the installed `openai@4.80.1` response object into the Mixed field was verified at runtime (plain JSON body + one non-enumerable `_request_id`; BSON round-trip lossless; a `max_tokens: 1024` completion is single-digit KB, far under the 16 MB BSON limit).
- New frozen claim registry `data/experiments/visibility-content-claims.json` (starts `frozen: null`), read-only loader `lib/experiments/loadClaims.js`, new `claim_use_labels` collection (`models/ClaimUseLabel.js`), and the `exportClaimUseSheet.js` / `importClaimUseLabels.js` scripts.

**Wave 1 integrity:** unaffected. No script reads or mutates a Wave-1 `experiment_runs` document; the claim-use export refuses `wave < 2`; the registry starts unfrozen and the export refuses to run until it is frozen. Wave 1 remains a level-1 open-set citation record and is not backfilled. See `docs/research/visibility-content-wave2-claim-use-2026-09-04.md`.

**Impact on analysis:** None to date — capability only; no Wave 2 data collected yet.
