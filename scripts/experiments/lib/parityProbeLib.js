/**
 * parityProbeLib.js — pure, network-free helpers for the Sonar → Agent API
 * parity probe (scripts/experiments/parityProbe.js).
 *
 * WHY THIS FILE EXISTS SEPARATELY: every function here is deterministic and
 * dependency-free, so the probe's extraction and comparison logic can be unit
 * tested without an API key, without a network call, and without MongoDB.
 *
 * DESIGN RULE — DISCOVER, NEVER ASSUME.
 * At the time this was written, docs.perplexity.ai could not be fetched
 * directly from the authoring environment (blocked by the egress policy), so
 * the Agent API response field names below are sourced from Perplexity's
 * official documentation *as surfaced through search*, not read first-hand.
 * Rather than hard-code one believed shape and silently report zero citations
 * if it is wrong, every extractor walks an ORDERED LIST of candidate shapes and
 * reports WHICH one matched. An unrecognised payload returns shape `null` — it
 * is never coerced into an empty result. The probe treats shape `null` as a
 * finding to report, not as "no citations".
 *
 * Nothing here writes to disk, opens a socket, or imports mongoose.
 */

// ─── Candidate response shapes ───────────────────────────────────────────────

/**
 * Citation shapes, tried in this order. Each entry documents where the shape
 * comes from so a future reader can tell a verified shape from a candidate.
 *
 *  sonar.citations          Sonar Chat Completions: top-level `citations` array
 *                           of URL strings. VERIFIED against the recorded wire
 *                           body in tests/unit/rawResponseSerialisable.test.js
 *                           and against services/… consumption in
 *                           scripts/experiments/runExperimentScan.js.
 *  sonar.search_results     Sonar Chat Completions: top-level `search_results`
 *                           array of objects. Documented by Perplexity; not
 *                           consumed anywhere in this repo today.
 *  agent.output.search_results
 *                           Agent API: an item in the typed `output[]` array
 *                           whose type denotes search results, carrying
 *                           `results[]` with id/url/title/snippet/date.
 *                           CANDIDATE — doc-sourced via search, unverified.
 *  agent.annotations        Agent API: citation annotations attached to an
 *                           `output_text` content block.
 *                           CANDIDATE — doc-sourced via search, unverified.
 */
export const CITATION_SHAPES = [
  'sonar.citations',
  'sonar.search_results',
  'agent.output.search_results',
  'agent.annotations',
];

export const ANSWER_SHAPES = [
  'sonar.choices',        // choices[0].message.content — VERIFIED
  'agent.output_text',    // top-level aggregate convenience field — CANDIDATE
  'agent.output.message', // output[] message item → content[] output_text — CANDIDATE
];

// ─── Small utilities ─────────────────────────────────────────────────────────

function isObj(v) {
  return v !== null && typeof v === 'object';
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Lowercased hostname with a leading "www." removed. Returns null when the
 * input is not parseable as a URL — callers must handle null rather than
 * treating it as a host.
 */
export function hostOf(url) {
  if (!isNonEmptyString(url)) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Jaccard index of two iterables treated as sets: |A ∩ B| / |A ∪ B|.
 * Two empty sets are defined here as 1 (identical), which matters because
 * "neither arm cited anything" is agreement, not disagreement.
 */
export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

// ─── Inline [n] marker detection ─────────────────────────────────────────────

const MARKER_RE = /\[(\d{1,3})\]/g;

/** Every [n] marker in the text, in order of appearance, as numbers. */
export function markerNumbers(text) {
  if (!isNonEmptyString(text)) return [];
  const out = [];
  let m;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text)) !== null) out.push(parseInt(m[1], 10));
  return out;
}

/** True when the answer text carries at least one inline [n] citation marker. */
export function hasInlineMarkers(text) {
  return markerNumbers(text).length > 0;
}

// ─── Answer-text extraction ──────────────────────────────────────────────────

/**
 * Pull the answer text out of a raw response.
 * @returns {{shape: string|null, text: string}} shape null => unrecognised
 *   payload; `text` is '' in that case and the caller must report the shape
 *   failure rather than treating it as an empty answer.
 */
