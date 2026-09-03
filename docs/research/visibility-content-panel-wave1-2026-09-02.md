# AI-visibility content study — buyer_research_30, wave 1 (Perplexity only)

**Study:** `study_2026_09_ai_visibility_content`
**Panel:** `buyer_research_30`
**Wave:** 1
**Collected:** 02/09/2026, at commit `323e531`
**Analysed with:** `scripts/experiments/citationLandscape.js`
**Status:** First collection of this study. Record of results — no code change.

## Collection

- **300 Perplexity runs** — 30 prompts × 10 repeats.
- **0 errors.**
- **300 of 300 runs (100%) cited at least one URL.** Every run returned a non-empty `citedUrls[]`.

### Perplexity-only wave — carry this caveat everywhere the result is used
The **ChatGPT arm did not run.** `gpt-4o-mini-search-preview` returns `404` — the model is retired — so no ChatGPT runs were collected in this wave. **Wave 1 is Perplexity-only and must be described as such wherever this result is quoted.** It is not a cross-engine measurement.

## Headline result — tendorai.com

- **tendorai.com cited in 50 of 300 runs (16.7%).**
- Split by intent: **50 of 150 buyer-intent runs (33.3%)**; **0 of 150 research-intent runs (0.0%)**.
- **Six distinct TendorAI pages** were cited, appearing on prompts **bi-01, bi-02, bi-04, bi-06 and bi-15** — all buyer-intent. No research-intent prompt cited tendorai.com.

TendorAI's citations are concentrated entirely in the buyer-intent arm ("how do I get my firm recommended by AI") and absent from the research-intent arm ("what do AI assistants read / use").

## Nearest comparable domain — greggking.co.uk

- **greggking.co.uk: 70 of 300 overall (23.3%)** — **60 buyer (40.0%)**, **10 research (6.7%)**.

It is cited more than tendorai.com overall and in the buyer arm, and — unlike tendorai.com — appears in the research arm too.

## Most-cited domains overall

(As reported by `citationLandscape.js`, ranked by share of the 300 runs; bare hostnames, not classified into categories.)

| Domain | Share of runs |
|---|---|
| linkedin.com | 50.0% |
| reddit.com | 43.0% |
| martindale-avvo.com | 37.3% |
| clio.com | 33.3% |
| greggking.co.uk | 23.3% (70/300) |
| tendorai.com | 16.7% (50/300) |

## Integrity notes — do not edit these after the fact

- **The panel was frozen before collection** (`data/experiments/visibility-content-config.json`, `frozen: 2026-09-02`). Now that results exist, **the prompts must not be edited.** Changing prompt wording or IDs would silently break comparability with this wave; a reworded panel is a new panel, not a continuation of `buyer_research_30`.
- **Intent is stored in the config, not on the runs.** The `ExperimentRun` documents carry `promptId` but **not** `intent`; the buyer/research split above exists only because `citationLandscape.js` reads the per-prompt `intent` field from `visibility-content-config.json`. **The config file is therefore load-bearing for interpreting these results and must not be edited** — editing it would retroactively change what "buyer" and "research" mean for an already-collected wave. Treat it as part of the frozen record.

## References

- `data/experiments/visibility-content-config.json` — the frozen `buyer_research_30` panel (source of truth for prompt text and per-prompt intent).
- `scripts/experiments/citationLandscape.js` — the read-only open-set citation analysis used here.
- `scripts/experiments/runExperimentScan.js` — the scanner (stores full `citedUrls[]` on every run).
