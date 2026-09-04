import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import ClaimUseLabel from '../../models/ClaimUseLabel.js';

const valid = (over = {}) => ({
  study: 'study_2026_09_ai_visibility_content',
  wave: 2,
  runId: new mongoose.Types.ObjectId(),
  promptId: 'bi-01',
  intent: 'buyer',
  citationIndex: 0,
  citationUrl: 'https://tendorai.com/blog/x',
  citedDomain: 'tendorai.com',
  isTargetArticle: true,
  ...over,
});

describe('ClaimUseLabel model', () => {
  it('requires the identifying/observational fields', () => {
    const err = new ClaimUseLabel({}).validateSync();
    for (const f of ['study', 'wave', 'runId', 'promptId', 'intent', 'citationIndex', 'citationUrl', 'citedDomain', 'isTargetArticle']) {
      expect(err.errors[f]).toBeDefined();
    }
  });

  it('defaults judgement fields to null and validates (claimUsed null passes the enum)', () => {
    const doc = new ClaimUseLabel(valid());
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.claimUsed).toBeNull();
    expect(doc.claimUsageType).toBeNull();
    expect(doc.labelledBy).toBeNull();
    expect(doc.labelledAt).toBeNull();
    expect(doc.notes).toBeNull();
  });

  it('accepts claimUsed 0-3 and rejects out-of-range', () => {
    for (const v of [0, 1, 2, 3]) {
      expect(new ClaimUseLabel(valid({ claimUsed: v })).validateSync()).toBeUndefined();
    }
    expect(new ClaimUseLabel(valid({ claimUsed: 4 })).validateSync().errors.claimUsed).toBeDefined();
  });
});
