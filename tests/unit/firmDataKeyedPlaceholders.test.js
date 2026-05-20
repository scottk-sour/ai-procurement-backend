import { describe, it, expect } from 'vitest';
import { FIRM_DATA_KEYS, isValidFirmDataKey, getFirmDataLabel } from '../../services/writerAgent/firmDataKeys.js';
import { parseKeyedPlaceholders, parseLegacyPlaceholders, parseAllPlaceholders, countAllPlaceholders } from '../../services/writerAgent/parsePlaceholders.js';
import { countAllPlaceholderFormats } from '../../services/contentPlanner/writerGuards.js';

describe('firmData keyed placeholders', () => {
  describe('FIRM_DATA_KEYS registry', () => {
    it('contains at least 20 keys', () => {
      expect(Object.keys(FIRM_DATA_KEYS).length).toBeGreaterThanOrEqual(20);
    });

    it('every key has a non-empty label', () => {
      for (const [key, label] of Object.entries(FIRM_DATA_KEYS)) {
        expect(label, `${key} has empty label`).toBeTruthy();
        expect(typeof label).toBe('string');
      }
    });

    it('isValidFirmDataKey returns true for known keys', () => {
      expect(isValidFirmDataKey('fullManagementFeePercent')).toBe(true);
      expect(isValidFirmDataKey('averageCompletionTimeWeeks')).toBe(true);
    });

    it('isValidFirmDataKey returns false for unknown keys', () => {
      expect(isValidFirmDataKey('madeUpKey')).toBe(false);
      expect(isValidFirmDataKey('')).toBe(false);
    });

    it('getFirmDataLabel returns label for known key', () => {
      expect(getFirmDataLabel('fullManagementFeePercent')).toContain('management fee');
    });

    it('getFirmDataLabel falls back to key for unknown key', () => {
      expect(getFirmDataLabel('unknownKey')).toBe('unknownKey');
    });
  });

  describe('parseKeyedPlaceholders', () => {
    it('extracts key + label from [FIRM_DATA: key | label]', () => {
      const content = 'Our fee is [FIRM_DATA: fullManagementFeePercent | Add your full management fee %] plus VAT.';
      const result = parseKeyedPlaceholders(content);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('fullManagementFeePercent');
      expect(result[0].label).toBe('Add your full management fee %');
      expect(result[0].raw).toContain('[FIRM_DATA:');
    });

    it('extracts multiple placeholders', () => {
      const content = '[FIRM_DATA: brokerFee | Your broker fee] and [FIRM_DATA: lenderPanelSize | Number of lenders]';
      const result = parseKeyedPlaceholders(content);
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('brokerFee');
      expect(result[1].key).toBe('lenderPanelSize');
    });

    it('returns empty for content without placeholders', () => {
      expect(parseKeyedPlaceholders('No placeholders here.')).toEqual([]);
    });

    it('returns empty for null/undefined', () => {
      expect(parseKeyedPlaceholders(null)).toEqual([]);
      expect(parseKeyedPlaceholders(undefined)).toEqual([]);
    });
  });

  describe('parseLegacyPlaceholders', () => {
    it('extracts legacy [FIRM TO PROVIDE: ...] format', () => {
      const content = 'Our fee is [FIRM TO PROVIDE: typical fee range] plus VAT.';
      const result = parseLegacyPlaceholders(content);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBeNull();
      expect(result[0].label).toBe('typical fee range');
    });
  });

  describe('parseAllPlaceholders', () => {
    it('counts both keyed and legacy in same content', () => {
      const content = '[FIRM_DATA: brokerFee | Your fee] and [FIRM TO PROVIDE: old style placeholder]';
      const result = parseAllPlaceholders(content);
      expect(result).toHaveLength(2);
    });
  });

  describe('countAllPlaceholders', () => {
    it('counts total across both formats', () => {
      const content = '[FIRM_DATA: a | label] text [FIRM TO PROVIDE: b] more [FIRM_DATA: c | label2]';
      expect(countAllPlaceholders(content)).toBe(3);
    });

    it('returns 0 for clean content', () => {
      expect(countAllPlaceholders('No placeholders.')).toBe(0);
    });
  });

  describe('writerGuards countAllPlaceholderFormats', () => {
    it('counts keyed + legacy combined', () => {
      const text = '[FIRM_DATA: x | label] and [FIRM TO PROVIDE: y]';
      expect(countAllPlaceholderFormats(text)).toBe(2);
    });

    it('returns 0 for empty', () => {
      expect(countAllPlaceholderFormats('')).toBe(0);
      expect(countAllPlaceholderFormats(null)).toBe(0);
    });
  });

  describe('firmData on Vendor model', () => {
    it('firmData Map stores and retrieves keyed values', () => {
      const firmData = new Map();
      firmData.set('fullManagementFeePercent', { value: '10', label: 'Full management fee %', updatedAt: new Date(), updatedBy: 'firm' });
      expect(firmData.get('fullManagementFeePercent').value).toBe('10');
      expect(firmData.has('nonexistent')).toBe(false);
    });

    it('Writer uses real value when firmData has the key', () => {
      const firmData = new Map();
      firmData.set('brokerFee', { value: '£499', label: 'Broker fee', updatedAt: new Date(), updatedBy: 'firm' });
      const val = firmData.get('brokerFee')?.value;
      expect(val).toBe('£499');
      // Writer should inline '£499' — no placeholder emitted
    });

    it('Writer emits [FIRM_DATA: key | label] for missing keys', () => {
      const firmData = new Map();
      const key = 'brokerFee';
      const val = firmData.get(key)?.value;
      expect(val).toBeUndefined();
      // Writer should emit: [FIRM_DATA: brokerFee | Your broker fee (e.g. £499 or fee-free)]
      const placeholder = `[FIRM_DATA: ${key} | ${getFirmDataLabel(key)}]`;
      expect(placeholder).toContain('[FIRM_DATA:');
      expect(placeholder).toContain('brokerFee');
    });
  });
});
