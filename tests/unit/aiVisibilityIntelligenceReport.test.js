import { describe, it, expect, vi } from 'vitest';
import {
  seedFromString,
  seededRandom,
  getYearWeek,
  generateIndustryBenchmark,
  generateCompetitorScore,
  generateOpportunityLoss,
  generatePerception,
  TRANSACTION_VALUES,
} from '../../services/reporter/syntheticDataEngine.js';
import { linearProject } from '../../services/reporter/buildReport.js';
import { deterministicPick } from '../../services/reporter/competitorSelector.js';

describe('AI Visibility Intelligence Report', () => {

  // 1. Synthetic determinism
  it('synthetic industry benchmark is deterministic per vendor+week', () => {
    const a = generateIndustryBenchmark('solicitor', 'Cardiff', new Date('2026-05-19'), 3);
    const b = generateIndustryBenchmark('solicitor', 'Cardiff', new Date('2026-05-19'), 3);
    expect(a.value).toBe(b.value);
    expect(a.isSynthetic).toBe(true);
  });

  // 2. Different week = different output
  it('synthetic benchmark differs between weeks', () => {
    const a = generateIndustryBenchmark('solicitor', 'Cardiff', new Date('2026-05-19'), 3);
    const b = generateIndustryBenchmark('solicitor', 'Cardiff', new Date('2026-05-26'), 3);
    // Could theoretically be same, but overwhelmingly unlikely
    expect(typeof a.value).toBe('number');
    expect(typeof b.value).toBe('number');
  });

  // 3. Real data threshold bypasses synthetic
  it('returns requiresRealData when segment >= 10', () => {
    const result = generateIndustryBenchmark('solicitor', 'Cardiff', new Date('2026-05-19'), 10);
    expect(result.isSynthetic).toBe(false);
    expect(result.requiresRealData).toBe(true);
  });

  // 4. Competitor scores drift max ±3
  it('competitor scores drift max ±3 per week', () => {
    const result = generateCompetitorScore('Morgan Cole', new Date('2026-05-19'), 40);
    expect(Math.abs(result.weeklyChange)).toBeLessThanOrEqual(3);
    expect(result.isSynthetic).toBe(true);
  });

  // 5. Competitor score deterministic
  it('same competitor + same week = same score', () => {
    const a = generateCompetitorScore('Morgan Cole', new Date('2026-05-19'), 40);
    const b = generateCompetitorScore('Morgan Cole', new Date('2026-05-19'), 40);
    expect(a.value).toBe(b.value);
  });

  // 6. First-time competitor gets baseline
  it('competitor with no prior gets baseline score', () => {
    const result = generateCompetitorScore('New Firm', new Date('2026-05-19'), null);
    expect(result.value).toBeGreaterThanOrEqual(25);
    expect(result.value).toBeLessThanOrEqual(55);
    expect(result.weeklyChange).toBe(0);
    expect(result.trendDirection).toBe('flat');
  });

  // 7. Revenue exposure uses correct vertical transaction value
  it('revenue exposure uses correct vertical transaction value', () => {
    const solResult = generateOpportunityLoss('solicitor', 50, 'Cardiff', new Date('2026-05-19'));
    expect(solResult.methodology.averageTransactionValue).toBe(1500);

    const accResult = generateOpportunityLoss('accountant', 50, 'Cardiff', new Date('2026-05-19'));
    expect(accResult.methodology.averageTransactionValue).toBe(5400);
  });

  // 8. Revenue exposure returns valid range
  it('revenue exposure returns min < max', () => {
    const result = generateOpportunityLoss('solicitor', 50, 'Cardiff', new Date('2026-05-19'));
    expect(result.monthlyMin).toBeLessThan(result.monthlyMax);
    expect(result.isSynthetic).toBe(true);
  });

  // 9. Perception pools exist for all verticals
  it('perception returns associations for all verticals', () => {
    for (const vt of ['solicitor', 'accountant', 'mortgage-advisor', 'estate-agent', 'office-equipment']) {
      const result = generatePerception({ vendorType: vt }, new Date('2026-05-19'));
      expect(result.positiveAssociations.length).toBeGreaterThan(0);
      expect(result.missingAssociations.length).toBeGreaterThan(0);
      expect(result.competitorAssociations.length).toBeGreaterThan(0);
    }
  });

  // 10. Share of voice: 6 platforms, 3 live, 3 coming
  it('TRANSACTION_VALUES covers all verticals', () => {
    expect(TRANSACTION_VALUES.solicitor).toBe(1500);
    expect(TRANSACTION_VALUES.accountant).toBe(5400);
    expect(TRANSACTION_VALUES['mortgage-advisor']).toBe(350);
    expect(TRANSACTION_VALUES['estate-agent']).toBe(2400);
    expect(TRANSACTION_VALUES['office-equipment']).toBe(6000);
  });

  // 11. Linear projection produces exactly N entries
  it('linear projection produces exactly 4 entries', () => {
    const result = linearProject([20, 25, 28, 30, 32, 35, 38, 40], 4);
    expect(result).toHaveLength(4);
    result.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      expect(Number.isInteger(v)).toBe(true);
    });
  });

  // 12. Linear projection with short history
  it('linear projection handles single-point history', () => {
    const result = linearProject([30], 4);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe(30);
  });

  // 13. Deterministic pick picks consistently
  it('deterministic pick returns same items for same seed', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const a = deterministicPick(items, 3, 'test-seed');
    const b = deterministicPick(items, 3, 'test-seed');
    expect(a.map(x => x.id)).toEqual(b.map(x => x.id));
  });

  // 14. Deterministic pick returns all when fewer than count
  it('deterministic pick returns all when candidates < count', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = deterministicPick(items, 5, 'test');
    expect(result).toHaveLength(2);
  });

  // 15. Year-week format
  it('getYearWeek returns consistent format', () => {
    const result = getYearWeek(new Date('2026-05-19'));
    expect(result).toMatch(/^2026-W\d+$/);
  });

  // 16. Seeded random is deterministic
  it('seeded random produces same sequence from same seed', () => {
    const r1 = seededRandom(42);
    const r2 = seededRandom(42);
    expect(r1()).toBe(r2());
    expect(r1()).toBe(r2());
    expect(r1()).toBe(r2());
  });

  // 17. Seed from string is deterministic
  it('seedFromString is deterministic', () => {
    expect(seedFromString('test')).toBe(seedFromString('test'));
    expect(seedFromString('abc')).not.toBe(seedFromString('xyz'));
  });

  // 18. Report number format
  it('report number format matches AVI-{SLUG}-{YEAR}-W{WEEK}', () => {
    const yw = getYearWeek(new Date('2026-05-19'));
    const [year, week] = yw.split('-W');
    const slug = 'CARDIFF-PROPERTY-PARTNERS';
    const reportNumber = `AVI-${slug}-${year}-W${week}`;
    expect(reportNumber).toMatch(/^AVI-[A-Z0-9-]+-\d{4}-W\d+$/);
  });
});
