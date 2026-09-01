#!/usr/bin/env node

/**
 * restoreVerdicts.js — restore the 267 adjudicated human_verdict values into
 * data/experiments/labelling-view.csv from the committed scoring artefact.
 *
 * WHY THIS EXISTS: buildLabellingView.js writes human_verdict empty for every
 * row by design, and enforces it (integrity check 9: "human_verdict empty for
 * every view row"). The view and key are gitignored and regenerate
 * deterministically. So every rebuild of the view wipes the verdicts, and they
 * have to be restored afterwards. This script does that, repeatably.
 *
 * NO VERDICTS ARE HARDCODED HERE. The sole source is the per-row table in
 *   docs/research/EXP-001-rule-scoring-2026-08-28.md
 * (committed in PR #182), which carries the raw scoreCandidateRules.js stdout
 * from commit f6d64b6 verbatim. If a verdict is ever amended in the artefact,
 * this script follows it without being edited.
 *
 * NO DATABASE. NO NETWORK. Node built-ins only (fs, path, url).
 * It writes exactly one file: the labelling view. Nothing else is modified.
 *
 * Inputs (this repo's args.indexOf('--flag') convention):
 *   --artefact <path>     default docs/research/EXP-001-rule-scoring-2026-08-28.md
 *   --view <path>         default data/experiments/labelling-view.csv
 *   --cross-check <path>  optional: a second filled labelling view (e.g. the
 *                         recovered 28/08/2026 copy). Every row is compared
 *                         against the artefact; any disagreement stops the run
 *                         before anything is written.
 *   --dry-run             parse, check and report; write nothing.
 *
 * USAGE:
 *   node scripts/experiments/restoreVerdicts.js
 *   node scripts/experiments/restoreVerdicts.js --cross-check /path/to/recovered-view.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const EXPECTED_ROWS = 267;
const VALID_VERDICTS = new Set(['REAL', 'FALSE', 'AMBIGUOUS']);

// The per-row table as scoreCandidateRules.js emitted it at f6d64b6. Column
// offsets come from that revision's printer:
//   row_uid.padEnd(8) + ' ' + stratum.padEnd(4) + token_count.padEnd(4)
//   + verdict.padEnd(11) + ' ' + predictions...
const TABLE_HEADER = 'row_uid  str  tok  verdict     CUR  SGL  BOTH  diff';
const COL = { uid: [0, 8], stratum: [9, 13], tok: [13, 17], verdict: [17, 28] };

function argVal(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const hasFlag = (flag) => process.argv.includes(flag);

function die(msg) {
  console.error(`STOP: ${msg}`);
  console.error('Nothing was written.');
  process.exit(1);
}

const ARTEFACT = path.resolve(argVal('--artefact', path.join(REPO_ROOT, 'docs/research/EXP-001-rule-scoring-2026-08-28.md')));
const VIEW = path.resolve(argVal('--view', path.join(REPO_ROOT, 'data/experiments/labelling-view.csv')));
const CROSS_CHECK = argVal('--cross-check', null);
const DRY_RUN = hasFlag('--dry-run');

// ─── RFC4180 ────────────────────────────────────────────────────────────────
// The view's context_window fields contain commas, quotes and embedded
// newlines, so neither parsing nor writing can be done line-wise.
function parseCsv(text) {
  const recs = [];
  let rec = [], field = '', inQuotes = false, quotePending = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
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
    if (c === ',') { rec.push(field); field = ''; continue; }
    if (c === '\n') { rec.push(field); recs.push(rec); rec = []; field = ''; continue; }
    if (c === '\r') continue; // tolerate CRLF; the writer uses LF
    field += c;
  }
  if (quotePending) { quotePending = false; inQuotes = false; }
  if (inQuotes) die(`unterminated quoted field in ${VIEW}`);
  if (field !== '' || rec.length > 0) { rec.push(field); recs.push(rec); }
  return recs;
}

// Minimal quoting — the same convention buildLabellingView.js writes with.
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const serialise = (recs) => recs.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

// ─── 1. Parse the artefact ──────────────────────────────────────────────────
if (!fs.existsSync(ARTEFACT)) die(`scoring artefact not found: ${ARTEFACT}`);
const artefactText = fs.readFileSync(ARTEFACT, 'utf8');
const artefactLines = artefactText.split('\n');

// Anchor strictly on the table header. The artefact also prints row_uid lists
// in its RESIDUAL DISAGREEMENTS section (false-negative / false-positive uids,
// "row_uids: ..."), which a looser scan would wrongly ingest.
const headerAt = artefactLines.indexOf(TABLE_HEADER);
if (headerAt === -1) {
  die(`per-row table header not found in ${ARTEFACT}.\n`
    + `      Expected a line exactly equal to:\n      ${TABLE_HEADER}\n`
    + `      The artefact is unparseable by this script — it may hold a different\n`
    + `      table layout (the six-rule scorer emits a wider one).`);
}

const verdicts = new Map(); // row_uid -> verdict
const seenInArtefact = new Set();
for (let i = headerAt + 1; i < artefactLines.length; i++) {
  const line = artefactLines[i];
  if (line.trim() === '') break; // the table ends at the first blank line
  const slice = ([a, b]) => line.slice(a, b).trim();
  const rawUid = slice(COL.uid);
  if (!/^\d+$/.test(rawUid)) die(`unparseable row_uid "${rawUid}" in the artefact table at line ${i + 1}`);
  const uid = parseInt(rawUid, 10);
  const verdict = slice(COL.verdict);
  if (!VALID_VERDICTS.has(verdict)) {
    die(`unrecognised verdict "${verdict}" for row_uid ${uid} in the artefact (line ${i + 1}). `
      + `Expected one of REAL, FALSE, AMBIGUOUS.`);
  }
  if (seenInArtefact.has(uid)) die(`row_uid ${uid} appears more than once in the artefact table`);
  seenInArtefact.add(uid);
  verdicts.set(uid, verdict);
}

if (verdicts.size !== EXPECTED_ROWS) {
  die(`parsed ${verdicts.size} verdicts from the artefact, expected ${EXPECTED_ROWS}`);
}
const artefactUids = [...verdicts.keys()].sort((a, b) => a - b);
if (artefactUids[0] !== 1 || artefactUids[artefactUids.length - 1] !== EXPECTED_ROWS
    || artefactUids.some((u, i) => u !== i + 1)) {
  die(`artefact row_uids are not contiguous 1..${EXPECTED_ROWS} (min ${artefactUids[0]}, `
    + `max ${artefactUids[artefactUids.length - 1]}, count ${artefactUids.length})`);
}

// ─── 2. Independent check: table tally vs the report's own stated totals ────
// The scorer printed its combined label counts from its own tally, separately
// from the per-row table. Comparing the two is a genuine two-source check
// within the artefact — not a value compared against itself.
const tally = { REAL: 0, FALSE: 0, AMBIGUOUS: 0 };
for (const v of verdicts.values()) tally[v]++;

const statedMatch = artefactText.match(/Combined \(n=267\)\s*\n\s*labels:\s*REAL (\d+) \| FALSE (\d+) \| AMBIGUOUS (\d+)/);
if (statedMatch) {
  const stated = { REAL: +statedMatch[1], FALSE: +statedMatch[2], AMBIGUOUS: +statedMatch[3] };
  const disagree = Object.keys(tally).filter((k) => tally[k] !== stated[k]);
  if (disagree.length > 0) {
    die(`the artefact's per-row table disagrees with the combined totals the same report states.\n`
      + `      table:  REAL ${tally.REAL} | FALSE ${tally.FALSE} | AMBIGUOUS ${tally.AMBIGUOUS}\n`
      + `      stated: REAL ${stated.REAL} | FALSE ${stated.FALSE} | AMBIGUOUS ${stated.AMBIGUOUS}\n`
      + `      Differing: ${disagree.join(', ')}. The artefact is internally inconsistent.`);
  }
  console.log('check: per-row table agrees with the report\'s own stated combined totals.');
} else {
  console.log('note:  the report\'s combined totals line was not found; that cross-check was skipped.');
}

// ─── 3. Optional cross-check against a second filled view ───────────────────
if (CROSS_CHECK) {
  const ccPath = path.resolve(CROSS_CHECK);
  if (!fs.existsSync(ccPath)) die(`--cross-check file not found: ${ccPath}`);
  const ccRecs = parseCsv(fs.readFileSync(ccPath, 'utf8'));
  const ccHeader = ccRecs[0] || [];
  const ccUid = ccHeader.indexOf('row_uid');
  const ccVer = ccHeader.indexOf('human_verdict');
  if (ccUid === -1 || ccVer === -1) die(`--cross-check file lacks a row_uid or human_verdict column: ${ccPath}`);
  const ccBody = ccRecs.slice(1).filter((r) => !(r.length === 1 && r[0] === ''));

  const mismatches = [];
  const ccSeen = new Set();
  for (const r of ccBody) {
    const uid = parseInt(r[ccUid], 10);
    if (ccSeen.has(uid)) die(`row_uid ${uid} appears twice in the --cross-check file`);
    ccSeen.add(uid);
    const theirs = String(r[ccVer] || '').trim();
    const ours = verdicts.get(uid);
    if (ours === undefined) mismatches.push(`row_uid ${uid}: present in cross-check, absent from artefact`);
    else if (theirs !== ours) mismatches.push(`row_uid ${uid}: artefact=${ours} cross-check=${theirs}`);
  }
  for (const uid of verdicts.keys()) {
    if (!ccSeen.has(uid)) mismatches.push(`row_uid ${uid}: present in artefact, absent from cross-check`);
  }
  if (mismatches.length > 0) {
    console.error(`STOP: the artefact and the cross-check file disagree on ${mismatches.length} row(s):`);
    for (const m of mismatches.slice(0, 25)) console.error(`      ${m}`);
    if (mismatches.length > 25) console.error(`      ... and ${mismatches.length - 25} more`);
    console.error('Nothing was written. This is a finding about the adjudication record, not a bug to work around.');
    process.exit(1);
  }
  console.log(`check: cross-check file agrees with the artefact on all ${ccSeen.size} rows (${path.basename(ccPath)}).`);
}

// ─── 4. Read and check the labelling view ───────────────────────────────────
if (!fs.existsSync(VIEW)) {
  die(`labelling view not found: ${VIEW}\n`
    + `      It is gitignored. Regenerate it first:\n`
    + `        node scripts/experiments/buildLabellingView.js`);
}
const originalText = fs.readFileSync(VIEW, 'utf8');
const recs = parseCsv(originalText);
if (recs.length === 0) die(`labelling view is empty: ${VIEW}`);
const header = recs[0];
const iUid = header.indexOf('row_uid');
const iVer = header.indexOf('human_verdict');
if (iUid === -1 || iVer === -1) {
  die(`labelling view is missing a row_uid or human_verdict column. Header: ${header.join(',')}`);
}

const body = recs.slice(1).filter((r) => !(r.length === 1 && r[0] === ''));
if (body.length !== EXPECTED_ROWS) {
  die(`labelling view has ${body.length} data rows, expected ${EXPECTED_ROWS}`);
}

// Round-trip guard: re-serialising the file untouched must reproduce it byte
// for byte. If it does not, this script's quoting convention differs from the
// one that wrote the file, and writing would corrupt the context_window fields.
if (serialise(recs) !== originalText) {
  die(`re-serialising ${VIEW} does not reproduce it byte for byte, so writing it back\n`
    + `      would alter fields this script must not touch. The file's quoting convention\n`
    + `      differs from buildLabellingView.js's. Investigate before restoring.`);
}

// ─── 5. Match on row_uid and fill ───────────────────────────────────────────
const seenInView = new Set();
for (const r of body) {
  const rawUid = String(r[iUid]).trim();
  if (!/^\d+$/.test(rawUid)) die(`labelling view has a non-numeric row_uid: "${r[iUid]}"`);
  const uid = parseInt(rawUid, 10);
  if (seenInView.has(uid)) die(`row_uid ${uid} appears twice in the labelling view`);
  seenInView.add(uid);
  if (!verdicts.has(uid)) die(`no verdict in the artefact for labelling-view row_uid ${uid}`);
  r[iVer] = verdicts.get(uid);
}
if (seenInView.size !== EXPECTED_ROWS) {
  die(`labelling view holds ${seenInView.size} distinct row_uids, expected ${EXPECTED_ROWS}`);
}

// ─── 6. Write ───────────────────────────────────────────────────────────────
const output = serialise([header, ...body]);
if (DRY_RUN) {
  console.log(`\n--dry-run: nothing written. ${body.length} rows would be filled in ${VIEW}.`);
} else {
  fs.writeFileSync(VIEW, output, 'utf8');
  console.log(`\nrestored ${body.length} verdicts into ${VIEW}`);
}

// ─── 7. Report (a report, not a gate) ───────────────────────────────────────
const filled = { REAL: 0, FALSE: 0, AMBIGUOUS: 0 };
for (const r of body) filled[r[iVer]]++;
console.log(`composition: REAL ${filled.REAL} | FALSE ${filled.FALSE} | AMBIGUOUS ${filled.AMBIGUOUS}  (n=${body.length})`);
console.log(`source:      ${path.relative(REPO_ROOT, ARTEFACT)}`);

console.log('\nWARNING: buildLabellingView.js writes human_verdict empty for every row by');
console.log('design, and its integrity check 9 enforces it. Any rebuild of the labelling');
console.log('view wipes this fill. Re-run this script after every regeneration, before');
console.log('scoring anything against the view.');
