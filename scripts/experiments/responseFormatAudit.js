#!/usr/bin/env node

/**
 * responseFormatAudit.js — READ-ONLY audit of Wave 1 response structure and a
 * direct matcher-vs-substring comparison for EXP-001.
 *
 * READ-ONLY. Uses only find().select().lean() + countDocuments(). It performs
 * NO insert / update / delete / bulkWrite / replace / mutation, re-runs no scan,
 * changes no config, deploys nothing. The database is never written to. The only
 * write is human-readable output to stdout.
 *
 * It imports and CALLS the real matcher (isFirmMentioned / normaliseFirmName /
 * normaliseResponseText) from lib/mentionMatcher.js — it does not reimplement or
 * modify it.
 *
 * Filter (identical to inventoryRuns.js):
 *   study: 'study_2026_07_exp001', wave: 1, status: 'ok',
 *   platform in ['perplexity', 'chatgpt']
 *
 * Usage: node scripts/experiments/responseFormatAudit.js
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';
import { isFirmMentioned, normaliseFirmName, normaliseResponseText } from './lib/mentionMatcher.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const STUDY = 'study_2026_07_exp001';
const WAVE = 1;
const PLATFORMS = ['perplexity', 'chatgpt'];
const FILTER = { study: STUDY, wave: WAVE, status: 'ok', platform: { $in: PLATFORMS } };

// ── Risky-core set from the previous normalisation audit ──────────────────────
// PROVENANCE NOTE (do not silently "correct"): the previous audit deterministically
// produced 25 distinct risky single-token cores — 17 collision cores + 8 prompt-word
// cores (the practice-area core 'family' is a subset of the prompt-word cores). The
// task refers to "24 risky cores"; no 24-item set was supplied and 24 does not match
// the audit's deterministic output. This constant holds the 25 identified cores. If a
// canonical 24-item list is supplied, replace this set verbatim — do not edit by judgement.
const RISKY_CORES = new Set([
  // 17 collision cores
  'liberty', 'belmont', 'bw', 'capstone', 'cjch', 'eatons', 'horrocks', 'howarth',
  'howells', 'integra', 'kingdom', 'mb', 'meade', 'national', 'robertsons', 'samuels', 'wingrove',
  // 8 prompt-word cores (family is also the sole practice-area core)
  'best', 'bradford', 'family', 'good', 'harrow', 'leeds', 'leicester', 'liverpool',
]);

// ── 2.1 deterministic list-line + prose-paragraph rules ───────────────────────
// A line is a LIST LINE if, after optional leading whitespace, it matches any of:
const LIST_LINE_RULES = [
  { name: 'numbered "1." / "1)"', re: /^\s*\d+[.)]\s+\S/ },
  { name: 'numbered "1 -"',        re: /^\s*\d+\s*-\s+\S/ },
  { name: 'dash bullet',           re: /^\s*[-–—]\s+\S/ },
  { name: 'glyph bullet',          re: /^\s*[•·▪‣◦]\s+\S/ },
  { name: 'asterisk/plus bullet',  re: /^\s*[*+]\s+\S/ },
  { name: 'markdown bold marker',  re: /^\s*\*\*/ },
];
function isListLine(line) { return LIST_LINE_RULES.some(r => r.re.test(line)); }

// PROSE PARAGRAPH (for MIXED): >= 2 consecutive non-empty, NON-list lines, each with
// >= 40 characters (trimmed). List lines break a prose run (a numbered list of long
// items is therefore NOT a prose paragraph). This rule is stated explicitly; no
// subjective "substantial prose" judgement is used.
function hasProseParagraph(lines) {
  let run = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.length === 0) { run = 0; continue; }
    if (isListLine(line)) { run = 0; continue; }
    if (t.length >= 40) { run++; if (run >= 2) return true; }
    else run = 0;
  }
  return false;
}

