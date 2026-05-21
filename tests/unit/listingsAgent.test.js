import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_PRO = {
  _id: new mongoose.Types.ObjectId(), company: 'Harrison & Co', tier: 'pro',
  vendorType: 'solicitor', sraNumber: '123456',
  location: { city: 'Saffron Walden', address: '10 High St', postcode: 'CB11 4AA' },
  contactInfo: { phone: '01234 567890', website: 'https://harrison.co.uk' },
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
  vendorType: 'solicitor', location: {},
  contactInfo: {}, email: 'x@y.com',
};

const mockAgentRunCreate = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockFindOne = vi.fn();

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
  default: {
    findOne: (...args) => { const val = mockFindOne(...args); return { lean: () => val }; },
    findOneAndUpdate: (...args) => mockFindOneAndUpdate(...args),
  },
}));
vi.mock('../../services/listings/directoryAdapters/yell.js', () => ({
  checkPresence: vi.fn().mockResolvedValue({ directory: 'yell', found: true, confidence: 1.0, listingUrl: null, scraped: { name: 'Harrison & Co', address: '', postcode: 'CB11 4AA', phone: '01234 567890' }, error: null }),
}));
vi.mock('../../services/listings/directoryAdapters/freeindex.js', () => ({
  checkPresence: vi.fn().mockResolvedValue({ directory: 'freeindex', found: true, confidence: 1.0, listingUrl: null, scraped: { name: 'Harrison & Co', address: '', postcode: 'CB11 4AA', phone: '' }, error: null }),
}));
vi.mock('../../services/listings/directoryAdapters/cylex.js', () => ({
  checkPresence: vi.fn().mockResolvedValue({ directory: 'cylex', found: true, confidence: 1.0, listingUrl: null, scraped: { name: 'Harrison & Co', address: '', postcode: 'CB11 4AA', phone: '' }, error: null }),
}));
vi.mock('../../services/listings/directoryAdapters/thomsonLocal.js', () => ({
  checkPresence: vi.fn().mockResolvedValue({ directory: 'thomson_local', found: true, confidence: 1.0, listingUrl: null, scraped: { name: 'Harrison & Co', address: '', postcode: 'CB11 4AA', phone: '' }, error: null }),
}));

const { default: Vendor } = await import('../../models/Vendor.js');
const { runListingsForVendor } = await import('../../services/listingsAgent.js');

describe('Listings Agent', () => {
  let savedEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv = process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED;
    delete process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED;
    mockAgentRunCreate.mockImplementation(async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data }));
    mockFindOneAndUpdate.mockImplementation(async (q, u) => ({ _id: new mongoose.Types.ObjectId(), ...u }));
    mockFindOne.mockResolvedValue(null);
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED;
    else process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED = savedEnv;
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

  it('sets law_society found for solicitor with SRA number', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    await runListingsForVendor(VENDOR_PRO._id);

    const regCall = mockFindOneAndUpdate.mock.calls.find(c => c[0]?.directory === 'law_society');
    expect(regCall).toBeDefined();
    expect(regCall[1].status).toBe('found');
    expect(regCall[1].auditMode).toBe(true);
    expect(regCall[1].presenceConfidence).toBe(1.0);
  });

  it('AgentRun artifacts has expected audit shape', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    const result = await runListingsForVendor(VENDOR_PRO._id);

    expect(result.artifacts.checked).toBeGreaterThan(0);
    expect(result.artifacts.found).toBeGreaterThan(0);
    expect(result.artifacts.gapsIdentified).toBeDefined();
    expect(result.artifacts.competitorsAbove).toEqual([]);
  });
});
