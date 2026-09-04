# TendorAI Research Programme
## UK AI Visibility Research Framework v1.0

**Version:** 1.0
**Date:** 20 August 2026
**Status:** Frozen methodology framework
**Owner:** TendorAI Ltd
**Primary research population:** UK solicitors
**Commercial model:** TendorAI managed AI visibility service

*This document is frozen. Changes are made by issuing v1.1 with a dated changelog entry stating what changed and why. The next artefact is the Census Methodology v1.0, not a revision of this.*

---

## 1. Purpose

TendorAI's objective is to become the leading empirical authority on how AI systems discover, represent, cite and recommend UK solicitors.

The objective is not to claim TendorAI already knows what makes AI systems recommend a firm. It is to build the strongest continuously updated evidence base for answering that question.

TendorAI will:

- measure AI visibility repeatedly using an unchanging method;
- establish how much the measurement varies when nothing changes;
- describe the UK solicitor market;
- identify associations without presenting them as causes;
- conduct controlled experiments where the design supports them;
- replicate findings before treating them as reliable;
- publish positive and negative findings alike;
- state, for every finding, whether it was observed, associated, experimentally demonstrated or replicated.

Authority comes from accumulated evidence, not from premature certainty.

## 2. Infrastructure boundary

TendorAI does not need to own every component of the technology stack to own the resulting knowledge. Third-party monitoring infrastructure may be used for commercial delivery where it saves TendorAI from rebuilding plumbing.

**But there is a hard boundary, and it is not negotiable.**

Any figure TendorAI publishes must be produced by a method TendorAI controls and can restate. The moat is the same measurement repeated. A third party can change its prompt handling, platform mix, model versions or extraction logic between one edition and the next, and TendorAI may not be told. That silently destroys comparability, which is the only thing the research programme actually owns.

**Research-critical layer — TendorAI controls, always:**
prompts; population and sample; collection schedule; platform and model identity; raw responses; extraction and classification; scoring; methodology version; run identity; reproducibility.

**Delivery layer — third-party infrastructure permitted:**
client dashboards; client-facing monitoring; alerting; reporting presentation; agency-style operational tooling.

A number that appears in a published TendorAI study never comes from the delivery layer.

## 3. What TendorAI is trying to become

Not: *"TendorAI knows exactly what makes AI recommend solicitors."*

But: *"If there is an important question about how AI systems recommend UK solicitors, TendorAI has the deepest evidence base for answering it."*

Models change. Retrieval changes. Websites change. Conclusions become obsolete. A research authority is not weakened when an earlier conclusion stops holding — it is strengthened, provided it documented the original finding, disclosed the method, identified when the evidence changed, published the correction, and stated what replaced it.

## 4. Evidence hierarchy

Every finding carries an evidence level.

**Level 1 — Observation.** We observed X. Descriptive only.
*Example: 7.2% of firms in the sampled population were named.*

**Level 2 — Correlation.** X was associated with Y. No causal claim.
*Example: firms with published pricing were named more frequently. This does not mean pricing caused it.*

**Level 3 — Controlled experiment.** We changed X under controlled conditions and observed a change in Y relative to an appropriate comparison. Evidence towards causation.

**Level 4 — Replicated experiment.** A controlled finding reproduced under a separate valid test. The strongest current TendorAI category.

The ladder stops at four. More repetitions improve confidence; they do not create new categories of rigour.

## 5. Research rules

**Rule 1 — Observation is not causation.** Observational datasets describe associations. They cannot claim a characteristic causes AI visibility.

**Rule 2 — Correlations are explicitly labelled.** Every published correlation is described as an association, with material confounders disclosed.

**Rule 3 — No fishing for headlines.** Primary analyses and reporting cuts are determined before the data is inspected. Post-hoc findings may be published, labelled exploratory.

**Rule 4 — Preserve raw observations.** Individual observations are retained wherever technically and legally appropriate. Aggregates never replace run-level data.

**Rule 5 — Version everything that produces a number.** Every collection identifies its methodology version, its collection code version and its classifier version. Method changes are documented. Old results are never silently overwritten.

**Rule 6 — Never delete research questions.** Questions stay in the register permanently. Obsolete or unanswerable questions have their status changed and the reason recorded.

**Rule 7 — Negative findings are research assets.** Failed experiments are retained and published. TendorAI does not publish only what worked.

