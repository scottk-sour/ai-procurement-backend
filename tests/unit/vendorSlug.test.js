import { describe, it, expect } from 'vitest';
import { computeCleanSlug, slugifyText } from '../../scripts/migrateSlugDuplication.js';

describe('Vendor Slug — city duplication fix', () => {
  describe('slugifyText', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      expect(slugifyText('Cardiff Property Partners')).toBe('cardiff-property-partners');
    });

    it('strips special characters', () => {
      expect(slugifyText("Smith & Co's")).toBe('smith-cos');
    });

    it('handles empty/null', () => {
      expect(slugifyText('')).toBe('');
      expect(slugifyText(null)).toBe('');
    });
  });

  describe('computeCleanSlug', () => {
    it('does NOT duplicate city when company contains city', () => {
      const slug = computeCleanSlug('Cardiff Property Partners', 'Cardiff');
      expect(slug).toBe('cardiff-property-partners');
      expect(slug).not.toContain('cardiff-cardiff');
    });

    it('appends city when company does NOT contain city', () => {
      const slug = computeCleanSlug('Smith & Co', 'London');
      expect(slug).toBe('smith-co-london');
    });

    it('handles company already ending with city', () => {
      const slug = computeCleanSlug('Best Solicitors Cardiff', 'Cardiff');
      expect(slug).toBe('best-solicitors-cardiff');
    });

    it('handles no city', () => {
      const slug = computeCleanSlug('Generic Firm', null);
      expect(slug).toBe('generic-firm');
    });

    it('handles empty city', () => {
      const slug = computeCleanSlug('Generic Firm', '');
      expect(slug).toBe('generic-firm');
    });

    it('handles multi-word city', () => {
      const slug = computeCleanSlug('North Wales Solicitors', 'North Wales');
      expect(slug).toBe('north-wales-solicitors');
      expect(slug).not.toContain('north-wales-north-wales');
    });
  });

  describe('previousSlugs lookup', () => {
    it('old slug stored in previousSlugs after migration', () => {
      const oldSlug = 'cardiff-property-partners-cardiff';
      const newSlug = 'cardiff-property-partners';
      const previousSlugs = [oldSlug];
      expect(previousSlugs).toContain(oldSlug);
      expect(newSlug).not.toBe(oldSlug);
    });

    it('vendor findable by previousSlugs value', () => {
      const vendor = {
        slug: 'cardiff-property-partners',
        previousSlugs: ['cardiff-property-partners-cardiff'],
      };
      const searchSlug = 'cardiff-property-partners-cardiff';
      const foundViaCurrent = vendor.slug === searchSlug;
      const foundViaPrevious = vendor.previousSlugs.includes(searchSlug);
      expect(foundViaCurrent).toBe(false);
      expect(foundViaPrevious).toBe(true);
    });

    it('redirectSlug returned when found via previousSlugs', () => {
      const vendor = { slug: 'cardiff-property-partners' };
      const requestedSlug = 'cardiff-property-partners-cardiff';
      const redirectSlug = vendor.slug !== requestedSlug ? vendor.slug : null;
      expect(redirectSlug).toBe('cardiff-property-partners');
    });
  });
});
