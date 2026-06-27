import { describe, it, expect } from 'vitest';
import { buildGroundTruthBlock } from '../../services/contentReview/groundTruth.js';

describe('groundTruth teaches statute citations', () => {
  it('injects the correct redress statute and warns off the wrong one for estate agents', () => {
    const block = buildGroundTruthBlock({ vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } });
    expect(block).toContain('Consumers, Estate Agents and Redress Act 2007');
    expect(block).toContain('Estate Agents Act 1979');
    expect(block).toContain('STATUTE CITATIONS');
  });

  it('injects statute grounding for solicitors too (appliesTo coverage)', () => {
    const block = buildGroundTruthBlock({ vendorType: 'solicitor', location: { postcode: 'CF10 1FA' } });
    expect(block).toContain('Consumers, Estate Agents and Redress Act 2007');
  });

  it('does not add a STATUTE CITATIONS block for an industry with no statute rows', () => {
    const block = buildGroundTruthBlock({ vendorType: 'mortgage-advisor', location: { postcode: 'CF10 1FA' } });
    expect(block).not.toContain('STATUTE CITATIONS');
  });
});
