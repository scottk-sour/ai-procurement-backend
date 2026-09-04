# Research Framework v1.0 — Status Addendum

**Date:** 04 September 2026
**Applies to:** UK AI Visibility Research Framework v1.0 (20 August 2026)
**Purpose:** Record what has changed since the framework was frozen, without editing the frozen document.

Framework v1.0 is frozen under its own terms. This addendum records subsequent events and their consequences for specific sections. It does not amend v1.0. Where a v1.0 statement is now superseded, both the original and the current position are stated, per Rule 5.

---

## 1. Section 8 — Wave 2 record is superseded

**v1.0 states:** Wave 2 launched 19 August 2026, platforms perplexity and chatgpt, expected 1,360 runs.

**What actually happened:**

- The 19 August launch reached only 240 ok runs (Perplexity only; ChatGPT never started). Atlas ran out of space and the process was killed. Decision, 24 August: discard the 240 rather than top up, to avoid a wave collected across two windows six days apart. Rows deleted; Wave 1 verified intact at 1,360.
- Wave 2 relaunched clean on 24 August. Instrument verified byte-identical to Wave 1 (`mentionMatcher.js`, `runExperimentScan.js`, `exp001-config.json` all hash-matched across commits).
- The relaunched wave completed with **680 ok runs, Perplexity only**. Every ChatGPT attempt failed (2,040 errors) because OpenAI retired `gpt-4o-mini-search-preview`, the model Wave 1's ChatGPT arm ran on.

**Permanent consequence:** Wave 1's ChatGPT measurement can never be reproduced on the same instrument. The ChatGPT series ends at Wave 1. Any ChatGPT collection from here is a new series on a different model. The Perplexity series is intact and comparable.

**Lesson for the methodology:** the instrument was hash-verified byte-identical and still changed underneath the study, because the model it calls belongs to someone else. Record "which model, on which date" as part of the methodology, and pin model snapshots rather than aliases. Replacement tested and working: `gpt-5-search-api-2025-10-14`.

---

## 2. Section 7, Q5.1 — validation completed and superseded

**v1.0 states:** provisional result from 50 samples, 4 false positives, 0 misses, explicitly flagged as unreliable.

**Completed adjudication, 28 August 2026.** A pre-registered labelling exercise (`docs/research/EXP-001-labelling-preregistration.md`) adjudicated 267 rows: Stratum A was a census of all 217 Perplexity disputed rows; Stratum B was 50 rows the matcher had called positive.

Result: 131 REAL, 126 FALSE, 10 AMBIGUOUS.

- **Stratum A miss rate: 41.5%** (upper bound 43.8%). The matcher rejected 90 genuine mentions.
- **Stratum B false-positive rate: 8.0%** (upper bound 18.0%).

**Direction is the opposite of the v1.0 provisional finding.** v1.0 recorded false positives as the concern. The completed adjudication shows the matcher misses far more real mentions than it invents.

**Two material deviations recorded:** the 267 verdicts were drafted by an AI adjudicator and returned unchanged, so this is AI adjudication accepted wholesale rather than the hand-labelling the pre-registration specifies; and the labelling key was uploaded into the same session as the view, so the blind was not preserved on the adjudicator's side. Neither invalidates the direction. Both belong in the methodology.

---

## 3. Section 7, Q0.1 and Q0.2 — still provisional, for a different reason

v1.0 marked these provisional pending classifier correction. The classifier has now been corrected (see §4), but Q0.1 and Q0.2 have **not** been recomputed under the new rule. They remain not for publication.

---

## 4. Classifier corrected — RETAINED-SUFFIX-SINGLE

Six candidate rules were scored against the 267 adjudicated labels. Total errors across all 267 rows:

| Rule | Errors (AMBIG=FALSE/REAL) |
|---|---|
| RETAINED-SUFFIX | 30 / 32 |
| RETAINED-THEN-BARE | 52 / 48 |
| BOUNDARY-PLUS-RETAINED | 54 / 44 |
| BOUNDARY-BOTH | 62 / 52 |
| BOUNDARY-SINGLE | 63 / 53 |
| CURRENT (as at v1.0) | 99 / 99 |

RETAINED-SUFFIX keeps exactly one generic ending word ("all law", "yorkshire legal") and matches on word boundaries, with no bare-token fallback. It is strictly better than the v1.0 classifier on both axes: 21 misses versus 90, same 9 false positives.

**The place-name problem disappears under this rule.** Boundary matching alone produced 45 false positives, 27 of them place names. RETAINED-SUFFIX produces 5. Requiring the ending word does the work an exclusion list would have done.

**Adding a fallback is actively harmful.** BOUNDARY-PLUS-RETAINED reaches zero misses but re-imports every place-name collision. Do not build it.

The deployed variant is named **RETAINED-SUFFIX-SINGLE** — production applies the retained form to the single-token path only. Regression target on the frozen 267-row fixture: 29 errors.

**Untested path, recorded rather than fixed:** the multi-token branch is a raw substring match with no boundaries. BOUNDARY-SINGLE and BOUNDARY-BOTH differ on exactly one row of 267, so the two rules compared in the original ground truth were identical there and zero disputes was guaranteed by construction. The multi-word path remains untested and this belongs in the published methodology.

