import { describe, it, expect, vi } from 'vitest';

// ── Fix 1: applyRepairs exact-once matching ──

vi.mock('../../services/contentPlanner/pillarLibraries.js', () => ({ PILLAR_LIBRARIES: {}, VERTICAL_ENTITIES: {} }));
vi.mock('../../services/contentPlanner/prompts.js', () => ({ SYSTEM_PROMPT_WRITER_V1_1: '', VERTICAL_LABELS: {}, ORG_NAME_BAN: '' }));
vi.mock('../../services/contentPlanner/firmContext.js', () => ({ getFirmContext: vi.fn(), renderFirmContextBlock: vi.fn() }));
vi.mock('../../services/contentPlanner/fabricationReview.js', () => ({ reviewDraftForFabrication: vi.fn() }));
vi.mock('../../services/writerAgent/parsePlaceholders.js', () => ({ countAllPlaceholders: vi.fn().mockReturnValue(0) }));
vi.mock('../../routes/vendorPostRoutes.js', () => ({ buildUserPrompt: vi.fn() }));
vi.mock('../../services/agentRun.js', () => ({ findOrCreateRun: vi.fn(), startRun: vi.fn(), completeRun: vi.fn(), failRun: vi.fn() }));
vi.mock('../../services/approvalQueue.js', () => ({ createApproval: vi.fn(), latestRejectionReason: vi.fn() }));
vi.mock('../../services/contentPlanner/writerGuards.js', () => ({ buildCtaForVendor: vi.fn(), detectPossibleFabrication: vi.fn().mockReturnValue([]) }));
vi.mock('../../services/writerAgent/firmDataKeys.js', () => ({ FIRM_DATA_KEYS: {} }));
vi.mock('../../services/contentReview/groundTruth.js', () => ({ localiseNamedEntities: vi.fn(), buildJurisdictionRulesBlock: vi.fn() }));
vi.mock('../../services/contentReview/validateDraft.js', () => ({ validateDraft: vi.fn() }));
vi.mock('../../services/contentReview/verifyClaims.js', () => ({ verifyClaims: vi.fn() }));
vi.mock('../../lib/config/jurisdictions.js', () => ({ resolveJurisdiction: vi.fn().mockReturnValue({}) }));
vi.mock('../../lib/config/industryProfiles.js', () => ({ profileFor: vi.fn() }));
vi.mock('../../services/contentReview/jsonExtract.js', () => ({ extractFirstJsonObject: vi.fn() }));
vi.mock('../../lib/config/models.js', () => ({ SONNET_MODEL: 'test-model' }));
vi.mock('../../models/Vendor.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/AgentRun.js', () => {
  const M = function() {};
  M.findOne = vi.fn();
  M.countDocuments = vi.fn();
  M.normaliseWeekStarting = vi.fn();
  return { default: M };
});

const { applyRepairs } = await import('../../services/writerAgent.js');

describe('Fix 1: applyRepairs exact-once matching', () => {
  it('replaces a sentence that appears exactly once', () => {
    const body = 'First sentence. The agent must respond within 5 working days. Last sentence.';
    const issues = [{ sentence: 'The agent must respond within 5 working days.', repair: 'Agents should respond promptly.', verdict: 'contradicted' }];
    const { repaired, unresolved } = applyRepairs(body, issues);
    expect(repaired).toContain('Agents should respond promptly.');
    expect(repaired).not.toContain('5 working days');
    expect(unresolved).toHaveLength(0);
  });

  it('does NOT replace when sentence appears multiple times', () => {
    const body = 'Contact us today. We are the best. Contact us today.';
    const issues = [{ sentence: 'Contact us today.', repair: 'Get in touch.', verdict: 'contradicted' }];
    const { repaired, unresolved } = applyRepairs(body, issues);
    expect(repaired).toContain('Contact us today.');
    expect(repaired).not.toContain('Get in touch.');
    expect(unresolved).toHaveLength(1);
  });

  it('does NOT replace when sentence is not found', () => {
    const body = 'Some text here. Another sentence.';
    const issues = [{ sentence: 'This does not exist.', repair: 'Replacement.', verdict: 'contradicted' }];
    const { repaired, unresolved } = applyRepairs(body, issues);
    expect(repaired).toBe('Some text here. Another sentence.');
    expect(unresolved).toHaveLength(1);
  });

  it('removes firm-unverified sentence that appears once', () => {
    const body = 'We are trusted. We are SRA regulated. We help clients.';
    const issues = [{ sentence: 'We are SRA regulated.', repair: null, verdict: 'firm-unverified' }];
    const { repaired, unresolved } = applyRepairs(body, issues);
    expect(repaired).not.toContain('SRA regulated');
    expect(unresolved).toHaveLength(0);
  });
});

