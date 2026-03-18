const PROFILE_GAPS = {
  solicitor: [
    {
      field: 'practiceAreas',
      check: (v) => !v.practiceAreas || v.practiceAreas.length === 0,
      label: 'Practice areas not listed',
      impact: 'AI cannot match you to specific legal queries — conveyancing, family law, or criminal defence searches won\'t return your firm',
      tier: 'free',
    },
    {
      field: 'fixedFees',
      check: (v) => !v.fixedFees || v.fixedFees.length === 0,
      label: 'Fees not published',
      impact: 'The most common AI query is "how much does [service] cost in [city]". Without fees, AI cannot recommend you for price-conscious clients',
      tier: 'free',
    },
    {
      field: 'accreditations',
      check: (v) => !v.accreditations || v.accreditations.length === 0,
      label: 'Accreditations not listed',
      impact: 'Clients specifically ask for CQS-accredited or Lexcel-certified firms. Without accreditations, AI excludes you from filtered searches',
      tier: 'free',
    },
    {
      field: 'noWinNoFee',
      check: (v) => v.noWinNoFee === undefined || v.noWinNoFee === null,
      label: 'No win no fee status unknown',
      impact: 'Personal injury clients almost always ask AI for no win no fee solicitors. If this isn\'t declared, you\'re invisible to this segment',
      tier: 'starter',
    },
    {
      field: 'courtCoverageAreas',
      check: (v) => !v.courtCoverageAreas || v.courtCoverageAreas.length === 0,
      label: 'Court coverage areas not listed',
      impact: 'AI cannot recommend you for court-specific queries in your area',
      tier: 'starter',
    },
    {
      field: 'languages',
      check: (v) => !v.languages || v.languages.length === 0,
      label: 'Languages spoken not listed',
      impact: 'Clients searching for solicitors in their language are a growing AI query segment you\'re missing',
      tier: 'starter',
    },
    {
      field: 'individualSolicitors',
      check: (v) => !v.individualSolicitors || v.individualSolicitors.length === 0,
      label: 'Team members not listed',
      impact: 'AI recommends named solicitors with specific expertise. Without team profiles, you lose recommendation opportunities',
      tier: 'pro',
    },
  ],
  accountant: [
    {
      field: 'practiceAreas',
      check: (v) => !v.practiceAreas || v.practiceAreas.length === 0,
      label: 'Service areas not listed',
      impact: 'AI cannot match you to specific accounting queries — tax advisory, bookkeeping, or payroll searches won\'t return your firm',
      tier: 'free',
    },
    {
      field: 'fixedFees',
      check: (v) => !v.fixedFees || v.fixedFees.length === 0,
      label: 'Fees not published',
      impact: 'Business owners ask AI "how much does an accountant cost". Without fees, AI cannot recommend you',
      tier: 'free',
    },
    {
      field: 'softwareUsed',
      check: (v) => !v.softwareUsed || v.softwareUsed.length === 0,
      label: 'Accounting software not listed',
      impact: 'Clients searching for "Xero accountant near me" won\'t find you without this',
      tier: 'free',
    },
    {
      field: 'mtdCompliant',
      check: (v) => !v.mtdCompliant,
      label: 'MTD agent status not declared',
      impact: 'Making Tax Digital compliance is a major client concern that improves recommendation frequency',
      tier: 'starter',
    },
    {
      field: 'industrySpecialisms',
      check: (v) => !v.industrySpecialisms || v.industrySpecialisms.length === 0,
      label: 'Industry specialisms not listed',
      impact: 'AI matches accountants to industries. Without specialisms, you miss queries like "accountant for construction companies"',
      tier: 'starter',
    },
    {
      field: 'minimumFeeThreshold',
      check: (v) => !v.minimumFeeThreshold,
      label: 'Minimum fee not declared',
      impact: 'Helps AI match you to appropriately sized clients and improves recommendation quality',
      tier: 'starter',
    },
    {
      field: 'rdTaxCreditsSpecialist',
      check: (v) => v.rdTaxCreditsSpecialist === undefined || v.rdTaxCreditsSpecialist === null,
      label: 'R&D tax credits specialism not declared',
      impact: 'R&D tax credit queries are high value. Declaring this puts you in front of innovative businesses',
      tier: 'pro',
    },
  ],
  'mortgage-advisor': [
    {
      field: 'practiceAreas',
      check: (v) => !v.practiceAreas || v.practiceAreas.length === 0,
      label: 'Mortgage types not listed',
      impact: 'AI cannot match you to residential, buy-to-let, or commercial mortgage queries',
      tier: 'free',
    },
    {
      field: 'wholeOfMarket',
      check: (v) => v.wholeOfMarket === undefined || v.wholeOfMarket === null,
      label: 'Whole of market status not declared',
      impact: 'The most common mortgage adviser qualifier — clients ask AI specifically for whole of market advisers',
      tier: 'free',
    },
    {
      field: 'feeModel',
      check: (v) => !v.feeModel,
      label: 'Fee model not declared',
      impact: '"Fee free mortgage adviser near me" is one of the highest volume AI mortgage queries',
      tier: 'free',
    },
    {
      field: 'numberOfLenders',
      check: (v) => !v.numberOfLenders,
      label: 'Number of lenders not listed',
      impact: 'AI uses lender count to rank advisers — more lenders signals better market access',
      tier: 'starter',
    },
    {
      field: 'typicalCompletionTime',
      check: (v) => !v.typicalCompletionTime,
      label: 'Typical completion time not listed',
      impact: 'Clients under time pressure ask AI for fast-completion advisers',
      tier: 'starter',
    },
    {
      field: 'maximumLoanSize',
      check: (v) => !v.maximumLoanSize,
      label: 'Maximum loan size not declared',
      impact: 'High value property buyers use AI to filter advisers by loan size',
      tier: 'pro',
    },
  ],
  'estate-agent': [
    {
      field: 'practiceAreas',
      check: (v) => !v.practiceAreas || v.practiceAreas.length === 0,
      label: 'Services not listed (sales/lettings)',
      impact: 'AI cannot recommend you without knowing if you handle sales, lettings, or both',
      tier: 'free',
    },
    {
      field: 'coveragePostcodes',
      check: (v) => !v.coveragePostcodes || v.coveragePostcodes.length === 0,
      label: 'Coverage postcodes not listed',
      impact: 'Without postcodes, you miss hyperlocal queries for your exact area',
      tier: 'free',
    },
    {
      field: 'managementFeePercent',
      check: (v) => !v.managementFeePercent,
      label: 'Management fee not published',
      impact: 'Landlords ask AI to compare management fees — without this you\'re excluded from fee comparison queries',
      tier: 'free',
    },
    {
      field: 'averageSaleTime',
      check: (v) => !v.averageSaleTime,
      label: 'Average sale time not listed',
      impact: 'Sellers in a hurry ask AI for fast-selling agents — you miss time-sensitive enquiries without this',
      tier: 'starter',
    },
    {
      field: 'achievedVsAskingPercent',
      check: (v) => !v.achievedVsAskingPercent,
      label: 'Achieved vs asking price not published',
      impact: 'The single most important metric sellers ask about — publishing it builds immediate credibility',
      tier: 'starter',
    },
    {
      field: 'propertyTypesHandled',
      check: (v) => !v.propertyTypesHandled || v.propertyTypesHandled.length === 0,
      label: 'Property types not listed',
      impact: 'HMO landlords, commercial buyers, and new build purchasers all use AI to find specialist agents',
      tier: 'starter',
    },
    {
      field: 'epcAssessor',
      check: (v) => v.epcAssessor === undefined || v.epcAssessor === null,
      label: 'EPC assessment service not declared',
      impact: 'Declaring this captures landlords and sellers looking for a one-stop agent',
      tier: 'pro',
    },
  ],
  'office-equipment': [
    {
      field: 'services',
      check: (v) => !v.services || v.services.length === 0,
      label: 'Equipment types not listed',
      impact: 'AI cannot match you to specific queries — photocopier, telecoms, or CCTV searches won\'t return your firm',
      tier: 'free',
    },
    {
      field: 'brands',
      check: (v) => !v.brands || v.brands.length === 0,
      label: 'Brands not listed',
      impact: 'Businesses ask AI for specific brands — without brands you miss all brand-specific queries',
      tier: 'free',
    },
    {
      field: 'leaseVsPurchase',
      check: (v) => !v.leaseVsPurchase,
      label: 'Lease vs purchase options not declared',
      impact: 'Declaring both options doubles your query coverage',
      tier: 'free',
    },
    {
      field: 'managedPrintService',
      check: (v) => v.managedPrintService === undefined || v.managedPrintService === null,
      label: 'Managed Print Service not declared',
      impact: 'MPS is a high-value recurring contract — declaring it puts you in front of businesses searching for managed print',
      tier: 'starter',
    },
    {
      field: 'monthlyCostRange',
      check: (v) => !v.monthlyCostRange,
      label: 'Monthly cost range not published',
      impact: 'Without a cost range, AI cannot match you to budget-specific queries',
      tier: 'starter',
    },
  ],
};

export function computeProfileGaps(vendor) {
  if (!vendor) return { gaps: [], totalGaps: 0, hasProfile: false };

  const vendorType = vendor.vendorType || 'office-equipment';
  const gapDefinitions = PROFILE_GAPS[vendorType] || [];
  const gaps = gapDefinitions.filter(gap => gap.check(vendor));

  return {
    gaps: gaps.map(({ field, label, impact, tier }) => ({ field, label, impact, tier })),
    totalGaps: gaps.length,
    totalFields: gapDefinitions.length,
    completeFields: gapDefinitions.length - gaps.length,
    hasProfile: true,
    vendorType,
    isClaimed: vendor.listingStatus === 'claimed' || (vendor.tier && vendor.tier !== 'free'),
  };
}
