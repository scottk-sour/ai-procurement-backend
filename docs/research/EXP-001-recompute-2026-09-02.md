# EXP-001 — Wave 1 and wave 2 mention recompute with the corrected matcher (02/09/2026)

**Date:** 2026-09-02
**Scope:** Perplexity only, both waves — the Frame C population (`docs/research/EXP-001-position.md` §13).
**Matcher:** the corrected live matcher, RETAINED-SUFFIX-SINGLE (retained-suffix on the single-token path, `includes(normFirm)` unchanged on the multi-token path). See `docs/research/EXP-001-regression-2026-09-02.md` for its 29/27 regression score and naming.
**Status:** Record of recompute runs performed in the Render shell. No code change here.

## Recompute runs

`recomputeMentions.js` was run against the stored Perplexity runs of each wave, rewriting only the `mentioned` (and `entityName`) flags from the stored raw responses. The commit is the deployed code state at the time of each run.

| Wave | Commit (code state) | Runs | Mention flags changed | Mentions before → after |
|---|---|---|---|---|
| Wave 2 (August) | `c398bd9` | 680 | 633 | 2,279 → **2,328** |
| Wave 1 (July) | `e6cca99` | 680 | 905 | 1,796 → **2,483** |

"Flags changed" is the gross count of targets whose `mentioned` value flipped (in either direction); "before → after" is the net mention total. Raw responses were not touched.

## Firm-level results (from `firmMentionSummary.js`)

| Metric | Wave 1 (July) | Wave 2 (August) |
|---|---|---|
| Distinct firms (panel) | 1,214 | 1,214 |
| Firm-answer observations | 48,560 | 48,560 |
| Mentions | 2,483 | 2,328 |
| Overall mention rate | **5.11%** | **4.79%** |
| Never named in any answer | **937 (77.2%)** | **1,002 (82.5%)** |
| Mentioned at least once | 277 | 212 |
| Never named — treatment | 458 | 485 |
| Never named — control | 479 | 517 |

Never-named-by-group sums check: 458 + 479 = 937 (wave 1); 485 + 517 = 1,002 (wave 2).

### The 48,560 denominator is now confirmed actual, not nominal
`firmMentionSummary.js` reports **48,560 firm-answer observations per wave as an actual count** (one target on one eligible run), with **every firm having exactly 40 observations** (min = max = 40). This resolves the open question flagged in PR #190: the published `48,560` is not merely the nominal product `1,214 × 40` — the data is complete and the actual observation count equals it. The mention rate is therefore `mentions / 48,560` on real observations in both waves.

## Material finding — the published wave-over-wave direction is inverted

TAI-R-2026-002 reports a **rise** in visibility between July (wave 1) and August (wave 2). On a **consistent instrument** (the same corrected matcher applied to both waves), the direction reverses:

- mention rate **falls**, 5.11% → 4.79% (−0.32pp);
- **65 more firms are never named** in August than in July (1,002 vs 937).

**This difference sits within the measured variance band.** The correct reading is therefore **that the apparent published rise was a measurement artefact — not that visibility fell.** The published rise was produced by measuring the two waves on an instrument whose single-token context gate suppressed mentions inconsistently; once both waves are measured the same way, no real wave-over-wave change is established. Do not restate this as "visibility declined": the corrected numbers do not support a real decline any more than the published ones supported a real rise.

(For context, and consistent with the above: the corrected **wave 2** figures — 2,328 mentions, 1,002 never named, 82.5% — are materially unchanged from the published wave-2 headline of 2,279 / 1,003 / 82.6%. The large movement is in **wave 1**, whose mentions rose 1,796 → 2,483 under the corrected instrument. The inversion is driven by the old instrument having under-measured wave 1 relative to wave 2.)

## Published figures affected

Both of the following were computed on the **old instrument** and are therefore affected; neither has been recomputed here:

- the published **control-drift** figure of **+0.60pp**;
- the published **treatment difference-in-differences** of **+0.79pp**.

Any restatement of the treatment effect must be recomputed on the consistent instrument before it is relied on.

## Caveat — ChatGPT wave 1 not recomputed

These recomputes were **Perplexity only**. The **ChatGPT wave 1 mention flags remain on the old rule** and were not touched. Frame C (the published figure) is Perplexity-only, so this does not affect the figures above, but any cross-platform or ChatGPT-inclusive analysis still mixes old-rule and new-rule flags and must not be read as a consistent instrument.

## References

- `docs/research/EXP-001-regression-2026-09-02.md` — the 267-row regression run and the RETAINED-SUFFIX-SINGLE naming.
- `docs/research/EXP-001-position.md` §13 — the three sampling frames; Frame C definition.
- `scripts/experiments/firmMentionSummary.js` (PR #190) — the firm-level report used here.
- `scripts/experiments/recomputeMentions.js` — the recompute (mention flags only; raw responses untouched).
