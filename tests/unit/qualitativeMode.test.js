import { describe, it, expect } from 'vitest';
import { validateContentDraft } from '../../services/contentPlanner/validators.js';

describe('Qualitative mode — no statistics, no placeholders in body', () => {
  it('prompt contains the absolute statistics ban', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');
    expect(content).toContain('ZERO numeric statistics');
    expect(content).toContain('anonymous attribution is still fabrication');
    expect(content).toContain('Do NOT emit [FIRM_DATA');
    expect(content).toContain('write QUALITATIVELY');
  });

  it('prompt no longer passes allowedFirmDataKeys to the model', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');
    expect(content).toContain("allowedFirmDataKeys: {},");
  });

  it('draft body containing [FIRM_DATA: ...] fails validation', () => {
    const result = validateContentDraft({
      body: 'Our fees start from [FIRM_DATA: soleAgencyFeePercent | Your commission rate] plus VAT.',
    });
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
  });

  it('qualitative body with no statistics passes validation', () => {
    const result = validateContentDraft({
      body: 'Overpriced properties take noticeably longer to sell. Most residential transactions in Cardiff complete within a few months. Accurate initial pricing attracts more buyer interest and typically leads to a smoother process.',
    });
    const fabricationErrors = result.errors.filter(e => e.includes('Fabricated'));
    expect(fabricationErrors.length).toBe(0);
  });

  it('dataGaps field exists in writerAgent approval metadata logic', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');
    expect(content).toContain('dataGaps:');
    expect(content).toContain('dataGaps.length');
  });

  it('LLM reviewer prompt flags anonymous attribution', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/contentPlanner/fabricationReview.js', 'utf8');
    expect(content).toContain('anonymous attribution is fabrication');
    expect(content).toContain('Cardiff market analysis shows');
  });
});
