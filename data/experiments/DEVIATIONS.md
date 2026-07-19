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