// ── Fix 3: banned phrase post-check ──

import { repairContainsBannedPhrase } from '../../services/contentPlanner/validators.js';

describe('Fix 3: repairContainsBannedPhrase', () => {
  it('detects "additionally" in repair text', () => {
    expect(repairContainsBannedPhrase('Additionally, firms must comply with regulations.')).toBe(true);
  });

  it('detects "moreover" in repair text', () => {
    expect(repairContainsBannedPhrase('Moreover, the SRA requires compliance.')).toBe(true);
  });

  it('passes clean repair text', () => {
    expect(repairContainsBannedPhrase('Firms must comply with SRA regulations.')).toBe(false);
  });

  it('returns false for null', () => {
    expect(repairContainsBannedPhrase(null)).toBe(false);
  });
});

// ── Fix 4: broader placeholder pattern ──

import { validateContentDraft } from '../../services/contentPlanner/validators.js';

describe('Fix 4: placeholder validation catches all patterns', () => {
  it('catches [FIRM_DATA: key | label]', () => {
    const result = validateContentDraft({ body: 'We charge [FIRM_DATA: brokerFee | Your broker fee] per case.' });
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
  });

  it('catches [FIRM TO PROVIDE: ...]', () => {
    const result = validateContentDraft({ body: 'Response time is [FIRM TO PROVIDE: average response time].' });
    expect(result.passed).toBe(false);
  });

  it('catches [CAPS TOKEN: content]', () => {
    const result = validateContentDraft({ body: 'Our AML process uses [AML SOFTWARE: your tool name].' });
    expect(result.passed).toBe(false);
  });

  it('passes clean text', () => {
    const result = validateContentDraft({ body: 'We provide excellent service to all clients in Cardiff.' });
    expect(result.passed).toBe(true);
  });
});

// ── Fix 6: firm-data key validation against draft body ──

describe('Fix 6: firm-data key from draft body', () => {
  it('extracts keys from [FIRM_DATA: key | label] pattern', () => {
    const body = 'Fee is [FIRM_DATA: brokerFee | Your broker fee]. Time is [FIRM_DATA: averageCompletionTimeWeeks | Weeks].';
    const presentKeys = [...(body.matchAll(/\[FIRM_DATA:\s*([a-zA-Z_]+)\s*\|/gi))].map(m => m[1]);
    expect(presentKeys).toContain('brokerFee');
    expect(presentKeys).toContain('averageCompletionTimeWeeks');
    expect(presentKeys).not.toContain('teamSize');
  });

  it('key present in body is accepted by pattern test', () => {
    const body = 'Fee is [FIRM_DATA: brokerFee | Your fee].';
    const keyPattern = new RegExp(`\\[FIRM_DATA:\\s*brokerFee\\s*\\|`, 'i');
    expect(keyPattern.test(body)).toBe(true);
  });

  it('absent key is rejected by pattern test', () => {
    const body = 'Fee is [FIRM_DATA: brokerFee | Your fee].';
    const keyPattern = new RegExp(`\\[FIRM_DATA:\\s*teamSize\\s*\\|`, 'i');
    expect(keyPattern.test(body)).toBe(false);
  });

  it('error message lists available keys', () => {
    const body = 'A [FIRM_DATA: brokerFee | fee] and [FIRM_DATA: lenderPanelSize | count].';
    const presentKeys = [...new Set([...(body.matchAll(/\[FIRM_DATA:\s*([a-zA-Z_]+)\s*\|/gi))].map(m => m[1]))];
    expect(presentKeys).toEqual(['brokerFee', 'lenderPanelSize']);
  });
});
