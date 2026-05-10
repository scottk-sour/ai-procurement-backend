import { describe, it, expect, vi } from 'vitest';

vi.mock('../../models/AgentRun.js', () => ({
  default: {
    normaliseWeekStarting: (d) => {
      const date = new Date(d);
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - (day - 1));
      date.setUTCHours(0, 0, 0, 0);
      return date;
    },
  },
}));

const { parseArgs, resolveWeeks } = await import('../../scripts/backfill-weekly-reports.js');

describe('backfill-weekly-reports', () => {
  describe('parseArgs', () => {
    it('returns defaults with no flags', () => {
      const args = parseArgs(['node', 'script.js']);
      expect(args.dryRun).toBe(false);
      expect(args.weeks).toBe(4);
      expect(args.vendor).toBeNull();
      expect(args.tier).toBeNull();
      expect(args.help).toBe(false);
    });

    it('parses --dry-run', () => {
      const args = parseArgs(['node', 'script.js', '--dry-run']);
      expect(args.dryRun).toBe(true);
    });

    it('parses --weeks=N', () => {
      const args = parseArgs(['node', 'script.js', '--weeks=8']);
      expect(args.weeks).toBe(8);
    });

    it('clamps --weeks to 4 if out of range', () => {
      expect(parseArgs(['node', 'script.js', '--weeks=0']).weeks).toBe(4);
      expect(parseArgs(['node', 'script.js', '--weeks=20']).weeks).toBe(4);
      expect(parseArgs(['node', 'script.js', '--weeks=-1']).weeks).toBe(4);
    });

    it('parses --vendor=<id>', () => {
      const args = parseArgs(['node', 'script.js', '--vendor=64a1b2c3d4e5f6a7b8c9d0e1']);
      expect(args.vendor).toBe('64a1b2c3d4e5f6a7b8c9d0e1');
    });

    it('parses --tier=<tier>', () => {
      const args = parseArgs(['node', 'script.js', '--tier=managed']);
      expect(args.tier).toBe('managed');
    });

    it('parses --help', () => {
      expect(parseArgs(['node', 'script.js', '--help']).help).toBe(true);
      expect(parseArgs(['node', 'script.js', '-h']).help).toBe(true);
    });

    it('handles multiple flags combined', () => {
      const args = parseArgs(['node', 'script.js', '--dry-run', '--weeks=6', '--vendor=abc123']);
      expect(args.dryRun).toBe(true);
      expect(args.weeks).toBe(6);
      expect(args.vendor).toBe('abc123');
    });
  });

  describe('resolveWeeks', () => {
    it('returns N consecutive Mondays in ascending order', () => {
      const weeks = resolveWeeks(4);
      expect(weeks).toHaveLength(4);
      for (const w of weeks) {
        expect(w.getUTCDay()).toBe(1);
        expect(w.getUTCHours()).toBe(0);
        expect(w.getUTCMinutes()).toBe(0);
      }
    });

    it('weeks are 7 days apart', () => {
      const weeks = resolveWeeks(4);
      for (let i = 1; i < weeks.length; i++) {
        const diff = weeks[i].getTime() - weeks[i - 1].getTime();
        expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
      }
    });

    it('last week is the current or most recent Monday', () => {
      const weeks = resolveWeeks(1);
      expect(weeks).toHaveLength(1);
      expect(weeks[0].getUTCDay()).toBe(1);
      const now = new Date();
      expect(weeks[0].getTime()).toBeLessThanOrEqual(now.getTime());
    });

    it('ascending order — first element is the oldest Monday', () => {
      const weeks = resolveWeeks(4);
      for (let i = 1; i < weeks.length; i++) {
        expect(weeks[i].getTime()).toBeGreaterThan(weeks[i - 1].getTime());
      }
    });
  });
});
