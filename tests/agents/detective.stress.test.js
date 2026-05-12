import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { analyseAeoSignals } from '../../services/aeoDetector.js';

const FIXTURE_DIR = path.join(process.cwd(), 'tests/fixtures/agents');

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
}

describe('Detective Agent — AEO Detector Stress Tests', () => {
  describe('fixture-1: perfect page (all tags, schema, content)', () => {
    const html = loadFixture('fixture-1-perfect.html');
    const result = analyseAeoSignals(html, 'https://www.harrisonandco.co.uk');

    it('scores 70+ out of 100', () => {
      expect(result.overallScore).toBeGreaterThanOrEqual(70);
    });

    it('passes schema check', () => {
      const schema = result.checks.find(c => c.key === 'schema');
      expect(schema.passed).toBe(true);
      expect(schema.score).toBeGreaterThanOrEqual(5);
    });

    it('passes meta check', () => {
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta.passed).toBe(true);
      expect(meta.score).toBeGreaterThanOrEqual(7);
    });

    it('passes h1 check (exactly one h1)', () => {
      const h1 = result.checks.find(c => c.key === 'h1');
      expect(h1.score).toBe(10);
    });

    it('passes ssl check', () => {
      const ssl = result.checks.find(c => c.key === 'ssl');
      expect(ssl.score).toBe(10);
    });

    it('passes social check', () => {
      const social = result.checks.find(c => c.key === 'social');
      expect(social.passed).toBe(true);
    });

    it('passes contact check', () => {
      const contact = result.checks.find(c => c.key === 'contact');
      expect(contact.passed).toBe(true);
    });

    it('returns 10 checks', () => {
      expect(result.checks).toHaveLength(10);
    });

    it('every check has required fields', () => {
      for (const check of result.checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('key');
        expect(check).toHaveProperty('score');
        expect(check).toHaveProperty('maxScore');
        expect(check).toHaveProperty('passed');
        expect(typeof check.score).toBe('number');
        expect(check.score).toBeGreaterThanOrEqual(0);
        expect(check.score).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('fixture-2: zero tags (bare page)', () => {
    const html = loadFixture('fixture-2-zero-tags.html');
    const result = analyseAeoSignals(html, 'http://example.com');

    it('scores 20 or below', () => {
      expect(result.overallScore).toBeLessThanOrEqual(20);
    });

    it('fails schema check', () => {
      const schema = result.checks.find(c => c.key === 'schema');
      expect(schema.score).toBe(0);
      expect(schema.passed).toBe(false);
    });

    it('fails meta check', () => {
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta.score).toBeLessThanOrEqual(2);
    });

    it('fails ssl check (http not https)', () => {
      const ssl = result.checks.find(c => c.key === 'ssl');
      expect(ssl.score).toBe(0);
    });

    it('fails social check', () => {
      const social = result.checks.find(c => c.key === 'social');
      expect(social.score).toBe(0);
    });

    it('fails contact check', () => {
      const contact = result.checks.find(c => c.key === 'contact');
      expect(contact.score).toBeLessThanOrEqual(4);
    });
  });

  describe('fixture-3: meta tags present but empty strings', () => {
    const html = loadFixture('fixture-3-empty-meta.html');
    const result = analyseAeoSignals(html, 'https://example.com');

    it('scores between 5 and 30', () => {
      expect(result.overallScore).toBeGreaterThanOrEqual(5);
      expect(result.overallScore).toBeLessThanOrEqual(30);
    });

    it('meta check gives partial or zero credit for empty strings', () => {
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta.score).toBeLessThanOrEqual(4);
    });
  });

  describe('fixture-4: placeholder meta content', () => {
    const html = loadFixture('fixture-4-placeholder-meta.html');
    const result = analyseAeoSignals(html, 'https://example.com');

    it('scores between 10 and 35', () => {
      expect(result.overallScore).toBeGreaterThanOrEqual(10);
      expect(result.overallScore).toBeLessThanOrEqual(35);
    });

    it('meta check penalises short/generic title "Untitled"', () => {
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta.score).toBeLessThanOrEqual(5);
    });
  });

  describe('fixture-5: malformed JSON-LD schema', () => {
    const html = loadFixture('fixture-5-malformed-schema.html');
    const result = analyseAeoSignals(html, 'https://example.com');

    it('schema check handles malformed JSON without crashing', () => {
      const schema = result.checks.find(c => c.key === 'schema');
      expect(schema).toBeDefined();
      expect(typeof schema.score).toBe('number');
    });

    it('overall score is a valid number', () => {
      expect(typeof result.overallScore).toBe('number');
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('fixture-6: schema with wrong @type', () => {
    const html = loadFixture('fixture-6-wrong-schema-type.html');
    const result = analyseAeoSignals(html, 'https://example.com');

    it('schema check gives credit for presence even with wrong type', () => {
      const schema = result.checks.find(c => c.key === 'schema');
      expect(schema.score).toBeGreaterThanOrEqual(1);
    });

    it('tendoraiSchemaDetected is false (not TendorAI schema)', () => {
      expect(result.tendoraiSchemaDetected).toBe(false);
    });
  });

  describe('fixture-7: title 200+ chars long', () => {
    const html = loadFixture('fixture-7-long-title.html');
    const result = analyseAeoSignals(html, 'https://example.com');

    it('meta check penalises excessively long title', () => {
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta.score).toBeLessThanOrEqual(7);
    });
  });

  describe('fixture-8: description only 30 chars', () => {
    const html = loadFixture('fixture-8-short-description.html');
    const result = analyseAeoSignals(html, 'https://example.com');

    it('meta check penalises short description', () => {
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta.score).toBeLessThanOrEqual(7);
    });
  });

  describe('fixture-9: duplicate meta description tags', () => {
    const html = loadFixture('fixture-9-duplicate-meta.html');
    const result = analyseAeoSignals(html, 'https://example.com');

    it('does not crash on duplicate meta descriptions', () => {
      expect(typeof result.overallScore).toBe('number');
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta).toBeDefined();
    });

    it('meta check gives some credit (first description is valid)', () => {
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta.score).toBeGreaterThanOrEqual(2);
    });
  });

  describe('fixture-10: Ascari-style minimal page (no meta, no schema)', () => {
    const html = loadFixture('fixture-10-ascari-snapshot.html');
    const result = analyseAeoSignals(html, 'https://ascari-office.co.uk');

    it('meta check scores 0-2 (no title tag, no description)', () => {
      const meta = result.checks.find(c => c.key === 'meta');
      expect(meta.score).toBeLessThanOrEqual(2);
    });

    it('schema check scores 0 (no JSON-LD)', () => {
      const schema = result.checks.find(c => c.key === 'schema');
      expect(schema.score).toBe(0);
    });

    it('h1 check scores 0 (no h1 tag)', () => {
      const h1 = result.checks.find(c => c.key === 'h1');
      expect(h1.score).toBe(0);
    });

    it('social check scores 0', () => {
      const social = result.checks.find(c => c.key === 'social');
      expect(social.score).toBe(0);
    });

    it('overall score is under 25', () => {
      expect(result.overallScore).toBeLessThanOrEqual(25);
    });
  });

  describe('scoring consistency', () => {
    it('overallScore equals sum of individual check scores', () => {
      const html = loadFixture('fixture-1-perfect.html');
      const result = analyseAeoSignals(html, 'https://example.com');
      const sum = result.checks.reduce((acc, c) => acc + c.score, 0);
      expect(result.overallScore).toBe(sum);
    });

    it('all scores are integers', () => {
      const html = loadFixture('fixture-1-perfect.html');
      const result = analyseAeoSignals(html, 'https://example.com');
      for (const check of result.checks) {
        expect(Number.isInteger(check.score)).toBe(true);
      }
      expect(Number.isInteger(result.overallScore)).toBe(true);
    });

    it('no score exceeds maxScore', () => {
      const html = loadFixture('fixture-1-perfect.html');
      const result = analyseAeoSignals(html, 'https://example.com');
      for (const check of result.checks) {
        expect(check.score).toBeLessThanOrEqual(check.maxScore);
      }
    });
  });
});
