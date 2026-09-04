#!/usr/bin/env node

/**
 * importClaimUseLabels.js — apply a human-labelled claim-use sheet back onto the
 * claim_use_labels collection.
 *
 * Touches claim_use_labels ONLY (never experiment_runs). Updates ONLY the
 * judgement fields (claimUsed, claimUsageType, labelledBy, labelledAt, notes) —
 * never the identifying fields written at export time.
 *
 * Validate-all-then-write: every row is validated before any document is
 * written; any failure aborts the whole import with the offending row numbers.
 * Validation:
 *   - runId and citationIndex present, and identify exactly one label document;
 *   - no duplicate (runId, citationIndex) within the CSV;
 *   - the CSV citationUrl equals the stored label's citationUrl exactly
 *     (rejects an altered identifier);
 *   - for a target row (stored isTargetArticle === true): claimUsed present,
 *     integer, in 0-3;
 *   - for a non-target row (stored isTargetArticle === false): claimUsed blank
 *     (rejects a label on a non-target page).
 *
 * `labelledBy` comes from --labelled-by (the repo has no other operator-identity
 * convention for scripts); `labelledAt` is import time.
 *
 * Usage:
 *   node scripts/experiments/importClaimUseLabels.js --file <sheet.csv> --labelled-by "Jane Smith"
 * Requires: MONGODB_URI (or MONGO_URI) in env.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import ClaimUseLabel from '../../models/ClaimUseLabel.js';

// RFC4180 parser — copied verbatim from restoreVerdicts.js (fields contain
// commas, quotes and embedded newlines, so parsing cannot be line-wise). Throws
// instead of process.exit so callers can handle it.
export function parseCsv(text) {
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
  if (inQuotes) throw new Error('unterminated quoted field in CSV');
  if (field !== '' || rec.length > 0) { rec.push(field); recs.push(rec); }
  return recs;
}

/**
 * Turn parsed CSV records into header-keyed row objects with 1-based data-row
 * numbers (row 1 = the first line after the header).
 */
export function rowsFromRecords(recs) {
  if (!recs.length) throw new Error('CSV is empty');
  const header = recs[0];
  const required = ['runId', 'citationIndex', 'citationUrl', 'claimUsed'];
  for (const col of required) {
    if (!header.includes(col)) throw new Error(`CSV missing required column: ${col}`);
  }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  for (let r = 1; r < recs.length; r++) {
    const rec = recs[r];
    if (rec.length === 1 && rec[0] === '') continue; // skip a trailing blank line
    rows.push({
      rowNumber: r, // 1-based data row
      runId: (rec[idx.runId] ?? '').trim(),
      citationIndex: (rec[idx.citationIndex] ?? '').trim(),
      citationUrl: rec[idx.citationUrl] ?? '',
      claimUsed: (rec[idx.claimUsed] ?? '').trim(),
      claimUsageType: idx.claimUsageType !== undefined ? (rec[idx.claimUsageType] ?? '') : '',
      notes: idx.notes !== undefined ? (rec[idx.notes] ?? '') : '',
    });
  }
  return rows;
}

/**
 * Validate all rows against the stored labels. `storedByKey` maps
 * `${runId}::${citationIndex}` -> stored label doc. Returns the list of updates
 * to apply, or throws with every offending row number.
 */
export function validateImportRows(rows, storedByKey, { labelledBy, labelledAt }) {
  const errors = [];
  const seen = new Map();
  const updates = [];

  for (const row of rows) {
    const n = row.rowNumber;

    if (!row.runId) { errors.push(`row ${n}: missing runId`); continue; }
    if (row.citationIndex === '' || !/^\d+$/.test(row.citationIndex)) {
      errors.push(`row ${n}: citationIndex must be a non-negative integer (got "${row.citationIndex}")`); continue;
    }
    const citationIndex = parseInt(row.citationIndex, 10);
    const key = `${row.runId}::${citationIndex}`;

    if (seen.has(key)) { errors.push(`row ${n}: duplicate (runId, citationIndex) also on row ${seen.get(key)}`); continue; }
    seen.set(key, n);

    const stored = storedByKey.get(key);
    if (!stored) { errors.push(`row ${n}: no claim_use_labels document for runId ${row.runId} citationIndex ${citationIndex}`); continue; }

    if (row.citationUrl !== stored.citationUrl) {
      errors.push(`row ${n}: citationUrl does not match the stored label (altered identifier)`); continue;
    }

    const blank = row.claimUsed === '';
    if (stored.isTargetArticle === false) {
      if (!blank) { errors.push(`row ${n}: claimUsed must be blank on a non-target page (isTargetArticle=false)`); continue; }
    } else {
      if (blank) { errors.push(`row ${n}: claimUsed is required on a target page`); continue; }
      if (!/^-?\d+$/.test(row.claimUsed)) { errors.push(`row ${n}: claimUsed must be an integer 0-3 (got "${row.claimUsed}")`); continue; }
      const cu = parseInt(row.claimUsed, 10);
      if (![0, 1, 2, 3].includes(cu)) { errors.push(`row ${n}: claimUsed must be 0-3 (got ${cu})`); continue; }
    }

    updates.push({
      runId: row.runId,
      citationIndex,
      set: {
        claimUsed: blank ? null : parseInt(row.claimUsed, 10),
        claimUsageType: row.claimUsageType === '' ? null : row.claimUsageType,
        labelledBy,
        labelledAt,
        notes: row.notes === '' ? null : row.notes,
      },
    });
  }

  if (errors.length) {
    throw new Error(`import aborted — ${errors.length} invalid row(s); nothing written:\n  ${errors.join('\n  ')}`);
  }
  return updates;
}

function argVal(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

  const file = argVal('--file');
  const labelledBy = argVal('--labelled-by');
  if (!file || !labelledBy) {
    console.error('Usage: --file <sheet.csv> --labelled-by <name>');
    process.exit(1);
  }
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }

  const rows = rowsFromRecords(parseCsv(fs.readFileSync(filePath, 'utf8')));
  const labelledAt = new Date();

  await mongoose.connect(MONGODB_URI);
  try {
    // Fetch the stored labels for exactly the (runId,citationIndex) pairs in the
    // sheet, then validate everything before any write.
    const orClauses = [];
    for (const row of rows) {
      if (row.runId && /^\d+$/.test(row.citationIndex) && mongoose.isValidObjectId(row.runId)) {
        orClauses.push({ runId: row.runId, citationIndex: parseInt(row.citationIndex, 10) });
      }
    }
    const stored = orClauses.length
      ? await ClaimUseLabel.find({ $or: orClauses }).select('runId citationIndex citationUrl isTargetArticle').lean()
      : [];
    const storedByKey = new Map(stored.map((s) => [`${s.runId}::${s.citationIndex}`, s]));

    const updates = validateImportRows(rows, storedByKey, { labelledBy, labelledAt });

    // Apply — update ONLY the judgement fields; never identifying fields, never experiment_runs.
    const ops = updates.map((u) => ({
      updateOne: {
        filter: { runId: u.runId, citationIndex: u.citationIndex },
        update: { $set: u.set },
      },
    }));
    if (ops.length) await ClaimUseLabel.bulkWrite(ops);

    console.log(`Imported ${updates.length} claim-use label(s) from ${path.basename(filePath)} (labelledBy: ${labelledBy}).`);
  } finally {
    await mongoose.disconnect();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => { console.error('IMPORT FAILED:', err.message); mongoose.disconnect().catch(() => {}); process.exit(1); });
}
