import { describe, it, expect } from 'vitest';
import { validateDraft } from '../../services/contentReview/validateDraft.js';

describe('validateDraft — jurisdiction + regulatory gate', () => {

  it('blocks Welsh estate-agent draft using SDLT', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } };
    const text = 'Stamp Duty Land Tax (SDLT) applies to all property purchases over the threshold.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'WRONG_TAX_JURISDICTION')).toBe(true);
  });

  it('blocks Welsh estate-agent draft using HMRC', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } };
    const text = 'You must report the transaction to HMRC within 14 days.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'WRONG_TAX_JURISDICTION' && b.message.includes('HMRC'))).toBe(true);
  });

  it('blocks Welsh firm mentioning first-time buyer relief', () => {
    const firm = { vendorType: 'solicitor', location: { postcode: 'SA1 1AA' } };
    const text = 'First-time buyer relief means you pay no tax on the first £425,000.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'WRONG_TAX_JURISDICTION')).toBe(true);
  });

  it('blocks border postcode firm with any tax term (TAX_REGIME_UNCONFIRMED)', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'SY1 1AA' } };
    const text = 'SDLT is payable on the purchase of any property.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'TAX_REGIME_UNCONFIRMED')).toBe(true);
  });

  it('allows English firm using SDLT', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'BS1 1AA' } };
    const text = 'SDLT is payable on the purchase of any property over the threshold set by HMRC.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(true);
  });

  it('blocks Scottish firm using SDLT', () => {
    const firm = { vendorType: 'solicitor', location: { postcode: 'EH1 1AA' } };
    const text = 'You must pay SDLT when purchasing a property in Scotland.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'WRONG_TAX_JURISDICTION')).toBe(true);
  });

  it('allows Scottish firm using LBTT', () => {
    const firm = { vendorType: 'solicitor', location: { postcode: 'EH1 1AA' } };
    const text = 'Land and Buildings Transaction Tax (LBTT) is administered by Revenue Scotland.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(true);
  });

  it('blocks placeholder registration number', () => {
    const firm = { vendorType: 'solicitor' };
    const text = 'We are registered with the SRA, membership number 12345.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'PLACEHOLDER_REG_NUMBER')).toBe(true);
  });

  it('blocks accountant claiming self-regulation by the SRA', () => {
    const firm = { vendorType: 'accountant' };
    const text = 'We are regulated by the SRA and provide audit services.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'WRONG_REGULATOR')).toBe(true);
  });

  it('does NOT block estate-agent mentioning SRA for a third party', () => {
    const firm = { vendorType: 'estate-agent' };
    const text = 'Your conveyancing solicitor, who is regulated by the SRA, will handle the legal transfer.';
    const result = validateDraft(text, firm);
    expect(result.blocks.some(b => b.code === 'WRONG_REGULATOR')).toBe(false);
  });

  it('does NOT block estate-agent mentioning a company registration number', () => {
    const firm = { vendorType: 'estate-agent', propertymarkNumber: 'P12345' };
    const text = 'We are a limited company, company registration number 16521860, registered in England and Wales.';
    const result = validateDraft(text, firm);
    expect(result.blocks.some(b => b.code === 'UNVERIFIED_REG_NUMBER')).toBe(false);
  });

  it('does NOT block mortgage-advisor mentioning RICS-regulated surveyor', () => {
    const firm = { vendorType: 'mortgage-advisor' };
    const text = 'We recommend you use an RICS-regulated surveyor for your home buyer report.';
    const result = validateDraft(text, firm);
    expect(result.blocks.some(b => b.code === 'WRONG_REGULATOR')).toBe(false);
  });

  it('blocks Welsh estate-agent draft with AST + Section 21', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } };
    const text = 'Tenants sign an assured shorthold tenancy. Landlords can issue a Section 21 notice.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'WRONG_LETTING_JURISDICTION' && b.message.includes('assured shorthold tenancy'))).toBe(true);
    expect(result.blocks.some(b => b.code === 'WRONG_LETTING_JURISDICTION' && b.message.includes('Section 21'))).toBe(true);
  });

  it('blocks Welsh estate-agent letting draft missing Rent Smart Wales', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } };
    const text = 'Every landlord in Wales must register. Tenancy deposits are protected under law.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'MISSING_REQUIRED_LETTING_TERM' && b.message.includes('Rent Smart Wales'))).toBe(true);
  });

  it('allows Welsh estate-agent draft using correct Welsh letting terms', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } };
    const text = 'Under the Renting Homes (Wales) Act 2016, landlords issue occupation contracts to contract-holders. Landlords must use Section 173 notices. All landlords must register with Rent Smart Wales.';
    const result = validateDraft(text, firm);
    const lettingBlocks = result.blocks.filter(b => b.code === 'WRONG_LETTING_JURISDICTION' || b.code === 'MISSING_REQUIRED_LETTING_TERM');
    expect(lettingBlocks).toHaveLength(0);
  });

  it('allows English estate-agent draft with AST + Section 21 (regression)', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'BS1 1AA' } };
    const text = 'Tenants sign an assured shorthold tenancy. Landlords can issue a Section 21 notice.';
    const result = validateDraft(text, firm);
    const lettingBlocks = result.blocks.filter(b => b.code === 'WRONG_LETTING_JURISDICTION');
    expect(lettingBlocks).toHaveLength(0);
  });

  it('does NOT block Welsh accountant mentioning HMRC (regression)', () => {
    const firm = { vendorType: 'accountant', location: { postcode: 'CF10 1FA' } };
    const text = 'You must file your self-assessment tax return with HMRC by 31 January.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(0);
  });

  it('warns on mortgage-advisor using advice-shaped language', () => {
    const firm = { vendorType: 'mortgage-advisor' };
    const text = 'Based on your circumstances, we recommend you take this deal immediately.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.code === 'ADVICE_SHAPED_LANGUAGE')).toBe(true);
  });

  it('does not block accountant draft with no tax content', () => {
    const firm = { vendorType: 'accountant', location: { postcode: 'CF10 1FA' } };
    const text = 'Our self-assessment service ensures your tax return is filed on time with HMRC.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(true);
  });

  // ── WRONG_STATUTE_CITATION ────────────────────────────────

  it('blocks redress claim citing Estate Agents Act 1979', () => {
    const firm = { vendorType: 'estate-agent' };
    const text = 'All estate agents must belong to a redress scheme under the Estate Agents Act 1979.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'WRONG_STATUTE_CITATION')).toBe(true);
  });

  it('does NOT block redress claim citing CEAR 2007', () => {
    const firm = { vendorType: 'estate-agent' };
    const text = 'All estate agents must belong to a redress scheme under the Consumers, Estate Agents and Redress Act 2007.';
    const result = validateDraft(text, firm);
    expect(result.blocks.some(b => b.code === 'WRONG_STATUTE_CITATION')).toBe(false);
  });

  // ── PLACEHOLDER_REG_NUMBER with token patterns ──────────

  it('blocks PM-DEMO-001 for non-demo estate-agent', () => {
    const firm = { vendorType: 'estate-agent' };
    const text = 'Our Propertymark number is PM-DEMO-001.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'PLACEHOLDER_REG_NUMBER')).toBe(true);
  });

  it('does NOT block PM-DEMO-001 for demo firm', () => {
    const firm = { vendorType: 'estate-agent', isDemoVendor: true };
    const text = 'Our Propertymark number is PM-DEMO-001.';
    const result = validateDraft(text, firm);
    expect(result.blocks.some(b => b.code === 'PLACEHOLDER_REG_NUMBER')).toBe(false);
  });

  // ── False-positive guards for placeholder rule ──────────

  it('does NOT block "book a free demo" for non-demo firm', () => {
    const firm = { vendorType: 'estate-agent' };
    const result = validateDraft('Book a free demo today.', firm);
    expect(result.ok).toBe(true);
  });

  it('does NOT block "2024 demo" for non-demo firm', () => {
    const firm = { vendorType: 'estate-agent' };
    const result = validateDraft('Our 2024 demo of the new portal.', firm);
    expect(result.ok).toBe(true);
  });

  it('does NOT block "test results" for non-demo firm', () => {
    const firm = { vendorType: 'estate-agent' };
    const result = validateDraft('Test results showed strong demand.', firm);
    expect(result.ok).toBe(true);
  });

  it('does NOT block "sample properties" for non-demo firm', () => {
    const firm = { vendorType: 'estate-agent' };
    const result = validateDraft('Sample properties available to view.', firm);
    expect(result.ok).toBe(true);
  });

  // ── VOLUNTARY_BODY_OVERCLAIM ──────────────────────────────

  it('blocks VOLUNTARY_BODY_OVERCLAIM for estate-agent', () => {
    const firm = { vendorType: 'estate-agent' };
    const text = 'Propertymark is a regulated qualification that proves your agent meets high standards.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.code === 'VOLUNTARY_BODY_OVERCLAIM')).toBe(true);
  });

  it('does NOT fire VOLUNTARY_BODY_OVERCLAIM for solicitor', () => {
    const firm = { vendorType: 'solicitor' };
    const text = 'This is a regulated qualification that proves your solicitor meets high standards.';
    const result = validateDraft(text, firm);
    expect(result.blocks.some(b => b.code === 'VOLUNTARY_BODY_OVERCLAIM')).toBe(false);
  });

  // ── CREDENTIAL_EXCLUSIVITY_FRAMING ────────────────────────

  it('warns CREDENTIAL_EXCLUSIVITY_FRAMING (not block)', () => {
    const firm = { vendorType: 'estate-agent' };
    const text = 'Propertymark is the only provider of client money protection, which removes that risk for landlords.';
    const result = validateDraft(text, firm);
    expect(result.blocks.some(b => b.code === 'CREDENTIAL_EXCLUSIVITY_FRAMING')).toBe(false);
    expect(result.warnings.some(w => w.code === 'CREDENTIAL_EXCLUSIVITY_FRAMING')).toBe(true);
  });
});