export function extractAnswerText(raw) {
  if (!isObj(raw)) return { shape: null, text: '' };

  // sonar.choices
  const sonarText = raw?.choices?.[0]?.message?.content;
  if (isNonEmptyString(sonarText)) return { shape: 'sonar.choices', text: sonarText };

  // agent.output_text (SDK convenience aggregate)
  if (isNonEmptyString(raw?.output_text)) {
    return { shape: 'agent.output_text', text: raw.output_text };
  }

  // agent.output.message
  if (Array.isArray(raw?.output)) {
    const parts = [];
    for (const item of raw.output) {
      if (!isObj(item)) continue;
      if (typeof item.type === 'string' && !item.type.includes('message')) continue;
      const content = Array.isArray(item.content) ? item.content : [];
      for (const c of content) {
        if (!isObj(c)) continue;
        const t = typeof c.type === 'string' ? c.type : '';
        if (t === 'output_text' || t === 'text' || t === '') {
          if (isNonEmptyString(c.text)) parts.push(c.text);
        }
      }
    }
    if (parts.length > 0) return { shape: 'agent.output.message', text: parts.join('') };
  }

  return { shape: null, text: '' };
}

// ─── Citation extraction ─────────────────────────────────────────────────────

/**
 * Pull citations out of a raw response, preserving ORDER and preserving
 * DUPLICATES — both are load-bearing downstream (ClaimUseLabel.citationIndex is
 * a zero-based index into the stored citedUrls[] array and is half of a unique
 * key), so this function must never dedupe or sort.
 *
 * @returns {{shape: string|null, entries: Array<{url: string|null, id: *, title: string|null, index: number}>}}
 *   shape null => unrecognised payload. `entries` is [] in that case, and the
 *   caller MUST report it as a shape failure, not as "zero citations".
 */
export function extractCitations(raw) {
  if (!isObj(raw)) return { shape: null, entries: [] };

  // sonar.citations — array of bare URL strings
  if (Array.isArray(raw.citations) && raw.citations.length > 0) {
    return {
      shape: 'sonar.citations',
      entries: raw.citations.map((u, index) => ({
        url: typeof u === 'string' ? u : (isObj(u) ? (u.url ?? null) : null),
        id: undefined,
        title: isObj(u) ? (u.title ?? null) : null,
        index,
      })),
    };
  }

  // sonar.search_results — array of objects
  if (Array.isArray(raw.search_results) && raw.search_results.length > 0) {
    return {
      shape: 'sonar.search_results',
      entries: raw.search_results.map((r, index) => ({
        url: isObj(r) ? (r.url ?? null) : (typeof r === 'string' ? r : null),
        id: isObj(r) ? r.id : undefined,
        title: isObj(r) ? (r.title ?? null) : null,
        index,
      })),
    };
  }

  // agent.output.search_results — typed output[] item carrying results[]
  if (Array.isArray(raw.output)) {
    const entries = [];
    for (const item of raw.output) {
      if (!isObj(item)) continue;
      const type = typeof item.type === 'string' ? item.type : '';
      if (!type.toLowerCase().includes('search_results')) continue;
      const results = Array.isArray(item.results) ? item.results : [];
      for (const r of results) {
        if (!isObj(r)) continue;
        entries.push({
          url: r.url ?? null,
          id: r.id,
          title: r.title ?? null,
          index: entries.length,
        });
      }
    }
    if (entries.length > 0) return { shape: 'agent.output.search_results', entries };
  }

  // agent.annotations — citation annotations on an output_text block
  if (Array.isArray(raw.output)) {
    const entries = [];
    for (const item of raw.output) {
      if (!isObj(item)) continue;
      const content = Array.isArray(item.content) ? item.content : [];
      for (const c of content) {
        if (!isObj(c)) continue;
        const anns = Array.isArray(c.annotations) ? c.annotations : [];
        for (const a of anns) {
          if (!isObj(a) || !isNonEmptyString(a.url)) continue;
          entries.push({
            url: a.url,
            id: a.id,
            title: a.title ?? null,
            index: entries.length,
          });
        }
      }
    }
    if (entries.length > 0) return { shape: 'agent.annotations', entries };
  }

  return { shape: null, entries: [] };
}

/**
 * THE DISQUALIFYING CHECK (Stage 1 acceptance criterion 6).
 *
 * ClaimUseLabel keys uniquely on {runId, citationIndex} where citationIndex is
 * the zero-based position in citedUrls[]. If the Agent API's own `id` on each
 * search result is not that same zero-based position, then "citation 3" means
 * two different things either side of a migration and every existing
 * claim-use label identity breaks.
 *
 * @returns {{verdict: 'zero-based'|'one-based'|'absent'|'misaligned', ids: Array}}
 */
