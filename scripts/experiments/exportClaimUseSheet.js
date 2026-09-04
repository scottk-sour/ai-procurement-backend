#!/usr/bin/env node

/**
 * exportClaimUseSheet.js — build the human claim-use labelling sheet for a
 * wave >= 2 collection of the AI-visibility content study, and insert the
 * matching (null-label) claim_use_labels documents.
 *
 * READ-ONLY against experiment_runs (find().lean() only — never updates, upserts
 * or deletes a run, and never reads wave 1). Writes a CSV under
 * data/experiments/exports/ and INSERTS ONLY into claim_use_labels.
 *
 * Guardrails:
 *   - refuses wave < 2 (there is no claim-use capture for wave 1);
 *   - refuses if the claim registry is unfrozen (frozen === null) — D2, no bypass;
 *   - single snapshot: one read of the wave scope; the CSV and the label docs are
 *     derived from that same in-memory row set, never a second query;
 *   - export-time invariant: citationUrl === run.citedUrls[citationIndex] is
 *     asserted for every row as its label document is built; any failure aborts;
 *   - insert-only: re-running creates no duplicates (unique {runId,citationIndex})
 *     and never updates an existing label, even if the registry claim changed.
 *
 * Usage:
 *   node scripts/experiments/exportClaimUseSheet.js --study study_2026_09_ai_visibility_content --wave 2
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';
import ClaimUseLabel from '../../models/ClaimUseLabel.js';
import { loadClaims, DEFAULT_CLAIMS_PATH, DEFAULT_CONFIG_PATH } from '../../lib/experiments/loadClaims.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

export const CSV_COLUMNS = [
  'runId', 'promptId', 'intent', 'citationIndex', 'citationUrl',
  'isTargetArticle', 'targetClaim', 'responseText', 'claimUsed', 'claimUsageType', 'notes',
];

// ── URL / domain helpers ──
// normaliseUrl is copied verbatim from runExperimentScan.js (D1: claim binding
// uses the same normalisation the runner uses for target matching).
export function normaliseUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/+$/, '').toLowerCase();
  } catch { return url.toLowerCase().replace(/\/+$/, ''); }
}
// extractDomain / isTendoraiDomain are copied verbatim from citationLandscape.js.
export function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return String(url || '').toLowerCase(); }
}
export function isTendoraiDomain(d) { return d === 'tendorai.com' || d.endsWith('.tendorai.com'); }

// CSV writer cell, same minimal-quoting convention as buildLabellingView.js.
export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Build the claim registry index: normalisedArticleUrl -> { targetClaim, promptId, articleUrl }.
 * Binding is by URL, not by prompt (D1).
 */
export function buildUrlIndex(claims) {
  const idx = new Map();
  for (const c of claims) {
    idx.set(normaliseUrl(c.articleUrl), { targetClaim: c.targetClaim, promptId: c.promptId, articleUrl: c.articleUrl });
  }
  return idx;
}

/**
 * From the single snapshot of runs, build one row per TendorAI citation, sorted
 * deterministically by runId asc then citationIndex asc. Pure — no I/O.
 */
export function buildClaimUseRowSet(runs, { urlIndex, intentByPrompt }) {
  const rows = [];
  for (const run of runs) {
    const cited = run.citedUrls || [];
    const intent = intentByPrompt.get(run.promptId);
    if (intent === undefined) {
      throw new Error(`export: promptId "${run.promptId}" (run ${run._id}) has no intent in the config`);
    }
    for (let i = 0; i < cited.length; i++) {
      const url = cited[i];
      const domain = extractDomain(url);
      if (!isTendoraiDomain(domain)) continue;
      const match = urlIndex.get(normaliseUrl(url));
      rows.push({
        runId: run._id,
        promptId: run.promptId,
        intent,
        citationIndex: i,
        citationUrl: url,
        citedDomain: domain,
        isTargetArticle: !!match,
        targetClaim: match ? match.targetClaim : null,
        responseText: run.responseText,
      });
    }
  }
  rows.sort((a, b) => {
    const ra = String(a.runId), rb = String(b.runId);
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.citationIndex - b.citationIndex;
  });
  return rows;
}

