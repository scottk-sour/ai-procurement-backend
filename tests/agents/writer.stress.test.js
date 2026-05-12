import { describe, it, expect } from 'vitest';
import { countPlaceholders, validateContentDraft, findUnsourcedStats } from '../../services/contentPlanner/validators.js';

describe('Writer Agent — Validator Stress Tests', () => {
  describe('placeholder detection', () => {
    it('counts [FIRM TO PROVIDE: ...] markers correctly', () => {
      const text = 'Our fees start from [FIRM TO PROVIDE: typical fee range]. Contact [FIRM TO PROVIDE: partner name] for details.';
      expect(countPlaceholders(text)).toBe(2);
    });

    it('counts zero for text without placeholders', () => {
      expect(countPlaceholders('No placeholders here.')).toBe(0);
    });

    it('is case-insensitive', () => {
      expect(countPlaceholders('[firm to provide: test]')).toBe(1);
      expect(countPlaceholders('[FIRM TO PROVIDE: test]')).toBe(1);
    });

    it('counts across body + linkedin + facebook combined', () => {
      const body = 'Text [FIRM TO PROVIDE: a] more [FIRM TO PROVIDE: b]';
      const linkedin = 'Post [FIRM TO PROVIDE: c]';
      const facebook = 'No placeholders here';
      const total = countPlaceholders(body) + countPlaceholders(linkedin) + countPlaceholders(facebook);
      expect(total).toBe(3);
    });

    it('handles null/undefined input without crashing', () => {
      expect(countPlaceholders(null)).toBe(0);
      expect(countPlaceholders(undefined)).toBe(0);
      expect(countPlaceholders('')).toBe(0);
    });
  });

  describe('validateContentDraft — hard blocks', () => {
    it('blocks publish when unresolved placeholders exist', () => {
      const result = validateContentDraft({
        body: 'Content with [FIRM TO PROVIDE: fee range] in it.',
        linkedInText: '',
        facebookText: '',
      });
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('unresolved'))).toBe(true);
    });

    it('blocks publish when body is empty', () => {
      const result = validateContentDraft({ body: '', linkedInText: '', facebookText: '' });
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('empty'))).toBe(true);
    });

    it('blocks publish for banned phrases', () => {
      const bannedPhrases = [
        "in today's fast-paced market",
        "let's dive in to the details",
        "in conclusion, we recommend",
        "it's worth noting that",
        "without further ado",
        "moreover, the regulations",
        "furthermore, clients should",
        "additionally, we offer",
        "that being said, the approach",
        "it is important to note",
        "have you ever wondered about",
      ];

      for (const phrase of bannedPhrases) {
        const result = validateContentDraft({
          body: `Some content. ${phrase}. More content that is long enough.`,
          linkedInText: '',
          facebookText: '',
        });
        expect(result.passed, `Should block: "${phrase}"`).toBe(false);
        expect(result.errors.some(e => e.includes('Banned phrase')), `Missing banned phrase error for: "${phrase}"`).toBe(true);
      }
    });

    it('blocks publish for US English spellings', () => {
      const usSpellings = [
        'optimization', 'optimize', 'behavior', 'behavioral',
        'color', 'colored', 'organization', 'organize',
        'centered', 'analyze', 'recognized', 'realize', 'specialize',
      ];

      for (const word of usSpellings) {
        const result = validateContentDraft({
          body: `Our firm provides ${word} services across the region with expert guidance and comprehensive support.`,
          linkedInText: '',
          facebookText: '',
        });
        expect(result.passed, `Should block US spelling: "${word}"`).toBe(false);
        expect(result.errors.some(e => e.includes('US English')), `Missing US English error for: "${word}"`).toBe(true);
      }
    });

    it('passes when content is clean', () => {
      const result = validateContentDraft({
        body: 'Conveyancing in Cardiff costs between £850 and £1,500 plus VAT. The Solicitors Regulation Authority (SRA) requires all conveyancing firms to publish their fees under the SRA Transparency Rules.',
        linkedInText: 'Short linkedin post about conveyancing costs.',
        facebookText: 'Facebook post about our services.',
      });
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateContentDraft — soft warnings', () => {
    it('warns about unsourced statistics', () => {
      const result = validateContentDraft({
        body: 'About 87% of clients prefer fixed fees. The average cost is £1,200 per transaction.',
        linkedInText: '',
        facebookText: '',
      });
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('statistic'))).toBe(true);
    });

    it('does not warn when stat is near a Tier 1 source', () => {
      const result = validateContentDraft({
        body: 'According to HMRC, the SDLT threshold is £250,000 for first-time buyers. The SRA requires transparency on fees of £500 or more.',
        linkedInText: '',
        facebookText: '',
      });
      expect(result.warnings.filter(w => w.includes('statistic'))).toHaveLength(0);
    });
  });

  describe('findUnsourcedStats', () => {
    it('detects percentages without nearby sources', () => {
      const stats = findUnsourcedStats('About 87% of solicitors fail to comply with the rules.');
      expect(stats.length).toBeGreaterThan(0);
      expect(stats[0].stat).toContain('87%');
    });

    it('detects £ amounts without nearby sources', () => {
      const stats = findUnsourcedStats('The average cost is £1,200 per case.');
      expect(stats.length).toBeGreaterThan(0);
    });

    it('ignores stats near Tier 1 sources', () => {
      const stats = findUnsourcedStats('HMRC publishes SDLT rates. The threshold is £250,000 for first-time buyers.');
      expect(stats).toHaveLength(0);
    });

    it('handles empty string', () => {
      expect(findUnsourcedStats('')).toEqual([]);
    });

    it('handles text with no stats', () => {
      expect(findUnsourcedStats('No numbers in this text at all.')).toEqual([]);
    });
  });

  describe('fabrication defence — sparse vendor scenario', () => {
    it('validateContentDraft catches fabricated-sounding content with no source attribution', () => {
      const fabricatedContent = `
        Harrison & Co Solicitors has handled over 5,000 conveyancing transactions in the last decade.
        Our success rate is 99.7% and we have been voted Best Conveyancer in Wales three years running.
        The average cost of conveyancing is £1,200 according to recent market data.
        97% of our clients recommend us to friends and family.
      `;
      const result = validateContentDraft({
        body: fabricatedContent,
        linkedInText: '',
        facebookText: '',
      });
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles null payload gracefully', () => {
      const result = validateContentDraft(null);
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('handles payload missing body field', () => {
      const result = validateContentDraft({ linkedInText: 'test' });
      expect(result.passed).toBe(false);
    });

    it('checks linkedInText and facebookText for banned phrases too', () => {
      const result = validateContentDraft({
        body: 'Clean body content with no issues at all and enough words.',
        linkedInText: "In today's fast-paced market, you need a solicitor.",
        facebookText: '',
      });
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('Banned phrase'))).toBe(true);
    });
  });
});
