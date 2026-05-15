import mongoose from 'mongoose';

export const VENDOR_ID = new mongoose.Types.ObjectId();

export const emptyFirmFacts = {
  vendorId: VENDOR_ID,
};

export const stage1OnlyFirmFacts = {
  vendorId: VENDOR_ID,
  identity: {
    firmName: { value: 'Llewellyn & Hughes Solicitors', filledAt: new Date(), source: 'self' },
    city: { value: 'Cardiff', filledAt: new Date(), source: 'self' },
    vendorType: { value: 'solicitor', filledAt: new Date(), source: 'self' },
    primarySpecialism: { value: 'Conveyancing', filledAt: new Date(), source: 'self' },
    yearEstablished: { value: 2005, filledAt: new Date(), source: 'self' },
  },
  stage1: {
    regulatoryNumber: { value: '654321', filledAt: new Date(), source: 'verified_register' },
    transactionCountLastYear: { value: 247, filledAt: new Date(), source: 'self' },
    typicalAllInCost: { value: '£850–£1,500', filledAt: new Date(), source: 'self' },
  },
};

export const fullFirmFacts = {
  ...stage1OnlyFirmFacts,
  stage2: {
    formalComplaintsThisYear: { value: 2, filledAt: new Date(), source: 'self' },
    complaintResolutionDays: { value: 8, filledAt: new Date(), source: 'self' },
    averageCompletionTimeWeeks: { value: 10, filledAt: new Date(), source: 'self' },
    specialismCaseCount: { value: 1200, filledAt: new Date(), source: 'self' },
    teamCombinedYears: { value: 85, filledAt: new Date(), source: 'self' },
    averageDisbursements: { value: '£350', filledAt: new Date(), source: 'self' },
    fixedFeeSavingVsHourly: { value: '£320', filledAt: new Date(), source: 'self' },
    averageAnnualFees: { value: null, filledAt: null, source: null },
    qualificationsHeld: { value: null, filledAt: null, source: null },
    brokerFee: { value: null, filledAt: null, source: null },
    averageRateSavingPerYear: { value: null, filledAt: null, source: null },
    lenderPanelSize: { value: null, filledAt: null, source: null },
    soleAgencyFeePercent: { value: null, filledAt: null, source: null },
    achievedVsAskingPercent: { value: null, filledAt: null, source: null },
    daysListingToSaleAgreed: { value: null, filledAt: null, source: null },
  },
};