**Rule 8 — Platform differences are preserved.** "AI visibility" is not one homogeneous behaviour. Each platform is a separate research subject.

**Rule 9 — Analyse at the level the design supports.** With ten runs per cell, ordinary sampling noise on a single cell is roughly ±3 of 10. Individual firm movements below that are uninterpretable. Experimental comparisons are pooled across cells, not read firm by firm.

## 6. What TendorAI can actually observe

Terminology must remain precise.

**Mention.** The firm's name appears in an answer, as determined by the documented classification procedure. Name matching must distinguish the target firm from generic name fragments and from different firms with similar names. Validation of the classifier is part of the measurement methodology, not an optional extra. A mention is not "a substring exists".

**Recommendation.** The firm is presented as an option for the user's stated need.

**Citation.** A URL is explicitly cited in the answer.

**Position.** The firm's relative position within the answer, where the methodology supports measuring it.

**Server-side retrieval.** A crawler or other system makes a request to a firm's infrastructure.

These are different events. A cited URL is not proof the page was retrieved by the model. Server-side retrieval can only be established from request logs.

## 7. Research Question Register

The controlling research backlog. Questions are answered in order. A question is never promoted because its answer would be commercially convenient.

### TIER 0 — Can we measure at all?

Nothing below this tier is fully interpretable until the measurement's natural behaviour is understood.

**Q0.1 — How much does the same measurement vary when nothing changes?**

*Provisional result, 19 August 2026.* Analysis of EXP-001 Wave 1 controls (1,360 runs, status ok; 4,888 control cells defined as promptId × platform × target URL; 2,444 cells per platform across ChatGPT and Perplexity):

- 4,617 cells (94.5%) were never mentioned in any of ten runs.
- 271 cells were mentioned at least once.
- Of those 271, 212 (78%) were mixed rather than unanimous; only 59 were 10/10.

**Status: provisional. Not for publication.** Q5.1 subsequently identified false positives in the mention classifier, so the 271 figure is inflated by an unknown amount and part of the observed instability may be classifier noise rather than platform behaviour. To be recomputed after classifier correction, with the original figures restated alongside.

**Q0.2 — Does variance differ by platform?**

*Provisional result, 19 August 2026.* ChatGPT: 79 cells mentioned at least once, 34 unanimous (43%). Perplexity: 192 cells mentioned at least once, 25 unanimous (13%). Perplexity produced roughly 2.4× more mentions than ChatGPT and was substantially less stable.

**Status: provisional**, subject to the same classifier caveat as Q0.1.

**Q0.3 — Does variance differ by prompt?** Open.

**Q0.4 — Does variance differ by firm?** Open. Note the likely confound: firms with generic names are both more prone to classifier false positives and harder to measure reliably.

**Q0.5 — How much observed variance is timing or caching rather than real variation?** Wave 1's ten runs per cell sat within a single collection window, so the Q0.1 result measures within-session variance only and is a floor, not the full figure. Requires a dedicated variance panel with runs distributed across days and times of day. Status: requires dedicated collection.

**Q0.6 — What size of change is required before calling an observed movement meaningful?** The output of Q0.1–Q0.5, and the threshold every subsequent experiment is judged against. Blocked on the above.

### TIER 1 — What does the market look like?

Descriptive research. No causal conclusions. These form Census Edition 1.

**Q1.1 — What proportion of solicitor firms *within the defined Census population* are named by AI systems?**

The population is defined in Section 10. The current 68-prompt design embeds the city dimension within the prompt set rather than independently sampling every UK firm–city combination, so firms outside the sampled geography have no opportunity to be named. No national estimate may be published unless the final sampling design genuinely supports one.

**Q1.2 — How concentrated are recommendations?** Share of observed mentions going to the top 10, 20 and 50 firms.

**Q1.3 — How much overlap exists between platforms?** Note: Wave 1 and Wave 2 of EXP-001 cover ChatGPT and Perplexity only. Any cross-platform claim states which platforms were measured.

**Q1.4 — Does geography affect observed visibility?**

**Q1.5 — Does firm size affect observed visibility?**

**Q1.6 — Does practice area affect observed visibility?**

**Q1.7 — When a firm is named, what sources are cited?** Own website, directory, review platform, press, map/business-listing data, other, or no citation. Early inspection of Wave 1 responses suggests ChatGPT frequently cites map-listing URLs rather than firm websites; if that holds across the census it materially changes where implementation effort should go.

