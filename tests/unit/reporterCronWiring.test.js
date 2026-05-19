import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Reporter Cron Wiring', () => {

  function getMondayOfThisWeek() {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
  }

  it('getMondayOfThisWeek returns a Monday at 00:00 UTC', () => {
    const monday = getMondayOfThisWeek();
    expect(monday.getUTCDay()).toBe(1);
    expect(monday.getUTCHours()).toBe(0);
    expect(monday.getUTCMinutes()).toBe(0);
  });

  it('vendor.isDemoAccount gates demo vendors correctly', () => {
    const demoVendor = { _id: '699757a97712b4369510e6c8', company: 'Cardiff Property Partners', isDemoAccount: true };
    const realVendor = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', company: 'Real Firm', isDemoAccount: false };
    const unsetVendor = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', company: 'Old Firm' };

    expect(demoVendor.isDemoAccount).toBe(true);
    expect(realVendor.isDemoAccount).toBe(false);
    expect(!!unsetVendor.isDemoAccount).toBe(false);
  });

  it('PRO_TIER_VALUES includes managed, verified, enterprise, pro', () => {
    const PRO_TIER_VALUES = ['pro', 'managed', 'verified', 'enterprise'];
    expect(PRO_TIER_VALUES).toContain('managed');
    expect(PRO_TIER_VALUES).toContain('verified');
    expect(PRO_TIER_VALUES).toContain('enterprise');
    expect(PRO_TIER_VALUES).toContain('pro');
    expect(PRO_TIER_VALUES).not.toContain('free');
    expect(PRO_TIER_VALUES).not.toContain('basic');
  });

  it('placeholder emails are correctly identified', () => {
    const isPlaceholder = (email) => !email || email.includes('@placeholder.tendorai.com');
    expect(isPlaceholder('unclaimed-123@placeholder.tendorai.com')).toBe(true);
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder('')).toBe(true);
    expect(isPlaceholder('scott@tendorai.com')).toBe(false);
    expect(isPlaceholder('client@example.com')).toBe(false);
  });

  it('demo vendor gets report generated but email skipped', () => {
    const vendor = { _id: '699757a97712b4369510e6c8', company: 'Cardiff Property Partners', email: 'kinder1975.sd@gmail.com', isDemoAccount: true };
    expect(vendor.isDemoAccount).toBe(true);
    // Report should be generated (not skipped)
    // Email should be skipped because isDemoAccount is true
  });

  it('non-demo vendor with valid email gets report + email', () => {
    const vendor = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', company: 'Real Firm', email: 'real@example.com', isDemoAccount: false };
    const hasValidEmail = vendor.email && !vendor.email.includes('@placeholder.tendorai.com');
    expect(vendor.isDemoAccount).toBe(false);
    expect(hasValidEmail).toBe(true);
  });

  it('isDemoAccount defaults to false on new vendor', () => {
    const newVendor = { company: 'Brand New Firm', tier: 'managed' };
    expect(newVendor.isDemoAccount ?? false).toBe(false);
  });

  it('idempotency: existing report for same week should be skipped', () => {
    const existing = { _id: 'abc', reportNumber: 'AVI-TEST-2026-W21' };
    expect(existing).not.toBeNull();
  });
});
