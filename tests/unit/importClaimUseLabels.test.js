import { describe, it, expect } from 'vitest';
import { parseCsv, rowsFromRecords, validateImportRows } from '../../scripts/experiments/importClaimUseLabels.js';
import { csvCell, CSV_COLUMNS } from '../../scripts/experiments/exportClaimUseSheet.js';

const R1 = '000000000000000000000001';
const U1 = 'https://tendorai.com/blog/x';
const U2 = 'https://tendorai.com/blog/other';

// Stored labels as the DB would return them (lean): the export-time truth.
const storedByKey = new Map([
  [`${R1}::0`, { runId: R1, citationIndex: 0, citationUrl: U1, isTargetArticle: true }],
  [`${R1}::1`, { runId: R1, citationIndex: 1, citationUrl: U2, isTargetArticle: false }],
]);
const opts = { labelledBy: 'Jane Smith', labelledAt: new Date('2026-09-04T00:00:00Z') };

// Build a CSV in the exact exported column order from partial row objects.
function makeCsv(rowObjs) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rowObjs) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(r[c] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}
const rowsOf = (csv) => rowsFromRecords(parseCsv(csv));

describe('importClaimUseLabels — CSV parsing', () => {
  it('round-trips fields containing commas, quotes and newlines', () => {
    const csv = makeCsv([{ runId: R1, citationIndex: 0, citationUrl: U1, isTargetArticle: true,
      responseText: 'line one, with comma\nline "two"', claimUsed: 1 }]);
    const rows = rowsOf(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].runId).toBe(R1);
    expect(rows[0].citationUrl).toBe(U1);
    expect(rows[0].claimUsed).toBe('1');
  });
});

describe('importClaimUseLabels — validation', () => {
  it('accepts a valid sheet: target labelled 0-3, non-target left blank', () => {
    const csv = makeCsv([
      { runId: R1, citationIndex: 0, citationUrl: U1, isTargetArticle: true, claimUsed: 1, notes: 'used verbatim' },
      { runId: R1, citationIndex: 1, citationUrl: U2, isTargetArticle: false, claimUsed: '' },
    ]);
    const updates = validateImportRows(rowsOf(csv), storedByKey, opts);
    expect(updates).toHaveLength(2);
    const target = updates.find((u) => u.citationIndex === 0);
    expect(target.set.claimUsed).toBe(1);
    expect(target.set.labelledBy).toBe('Jane Smith');
    expect(target.set.notes).toBe('used verbatim');
    const nonTarget = updates.find((u) => u.citationIndex === 1);
    expect(nonTarget.set.claimUsed).toBeNull();
  });

  it('rejects an altered citationUrl', () => {
    const csv = makeCsv([{ runId: R1, citationIndex: 0, citationUrl: 'https://tendorai.com/ALTERED', isTargetArticle: true, claimUsed: 1 }]);
    expect(() => validateImportRows(rowsOf(csv), storedByKey, opts)).toThrow(/citationUrl does not match/i);
  });

  it('rejects a label (claimUsed) on a non-target page', () => {
    const csv = makeCsv([{ runId: R1, citationIndex: 1, citationUrl: U2, isTargetArticle: false, claimUsed: 1 }]);
    expect(() => validateImportRows(rowsOf(csv), storedByKey, opts)).toThrow(/must be blank on a non-target page/i);
  });

  it('rejects claimUsed out of range on a target page', () => {
    const csv = makeCsv([{ runId: R1, citationIndex: 0, citationUrl: U1, isTargetArticle: true, claimUsed: 4 }]);
    expect(() => validateImportRows(rowsOf(csv), storedByKey, opts)).toThrow(/claimUsed must be 0-3/i);
  });

  it('rejects a blank claimUsed on a target page', () => {
    const csv = makeCsv([{ runId: R1, citationIndex: 0, citationUrl: U1, isTargetArticle: true, claimUsed: '' }]);
    expect(() => validateImportRows(rowsOf(csv), storedByKey, opts)).toThrow(/required on a target page/i);
  });

  it('rejects a duplicate (runId, citationIndex) in the sheet', () => {
    const csv = makeCsv([
      { runId: R1, citationIndex: 0, citationUrl: U1, isTargetArticle: true, claimUsed: 1 },
      { runId: R1, citationIndex: 0, citationUrl: U1, isTargetArticle: true, claimUsed: 2 },
    ]);
    expect(() => validateImportRows(rowsOf(csv), storedByKey, opts)).toThrow(/duplicate \(runId, citationIndex\)/i);
  });

  it('rejects a row with no matching stored label', () => {
    const csv = makeCsv([{ runId: R1, citationIndex: 5, citationUrl: U1, isTargetArticle: true, claimUsed: 1 }]);
    expect(() => validateImportRows(rowsOf(csv), storedByKey, opts)).toThrow(/no claim_use_labels document/i);
  });
});

describe('importClaimUseLabels — never touches experiment_runs', () => {
  it('never imports the ExperimentRun model or accesses the experiment_runs collection', async () => {
    const fs = await import('fs');
    const url = await import('url');
    const p = url.fileURLToPath(new URL('../../scripts/experiments/importClaimUseLabels.js', import.meta.url));
    const src = fs.readFileSync(p, 'utf8');
    // No import of the runs model, and no direct-driver access to its collection.
    expect(/from\s+['"][^'"]*ExperimentRun\.js['"]/.test(src)).toBe(false);
    expect(/collection\(\s*['"]experiment_runs['"]\s*\)/.test(src)).toBe(false);
    // It does operate on the labels model.
    expect(/from\s+['"][^'"]*ClaimUseLabel\.js['"]/.test(src)).toBe(true);
  });
});
