import { describe, it, expect } from 'vitest';
import {
  aeoReportTemplate,
  getCategoryLabelPlural,
  buildAeoSubject,
  formatCompanyName,
} from '../../services/emailTemplates.js';

const BASE_REPORT = {
  name: 'Sarah Jones',
  companyName: 'Hughes & Co Solicitors Ltd',
  category: 'family-law',
  city: 'Cardiff',
  score: 28,
  reportUrl: 'https://www.tendorai.com/ai-visibility-report/results/abc123',
  platformResults: [
    { platform: 'perplexity', platformLabel: 'Perplexity', mentioned: false, status: 'checked', dataSource: 'live_web', competitors: [{ name: 'Smith Family Law' }] },
    { platform: 'chatgpt', platformLabel: 'ChatGPT', mentioned: false, status: 'checked', dataSource: 'live_web', competitors: [{ name: 'Jones Solicitors' }] },
    { platform: 'claude', platformLabel: 'Claude', mentioned: false, status: 'checked', dataSource: 'training_data', competitors: [] },
  ],
  competitors: [
    { name: 'Smith Family Law', description: 'Recommended by Perplexity' },
    { name: 'Jones Solicitors', description: 'Recommended by ChatGPT' },
    { name: 'Davies Legal', description: 'Recommended by Perplexity, ChatGPT' },
    { name: 'Extra Firm', description: 'Recommended by ChatGPT' },
  ],
  gaps: [
    { title: 'No structured data for AI parsing' },
    { title: 'No blog or content hub' },
    { title: 'Missing meta title or description' },
  ],
  aiMentioned: false,
  regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  unclaimedProfile: null,
};

describe('getCategoryLabelPlural', () => {
  it('family-law → family law solicitors (not "family laws")', () => {
    expect(getCategoryLabelPlural('family-law')).toBe('family law solicitors');
  });

  it('conveyancing → conveyancing solicitors', () => {
    expect(getCategoryLabelPlural('conveyancing')).toBe('conveyancing solicitors');
  });

  it('residential-mortgages → residential mortgage advisers', () => {
    expect(getCategoryLabelPlural('residential-mortgages')).toBe('residential mortgage advisers');
  });

  it('sales → estate agents for sales', () => {
    expect(getCategoryLabelPlural('sales')).toBe('estate agents for sales');
  });

  it('unknown category → service providers', () => {
    expect(getCategoryLabelPlural('unknown-thing')).toBe('service providers');
  });
});

describe('aeoReportTemplate — not-mentioned report with competitors and gaps', () => {
  const html = aeoReportTemplate(BASE_REPORT);

  it('does not contain "six" or "6 AI"', () => {
    expect(html).not.toMatch(/\bsix\b/i);
    expect(html).not.toMatch(/6 AI/i);
    expect(html).not.toMatch(/of 6/);
  });

  it('does not contain "4x" or "4&times;" multiplier claims', () => {
    expect(html).not.toContain('4×');
    expect(html).not.toContain('4&times;');
    expect(html).not.toMatch(/4x/i);
  });

  it('does not contain scarcity claims', () => {
    expect(html).not.toMatch(/claimed.*this week/i);
    expect(html).not.toMatch(/send.*prompts/i);
  });

  it('does not contain "undefined"', () => {
    expect(html).not.toContain('undefined');
  });

  it('uses correct plural: "family law solicitors" not "family laws"', () => {
    expect(html).toContain('family law solicitors');
    expect(html).not.toMatch(/family laws\b/i);
  });

  it('uses ai-visibility-report URL path', () => {
    expect(html).toContain('/ai-visibility-report/results/');
    expect(html).not.toContain('/aeo-report/results/');
  });

  it('names only live_web platforms (Perplexity and ChatGPT)', () => {
    expect(html).toContain('Perplexity and ChatGPT');
    expect(html).not.toContain('Gemini');
    expect(html).not.toContain('Claude');
  });

  it('says the firm was not mentioned', () => {
    expect(html).toContain('one of the firms they named');
  });

  it('lists up to 3 competitors', () => {
    expect(html).toContain('Smith Family Law');
    expect(html).toContain('Jones Solicitors');
    expect(html).toContain('Davies Legal');
    expect(html).not.toContain('Extra Firm');
  });

  it('lists gap titles', () => {
    expect(html).toContain('No structured data for AI parsing');
    expect(html).toContain('No blog or content hub');
  });

  it('shows score', () => {
    expect(html).toContain('28 / 100');
  });

  it('CTA says "See your full report"', () => {
    expect(html).toContain('See your full report');
  });

  it('has Scott Davies sign-off', () => {
    expect(html).toContain('Scott Davies');
    expect(html).toContain('Founder, TendorAI');
  });

  it('footer references SRA register', () => {
    expect(html).toContain('SRA Solicitors Register');
  });
});

describe('aeoReportTemplate — mentioned report', () => {
  const html = aeoReportTemplate({
    ...BASE_REPORT,
    aiMentioned: true,
    competitors: [],
  });

  it('says the firm was mentioned', () => {
    expect(html).toContain('was mentioned');
    expect(html).toContain('full report shows where');
  });

  it('does not contain "was not mentioned" language', () => {
    expect(html).not.toContain('one of the firms they named');
  });

  it('omits competitor block when empty', () => {
    expect(html).not.toContain('Instead, they recommended');
  });
});

describe('aeoReportTemplate — empty competitors', () => {
  const html = aeoReportTemplate({
    ...BASE_REPORT,
    competitors: [],
  });

  it('omits competitor block', () => {
    expect(html).not.toContain('Instead, they recommended');
    expect(html).not.toContain('Smith Family Law');
  });

  it('still renders score and gaps', () => {
    expect(html).toContain('28 / 100');
    expect(html).toContain('No structured data for AI parsing');
  });

  it('does not contain "undefined"', () => {
    expect(html).not.toContain('undefined');
  });
});

describe('aeoReportTemplate — unclaimed profile', () => {
  const html = aeoReportTemplate({
    ...BASE_REPORT,
    unclaimedProfile: { regulatoryBody: 'SRA Solicitors Register' },
  });

  it('includes unclaimed-profile paragraph', () => {
    expect(html).toContain('already listed on TendorAI');
    expect(html).toContain('SRA Solicitors Register');
    expect(html).toContain('unclaimed');
  });
});

describe('buildAeoSubject', () => {
  it('uses correct plural and city', () => {
    const subject = buildAeoSubject({
      displayName: 'Hughes & Co',
      categoryLabelPlural: 'family law solicitors',
      city: 'Cardiff',
    });
    expect(subject).toContain('Who AI recommends for family law solicitors in Cardiff');
    expect(subject).toContain('Hughes & Co');
    expect(subject).not.toContain('family laws');
  });
});
