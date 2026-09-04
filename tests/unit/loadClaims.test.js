import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadClaims } from '../../lib/experiments/loadClaims.js';

// Minimal stand-in for the frozen study config (loadClaims reads prompt IDs and
// intents from here — it must never duplicate them locally).
const CONFIG = {
  study: 'study_2026_09_ai_visibility_content',
  panel: 'buyer_research_30',
  prompts: [
    { id: 'bi-01', intent: 'buyer', text: 'q', targets: [] },
    { id: 'ri-15', intent: 'research', text: 'q', targets: [] },
  ],
};

let dir, configPath;
const write = (name, obj) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); return p; };
const registry = (over = {}) => ({
  study: 'study_2026_09_ai_visibility_content',
  panel: 'buyer_research_30',
  version: '1.0',
  frozen: null,
  claims: [],
  ...over,
});

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claims-'));
  configPath = write('config.json', CONFIG);
});
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const load = (reg) => loadClaims({ claimsPath: write('claims.json', reg), configPath });

describe('loadClaims — validation', () => {
  it('passes on a valid frozen registry with one claim', () => {
    const res = load(registry({
      frozen: '2026-09-10',
      claims: [{ promptId: 'ri-15', articleUrl: 'https://tendorai.com/blog/x', targetClaim: 'X causes Y.', addedOn: '10/09/2026' }],
    }));
    expect(res.frozen).toBe('2026-09-10');
    expect(res.claims).toHaveLength(1);
    expect(res.intentByPrompt.get('ri-15')).toBe('research');
  });

  it('passes on the empty unfrozen registry (frozen null, no claims)', () => {
    const res = load(registry());
    expect(res.frozen).toBeNull();
    expect(res.claims).toHaveLength(0);
  });

  it('rejects a study mismatch', () => {
    expect(() => load(registry({ study: 'other_study' }))).toThrow(/study .* does not match/i);
  });

  it('rejects a panel mismatch', () => {
    expect(() => load(registry({ panel: 'other_panel' }))).toThrow(/panel .* does not match/i);
  });

  it('rejects a promptId not in the config', () => {
    expect(() => load(registry({ claims: [{ promptId: 'zz-99', articleUrl: 'https://tendorai.com/a', targetClaim: 'c' }] })))
      .toThrow(/promptId "zz-99" is not a prompt/i);
  });

  it('rejects a duplicate promptId', () => {
    expect(() => load(registry({ claims: [
      { promptId: 'ri-15', articleUrl: 'https://tendorai.com/a', targetClaim: 'c1' },
      { promptId: 'ri-15', articleUrl: 'https://tendorai.com/b', targetClaim: 'c2' },
    ] }))).toThrow(/duplicates promptId/i);
  });

  it('rejects a non-absolute / non-https articleUrl', () => {
    expect(() => load(registry({ claims: [{ promptId: 'ri-15', articleUrl: 'http://tendorai.com/a', targetClaim: 'c' }] })))
      .toThrow(/absolute https URL/i);
    expect(() => load(registry({ claims: [{ promptId: 'ri-15', articleUrl: '/blog/a', targetClaim: 'c' }] })))
      .toThrow(/absolute https URL/i);
  });

  it('rejects an empty targetClaim', () => {
    expect(() => load(registry({ claims: [{ promptId: 'ri-15', articleUrl: 'https://tendorai.com/a', targetClaim: '  ' }] })))
      .toThrow(/targetClaim must be a non-empty string/i);
  });

  it('rejects a frozen value that is neither null nor a date string', () => {
    expect(() => load(registry({ frozen: 'soon' }))).toThrow(/frozen.*must be null or a date string/i);
    expect(() => load(registry({ frozen: 20260910 }))).toThrow(/frozen.*must be null or a date string/i);
  });
});
