# Experiment Deviations Log

Pre-registered studies: EXP-001 (`study_2026_07_exp001`), EXP-002 (`study_2026_07_exp002`).
Record every deviation from the pre-registration here, with date and corrective action.

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
- Baseline z-test "significance" is a pre-treatment single-firm imbalance, not a treatment effect. Wave 2 analysis uses difference-in-differences (change from baseline within groups), not raw endpoint levels, so this imbalance does not bias the treatment effect estimate.

**Impact on analysis:** None. All corrections were applied to wave 1 (baseline) data before any treatment was deployed. The treatment (JSON-LD schema injection) has not yet been applied to any profile page.
