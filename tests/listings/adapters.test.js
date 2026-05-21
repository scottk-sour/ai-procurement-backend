import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/listings/directoryAdapters/_shared.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    randomDelay: vi.fn().mockResolvedValue(undefined),
    fetchWithTimeout: vi.fn(),
  };
});

const { fetchWithTimeout } = await import('../../services/listings/directoryAdapters/_shared.js');

const CANONICAL = {
  name: 'Harrison & Co Solicitors',
  address: '10 High Street, Saffron Walden',
  postcode: 'CB11 4AA',
  phone: '01234 567890',
  website: 'https://harrison.co.uk',
};

function makeHtmlWithMatch(nameInListing, postcode) {
  return `
    <div class="businessCapsule--mainRow">
      <div class="businessCapsule--inner">
        <div class="businessCapsule--details">
          <h2><a class="businessCapsule--name" href="/biz/harrison-123">  ${nameInListing}  </a></h2>
          <span class="address">${postcode ? `10 High Street, ${postcode}` : '10 High Street'}</span>
          <span class="telephone">01234 567890</span>
        </div>
      </div>
    </div>
  `;
}

function makeEmptyHtml() {
  return '<html><body><div class="noResults">No results found</div></body></html>';
}

describe('Yell adapter', () => {
  let checkPresence;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../services/listings/directoryAdapters/yell.js');
    checkPresence = mod.checkPresence;
  });

  it('returns found:true when name + postcode match', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, text: async () => makeHtmlWithMatch('Harrison & Co Solicitors', 'CB11 4AA') });
    const result = await checkPresence(CANONICAL);
    expect(result.directory).toBe('yell');
    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.scraped).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it('returns found:null when no candidates match (never asserts absence)', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, text: async () => makeEmptyHtml() });
    const result = await checkPresence(CANONICAL);
    expect(result.directory).toBe('yell');
    expect(result.found).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('returns found:null on HTTP error', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: false, status: 403, text: async () => '' });
    const result = await checkPresence(CANONICAL);
    expect(result.directory).toBe('yell');
    expect(result.found).toBeNull();
    expect(result.error).toContain('403');
  });

  it('returns found:null on fetch throw (timeout)', async () => {
    fetchWithTimeout.mockRejectedValue(new Error('AbortError: timeout'));
    const result = await checkPresence(CANONICAL);
    expect(result.found).toBeNull();
    expect(result.error).toContain('timeout');
  });
});

describe('FreeIndex adapter', () => {
  let checkPresence;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../services/listings/directoryAdapters/freeindex.js');
    checkPresence = mod.checkPresence;
  });

  it('returns found:null on fetch error', async () => {
    fetchWithTimeout.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await checkPresence(CANONICAL);
    expect(result.directory).toBe('freeindex');
    expect(result.found).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('returns found:null on empty results page (never asserts absence)', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, text: async () => '<html><body>No results</body></html>' });
    const result = await checkPresence(CANONICAL);
    expect(result.found).toBeNull();
  });
});

describe('Cylex adapter', () => {
  let checkPresence;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../services/listings/directoryAdapters/cylex.js');
    checkPresence = mod.checkPresence;
  });

  it('returns found:null on HTTP 503', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    const result = await checkPresence(CANONICAL);
    expect(result.directory).toBe('cylex');
    expect(result.found).toBeNull();
  });
});

describe('Thomson Local adapter', () => {
  let checkPresence;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../services/listings/directoryAdapters/thomsonLocal.js');
    checkPresence = mod.checkPresence;
  });

  it('returns found:null on network error', async () => {
    fetchWithTimeout.mockRejectedValue(new Error('ENOTFOUND'));
    const result = await checkPresence(CANONICAL);
    expect(result.directory).toBe('thomson_local');
    expect(result.found).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
