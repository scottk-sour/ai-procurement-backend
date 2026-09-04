/**
 * experimentRunDoc — builds the ExperimentRun.create() payload for the scan
 * runner. Extracted into its own module purely so the wave-sensitivity of the
 * raw-response capture is unit-testable without importing the runner (which
 * connects to MongoDB on invocation).
 *
 * INVARIANT (constraint 3): for wave 1 — and for the ChatGPT/Gemini paths, which
 * supply no `raw` — this returns exactly the original field set with NO
 * `rawResponse` property present. `rawResponse` is included ONLY for a wave >= 2
 * Perplexity run that actually carries a raw API response object. The response
 * payload fields (responseText, citedUrls) are passed through verbatim; nothing
 * here normalises, dedupes, reorders, stringifies or transforms them.
 */
export function experimentRunDoc({
  study, wave, prompt, platform, modelVersion, text, citations, targetResults, raw,
}) {
  const doc = {
    study,
    wave,
    promptId: prompt.id,
    promptText: prompt.text,
    platform,
    modelVersion,
    modelParams: { max_tokens: 1024 },
    responseText: text,
    citedUrls: citations,
    targets: targetResults,
    status: 'ok',
  };

  // Perplexity path only, wave >= 2 only, and only when a raw object was supplied.
  if (wave >= 2 && platform === 'perplexity' && raw !== undefined) {
    doc.rawResponse = raw;
  }

  return doc;
}