---

## 5. Both Perplexity waves recomputed — the published direction is inverted

Recomputes completed 02 September 2026:

- Wave 2 Perplexity: 680 runs, 633 flags changed, 2,279 → 2,328 mentions.
- Wave 1 Perplexity: 680 runs, 905 flags changed, 1,796 → 2,483 mentions.

**Corrected firm-level figures** (generator: `firmMentionSummary.js`, the first committed generator of the published headline; denominator 48,560 confirmed, every firm exactly 40 observations):

| | Never named | % | Mention rate |
|---|---|---|---|
| Wave 1 | 937 of 1,214 | 77.2% | 5.11% |
| Wave 2 | 1,002 of 1,214 | 82.5% | 4.79% |

**Material consequence.** Published report TAI-R-2026-002 states visibility rose July → August (3.70% → 4.69%, +0.99pp). On the corrected instrument it fell (5.11% → 4.79%, −0.32pp), with 65 more firms invisible. The old matcher under-counted Wave 1 by 38% and Wave 2 by 2%, so the apparent rise was an artefact.

**Honest framing for any restatement:** not "visibility fell". The apparent rise was an artefact and there is no reliable movement either way.

**Still outstanding:** the +0.60pp control drift and the +0.79pp difference-in-differences rest on the old flags and must be recomputed by group. Wave 1 ChatGPT is still on old flags and, per §1, cannot be re-collected on the same instrument.

---

## 6. Section 7, Q3.1 — EXP-001 did not test what it was designed to test

TendorAI vendor profile pages are listing stubs: firm-specific content is only written once a firm joins. In both waves the treatment pages held nothing an assistant could cite in answer to "best conveyancing solicitors in [city]".

EXP-001 therefore did not test whether a TendorAI profile helps. It tested whether an empty one does. This explains the zero citation rate structurally — Perplexity never once cited a TendorAI vendor page across 48,240 treatment cells in either wave — and belongs in any restatement of the zero-citation finding.

A prior finding compounds this: the intended treatment/control schema contrast was never implemented as designed. All vendor profiles already rendered a baseline LegalService block, so the additive EXP-001 block produced a duplicate on treatment rather than a contrast.

**Open design question, unresolved:** EXP-001 measures whether a TendorAI *directory listing* helps, which is the procurement-era model. The £999 managed service changes the client's own site and third-party sources — and Compare My Move, ReviewSolicitors and local directories were the actual cited sources in Wave 2 responses. Whether EXP-001 is still the right experiment should be settled before any Wave 3.

---

## 7. Section 2 — the Searchable dependency has been tested and found limited

v1.0 permits third-party infrastructure in the delivery layer only. Subsequent use established hard limits:

- Searchable cannot export per-prompt or per-platform historical results for arbitrary date ranges, so no retrospective per-prompt comparison can be recomputed.
- Its prompt set grew from 11 prompts (February) to 34 (from 02 June). The biggest apparent visibility drops coincide exactly with prompt additions. Any figure spanning those dates is not comparable.
- Three different TendorAI figures appeared across panels in a single session.

The v1.0 boundary held: no published TendorAI figure came from it. Recorded here because the dependency named in Section 2 has been exercised and the limits are now known rather than assumed.

---

## 8. Section 16 — commercial blocker status

| Blocker | Status |
|---|---|
| Dead DNS (`api.tendorai.com`) | Outstanding |
| Schema ownership defects | Outstanding |
| Unsupported 3.2× claim | Still published on tendorai.com. Scheduled for removal. |
| £999 repositioning | Deliverables settled 04/09/2026: one substantive content piece per week (four per month), alongside register alignment, technical fixes, structured data, and monthly measurement against a defined prompt set. |

A related defect found in the same period and now fixed: `publicAeoReportBuilder.js` counted errored API calls in the competitive-position denominator, so a failed platform query scored identically to "not mentioned". Fixed and deployed 26 August 2026. Still open: counting how many stored reports carry a polluted score from the affected window.

---

## 9. Section 7 — new question arising

**Q1.11 — What does an AI assistant cite when asked how a firm becomes visible, rather than which firm to use?**

A second prompt panel of 30 buyer-intent questions was frozen on 02 September 2026 in `visibility-content-config.json`, before collection. Perplexity and ChatGPT; ChatGPT starting a fresh series on the current model. Requires an open-set extractor recording every cited URL rather than checking against a fixed target list. Not yet collected.

Per Rule 6 this is an addition to the register, not a replacement for anything in it.

---

## 10. What v1.0's Phase 2 still requires

Phase 2 is partially complete. Outstanding:

1. Recompute Q0.1–Q0.4 under RETAINED-SUFFIX-SINGLE, restating the original figures alongside.
2. Recompute the control drift and difference-in-differences by group.
3. Design and cost the Q0.5 variance panel (runs distributed across days and times of day).
4. Establish the Q0.6 meaningful-change threshold.
5. Publish a dated correction to TAI-R-2026-002 covering the inverted direction, the conveyancing weighting of the prompt set (34 of 68 prompts are conveyancing or house-purchase), and the classifier change.

Census Edition 1 remains blocked behind these.