**Q1.8 — How often does an AI system name no firm at all?** Likely a large category and rarely reported by anyone in this market.

**Q1.9 — What proportion of firms have websites that can be meaningfully accessed and read?** Blocked crawlers, JavaScript-only content, no site.

**Q1.10 — How frequently do publicly displayed firm details disagree with the SRA register?** Desk research against data already held.

### TIER 2 — What is associated with visibility?

Correlational only. Never converted to causal claims without controlled evidence. Reporting cuts fixed in advance per Rule 3.

**Q2.1 — What characteristics are associated with named firms?**
**Q2.2 — Are directory rankings associated with observed visibility?** Base rate among all firms must be reported alongside.
**Q2.3 — Are published prices associated with observed visibility?**
**Q2.4 — Are question-level pages associated with observed visibility?**
**Q2.5 — Are higher review counts associated with observed visibility?** Confounding by firm size must be addressed explicitly.
**Q2.6 — Is structured data associated with observed visibility?** Distinct from whether it causes visibility.

### TIER 3 — What actually changes visibility?

Controlled experiments. Prioritise TendorAI-controlled `/solicitors/[firm]` pages so client websites are not required.

**Q3.1 — Does adding structured data change observed visibility?** EXP-001. Wave 2 launched 19 August 2026.
**Q3.2 — Does a direct-answer opening change observed visibility?**
**Q3.3 — Do specific figures and named entities change observed visibility?**
**Q3.4 — Does increased page completeness change observed visibility?**
**Q3.5 — Does entity consistency change observed visibility?**
**Q3.6 — Do interventions affect platforms differently?**
**Q3.7 — What interventions produce no measurable change?** All failures enter the permanent negative-results register.

### TIER 4 — Timing

Requires longitudinal data. No published measurement anywhere supports a specific answer, including TendorAI's. Any timeline quoted without a method behind it is a guess.

**Q4.1 — How long after a website change is a relevant crawler observed requesting the page?** Directly measurable from server logs for OAI-SearchBot, PerplexityBot and Google-Extended hits on a changed URL. Immediate action: establish whether existing infrastructure captures bot requests at all.
**Q4.2 — How long after fetching does the change appear in answers?**
**Q4.3 — How long until an effect becomes consistent rather than occasional?** The commercially meaningful version.
**Q4.4 — Does an effect persist or decay?**
**Q4.5 — Do timing patterns differ between platforms?**

### TIER 5 — Is our own instrument trustworthy?

**Q5.1 — Does the automated classifier agree with independent assessment?**

*Provisional result, 19 August 2026.* Fifty EXP-001 Wave 1 observations across 35 distinct prompts, adjudicated by an automated second-opinion check rather than hand-labelled.

- 46/50 in agreement.
- 4 false positives (16% of the 25 positive flags).
- 0 false negatives observed (0% of the 25 negative flags).
- Over-matched firms: Bradford Law Solicitors Ltd, C L Legal Ltd, May Solicitors Ltd, Henry Hyams Ltd — all containing generic tokens once suffixes such as LIMITED and SOLICITORS are normalised away.

**Known limitations of this validation:**
1. Not hand-labelled.
2. The sampler selected the first matching target in each run, so the 25 positive samples are drawn from a small set of repeatedly-selected firms. The 16% figure is not a reliable estimate of the classifier's overall error rate.
3. Did not adequately test false negatives from trading names, abbreviations or alternative firm names.
4. Did not test different firms with similar names — an error mode invisible to this design, because the similar name genuinely appears in the text.
5. Zero misses in 25 negative samples is thin evidence given negatives are 94.5% of all observations; a systematic blind spot would not surface in a sample this size.

**Consequence:** Q0.1 and Q0.2 are provisional and not for publication. After Wave 2 completes, the matcher is inspected and corrected, the corrected classifier is independently validated against a purpose-built set, and both waves are rescored with original figures preserved.

**Corrected-classifier validation must deliberately include:** generic-fragment false positives; trading-name and abbreviation false negatives; different firms with similar names; URL-only appearances; legitimate name variants (Ltd/LLP, & vs and, with and without "Solicitors"). Sample distinct firms, not distinct runs.

*Note: `scripts/experiments/buildMentionGroundTruth.js` and `tests/unit/experimentMentionMatcher.test.js` already exist in the repository. Review their coverage before building new validation tooling.*

