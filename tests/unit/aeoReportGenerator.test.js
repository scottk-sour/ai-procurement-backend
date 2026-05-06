import { describe, it, expect, vi } from 'vitest';

// Mock all heavy dependencies so the module loads without DB/API
vi.mock('../../services/platformQuery/index.js', () => ({ queryAllPlatforms: vi.fn().mockResolvedValue([]) }));
vi.mock('../../models/Vendor.js', () => ({ default: {} }));

// Set env so the API key check doesn't throw on import
process.env.ANTHROPIC_API_KEY = 'test';
process.env.JWT_SECRET = 'test';

const { _parseResponseJSON: parseResponseJSON, generateFullReport } = await import('../../services/aeoReportGenerator.js');

describe('parseResponseJSON', () => {
  it('parses plain JSON object', () => {
    expect(parseResponseJSON('{"foo": "bar"}')).toEqual({ foo: 'bar' });
  });

  it('parses JSON wrapped in markdown fences', () => {
    expect(parseResponseJSON('```json\n{"foo": "bar"}\n```')).toEqual({ foo: 'bar' });
  });

  it('parses JSON with preamble text', () => {
    expect(parseResponseJSON('Here is the report:\n{"foo": "bar"}')).toEqual({ foo: 'bar' });
  });

  it('parses nested objects (brace depth)', () => {
    expect(parseResponseJSON('{"a": {"b": 1}, "c": 2}')).toEqual({ a: { b: 1 }, c: 2 });
  });

  it('handles braces inside strings without breaking depth', () => {
    expect(parseResponseJSON('{"description": "Cardiff {city} works"}')).toEqual({ description: 'Cardiff {city} works' });
  });

  it('throws on empty input', () => {
    expect(() => parseResponseJSON('')).toThrow(/empty|non-string/);
  });

  it('throws on null input', () => {
    expect(() => parseResponseJSON(null)).toThrow(/empty|non-string/);
  });

  it('throws when no braces found', () => {
    expect(() => parseResponseJSON('no json here')).toThrow(/No JSON object found/);
  });

  it('throws on unbalanced braces', () => {
    expect(() => parseResponseJSON('{"foo": "bar"')).toThrow(/Unbalanced braces/);
  });
});

describe('generateFullReport validation', () => {
  it('throws on missing companyName', async () => {
    await expect(generateFullReport({ city: 'Cardiff', category: 'estate-agent' }))
      .rejects.toThrow(/companyName/);
  });

  it('throws on empty companyName', async () => {
    await expect(generateFullReport({ companyName: '', city: 'Cardiff', category: 'estate-agent' }))
      .rejects.toThrow(/companyName/);
  });

  it('throws on missing city', async () => {
    await expect(generateFullReport({ companyName: 'Test Co', category: 'estate-agent' }))
      .rejects.toThrow(/city/);
  });

  it('throws on missing category', async () => {
    await expect(generateFullReport({ companyName: 'Test Co', city: 'Cardiff' }))
      .rejects.toThrow(/category/);
  });
});
