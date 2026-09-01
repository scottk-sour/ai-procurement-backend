# EXP-001 — candidate-rule scoring, six rules, 01/09/2026

Second scoring artefact for `study_2026_07_exp001`. It scores **six** candidate
rules against the same 267 adjudicated verdicts that
`docs/research/EXP-001-rule-scoring-2026-08-28.md` scored against **three**.

The adjudication is unchanged. Only the set of rules under test has grown.

## Provenance

| Field | Value |
| --- | --- |
| Study | `study_2026_07_exp001` |
| Scoring date | 01/09/2026 |
| Adjudication date | 28/08/2026 (unchanged — see below) |
| Scoring commit | **Not confirmed** — not preserved. Bounded to `de43720` ≤ commit < `f945ad3`; see "Outstanding" below. |
| Rules scored | CURRENT, BOUNDARY-SINGLE, BOUNDARY-BOTH, RETAINED-SUFFIX, BOUNDARY-PLUS-RETAINED, RETAINED-THEN-BARE |
| Report body | Raw `scripts/experiments/scoreCandidateRules.js` stdout, verbatim and unreformatted |

The three retained-suffix rules (RETAINED-SUFFIX, BOUNDARY-PLUS-RETAINED,
RETAINED-THEN-BARE) were added to the scorer in `c374b9a` on 01/09/2026 and
reached `main` in `5ce3043` (PR #181). They are absent from the 28/08/2026
artefact, which ran at `f6d64b6` when the scorer defined only the first three.

### Inputs and regeneration seeds

| Input | Produced by | Seeds |
| --- | --- | --- |
| `data/experiments/mention-ground-truth-sample.csv` | `scripts/experiments/buildMentionGroundTruth.js` | `20260811` |
| `data/experiments/labelling-view.csv` | `scripts/experiments/buildLabellingView.js` | Stratum B `20260827b`, shuffle `20260827c` |
| `data/experiments/labelling-key.csv` | `scripts/experiments/buildLabellingView.js` | Stratum B `20260827b`, shuffle `20260827c` |

All three are gitignored and are not held in this repository; they regenerate
deterministically from the seeds above.

### How the verdicts got into the view

`buildLabellingView.js` writes `human_verdict` empty for every row by design and
enforces it (integrity check 9), so a regenerated view carries no verdicts. For
this run they were restored by `scripts/experiments/restoreVerdicts.js`, which
parses the per-row table of the 28/08/2026 artefact and hardcodes nothing. That
script reached `main` in `de43720` (PR #183). The run required it, so the run
necessarily executed at `de43720` or later — which is the lower bound on the
scoring commit recorded under "Outstanding" below.

## Deviation from the pre-registration — carried forward, unchanged

These are the same 267 verdicts scored in the 28/08/2026 artefact, so the §13
deviations apply here in full and with equal force. Recorded again without
softening, so that this artefact is not read in isolation as cleaner evidence
than it is:

- The 267 verdicts were **drafted by an AI adjudicator** working from the blinded
  labelling view, and **accepted by Scott without amendment** — including the ten
  rows flagged for his own ruling. They were not hand-labelled by a single human
  labeller, as §5–§7 specifies.
- **The blind was not preserved on the adjudicator's side.** Contrary to §5, which
  requires the key to stay closed until every verdict is recorded, the labelling
  key was present in the adjudicator's session alongside the view.

Scoring more rules against the same labels does not improve the labels. Every
figure below inherits the adjudication's limitations.

## Verification

Reproduced from this artefact and the 28/08/2026 one, not taken on trust.

**1. The verdicts are the same 267.** Every row of this report's per-row table was
compared against the per-row table of `EXP-001-rule-scoring-2026-08-28.md`:
**zero disagreements across all 267 rows** on `human_verdict`, and also on
`stratum` and `token_count`. The restore was faithful and the two artefacts score
the same adjudication.

**2. Internal consistency.** Recounting this report's per-row table reproduces
every summary figure it states:

- Stratum A (n=217): REAL 90 / FALSE 122 / AMBIGUOUS 5
- Stratum B (n=50): REAL 41 / FALSE 4 / AMBIGUOUS 5
- Combined (n=267): REAL 131 / FALSE 126 / AMBIGUOUS 10
- Single-token (n=242): REAL 112 / FALSE 125 / AMBIGUOUS 5; multi-token (n=25): REAL 19 / FALSE 1 / AMBIGUOUS 5
- `row_uid` contiguous 1–267, no duplicates
- All six rules' residual-disagreement counts match: CURRENT 90 FN / 4 FP, BOUNDARY-SINGLE 8 / 45, BOUNDARY-BOTH 8 / 44, RETAINED-SUFFIX 21 / 5, BOUNDARY-PLUS-RETAINED 0 / 44, RETAINED-THEN-BARE 1 / 44
- The TOTAL ERRORS table reproduces at both bounds, including the FN+FP split of every cell
- The 6×6 pairwise agreement matrix reproduces exactly, diagonal 267
- Exactly one row (`row_uid` 217) has BOUNDARY-SINGLE ≠ BOUNDARY-BOTH

**3. Layout.** The per-row table matches the column layout emitted by the
six-rule printer in `scoreCandidateRules.js` as it stands on `main`, which differs
from the three-rule layout used in the 28/08/2026 artefact.

## Outstanding — the scoring commit was not preserved

**The exact revision this run executed at is not recorded, and has not been
guessed.** The container redeployed before the SHA was captured, so the working
tree the run executed on no longer exists and its commit was not preserved. This
is a permanent gap in the record, not an omission that can be closed later by
inspecting the repository.

What *is* established bounds it on both sides:

- The run required `scripts/experiments/restoreVerdicts.js` to put the verdicts
  back into the regenerated labelling view. That script reached `main` in
  `de43720` (PR #183), so the scoring commit is **`de43720` or later**.
- `f945ad3` — the merge of PR #184, which committed this artefact, deployed
  01/09/2026 22:38 BST — is *after* the scoring run. It is **not** the scoring
  commit, and the scoring commit is **earlier than `f945ad3`**.

So: `de43720` ≤ scoring commit < `f945ad3`. The six-rule scorer itself has been
present since `c374b9a` (on `main` from `5ce3043`), well before that interval
opens, so the rules under test are not in doubt — only the exact revision.

## Report body

Raw `scoreCandidateRules.js` stdout, verbatim — not reformatted, re-sorted or
edited in any way. The per-row table and the TOTAL ERRORS block are the primary
record.

```
==============================================================================
EXP-001 candidate-rule scoring — READ-ONLY, no writes
==============================================================================
Rules: CURRENT | BOUNDARY-SINGLE | BOUNDARY-BOTH | RETAINED-SUFFIX | BOUNDARY-PLUS-RETAINED | RETAINED-THEN-BARE
Bounds: "AMBIG=FALSE" (pre-reg lower) and "AMBIG=REAL" (pre-reg upper).
miss rate = FN / N(stratum); false-positive rate = FP / N(stratum).
NOT_LOCATED rows (flagged in view): 5

------------------------------------------------------------------------------
Stratum A (disputed, n=217)
  labels: REAL 90 | FALSE 122 | AMBIGUOUS 5
  single-token: REAL 90 FALSE 122 AMBIG 5 (n=217)
  multi-token:  REAL 0 FALSE 0 AMBIG 0 (n=0)
  CURRENT:
     AMBIG=FALSE  TP=0 FP=0 TN=127 FN=90  miss=41.5%  fp=0.0%
     AMBIG=REAL   TP=0 FP=0 TN=122 FN=95  miss=43.8%  fp=0.0%
       single (n=217): miss 41.5%/43.8%  fp 0.0%/0.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-SINGLE:
     AMBIG=FALSE  TP=82 FP=46 TN=81 FN=8  miss=3.7%  fp=21.2%
     AMBIG=REAL   TP=87 FP=41 TN=81 FN=8  miss=3.7%  fp=18.9%
       single (n=217): miss 3.7%/3.7%  fp 21.2%/18.9%  [AMBIG=FALSE/REAL]
  BOUNDARY-BOTH:
     AMBIG=FALSE  TP=82 FP=46 TN=81 FN=8  miss=3.7%  fp=21.2%
     AMBIG=REAL   TP=87 FP=41 TN=81 FN=8  miss=3.7%  fp=18.9%
       single (n=217): miss 3.7%/3.7%  fp 21.2%/18.9%  [AMBIG=FALSE/REAL]
  RETAINED-SUFFIX:
     AMBIG=FALSE  TP=76 FP=5 TN=122 FN=14  miss=6.5%  fp=2.3%
     AMBIG=REAL   TP=77 FP=4 TN=118 FN=18  miss=8.3%  fp=1.8%
       single (n=217): miss 6.5%/8.3%  fp 2.3%/1.8%  [AMBIG=FALSE/REAL]
  BOUNDARY-PLUS-RETAINED:
     AMBIG=FALSE  TP=90 FP=46 TN=81 FN=0  miss=0.0%  fp=21.2%
     AMBIG=REAL   TP=95 FP=41 TN=81 FN=0  miss=0.0%  fp=18.9%
       single (n=217): miss 0.0%/0.0%  fp 21.2%/18.9%  [AMBIG=FALSE/REAL]
  RETAINED-THEN-BARE:
     AMBIG=FALSE  TP=89 FP=43 TN=84 FN=1  miss=0.5%  fp=19.8%
     AMBIG=REAL   TP=91 FP=41 TN=81 FN=4  miss=1.8%  fp=18.9%
       single (n=217): miss 0.5%/1.8%  fp 19.8%/18.9%  [AMBIG=FALSE/REAL]

------------------------------------------------------------------------------
Stratum B (current positives, n=50)
  labels: REAL 41 | FALSE 4 | AMBIGUOUS 5
  single-token: REAL 22 FALSE 3 AMBIG 0 (n=25)
  multi-token:  REAL 19 FALSE 1 AMBIG 5 (n=25)
  CURRENT:
     AMBIG=FALSE  TP=41 FP=9 TN=0 FN=0  miss=0.0%  fp=18.0%
     AMBIG=REAL   TP=46 FP=4 TN=0 FN=0  miss=0.0%  fp=8.0%
       single (n=25): miss 0.0%/0.0%  fp 12.0%/12.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 24.0%/4.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-SINGLE:
     AMBIG=FALSE  TP=41 FP=9 TN=0 FN=0  miss=0.0%  fp=18.0%
     AMBIG=REAL   TP=46 FP=4 TN=0 FN=0  miss=0.0%  fp=8.0%
       single (n=25): miss 0.0%/0.0%  fp 12.0%/12.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 24.0%/4.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-BOTH:
     AMBIG=FALSE  TP=41 FP=8 TN=1 FN=0  miss=0.0%  fp=16.0%
     AMBIG=REAL   TP=46 FP=3 TN=1 FN=0  miss=0.0%  fp=6.0%
       single (n=25): miss 0.0%/0.0%  fp 12.0%/12.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 20.0%/0.0%  [AMBIG=FALSE/REAL]
  RETAINED-SUFFIX:
     AMBIG=FALSE  TP=34 FP=4 TN=5 FN=7  miss=14.0%  fp=8.0%
     AMBIG=REAL   TP=37 FP=1 TN=3 FN=9  miss=18.0%  fp=2.0%
       single (n=25): miss 12.0%/12.0%  fp 4.0%/4.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 16.0%/24.0%  fp 12.0%/0.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-PLUS-RETAINED:
     AMBIG=FALSE  TP=41 FP=8 TN=1 FN=0  miss=0.0%  fp=16.0%
     AMBIG=REAL   TP=46 FP=3 TN=1 FN=0  miss=0.0%  fp=6.0%
       single (n=25): miss 0.0%/0.0%  fp 12.0%/12.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 20.0%/0.0%  [AMBIG=FALSE/REAL]
  RETAINED-THEN-BARE:
     AMBIG=FALSE  TP=41 FP=8 TN=1 FN=0  miss=0.0%  fp=16.0%
     AMBIG=REAL   TP=46 FP=3 TN=1 FN=0  miss=0.0%  fp=6.0%
       single (n=25): miss 0.0%/0.0%  fp 12.0%/12.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 20.0%/0.0%  [AMBIG=FALSE/REAL]

------------------------------------------------------------------------------
Combined (n=267)
  labels: REAL 131 | FALSE 126 | AMBIGUOUS 10
  single-token: REAL 112 FALSE 125 AMBIG 5 (n=242)
  multi-token:  REAL 19 FALSE 1 AMBIG 5 (n=25)
  CURRENT:
     AMBIG=FALSE  TP=41 FP=9 TN=127 FN=90  miss=33.7%  fp=3.4%
     AMBIG=REAL   TP=46 FP=4 TN=122 FN=95  miss=35.6%  fp=1.5%
       single (n=242): miss 37.2%/39.3%  fp 1.2%/1.2%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 24.0%/4.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-SINGLE:
     AMBIG=FALSE  TP=123 FP=55 TN=81 FN=8  miss=3.0%  fp=20.6%
     AMBIG=REAL   TP=133 FP=45 TN=81 FN=8  miss=3.0%  fp=16.9%
       single (n=242): miss 3.3%/3.3%  fp 20.2%/18.2%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 24.0%/4.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-BOTH:
     AMBIG=FALSE  TP=123 FP=54 TN=82 FN=8  miss=3.0%  fp=20.2%
     AMBIG=REAL   TP=133 FP=44 TN=82 FN=8  miss=3.0%  fp=16.5%
       single (n=242): miss 3.3%/3.3%  fp 20.2%/18.2%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 20.0%/0.0%  [AMBIG=FALSE/REAL]
  RETAINED-SUFFIX:
     AMBIG=FALSE  TP=110 FP=9 TN=127 FN=21  miss=7.9%  fp=3.4%
     AMBIG=REAL   TP=114 FP=5 TN=121 FN=27  miss=10.1%  fp=1.9%
       single (n=242): miss 7.0%/8.7%  fp 2.5%/2.1%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 16.0%/24.0%  fp 12.0%/0.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-PLUS-RETAINED:
     AMBIG=FALSE  TP=131 FP=54 TN=82 FN=0  miss=0.0%  fp=20.2%
     AMBIG=REAL   TP=141 FP=44 TN=82 FN=0  miss=0.0%  fp=16.5%
       single (n=242): miss 0.0%/0.0%  fp 20.2%/18.2%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 20.0%/0.0%  [AMBIG=FALSE/REAL]
  RETAINED-THEN-BARE:
     AMBIG=FALSE  TP=130 FP=51 TN=85 FN=1  miss=0.4%  fp=19.1%
     AMBIG=REAL   TP=137 FP=44 TN=82 FN=4  miss=1.5%  fp=16.5%
       single (n=242): miss 0.4%/1.7%  fp 19.0%/18.2%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 20.0%/0.0%  [AMBIG=FALSE/REAL]

==============================================================================
COMPARISON — A.miss, B.fp, comb.miss, comb.fp  (each as AMBIG=FALSE / AMBIG=REAL)
==============================================================================
rule                    A.miss          B.fp            comb.miss       comb.fp
CURRENT                 41.5%/43.8%     18.0%/8.0%      33.7%/35.6%     3.4%/1.5%
BOUNDARY-SINGLE         3.7%/3.7%       18.0%/8.0%      3.0%/3.0%       20.6%/16.9%
BOUNDARY-BOTH           3.7%/3.7%       16.0%/6.0%      3.0%/3.0%       20.2%/16.5%
RETAINED-SUFFIX         6.5%/8.3%       8.0%/2.0%       7.9%/10.1%      3.4%/1.9%
BOUNDARY-PLUS-RETAINED  0.0%/0.0%       16.0%/6.0%      0.0%/0.0%       20.2%/16.5%
RETAINED-THEN-BARE      0.5%/1.8%       16.0%/6.0%      0.4%/1.5%       19.1%/16.5%

##############################################################################
##  TOTAL ERRORS (FN + FP) over all 267 rows  —  PRIMARY DECISION METRIC     ##
##  A lower miss rate does NOT win if the total-error count is higher.       ##
##############################################################################
rule                    TE@FALSE  TE@REAL   detail  (FN+FP @FALSE | @REAL)
CURRENT                 99        99        90+9 | 95+4
BOUNDARY-SINGLE         63        53        8+55 | 8+45
BOUNDARY-BOTH           62        52        8+54 | 8+44
RETAINED-SUFFIX         30        32        21+9 | 27+5
BOUNDARY-PLUS-RETAINED  54        44        0+54 | 0+44
RETAINED-THEN-BARE      52        48        1+51 | 4+44
  fewest total errors @AMBIG=FALSE:  RETAINED-SUFFIX=30  <=  RETAINED-THEN-BARE=52  <=  BOUNDARY-PLUS-RETAINED=54  <=  BOUNDARY-BOTH=62  <=  BOUNDARY-SINGLE=63  <=  CURRENT=99
  fewest total errors @AMBIG=REAL :  RETAINED-SUFFIX=32  <=  BOUNDARY-PLUS-RETAINED=44  <=  RETAINED-THEN-BARE=48  <=  BOUNDARY-BOTH=52  <=  BOUNDARY-SINGLE=53  <=  CURRENT=99
##############################################################################

==============================================================================
RESIDUAL DISAGREEMENTS (rule vs definite verdict; AMBIGUOUS excluded)
==============================================================================
  CURRENT: 90 false-negative row_uids (verdict REAL, rule NO): 6, 12, 15, 19, 20, 24, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 72, 73, 76, 83, 87, 92, 93, 95, 98, 102, 110, 117, 118, 122, 125, 126, 128, 132, 134, 135, 137, 139, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 176, 179, 182, 183, 184, 185, 186, 187, 192, 195, 198, 199, 201, 202, 204, 205, 208, 212, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 248, 250, 256, 259, 262, 263, 266
           4 false-positive row_uids (verdict FALSE, rule YES): 43, 127, 207, 217
           FP by matched form (form ×count):
             "leicester" ×1: 43
             "family" ×1: 127
             "evans" ×1: 207
             "c s" ×1: 217
  BOUNDARY-SINGLE: 8 false-negative row_uids (verdict REAL, rule NO): 12, 24, 72, 95, 132, 139, 183, 195
                   45 false-positive row_uids (verdict FALSE, rule YES): 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 43, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 127, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 207, 217, 232, 246, 251, 252
                   FP by matched form (form ×count):
                     "harrow" ×5: 4, 8, 48, 79, 130
                     "leeds" ×5: 5, 34, 75, 106, 149
                     "liverpool" ×5: 13, 86, 175, 178, 232
                     "bradford" ×5: 45, 70, 121, 133, 157
                     "leicester" ×4: 43, 145, 193, 197
                     "yorkshire" ×3: 1, 116, 252
                     "evans" ×3: 29, 115, 207
                     "best" ×2: 2, 100
                     "family" ×2: 7, 127
                     "estate" ×1: 30
                     "redbridge" ×1: 42
                     "quay" ×1: 66
                     "kenton" ×1: 77
                     "defence" ×1: 114
                     "khan" ×1: 124
                     "bridgford" ×1: 152
                     "hopkins" ×1: 194
                     "c s" ×1: 217
                     "abbey" ×1: 246
                     "complex" ×1: 251
  BOUNDARY-BOTH: 8 false-negative row_uids (verdict REAL, rule NO): 12, 24, 72, 95, 132, 139, 183, 195
                 44 false-positive row_uids (verdict FALSE, rule YES): 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 43, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 127, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 207, 232, 246, 251, 252
                 FP by matched form (form ×count):
                   "harrow" ×5: 4, 8, 48, 79, 130
                   "leeds" ×5: 5, 34, 75, 106, 149
                   "liverpool" ×5: 13, 86, 175, 178, 232
                   "bradford" ×5: 45, 70, 121, 133, 157
                   "leicester" ×4: 43, 145, 193, 197
                   "yorkshire" ×3: 1, 116, 252
                   "evans" ×3: 29, 115, 207
                   "best" ×2: 2, 100
                   "family" ×2: 7, 127
                   "estate" ×1: 30
                   "redbridge" ×1: 42
                   "quay" ×1: 66
                   "kenton" ×1: 77
                   "defence" ×1: 114
                   "khan" ×1: 124
                   "bridgford" ×1: 152
                   "hopkins" ×1: 194
                   "abbey" ×1: 246
                   "complex" ×1: 251
  RETAINED-SUFFIX: 21 false-negative row_uids (verdict REAL, rule NO): 16, 20, 31, 52, 64, 65, 78, 93, 110, 118, 142, 143, 146, 155, 172, 185, 202, 204, 205, 209, 259
                   5 false-positive row_uids (verdict FALSE, rule YES): 2, 7, 127, 133, 175
                   FP by matched form (form ×count):
                     "family law" ×2: 7, 127
                     "best solicitors" ×1: 2
                     "bradford law" ×1: 133
                     "liverpool legal" ×1: 175
  BOUNDARY-PLUS-RETAINED: 0 false-negative row_uids (verdict REAL, rule NO): (none)
                          44 false-positive row_uids (verdict FALSE, rule YES): 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 43, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 127, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 207, 232, 246, 251, 252
                          FP by matched form (form ×count):
                            "harrow" ×5: 4, 8, 48, 79, 130
                            "leeds" ×5: 5, 34, 75, 106, 149
                            "liverpool" ×4: 13, 86, 178, 232
                            "leicester" ×4: 43, 145, 193, 197
                            "bradford" ×4: 45, 70, 121, 157
                            "yorkshire" ×3: 1, 116, 252
                            "evans" ×3: 29, 115, 207
                            "family law" ×2: 7, 127
                            "best solicitors" ×1: 2
                            "estate" ×1: 30
                            "redbridge" ×1: 42
                            "quay" ×1: 66
                            "kenton" ×1: 77
                            "best" ×1: 100
                            "defence" ×1: 114
                            "khan" ×1: 124
                            "bradford law" ×1: 133
                            "bridgford" ×1: 152
                            "liverpool legal" ×1: 175
                            "hopkins" ×1: 194
                            "abbey" ×1: 246
                            "complex" ×1: 251
  RETAINED-THEN-BARE: 1 false-negative row_uids (verdict REAL, rule NO): 185
                      44 false-positive row_uids (verdict FALSE, rule YES): 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 43, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 127, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 207, 232, 246, 251, 252
                      FP by matched form (form ×count):
                        "harrow" ×5: 4, 8, 48, 79, 130
                        "leeds" ×5: 5, 34, 75, 106, 149
                        "liverpool" ×4: 13, 86, 178, 232
                        "leicester" ×4: 43, 145, 193, 197
                        "bradford" ×4: 45, 70, 121, 157
                        "yorkshire" ×3: 1, 116, 252
                        "evans" ×3: 29, 115, 207
                        "family law" ×2: 7, 127
                        "best solicitors" ×1: 2
                        "estate" ×1: 30
                        "redbridge" ×1: 42
                        "quay" ×1: 66
                        "kenton" ×1: 77
                        "best" ×1: 100
                        "defence" ×1: 114
                        "khan" ×1: 124
                        "bradford law" ×1: 133
                        "bridgford" ×1: 152
                        "liverpool legal" ×1: 175
                        "hopkins" ×1: 194
                        "abbey" ×1: 246
                        "complex" ×1: 251

==============================================================================
PER-ROW PREDICTIONS (Y = mentioned, . = not). Sorted by row_uid.
==============================================================================
row_uid  str tok verdict     CUR SGL BOT RET P+R THB 
1        A   1   FALSE       .   Y   Y   .   Y   Y   
2        A   1   FALSE       .   Y   Y   Y   Y   Y   
3        A   1   FALSE       .   .   .   .   .   .   
4        A   1   FALSE       .   Y   Y   .   Y   Y   
5        A   1   FALSE       .   Y   Y   .   Y   Y   
6        A   1   REAL        .   Y   Y   Y   Y   Y   
7        A   1   FALSE       .   Y   Y   Y   Y   Y   
8        A   1   FALSE       .   Y   Y   .   Y   Y   
9        B   3   AMBIGUOUS   Y   Y   Y   Y   Y   Y   
10       A   1   FALSE       .   .   .   .   .   .   
11       A   1   FALSE       .   .   .   .   .   .   
12       A   1   REAL        .   .   .   Y   Y   Y   
13       A   1   FALSE       .   Y   Y   .   Y   Y   
14       A   1   FALSE       .   .   .   .   .   .   
15       A   1   REAL        .   Y   Y   Y   Y   Y   
16       B   1   REAL        Y   Y   Y   .   Y   Y   
17       A   1   FALSE       .   .   .   .   .   .   
18       B   2   REAL        Y   Y   Y   Y   Y   Y   
19       A   1   REAL        .   Y   Y   Y   Y   Y   
20       A   1   REAL        .   Y   Y   .   Y   Y   
21       A   1   FALSE       .   .   .   .   .   .   
22       A   1   FALSE       .   .   .   .   .   .   
23       A   1   FALSE       .   .   .   .   .   .   
24       A   1   REAL        .   .   .   Y   Y   Y   
25       A   1   FALSE       .   .   .   .   .   .   
26       B   1   REAL        Y   Y   Y   Y   Y   Y   
27       B   2   REAL        Y   Y   Y   Y   Y   Y   
28       A   1   REAL        .   Y   Y   Y   Y   Y   
29       A   1   FALSE       .   Y   Y   .   Y   Y   
30       A   1   FALSE       .   Y   Y   .   Y   Y   
31       B   2   REAL        Y   Y   Y   .   Y   Y   
32       A   1   FALSE       .   .   .   .   .   .   
33       A   1   FALSE       .   .   .   .   .   .   
34       A   1   FALSE       .   Y   Y   .   Y   Y   
35       A   1   FALSE       .   .   .   .   .   .   
36       A   1   REAL        .   Y   Y   Y   Y   Y   
37       A   1   FALSE       .   .   .   .   .   .   
38       A   1   REAL        .   Y   Y   Y   Y   Y   
39       A   1   FALSE       .   .   .   .   .   .   
40       A   1   REAL        .   Y   Y   Y   Y   Y   
41       A   1   FALSE       .   .   .   .   .   .   
42       A   1   FALSE       .   Y   Y   .   Y   Y   
43       B   1   FALSE       Y   Y   Y   .   Y   Y   
44       A   1   FALSE       .   .   .   .   .   .   
45       A   1   FALSE       .   Y   Y   .   Y   Y   
46       A   1   FALSE       .   .   .   .   .   .   
47       A   1   FALSE       .   .   .   .   .   .   
48       A   1   FALSE       .   Y   Y   .   Y   Y   
49       A   1   REAL        .   Y   Y   Y   Y   Y   
50       A   1   FALSE       .   .   .   .   .   .   
51       A   1   REAL        .   Y   Y   Y   Y   Y   
52       A   1   REAL        .   Y   Y   .   Y   Y   
53       A   1   REAL        .   Y   Y   Y   Y   Y   
54       A   1   FALSE       .   .   .   .   .   .   
55       A   1   FALSE       .   .   .   .   .   .   
56       A   1   REAL        .   Y   Y   Y   Y   Y   
57       A   1   REAL        .   Y   Y   Y   Y   Y   
58       B   2   REAL        Y   Y   Y   Y   Y   Y   
59       A   1   REAL        .   Y   Y   Y   Y   Y   
60       B   4   AMBIGUOUS   Y   Y   Y   Y   Y   Y   
61       A   1   FALSE       .   .   .   .   .   .   
62       A   1   REAL        .   Y   Y   Y   Y   Y   
63       A   1   REAL        .   Y   Y   Y   Y   Y   
64       A   1   REAL        .   Y   Y   .   Y   Y   
65       A   1   REAL        .   Y   Y   .   Y   Y   
66       A   1   FALSE       .   Y   Y   .   Y   Y   
67       A   1   FALSE       .   .   .   .   .   .   
68       B   3   REAL        Y   Y   Y   Y   Y   Y   
69       A   1   REAL        .   Y   Y   Y   Y   Y   
70       A   1   FALSE       .   Y   Y   .   Y   Y   
71       A   1   REAL        .   Y   Y   Y   Y   Y   
72       A   1   REAL        .   .   .   Y   Y   Y   
73       A   1   REAL        .   Y   Y   Y   Y   Y   
74       B   1   REAL        Y   Y   Y   Y   Y   Y   
75       A   1   FALSE       .   Y   Y   .   Y   Y   
76       A   1   REAL        .   Y   Y   Y   Y   Y   
77       A   1   FALSE       .   Y   Y   .   Y   Y   
78       B   2   REAL        Y   Y   Y   .   Y   Y   
79       A   1   FALSE       .   Y   Y   .   Y   Y   
80       A   1   FALSE       .   .   .   .   .   .   
81       A   1   FALSE       .   .   .   .   .   .   
82       A   1   FALSE       .   .   .   .   .   .   
83       A   1   REAL        .   Y   Y   Y   Y   Y   
84       A   1   FALSE       .   .   .   .   .   .   
85       A   1   AMBIGUOUS   .   Y   Y   .   Y   .   
86       A   1   FALSE       .   Y   Y   .   Y   Y   
87       A   1   REAL        .   Y   Y   Y   Y   Y   
88       B   2   REAL        Y   Y   Y   Y   Y   Y   
89       A   1   FALSE       .   .   .   .   .   .   
90       A   1   FALSE       .   .   .   .   .   .   
91       B   1   REAL        Y   Y   Y   Y   Y   Y   
92       A   1   REAL        .   Y   Y   Y   Y   Y   
93       A   1   REAL        .   Y   Y   .   Y   Y   
94       A   1   FALSE       .   .   .   .   .   .   
95       A   1   REAL        .   .   .   Y   Y   Y   
96       A   1   FALSE       .   .   .   .   .   .   
97       A   1   FALSE       .   .   .   .   .   .   
98       A   1   REAL        .   Y   Y   Y   Y   Y   
99       A   1   FALSE       .   .   .   .   .   .   
100      A   1   FALSE       .   Y   Y   .   Y   Y   
101      B   1   REAL        Y   Y   Y   Y   Y   Y   
102      A   1   REAL        .   Y   Y   Y   Y   Y   
103      A   1   FALSE       .   .   .   .   .   .   
104      B   1   REAL        Y   Y   Y   Y   Y   Y   
105      A   1   FALSE       .   .   .   .   .   .   
106      A   1   FALSE       .   Y   Y   .   Y   Y   
107      B   1   REAL        Y   Y   Y   Y   Y   Y   
108      A   1   FALSE       .   .   .   .   .   .   
109      A   1   FALSE       .   .   .   .   .   .   
110      A   1   REAL        .   Y   Y   .   Y   Y   
111      A   1   FALSE       .   .   .   .   .   .   
112      B   1   REAL        Y   Y   Y   Y   Y   Y   
113      B   3   REAL        Y   Y   Y   Y   Y   Y   
114      A   1   FALSE       .   Y   Y   .   Y   Y   
115      A   1   FALSE       .   Y   Y   .   Y   Y   
116      A   1   FALSE       .   Y   Y   .   Y   Y   
117      A   1   REAL        .   Y   Y   Y   Y   Y   
118      A   1   REAL        .   Y   Y   .   Y   Y   
119      A   1   FALSE       .   .   .   .   .   .   
120      A   1   FALSE       .   .   .   .   .   .   
121      A   1   FALSE       .   Y   Y   .   Y   Y   
122      A   1   REAL        .   Y   Y   Y   Y   Y   
123      A   1   FALSE       .   .   .   .   .   .   
124      A   1   FALSE       .   Y   Y   .   Y   Y   
125      A   1   REAL        .   Y   Y   Y   Y   Y   
126      A   1   REAL        .   Y   Y   Y   Y   Y   
127      B   1   FALSE       Y   Y   Y   Y   Y   Y   
128      A   1   REAL        .   Y   Y   Y   Y   Y   
129      A   1   FALSE       .   .   .   .   .   .   
130      A   1   FALSE       .   Y   Y   .   Y   Y   
131      A   1   FALSE       .   .   .   .   .   .   
132      A   1   REAL        .   .   .   Y   Y   Y   
133      A   1   FALSE       .   Y   Y   Y   Y   Y   
134      A   1   REAL        .   Y   Y   Y   Y   Y   
135      A   1   REAL        .   Y   Y   Y   Y   Y   
136      A   1   FALSE       .   .   .   .   .   .   
137      A   1   REAL        .   Y   Y   Y   Y   Y   
138      B   2   REAL        Y   Y   Y   Y   Y   Y   
139      A   1   REAL        .   .   .   Y   Y   Y   
140      A   1   FALSE       .   .   .   .   .   .   
141      A   1   FALSE       .   .   .   .   .   .   
142      A   1   REAL        .   Y   Y   .   Y   Y   
143      A   1   REAL        .   Y   Y   .   Y   Y   
144      A   1   REAL        .   Y   Y   Y   Y   Y   
145      A   1   FALSE       .   Y   Y   .   Y   Y   
146      B   2   REAL        Y   Y   Y   .   Y   Y   
147      A   1   REAL        .   Y   Y   Y   Y   Y   
148      A   1   FALSE       .   .   .   .   .   .   
149      A   1   FALSE       .   Y   Y   .   Y   Y   
150      A   1   FALSE       .   .   .   .   .   .   
151      B   1   REAL        Y   Y   Y   Y   Y   Y   
152      A   1   FALSE       .   Y   Y   .   Y   Y   
153      A   1   REAL        .   Y   Y   Y   Y   Y   
154      A   1   FALSE       .   .   .   .   .   .   
155      B   3   REAL        Y   Y   Y   .   Y   Y   
156      A   1   REAL        .   Y   Y   Y   Y   Y   
157      A   1   FALSE       .   Y   Y   .   Y   Y   
158      B   1   REAL        Y   Y   Y   Y   Y   Y   
159      A   1   FALSE       .   .   .   .   .   .   
160      B   4   AMBIGUOUS   Y   Y   Y   .   Y   Y   
161      A   1   FALSE       .   .   .   .   .   .   
162      A   1   REAL        .   Y   Y   Y   Y   Y   
163      A   1   FALSE       .   .   .   .   .   .   
164      B   3   AMBIGUOUS   Y   Y   Y   .   Y   Y   
165      A   1   REAL        .   Y   Y   Y   Y   Y   
166      A   1   REAL        .   Y   Y   Y   Y   Y   
167      A   1   FALSE       .   .   .   .   .   .   
168      A   1   REAL        .   Y   Y   Y   Y   Y   
169      A   1   FALSE       .   .   .   .   .   .   
170      B   1   REAL        Y   Y   Y   Y   Y   Y   
171      A   1   AMBIGUOUS   .   Y   Y   .   Y   .   
172      B   1   REAL        Y   Y   Y   .   Y   Y   
173      A   1   FALSE       .   .   .   .   .   .   
174      A   1   FALSE       .   .   .   .   .   .   
175      A   1   FALSE       .   Y   Y   Y   Y   Y   
176      A   1   REAL        .   Y   Y   Y   Y   Y   
177      B   2   REAL        Y   Y   Y   Y   Y   Y   
178      A   1   FALSE       .   Y   Y   .   Y   Y   
179      A   1   REAL        .   Y   Y   Y   Y   Y   
180      B   2   REAL        Y   Y   Y   Y   Y   Y   
181      A   1   FALSE       .   .   .   .   .   .   
182      A   1   REAL        .   Y   Y   Y   Y   Y   
183      A   1   REAL        .   .   .   Y   Y   Y   
184      A   1   REAL        .   Y   Y   Y   Y   Y   
185      A   1   REAL        .   Y   Y   .   Y   .   
186      A   1   REAL        .   Y   Y   Y   Y   Y   
187      A   1   REAL        .   Y   Y   Y   Y   Y   
188      A   1   FALSE       .   .   .   .   .   .   
189      B   1   REAL        Y   Y   Y   Y   Y   Y   
190      A   1   FALSE       .   .   .   .   .   .   
191      A   1   AMBIGUOUS   .   Y   Y   .   Y   Y   
192      A   1   REAL        .   Y   Y   Y   Y   Y   
193      A   1   FALSE       .   Y   Y   .   Y   Y   
194      A   1   FALSE       .   Y   Y   .   Y   Y   
195      A   1   REAL        .   .   .   Y   Y   Y   
196      A   1   FALSE       .   .   .   .   .   .   
197      A   1   FALSE       .   Y   Y   .   Y   Y   
198      A   1   REAL        .   Y   Y   Y   Y   Y   
199      A   1   REAL        .   Y   Y   Y   Y   Y   
200      A   1   FALSE       .   .   .   .   .   .   
201      A   1   REAL        .   Y   Y   Y   Y   Y   
202      A   1   REAL        .   Y   Y   .   Y   Y   
203      A   1   FALSE       .   .   .   .   .   .   
204      A   1   REAL        .   Y   Y   .   Y   Y   
205      A   1   REAL        .   Y   Y   .   Y   Y   
206      B   1   REAL        Y   Y   Y   Y   Y   Y   
207      B   1   FALSE       Y   Y   Y   .   Y   Y   
208      A   1   REAL        .   Y   Y   Y   Y   Y   
209      B   1   REAL        Y   Y   Y   .   Y   Y   
210      A   1   FALSE       .   .   .   .   .   .   
211      A   1   FALSE       .   .   .   .   .   .   
212      A   1   REAL        .   Y   Y   Y   Y   Y   
213      B   2   REAL        Y   Y   Y   Y   Y   Y   
214      A   1   FALSE       .   .   .   .   .   .   
215      B   1   REAL        Y   Y   Y   Y   Y   Y   
216      B   3   AMBIGUOUS   Y   Y   Y   Y   Y   Y   
217      B   2   FALSE       Y   Y   .   .   .   .   
218      B   1   REAL        Y   Y   Y   Y   Y   Y   
219      A   1   REAL        .   Y   Y   Y   Y   Y   
220      A   1   REAL        .   Y   Y   Y   Y   Y   
221      B   1   REAL        Y   Y   Y   Y   Y   Y   
222      A   1   REAL        .   Y   Y   Y   Y   Y   
223      A   1   FALSE       .   .   .   .   .   .   
224      A   1   REAL        .   Y   Y   Y   Y   Y   
225      A   1   FALSE       .   .   .   .   .   .   
226      B   1   REAL        Y   Y   Y   Y   Y   Y   
227      A   1   REAL        .   Y   Y   Y   Y   Y   
228      A   1   REAL        .   Y   Y   Y   Y   Y   
229      A   1   REAL        .   Y   Y   Y   Y   Y   
230      B   1   REAL        Y   Y   Y   Y   Y   Y   
231      B   1   REAL        Y   Y   Y   Y   Y   Y   
232      A   1   FALSE       .   Y   Y   .   Y   Y   
233      B   3   REAL        Y   Y   Y   Y   Y   Y   
234      A   1   REAL        .   Y   Y   Y   Y   Y   
235      A   1   REAL        .   Y   Y   Y   Y   Y   
236      A   1   FALSE       .   .   .   .   .   .   
237      A   1   FALSE       .   .   .   .   .   .   
238      B   2   REAL        Y   Y   Y   Y   Y   Y   
239      A   1   REAL        .   Y   Y   Y   Y   Y   
240      A   1   FALSE       .   .   .   .   .   .   
241      A   1   AMBIGUOUS   .   Y   Y   Y   Y   Y   
242      B   2   REAL        Y   Y   Y   Y   Y   Y   
243      A   1   FALSE       .   .   .   .   .   .   
244      A   1   FALSE       .   .   .   .   .   .   
245      A   1   FALSE       .   .   .   .   .   .   
246      A   1   FALSE       .   Y   Y   .   Y   Y   
247      B   2   REAL        Y   Y   Y   Y   Y   Y   
248      A   1   REAL        .   Y   Y   Y   Y   Y   
249      A   1   FALSE       .   .   .   .   .   .   
250      A   1   REAL        .   Y   Y   Y   Y   Y   
251      A   1   FALSE       .   Y   Y   .   Y   Y   
252      A   1   FALSE       .   Y   Y   .   Y   Y   
253      A   1   AMBIGUOUS   .   Y   Y   .   Y   .   
254      B   1   REAL        Y   Y   Y   Y   Y   Y   
255      A   1   FALSE       .   .   .   .   .   .   
256      A   1   REAL        .   Y   Y   Y   Y   Y   
257      A   1   FALSE       .   .   .   .   .   .   
258      A   1   FALSE       .   .   .   .   .   .   
259      A   1   REAL        .   Y   Y   .   Y   Y   
260      A   1   FALSE       .   .   .   .   .   .   
261      A   1   FALSE       .   .   .   .   .   .   
262      A   1   REAL        .   Y   Y   Y   Y   Y   
263      A   1   REAL        .   Y   Y   Y   Y   Y   
264      A   1   FALSE       .   .   .   .   .   .   
265      B   2   REAL        Y   Y   Y   Y   Y   Y   
266      A   1   REAL        .   Y   Y   Y   Y   Y   
267      A   1   FALSE       .   .   .   .   .   .   

Rows where BOUNDARY-SINGLE != BOUNDARY-BOTH (multi-token evidence): 1
row_uids: 217

==============================================================================
PAIRWISE AGREEMENT MATRIX (rows /267 where the two rules agree; diagonal = 267)
==============================================================================
         CUR   SGL   BOT   RET   P+R   THB
CUR      267   139   138   174   130   134
SGL      139   267   266   192   258   254
BOT      138   266   267   193   259   255
RET      174   192   193   267   201   205
P+R      130   258   259   201   267   263
THB      134   254   255   205   263   267
legend: CUR=CURRENT  SGL=BOUNDARY-SINGLE  BOT=BOUNDARY-BOTH  RET=RETAINED-SUFFIX  P+R=BOUNDARY-PLUS-RETAINED  THB=RETAINED-THEN-BARE

==============================================================================
CHANGES RELATIVE TO CURRENT (rows differing from CURRENT; correctness vs human verdict)
==============================================================================
  BOUNDARY-SINGLE: 128 rows differ from CURRENT
     AMBIG=FALSE: +82 newly-correct, -46 newly-wrong (net +36)
       newly-correct row_uids: 6, 15, 19, 20, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 73, 76, 83, 87, 92, 93, 98, 102, 110, 117, 118, 122, 125, 126, 128, 134, 135, 137, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 176, 179, 182, 184, 185, 186, 187, 192, 198, 199, 201, 202, 204, 205, 208, 212, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 248, 250, 256, 259, 262, 263, 266
       newly-wrong   row_uids: 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 45, 48, 66, 70, 75, 77, 79, 85, 86, 100, 106, 114, 115, 116, 121, 124, 130, 133, 145, 149, 152, 157, 171, 175, 178, 191, 193, 194, 197, 232, 241, 246, 251, 252, 253
     AMBIG=REAL : +87 newly-correct, -41 newly-wrong (net +46)
       newly-correct row_uids: 6, 15, 19, 20, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 73, 76, 83, 85, 87, 92, 93, 98, 102, 110, 117, 118, 122, 125, 126, 128, 134, 135, 137, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 171, 176, 179, 182, 184, 185, 186, 187, 191, 192, 198, 199, 201, 202, 204, 205, 208, 212, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 241, 248, 250, 253, 256, 259, 262, 263, 266
       newly-wrong   row_uids: 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 232, 246, 251, 252
  BOUNDARY-BOTH: 129 rows differ from CURRENT
     AMBIG=FALSE: +83 newly-correct, -46 newly-wrong (net +37)
       newly-correct row_uids: 6, 15, 19, 20, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 73, 76, 83, 87, 92, 93, 98, 102, 110, 117, 118, 122, 125, 126, 128, 134, 135, 137, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 176, 179, 182, 184, 185, 186, 187, 192, 198, 199, 201, 202, 204, 205, 208, 212, 217, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 248, 250, 256, 259, 262, 263, 266
       newly-wrong   row_uids: 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 45, 48, 66, 70, 75, 77, 79, 85, 86, 100, 106, 114, 115, 116, 121, 124, 130, 133, 145, 149, 152, 157, 171, 175, 178, 191, 193, 194, 197, 232, 241, 246, 251, 252, 253
     AMBIG=REAL : +88 newly-correct, -41 newly-wrong (net +47)
       newly-correct row_uids: 6, 15, 19, 20, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 73, 76, 83, 85, 87, 92, 93, 98, 102, 110, 117, 118, 122, 125, 126, 128, 134, 135, 137, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 171, 176, 179, 182, 184, 185, 186, 187, 191, 192, 198, 199, 201, 202, 204, 205, 208, 212, 217, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 241, 248, 250, 253, 256, 259, 262, 263, 266
       newly-wrong   row_uids: 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 232, 246, 251, 252
  RETAINED-SUFFIX: 93 rows differ from CURRENT
     AMBIG=FALSE: +81 newly-correct, -12 newly-wrong (net +69)
       newly-correct row_uids: 6, 12, 15, 19, 24, 28, 36, 38, 40, 43, 49, 51, 53, 56, 57, 59, 62, 63, 69, 71, 72, 73, 76, 83, 87, 92, 95, 98, 102, 117, 122, 125, 126, 128, 132, 134, 135, 137, 139, 144, 147, 153, 156, 160, 162, 164, 165, 166, 168, 176, 179, 182, 183, 184, 186, 187, 192, 195, 198, 199, 201, 207, 208, 212, 217, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 248, 250, 256, 262, 263, 266
       newly-wrong   row_uids: 2, 7, 16, 31, 78, 133, 146, 155, 172, 175, 209, 241
     AMBIG=REAL : +80 newly-correct, -13 newly-wrong (net +67)
       newly-correct row_uids: 6, 12, 15, 19, 24, 28, 36, 38, 40, 43, 49, 51, 53, 56, 57, 59, 62, 63, 69, 71, 72, 73, 76, 83, 87, 92, 95, 98, 102, 117, 122, 125, 126, 128, 132, 134, 135, 137, 139, 144, 147, 153, 156, 162, 165, 166, 168, 176, 179, 182, 183, 184, 186, 187, 192, 195, 198, 199, 201, 207, 208, 212, 217, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 241, 248, 250, 256, 262, 263, 266
       newly-wrong   row_uids: 2, 7, 16, 31, 78, 133, 146, 155, 160, 164, 172, 175, 209
  BOUNDARY-PLUS-RETAINED: 137 rows differ from CURRENT
     AMBIG=FALSE: +91 newly-correct, -46 newly-wrong (net +45)
       newly-correct row_uids: 6, 12, 15, 19, 20, 24, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 72, 73, 76, 83, 87, 92, 93, 95, 98, 102, 110, 117, 118, 122, 125, 126, 128, 132, 134, 135, 137, 139, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 176, 179, 182, 183, 184, 185, 186, 187, 192, 195, 198, 199, 201, 202, 204, 205, 208, 212, 217, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 248, 250, 256, 259, 262, 263, 266
       newly-wrong   row_uids: 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 45, 48, 66, 70, 75, 77, 79, 85, 86, 100, 106, 114, 115, 116, 121, 124, 130, 133, 145, 149, 152, 157, 171, 175, 178, 191, 193, 194, 197, 232, 241, 246, 251, 252, 253
     AMBIG=REAL : +96 newly-correct, -41 newly-wrong (net +55)
       newly-correct row_uids: 6, 12, 15, 19, 20, 24, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 72, 73, 76, 83, 85, 87, 92, 93, 95, 98, 102, 110, 117, 118, 122, 125, 126, 128, 132, 134, 135, 137, 139, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 171, 176, 179, 182, 183, 184, 185, 186, 187, 191, 192, 195, 198, 199, 201, 202, 204, 205, 208, 212, 217, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 241, 248, 250, 253, 256, 259, 262, 263, 266
       newly-wrong   row_uids: 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 232, 246, 251, 252
  RETAINED-THEN-BARE: 133 rows differ from CURRENT
     AMBIG=FALSE: +90 newly-correct, -43 newly-wrong (net +47)
       newly-correct row_uids: 6, 12, 15, 19, 20, 24, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 72, 73, 76, 83, 87, 92, 93, 95, 98, 102, 110, 117, 118, 122, 125, 126, 128, 132, 134, 135, 137, 139, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 176, 179, 182, 183, 184, 186, 187, 192, 195, 198, 199, 201, 202, 204, 205, 208, 212, 217, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 248, 250, 256, 259, 262, 263, 266
       newly-wrong   row_uids: 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 130, 133, 145, 149, 152, 157, 175, 178, 191, 193, 194, 197, 232, 241, 246, 251, 252
     AMBIG=REAL : +92 newly-correct, -41 newly-wrong (net +51)
       newly-correct row_uids: 6, 12, 15, 19, 20, 24, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 72, 73, 76, 83, 87, 92, 93, 95, 98, 102, 110, 117, 118, 122, 125, 126, 128, 132, 134, 135, 137, 139, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 176, 179, 182, 183, 184, 186, 187, 191, 192, 195, 198, 199, 201, 202, 204, 205, 208, 212, 217, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 241, 248, 250, 256, 259, 262, 263, 266
       newly-wrong   row_uids: 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 232, 246, 251, 252

```