**Q5.2 — Has the classifier changed between waves?** Every result must carry classifier provenance. The recompute scripts mutate stored classification flags with no version record, which is the specific risk this question exists to close.

**Q5.3 — Does prompt wording affect results more than firm characteristics?** If yes, this is the most important finding in the programme and it constrains every AI visibility score on the market, TendorAI's included.

**Q5.4 — Are the prompts representative of real solicitor searches?** Chosen by TendorAI. Remains an explicit published limitation unless validated.

**Q5.5 — What lawful basis and retention period applies to stored responses naming firms and individuals?** Must be established before publication or long-term retention. TendorAI is ICO-registered; the methodology states lawful basis, retention period, and whether raw response text is published or only aggregates.

## 8. EXP-001 operating requirement

**Wave 2 runs using the existing classifier unchanged.** This preserves comparability between treatment and control and avoids introducing a scoring-method change between experimental waves. A classifier that over-matches affects both arms equally; a classifier that changes mid-experiment does not.

**Provenance is a hard requirement.** Classifier commit SHA and collection code/configuration commit SHA are recorded before any wave begins. No wave may rely on an unrecorded or subsequently ambiguous classifier version.

### Wave 2 record

```
Study:            study_2026_07_exp001
Wave:             2
Launched:         19 August 2026
Platforms:        perplexity, chatgpt
                  (Gemini deliberately excluded to match Wave 1;
                   if added later it begins as its own series)
Config:           data/experiments/exp001-config.json
Runs per cell:    10
Expected volume:  1,360 runs
Pre-launch check: 0 existing Wave 2 rows

Classifier:       scripts/experiments/lib/mentionMatcher.js
                  @ dfe65dbac4a811680239f33c8d35bcea6e52e14c (14/08/2026)
Collection code:  scripts/experiments/runExperimentScan.js
                  @ dfe65dbac4a811680239f33c8d35bcea6e52e14c
Deployed tree:    dfe65dbac4a811680239f33c8d35bcea6e52e14c
Working tree:     clean

Known limitation: mention flags carry the Q5.1 false-positive rate
                  documented above. Rescore after correction.
```

### Every run retains its underlying observation

The system must not retain only "Wave 1 = 3.3%" or "Control average = 2.8%". It retains the individual run-level observations necessary to reconstruct any aggregate.

Each observation should be associated with: experiment ID; wave ID; run identity; firm; treatment/control status; city; prompt; platform and model; timestamp; raw response where permissible; extracted mention result; citation result; recommendation result where measured; classifier/scoring version.

*Current implementation gaps, recorded rather than fixed mid-experiment: no `scoringVersion` field, no `city` field (derivable from promptId), no `firmId` (targets identified by URL and entity name), no run ordinal (documents distinguished by `_id` and `runAt`). Addressed after Wave 2.*

**Aggregates are outputs. They are not the primary research record.**

## 9. Dedicated variance study

EXP-001 controls provide the first tranche of variance information. They are not a substitute for a dedicated panel, because they measure within-session variation only.

Starting design — repetition over breadth:

> ~10 prompts × ~3 cities × selected platforms × 20+ repeated runs

with identical firms, identical wording, identical scoring, and **runs distributed across multiple days and times of day**. Consecutive identical prompts within a single session can return near-identical output; a variance figure derived from a single sitting will understate real movement and make every future experiment look more significant than it is.

**Cost gate.** Before execution: cost 20, 30 and 50 repetitions. The objective is an efficient estimate of measurement noise, not a maximised sample.

## 10. Census Edition 1

Methodology frozen and published before collection begins.

**Methodology v1.0 must specify:** population; sample; prompts; cities; platforms; collection window; inclusion and exclusion rules; **regulatory-population handling**; scoring; mention definition; recommendation definition; citation definition; missing-response treatment; error handling; duplicate handling; primary outputs; predefined subgroup analyses; data protection basis and retention; limitations. Dated and versioned.

### Regulatory-population handling

Wave 1 responses returned CLC-regulated conveyancers and other non-SRA providers in answer to solicitor prompts. If the research population is SRA-authorised firms but the answer population includes other providers, the denominator and the numerator describe different things.

Every named organisation in a census response is classified as:

1. SRA-authorised solicitor firm
2. Other regulated legal or conveyancing provider (CLC, CILEX, etc.)
3. Non-regulated provider
4. Unidentified or ambiguous

