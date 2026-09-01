import { describe, it, expect } from 'vitest';
import {
  PREDICT,
  RULES,
  retainedSuffixForm,
} from '../../scripts/experiments/scoreCandidateRules.js';
import { normaliseFirmName } from '../../scripts/experiments/lib/mentionMatcher.js';

/**
 * Hand-calculated fixture for the six EXP-001 candidate matching rules.
 *
 * These expectations were calculated FROM THE WRITTEN RULE DEFINITIONS before
 * consulting the implementation. Hand-calculated expectations are authoritative:
 * if any disagrees with the implementation, the implementation (or the rule
 * definition) is wrong — the expectation is not to be edited to force a pass.
 *
 * Importing scoreCandidateRules.js does NOT run the scorer: its main() is behind
 * a run-as-script guard, so importing only exposes the pure rule functions.
 *
 * Rule vector order (matches RULES):
 *   [0] CURRENT
 *   [1] BOUNDARY-SINGLE
 *   [2] BOUNDARY-BOTH
 *   [3] RETAINED-SUFFIX
 *   [4] BOUNDARY-PLUS-RETAINED
 *   [5] RETAINED-THEN-BARE
 *
 * Shared facts used in every hand-calculation:
 *   - normaliseResponseText lowercases, maps & -> " and ", strips ** and the
 *     punctuation class [.,;:()'"[]{}!?*#] to spaces, and collapses whitespace.
 *   - CURRENT single-token path requires a list-marker/number/newline/bold
 *     context immediately before the token (contextRe); a token in plain prose
 *     preceded by an ordinary word does NOT satisfy it.
 *   - Single-token length gate: reject if len<3, or (len<4 and the ORIGINAL
 *     first word is not an all-caps acronym).
 *   - SUFFIX_RE needs a leading [\s,.]+, so the first token never strips and the
 *     loop never reaches empty.
 */

const ORDER = [
  'CURRENT',
  'BOUNDARY-SINGLE',
  'BOUNDARY-BOTH',
  'RETAINED-SUFFIX',
  'BOUNDARY-PLUS-RETAINED',
  'RETAINED-THEN-BARE',
];

const vec = (resp, firm) => ORDER.map((rule) => PREDICT[rule](resp, firm));

describe('candidate-rule harness — rule set', () => {
  it('exposes exactly the six rules in order', () => {
    expect(RULES).toEqual(ORDER);
  });
});

// ── Case 1 — retained form is the correct discriminator; bare token false-positives ──
// Firm "Yorkshire Legal Limited": fully-stripped "yorkshire" (single, 9 chars),
// retained "yorkshire legal".
describe('Case 1 — Yorkshire Legal Limited', () => {
  const FIRM = 'Yorkshire Legal Limited';

  it('normalises as documented', () => {
    expect(normaliseFirmName(FIRM)).toBe('yorkshire');
    expect(retainedSuffixForm(FIRM)).toBe('yorkshire legal');
  });

  // 1a — the COUNTY is named, the FIRM is not. Correct answer: NOT mentioned (false).
  //   normText: "...reputable solicitors across yorkshire and the humber region"
  //   CURRENT [0]=false : "yorkshire" preceded by "across " (no list/number/bold marker).
  //   B-SINGLE[1]=true  : \byorkshire\b present  -> FALSE POSITIVE (county).
  //   B-BOTH  [2]=true  : single-token path, \byorkshire\b -> FALSE POSITIVE.
  //   RETAINED[3]=false : \byorkshire legal\b absent -> correctly no match.
  //   P+R     [4]=true  : retained absent; bare "yorkshire" (9>=4) -> FALSE POSITIVE.
  //   THEN    [5]=true  : bare "yorkshire" (9>=4) -> FALSE POSITIVE.
  it('1a: county only — retained avoids the bare-token false positive', () => {
    const resp = 'For conveyancing, there are many reputable solicitors across Yorkshire and the Humber region.';
    expect(vec(resp, FIRM)).toEqual([false, true, true, false, true, true]);
  });

  // 1b — the FIRM is named ("Yorkshire Legal" at the start of the line).
  //   normText starts "yorkshire legal is a well regarded firm..."
  //   CURRENT [0]=true  : "yorkshire" at ^ satisfies contextRe.
  //   B-SINGLE[1]=true  : \byorkshire\b present.
  //   B-BOTH  [2]=true  : \byorkshire\b present.
  //   RETAINED[3]=true  : \byorkshire legal\b present -> retained matches correctly.
  //   P+R     [4]=true  : retained matches.
  //   THEN    [5]=true  : retained matches.
  it('1b: firm named — retained form matches', () => {
    const resp = 'Yorkshire Legal is a well-regarded firm based in Leeds.';
    expect(vec(resp, FIRM)).toEqual([true, true, true, true, true, true]);
  });
});

