#!/usr/bin/env node

/**
 * scoreCandidateRules.js — READ-ONLY scoring harness for the EXP-001 mention
 * matcher. Scores six candidate rules against the completed 267-row blinded
 * adjudication and prints the confusion metrics side by side.
 *
 * NO DATABASE. NO NETWORK. NO WRITES anywhere (no bulkWrite/updateOne/save).
 * Node built-ins only (fs, path, url) plus the matcher's exported normalisation
 * helpers. It does not modify mentionMatcher.js and reproduces the boundary
 * rules locally.
 *
 * Inputs (CLI, this repo's args.indexOf('--flag') style):
 *   --ground-truth <path>  mention-ground-truth-sample.csv  (FULL response_text)
 *   --view <path>          labelling-view.csv  (human_verdict filled in)
 *   --key <path>           labelling-key.csv   (row_uid -> run_id, stratum)
 *
 * Join: row_uid --(key)--> run_id ; row_uid --(view)--> firm_entity_name ;
 *       (run_id, firm_entity_name) --(ground-truth)--> full response_text.
 * run_id is NOT unique per labelled row; (run_id, firm_entity_name) is (target
 * entityName is unique within every prompt). A mis-join hard-stops (see gates).
 *
 * Rules scored:
 *   CURRENT                 the matcher as it stands today (imported isFirmMentioned).
 *   BOUNDARY-SINGLE         single-token contextRe gate replaced by \b<token>\b;
 *                           multi-token path unchanged (bare includes).
 *   BOUNDARY-BOTH           as SINGLE, and the multi-token includes replaced by
 *                           \b<normFirm>\b.
 *   RETAINED-SUFFIX         \b<retained-suffix form>\b only; no bare fallback.
 *   BOUNDARY-PLUS-RETAINED  retained-form \b match; on failure fall back to the
 *                           fully-stripped form (single-token: existing length
 *                           floor + acronym exception + \b; multi-token: \b phrase).
 *   RETAINED-THEN-BARE      as BOUNDARY-PLUS-RETAINED, but the single-token bare
 *                           fallback needs 4+ chars and the acronym exception is
 *                           ignored (isolates 3-char-acronym false positives).
 * The boundary rules reuse the exported normaliseFirmName / normaliseResponseText
 * and replicate the matcher's length + acronym gates verbatim; only the match
 * test changes. retainedSuffixForm is imported from lib/mentionMatcher.js (the
 * production matcher owns it and is the single source of truth for the selected
 * RETAINED-SUFFIX rule). Primary decision metric: TOTAL ERRORS (FN + FP), not miss rate.
 *
 * Metric definitions (printed in the report header so numbers are unambiguous):
 *   A row is a POSITIVE prediction when the rule says the firm is mentioned.
 *   Truth per row from the human verdict: REAL = positive, FALSE = negative,
 *   AMBIGUOUS = interpreted both ways and reported twice (never a midpoint):
 *     lower bound  = AMBIGUOUS counted FALSE   (pre-registration §8)
 *     upper bound  = AMBIGUOUS counted REAL
 *   miss rate            = FN / N(stratum)   (rule said NO on a truth-positive)
 *   false-positive rate  = FP / N(stratum)   (rule said YES on a truth-negative)
 *   N(stratum) is the stratum's row count (A=217, B=50, combined=267), matching
 *   the adjudication headline figures (e.g. 90/217 = 41.5%). Raw TP/FP/TN/FN are
 *   printed too. NOTE: because "lower"/"upper" name the AMBIGUOUS treatment (not
 *   a numeric order), the false-positive-rate lower bound is numerically HIGHER
 *   than its upper bound (AMBIGUOUS=FALSE inflates false positives).
 *
 * Usage:
 *   node scripts/experiments/scoreCandidateRules.js \
 *     --ground-truth data/experiments/mention-ground-truth-sample.csv \
 *     --view data/experiments/labelling-view.csv \
 *     --key data/experiments/labelling-key.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { normaliseFirmName, normaliseResponseText, isFirmMentioned, retainedSuffixForm } from './lib/mentionMatcher.js';

// retainedSuffixForm now lives in the production matcher (lib/mentionMatcher.js),
// which is the single source of truth for the selected RETAINED-SUFFIX rule. It
// is re-exported here so existing importers of the scorer (the unit test) keep
// working without reaching past the scorer.
export { retainedSuffixForm };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXPECTED_TOTAL = 267;
const EXPECTED_A = 217;
const EXPECTED_B = 50;
const VALID_VERDICTS = new Set(['REAL', 'FALSE', 'AMBIGUOUS']);
export const RULES = [
  'CURRENT',
  'BOUNDARY-SINGLE',
  'BOUNDARY-BOTH',
  'RETAINED-SUFFIX',
  'BOUNDARY-PLUS-RETAINED',
  'RETAINED-THEN-BARE',
];

// ── CLI ──
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function die(msg, code = 1) { console.error(msg); process.exit(code); }

// Parse + validate the three required CLI inputs. Moved out of module scope so
// the file can be imported (e.g. by unit tests) without exiting; the arguments,
// validation, and failure modes are identical to before when run as a script.
function parseCliArgs() {
  const GROUND_TRUTH = argVal('--ground-truth');
  const VIEW = argVal('--view');
  const KEY = argVal('--key');
  for (const [flag, p] of [['--ground-truth', GROUND_TRUTH], ['--view', VIEW], ['--key', KEY]]) {
    if (!p) die(`Missing required argument ${flag}`);
    if (!fs.existsSync(p)) die(`File not found for ${flag}: ${p}`);
    try { fs.accessSync(p, fs.constants.R_OK); } catch { die(`File not readable for ${flag}: ${p}`); }
  }
  return { GROUND_TRUTH, VIEW, KEY };
}

// ── Streaming RFC4180 parser (same shape as buildLabellingView.js) ──
function streamCsv(inputPath, onRecord) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });
    let field = '', record = [], inQuotes = false, quotePending = false, sawAny = false;
    const endField = () => { record.push(field); field = ''; };
    const endRecord = () => { endField(); onRecord(record); record = []; };
    stream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i]; sawAny = true;
        if (quotePending) { quotePending = false; if (c === '"') { field += '"'; inQuotes = true; continue; } inQuotes = false; }
        if (inQuotes) { if (c === '"') quotePending = true; else field += c; continue; }
        if (c === '"') { inQuotes = true; continue; }
        if (c === ',') { endField(); continue; }
        if (c === '\n') { endRecord(); continue; }
        if (c === '\r') continue;
        field += c;
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (quotePending) { quotePending = false; inQuotes = false; }
      if (inQuotes) return reject(new Error(`Unterminated quoted field in ${inputPath}`));
      if (field !== '' || record.length > 0) endRecord();
      if (!sawAny) return reject(new Error(`Empty CSV: ${inputPath}`));
      resolve();
    });
  });
}
function headerIndex(header, required, file) {
  const idx = {};
  const h = header.map((s) => s.trim());
  for (const col of required) {
    const at = h.indexOf(col);
    if (at === -1) die(`${file} is missing expected column "${col}". Header: ${h.join(',')}`);
    idx[col] = at;
  }
  return idx;
}

// ── Candidate rules (matcher untouched; boundary rules replicated locally) ──
export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function ruleCurrent(responseText, firmName) { return isFirmMentioned(responseText, firmName) === true; }
export function ruleBoundary(responseText, firmName, multiBoundary) {
  if (!responseText || !firmName) return false;
  const normText = normaliseResponseText(responseText);
  const normFirm = normaliseFirmName(firmName);
  if (!normFirm || normFirm.length < 3) return false;               // matcher line 49
  const tokens = normFirm.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length >= 2) {
    if (multiBoundary) return new RegExp(`\\b${escapeRe(normFirm)}\\b`).test(normText);
    return normText.includes(normFirm);                             // matcher line 54
  }
  const token = tokens[0];
  const firstWord = firmName.trim().split(/\s+/)[0] || '';           // matcher lines 62-64
  const isAcronym = /^[A-Z]{2,}$/.test(firstWord);
  if (token.length < 3 || (token.length < 4 && !isAcronym)) return false;
  return new RegExp(`\\b${escapeRe(token)}\\b`).test(normText);      // single-token: \b gate
}

// retainedSuffixForm is imported from lib/mentionMatcher.js (the production
// matcher owns it; see the import + re-export above). The scorer no longer keeps
// its own copy, so there is a single source of truth for the retained form.

// Shared single-token bare-fallback test, parameterised by the two variants:
//   requireFour=false, allowAcronym=true  -> the existing matcher gate (reject
//     len<3; len 3 allowed only when the original first word is an all-caps
//     acronym) — used by BOUNDARY-PLUS-RETAINED.
//   requireFour=true,  allowAcronym=false -> the bare token must be 4+ chars and
//     the acronym exception is ignored entirely — used by RETAINED-THEN-BARE.
function bareTokenMatch(normText, token, firstWord, requireFour, allowAcronym) {
  const isAcronym = allowAcronym && /^[A-Z]{2,}$/.test(firstWord);
  if (requireFour) {
    if (token.length < 4) return false;                            // acronym exception ignored
  } else if (token.length < 3 || (token.length < 4 && !isAcronym)) {
    return false;                                                  // matcher gate (lines 62-64)
  }
  return new RegExp(`\\b${escapeRe(token)}\\b`).test(normText);
}

// RETAINED-SUFFIX — word-boundary match on the retained-suffix form only.
// No bare-token fallback. (When a name has no strippable suffix the retained
// form equals the fully-stripped form, so this reduces to a boundary match on
// the whole normalised name, subject to the matcher's global length>=3 floor.)
export function ruleRetainedSuffix(responseText, firmName) {
  if (!responseText || !firmName) return false;
  const normText = normaliseResponseText(responseText);
  const retained = retainedSuffixForm(firmName);
  if (!retained || retained.length < 3) return false;              // matcher global floor (line 49)
  return new RegExp(`\\b${escapeRe(retained)}\\b`).test(normText);
}

// Retained-form boundary match; on failure, fall back to the fully-stripped
// form. The multi-token fallback is a boundary match on the fully-stripped
// phrase (this rule family is boundary-based, so we do not switch to the
// CURRENT `includes` path); the single-token fallback uses bareTokenMatch with
// the variant's gate. Shared by BOUNDARY-PLUS-RETAINED and RETAINED-THEN-BARE.
function ruleRetainedWithFallback(responseText, firmName, requireFour, allowAcronym) {
  if (!responseText || !firmName) return false;
  const normText = normaliseResponseText(responseText);
  const retained = retainedSuffixForm(firmName);
  if (retained && retained.length >= 3
      && new RegExp(`\\b${escapeRe(retained)}\\b`).test(normText)) return true;
  // Fallback on the production fully-stripped form.
  const normFirm = normaliseFirmName(firmName);
  if (!normFirm || normFirm.length < 3) return false;
  const tokens = normFirm.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length >= 2) {
    return new RegExp(`\\b${escapeRe(normFirm)}\\b`).test(normText); // multi-token: boundary phrase
  }
  const firstWord = firmName.trim().split(/\s+/)[0] || '';
  return bareTokenMatch(normText, tokens[0], firstWord, requireFour, allowAcronym);
}

// BOUNDARY-PLUS-RETAINED — retained-form boundary; on failure, bare fallback
// with the existing length floor + acronym exception + single-token boundary.
export function ruleBoundaryPlusRetained(responseText, firmName) {
  return ruleRetainedWithFallback(responseText, firmName, false, true);
}

// RETAINED-THEN-BARE — as BOUNDARY-PLUS-RETAINED, except the bare fallback is
// permitted only when the fully-stripped token is 4+ characters and the acronym
// exception is ignored entirely. Isolates how much of the false-positive rate is
// contributed by 3-character acronyms.
export function ruleRetainedThenBare(responseText, firmName) {
  return ruleRetainedWithFallback(responseText, firmName, true, false);
}

export const PREDICT = {
  'CURRENT': (rt, fn) => ruleCurrent(rt, fn),
  'BOUNDARY-SINGLE': (rt, fn) => ruleBoundary(rt, fn, false),
  'BOUNDARY-BOTH': (rt, fn) => ruleBoundary(rt, fn, true),
  'RETAINED-SUFFIX': (rt, fn) => ruleRetainedSuffix(rt, fn),
  'BOUNDARY-PLUS-RETAINED': (rt, fn) => ruleBoundaryPlusRetained(rt, fn),
  'RETAINED-THEN-BARE': (rt, fn) => ruleRetainedThenBare(rt, fn),
};

// For false-positive analysis: the normalised string form that produced a
// positive match for a given rule (null if the rule did not match). Re-derives
// the form with the same helpers the rules use, so it cannot drift from PREDICT.
function matchedForm(ruleName, responseText, firmName) {
  if (!PREDICT[ruleName](responseText, firmName)) return null;
  const normText = normaliseResponseText(responseText);
  if (ruleName === 'RETAINED-SUFFIX') return retainedSuffixForm(firmName);
  if (ruleName === 'BOUNDARY-PLUS-RETAINED' || ruleName === 'RETAINED-THEN-BARE') {
    const retained = retainedSuffixForm(firmName);
    if (retained && retained.length >= 3
        && new RegExp(`\\b${escapeRe(retained)}\\b`).test(normText)) return retained;
    return normaliseFirmName(firmName); // matched via the fully-stripped fallback
  }
  // CURRENT / BOUNDARY-SINGLE / BOUNDARY-BOTH match on the normalised firm name.
  return normaliseFirmName(firmName);
}

// Same raw case-insensitive locate test buildLabellingView uses for NOT_LOCATED.
function rawLocatable(responseText, normFirm) {
  if (!normFirm) return false;
  return String(responseText || '').toLowerCase().includes(String(normFirm).toLowerCase());
}

async function main() {
  const { GROUND_TRUTH, VIEW, KEY } = parseCliArgs();

  // ── Load view ──
  const viewRows = new Map(); // row_uid -> {...}
  let viewHeader = null, vIdx = null;
  await streamCsv(VIEW, (rec) => {
    if (!viewHeader) {
      viewHeader = rec;
      vIdx = headerIndex(rec, ['row_uid', 'firm_entity_name', 'normalised_firm_name', 'token_count', 'context_window_flag', 'human_verdict'], 'view');
      return;
    }
    if (rec.length === 1 && rec[0] === '') return;
    const row_uid = rec[vIdx.row_uid];
    viewRows.set(row_uid, {
      row_uid,
      firm_entity_name: rec[vIdx.firm_entity_name],
      normalised_firm_name: rec[vIdx.normalised_firm_name],
      token_count: rec[vIdx.token_count],
      context_window_flag: rec[vIdx.context_window_flag],
      human_verdict: rec[vIdx.human_verdict],
    });
  });

  // ── Load key ──
  const keyRows = new Map(); // row_uid -> {run_id, stratum}
  let keyHeader = null, kIdx = null;
  await streamCsv(KEY, (rec) => {
    if (!keyHeader) {
      keyHeader = rec;
      kIdx = headerIndex(rec, ['row_uid', 'run_id', 'stratum'], 'key');
      return;
    }
    if (rec.length === 1 && rec[0] === '') return;
    const row_uid = rec[kIdx.row_uid];
    keyRows.set(row_uid, { run_id: rec[kIdx.run_id], stratum: rec[kIdx.stratum] });
  });

  // ── Gate: row_uid sets align between view and key ──
  for (const uid of viewRows.keys()) if (!keyRows.has(uid)) die(`STOP: view row_uid ${uid} has no match in the key.`);
  for (const uid of keyRows.keys()) if (!viewRows.has(uid)) die(`STOP: key row_uid ${uid} has no match in the view.`);

  // ── Gate: labelled row count ──
  if (viewRows.size !== EXPECTED_TOTAL) die(`STOP: labelled row count is ${viewRows.size}, expected ${EXPECTED_TOTAL}.`);

  // ── Gate: verdicts present & recognised; build the working rows ──
  const rows = [];
  for (const [uid, v] of viewRows) {
    const verdict = String(v.human_verdict || '').trim().toUpperCase();
    if (!VALID_VERDICTS.has(verdict)) die(`STOP: row_uid ${uid} has empty/unrecognised human_verdict: "${v.human_verdict}".`);
    const k = keyRows.get(uid);
    rows.push({
      row_uid: uid,
      run_id: k.run_id,
      stratum: k.stratum,
      firm_entity_name: v.firm_entity_name,
      normalised_firm_name: v.normalised_firm_name,
      token_count: parseInt(v.token_count, 10),
      context_window_flag: v.context_window_flag,
      verdict,
      joinKey: `${k.run_id} ${v.firm_entity_name}`,
    });
  }

  // ── Gate: stratum split ──
  const nA = rows.filter((r) => r.stratum === 'A').length;
  const nB = rows.filter((r) => r.stratum === 'B').length;
  if (nA !== EXPECTED_A || nB !== EXPECTED_B) die(`STOP: stratum split is A=${nA} / B=${nB}, expected A=${EXPECTED_A} / B=${EXPECTED_B}.`);

  // ── Join to full response_text by (run_id, firm_entity_name) ──
  const needed = new Map(); // joinKey -> {response_text, normalised_firm_name, token_count} | detect dupes
  const wantKeys = new Set(rows.map((r) => r.joinKey));
  let gtHeader = null, gIdx = null;
  await streamCsv(GROUND_TRUTH, (rec) => {
    if (!gtHeader) {
      gtHeader = rec;
      gIdx = headerIndex(rec, ['run_id', 'firm_entity_name', 'normalised_firm_name', 'token_count', 'response_text'], 'ground-truth');
      return;
    }
    if (rec.length === 1 && rec[0] === '') return;
    const jk = `${rec[gIdx.run_id]} ${rec[gIdx.firm_entity_name]}`;
    if (!wantKeys.has(jk)) return;
    if (needed.has(jk)) die(`STOP: ground-truth has more than one row for (run_id, firm_entity_name) = ${JSON.stringify(jk.split(' '))}. The join is not 1:1.`);
    needed.set(jk, {
      response_text: rec[gIdx.response_text],
      normalised_firm_name: rec[gIdx.normalised_firm_name],
      token_count: rec[gIdx.token_count],
    });
  });

  // ── Gate: every labelled row joins to exactly one ground-truth row + cross-check ──
  let notLocatedFlagged = 0, notLocatedUnexpected = [];
  for (const r of rows) {
    const g = needed.get(r.joinKey);
    if (!g) die(`STOP: no ground-truth row for row_uid ${r.row_uid} (run_id=${r.run_id}, firm="${r.firm_entity_name}"). Cannot join labels to full response text.`);
    // structural cross-check: the joined row must match the view's fields
    if (g.normalised_firm_name !== r.normalised_firm_name || parseInt(g.token_count, 10) !== r.token_count) {
      die(`STOP: joined ground-truth row for row_uid ${r.row_uid} disagrees with the view `
        + `(normalised_firm_name "${g.normalised_firm_name}" vs "${r.normalised_firm_name}", `
        + `token_count ${g.token_count} vs ${r.token_count}). Possible mis-join / mismatched files.`);
    }
    r.response_text = g.response_text;
    // locate gate: unlocatable rows must be exactly the view's NOT_LOCATED set
    const locatable = rawLocatable(r.response_text, r.normalised_firm_name);
    if (r.context_window_flag === 'NOT_LOCATED') notLocatedFlagged++;
    if (!locatable && r.context_window_flag !== 'NOT_LOCATED') notLocatedUnexpected.push(r.row_uid);
  }
  if (notLocatedUnexpected.length > 0) {
    die(`STOP: ${notLocatedUnexpected.length} row(s) whose normalised_firm_name is not locatable in the joined `
      + `response_text but are NOT flagged NOT_LOCATED (likely mis-join): row_uid ${notLocatedUnexpected.join(', ')}.`);
  }

  // ── Predictions ──
  for (const r of rows) {
    r.preds = {};
    for (const rule of RULES) r.preds[rule] = PREDICT[rule](r.response_text, r.firm_entity_name);
  }

  // ── Metrics ──
  const isSingle = (r) => r.token_count === 1;
  const isMulti = (r) => r.token_count > 1;
  function confusion(subset, rule, ambiguousAsReal) {
    let TP = 0, FP = 0, TN = 0, FN = 0;
    for (const r of subset) {
      const pred = r.preds[rule];
      const truthPos = r.verdict === 'REAL' ? true : r.verdict === 'FALSE' ? false : ambiguousAsReal;
      if (pred && truthPos) TP++;
      else if (pred && !truthPos) FP++;
      else if (!pred && truthPos) FN++;
      else TN++;
    }
    const N = subset.length;
    return { TP, FP, TN, FN, N, missRate: N ? FN / N : 0, fpRate: N ? FP / N : 0 };
  }
  const pct = (x) => (x * 100).toFixed(1) + '%';
  function labelComposition(subset) {
    const c = { REAL: 0, FALSE: 0, AMBIGUOUS: 0 };
    for (const r of subset) c[r.verdict]++;
    return c;
  }

  const strata = [
    ['Stratum A (disputed, n=217)', rows.filter((r) => r.stratum === 'A')],
    ['Stratum B (current positives, n=50)', rows.filter((r) => r.stratum === 'B')],
    ['Combined (n=267)', rows.slice()],
  ];

  const out = [];
  out.push('='.repeat(78));
  out.push('EXP-001 candidate-rule scoring — READ-ONLY, no writes');
  out.push('='.repeat(78));
  out.push('Rules: ' + RULES.join(' | '));
  out.push('Bounds: "AMBIG=FALSE" (pre-reg lower) and "AMBIG=REAL" (pre-reg upper).');
  out.push('miss rate = FN / N(stratum); false-positive rate = FP / N(stratum).');
  out.push(`NOT_LOCATED rows (flagged in view): ${notLocatedFlagged}` + (notLocatedFlagged !== 5 ? '  (note: pre-registration expected 5)' : ''));
  out.push('');

  for (const [label, subset] of strata) {
    const comp = labelComposition(subset);
    const compS = labelComposition(subset.filter(isSingle));
    const compM = labelComposition(subset.filter(isMulti));
    out.push('-'.repeat(78));
    out.push(label);
    out.push(`  labels: REAL ${comp.REAL} | FALSE ${comp.FALSE} | AMBIGUOUS ${comp.AMBIGUOUS}`);
    out.push(`  single-token: REAL ${compS.REAL} FALSE ${compS.FALSE} AMBIG ${compS.AMBIGUOUS} (n=${subset.filter(isSingle).length})`);
    out.push(`  multi-token:  REAL ${compM.REAL} FALSE ${compM.FALSE} AMBIG ${compM.AMBIGUOUS} (n=${subset.filter(isMulti).length})`);
    for (const rule of RULES) {
      const f0 = confusion(subset, rule, false); // AMBIG=FALSE
      const f1 = confusion(subset, rule, true);  // AMBIG=REAL
      out.push(`  ${rule}:`);
      out.push(`     AMBIG=FALSE  TP=${f0.TP} FP=${f0.FP} TN=${f0.TN} FN=${f0.FN}  miss=${pct(f0.missRate)}  fp=${pct(f0.fpRate)}`);
      out.push(`     AMBIG=REAL   TP=${f1.TP} FP=${f1.FP} TN=${f1.TN} FN=${f1.FN}  miss=${pct(f1.missRate)}  fp=${pct(f1.fpRate)}`);
      // single/multi split of miss & fp (AMBIG=FALSE and AMBIG=REAL)
      for (const [tlabel, tfilter] of [['single', isSingle], ['multi', isMulti]]) {
        const sub = subset.filter(tfilter);
        if (!sub.length) continue;
        const s0 = confusion(sub, rule, false), s1 = confusion(sub, rule, true);
        out.push(`       ${tlabel} (n=${sub.length}): miss ${pct(s0.missRate)}/${pct(s1.missRate)}  fp ${pct(s0.fpRate)}/${pct(s1.fpRate)}  [AMBIG=FALSE/REAL]`);
      }
    }
    out.push('');
  }

  // ── Comparison table (combined) ──
  const A = rows.filter((r) => r.stratum === 'A'), B = rows.filter((r) => r.stratum === 'B');
  const RW = 24; // rule-name column width (BOUNDARY-PLUS-RETAINED = 22 chars)
  out.push('='.repeat(78));
  out.push('COMPARISON — A.miss, B.fp, comb.miss, comb.fp  (each as AMBIG=FALSE / AMBIG=REAL)');
  out.push('='.repeat(78));
  out.push('rule'.padEnd(RW) + 'A.miss'.padEnd(16) + 'B.fp'.padEnd(16) + 'comb.miss'.padEnd(16) + 'comb.fp');
  for (const rule of RULES) {
    const a0 = confusion(A, rule, false), a1 = confusion(A, rule, true);
    const b0 = confusion(B, rule, false), b1 = confusion(B, rule, true);
    const c0 = confusion(rows, rule, false), c1 = confusion(rows, rule, true);
    const cell = (x, y) => `${pct(x)}/${pct(y)}`.padEnd(16);
    out.push(rule.padEnd(RW) + cell(a0.missRate, a1.missRate) + cell(b0.fpRate, b1.fpRate)
      + cell(c0.missRate, c1.missRate) + `${pct(c0.fpRate)}/${pct(c1.fpRate)}`);
  }
  out.push('');

  // ── TOTAL ERRORS — PRIMARY DECISION METRIC ──
  // total errors = false negatives + false positives, absolute count over all
  // 267 rows, at both bounds. A lower miss rate does NOT make a rule better if
  // its total errors are higher (e.g. 3% miss / 20% fp is worse than 8% / 6%).
  const te = (rule, bound) => { const c = confusion(rows, rule, bound); return c.FN + c.FP; };
  out.push('#'.repeat(78));
  out.push('##  TOTAL ERRORS (FN + FP) over all 267 rows  —  PRIMARY DECISION METRIC     ##');
  out.push('##  A lower miss rate does NOT win if the total-error count is higher.       ##');
  out.push('#'.repeat(78));
  out.push('rule'.padEnd(RW) + 'TE@FALSE'.padEnd(10) + 'TE@REAL'.padEnd(10) + 'detail  (FN+FP @FALSE | @REAL)');
  for (const rule of RULES) {
    const c0 = confusion(rows, rule, false), c1 = confusion(rows, rule, true);
    out.push(rule.padEnd(RW)
      + String(c0.FN + c0.FP).padEnd(10)
      + String(c1.FN + c1.FP).padEnd(10)
      + `${c0.FN}+${c0.FP} | ${c1.FN}+${c1.FP}`);
  }
  for (const bound of [false, true]) {
    const ranked = RULES.slice().sort((x, y) => te(x, bound) - te(y, bound))
      .map((r) => `${r}=${te(r, bound)}`);
    out.push(`  fewest total errors @AMBIG=${bound ? 'REAL ' : 'FALSE'}:  ${ranked.join('  <=  ')}`);
  }
  out.push('#'.repeat(78));
  out.push('');

  // ── Per-rule disagreements with a definite verdict (FP or FN; AMBIGUOUS excluded) ──
  out.push('='.repeat(78));
  out.push('RESIDUAL DISAGREEMENTS (rule vs definite verdict; AMBIGUOUS excluded)');
  out.push('='.repeat(78));
  for (const rule of RULES) {
    const fnRows = rows.filter((r) => r.verdict === 'REAL' && r.preds[rule] === false);
    const fpRows = rows.filter((r) => r.verdict === 'FALSE' && r.preds[rule] === true);
    const pad = ' '.repeat(rule.length);
    out.push(`  ${rule}: ${fnRows.length} false-negative row_uids (verdict REAL, rule NO): ${fnRows.map((r) => r.row_uid).join(', ') || '(none)'}`);
    out.push(`  ${pad}  ${fpRows.length} false-positive row_uids (verdict FALSE, rule YES): ${fpRows.map((r) => r.row_uid).join(', ') || '(none)'}`);
    // Break the false positives down by the normalised form that produced the
    // match, so recurring offenders are visible rather than buried in row IDs.
    if (fpRows.length) {
      const byForm = new Map();
      for (const r of fpRows) {
        const form = matchedForm(rule, r.response_text, r.firm_entity_name) || '(unknown)';
        if (!byForm.has(form)) byForm.set(form, []);
        byForm.get(form).push(r.row_uid);
      }
      const sorted = [...byForm.entries()].sort((a, b) => b[1].length - a[1].length);
      out.push(`  ${pad}  FP by matched form (form ×count):`);
      for (const [form, uids] of sorted) {
        out.push(`  ${pad}    "${form}" ×${uids.length}: ${uids.join(', ')}`);
      }
    }
  }
  out.push('');

  // ── Per-row table (all 267): row_uid, stratum, token_count, verdict, 6 rules ──
  const shortLabels = {
    'CURRENT': 'CUR', 'BOUNDARY-SINGLE': 'SGL', 'BOUNDARY-BOTH': 'BOT',
    'RETAINED-SUFFIX': 'RET', 'BOUNDARY-PLUS-RETAINED': 'P+R', 'RETAINED-THEN-BARE': 'THB',
  };
  const y = (b) => (b ? 'Y' : '.');
  out.push('='.repeat(78));
  out.push('PER-ROW PREDICTIONS (Y = mentioned, . = not). Sorted by row_uid.');
  out.push('='.repeat(78));
  // prefix width: row_uid(9) + stratum(4) + tok(4) + verdict(12) = 29 chars
  out.push('row_uid'.padEnd(9) + 'str'.padEnd(4) + 'tok'.padEnd(4) + 'verdict'.padEnd(12)
    + RULES.map((r) => shortLabels[r].padEnd(4)).join(''));
  const sortedRows = rows.slice().sort((a, b) => a.row_uid - b.row_uid);
  for (const r of sortedRows) {
    out.push(
      String(r.row_uid).padEnd(9) +
      r.stratum.padEnd(4) +
      String(r.token_count).padEnd(4) +
      r.verdict.padEnd(12) +
      RULES.map((rule) => y(r.preds[rule]).padEnd(4)).join(''),
    );
  }
  out.push('');
  const singleBothDiffs = rows.filter((r) => r.preds['BOUNDARY-SINGLE'] !== r.preds['BOUNDARY-BOTH']);
  out.push(`Rows where BOUNDARY-SINGLE != BOUNDARY-BOTH (multi-token evidence): ${singleBothDiffs.length}` +
    (singleBothDiffs.length === 0 ? '  (the multi-token change alters no call on this sample)' : ''));
  out.push('row_uids: ' + (singleBothDiffs.map((r) => r.row_uid).join(', ') || '(none)'));
  out.push('');

  // ── Pairwise agreement matrix (6×6) ──
  // Rows out of 267 on which each pair returns the same boolean (predictions are
  // bound-independent). Diagonal = 267. A low off-diagonal value means the pair
  // genuinely disagrees rather than being a relabelling of the same rule.
  out.push('='.repeat(78));
  out.push('PAIRWISE AGREEMENT MATRIX (rows /267 where the two rules agree; diagonal = 267)');
  out.push('='.repeat(78));
  const agree = (rx, ry) => rows.reduce((n, r) => n + (r.preds[rx] === r.preds[ry] ? 1 : 0), 0);
  const shorts = RULES.map((r) => shortLabels[r]);
  out.push(''.padEnd(6) + shorts.map((s) => s.padStart(6)).join(''));
  RULES.forEach((rx, i) => {
    out.push(shorts[i].padEnd(6) + RULES.map((ry) => String(agree(rx, ry)).padStart(6)).join(''));
  });
  out.push('legend: ' + RULES.map((r) => `${shortLabels[r]}=${r}`).join('  '));
  out.push('');

  // ── Changes relative to CURRENT ──
  // For each non-CURRENT rule, rows where its prediction differs from CURRENT,
  // split into newly-correct (rule right where CURRENT wrong) and newly-wrong
  // (rule wrong where CURRENT right) against the human verdict. Where a row is
  // AMBIGUOUS the split depends on the bound, so both bounds are reported —
  // never a midpoint.
  out.push('='.repeat(78));
  out.push('CHANGES RELATIVE TO CURRENT (rows differing from CURRENT; correctness vs human verdict)');
  out.push('='.repeat(78));
  const correctAgainst = (pred, verdict, ambiguousAsReal) => {
    const truthPos = verdict === 'REAL' ? true : verdict === 'FALSE' ? false : ambiguousAsReal;
    return pred === truthPos;
  };
  for (const rule of RULES) {
    if (rule === 'CURRENT') continue;
    const diffRows = rows.filter((r) => r.preds[rule] !== r.preds['CURRENT']);
    out.push(`  ${rule}: ${diffRows.length} rows differ from CURRENT`);
    for (const bound of [false, true]) {
      const newlyCorrect = diffRows.filter((r) =>
        correctAgainst(r.preds[rule], r.verdict, bound) && !correctAgainst(r.preds['CURRENT'], r.verdict, bound));
      const newlyWrong = diffRows.filter((r) =>
        !correctAgainst(r.preds[rule], r.verdict, bound) && correctAgainst(r.preds['CURRENT'], r.verdict, bound));
      const net = newlyCorrect.length - newlyWrong.length;
      out.push(`     AMBIG=${bound ? 'REAL ' : 'FALSE'}: +${newlyCorrect.length} newly-correct, -${newlyWrong.length} newly-wrong (net ${net >= 0 ? '+' : ''}${net})`);
      out.push(`       newly-correct row_uids: ${newlyCorrect.map((r) => r.row_uid).join(', ') || '(none)'}`);
      out.push(`       newly-wrong   row_uids: ${newlyWrong.map((r) => r.row_uid).join(', ') || '(none)'}`);
    }
  }
  out.push('');

  console.log(out.join('\n'));
}

// Run only when executed as a script (node scripts/experiments/scoreCandidateRules.js …),
// never on import. Importing the module (e.g. from a unit test) exposes the rule
// functions without parsing CLI args or touching the filesystem.
const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  main().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });
}