export function checkIdIndexAlignment(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const ids = list.map((e) => e?.id);
  if (list.length === 0) return { verdict: 'absent', ids };
  if (ids.every((id) => id === undefined || id === null)) return { verdict: 'absent', ids };

  const numeric = ids.map((id) => (typeof id === 'number' ? id : Number(id)));
  if (numeric.some((n) => !Number.isInteger(n))) return { verdict: 'misaligned', ids };

  if (numeric.every((n, i) => n === i)) return { verdict: 'zero-based', ids };
  if (numeric.every((n, i) => n === i + 1)) return { verdict: 'one-based', ids };
  return { verdict: 'misaligned', ids };
}

// ─── Structural discovery ────────────────────────────────────────────────────

/**
 * Shallow structural fingerprint of an unknown payload: top-level keys, and for
 * an `output[]` array the ordered list of item `type` values. Used to REPORT an
 * unrecognised shape instead of guessing at it.
 */
export function summariseStructure(raw) {
  if (!isObj(raw)) return { topLevelKeys: [], outputItemTypes: null };
  const topLevelKeys = Object.keys(raw).sort();
  let outputItemTypes = null;
  if (Array.isArray(raw.output)) {
    outputItemTypes = raw.output.map((i) => (isObj(i) && typeof i.type === 'string' ? i.type : '(untyped)'));
  }
  return { topLevelKeys, outputItemTypes };
}

// ─── Per-arm aggregation ─────────────────────────────────────────────────────

/**
 * Aggregate the per-run records of one arm into the comparison metrics named in
 * the Stage 1 test design. Pure: takes records, returns numbers.
 *
 * Each record is {ok, answerShape, citationShape, text, entries, mentionedNames[],
 * searchRan, latencyMs, httpStatus, error}.
 */
export function summariseArm(records) {
  const runs = Array.isArray(records) ? records : [];
  const ok = runs.filter((r) => r && r.ok);
  const n = ok.length;

  const citationCounts = ok.map((r) => (r.entries || []).length);
  const markerRuns = ok.filter((r) => hasInlineMarkers(r.text)).length;
  const searchRuns = ok.filter((r) => r.searchRan === true).length;

  const hosts = new Set();
  for (const r of ok) {
    for (const e of r.entries || []) {
      const h = hostOf(e.url);
      if (h) hosts.add(h);
    }
  }

  // Mention rate is per (run × target): the fraction of all target checks that
  // came back true. This mirrors how EXP-001 counts targets, one row per target
  // per run — it is NOT "fraction of runs with any mention".
  let targetChecks = 0;
  let targetHits = 0;
  for (const r of ok) {
    const names = r.mentionedNames || {};
    for (const k of Object.keys(names)) {
      targetChecks += 1;
      if (names[k] === true) targetHits += 1;
    }
  }

  const answerShapes = [...new Set(ok.map((r) => r.answerShape))];
  const citationShapes = [...new Set(ok.map((r) => r.citationShape))];

  return {
    attempted: runs.length,
    ok: n,
    failed: runs.length - n,
    answerShapes,
    citationShapes,
    unknownAnswerShapeRuns: ok.filter((r) => r.answerShape === null).length,
    unknownCitationShapeRuns: ok.filter((r) => r.citationShape === null).length,
    markerRate: n ? markerRuns / n : null,
    searchRanRate: n ? searchRuns / n : null,
    citationCount: {
      min: n ? Math.min(...citationCounts) : null,
      max: n ? Math.max(...citationCounts) : null,
      mean: n ? citationCounts.reduce((a, b) => a + b, 0) / n : null,
      values: citationCounts,
    },
    distinctHosts: [...hosts].sort(),
    mention: {
      checks: targetChecks,
      hits: targetHits,
      rate: targetChecks ? targetHits / targetChecks : null,
    },
    latencyMs: {
      min: n ? Math.min(...ok.map((r) => r.latencyMs)) : null,
      max: n ? Math.max(...ok.map((r) => r.latencyMs)) : null,
      mean: n ? ok.reduce((a, r) => a + r.latencyMs, 0) / n : null,
    },
  };
}

export default {
  CITATION_SHAPES,
  ANSWER_SHAPES,
  hostOf,
  jaccard,
  markerNumbers,
  hasInlineMarkers,
  extractAnswerText,
  extractCitations,
  checkIdIndexAlignment,
  summariseStructure,
  summariseArm,
};
