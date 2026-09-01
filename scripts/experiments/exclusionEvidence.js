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

const line = (s = '') => console.log(s);
const rule = () => line('='.repeat(78));

// ── Panel identity: computed from RAW config targets, independent of the
//    entityName-keyed grouping used for name-collision analysis (Sections A–C).
//    Reports both identity fields; does NOT pick one and does NOT deduplicate
//    to whichever field happens to yield 1,214. ──
const EXPECTED_PANEL = 1214;
let totalObservations = 0;
const entityNameSet = new Set();
const targetUrlSet = new Set();
const entityToUrls = new Map();  // entityName -> Set(url)
const urlToEntities = new Map(); // url -> Set(entityName)
for (const p of config.prompts) {
  for (const t of (p.targets || [])) {
    totalObservations++;
    const name = t.entityName ?? '(missing entityName)';
    const url = t.url ?? '(missing url)';
    entityNameSet.add(name);
    targetUrlSet.add(url);
    if (!entityToUrls.has(name)) entityToUrls.set(name, new Set());
    entityToUrls.get(name).add(url);
    if (!urlToEntities.has(url)) urlToEntities.set(url, new Set());
    urlToEntities.get(url).add(name);
  }
}
const entityMultiUrl = [...entityToUrls.entries()].filter(([, s]) => s.size > 1);
const urlMultiEntity = [...urlToEntities.entries()].filter(([, s]) => s.size > 1);
const identityCountsAgree = entityNameSet.size === targetUrlSet.size;
// Denominator used for the name-collision analysis below is the distinct
// entityName count — LABELLED as such, not asserted to be "the panel".
const PANEL_N = entityNameSet.size;

rule();
line('EXP-001 EXCLUSION EVIDENCE — analysis only, NOT a proposed exclusion list');
rule();
line(`Config: ${CONFIG_PATH}`);
line('normaliseFirmName imported from lib/mentionMatcher.js (repo implementation).');
line('This report lists evidence of intrinsic name ambiguity. It removes nothing,');
line('excludes nothing, and changes no denominator. Decisions are the reader\'s.');
line('');

rule();
line('PANEL IDENTITY VERIFICATION — reported independently of the name-collision');
line('grouping in Sections A–C. The script does NOT deduplicate to whichever field');
line('yields 1,214, and does NOT choose a panel-identity definition.');
rule();
line(`Total target observations (prompts[].targets):   ${totalObservations}`);
line(`Distinct entityName values:                      ${entityNameSet.size}`);
line(`Distinct target URLs:                            ${targetUrlSet.size}`);
line(`entityName count == target-URL count?            ${identityCountsAgree ? 'YES' : 'NO'}`);
line(`entityName count == ${EXPECTED_PANEL}?                         ${entityNameSet.size === EXPECTED_PANEL ? 'YES' : 'NO'}`);
line(`target-URL count == ${EXPECTED_PANEL}?                         ${targetUrlSet.size === EXPECTED_PANEL ? 'YES' : 'NO'}`);
line('');
line(`entityName values mapped to >1 distinct URL:     ${entityMultiUrl.length}`);
for (const [name, urls] of entityMultiUrl.sort((a, b) => (b[1].size - a[1].size) || String(a[0]).localeCompare(String(b[0])))) {
  line(`    "${name}" -> ${urls.size} URLs:`);
  for (const u of [...urls].sort()) line(`        ${u}`);
}
line(`target URLs mapped to >1 distinct entityName:    ${urlMultiEntity.length}`);
for (const [url, names] of urlMultiEntity.sort((a, b) => (b[1].size - a[1].size) || String(a[0]).localeCompare(String(b[0])))) {
  line(`    ${url} -> ${names.size} entityNames:`);
  for (const n of [...names].sort()) line(`        "${n}"`);
}
if (!identityCountsAgree || entityNameSet.size !== EXPECTED_PANEL || targetUrlSet.size !== EXPECTED_PANEL) {
  line('');
  line('DISCREPANCY: the identity counts do not all reconcile to the expected 1,214-firm');
  line('panel. Reported, not resolved — the correct panel-identity definition is a');
  line('decision for the reviewer, not this script.');
}
line('');
line('NOTE: Sections A–C group candidates by entityName / normalised name. Where an');
line('entityName maps to >1 URL (above), that grouping treats them as one firm; the');
line('per-identity counts above are authoritative for panel identity.');
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
line('');
line('SINGLE-TOKEN CANDIDATE UNIVERSE — the COMPLETE set of panel firms whose');
line('normalised name is a single token. This is the reproducible universe for the');
line('human place-name review, so that no single-token firm name is hidden from it.');
line('The script does NOT classify any of these as a place; verified city matches are');
line('flagged only for convenience.');
const singleTokenFirms = allFirms
  .filter(f => f.tokenCount === 1)
  .sort((a, b) => a.norm.localeCompare(b.norm) || a.entityName.localeCompare(b.entityName));
line(`  count: ${singleTokenFirms.length}`);
for (const f of singleTokenFirms) {
  const cityMatch = cityForms.has(f.norm) ? `  [verified city "${cityForms.get(f.norm)}"]` : '';
  line(`  ${f.entityName}  | normalised "${f.norm}"  | city: ${[...f.cities].sort().join(', ')}  | prompts: ${[...f.promptIds].sort().join(', ')}${cityMatch}`);
}
line(`\nB total (verified city matches only): ${firmsInB.size} firm(s); single-token universe: ${singleTokenFirms.length} firm(s).`);
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
line(`denominator (distinct entityName): ${PANEL_N}   (name-collision grouping identity;`);
line(`                                   see PANEL IDENTITY VERIFICATION for the per-identity counts)`);
line(`percentage affected:             ${PANEL_N > 0 ? (union.size / PANEL_N * 100).toFixed(1) : '0.0'}%  (of distinct entityName)`);
line('');
line('EVIDENCE ONLY. No firm has been excluded, no denominator changed, no list written.');
rule();
