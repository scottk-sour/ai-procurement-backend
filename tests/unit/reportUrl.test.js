import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildReportUrl } from '../../lib/utils/reportUrl.js';

describe('buildReportUrl', () => {
  const origEnv = process.env.FRONTEND_URL;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = origEnv;
  });

  it('uses /ai-visibility-report/results/ path', () => {
    const url = buildReportUrl('abc123');
    expect(url).toContain('/ai-visibility-report/results/abc123');
    expect(url).not.toContain('/aeo-report/');
  });

  it('defaults to tendorai.com when FRONTEND_URL unset', () => {
    delete process.env.FRONTEND_URL;
    expect(buildReportUrl('x')).toBe('https://www.tendorai.com/ai-visibility-report/results/x');
  });

  it('respects FRONTEND_URL env var', () => {
    process.env.FRONTEND_URL = 'https://staging.tendorai.com';
    expect(buildReportUrl('r1')).toBe('https://staging.tendorai.com/ai-visibility-report/results/r1');
  });
});
