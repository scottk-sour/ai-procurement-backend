import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
  buildClaimUseRowSet, rowsToCsv, buildLabelDocs, insertLabelsInsertOnly,
  buildUrlIndex, CSV_COLUMNS,
} from '../../scripts/experiments/exportClaimUseSheet.js';

const intentByPrompt = new Map([['bi-01', 'buyer'], ['ri-15', 'research']]);
const claims = [{ promptId: 'bi-01', articleUrl: 'https://tendorai.com/blog/x', targetClaim: 'Do X to be cited.' }];
const urlIndex = buildUrlIndex(claims);

const oid = () => new mongoose.Types.ObjectId();
const A = oid(), B = oid();
// Two runs, deliberately supplied out of natural order, with a mix of TendorAI
// (target + non-target) and non-TendorAI citations.
const runs = [
  { _id: B, promptId: 'ri-15', responseText: 'ans B',
    citedUrls: ['https://reddit.com/z', 'https://tendorai.com/blog/other'] },           // index1 tendorai non-target
  { _id: A, promptId: 'bi-01', responseText: 'ans A',
    citedUrls: ['https://tendorai.com/blog/x/', 'https://clio.com/y', 'https://tendorai.com/blog/other'] }, // idx0 target (trailing slash), idx2 non-target
];

describe('exportClaimUseSheet — row set', () => {
  const rows = buildClaimUseRowSet(runs, { urlIndex, intentByPrompt });

  it('emits one row per TendorAI citation only (non-TendorAI excluded)', () => {
    expect(rows).toHaveLength(3); // A idx0, A idx2, B idx1
    expect(rows.every((r) => r.citedDomain === 'tendorai.com')).toBe(true);
  });

  it('is deterministically ordered by runId asc then citationIndex asc', () => {
    for (let i = 1; i < rows.length; i++) {
      const p = rows[i - 1], c = rows[i];
      const key = (r) => `${String(r.runId)}#${String(r.citationIndex).padStart(6, '0')}`;
      expect(key(p) < key(c)).toBe(true);
    }
  });

  it('binds targetClaim by URL (D1), incl. trailing-slash normalisation; other TendorAI URLs get null', () => {
    const target = rows.find((r) => r.isTargetArticle);
    expect(target.promptId).toBe('bi-01');
    expect(target.citationIndex).toBe(0);
    expect(target.targetClaim).toBe('Do X to be cited.');
    const nonTargets = rows.filter((r) => !r.isTargetArticle);
    expect(nonTargets.length).toBe(2);
    expect(nonTargets.every((r) => r.targetClaim === null)).toBe(true);
  });

  it('CSV and label docs are derived from the SAME row set (one snapshot)', () => {
    const csv = rowsToCsv(rows);
    const csvDataLines = csv.trimEnd().split('\n').slice(1); // drop header
    const runsById = new Map(runs.map((r) => [String(r._id), r]));
    const labels = buildLabelDocs(rows, runsById, { study: 's', wave: 2 });
    expect(csvDataLines).toHaveLength(rows.length);
    expect(labels).toHaveLength(rows.length);
    expect(csv.split('\n')[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('a non-target label document carries null claim fields', () => {
    const runsById = new Map(runs.map((r) => [String(r._id), r]));
    const labels = buildLabelDocs(rows, runsById, { study: 's', wave: 2 });
    const nonTarget = labels.find((l) => !l.isTargetArticle);
    expect(nonTarget.targetClaim).toBeNull();
    expect(nonTarget.claimUsed).toBeUndefined(); // set only by import; schema default null
  });

  it('the export-time invariant aborts when citationUrl != snapshot citedUrls[index]', () => {
    const runsById = new Map(runs.map((r) => [String(r._id), r]));
    const tampered = rows.map((r) => ({ ...r }));
    tampered[0].citationUrl = 'https://tendorai.com/DIFFERENT';
    expect(() => buildLabelDocs(tampered, runsById, { study: 's', wave: 2 })).toThrow(/invariant violated/i);
  });
});

describe('exportClaimUseSheet — insert-only', () => {
  const docs = [{ runId: A, citationIndex: 0 }, { runId: A, citationIndex: 2 }];

  it('first run inserts all', async () => {
    const model = { insertMany: async (d) => d.slice() };
    expect(await insertLabelsInsertOnly(model, docs)).toEqual({ inserted: 2, skipped: 0 });
  });

  it('second run inserts zero (all duplicates skipped via unique index)', async () => {
    const model = { insertMany: async () => { const e = new Error('E11000'); e.writeErrors = [{ code: 11000 }, { code: 11000 }]; e.insertedDocs = []; throw e; } };
    expect(await insertLabelsInsertOnly(model, docs)).toEqual({ inserted: 0, skipped: 2 });
  });

  it('a partial re-run inserts only the new pairs', async () => {
    const model = { insertMany: async (d) => { const e = new Error('E11000'); e.writeErrors = [{ code: 11000 }]; e.insertedDocs = [d[1]]; throw e; } };
    expect(await insertLabelsInsertOnly(model, docs)).toEqual({ inserted: 1, skipped: 1 });
  });

  it('rethrows a non-duplicate write error', async () => {
    const model = { insertMany: async () => { const e = new Error('boom'); e.writeErrors = [{ code: 121 }]; throw e; } };
    await expect(insertLabelsInsertOnly(model, docs)).rejects.toThrow(/boom/);
  });

  it('empty docs is a no-op', async () => {
    const model = { insertMany: async () => { throw new Error('should not be called'); } };
    expect(await insertLabelsInsertOnly(model, [])).toEqual({ inserted: 0, skipped: 0 });
  });
});
