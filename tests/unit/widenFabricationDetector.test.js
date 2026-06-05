import { describe, it, expect } from 'vitest';
import { detectPossibleFabrication } from '../../services/contentPlanner/writerGuards.js';

describe('detectPossibleFabrication — attribution fabrication', () => {
  const mustFlag = [
    ['Propertymark + days', 'Propertymark data shows that accurate initial valuations reduce time on market by an average of 15 days.'],
    ['Rightmove analytics + %', 'Rightmove analytics indicate Cardiff properties generate 40% more enquiries than basic listings.'],
    ['Rightmove data + %', "Rightmove data shows Cardiff's spring market generates 35% more buyer enquiries than winter months."],
    ['NAEA research + %', 'NAEA Propertymark research identifies five accelerators; properties sell 30% faster.'],
    ['TPO data + %', 'TPO data identifies six delay factors. Chain complications account for 40% of extended timelines.'],
    ['TPO reports + %', 'The Property Ombudsman reports unrealistic expectations cause 30% of estate agency complaints.'],
    ['Land Registry + weeks', 'HM Land Registry data shows 8-12 weeks is typical for residential transactions in Wales.'],
  ];

  for (const [label, text] of mustFlag) {
    it(`flags: ${label}`, () => {
      const flagged = detectPossibleFabrication(text);
      expect(flagged.length, `Expected "${text}" to be flagged`).toBeGreaterThan(0);
    });
  }

  const mustNotFlag = [
    ['qualitative — no number', 'Industry experience suggests online conveyancing has grown sharply since 2020.'],
    ['qualitative — no stat', 'Regulatory guidance emphasises accurate pricing, though outcomes vary.'],
    ['qualitative — vague', 'Most Cardiff house sales complete within a few months.'],
  ];

  for (const [label, text] of mustNotFlag) {
    it(`clean: ${label}`, () => {
      const flagged = detectPossibleFabrication(text);
      const fabrication = flagged.filter(f => f.body);
      expect(fabrication.length, `Expected "${text}" to NOT be flagged`).toBe(0);
    });
  }
});

describe('detectFirmPerformanceClaims', () => {
  it('flags firm performance claim with number', async () => {
    const { detectFirmPerformanceClaims } = await import('../../services/contentPlanner/writerGuards.js');
    const flagged = detectFirmPerformanceClaims('Cardiff Property Partners sold 87 properties in the last year.', 'Cardiff Property Partners');
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('flags achieved + transactions claim', async () => {
    const { detectFirmPerformanceClaims } = await import('../../services/contentPlanner/writerGuards.js');
    const flagged = detectFirmPerformanceClaims('We achieved 98% of asking prices across 87 transactions.', 'Test Firm');
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('does not flag placeholder tokens', async () => {
    const { detectFirmPerformanceClaims } = await import('../../services/contentPlanner/writerGuards.js');
    const text = 'We sold [FIRM_DATA: propertiesSoldThisYear | Number of properties sold] properties last year.';
    const flagged = detectFirmPerformanceClaims(text, 'Test Firm');
    expect(flagged.length).toBe(0);
  });

  it('does not flag qualitative text with no number', async () => {
    const { detectFirmPerformanceClaims } = await import('../../services/contentPlanner/writerGuards.js');
    const flagged = detectFirmPerformanceClaims('We handle residential sales across Cardiff.', 'Test Firm');
    expect(flagged.length).toBe(0);
  });
});