// ── Case 2 — bare token matches, retained form does not ──
// Firm "Howells LLP": fully-stripped "howells" (single, 7 chars), retained "howells llp".
// Response contains "Howells" alone (the firm IS mentioned, so true is correct here).
describe('Case 2 — Howells LLP', () => {
  const FIRM = 'Howells LLP';

  it('normalises as documented', () => {
    expect(normaliseFirmName(FIRM)).toBe('howells');
    expect(retainedSuffixForm(FIRM)).toBe('howells llp');
  });

  //   normText: "i would recommend howells for residential conveyancing in cardiff"
  //   CURRENT [0]=false : "howells" preceded by "recommend " (no marker) -> MISS.
  //   B-SINGLE[1]=true  : \bhowells\b present.
  //   B-BOTH  [2]=true  : \bhowells\b present.
  //   RETAINED[3]=false : \bhowells llp\b absent -> retained does NOT match (a MISS here).
  //   P+R     [4]=true  : retained fails; bare "howells" (7>=4) matches.
  //   THEN    [5]=true  : bare "howells" (7>=4) matches.
  it('bare "Howells" matches the fallback rules but not RETAINED-SUFFIX', () => {
    const resp = 'I would recommend Howells for residential conveyancing in Cardiff.';
    expect(vec(resp, FIRM)).toEqual([false, true, true, false, true, true]);
  });
});

// ── Case 3 — "suffix-only"-looking name ──
// Firm "Law Limited". SUFFIX_RE needs a leading separator, so "law" (the first
// token) never strips: fully-stripped = "law" (NOT empty), retained = "law limited".
// The expected false for all three NEW rules therefore arises NOT from any bare
// generic-word guard, but from: (a) retained "law limited" is absent from the
// response, and (b) the bare fallback token "law" is 3 chars, not an all-caps
// acronym, so the existing single-token length gate rejects it.
describe('Case 3 — Law Limited (suffix-only-looking)', () => {
  const FIRM = 'Law Limited';

  it('normalises as documented — first token survives, not empty, not bare "law"', () => {
    expect(normaliseFirmName(FIRM)).toBe('law');          // fully-stripped
    expect(retainedSuffixForm(FIRM)).toBe('law limited'); // retained (one strip earlier)
  });

  //   normText: "the law requires all parties to act in good faith"
  //   CURRENT [0]=false : single "law" (3, non-acronym) rejected by length gate.
  //   B-SINGLE[1]=false : same length gate.
  //   B-BOTH  [2]=false : same length gate.
  //   RETAINED[3]=false : \blaw limited\b absent.
  //   P+R     [4]=false : retained absent; bare "law" (3, non-acronym) rejected by gate.
  //   THEN    [5]=false : retained absent; bare "law" (3 < 4) rejected.
  it('all six rules return false', () => {
    const resp = 'The law requires all parties to act in good faith.';
    expect(vec(resp, FIRM)).toEqual([false, false, false, false, false, false]);
  });
});

// ── Case 4 — 3-character acronym ──
// Firm "ABC Solicitors": fully-stripped "abc" (single, 3 chars, ORIGINAL first
// word "ABC" is all-caps -> acronym), retained "abc solicitors".
// Response contains "ABC" alone. This isolates the acronym exception:
// BOUNDARY-PLUS-RETAINED honours it (bare "abc" allowed), RETAINED-THEN-BARE
// ignores it and requires 4+ chars (bare "abc" refused).
describe('Case 4 — ABC Solicitors (3-char acronym)', () => {
  const FIRM = 'ABC Solicitors';

  it('normalises as documented', () => {
    expect(normaliseFirmName(FIRM)).toBe('abc');
    expect(retainedSuffixForm(FIRM)).toBe('abc solicitors');
  });

  //   normText: "you should contact abc about your claim"
  //   CURRENT [0]=false : "abc" acronym passes length gate but is in plain prose
  //                       ("contact abc") so contextRe is not satisfied -> MISS.
  //   B-SINGLE[1]=true  : acronym passes gate; \babc\b present.
  //   B-BOTH  [2]=true  : same.
  //   RETAINED[3]=false : \babc solicitors\b absent.
  //   P+R     [4]=true  : retained fails; bare "abc" allowed (acronym exception) -> matches.
  //   THEN    [5]=false : retained fails; bare "abc" (3 < 4, acronym ignored) refused.
  it('PLUS-RETAINED permits the acronym; THEN-BARE refuses the 3-char bare token', () => {
    const resp = 'You should contact ABC about your claim.';
    expect(vec(resp, FIRM)).toEqual([false, true, true, false, true, false]);
  });
});