export function rowsToCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([
      r.runId, r.promptId, r.intent, r.citationIndex, r.citationUrl,
      r.isTargetArticle, r.targetClaim, r.responseText,
      '', '', '', // claimUsed, claimUsageType, notes — blank for the labeller
    ].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

/**
 * Build the (null-label) label documents from the same row set, asserting the
 * export-time invariant against the snapshot for each row.
 */
export function buildLabelDocs(rows, runsById, { study, wave }) {
  return rows.map((r) => {
    const run = runsById.get(String(r.runId));
    if (!run || (run.citedUrls || [])[r.citationIndex] !== r.citationUrl) {
      throw new Error(`export invariant violated: citationUrl for run ${r.runId} index ${r.citationIndex} does not equal the stored citedUrls entry`);
    }
    return {
      study,
      wave,
      runId: r.runId,
      promptId: r.promptId,
      intent: r.intent,
      citationIndex: r.citationIndex,
      citationUrl: r.citationUrl,
      citedDomain: r.citedDomain,
      isTargetArticle: r.isTargetArticle,
      targetClaim: r.targetClaim,
      // claimUsed / claimUsageType / labelledBy / labelledAt / notes default null
    };
  });
}

/**
 * Insert-only: existing (runId,citationIndex) pairs are skipped via the unique
 * index; existing documents are never updated. Returns {inserted, skipped}.
 */
export async function insertLabelsInsertOnly(Model, docs) {
  if (!docs.length) return { inserted: 0, skipped: 0 };
  try {
    const res = await Model.insertMany(docs, { ordered: false });
    return { inserted: res.length, skipped: 0 };
  } catch (err) {
    const writeErrors = err.writeErrors || err.result?.result?.writeErrors || [];
    const codeOf = (e) => (e && (e.code ?? e.err?.code));
    const nonDup = writeErrors.filter((e) => codeOf(e) !== 11000);
    if (!writeErrors.length || nonDup.length) throw err; // a real, non-duplicate failure
    const skipped = writeErrors.length;
    const inserted = (err.insertedDocs?.length ?? (docs.length - skipped));
    return { inserted, skipped };
  }
}

function argVal(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

  const study = argVal('--study');
  const waveRaw = argVal('--wave');
  if (!study || waveRaw === undefined) {
    console.error('Usage: --study <tag> --wave <n>  [--claims <path>] [--config <path>]');
    process.exit(1);
  }
  if (!/^\d+$/.test(waveRaw)) { console.error(`--wave must be a non-negative integer (got: ${waveRaw})`); process.exit(1); }
  const wave = parseInt(waveRaw, 10);
  if (wave < 2) { console.error('Refusing: claim-use export is wave >= 2 only (wave 1 has no claim-use capture and is immutable).'); process.exit(1); }

  const claimsPath = path.resolve(argVal('--claims', DEFAULT_CLAIMS_PATH));
  const configPath = path.resolve(argVal('--config', DEFAULT_CONFIG_PATH));
  const registry = loadClaims({ claimsPath, configPath });

  // D2: refuse an unfrozen registry for a wave >= 2 export. No testing bypass.
  if (registry.frozen === null) {
    console.error('Refusing: claim registry is not frozen (frozen === null). Freeze it before a wave >= 2 export (D2).');
    process.exit(1);
  }
  if (registry.study !== study) {
    console.error(`Refusing: registry study "${registry.study}" does not match --study "${study}".`);
    process.exit(1);
  }

  const urlIndex = buildUrlIndex(registry.claims);

  await mongoose.connect(MONGODB_URI);
  try {
    // Single snapshot: one read of the wave scope; CSV and labels derive from it.
    const runs = await ExperimentRun.find({ study, wave, status: 'ok' })
      .select('promptId citedUrls responseText')
      .lean();
    const runsById = new Map(runs.map((r) => [String(r._id), r]));

    const rows = buildClaimUseRowSet(runs, { urlIndex, intentByPrompt: registry.intentByPrompt });
    const labelDocs = buildLabelDocs(rows, runsById, { study, wave });

    const outDir = path.join(REPO_ROOT, 'data/experiments/exports');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `claim-use-${study}-wave${wave}-${today()}.csv`);
    fs.writeFileSync(outPath, rowsToCsv(rows), 'utf8');

    const { inserted, skipped } = await insertLabelsInsertOnly(ClaimUseLabel, labelDocs);

    console.log(`Wave ${wave} claim-use export for ${study}:`);
    console.log(`  runs scanned:        ${runs.length}`);
    console.log(`  TendorAI citation rows: ${rows.length}  (target: ${rows.filter((r) => r.isTargetArticle).length}, other: ${rows.filter((r) => !r.isTargetArticle).length})`);
    console.log(`  CSV:                 ${path.relative(REPO_ROOT, outPath)}`);
    console.log(`  labels inserted:     ${inserted}`);
    console.log(`  labels skipped (existing): ${skipped}`);
  } finally {
    await mongoose.disconnect();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => { console.error('FATAL:', err.message); mongoose.disconnect().catch(() => {}); process.exit(1); });
}
