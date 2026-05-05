import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_PRO = {
  _id: new mongoose.Types.ObjectId(), company: 'Harrison & Co', tier: 'pro',
  vendorType: 'solicitor', sraNumber: '123456',
  location: { city: 'Saffron Walden' }, contactInfo: { phone: '01onal', website: 'https://harrison.co.uk' },
  email: 'info@harrison.co.uk', businessProfile: { description: 'Solicitors' },
};
const VENDOR_FREE = { _id: new mongoose.Types.ObjectId(), company: 'Free Firm', tier: 'free', vendorType: 'solicitor' };
const VENDOR_PLACEHOLDER = {
  _id: new mongoose.Types.ObjectId(), company: 'TendorAI Demo Firm', tier: 'pro',
  vendorType: 'solicitor', location: { city: 'Cardiff' },
  contactInfo: { website: 'https://test.example.com' }, email: 'demo@placeholder.tendorai.com',
};
const VENDOR_MISSING = {
  _id: new mongoose.Types.ObjectId(), company: 'No Contact', tier: 'pro',
  vendorType: 'solicitor', location: { city: 'London' }, contactInfo: {},
  email: 'x@y.com',
};

const mockAgentRunCreate = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockCreateApproval = vi.fn();
const mockSubmitBing = vi.fn();

vi.mock('../../models/Vendor.js', () => ({
  default: { findById: vi.fn(), find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) },
}));
vi.mock('../../models/AgentRun.js', () => {
  function M() {}
  M.create = (...args) => mockAgentRunCreate(...args);
  M.normaliseWeekStarting = (d) => {
    const date = new Date(d); const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - (day - 1)); date.setUTCHours(0, 0, 0, 0); return date;
  };
  return { default: M };
});
vi.mock('../../models/DirectoryListing.js', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: (...args) => mockFindOneAndUpdate(...args) },
}));
vi.mock('../../services/approvalQueue.js', () => ({
  createApproval: (...args) => mockCreateApproval(...args),
}));
vi.mock('../../services/directoryAdapters/bingPlaces.js', () => ({
  submitToBingPlaces: (...args) => mockSubmitBing(...args),
}));

const { default: Vendor } = await import('../../models/Vendor.js');
const { default: DirectoryListing } = await import('../../models/DirectoryListing.js');
const { runListingsForVendor } = await import('../../services/listingsAgent.js');

describe('Listings Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentRunCreate.mockImplementation(async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data }));
    DirectoryListing.findOne.mockResolvedValue(null);
    mockFindOneAndUpdate.mockImplementation(async (q, u) => ({ _id: new mongoose.Types.ObjectId(), ...u }));
    mockCreateApproval.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    mockSubmitBing.mockResolvedValue({ success: true, listingUrl: 'https://bing.com/listing/123' });
  });

  it('fails for non-Pro vendor', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_FREE) });
    const result = await runListingsForVendor(VENDOR_FREE._id);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('not_pro_tier');
  });

  it('fails for placeholder data', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PLACEHOLDER) });
    const result = await runListingsForVendor(VENDOR_PLACEHOLDER._id);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('placeholder_data');
  });

  it('fails for missing required fields', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_MISSING) });
    const result = await runListingsForVendor(VENDOR_MISSING._id);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('missing_required_fields');
  });

  it('creates 4 DirectoryListings + 3 ApprovalQueue items + AgentRun on happy path', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });

    const result = await runListingsForVendor(VENDOR_PRO._id);

    expect(result.status).toBe('completed');
    expect(mockSubmitBing).toHaveBeenCalledOnce();
    expect(mockCreateApproval).toHaveBeenCalledTimes(3);
    expect(mockFindOneAndUpdate).toHaveBeenCalled();
    expect(result.summary).toContain('automated');
    expect(result.summary).toContain('concierge');
  });

  it('skips directories already live', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    DirectoryListing.findOne.mockResolvedValue({ status: 'live', directory: 'bing_places' });

    const result = await runListingsForVendor(VENDOR_PRO._id);

    expect(mockSubmitBing).not.toHaveBeenCalled();
  });

  it('skips failed directories at max retries', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    DirectoryListing.findOne.mockResolvedValue({ status: 'failed', retryCount: 3 });

    const result = await runListingsForVendor(VENDOR_PRO._id);
    expect(result.summary).toContain('skipped');
  });

  it('sets law_society live for solicitor with SRA number', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });

    await runListingsForVendor(VENDOR_PRO._id);

    const regCall = mockFindOneAndUpdate.mock.calls.find(c => c[0]?.directory === 'law_society');
    expect(regCall).toBeDefined();
    expect(regCall[1].status).toBe('live');
    expect(regCall[1].submissionMethod).toBe('auto_regulatory');
  });

  it('AgentRun artifacts has legacy shape', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });

    const result = await runListingsForVendor(VENDOR_PRO._id);

    expect(result.artifacts.gapsIdentified).toBe(0);
    expect(result.artifacts.gaps).toEqual([]);
    expect(result.artifacts.competitorsAbove).toEqual([]);
  });
});