function classifyResponse(responseText) {
  const text = String(responseText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const listLineCount = lines.filter(isListLine).length;
  const hasList = listLineCount > 0;
  if (!hasList) return 'PROSE';                 // no qualifying list lines
  return hasProseParagraph(lines) ? 'MIXED' : 'LIST';
}

// ── 2.2 char accounting (non-whitespace) ──────────────────────────────────────
function nonWsCount(s) { return (s.match(/\S/g) || []).length; }

function pct(n, d) { return d > 0 ? (n / d * 100).toFixed(1) + '%' : 'n/a'; }

await mongoose.connect(MONGODB_URI);

// Confirm the filter matches at least one run before reporting anything.
const matchCount = await ExperimentRun.countDocuments(FILTER);
if (matchCount === 0) {
  console.error('STOP');
  console.error(`Filter matched ZERO runs: { study: '${STUDY}', wave: ${WAVE}, status: 'ok', platform in [${PLATFORMS.join(', ')}] }`);
  console.error('This is a data/integrity finding, not a script failure. The filter was NOT broadened or altered.');
  await mongoose.disconnect();
  process.exit(1);
}

const runs = await ExperimentRun.find(FILTER)
  .select('promptId platform responseText targets')
  .lean();

console.log(`Filter matched ${matchCount} runs (countDocuments); loaded ${runs.length} documents.`);
console.log(`Filter: { study: '${STUDY}', wave: ${WAVE}, status: 'ok', platform in [${PLATFORMS.join(', ')}] }\n`);

// ═══════════════════ TASK 3 — raw responseText integrity ═══════════════════
let missing = 0, emptyStr = 0, wsOnly = 0;
for (const r of runs) {
  if (!('responseText' in r) || r.responseText === null || r.responseText === undefined) missing++;
  else if (r.responseText === '') emptyStr++;
  else if (String(r.responseText).trim() === '') wsOnly++;
}
const affected = missing + emptyStr + wsOnly;
console.log('══ TASK 3 — responseText integrity ══');
console.log(`  total runs examined:              ${runs.length}`);
console.log(`  responseText missing/null:        ${missing}`);
console.log(`  responseText empty string:        ${emptyStr}`);
console.log(`  responseText whitespace-only:     ${wsOnly}`);
console.log(`  total missing/empty/whitespace:   ${affected} (${pct(affected, runs.length)})\n`);

// ═══════════════════ 2.1 structure classification ═══════════════════
const cats = ['LIST', 'PROSE', 'MIXED'];
const overall = { LIST: 0, PROSE: 0, MIXED: 0 };
const perPlatform = { perplexity: { LIST: 0, PROSE: 0, MIXED: 0 }, chatgpt: { LIST: 0, PROSE: 0, MIXED: 0 } };
const examples = { LIST: [], PROSE: [], MIXED: [] };
for (const r of runs) {
  const c = classifyResponse(r.responseText);
  overall[c]++;
  if (perPlatform[r.platform]) perPlatform[r.platform][c]++;
  if (examples[c].length < 5 && String(r.responseText || '').trim().length > 0) {
    examples[c].push({ platform: r.platform, promptId: r.promptId, text: String(r.responseText).slice(0, 300) });
  }
}
console.log('══ 2.1 — structure classification ══');
console.log('  OVERALL:');
for (const c of cats) console.log(`    ${c.padEnd(6)} ${overall[c]} (${pct(overall[c], runs.length)})`);
for (const p of PLATFORMS) {
  const tot = cats.reduce((s, c) => s + perPlatform[p][c], 0);
  console.log(`  ${p.toUpperCase()} (n=${tot}):`);
  for (const c of cats) console.log(`    ${c.padEnd(6)} ${perPlatform[p][c]} (${pct(perPlatform[p][c], tot)})`);
}

// ═══════════════════ 2.2 char proportion (LIST + MIXED) ═══════════════════
let totNonWs = 0, listNonWs = 0, proseNonWs = 0;
for (const r of runs) {
  const c = classifyResponse(r.responseText);
  if (c !== 'LIST' && c !== 'MIXED') continue;
  const text = String(r.responseText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const line of text.split('\n')) {
    const nw = nonWsCount(line);
    totNonWs += nw;
    if (isListLine(line)) listNonWs += nw; else proseNonWs += nw;
  }
}
console.log('\n══ 2.2 — proportion of LIST+MIXED text on list lines (aggregate) ══');
console.log(`  total non-whitespace chars:   ${totNonWs}`);
console.log(`  list-line chars:              ${listNonWs} (${pct(listNonWs, totNonWs)})`);
console.log(`  prose chars:                  ${proseNonWs} (${pct(proseNonWs, totNonWs)})`);

// ═══════════════════ 2.3 examples ═══════════════════
console.log('\n══ 2.3 — examples (5 per category, truncated to 300 chars) ══');
for (const c of cats) {
  console.log(`  -- ${c} --`);
  examples[c].forEach((e, i) => console.log(`   ${c}#${i + 1} [${e.platform}/${e.promptId}]: ${JSON.stringify(e.text)}`));
}

// ═══════════════════ 2.4 / 2.5 matcher vs substring ═══════════════════
// Accumulator keyed by scope(all|excl) × tokenCat(single|multi) × platform(all|perplexity|chatgpt)
function newAcc() { return { A: 0, B: 0, missed: 0, targets: 0 }; }
const acc = {};
for (const scope of ['all', 'excl']) for (const tok of ['single', 'multi']) for (const plat of ['all', 'perplexity', 'chatgpt'])
  acc[`${scope}|${tok}|${plat}`] = newAcc();

let skippedEmptyNorm = 0;
for (const r of runs) {
  const normText = normaliseResponseText(r.responseText);
  for (const t of (r.targets || [])) {
    const entity = t.entityName;
    if (!entity) continue;                                   // no name on this target → not applicable
    const normFirm = normaliseFirmName(entity);
    if (!normFirm) { skippedEmptyNorm++; continue; }
    const tokenCat = normFirm.split(/\s+/).filter(Boolean).length >= 2 ? 'multi' : 'single';
    const A = isFirmMentioned(r.responseText, entity) === true;   // REAL matcher
    const B = normText.includes(normFirm);                        // substring-only upper bound
    const missed = B && !A;                                       // rejected purely by context/gates
    const isRisky = RISKY_CORES.has(normFirm);
    for (const scope of (isRisky ? ['all'] : ['all', 'excl'])) {
      for (const plat of ['all', r.platform]) {
        const k = `${scope}|${tokenCat}|${plat}`;
        if (!acc[k]) continue;
        acc[k].targets++; if (A) acc[k].A++; if (B) acc[k].B++; if (missed) acc[k].missed++;
      }
    }
  }
}

function reportBlock(title, scope, plat) {
  console.log(`  ${title}`);
  for (const tok of ['single', 'multi']) {
    const a = acc[`${scope}|${tok}|${plat}`];
    const absDiff = a.B - a.A;
    const diffPctOfSub = a.B > 0 ? (absDiff / a.B * 100).toFixed(1) + '%' : 'n/a';
    const missedPct = a.B > 0 ? (a.missed / a.B * 100).toFixed(1) + '%' : 'n/a';
    console.log(`    ${tok}-token: targets=${a.targets}  current(A)=${a.A}  substring(B)=${a.B}  |B-A|=${absDiff} (${diffPctOfSub} of B)  missed_by_context/B=${missedPct}`);
  }
}

console.log('\n══ 2.4 — matcher vs substring (KEY: missed_by_context / substring_only) ══');
console.log('  A = real isFirmMentioned; B = substring-only upper bound (ignores line-67 context). B over-counts by design.');
reportBlock('A. INCLUDING all firms:', 'all', 'all');
reportBlock('B. EXCLUDING risky cores (25-core set; see PROVENANCE NOTE — task said 24):', 'excl', 'all');

console.log('\n══ 2.5 — platform breakdown (including all firms) ══');
reportBlock('perplexity:', 'all', 'perplexity');
reportBlock('chatgpt:', 'all', 'chatgpt');

if (skippedEmptyNorm > 0) console.log(`\n  (note: ${skippedEmptyNorm} targets skipped — entityName normalised to empty)`);

// ═══════════════════ TASK 4 — cross-checks ═══════════════════
console.log('\n══ TASK 4 — cross-checks ══');
const platPresent = new Set(runs.map(r => r.platform));
const promptSet = new Set(runs.map(r => r.promptId));
console.log(`  records examined (Task 2/3): ${runs.length}`);
console.log(`  runs with missing/empty/ws responseText (Task 3): ${affected}`);
console.log(`  platforms represented: ${[...platPresent].sort().join(', ')} (expected perplexity, chatgpt)`);
console.log(`  distinct promptIds represented: ${promptSet.size} (design target 68)`);
// per prompt×platform cell counts + shortfall vs 10
const cell = {};
for (const r of runs) { const k = `${r.promptId}||${r.platform}`; cell[k] = (cell[k] || 0) + 1; }
const shortfalls = Object.entries(cell).filter(([, n]) => n < 10);
const excesses = Object.entries(cell).filter(([, n]) => n > 10);
console.log(`  prompt×platform cells below design target (10): ${shortfalls.length}`);
for (const [k, n] of shortfalls.sort()) console.log(`     ${k}: ${n}`);
console.log(`  prompt×platform cells above design target (10): ${excesses.length}`);
for (const [k, n] of excesses.sort()) console.log(`     ${k}: ${n}`);

await mongoose.disconnect();