// ── Case 5 — multi-token firm ──
// Firm "Wake Smith Solicitors Limited": fully-stripped "wake smith" (2 tokens),
// retained "wake smith solicitors". Confirms the new rules leave the multi-token
// path untouched except that RETAINED-SUFFIX demands the retained phrase.
describe('Case 5 — Wake Smith Solicitors Limited (multi-token)', () => {
  const FIRM = 'Wake Smith Solicitors Limited';

  it('normalises as documented', () => {
    expect(normaliseFirmName(FIRM)).toBe('wake smith');
    expect(retainedSuffixForm(FIRM)).toBe('wake smith solicitors');
  });

  // 5a — "Wake Smith" present, "Solicitors" absent (the firm IS mentioned).
  //   normText: "for your matter wake smith is a solid choice in sheffield"
  //   CURRENT [0]=true  : multi-token includes("wake smith").
  //   B-SINGLE[1]=true  : multi-token includes("wake smith").
  //   B-BOTH  [2]=true  : \bwake smith\b present.
  //   RETAINED[3]=false : \bwake smith solicitors\b absent -> MISS.
  //   P+R     [4]=true  : retained fails; multi-token fallback \bwake smith\b matches.
  //   THEN    [5]=true  : retained fails; multi-token fallback \bwake smith\b matches.
  it('5a: partial name — fallback rules reproduce the multi-token boundary path', () => {
    const resp = 'For your matter, Wake Smith is a solid choice in Sheffield.';
    expect(vec(resp, FIRM)).toEqual([true, true, true, false, true, true]);
  });

  // 5b — full "Wake Smith Solicitors" present.
  //   normText: "wake smith solicitors handled our sale efficiently"
  //   All six true: CURRENT/B-SINGLE include "wake smith"; B-BOTH \bwake smith\b;
  //   RETAINED \bwake smith solicitors\b; P+R and THEN via the retained match.
  it('5b: full retained phrase — retained matches too', () => {
    const resp = 'Wake Smith Solicitors handled our sale efficiently.';
    expect(vec(resp, FIRM)).toEqual([true, true, true, true, true, true]);
  });
});

// ── Case 6 — generic first token (documents the false-positive source) ──
// Firm "Legal Services Ltd": fully-stripped "legal" (single, 5 chars — passes the
// length gate), retained "legal services". Response uses "legal" as an ordinary
// word. RETAINED-SUFFIX avoids the false positive by requiring "legal services";
// the plain boundary rules and the bare-fallback rules DO false-positive on the
// generic 5-char first token. This documents the FP source rather than suppressing
// it (no generic-word list / no special-casing).
describe('Case 6 — Legal Services Ltd (generic first token)', () => {
  const FIRM = 'Legal Services Ltd';

  it('normalises as documented', () => {
    expect(normaliseFirmName(FIRM)).toBe('legal');
    expect(retainedSuffixForm(FIRM)).toBe('legal services');
  });

  //   normText: "you may need legal advice before signing the contract"
  //   CURRENT [0]=false : "legal" (5) passes the length gate but "need legal" is
  //                       plain prose -> contextRe not satisfied.
  //   B-SINGLE[1]=true  : \blegal\b present -> FALSE POSITIVE (ordinary word).
  //   B-BOTH  [2]=true  : \blegal\b present -> FALSE POSITIVE.
  //   RETAINED[3]=false : \blegal services\b absent -> correctly no match.
  //   P+R     [4]=true  : retained fails; bare "legal" (5>=4) -> FALSE POSITIVE.
  //   THEN    [5]=true  : bare "legal" (5>=4) -> FALSE POSITIVE.
  it('generic 5-char first token false-positives in the bare-fallback rules; RETAINED-SUFFIX avoids it', () => {
    const resp = 'You may need legal advice before signing the contract.';
    expect(vec(resp, FIRM)).toEqual([false, true, true, false, true, true]);
  });
});
