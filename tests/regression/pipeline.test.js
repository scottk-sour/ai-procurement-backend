import { describe, it, expect } from 'vitest';
import { validateDraft } from '../../services/contentReview/validateDraft.js';
import { detectPossibleFabrication } from '../../services/contentPlanner/writerGuards.js';
import { BAD_FIXTURES, GOOD_FIXTURES } from './fixtures/index.js';

describe('Regression suite — deterministic guards (offline, no API)', () => {

  describe('BAD fixtures (20) — each must block with the expected code', () => {
    for (const fix of BAD_FIXTURES) {
      it(fix.name, () => {
        const gate = validateDraft(fix.draft, fix.firm);
        const fabrication = detectPossibleFabrication(fix.draft);
        const allBlocks = [...gate.blocks, ...fabrication.map(f => ({ code: 'FABRICATED_ATTRIBUTION', ...f }))];

        expect(allBlocks.length).toBeGreaterThan(0);
        if (fix.expectedCode) {
          const matched = allBlocks.some(b => b.code === fix.expectedCode);
          expect(matched, `Expected code ${fix.expectedCode} not found in: ${allBlocks.map(b => b.code).join(', ')}`).toBe(true);
        }
      });
    }
  });

  describe('GOOD fixtures (5) — each must pass clean', () => {
    for (const fix of GOOD_FIXTURES) {
      it(fix.name, () => {
        const gate = validateDraft(fix.draft, fix.firm);
        expect(gate.ok, `Unexpected blocks: ${gate.blocks.map(b => `${b.code}: ${b.message}`).join('; ')}`).toBe(true);
      });
    }
  });
});
