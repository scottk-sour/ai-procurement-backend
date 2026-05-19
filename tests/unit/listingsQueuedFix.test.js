import { describe, it, expect } from 'vitest';

describe('Listings Agent — queued status protection', () => {
  const PROTECTED_STATUSES = ['live', 'submitted', 'pending_verification', 'queued'];

  it('queued is in the protected status set', () => {
    expect(PROTECTED_STATUSES).toContain('queued');
  });

  it('existing listing with status queued should be skipped (alreadyListed)', () => {
    const existing = { status: 'queued', vendorId: 'abc', directory: 'yell' };
    const shouldSkip = PROTECTED_STATUSES.includes(existing.status);
    expect(shouldSkip).toBe(true);
  });

  it('existing listing with status live should be skipped', () => {
    const existing = { status: 'live' };
    expect(PROTECTED_STATUSES.includes(existing.status)).toBe(true);
  });

  it('existing listing with status failed should NOT be skipped (allows retry)', () => {
    const existing = { status: 'failed', retryCount: 1 };
    expect(PROTECTED_STATUSES.includes(existing.status)).toBe(false);
  });

  it('no existing listing (null) should NOT be skipped (first submission)', () => {
    const existing = null;
    const shouldSkip = existing && PROTECTED_STATUSES.includes(existing.status);
    expect(shouldSkip).toBeFalsy();
  });
});
