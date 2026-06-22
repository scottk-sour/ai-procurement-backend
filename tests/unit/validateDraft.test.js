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

  it('warns on Welsh firm using assured shorthold tenancy (letting jurisdiction)', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } };
    const text = 'Tenants sign an assured shorthold tenancy before moving in.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.code === 'WRONG_LETTING_JURISDICTION')).toBe(true);
  });

  it('warns on Welsh firm using Section 21', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'NP20 1AA' } };
    const text = 'Landlords can issue a Section 21 notice to regain possession.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.code === 'WRONG_LETTING_JURISDICTION' && w.message.includes('Section 21'))).toBe(true);
  });

  it('warns on Welsh firm referencing Tenant Fees Act 2019 (England)', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'CF10 1FA' } };
    const text = 'Under the Tenant Fees Act 2019, agents cannot charge tenants for referencing.';
    const result = validateDraft(text, firm);
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.code === 'WRONG_LETTING_JURISDICTION' && w.message.includes('tenant_fees'))).toBe(true);
  });

  it('allows English firm using AST and Section 21', () => {
    const firm = { vendorType: 'estate-agent', location: { postcode: 'BS1 1AA' } };
    const text = 'Tenants sign an assured shorthold tenancy and landlords may use Section 21 to recover possession.';
    const result = validateDraft(text, firm);
    const lettingWarnings = result.warnings.filter(w => w.code === 'WRONG_LETTING_JURISDICTION');
    expect(lettingWarnings).toHaveLength(0);
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
});
