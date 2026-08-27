# TendorAI Research Programme — Master Working Document
**Current position, evidence status, labelling pre-registration and next actions**
Version: 27/08/2026
---
## 1. Purpose
This is the reference position for TendorAI's research programme. It separates what has been established from what remains uncertain, states what EXP-001 can and cannot demonstrate, and fixes the sequence of work from here.
Governing principle:
> Do not build a new research conclusion, or a commercial feature, on top of an unvalidated measurement instrument.
---
## 2. Research architecture
The research chain:
```
SRA register data
  → randomised assignment
  → panel selection
  → prompt configuration
  → AI API collection
  → raw responses (MongoDB Atlas)
  → mention/citation classification
  → statistical analysis
  → published report
```
**Backend (research):** `scottk-sour/ai-procurement-backend`. Scans launched manually from the Render shell. Results stored in `experiment_runs`.
**Frontend (treatment):** `scottk-sour/tendorai-nextjs`, vendor pages at `app/suppliers/vendor/[slug]/page.tsx`, deployed via Vercel.
**Searchable** is a third-party monitoring product running prompts Scott selected himself. It is a proxy, not the research instrument, and does not form part of the experimental dataset.
---
## 3. Population and assignment
EXP-001 assignment universe:
- 8,237 solicitor firms across 615 cities
- 3,988 treatment / 4,249 control
- Seed 20260718, frozen in `data/experiments/exp001-assignment.json`
Reduced by a pre-set rule to the measured panel:
- 17 cities, 1,214 firms, 603 treatment / 611 control
**Known weakness:** the input firm list was an unsorted live database query and was never snapshotted, so the assignment cannot be reproduced from methodology plus seed alone.
---
## 4. Prompt and target structure
- 17 cities × 4 prompts per city = **68 prompts**
- **4,856** target entries
- **1,214** distinct target URLs
- **1,214** distinct entity names
Verified three ways on 04/08/2026 (panel.csv column sum, `exp001-config.json` per-city and global distinct counts, `exp001-assignment.json`). No firm appears in more than one city.
All 4,856 target entries are `https://www.tendorai.com/suppliers/vendor/...` profile URLs — no exceptions, no target-less prompts.
**17 cities and 17 specialism prompts are different dimensions.** They must never be collapsed in any methodology or reporting artefact. The July report already carries a dated correction (02/08/2026) stating that the 7 practice areas apply to the 17 specialism prompts only.
The exact prompt-ID → city → practice-area mapping has not yet been extracted from the config. This is the one remaining code question (section 12).
---
## 5. Instruments and collection
Measurements are made through APIs, not the consumer ChatGPT or Perplexity products:
- Perplexity `sonar`
- ChatGPT `gpt-4o-mini-search-preview` (wave 1 only — since retired)
Gemini appears in the `ExperimentRun` platform enum `['perplexity','chatgpt','gemini']` but was never used; no API key. There is no `claude` value in the enum.
**The platform set is supplied at execution time via the `--platforms` CLI flag, not pinned in the experiment config.** This is a live methodological threat: the assistant set can change between collection runs without any config change.
### Collection actually achieved
| Wave | Platforms | Runs |
|---|---|---|
| Wave 1 | Perplexity + ChatGPT | 1,360 (68 × 2 × 10, all 136 cells at exactly 10) |
| Wave 2 | Perplexity only | 680 |
Wave 2's ChatGPT arm produced 2,040 errors and zero rows because the model had been retired. **The design arithmetic of 68 × 2 × 10 = 1,360 describes wave 1 only.** Do not present it as the standing per-wave figure.
Wave 1 completeness was verified on 13/08/2026 (`inventoryRuns.js`): all 136 prompt × platform cells at exactly 10, zero cells over or under, `responseText` present and non-empty on all 1,360 — so recomputation under a revised classifier is possible without recollection.
---
## 6. Storage and provenance
`experiment_runs` stores one document per model call, never aggregated. Fields present: study, wave, promptId, promptText, platform, modelVersion, modelParams, responseText, citedUrls[], targets[] (url, group, cited, mentioned, entityName), status, error, runAt.
Fields absent: `scoringVersion` / `methodVersion`, `city`, `firmId`, run ordinal, and any record of which classifier produced a stored flag. `recomputeMentions.js` and `recomputeCitations.js` mutate `targets[]` on stored runs with no version stamp.
**Consequence:** the stored `responseText` is more durable evidence than the stored boolean classification. Any classification can be recomputed; no stored classification can be traced to the rule that produced it.
---
## 7. EXP-001 treatment status
The intended intervention was an additive JSON-LD block on treatment profiles. On 20/07/2026 it emerged that all vendor profiles already rendered a baseline `LegalService` block. The actual live state was:
| Arm | Actual implementation |
|---|---|
| Treatment | Baseline LegalService block + duplicate EXP-001 block |
| Control | Baseline LegalService block |
The specified removal redesign was never implemented. The 13/08/2026 Rich Results check confirmed the live state: control page `ggp-law-ltd-aberdare` showed 2 local-business items, treatment page `renders-solicitors-cardiff` showed 3.
### Correction on `verify-exp001.ts`
The script did check both arms and passed 3/3 on each: treatment pages carried the EXP-001 marker, control pages were clean of it.
The flaw was the definition of a clean control. The test established *"control does not contain the marked EXP-001 block"*. The experiment required *"control does not contain the intervention being tested"*. The baseline schema remained in both arms, so the verification passed while the causal contrast was absent.
Treatment integrity was therefore never established at the level causal inference requires.
---
## 8. What EXP-001 can and cannot support
**Can support (observational):** what models returned, under which prompts, for which firms, at what time, which URLs were cited, and how classified measurements changed between waves.
**Cannot support:**
- that the schema intervention caused any observed change
- that the mention percentage is an unbiased estimate of true mentions
- that the existing z-test provides valid significance
- that wave 1 and any later ChatGPT measurement form one continuous series
### Wave-to-wave movement (Perplexity arm, 25/08/2026)
| | Control | Treatment |
|---|---|---|
| Wave 1 | 878/24,440 = 3.59% | 918/24,120 = 3.81% |
| Wave 2 | 1,025/24,440 = 4.19% | 1,254/24,120 = 5.20% |
| Change | +0.60pp | +1.39pp |
Difference-in-differences: **+0.79pp**.
The control arm moved +0.60pp having received no intervention. That is the background variance band, and it accounts for most of the treatment's rise. Only the 0.79pp gap is even potentially attributable — and given section 7, not to the intended intervention.
**Citations were zero for treatment in both waves across all 48,240 cells.** Perplexity never once cited a TendorAI vendor profile page. The "page gets cited → firm gets recommended" mechanism has no support in this data.
### Statistical dependence
Cells are not independent: roughly 71 firms × 68 prompts × 10 repeats. The existing z-test in `reportExperiment.js` is wired to `cited` only and treats target-observations as independent, which is why the pre-treatment baseline gap appeared wildly significant. Any mention test must cluster at firm level, and at prompt × platform as well.
Run-independence audit (13/08/2026) confirmed responses are genuinely distinct (Perplexity 68/68 cells all-distinct; ChatGPT 62/68), but **mention sets are far less variable**: ChatGPT averages ~2.3 distinct mention sets per 10-run cell, Perplexity ~5.7. The effective sample for the mention outcome is well below 1,360, and power calculations must use the effective number.
---
## 9. The mention classifier
The classifier is part of the measurement instrument, not plumbing.
### Characterisation (13/08/2026, all 1,214 firms)
Token distribution after `normaliseFirmName`:
| Tokens | Firms | Share |
|---|---|---|
| 1 | 625 | 51.5% |
| 2 | 358 | 29.5% |
| 3 | 175 | 14.4% |
| 4+ | 56 | 4.6% |
Classification: cannot match 37 (3.0%), elevated risk 595 (49.0%), sound 582 (47.9%). Arm splits are balanced (single-token: 308/603 treatment, 317/611 control), so the error is non-differential by construction and attenuates toward null rather than manufacturing an effect. It still invalidates the descriptive figure.
### Rule
Suffixes (ltd, llp, solicitors, law, legal, practice, partners, & co) are stripped iteratively, collapsing many panel names to one common English word. Single-token names require ≥4 characters (≥3 if an all-caps acronym) **and** a list/line-start context marker. Multi-token names use contiguous substring matching and bypass the context rule.
### Response-format audit (already run)
- 5,101 apparent single-token candidates; only 733 survive the context rule → **85.6% discarded**
- Multi-token: 2,275 vs 2,275 (0% difference — sanity check passed)
- Total 733 + 2,275 = 3,008, reconciling exactly to the banked wave 1 baseline
- Excluding the 25 risky cores barely changes it (85.9%), so this is not common-word noise being correctly rejected
Response structure: 81.4% mixed, 13.0% list, 5.6% prose. ChatGPT has zero prose responses. Missed-mention rates: ChatGPT 89.1%, Perplexity 81.8%.
**With 51.5% of the panel single-token, roughly half the measured population sits inside the failure mode.**
---
## 10. The markdown ordering finding — now confirmed
This is no longer a hypothesis. The code establishes it:
1. `normaliseResponseText()` lowercases and normalises the response
2. it removes `**`
3. it removes remaining `*`
4. `contextRe` is then applied to the already-normalised text
5. `contextRe` still contains a `\*\*\s*` alternative
**The bold-marker branch of the context regex is dead code — it tests for characters that have already been stripped.**
Two constraints on how this is used:
- Do not attribute the ChatGPT/Perplexity difference to it. The code establishes the ordering; the causal explanation requires the labelled data.
- Do not fix it yet. A one-line change to a live measurement rule, applied before adjudication, destroys the ability to say what the old rule was actually doing.
---
## 11. Ground-truth work already completed
`buildMentionGroundTruth.js` has been run (PR #160, seed 20260811). It sampled 150 runs (78 Perplexity, 72 ChatGPT), covering all 68 prompts and all 136 cells, producing 10,605 target rows: **10,136 agree, 469 disagree**.
All 469 disagreements are single-token. Zero are multi-token — the dispute is entirely the list-context rule.
**The artefact exists.** The script writes a local CSV at `data/experiments/mention-ground-truth-sample.csv`, including an empty `human_verdict` column. It was designed for human labelling.
An informal first pass suggested ~56% of disputed rows looked genuine. That is not a reproducible estimate and must not be cited as one.
---
## 12. The one remaining code question
Q1 (markdown ordering) and Q2 (ground-truth artefact) are now answered. Only the taxonomy question remains.
```
Read-only inspection of scottk-sour/ai-procurement-backend.
Do not modify, create files, branch, commit or deploy. Do not connect to
the database. Audit and report back before writing anything.
If any answer cannot be verified from the repository, say exactly what is
missing and stop that line. Do not infer, estimate or invent.
Q3 — Prompt taxonomy mapping
From data/experiments/exp001-config.json, produce one table with a row per
prompt: promptId, city, exact prompt text, and any explicit
specialism/practice-area/category/intent field present on that prompt.
- State whether practice area exists as an explicit field or must be derived.
- Report the count of distinct cities and the count of prompts per city.
- Report every distinct practice-area value and which promptIds carry it.
- Report whether an explicit intent field exists. If not, say so and do not
  infer one from the wording.
Do not reconcile "4 prompts per city", "7 practice areas" and "17 specialism
prompts" by assumption. Show what the file contains.
Q4 — Labelling-view feasibility
For data/experiments/mention-ground-truth-sample.csv:
- List every column header.
- Report the row count.
- State whether the file contains enough surrounding response text to
  adjudicate a match, or only the firm name and a verdict flag.
- State whether rows where the current matcher returned mentioned:true are
  present in the file, or whether only the sampled/disputed rows are.
- State which columns would reveal the matcher outcome or the substring
  outcome to a human labeller.
Report only what the file contains. Do not modify it.
Output: a short report under these two headings. No recommendations.
```
Q4 determines whether the 200-row export is a filtering job on an existing CSV or a backend change requiring a manual Render deploy.
---
## 13. Three sampling frames — the critical distinction
This is where the next arithmetic error would come from. Three different populations are in play and they must not be mixed.
**Frame A — the ground-truth sample.** 469 disputed rows, drawn from 10,605 target rows across a 150-run sample of wave 1.
**Frame B — the full wave 1 corpus.** ~4,368 discarded single-token candidates (5,101 − 733), from `responseFormatAudit.js` operating over ~50,000 single-token targets across all 1,360 wave 1 runs.
**Frame C — the published figure.** TAI-R-2026-002 reports 1,214 firms, 40 eligible answers each, 48,560 firm-answer observations, 1,003 never named (82.6%), 2,279 mentions (4.69%). **This is wave 2, Perplexity only.** The 40 eligible answers per firm is 4 prompts × 10 runs × 1 platform.
The consequences:
1. Do not multiply a Frame A rate by 469 and call the result a corrected wave 1 figure. Before extrapolating from A to B, establish representativeness across platform, prompt/cell, token mix and response structure. If it cannot be established, report the sample-frame result separately.
2. **More importantly: 252 of the 469 disputes are ChatGPT rows, and ChatGPT contributes nothing to the published 82.6%.** Only the 217 Perplexity disputes speak to Frame C. If the goal is to decide whether 82.6% survives, a 150-row sample drawn evenly across the 469 will spend more than half its labelling effort on an arm that does not affect the published number.
**Therefore stratify Stratum A by platform and record the split.** Either draw all 150 from the 217 Perplexity disputes, or draw a pre-specified split (for example 100 Perplexity / 50 ChatGPT) and report the two arms separately. Decide and record this before sampling — do not leave it to a blind random draw.
---
## 14. Labelling pre-registration
Freeze this before any export is produced.
### Purpose
Validate the EXP-001 mention classifier against human adjudication, with particular attention to the single-token context-rule failure mode.
### Sampling frame
**Stratum A — disputed rows.** 150 rows from the 469 current-matcher-NO / substring-YES disagreements, stratified by platform per section 13. Records the *disputed-case REAL rate* — not, initially, the overall false-negative rate.
**Stratum B — current positives.** 50 rows where the current matcher returned `mentioned: true`. Provides a reproducible false-positive assessment and supersedes the informal Q5.1 exercise.
Separate recorded seeds. **Do not combine the two denominators when calculating rates.**
### Labels
- **REAL** — the panel firm is genuinely named
- **FALSE** — the match is a fragment, generic word, or a different entity
- **AMBIGUOUS** — the supplied context does not allow a reliable determination
AMBIGUOUS is never forced into either category. The ambiguous rate is itself a finding.
### AMBIGUOUS bounds — fixed before labelling
- Lower bound: every AMBIGUOUS counted FALSE
- Upper bound: every AMBIGUOUS counted REAL
- **No midpoint estimate is used as the primary result**
If the bounds straddle a decision threshold, the conclusion is *"sample too uncertain to determine"*. Do not select the midpoint retrospectively.
### Blinding
1. Draw Stratum A (150) and Stratum B (50)
2. Attach a hidden stratum identifier
3. Merge into one 200-row set
4. Shuffle with a recorded seed
5. Remove the stratum column from the labelling view
6. Keep the key in a separate file
7. Label all 200 in one sitting
8. Do not open the key until every label is complete
### Labelling view
Per row: promptId, platform, panel firm name, normalised core, token count, ±250 characters around the candidate with >>> <<< around the candidate span.
Do not expose the full response, the matcher outcome, the substring outcome, or the stratum.
### Outputs
Report, split single-token vs multi-token where the sample supports it:
1. Disputed-case REAL rate, with AMBIGUOUS bounds
2. Current-positive FALSE rate, with AMBIGUOUS bounds
3. Substring-only false-positive evidence from the adjudicated disputes
4. Recomputed mention count and rate under any validated replacement rule — calculated after adjudication, never during
Record the sampling denominator, both seeds, the platform split, and the shuffle seed alongside the results.
---
## 15. The August report — disclose now, correct later
TAI-R-2026-002 is live at `/resources/ai-visibility-report-solicitors-august-2026` and is driving traffic. Its 82.6% figure depends on the classifier now under validation.
The likely direction of correction is **down, not up**. The dominant known error is false negatives — the context rule discards ~85.6% of apparent single-token candidates. If most of those are genuine, more firms were named than the matcher recorded, and the never-named share falls. That makes the story less dramatic, not more. Do not defend the number because it is published.
**Add a dated limitations note now,** after checking what limitations text the page already carries (it has a companion deviations page at `/research/solicitors-august-2026/deviations`). The factual basis for the note is already established independently of the adjudication:
> The mention classifier is currently under validation, particularly for single-token firm names. 51.5% of the measured panel resolves to a single-token name after normalisation, and a substantial proportion of apparent single-token candidates are excluded by the current context rule. The published mention figures may be restated following validation.
Do not change the URL. Do not silently alter the figure. Do not wait for the recomputation before disclosing a limitation that is already a measured fact.
If the rule changes: preserve the original result, compute the corrected result, publish both side by side, and log the change with a date and a reason in the methodology changelog.
---
## 16. ChatGPT instrument discontinuity
Wave 1's ChatGPT arm ran on `gpt-4o-mini-search-preview`, since retired. That measurement can never be reproduced on the same instrument.
- **Wave 1 ChatGPT is a closed historical series.**
- Any new ChatGPT collection is a new series requiring its own baseline.
- Never concatenate old and new ChatGPT results as one time series.
Replacement tested working 25/08/2026: pin the snapshot `gpt-5-search-api-2025-10-14` rather than the alias. Model tier undecided; the agreed approach is a 24-call pilot (12 prompts, two tiers) before committing.
**Standing lesson:** the instrument was hash-verified byte-identical and still changed underneath the study, because the model belongs to someone else. Record "which model, on which date" as part of the methodology, and pin snapshots.
---
## 17. Recommendation Dataset — the real blocker is the data path
The experiment corpus holds the evidence a customer-facing product would need: full response text, cited URLs, prompt, platform, model, targets.
But that evidence is isolated from the product:
- `ExperimentRun` is CLI-only, unreachable from any route or cron
- `AeoReport` has no citations field in its sub-schema, so Mongoose silently drops cited URLs on save
- `AIMentionScan.responseSnippet` truncates to 500 characters; `AeoReport.rawResponse` to 4,000
- Historic `competitorsMentioned` is populated from an alphabetically sorted candidate list, not parsed from model output, and is not usable as competitor data
**So the first build is not the open-set competitor extractor. It is the data path that carries raw model evidence into the product.** Build order:
```
raw ExperimentRun evidence
  → product-accessible evidence path
  → validated closed-set measurement
  → open-set recommendation extraction
  → competitor intelligence
```
The closed-set matcher must be validated first, because its name-normalisation lessons are exactly what the harder open-set problem will need.
---
## 18. The commercial output this points to
Not "your AI visibility score is 27", but:
> "We tested the four questions people ask about solicitors in your city. AI recommended you for one. For the other three, these firms appeared instead. These are the sources those answers relied on."
That is tangible to a solicitor and does not require proving *why* those firms won. It requires only that the measurement is trustworthy — which is what the adjudication decides.
The exact wording depends on the Q3 taxonomy result. Do not write client-facing coverage copy until the prompt-ID → city → practice-area mapping is known.
---
## 19. EXP-002 — a decision, not a drift
The 12 posts are written and sit in open PR #124 (opened 19/07/2026, checks passing, no conflicts). The merge gate is Scott's own review; 2 of 12 read so far.
Publishing the posts and running EXP-002 are separable decisions, **but publishing them ends EXP-002 as designed.** Outstanding before any merge: the hardcoded `publishedDate` of 03/08/2026 is now false; the measurement diary slips with the real merge date; two shared-section claims and the cloaking-adjacent line in post 2b are unfixed; and four extension sections are byte-identical within each pair, so Google may canonicalise one post of a pair away — an indexation-verification and pre-specified exclusion rule is needed before merge.
Make this choice deliberately. Do not let it happen while the research programme is being cleaned up.
---
## 20. What not to do yet
- Launch another causal intervention experiment
- Split the panel into underpowered intervention groups
- Build the open-set competitor extractor
- Build crawler-dependent experiments
- Fix the markdown ordering bug before adjudication
- Claim EXP-001 proved the schema intervention worked
- Treat Searchable as experimental evidence
- Defend 82.6% as settled, or change it silently
- Concatenate ChatGPT wave 1 with a later model
- Treat the existing z-test as valid causal significance
- Describe the EXP-001 treatment as a functioning intervention
---
## 21. Action order
1. **Run the two-question read-only check** (Q3 taxonomy, Q4 CSV feasibility). No database, no code changes, no export.
2. **Freeze the labelling protocol** — seeds, platform stratification, denominator frame, AMBIGUOUS bounds, blinding, exact outputs. Commit it to the repository before the export exists.
3. **Export and label 200 rows** — 150 disputed (platform-stratified) + 50 current positives, merged, shuffled, blinded.
4. **Quantify matcher performance** against the pre-registered outputs.
5. **Test any revised rule** against the adjudicated evidence — old rule vs revised rule, not a deployed one-line fix.
6. **Recompute wave 1** if justified: preserve the original, compute the corrected, document the change, publish both.
7. **Decide on TAI-R-2026-002** — survives, needs qualification, or needs correction.
8. **Build the raw-response → product evidence path.**
9. **Recommendation Dataset v1.**
10. **Open-set extraction**, then properly powered causal experiments.
The dated limitations note (section 15) runs in parallel and does not wait for step 7.
---
## 22. Bottom line
TendorAI has a proprietary corpus of AI answers measuring how UK solicitor firms are represented in recommendation queries. That is the asset.
The immediate job is not to make the research sound stronger. It is to establish how trustworthy the measurement is.
Two limitations dominate:
1. The EXP-001 treatment contrast failed, so it cannot establish the intended causal effect.
2. The mention classifier has a demonstrated single-token failure mode with a confirmed dead branch in the context regex, and its true error rate has not been formally adjudicated.
**The 150 disputed + 50 positive adjudication is the gate between the research you already have and the product you can defensibly build on it.**