Category counts are reported. The headline figure states which categories it covers.

### Cost gate

Wave 1 arithmetic (68 prompts × 2 platforms × 10 runs = 1,360 runs) confirms the 17 cities are embedded within the 68-prompt set, not multiplied by it. A census edition at three platforms is therefore in the order of 2,040 calls, not the tens of thousands previously assumed.

Before Methodology v1.0 freezes: cost Edition 1, cost Edition 2 at the same volume, include retries and failed calls, and confirm Edition 2 is affordable **before** Edition 1 starts.

**Pre-commitment:** if both editions do not fit the budget, cut breadth, not repetition. Six cities measured twice beats seventeen measured once. Repetition is the moat; breadth is a larger single snapshot.

## 11. Pre-registered Census outputs

Defined before the results are seen.

**Primary cuts:** geography (city/region); firm size bands; platform (each platform included in the final methodology, named explicitly — not assumed to be three); concentration (top 10, 20, 50).

**Core outcomes:** mention rate; recommendation rate; citation rate; no-recommendation rate; non-SRA-provider rate.

Analyses discovered after collection are published as **exploratory analysis**, never presented as pre-specified findings.

## 12. Edition 2 and reproducibility

Edition 2 is not a new study. It is a repeat measurement.

Edition 2 must be executable using the same methodology and substantially the same collection process as Edition 1. The pipeline must be automated enough that the second edition is a rerun, not a rebuild.

**Engineering acceptance criterion:** one documented command or process executes the census and produces the standardised output structure. No manual spreadsheet manipulation, no hand-selecting firms, no copying prompts, no editing configuration by hand.

**Practical prerequisite:** the census prompt and city configuration must live in the repository as a versioned file. Configuration that lives in a spreadsheet or in someone's head makes Edition 2 impossible before Edition 1 has collected anything.

**The same principle applies to experimental waves.** Classifier version and collection code/configuration version must be identifiable for every wave. No wave may rely on an unrecorded or ambiguous classifier version.

## 13. Negative-results register

Begins immediately. Every failed or null result records: hypothesis; intervention; population; methodology version; classifier version; measurement period; result; evidence level; conclusion; limitations; whether replication is warranted.

Entries are never deleted. A later contradictory result does not erase the original: original result → subsequent evidence → updated interpretation.

The market is saturated with "ten things you must do for AI search" and almost empty of "we tried it and it didn't work". The second is more useful and nobody else is publishing it.

## 14. Research and commercial run in parallel

The research programme is not a three-month pause before selling. It is the authority layer of a commercial business, and it produces no revenue on its own.

**Research track:** EXP-001 → variance → Census Edition 1 → publication → Census Edition 2

**Commercial track:** product remediation → £999 offer → sell → implement → measure → revenue

Neither is allowed to consume the other.

## 15. The £999 service proposition

Not positioned primarily around schema.

The proposition: *measure a firm's AI visibility, identify opportunities, implement changes, and measure whether those changes made a meaningful difference.*

Schema is one implementation mechanism — machine-readable identity and register alignment — and honest as hygiene. It is not the promise unless the evidence eventually earns it that position. The current evidence does not: the largest controlled test in the field found no effect for already-cited pages, and the industry's headline figure has no traceable primary source.

TendorAI provides interpretation, strategy, implementation, research-backed recommendations and accountability.

### Outreach constraint

Until Census Edition 1 and its methodology are published, outreach uses market-level findings only. Firm-specific claims — "your firm is invisible to AI", "we measured you at X" — make a public assertion about a named regulated firm derived from a prompt set TendorAI chose. That claim must survive scrutiny by someone whose profession is picking apart evidence. After publication, with limitations clearly stated, individual findings can be used confidently.

## 16. Immediate commercial blockers

Active regardless of research progress.

1. **Dead DNS.** `api.tendorai.com` does not resolve. Every installed embed pointing at it is dead, and `llms.txt` advertises an endpoint that does not exist. Ten-minute fix.
2. **Schema ownership defects.** `@id`, `url`, `sameAs`, `isPartOf`, `memberOf` and `potentialAction` all point at TendorAI on pages served from client domains. Plus fabricated data: unsourced aggregate rating, incorrect `areaServed` geography, nonsensical `priceRange`, legacy office-equipment properties, a personal email address. Resolve before schema features in any commercial promise.
3. **Unsupported 3.2× claim.** Currently published. Remove, correct or substantiate. The strongest version keeps the URL and tells the provenance story: the figure was published, its source was traced, three incompatible origins were found and no primary located.
4. **£999 proposition.** Headline moved from schema to content and measurement.

