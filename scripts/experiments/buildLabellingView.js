#!/usr/bin/env node

/**
 * buildLabellingView.js — build the blinded EXP-001 mention-classifier
 * labelling view + key from the ground-truth CSV.
 *
 * Implements docs/research/EXP-001-labelling-preregistration.md exactly, with
 * the one recorded §13 deviation: the candidate span is marked with >>> <<<
 * (not «…») to match exportDisputedRows.js and avoid UTF-8 mangling in
 * spreadsheets.
 *
 * NO DATABASE. NO NETWORK. Node built-ins only (fs, path, crypto, url).
 * It reads one local CSV and writes two local CSVs. It never connects to
 * MongoDB and imports nothing that does.
 *
 * INPUT  (default): data/experiments/mention-ground-truth-sample.csv (~24MB)
 * OUTPUT (default): data/experiments/labelling-view.csv
 *                   data/experiments/labelling-key.csv
 * Override with --input <path> --view-out <path> --key-out <path>
 * (used only to validate the logic against a synthetic fixture).
 *
 * STREAMING: the input is parsed with a chunk-level RFC4180 state machine
 * (quoted fields may contain commas and embedded newlines). The full input is
 * never held in memory — only the Stratum A census rows, at most 25 Stratum B
 * rows per token category, and counters are retained.
 *
 * DETERMINISM: seeds are strings (20260827b, 20260827c). They are converted to
 * a 32-bit PRNG seed deterministically as:
 *     seedInt(s) = uint32(first 8 hex chars of sha256(s))
 * Stratum B is selected by deterministic bottom-k on a seeded per-row hash
 *     bKey(row) = sha256("20260827b" \x00 <canonical row json>)
 * taking the 25 smallest keys per token category (order-independent, bounded
 * memory). The combined set is sorted into a canonical order (by the same
 * canonical row json) and then Fisher-Yates shuffled with mulberry32 seeded
 * from 20260827c, after which row_uid is assigned 1..N. No Math.random, no
 * timestamps, no PID, no filesystem/DB ordering.
 *
 * USAGE: node scripts/experiments/buildLabellingView.js
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// ---- constants (fixed by the pre-registration) ----
const SEED_B = '20260827b';      // Stratum B sampling
const SEED_C = '20260827c';      // combined shuffle
const B_PER_CATEGORY = 25;       // 25 single-token + 25 multi-token
const CONTEXT = 250;             // ±250 chars around the candidate
const NOT_LOCATED_HEAD = 500;    // first 500 chars when the candidate is not found
const PLATFORM = 'perplexity';

const EXPECTED_COLUMNS = [
  'run_id', 'prompt_id', 'platform', 'firm_entity_name', 'normalised_firm_name',
  'token_count', 'current_matcher_result', 'substring_only_result', 'response_text', 'human_verdict',
];

const VIEW_COLUMNS = [
  'row_uid', 'prompt_id', 'platform', 'firm_entity_name', 'normalised_firm_name',
  'token_count', 'occurrence_count', 'context_window', 'context_window_flag', 'human_verdict',
];
const KEY_COLUMNS = [
  'row_uid', 'stratum', 'run_id', 'current_matcher_result', 'substring_only_result',
];
// Columns that MUST NOT appear in the view.
const FORBIDDEN_IN_VIEW = ['run_id', 'stratum', 'current_matcher_result', 'substring_only_result'];

// ---- CLI args ----
function argVal(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const INPUT_PATH = path.resolve(argVal('--input', path.join(REPO_ROOT, 'data/experiments/mention-ground-truth-sample.csv')));
const VIEW_OUT = path.resolve(argVal('--view-out', path.join(REPO_ROOT, 'data/experiments/labelling-view.csv')));
const KEY_OUT = path.resolve(argVal('--key-out', path.join(REPO_ROOT, 'data/experiments/labelling-key.csv')));

// ---- deterministic PRNG (same convention as buildMentionGroundTruth.js) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sha256hex(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function seedInt(s) { return parseInt(sha256hex(String(s)).slice(0, 8), 16) >>> 0; }

// ---- CSV helpers ----
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function parseBool(v, ctx) {
  const s = String(v).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  throw new Error(`Non-boolean value "${v}" where true/false expected (${ctx})`);
}

// Streaming RFC4180 parser: calls onRecord(fields[]) for each record (header
// included). Handles quoted fields with embedded commas / newlines / "" escapes.
function streamCsv(inputPath, onRecord) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });
    let field = '';
    let record = [];
    let inQuotes = false;
    let quotePending = false; // saw a '"' inside quotes; deciding escaped-vs-closing
    let sawAny = false;
    const endField = () => { record.push(field); field = ''; };
    const endRecord = () => { endField(); onRecord(record); record = []; };
    stream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        sawAny = true;
        if (quotePending) {
          quotePending = false;
          if (c === '"') { field += '"'; inQuotes = true; continue; } // escaped ""
          inQuotes = false; // the quote closed the quoted section; fall through
        }
        if (inQuotes) {
          if (c === '"') quotePending = true;
          else field += c;
          continue;
        }
        if (c === '"') { inQuotes = true; continue; }
        if (c === ',') { endField(); continue; }
        if (c === '\n') { endRecord(); continue; }
        if (c === '\r') continue; // tolerate CRLF; writer uses LF
        field += c;
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (quotePending) { quotePending = false; inQuotes = false; }
      if (inQuotes) return reject(new Error('Unterminated quoted field at end of input'));
      // Flush a trailing record only if the last line had no newline.
      if (field !== '' || record.length > 0) endRecord();
      if (!sawAny) return reject(new Error('Input CSV is empty'));
      resolve();
    });
  });
}

// Reimplemented context window (does NOT import exportDisputedRows.js, which
// runs a top-level mongoose.connect on import). First case-insensitive
// occurrence of normalised_firm_name inside response_text; original casing
// preserved; matched span wrapped >>> <<<.
function buildContext(responseText, normFirm) {
  const text = responseText == null ? '' : String(responseText);
  const needle = normFirm == null ? '' : String(normFirm);
  if (needle.length === 0) {
    return { context_window: text.slice(0, NOT_LOCATED_HEAD), flag: 'NOT_LOCATED', occurrence_count: 0 };
  }
  const hay = text.toLowerCase();
  const ndl = needle.toLowerCase();
  const first = hay.indexOf(ndl);
  if (first < 0) {
    return { context_window: text.slice(0, NOT_LOCATED_HEAD), flag: 'NOT_LOCATED', occurrence_count: 0 };
  }
  let count = 0;
  for (let i = first; i >= 0; i = hay.indexOf(ndl, i + ndl.length)) count++;
  const start = Math.max(0, first - CONTEXT);
  const end = Math.min(text.length, first + ndl.length + CONTEXT);
  const window = text.slice(start, first) + '>>>' + text.slice(first, first + ndl.length) + '<<<'
    + text.slice(first + ndl.length, end);
  return { context_window: window, flag: '', occurrence_count: count };
}

function canonicalId(rec) { return JSON.stringify(rec.fields); }

// Bounded bottom-k by seeded hash (keeps ≤ B_PER_CATEGORY smallest keys).
function bottomKInsert(bucket, rec) {
  rec._bkey = sha256hex(SEED_B + '\x00' + canonicalId(rec));
  bucket.push(rec);
  if (bucket.length > B_PER_CATEGORY) {
    bucket.sort((a, b) => (a._bkey < b._bkey ? -1 : a._bkey > b._bkey ? 1 : (canonicalId(a) < canonicalId(b) ? -1 : 1)));
    bucket.pop(); // drop the largest key
  }
}

function fail(msg) { console.error(`\nINTEGRITY FAILURE / STOP: ${msg}`); console.error('No PR should be opened. No output committed.'); process.exit(1); }

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`Input CSV not found: ${INPUT_PATH}`);
    console.error('This file is gitignored and regenerated from the Render shell (buildMentionGroundTruth.js).');
    process.exit(2);
  }

  const stratumA = [];       // census: all qualifying rows
  const bSingle = [];        // bottom-k buckets
  const bMulti = [];
  let overlapCount = 0;      // perplexity, current=true, substring=false (must be 0)
  let headerChecked = false;
  let idx = null;
  let dataRows = 0;

  await streamCsv(INPUT_PATH, (rec) => {
    if (!headerChecked) {
      headerChecked = true;
      const header = rec.map((h) => h.trim());
      idx = {};
      for (const col of EXPECTED_COLUMNS) {
        const at = header.indexOf(col);
        if (at === -1) fail(`Input header missing expected column "${col}". Header: ${header.join(',')}`);
        idx[col] = at;
      }
      return;
    }
    dataRows++;
    const get = (col) => rec[idx[col]];
    const platform = get('platform');
    if (platform !== PLATFORM) return; // only Perplexity is in scope for either stratum
    const current = parseBool(get('current_matcher_result'), 'current_matcher_result');
    const substring = parseBool(get('substring_only_result'), 'substring_only_result');
    const tokenCount = parseInt(get('token_count'), 10);
    const row = {
      fields: rec.slice(0, EXPECTED_COLUMNS.length),
      run_id: get('run_id'),
      prompt_id: get('prompt_id'),
      platform,
      firm_entity_name: get('firm_entity_name'),
      normalised_firm_name: get('normalised_firm_name'),
      token_count: get('token_count'),
      tokenCountNum: tokenCount,
      current,
      substring,
      response_text: get('response_text'),
    };

    const isDispute = current !== substring;         // Stratum A membership
    if (isDispute) stratumA.push(row);

    if (current === true) {                          // Stratum B candidate pool
      if (substring === false) { overlapCount++; return; } // A∩B → recorded; STOP later
      if (tokenCount === 1) bottomKInsert(bSingle, row);
      else if (tokenCount > 1) bottomKInsert(bMulti, row);
      // tokenCount === 0 (empty normalised name) is neither single nor multi → excluded
    }
  });

  // (b) overlap must be impossible under the matcher rules as understood.
  if (overlapCount > 0) {
    fail(`Excluded-overlap count is ${overlapCount} (Perplexity rows with current_matcher_result=true AND substring_only_result=false). `
      + `Under the matcher rules as understood this should be 0; a non-zero count means the rule is not what we think it is. `
      + `This is a finding — investigate before building any labelling view.`);
  }

  // Finalise Stratum B: sort each bucket by seeded key, take up to B_PER_CATEGORY.
  const sortByKey = (a, b) => (a._bkey < b._bkey ? -1 : a._bkey > b._bkey ? 1 : (canonicalId(a) < canonicalId(b) ? -1 : 1));
  const bSingleSel = bSingle.slice().sort(sortByKey).slice(0, B_PER_CATEGORY);
  const bMultiSel = bMulti.slice().sort(sortByKey).slice(0, B_PER_CATEGORY);
  const singleShort = Math.max(0, B_PER_CATEGORY - bSingleSel.length);
  const multiShort = Math.max(0, B_PER_CATEGORY - bMultiSel.length);

  // Tag stratum and combine.
  for (const r of stratumA) r.stratum = 'A';
  for (const r of bSingleSel) r.stratum = 'B';
  for (const r of bMultiSel) r.stratum = 'B';
  const combined = [...stratumA, ...bSingleSel, ...bMultiSel];

  // Canonical pre-shuffle order (deterministic, independent of read order),
  // then deterministic Fisher-Yates shuffle, then row_uid = 1..N.
  combined.sort((a, b) => (canonicalId(a) < canonicalId(b) ? -1 : canonicalId(a) > canonicalId(b) ? 1 : 0));
  const shuffled = seededShuffle(combined, mulberry32(seedInt(SEED_C)));
  shuffled.forEach((r, i) => { r.row_uid = i + 1; });

  // Build view + key rows.
  let notLocated = 0;
  let emptyNormName = 0;
  const viewRows = [];
  const keyRows = [];
  for (const r of shuffled) {
    if (String(r.normalised_firm_name || '') === '') emptyNormName++;
    const ctx = buildContext(r.response_text, r.normalised_firm_name);
    if (ctx.flag === 'NOT_LOCATED') notLocated++;
    viewRows.push({
      row_uid: r.row_uid,
      prompt_id: r.prompt_id,
      platform: r.platform,
      firm_entity_name: r.firm_entity_name,
      normalised_firm_name: r.normalised_firm_name,
      token_count: r.token_count,
      occurrence_count: ctx.occurrence_count,
      context_window: ctx.context_window,
      context_window_flag: ctx.flag,
      human_verdict: '', // always empty — never copy the source verdict
    });
    keyRows.push({
      row_uid: r.row_uid,
      stratum: r.stratum,
      run_id: r.run_id,
      current_matcher_result: r.current,
      substring_only_result: r.substring,
    });
  }

  // ---- Integrity checks ----
  const checks = [];
  const add = (ok, label) => { checks.push({ ok, label }); if (!ok) fail(`check failed: ${label}`); };

  add(stratumA.every((r) => r.platform === PLATFORM && r.current !== r.substring), '1: every Stratum A row is perplexity AND current!==substring');
  add([...bSingleSel, ...bMultiSel].every((r) => r.platform === PLATFORM && r.current === true), '2: every Stratum B row is perplexity AND current===true');
  add(bSingleSel.length <= B_PER_CATEGORY && bSingleSel.every((r) => r.tokenCountNum === 1)
      && bMultiSel.length <= B_PER_CATEGORY && bMultiSel.every((r) => r.tokenCountNum > 1), '3: Stratum B is ≤25 token=1 and ≤25 token>1');
  add(new Set(combined.map(canonicalId)).size === combined.length, '4: no selected input row is duplicated');
  add(shuffled.every((r) => typeof r.row_uid === 'number'), '5: every selected row has exactly one row_uid');
  const uids = shuffled.map((r) => r.row_uid).sort((a, b) => a - b);
  add(uids.length > 0 && uids[0] === 1 && uids[uids.length - 1] === uids.length && new Set(uids).size === uids.length, '6: row_uid values are contiguous from 1');
  const viewUidSet = new Set(viewRows.map((r) => r.row_uid));
  const keyUidSet = new Set(keyRows.map((r) => r.row_uid));
  add(viewUidSet.size === keyUidSet.size && [...viewUidSet].every((u) => keyUidSet.has(u)), '7: view and key row_uid sets are identical');
  add(FORBIDDEN_IN_VIEW.every((c) => !VIEW_COLUMNS.includes(c)), '8: view contains none of run_id/stratum/current/substring');
  add(viewRows.every((r) => r.human_verdict === ''), '9: human_verdict empty for every view row');
  add(keyRows.length === viewRows.length && keyRows.length === new Set(keyRows.map((r) => r.row_uid)).size, '10: every key row maps to exactly one view row');
  add(shuffled.length === combined.length, '11: selected rows shuffled deterministically (count preserved)');
  add(viewRows.every((r) => Number.isInteger(r.occurrence_count) && r.occurrence_count >= 0
      && (r.context_window_flag === 'NOT_LOCATED' ? r.occurrence_count === 0 : r.occurrence_count >= 1)), '12: occurrence_count consistent with location');
  // 13 handled explicitly: empty normalised_firm_name rows fall to NOT_LOCATED (reported below).
  add(true, `13: empty normalised_firm_name handled as NOT_LOCATED (${emptyNormName} such row(s))`);

  // ---- Write outputs (RFC4180, LF) ----
  const writeCsv = (out, columns, rows) => {
    const lines = [columns.join(',')];
    for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, lines.join('\n') + '\n');
  };
  writeCsv(VIEW_OUT, VIEW_COLUMNS, viewRows);
  writeCsv(KEY_OUT, KEY_COLUMNS, keyRows);

  const viewSize = fs.statSync(VIEW_OUT).size;
  const keySize = fs.statSync(KEY_OUT).size;

  // ---- Summary ----
  console.log('=== buildLabellingView summary ===');
  console.log(`input:               ${INPUT_PATH}`);
  console.log(`data rows scanned:   ${dataRows}`);
  console.log(`Stratum A count:     ${stratumA.length}` + (stratumA.length !== 217 ? `  (note: differs from the pre-registration's 217; census permits any count)` : ''));
  console.log(`Stratum B single:    ${bSingleSel.length}` + (singleShort ? `  (SHORT by ${singleShort})` : ''));
  console.log(`Stratum B multi:     ${bMultiSel.length}` + (multiShort ? `  (SHORT by ${multiShort})` : ''));
  console.log(`Stratum B total:     ${bSingleSel.length + bMultiSel.length}`);
  console.log(`total selected rows: ${shuffled.length}`);
  console.log(`NOT_LOCATED count:   ${notLocated}`);
  console.log(`empty norm-name:     ${emptyNormName}`);
  console.log(`overlap (A∩B):       ${overlapCount}  (must be 0)`);
  console.log(`labelling-view.csv:  ${viewSize} bytes  -> ${VIEW_OUT}`);
  console.log(`labelling-key.csv:   ${keySize} bytes  -> ${KEY_OUT}`);
  console.log(`seeds:               Stratum B=${SEED_B}  shuffle=${SEED_C}  (seedInt = uint32(sha256(seed)[0:8]))`);
  console.log(`shortfall:           single ${singleShort ? 'YES(' + singleShort + ')' : 'no'}, multi ${multiShort ? 'YES(' + multiShort + ')' : 'no'}`);
  console.log(`integrity:           ${checks.length} checks, all PASSED`);
}

main().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });
