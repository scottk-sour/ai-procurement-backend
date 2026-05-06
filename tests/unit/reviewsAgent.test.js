import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_PRO = { _id: new mongoose.Types.ObjectId(), company: 'Harrison & Co', tier: 'pro', vendorType: 'solicitor', practiceAreas: ['conveyancing'] };
const VENDOR_FREE = { _id: new mongoose.Types.ObjectId(), company: 'Free Firm', tier: 'free' };

const mockAgentRunCreate = vi.fn();
const mockSendReviewRequestEmail = vi.fn();
const mockVendorLeadFind = vi.fn();
const mockVendorLeadFindOne = vi.fn();
const mockVendorLeadUpdateOne = vi.fn();
const mockReviewFindOne = vi.fn();

vi.mock('../../models/Vendor.js', () => ({ default: { findById: vi.fn(), find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) } }));
vi.mock('../../models/AgentRun.js', () => {
  function M() {}
  M.create = (...args) => mockAgentRunCreate(...args);
  M.normaliseWeekStarting = (d) => { const date = new Date(d); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - (day - 1)); date.setUTCHours(0, 0, 0, 0); return date; };
  return { default: M };
});
vi.mock('../../models/VendorLead.js', () => ({ default: { find: (...args) => mockVendorLeadFind(...args), findOne: (...args) => mockVendorLeadFindOne(...args), updateOne: (...args) => mockVendorLeadUpdateOne(...args) } }));
vi.mock('../../models/Review.js', () => ({ default: { findOne: (...args) => mockReviewFindOne(...args) } }));
vi.mock('../../models/ReviewOptOut.js', () => ({ default: { isOptedOut: vi.fn().mockResolvedValue(false) } }));
vi.mock('../../services/emailService.js', () => ({ sendReviewRequestEmail: (...args) => mockSendReviewRequestEmail(...args) }));
vi.mock('../../services/reviewTokenService.js', () => ({ generateReviewToken: () => 'test-token-abc123' }));

const { default: Vendor } = await import('../../models/Vendor.js');
const { default: ReviewOptOut } = await import('../../models/ReviewOptOut.js');
const { runReviewsForVendor } = await import('../../services/reviewsAgent.js');

function makeLead(email, overrides = {}) {
  return { _id: new mongoose.Types.ObjectId(), vendor: VENDOR_PRO._id, customer: { email, contactName: 'Test', companyName: 'Co' }, service: 'Conveyancing', createdAt: new Date(), ...overrides };
}

describe('Reviews Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    mockAgentRunCreate.mockImplementation(async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data }));
    mockVendorLeadFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) });
    mockVendorLeadFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockVendorLeadUpdateOne.mockResolvedValue({});
    mockReviewFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockSendReviewRequestEmail.mockResolvedValue({ success: true });
  });

  it('fails for non-Pro vendor', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_FREE) }) });
    const result = await runReviewsForVendor(VENDOR_FREE._id);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('not_pro_tier');
  });

  it('returns partial when no eligible leads', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const result = await runReviewsForVendor(VENDOR_PRO._id);
    expect(result.status).toBe('partial');
    expect(result.artifacts.sent).toBe(0);
  });

  it('sends 5 review requests on happy path', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const leads = Array.from({ length: 5 }, (_, i) => makeLead(`client${i}@example.com`));
    mockVendorLeadFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leads) }) }) });

    const result = await runReviewsForVendor(VENDOR_PRO._id);

    expect(result.status).toBe('completed');
    expect(result.artifacts.sent).toBe(5);
    expect(mockSendReviewRequestEmail).toHaveBeenCalledTimes(5);
    expect(mockVendorLeadUpdateOne).toHaveBeenCalledTimes(5);
  });

  it('skips opted-out recipients', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const leads = [makeLead('optedout@example.com'), makeLead('ok@example.com')];
    mockVendorLeadFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leads) }) }) });
    ReviewOptOut.isOptedOut.mockImplementation(async (email) => email === 'optedout@example.com');

    const result = await runReviewsForVendor(VENDOR_PRO._id);

    expect(result.artifacts.sent).toBe(1);
    expect(result.artifacts.skipped.optedOut).toBe(1);
  });

  it('skips recipients who left a review in last 30 days', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const leads = [makeLead('reviewed@example.com')];
    mockVendorLeadFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leads) }) }) });
    mockReviewFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'exists' }) });

    const result = await runReviewsForVendor(VENDOR_PRO._id);

    expect(result.artifacts.sent).toBe(0);
    expect(result.artifacts.skipped.alreadyReviewed).toBe(1);
  });

  it('skips recipients asked in last 30 days (cooldown)', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const leads = [makeLead('recent@example.com')];
    mockVendorLeadFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leads) }) }) });
    mockVendorLeadFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'exists' }) });

    const result = await runReviewsForVendor(VENDOR_PRO._id);

    expect(result.artifacts.sent).toBe(0);
    expect(result.artifacts.skipped.cooldown).toBe(1);
  });

  it('caps at maxPerWeek even with more eligible leads', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const leads = Array.from({ length: 8 }, (_, i) => makeLead(`client${i}@example.com`));
    mockVendorLeadFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leads) }) }) });

    const result = await runReviewsForVendor(VENDOR_PRO._id, { maxPerWeek: 3 });

    expect(result.artifacts.sent).toBe(3);
    expect(mockSendReviewRequestEmail).toHaveBeenCalledTimes(3);
  });

  it('continues on send failure', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const leads = Array.from({ length: 3 }, (_, i) => makeLead(`client${i}@example.com`));
    mockVendorLeadFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leads) }) }) });
    mockSendReviewRequestEmail
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('Resend error'))
      .mockResolvedValueOnce({ success: true });

    const result = await runReviewsForVendor(VENDOR_PRO._id);

    expect(result.artifacts.sent).toBe(2);
    expect(result.artifacts.sendErrors).toBe(1);
  });

  it('dryRun skips DB writes and email sends', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const leads = [makeLead('dry@example.com')];
    mockVendorLeadFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(leads) }) }) });

    const result = await runReviewsForVendor(VENDOR_PRO._id, { dryRun: true });

    expect(result.artifacts.sent).toBe(1);
    expect(result.artifacts.dryRun).toBe(true);
    expect(mockSendReviewRequestEmail).not.toHaveBeenCalled();
    expect(mockVendorLeadUpdateOne).not.toHaveBeenCalled();
  });

  it('artifacts has legacy shape', async () => {
    Vendor.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }) });
    const result = await runReviewsForVendor(VENDOR_PRO._id);
    expect(result.artifacts.gapsIdentified).toBe(0);
    expect(result.artifacts.gaps).toEqual([]);
    expect(result.artifacts.competitorsAbove).toEqual([]);
  });
});
