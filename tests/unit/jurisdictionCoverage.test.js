import { describe, it, expect } from 'vitest';
import { buildGroundTruthBlock } from '../../services/contentReview/groundTruth.js';
import { isAllowedUrl } from '../../scripts/jurisdiction-research.js';

describe('groundTruth — jurisdiction fallback', () => {

  it('Welsh estate-agent => teaching present, fallback ABSENT (has rows)', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } };
    const block = buildGroundTruthBlock(firm);
    expect(block).toContain('LETTING LAW (WALES)');
    expect(block).toContain('occupation contract');
    expect(block).not.toContain('JURISDICTION FALLBACK');
  });

  it('Welsh solicitor => teaching present, fallback ABSENT (has rows)', () => {
    const firm = { vendorType: 'solicitor', location: { postcode: 'SA1 1AA' } };
    const block = buildGroundTruthBlock(firm);
    expect(block).toContain('LETTING LAW (WALES)');
    expect(block).not.toContain('JURISDICTION FALLBACK');
  });

  it('Welsh accountant => no teaching, fallback PRESENT (no rows)', () => {
    const firm = { vendorType: 'accountant', location: { postcode: 'CF10 1FA' } };
    const block = buildGroundTruthBlock(firm);
    expect(block).not.toContain('LETTING LAW (WALES)');
    expect(block).toContain('JURISDICTION FALLBACK');
    expect(block).toContain('Never assume English law applies in Wales');
  });

  it('English estate-agent => no teaching, no fallback', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'BS1 1AA' } };
    const block = buildGroundTruthBlock(firm);
    expect(block).not.toContain('LETTING LAW (WALES)');
    expect(block).not.toContain('JURISDICTION FALLBACK');
  });

  it('no jurisdiction => no teaching, no fallback', () => {
    const firm = { vendorType: 'estate-agent' };
    const block = buildGroundTruthBlock(firm);
    expect(block).not.toContain('LETTING LAW (WALES)');
    expect(block).not.toContain('JURISDICTION FALLBACK');
  });
});

describe('jurisdiction-research — URL allow-list', () => {

  it('allows legislation.gov.uk', () => {
    expect(isAllowedUrl('https://www.legislation.gov.uk/anaw/2016/1')).toBe(true);
  });

  it('allows gov.wales', () => {
    expect(isAllowedUrl('https://www.gov.wales/housing-law-changed-renting-homes')).toBe(true);
  });

  it('allows gov.uk', () => {
    expect(isAllowedUrl('https://www.gov.uk/check-tenant-right-to-rent-documents')).toBe(true);
  });

  it('allows sra.org.uk', () => {
    expect(isAllowedUrl('https://www.sra.org.uk/solicitors/guidance/transparency-rules/')).toBe(true);
  });

  it('rejects random URL', () => {
    expect(isAllowedUrl('https://www.google.com/search?q=test')).toBe(false);
  });

  it('rejects wikipedia', () => {
    expect(isAllowedUrl('https://en.wikipedia.org/wiki/Housing_Act')).toBe(false);
  });
});

describe('jurisdiction-research — result handling', () => {
  it('diverges:false produces no proposed row file', async () => {
    const { writeReport } = await import('../../scripts/jurisdiction-research.js');
    const fs = await import('fs');
    const path = await import('path');

    const identical = [{ topic: 'wills-probate', quote: 'The Wills Act 1837 applies to England and Wales', url: 'https://www.legislation.gov.uk/ukpga/Will7/1/26' }];
    const diverging = [];

    const reportPath = writeReport('solicitor-test', diverging, identical);
    const content = fs.readFileSync(reportPath, 'utf8');

    expect(content).toContain('## IDENTICAL (no row needed)');
    expect(content).toContain('wills-probate');
    expect(content).toContain('The Wills Act 1837 applies to England and Wales');
    expect(content).not.toContain('## DIVERGES (proposed rows)\n\n###');

    fs.unlinkSync(reportPath);
  });

  it('diverges:true produces a valid proposed row file', async () => {
    const { writeProposedRow, writeReport } = await import('../../scripts/jurisdiction-research.js');
    const fs = await import('fs');
    const path = await import('path');

    const row = {
      id: 'test_divergence',
      domain: 'test',
      appliesTo: ['solicitor'],
      england: { canonical: 'English Housing Act 1988' },
      wales: { canonical: 'Renting Homes (Wales) Act 2016' },
      forbiddenInWales: ['Housing Act 1988'],
      forbiddenInEngland: ['Renting Homes (Wales) Act'],
      sources: [{ fact: 'Test fact', url: 'https://www.legislation.gov.uk/anaw/2016/1', quote: 'occupation contracts replace ASTs' }],
      verifyBeforeCommit: [],
    };

    const rowPath = writeProposedRow('test_divergence', row);
    expect(fs.existsSync(rowPath)).toBe(true);

    const content = fs.readFileSync(rowPath, 'utf8');
    expect(content).toContain('DO NOT import directly');
    expect(content).toContain('test_divergence');
    expect(content).toContain('Renting Homes (Wales) Act 2016');

    const diverging = [{ topic: 'test-topic', quote: 'occupation contracts', url: 'https://www.legislation.gov.uk/anaw/2016/1', rowFile: 'test_divergence.proposed.js' }];
    const reportPath = writeReport('solicitor-test2', diverging, []);
    const reportContent = fs.readFileSync(reportPath, 'utf8');
    expect(reportContent).toContain('## DIVERGES (proposed rows)');
    expect(reportContent).toContain('test-topic');

    fs.unlinkSync(rowPath);
    fs.unlinkSync(reportPath);
  });
});