## 17. What TendorAI will not build yet

Deferred to protect the solo-founder constraint:

- a large independent crawling and enrichment operation;
- a many-variable observational causal model (this is precisely how untraceable industry statistics are manufactured);
- 10–20 simultaneous experiments;
- client-dependent experiments;
- a dedicated research portal;
- anything named to imply access to model retrieval;
- elaborate research naming systems;
- a multi-year replication programme.

Appropriate later. Not requirements for the first 90 days.

## 18. The 90-day programme

**Phase 1 — Immediate**
EXP-001 Wave 2: controls measured every wave; per-run observations retained; treatment/control verified; timestamps preserved; classifier and collection provenance recorded. *Complete — Wave 2 launched 19 August 2026.*
Q4.1: establish whether bot request logging exists.
Q5.1: first validation complete and recorded as provisional.
Commercial: DNS, 3.2× blog, schema ownership, £999 repositioning.

**Phase 2 — Establish measurement reliability**
Correct the matcher. Validate the corrected classifier against a purpose-built set. Rescore Waves 1 and 2. Recompute Q0.1–Q0.4, restating original figures alongside. Design and cost the Q0.5 variance panel. Establish the Q0.6 threshold.

**Phase 3 — Census Edition 1**
Freeze and publish Census Methodology v1.0. Confirm the cost gate. Collect. Report only pre-specified analyses as primary findings.

**Phase 4 — Publish**
Methodology, dataset scope, findings, platform differences, limitations, evidence classification, and negative or uncertain findings. Uncertainty is not hidden.

**Phase 5 — Census Edition 2**
Repeat after approximately 30 days. The methodology is not quietly improved between editions. If a change is unavoidable, it is documented and comparability preserved. Then compare Edition 1 to Edition 2 — the point at which TendorAI holds a longitudinal measurement rather than a single study.

## 19. What success looks like after 90 days

Not "we discovered the secret to AI visibility".

- **Measurement.** TendorAI has established a methodology for quantifying natural variation and has begun measuring it.
- **Instrument.** The classifier has been corrected, independently validated, and its error characteristics published.
- **Dataset.** TendorAI has completed, or is able to complete, a defensible census using a frozen documented methodology.
- **Repetition.** The census can be rerun without rebuilding it.
- **Research.** First evidence-backed findings published with their evidence level stated.
- **Transparency.** The methodology is clear enough that a competent outsider could critique or reproduce it.
- **Commercial.** TendorAI is selling and delivering the £999 service alongside the research.
- **Accumulation.** Longitudinal observations, methodology history, experiments, negative findings and corrections are accumulating in a form that survives staff, tools and time.

## 20. The long-term flywheel

Research → measure the market → discover a question → test it → publish evidence → build authority → generate demand → sell the managed service → implement → measure outcomes → accumulate evidence → improve research → publish again.

The moat is the combination: UK register data + repeated identical measurement + experimental evidence + published methodology + interpretation + implementation + accumulated history. No single element is defensible alone. Third-party infrastructure can sit inside the delivery layer without owning any of it.

## 21. The governing principle

The programme is judged by one question:

> **Are we becoming better at answering important questions about AI visibility without claiming more certainty than the evidence allows?**

TendorAI is not trying to become another agency with opinions about AI search. It is building toward being the organisation that can say:

*"Here is what we observed. Here is what is merely associated. Here is what we tested. Here is what replicated. Here is what failed. Here is what has changed since the last measurement. Here is what we got wrong and when we corrected it."*

That is how the expert position is earned rather than claimed.

---

## Changelog

**v1.0 — 20 August 2026.** First frozen version. Incorporates the 19 August 2026 provisional Q0.1, Q0.2 and Q5.1 results; the classifier over-matching finding and its consequences for publication; the EXP-001 Wave 2 provenance record; the infrastructure boundary in Section 2; the Q1.1 population correction; regulatory-population handling in Section 10; the cost gate and breadth-versus-repetition pre-commitment; the outreach constraint in Section 15; and Rule 9 on analysis level.
