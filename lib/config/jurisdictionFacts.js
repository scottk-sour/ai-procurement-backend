// lib/config/jurisdictionFacts.js
//
// SINGLE SOURCE OF TRUTH for facts that differ between UK jurisdictions.
// Read by: groundTruth.js (teaches the writer up front) and
//          validateDraft.js (blocks the draft if it still got it wrong).
//
// TO TEACH A NEW LEGAL DIFFERENCE: add one row, with a `sources` entry
// (official URL) for every fact. No source URL → don't add the fact.
//
// DISCIPLINE:
//  - Encode stable TERMS/NAMES here. Keep volatile NUMBERS out (notice
//    periods, deposit caps, EPC ratings, rates) — they drift; the
//    ground-truth block already tells the writer never to invent figures.
//  - `sources` = facts confirmed against primary/official sites.
//  - `verifyBeforeCommit` = facts proposed but NOT yet confirmed by a human.
//    A row is only fully "taught" once this array is empty.
//
// Verified 2026-06-22 against legislation.gov.uk, gov.wales, rentsmart.gov.wales.

export const JURISDICTION_FACTS = [
  {
    id: 'property_tax',
    domain: 'property',
    appliesTo: ['estate-agent', 'solicitor', 'mortgage-advisor'],
    england: { canonical: 'Stamp Duty Land Tax (SDLT)', authority: 'HMRC' },
    wales:   { canonical: 'Land Transaction Tax (LTT)', authority: 'Welsh Revenue Authority' },
    forbiddenInWales:   ['SDLT', 'Stamp Duty Land Tax', 'HMRC', 'first-time buyer relief'],
    forbiddenInEngland: ['Land Transaction Tax', 'LTT', 'Welsh Revenue Authority', 'LBTT', 'Revenue Scotland'],
    forbiddenInScotland: ['SDLT', 'Stamp Duty Land Tax', 'HMRC', 'LTT', 'Land Transaction Tax', 'Welsh Revenue Authority'],
    scotland: { canonical: 'Land and Buildings Transaction Tax (LBTT)', authority: 'Revenue Scotland' },
    sources: [
      { fact: 'Wales uses LTT via the Welsh Revenue Authority, not SDLT', url: 'https://www.gov.wales/land-transaction-tax-guide' },
    ],
    verifyBeforeCommit: [],
  },

  {
    id: 'residential_tenancy',
    domain: 'letting',
    appliesTo: ['estate-agent', 'solicitor'],
    england: {
      canonical: 'assured shorthold tenancy (AST) under the Housing Act 1988',
      noticeProvision: 'Section 21',
      occupantTerm: 'tenant',
    },
    wales: {
      canonical: 'occupation contract under the Renting Homes (Wales) Act 2016',
      noticeProvision: 'Section 173',
      occupantTerm: 'contract-holder',
      inForce: '1 December 2022',
    },
    forbiddenInWales: [
      'assured shorthold tenancy', 'AST', 'Housing Act 1988',
      'Section 21', 'How to Rent guide',
    ],
    forbiddenInEngland: [
      'occupation contract', 'Renting Homes (Wales) Act', 'contract-holder', 'Section 173',
    ],
    requiredInWales: ['Rent Smart Wales'],
    sources: [
      { fact: 'Tenancies replaced by occupation contracts; tenants are contract-holders', url: 'https://www.gov.wales/housing-law-changed-renting-homes' },
      { fact: 'The Act: occupation contracts, contract-holders, in force 1 Dec 2022', url: 'https://www.legislation.gov.uk/anaw/2016/1' },
      { fact: 'Replaces the assured/AST regime (Housing Act 1985/1988) in Wales', url: 'https://law.gov.wales/renting-homes-wales-act-2016' },
    ],
    verifyBeforeCommit: [
      { fact: 'Section 173 is the no-fault notice replacing Section 21', url: 'https://www.legislation.gov.uk/anaw/2016/1/section/173', note: 'open and confirm the section text' },
    ],
  },

  {
    id: 'tenant_fees',
    domain: 'letting',
    appliesTo: ['estate-agent', 'solicitor'],
    england: { canonical: 'Tenant Fees Act 2019' },
    wales:   { canonical: 'Renting Homes (Fees etc.) (Wales) Act 2019' },
    forbiddenInWales:   ['Tenant Fees Act 2019', "five weeks' rent", "5 weeks' rent"],
    forbiddenInEngland: ['Renting Homes (Fees etc.) (Wales) Act'],
    sources: [],
    verifyBeforeCommit: [
      { fact: 'Welsh fees are governed by the Renting Homes (Fees etc.) (Wales) Act 2019', url: 'https://www.legislation.gov.uk/anaw/2019/2', note: 'confirm this is the correct anaw number for the Welsh fees Act' },
    ],
  },

  {
    id: 'right_to_rent',
    domain: 'letting',
    appliesTo: ['estate-agent', 'solicitor'],
    englandOnly: true,
    england: { canonical: 'Right to Rent checks under the Immigration Act 2014' },
    forbiddenInWales: ['Right to Rent', 'Immigration Act 2014'],
    sources: [],
    verifyBeforeCommit: [
      { fact: 'Right to Rent applies to England only; not extended to Wales', url: 'https://www.gov.uk/check-tenant-right-to-rent-documents', note: 'confirm the page states England scope' },
    ],
  },

  {
    id: 'landlord_licensing',
    domain: 'letting',
    appliesTo: ['estate-agent', 'solicitor'],
    england: { canonical: 'selective licensing / HMO licensing via the local council' },
    wales:   { canonical: 'Rent Smart Wales registration and licensing (Housing (Wales) Act 2014)' },
    forbiddenInWales: ['selective licensing zone'],
    requiredInWales: ['Rent Smart Wales'],
    sources: [
      { fact: 'All Welsh landlords must register; self-managers must be licensed', url: 'https://rentsmart.gov.wales/en/landlord/landlord-registration/' },
      { fact: 'Cannot serve a Section 173 notice unless registered/licensed', url: 'https://rentsmart.gov.wales/en/landlord/landlord-registration/' },
    ],
    verifyBeforeCommit: [
      { fact: 'Statutory basis is the Housing (Wales) Act 2014, Part 1', url: 'https://www.legislation.gov.uk/anaw/2014/7', note: 'confirm anaw/2014/7 is the Housing (Wales) Act 2014' },
    ],
  },
];

export function factsFor(vendorType, domain = null) {
  return JURISDICTION_FACTS.filter(f =>
    f.appliesTo.includes(vendorType) &&
    (domain === null || f.domain === domain)
  );
}

export function isRowVerified(row) {
  return !row.verifyBeforeCommit || row.verifyBeforeCommit.length === 0;
}
