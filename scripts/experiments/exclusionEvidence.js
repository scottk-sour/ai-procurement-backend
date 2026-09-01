#!/usr/bin/env node

/**
 * exclusionEvidence.js — EVIDENCE-ONLY analysis of intrinsic name ambiguity in
 * the EXP-001 panel. Read-only, deterministic, no database, no writes.
 *
 * PURPOSE
 * Make reproducible the empirical evidence a human needs before deciding
 * whether any firm's name is too intrinsically ambiguous to measure. It
 * produces evidence; it makes NO methodological decision, proposes NO
 * exclusion list, removes NO firm from the panel or denominator, and writes
 * NO files. Output goes to stdout only.
 *
 * It reads data/experiments/exp001-config.json and uses the repository's real
 * normaliseFirmName (imported from ./lib/mentionMatcher.js — not reimplemented).
 * The single-token length floor and all-caps/acronym rule are quoted from
 * mentionMatcher.js:49 and :62–64 and re-expressed here only to CLASSIFY the
 * evidence; this script does not import or modify the matcher's matching logic.
 *
 * NO MongoDB. NO writes. Modifies no files. Creates no output/list/data files.
 * This script must NOT be run in the audit environment; run it in the Render
 * shell:  node scripts/experiments/exclusionEvidence.js
 *
 * The output clearly separates EVIDENCE from any proposed exclusion. Nothing
 * here is an exclusion decision.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normaliseFirmName } from './lib/mentionMatcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../data/experiments/exp001-config.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`Config not found: ${CONFIG_PATH}`);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
if (!Array.isArray(config.prompts)) {
  console.error('Config has no prompts[] array — cannot analyse.');
  process.exit(1);
}

// ── Acronym test: quoted from mentionMatcher.js:62–63 (original name's first
//    word, all-caps, >=2 chars). Used here only to CLASSIFY short names. ──
function isAcronym(entityName) {
  const firstWord = String(entityName).trim().split(/\s+/)[0] || '';
  return /^[A-Z]{2,}$/.test(firstWord);
}

// ── Build the distinct-firm panel from config targets (deduped by entityName) ──
// A firm's entityName appears under exactly one city in this config; we record
// the city/prompt it came from for source attribution.
const firms = new Map(); // entityName -> { entityName, norm, tokenCount, acronym, cities:Set, promptIds:Set }
const cityForms = new Map(); // normalised-city-form -> original city string (for source display)
const cityAppearsInText = new Map(); // city -> example promptId whose text contains it

for (const p of config.prompts) {
  const city = p.city;
  if (city) {
    const raw = String(city).toLowerCase().replace(/\s+/g, ' ').trim();
    const normed = normaliseFirmName(city);
    if (raw) cityForms.set(raw, city);
    if (normed) cityForms.set(normed, city);
    // Confirm the city actually appears in a prompt's text (source evidence).
    if (!cityAppearsInText.has(city) && typeof p.text === 'string'
        && p.text.toLowerCase().includes(String(city).toLowerCase())) {
      cityAppearsInText.set(city, p.id);
    }
  }
  for (const t of (p.targets || [])) {
    const name = t.entityName;
    if (!name) continue;
    if (!firms.has(name)) {
      firms.set(name, {
        entityName: name,
        norm: normaliseFirmName(name),
        tokenCount: 0,
        acronym: isAcronym(name),
        cities: new Set(),
        promptIds: new Set(),
      });
    }
    const f = firms.get(name);
    f.cities.add(city);
    f.promptIds.add(p.id);
  }
}
for (const f of firms.values()) {
  f.tokenCount = f.norm ? f.norm.split(/\s+/).filter(Boolean).length : 0;
}

const allFirms = [...firms.values()];
const PANEL_N = allFirms.length;

const line = (s = '') => console.log(s);
const rule = () => line('='.repeat(78));

rule();
line('EXP-001 EXCLUSION EVIDENCE — analysis only, NOT a proposed exclusion list');
rule();
line(`Config: ${CONFIG_PATH}`);
line(`Distinct panel firms (by entityName): ${PANEL_N}` +
  (PANEL_N !== 1214 ? `  (note: differs from the expected 1,214 — verify the config)` : ''));
line('normaliseFirmName imported from lib/mentionMatcher.js (repo implementation).');
line('This report lists evidence of intrinsic name ambiguity. It removes nothing,');
line('excludes nothing, and changes no denominator. Decisions are the reader\'s.');
line('');

// ── A. Collision groups: >=2 distinct firms sharing an identical normalised name ──
rule();
line('A. COLLISION GROUPS — two or more panel firms with an identical normalised name');
rule();
const byNorm = new Map();
for (const f of allFirms) {
  if (!f.norm) continue;
  if (!byNorm.has(f.norm)) byNorm.set(f.norm, []);
  byNorm.get(f.norm).push(f.entityName);
}
const collisionGroups = [...byNorm.entries()]
  .filter(([, names]) => names.length >= 2)
  .sort((a, b) => (b[1].length - a[1].length) || a[0].localeCompare(b[0]));
const firmsInA = new Set();
if (collisionGroups.length === 0) {
  line('(none)');
} else {
  for (const [norm, names] of collisionGroups) {
    line(`normalised "${norm}"  — ${names.length} firms:`);
    for (const n of names.slice().sort()) { line(`    ${n}`); firmsInA.add(n); }
  }
}
line(`\nA total: ${collisionGroups.length} group(s), ${firmsInA.size} firm(s).`);
line('');

// ── B. Place-name candidates ──
rule();
line('B. PLACE-NAME CANDIDATES — normalised name equal to a place established from the repo');
rule();
line('VERIFIED (matches one of the 17 experiment cities, which appear in prompt text):');
const firmsInB = new Set();
const verifiedB = allFirms
  .filter(f => f.norm && cityForms.has(f.norm))
  .sort((a, b) => a.norm.localeCompare(b.norm) || a.entityName.localeCompare(b.entityName));
if (verifiedB.length === 0) {
  line('  (none)');
} else {
  for (const f of verifiedB) {
    const city = cityForms.get(f.norm);
    const src = cityAppearsInText.has(city)
      ? `prompt.city "${city}" (also in text of prompt ${cityAppearsInText.get(city)})`
      : `prompt.city "${city}"`;
    line(`  ${f.entityName}  | normalised "${f.norm}"  | place "${city}"  | source: ${src}`);
    firmsInB.add(f.entityName);
  }
}
line('');
line('UNVERIFIED PLACE-NAME CANDIDATE:');
line('  Place names beyond the 17 experiment cities (e.g. counties/regions such as');
line('  a "Yorkshire") cannot be verified from repository contents, and no external');
line('  gazetteer is permitted. This bucket is therefore NOT auto-populated: doing so');
line('  would require inventing place facts. Section B is expected to be INCOMPLETE —');
line('  a human/gazetteer review of the single-token names (see A and C) is required to');
line('  find place collisions the repository cannot establish. No items are listed here.');
line(`\nB total (verified only): ${firmsInB.size} firm(s).`);
line('');

// ── C. Short names ──
rule();
line('C. SHORT NAMES — normalised name short enough to engage the matcher length rules');
line('   (mentionMatcher.js:49 hard floor <3; :64 single-token <4 unless the :62–63');
line('   all-caps/acronym exception applies)');
rule();
const firmsInC = new Set();
const shortFirms = allFirms
  .filter(f => f.norm && f.norm.length < 4)
  .sort((a, b) => a.norm.length - b.norm.length || a.norm.localeCompare(b.norm) || a.entityName.localeCompare(b.entityName));
if (shortFirms.length === 0) {
  line('(none with normalised length < 4)');
} else {
  for (const f of shortFirms) {
    let ruleApplied;
    if (f.norm.length < 3) {
      ruleApplied = 'below hard floor <3 (mentionMatcher.js:49) — rejected regardless of tokens';
    } else if (f.tokenCount === 1) {
      ruleApplied = f.acronym
        ? '3-char single token ACCEPTED via all-caps/acronym exception (mentionMatcher.js:62–64)'
        : '3-char single token REJECTED, no acronym exception (mentionMatcher.js:64)';
    } else {
      ruleApplied = `3-char, ${f.tokenCount}-token name (multi-token path; length gate :49 passed at length 3)`;
    }
    const also = [firmsInA.has(f.entityName) ? 'A' : null, firmsInB.has(f.entityName) ? 'B' : null]
      .filter(Boolean).join('+') || 'none';
    line(`  ${f.entityName}  | normalised "${f.norm}" (len ${f.norm.length}, ${f.tokenCount}-token, acronym=${f.acronym})`);
    line(`      rule: ${ruleApplied}  | also in: ${also}`);
    firmsInC.add(f.entityName);
  }
}
line(`\nC total: ${firmsInC.size} firm(s).`);
line('');

// ── Cross-list totals ──
rule();
line('CROSS-LIST TOTALS (evidence, not exclusions)');
rule();
const union = new Set([...firmsInA, ...firmsInB, ...firmsInC]);
const inTwoOrMore = [...union].filter(n =>
  ([firmsInA.has(n), firmsInB.has(n), firmsInC.has(n)].filter(Boolean).length >= 2));
line(`A (collision groups):            ${firmsInA.size}`);
line(`B (verified place names):        ${firmsInB.size}`);
line(`C (short names):                 ${firmsInC.size}`);
line(`overlap (in >= 2 of A/B/C):      ${inTwoOrMore.length}`);
line(`  A&B: ${[...firmsInA].filter(n => firmsInB.has(n)).length}` +
  `  | A&C: ${[...firmsInA].filter(n => firmsInC.has(n)).length}` +
  `  | B&C: ${[...firmsInB].filter(n => firmsInC.has(n)).length}`);
line(`total distinct affected firms:   ${union.size}`);
line(`panel size:                      ${PANEL_N}`);
line(`percentage of panel affected:    ${PANEL_N > 0 ? (union.size / PANEL_N * 100).toFixed(1) : '0.0'}%`);
line('');
line('EVIDENCE ONLY. No firm has been excluded, no denominator changed, no list written.');
rule();
