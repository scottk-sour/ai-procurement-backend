import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_PRO = {
  _id: new mongoose.Types.ObjectId(), company: 'Harrison & Co', tier: 'pro',
  vendorType: 'solicitor', sraNumber: '123456',
  location: { city: 'Saffron Walden', address: '10 High St', postcode: 'CB11 4AA' },
  contactInfo: { phone: '01234 567890', website: 'https://harrison.co.uk' },
  email: 'info@harrison.co.uk',
};
const VENDOR_FREE = { _id: new mongoose.Types.ObjectId(), company: 'Free Firm', tier: 'free', vendorType: 'solicitor' };
const VENDOR_PLACEHOLDER = {
  _id: new mongoose.Types.ObjectId(), company: 'TendorAI Demo Firm', tier: 'pro',
  vendorType: 'solicitor', location: { city: 'Cardiff' },
  contactInfo: { website: 'https://test.example.com' }, email: 'demo@placeholder.tendorai.com',
};

const mockAgentRunCreate = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockFindOne = vi.fn();

const mockCheckYell = vi.fn();
const mockCheckFreeindex = vi.fn();
const mockCheckCylex = vi.fn();
const mockCheckThomson = vi.fn();

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
  checkPresence: (...args) => mockCheckYell(...args),
}));
vi.mock('../../services/listings/directoryAdapters/freeindex.js', () => ({
  checkPresence: (...args) => mockCheckFreeindex(...args),
}));
vi.mock('../../services/listings/directoryAdapters/cylex.js', () => ({
  checkPresence: (...args) => mockCheckCylex(...args),
}));
vi.mock('../../services/listings/directoryAdapters/thomsonLocal.js', () => ({
  checkPresence: (...args) => mockCheckThomson(...args),
}));

const { default: Vendor } = await import('../../models/Vendor.js');
const { runListingsForVendor } = await import('../../services/listingsAgent.js');

function makeAdapterResult(directory, found, opts = {}) {
  return {
    directory, found,
    confidence: found === true ? 1.0 : 0,
    listingUrl: found === true ? `https://${directory}.com/listing` : null,
    scraped: found === true ? { name: 'Harrison & Co', address: '10 High St', postcode: 'CB11 4AA', phone: '01234 567890' } : null,
    error: opts.error || null,
  };
}

describe('Listings Agent (audit mode)', () => {
  let savedEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv = process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED;
    mockAgentRunCreate.mockImplementation(async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data }));
    mockFindOneAndUpdate.mockImplementation(async (q, u) => ({ _id: new mongoose.Types.ObjectId(), ...u }));
    mockFindOne.mockResolvedValue(null);
    mockCheckYell.mockResolvedValue(makeAdapterResult('yell', true));
    mockCheckFreeindex.mockResolvedValue(makeAdapterResult('freeindex', null, { error: 'no matching candidate in parsed results' }));
    mockCheckCylex.mockResolvedValue(makeAdapterResult('cylex', null, { error: 'HTTP 403' }));
    mockCheckThomson.mockResolvedValue(makeAdapterResult('thomson_local', true));
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
    expect(mockCheckYell).not.toHaveBeenCalled();
  });

  it('rejects placeholder/demo vendor before any adapter runs', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PLACEHOLDER) });
    const result = await runListingsForVendor(VENDOR_PLACEHOLDER._id);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('placeholder_data');
    expect(mockCheckYell).not.toHaveBeenCalled();
    expect(mockCheckFreeindex).not.toHaveBeenCalled();
  });

  it('skips scraping when LISTINGS_DIRECTORY_SCRAPE_ENABLED is not true', async () => {
    delete process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED;
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    const result = await runListingsForVendor(VENDOR_PRO._id);

    expect(mockCheckYell).not.toHaveBeenCalled();
    expect(mockCheckFreeindex).not.toHaveBeenCalled();
    expect(mockCheckCylex).not.toHaveBeenCalled();
    expect(mockCheckThomson).not.toHaveBeenCalled();

    // Regulatory check still runs
    const regCall = mockFindOneAndUpdate.mock.calls.find(c => c[0]?.directory === 'law_society');
    expect(regCall).toBeDefined();
    expect(regCall[1].status).toBe('found');
    expect(result.artifacts.checked).toBe(1);
    expect(result.artifacts.found).toBe(1);
  });

  it('runs all 4 adapters + regulatory check when scrape enabled', async () => {
    process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED = 'true';
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    const result = await runListingsForVendor(VENDOR_PRO._id);

    expect(mockCheckYell).toHaveBeenCalledOnce();
    expect(mockCheckFreeindex).toHaveBeenCalledOnce();
    expect(mockCheckCylex).toHaveBeenCalledOnce();
    expect(mockCheckThomson).toHaveBeenCalledOnce();

    expect(result.artifacts.checked).toBe(5);
    expect(result.artifacts.found).toBe(3);
    expect(result.artifacts.undetermined).toBe(2);
  });

  it('emits no hard absence finding (adapters never return found:false)', async () => {
    process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED = 'true';
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    const result = await runListingsForVendor(VENDOR_PRO._id);
    const findings = result.artifacts.findings;

    const notFoundFindings = findings.filter(f => f.category === 'directory_presence' && f.evidence.includes('Not found'));
    expect(notFoundFindings.length).toBe(0);

    const hardAbsenceFindings = findings.filter(f =>
      f.severity === 'high' && f.evidence.toLowerCase().includes('not listed'),
    );
    expect(hardAbsenceFindings.length).toBe(0);
  });

  it('upserts DirectoryListing with audit fields when scrape enabled', async () => {
    process.env.LISTINGS_DIRECTORY_SCRAPE_ENABLED = 'true';
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    await runListingsForVendor(VENDOR_PRO._id);

    const yellCall = mockFindOneAndUpdate.mock.calls.find(c => c[0]?.directory === 'yell');
    expect(yellCall).toBeDefined();
    expect(yellCall[1].auditMode).toBe(true);
    expect(yellCall[1].status).toBe('found');
    expect(yellCall[1].lastCheckedAt).toBeInstanceOf(Date);
  });
});
