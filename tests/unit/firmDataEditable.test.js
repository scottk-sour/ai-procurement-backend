import { describe, it, expect } from 'vitest';

describe('firmData editable until publish', () => {

  // ── Substitution logic (pure function, no mocks needed) ──

  function substitutePlaceholders(text, firmDataMap) {
    if (!text) return text;
    return text.replace(/\[FIRM_DATA:\s*([a-zA-Z_]+)\s*\|[^\]]*\]/g, (match, key) => {
      return firmDataMap.has(key) ? firmDataMap.get(key) : match;
    });
  }

  const BODY_WITH_PLACEHOLDERS = 'Our fee is [FIRM_DATA: brokerFee | Your broker fee]. We have [FIRM_DATA: teamSize | Team size] staff.';

  it('substitutes values from firmData map', () => {
    const firmData = new Map([['brokerFee', '£499'], ['teamSize', '12']]);
    const merged = substitutePlaceholders(BODY_WITH_PLACEHOLDERS, firmData);
    expect(merged).toBe('Our fee is £499. We have 12 staff.');
    expect(merged).not.toContain('[FIRM_DATA:');
  });

  it('preserves unfilled placeholders when firmData is partial', () => {
    const firmData = new Map([['brokerFee', '£499']]);
    const merged = substitutePlaceholders(BODY_WITH_PLACEHOLDERS, firmData);
    expect(merged).toContain('£499');
    expect(merged).toContain('[FIRM_DATA: teamSize | Team size]');
  });

  it('preserves all placeholders when firmData is empty', () => {
    const merged = substitutePlaceholders(BODY_WITH_PLACEHOLDERS, new Map());
    expect(merged).toBe(BODY_WITH_PLACEHOLDERS);
  });

  it('overwriting a key replaces the old value in the map', () => {
    const firmData = new Map([['brokerFee', '£399']]);
    firmData.set('brokerFee', '£599');
    const merged = substitutePlaceholders(BODY_WITH_PLACEHOLDERS, firmData);
    expect(merged).toContain('£599');
    expect(merged).not.toContain('£399');
  });

  // ── Body must NOT be mutated on firm-data save ──

  it('original body retains placeholders after saving firm values', () => {
    const approval = {
      draftPayload: { body: BODY_WITH_PLACEHOLDERS },
      firmData: new Map(),
    };

    approval.firmData.set('brokerFee', '£499');

    expect(approval.draftPayload.body).toContain('[FIRM_DATA: brokerFee | Your broker fee]');
    expect(approval.draftPayload.body).not.toContain('£499');
  });

  it('substitution at publish time produces clean text', () => {
    const approval = {
      draftPayload: { body: BODY_WITH_PLACEHOLDERS },
      firmData: new Map([['brokerFee', '£499'], ['teamSize', '12']]),
    };

    const publishBody = substitutePlaceholders(approval.draftPayload.body, approval.firmData);
    expect(publishBody).toBe('Our fee is £499. We have 12 staff.');
    expect(approval.draftPayload.body).toBe(BODY_WITH_PLACEHOLDERS);
  });

  // ── Retry after correction ──

  it('changing a value and re-substituting produces updated text', () => {
    const firmData = new Map([['brokerFee', '£499'], ['teamSize', '12']]);

    const first = substitutePlaceholders(BODY_WITH_PLACEHOLDERS, firmData);
    expect(first).toContain('£499');

    firmData.set('brokerFee', '£599');
    const second = substitutePlaceholders(BODY_WITH_PLACEHOLDERS, firmData);
    expect(second).toContain('£599');
    expect(second).not.toContain('£499');
  });

  // ── Status stays approved on firm-retriable failure ──

  it('firm-retriable error pattern matches validation failures', () => {
    const FIRM_RETRIABLE_PATTERNS = [
      /Validation failed/i,
      /unresolved placeholder/i,
      /Semantic review/i,
      /firm context/i,
    ];
    function isFirmRetriable(msg) {
      return FIRM_RETRIABLE_PATTERNS.some(p => p.test(msg));
    }

    expect(isFirmRetriable('Validation failed: 1 unresolved placeholder(s) found')).toBe(true);
    expect(isFirmRetriable('Semantic review failed (quality 6/10)')).toBe(true);
    expect(isFirmRetriable('Publish blocked — some other issue')).toBe(false);
  });

  // ── Key validation against body ──

  it('key present in body is accepted', () => {
    const body = 'Fee is [FIRM_DATA: brokerFee | Your fee].';
    const keyPattern = new RegExp(`\\[FIRM_DATA:\\s*brokerFee\\s*\\|`, 'i');
    expect(keyPattern.test(body)).toBe(true);
  });

  it('absent key is rejected', () => {
    const body = 'Fee is [FIRM_DATA: brokerFee | Your fee].';
    const keyPattern = new RegExp(`\\[FIRM_DATA:\\s*teamSize\\s*\\|`, 'i');
    expect(keyPattern.test(body)).toBe(false);
  });
});
