import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const mockCountDocuments = vi.fn();
const mockFind = vi.fn();
const mockAggregate = vi.fn();

vi.mock('../../models/AIMentionScan.js', () => ({
  default: {
    countDocuments: (...args) => mockCountDocuments(...args),
    find: (...args) => mockFind(...args),
    aggregate: (...args) => mockAggregate(...args),
  },
}));

const { countMentions, getMentionData, getMentionDocs, aggregateByPlatform, vendorHasRealScans, getBrowsingFilter } = await import('../../lib/data/vendorMentions.js');
const { BROWSING_PLATFORMS } = await import('../../lib/config/browsingPlatforms.js');

describe('vendorMentions — browsing-only filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountDocuments.mockResolvedValue(0);
    mockFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) });
    mockAggregate.mockResolvedValue([]);
  });

  it('BROWSING_PLATFORMS contains only perplexity', () => {
    expect(BROWSING_PLATFORMS).toEqual(['perplexity']);
  });

  it('BROWSING_PLATFORMS excludes non-browsing models', () => {
    for (const excluded of ['claude', 'claude-haiku', 'chatgpt', 'gemini', 'grok', 'meta']) {
      expect(BROWSING_PLATFORMS).not.toContain(excluded);
    }
  });

  it('getBrowsingFilter returns the aiModel $in filter', () => {
    const f = getBrowsingFilter();
    expect(f).toEqual({ aiModel: { $in: ['perplexity'] } });
  });

  it('countMentions always passes aiModel $in BROWSING_PLATFORMS', async () => {
    await countMentions({ vendorId: new mongoose.Types.ObjectId().toString() });
    expect(mockCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ aiModel: { $in: BROWSING_PLATFORMS } })
    );
  });

  it('countMentions cannot be called without the browsing filter', async () => {
    await countMentions({});
    const call = mockCountDocuments.mock.calls[0][0];
    expect(call.aiModel).toBeDefined();
    expect(call.aiModel.$in).toEqual(BROWSING_PLATFORMS);
  });

  it('getMentionData passes browsing filter to all 4 queries', async () => {
    await getMentionData(new mongoose.Types.ObjectId().toString());
    expect(mockCountDocuments).toHaveBeenCalledTimes(3);
    for (const call of mockCountDocuments.mock.calls) {
      expect(call[0].aiModel).toEqual({ $in: BROWSING_PLATFORMS });
    }
    expect(mockAggregate).toHaveBeenCalledTimes(1);
    const aggMatch = mockAggregate.mock.calls[0][0][0].$match;
    expect(aggMatch.aiModel).toEqual({ $in: BROWSING_PLATFORMS });
  });

  it('getMentionDocs passes browsing filter', async () => {
    await getMentionDocs({ vendorId: new mongoose.Types.ObjectId().toString() });
    const findCall = mockFind.mock.calls[0][0];
    expect(findCall.aiModel).toEqual({ $in: BROWSING_PLATFORMS });
  });

  it('aggregateByPlatform passes browsing filter', async () => {
    await aggregateByPlatform({ vendorId: new mongoose.Types.ObjectId().toString() });
    const aggMatch = mockAggregate.mock.calls[0][0][0].$match;
    expect(aggMatch.aiModel).toEqual({ $in: BROWSING_PLATFORMS });
  });

  it('vendorHasRealScans passes browsing filter', async () => {
    await vendorHasRealScans('abc');
    expect(mockCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ aiModel: { $in: BROWSING_PLATFORMS } })
    );
  });
});
