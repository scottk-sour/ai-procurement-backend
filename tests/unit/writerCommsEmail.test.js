import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { buildWeeklyEmailHTML } from '../../services/reporter/emailBuilder.js';

const VENDOR = {
  _id: new mongoose.Types.ObjectId(),
  company: 'Harrison & Co',
  location: { city: 'Cardiff' },
};

function makeReport(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    reportNumber: 'AVI-HARRISON-CO-2026-W21',
    scoreHeader: { currentScore: 35, weeklyChange: 3 },
    weekEndDate: new Date('2026-05-24T23:59:59.999Z'),
    competitors: [
      { firmName: 'Jones Law', citationCount: 5, isYou: false },
      { firmName: 'Harrison & Co', citationCount: 2, isYou: true },
    ],
    recommendedActions: overrides.recommendedActions ?? [
      { title: 'Draft: Conveyancing Costs Guide', estimatedImpact: 7 },
      { title: 'Draft: What to Expect', estimatedImpact: 6 },
    ],
    ...overrides,
  };
}

describe('Weekly Report Email — writer comms', () => {
  it('pending-approval line includes link to approvals page', () => {
    const html = buildWeeklyEmailHTML(VENDOR, makeReport());
    expect(html).toContain('vendor-dashboard/approvals');
    expect(html).toContain('Review &amp; approve');
    expect(html).toContain('2</strong> high-impact fix');
  });

  it('links to approvals with an <a> tag', () => {
    const html = buildWeeklyEmailHTML(VENDOR, makeReport());
    const match = html.match(/<a[^>]*vendor-dashboard\/approvals[^>]*>/);
    expect(match).toBeTruthy();
  });

  it('no pending-approval line when zero actions', () => {
    const html = buildWeeklyEmailHTML(VENDOR, makeReport({ recommendedActions: [] }));
    expect(html).not.toContain('pending your approval');
    expect(html).not.toContain('vendor-dashboard/approvals');
  });

  it('single action uses singular "fix" not "fixes"', () => {
    const html = buildWeeklyEmailHTML(VENDOR, makeReport({
      recommendedActions: [{ title: 'Draft: Guide', estimatedImpact: 7 }],
    }));
    expect(html).toContain('1</strong> high-impact fix ');
    expect(html).not.toContain('fixes');
  });
});
