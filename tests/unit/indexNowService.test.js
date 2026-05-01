import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { pingBingIndexNow } = await import('../../services/indexNowService.js');

describe('IndexNow Service', () => {
  const originalKey = process.env.INDEXNOW_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.INDEXNOW_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.INDEXNOW_KEY = originalKey;
    } else {
      delete process.env.INDEXNOW_KEY;
    }
    globalThis.fetch = originalFetch;
  });

  it('returns ok: true on successful ping (202)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 202, text: () => Promise.resolve('') });

    const result = await pingBingIndexNow(['https://tendorai.com/resources/test-post']);

    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.indexnow.org/indexnow',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.host).toBe('tendorai.com');
    expect(body.key).toBe('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    expect(body.urlList).toEqual(['https://tendorai.com/resources/test-post']);
  });

  it('returns ok: true on 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });

    const result = await pingBingIndexNow(['https://tendorai.com/resources/test']);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok: false with error on HTTP 400', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('Bad request') });

    const result = await pingBingIndexNow(['https://tendorai.com/resources/test']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('400');
  });

  it('returns ok: false with error on fetch throw', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const result = await pingBingIndexNow(['https://tendorai.com/resources/test']);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Network timeout');
  });

  it('returns ok: false without making network call when INDEXNOW_KEY missing', async () => {
    delete process.env.INDEXNOW_KEY;
    globalThis.fetch = vi.fn();

    const result = await pingBingIndexNow(['https://tendorai.com/resources/test']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not configured');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns ok: false when no URLs provided', async () => {
    const result = await pingBingIndexNow([]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No URLs');
  });
});
