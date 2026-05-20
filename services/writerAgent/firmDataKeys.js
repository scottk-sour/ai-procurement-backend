export const FIRM_DATA_KEYS = {
  // ─── Estate Agent — Letting fees ─────────────────────────
  fullManagementFeePercent: 'Full management fee % (e.g. 10)',
  tenantFindFee: 'Tenant-find fee (e.g. £600 + VAT)',
  servicesIncluded: 'Services included in full management',
  averageLetTime: 'Average time to let a property (e.g. 14 days)',
  additionalFees: 'Any additional fees (check-out, inventory, etc.)',
  soleAgencyFeePercent: 'Sole agency commission % (e.g. 1.2)',
  averageSalePrice: 'Average property sale price in your area (e.g. £285,000)',
  achievedVsAskingPercent: 'Average achieved vs asking price % (e.g. 98.5)',

  // ─── Estate Agent — Process ──────────────────────────────
  averageDaysToSaleAgreed: 'Average days from listing to sale agreed (e.g. 28)',
  averageWeeksToCompletion: 'Average weeks from instruction to completion (e.g. 10)',
  propertiesSoldThisYear: 'Number of properties sold this year (e.g. 180)',
  propertiesLetThisYear: 'Number of properties let this year (e.g. 120)',

  // ─── Solicitor — Costs ───────────────────────────────────
  typicalConveyancingFee: 'Typical conveyancing fee range (e.g. £850–£1,500 + VAT)',
  averageDisbursements: 'Average disbursements on top of core fee (e.g. £350)',
  fixedFeeSavingVsHourly: 'Average saving of fixed vs hourly fees (e.g. £320)',

  // ─── Solicitor — Process ─────────────────────────────────
  averageCompletionTimeWeeks: 'Average case completion time in weeks (e.g. 10)',
  transactionCountLastYear: 'Number of transactions completed last year (e.g. 247)',

  // ─── Accountant — Costs ──────────────────────────────────
  averageAnnualFees: 'Average annual fees for a typical client (e.g. £1,800)',
  typicalMonthlyRetainer: 'Typical monthly retainer fee (e.g. £150)',

  // ─── Mortgage Adviser — Costs ────────────────────────────
  brokerFee: 'Your broker fee (e.g. £499 or fee-free)',
  averageRateSaving: 'Average rate saving vs lender direct (e.g. £3,400/year)',
  lenderPanelSize: 'Number of lenders on your panel (e.g. 90)',

  // ─── Cross-vertical ──────────────────────────────────────
  teamSize: 'Number of fee earners / staff (e.g. 12)',
  yearsEstablished: 'Year the firm was established (e.g. 2005)',
  formalComplaintsThisYear: 'Number of formal complaints this year (e.g. 2)',
  complaintResolutionDays: 'Average complaint resolution time in days (e.g. 8)',
  regulatoryNumber: 'Your regulatory registration number (SRA / FCA / ICAEW)',
};

export function isValidFirmDataKey(key) {
  return key in FIRM_DATA_KEYS;
}

export function getFirmDataLabel(key) {
  return FIRM_DATA_KEYS[key] || key;
}
