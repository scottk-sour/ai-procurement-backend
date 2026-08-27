EXP-001 Mention Classifier — Labelling Pre-Registration
Frozen: 27/08/2026. No labels drawn or inspected at time of writing.
This document fixes the sampling, labelling and analysis rules before any labelling view is generated. Anything decided after seeing labels is not covered by this pre-registration and must be recorded separately as a deviation.
1. Purpose
Establish the error characteristics of the EXP-001 mention classifier against human adjudication, so that the published figure in TAI-R-2026-002 can be confirmed, qualified, or corrected on evidence rather than assumption.
The specific question: when the current matcher says a panel firm was not named, how often was it in fact named? And secondarily: when it says a firm was named, how often was it wrong?
2. Source data
`data/experiments/mention-ground-truth-sample.csv`, regenerated 27/08/2026 from the Render shell at seed 20260811, reproducing the original run exactly:

* 1,360 wave 1 runs loaded; 150 sampled (78 Perplexity, 72 ChatGPT)
* All 68 prompts and all 136 prompt × platform cells represented
* 10,605 target rows: 10,136 agree, 469 disagree

Disputes by platform: Perplexity 217, ChatGPT 252. Disputes by token category: single-token 469, multi-token 0.
The file is regenerable at any time from the same seed. It is gitignored and 24MB, so it is not committed.
3. Stratum A — disputed rows
Census, not a sample. All 217 Perplexity disputed rows are labelled.
Rationale: the published 82.6% is wave 2, Perplexity only. ChatGPT contributes nothing to it, and the wave 1 ChatGPT arm is a closed historical series that cannot be re-measured, so a ChatGPT error rate would change no decision. Meanwhile 217 rows is only 67 more than the 150 originally planned — roughly half an hour of extra labelling — and taking the whole population removes sampling error from Stratum A entirely.
No sampling seed is required for Stratum A. There is no sample.
The 252 ChatGPT disputes are excluded and left unlabelled. If a ChatGPT rate is ever wanted, it is a separate exercise with its own pre-registration.
4. Stratum B — current positives
50 rows where `current_matcher_result` is true, drawn from Perplexity rows only, stratified 25 single-token / 25 multi-token.
Sampling seed: 20260827b, recorded here before the draw.
Rationale for the token split: single-token and multi-token matches run through different rules. Single-token requires the list-context marker; multi-token uses contiguous substring matching and bypasses that rule entirely. Multi-token produced zero disputes, but agreement between two rules is not evidence that either is correct — both would agree on a firm name appearing inside a longer, different firm's name. That branch has never been tested and this is the first test of it.
If fewer than 25 rows exist in either token category, take all available and record the shortfall.
This supersedes the informal Q5.1 adjudication (~4 apparent false positives, never committed, not reproducible) as the reference false-positive evidence.
5. Blinding
Single-person blinding, mechanically enforced:

1. Assemble Stratum A (217) and Stratum B (50) into one 267-row set
2. Attach the stratum identifier to a separate key file, never the labelling file
3. Shuffle with seed 20260827c
4. Assign `row_uid` as a sequential number after the shuffle, so the identifier encodes nothing
5. The labelling file contains no matcher result, no substring result, no stratum, and no run_id
6. Do not open the key file until every one of the 267 rows carries a verdict

The labeller must not be able to tell whether a row came from the disputed set or the positive set.
Sittings: 267 rows at roughly 30 seconds each is about two and a quarter hours. Two sittings is acceptable provided the key stays closed throughout. Record the number of sittings and the date of each.
6. Labelling view
Each row shows only:

* `row_uid`
* `prompt_id`
* `platform`
* `firm_entity_name`
* `normalised_firm_name`
* `token_count`
* `context_window` — ±250 characters around the candidate occurrence, with the candidate span marked `«…»`
* `occurrence_count` — how many times the candidate appears in the full response
* `human_verdict` — empty, to be filled

Where the candidate string cannot be located in the response text, the row shows the first 500 characters and is flagged `NOT_LOCATED`. These rows are labelled like any other; if the firm is not visible in the window, the correct verdict is AMBIGUOUS.
7. Verdicts
Exactly one per row:

* REAL — the panel firm is genuinely being named
* FALSE — the apparent match is a fragment, a generic English word, or a different entity
* AMBIGUOUS — the supplied context does not permit a reliable determination

AMBIGUOUS is never forced into either category. The ambiguous rate is itself a reported finding.
8. AMBIGUOUS handling — fixed before labelling

* Lower bound: every AMBIGUOUS counted FALSE
* Upper bound: every AMBIGUOUS counted REAL
* No midpoint estimate is used as the primary result

If the two bounds fall either side of a threshold that changes a decision, the reported conclusion is "the sample does not determine this". The midpoint is not selected retrospectively.
9. Enlargement trigger — fixed before labelling
Stratum B at n=50 gives roughly ±14 percentage points at 95%. If Stratum B returns more than 4 FALSE verdicts, the false-positive rate is materially above the informal Q5.1 impression and the stratum is enlarged to 150 before any conclusion is drawn about it.
This trigger is recorded now so that enlargement is a rule rather than a reaction.
Stratum A needs no such trigger. It is a census.
10. Reported outputs
Reported separately for single-token and multi-token where the data supports it:

1. Disputed-case REAL rate (Perplexity, n=217), with AMBIGUOUS lower and upper bounds. Because this is a census, there is no sampling error on this figure — only adjudication error.
2. Current-positive FALSE rate (n=50 or 150), with AMBIGUOUS bounds.
3. Substring-only false-positive evidence from the adjudicated disputes: of the disputed rows, how many the broader substring rule got wrong.
4. Wave 1 recomputed mention count and rate under any validated replacement rule — computed after adjudication, never during.

Recorded alongside every figure: the denominator, the seeds, the platform restriction, the sitting count, and the date.
11. Frames — do not mix
Three populations are in play and each result must state which one it belongs to.

* Frame A — ground-truth sample. 469 disputes (217 Perplexity) from 10,605 target rows across 150 wave 1 runs. This is where the labels come from.
* Frame B — full wave 1 corpus. ~4,368 discarded single-token candidates from `responseFormatAudit.js` across all 1,360 wave 1 runs.
* Frame C — the published figure. TAI-R-2026-002: wave 2, Perplexity only, 1,214 firms × 40 answers = 48,560 observations, 1,003 never named (82.6%).

A rate measured in Frame A does not transfer to Frame B or C without an argument. Before applying the Stratum A rate to the full corpus, establish that the 217 rows are representative across prompt, cell, response structure and normalised-name pattern. If representativeness cannot be established, report the Frame A result on its own terms and say so.
Frame A is wave 1; Frame C is wave 2. The matcher was hash-verified unchanged between them, so the rule is identical — but Perplexity's response formatting in wave 2 was not measured, and that is a stated limitation of any transfer, not a step to skip.
12. What happens to the published figure
Decided in this order, not before:

1. Adjudicate
2. Quantify, with bounds
3. Test the revised rule against the adjudicated labels — old rule versus new, on the same rows
4. If the revised rule is justified: recompute wave 1, preserve the original figure, publish both side by side, log the change with a date and reason
5. Only then decide whether TAI-R-2026-002 survives, needs qualification, or needs correction

The dated limitations note on TAI-R-2026-002 does not wait for any of this. It covers two facts already established: the classifier is under validation, and the prompt set is weighted toward conveyancing (34 of 68 prompts).
Never silently replace a published figure. The URL does not change.
13. Deviations
Any departure from this document is recorded here with a date and a reason, including departures that seem harmless at the time.
(none yet)
