import mongoose from 'mongoose';

const factField = (dataType = mongoose.Schema.Types.Mixed) => ({
  value: { type: dataType, default: null },
  filledAt: { type: Date, default: null },
  source: { type: String, enum: ['self', 'industry_average', 'estimated', 'verified_register', null], default: null },
});

const firmFactsSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, unique: true, index: true },
  stage: {
    type: String,
    enum: ['stage1_required', 'stage2_recommended', 'stage3_optional'],
    default: 'stage1_required',
  },
  completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
  completionByStage: {
    stage1: { type: Number, default: 0 },
    stage2: { type: Number, default: 0 },
    stage3: { type: Number, default: 0 },
  },
  lastUpdatedAt: { type: Date, default: null },

  // ─── Group A: Identity (mirrored from Vendor) ───────────────
  identity: {
    firmName: factField(String),
    city: factField(String),
    vendorType: factField(String),
    primarySpecialism: factField(String),
    yearEstablished: factField(Number),
  },

  // ─── Group B: Stage 1 Required ──────────────────────────────
  stage1: {
    regulatoryNumber: factField(String),
    transactionCountLastYear: factField(Number),
    typicalAllInCost: factField(String),
  },

  // ─── Group C: Stage 2 Recommended ───────────────────────────
  stage2: {
    formalComplaintsThisYear: factField(Number),
    complaintResolutionDays: factField(Number),
    averageCompletionTimeWeeks: factField(Number),
    specialismCaseCount: factField(Number),
    teamCombinedYears: factField(Number),
    // Solicitor-specific high-frequency
    averageDisbursements: factField(String),
    fixedFeeSavingVsHourly: factField(String),
    // Accountant-specific high-frequency
    averageAnnualFees: factField(String),
    qualificationsHeld: factField(Number),
    // Mortgage-specific high-frequency
    brokerFee: factField(String),
    averageRateSavingPerYear: factField(String),
    lenderPanelSize: factField(Number),
    // Estate-specific high-frequency
    soleAgencyFeePercent: factField(String),
    achievedVsAskingPercent: factField(String),
    daysListingToSaleAgreed: factField(Number),
    // Brand identity essentials (rolled into stage2)
    clientTypes: factField([String]),
    toneOfVoice: factField(String),
    brandKeywords: factField([String]),
    uniqueSellingPoints: factField([String]),
  },

  // ─── Group D: Stage 3 Optional (by pillar) ──────────────────
  costs: {
    averageAnnualFees: factField(String),
    retainerInteractionsPerMonth: factField(Number),
    rescueCaseCount: factField(Number),
    averageHmrcExposure: factField(String),
    averageFeesAndDisbursements: factField(String),
    fiveYearSavingVsFee: factField(String),
    feeChargingRoutePercent: factField(Number),
    averagePropertySalePrice: factField(String),
    commissionIncVat: factField(String),
    onlineAgentAchievedPercent: factField(String),
    fullManagementFeePercent: factField(String),
    averageMonthlyRent: factField(String),
    costToMarketProperty: factField(String),
    pricePublicationYearShift: factField(String),
  },
  process: {
    averageStageDurationDays: factField(String),
    firstMeetingDurationMinutes: factField(Number),
    delayPercent: factField(Number),
    topDelayCause: factField(String),
    newClientPrepDocTypes: factField(Number),
    clientsWithoutAdviceMonths: factField(Number),
    averageExpensesRecovered: factField(String),
    earlyFilersDaysAhead: factField(Number),
    handoverTimeDays: factField(Number),
    mtdMigrationCount: factField(Number),
    mtdTransitionTimeWeeks: factField(Number),
    averageMortgageCompletionWeeks: factField(Number),
    offerToCompletionDays: factField(Number),
    remortgageSwitchSavingPercent: factField(Number),
    firstTimeBuyerCount: factField(Number),
    averageDepositPercent: factField(Number),
    daysListingToSaleAgreed: factField(Number),
    weeksToCompletion: factField(Number),
    propertiesSoldThisYear: factField(Number),
    buyersPurchaseCount: factField(Number),
    propertiesLetThisYear: factField(Number),
    averageVoidPeriodDays: factField(Number),
  },
  authority: {
    clientAccountLastAuditDate: factField(String),
    clientMoniesHeld: factField(String),
    amlCheckCompletionPercent: factField(Number),
    amlCheckDays: factField(Number),
    totalComplaints: factField(Number),
    totalClientsForComplaintContext: factField(Number),
    rescueCasesFromUnqualified: factField(Number),
    rescueCostToFix: factField(String),
    hmrcEnquiryCount: factField(Number),
    hmrcNoTaxDuePercent: factField(Number),
    hmrcResolutionMonths: factField(Number),
    consumerDutyFilesReviewed: factField(Number),
    materialInfoFieldCount: factField(Number),
    amlChecksCompletedThisYear: factField(Number),
    complaintsPerTransactions: factField(String),
  },
  mistakes: {
    topAvoidableMistake: factField(String),
    avoidableMistakePercent: factField(Number),
    diyRescueCasesPerYear: factField(Number),
    diyRescueCost: factField(String),
    correctFirstTimeCost: factField(String),
    contractsReviewedWithIssues: factField(Number),
    cheapQuoteClientPercent: factField(Number),
    diyBookkeepingExpensesFound: factField(String),
    incorrectExpenseClaimPercent: factField(Number),
    incorrectClaimAvgCorrection: factField(String),
    priceBuyerErrorPercent: factField(Number),
    declinedElsewherePercent: factField(Number),
    previouslyDeclinedArranged: factField(Number),
    productTransferSwitchPercent: factField(Number),
    btlMortgagesPerYear: factField(Number),
    overpricedExtraDays: factField(Number),
    overpricedReductionPercent: factField(Number),
    failedPurchaseAvoidablePercent: factField(Number),
    firstTimeBuyersCompleted: factField(Number),
    rentalPropertiesManaged: factField(Number),
    failedToSellRescueCount: factField(Number),
    rescueSoldPercent: factField(Number),
    rescueSoldWeeks: factField(Number),
  },
  rights: {
    clientsUnawareOfRights: factField(Number),
    specificRightUnknown: factField(String),
    problemScenarioHelpCount: factField(Number),
    fastestResolutionDays: factField(Number),
    clientsSurveyedUnawarePercent: factField(Number),
    freeAdviceThenPaidPercent: factField(Number),
    hmrcContactsResolvedPercent: factField(Number),
    investigationsReducedPercent: factField(Number),
    proactivePlanningOppsPerClient: factField(Number),
    planningValuePerClient: factField(String),
    referralsToFreeServicesCount: factField(Number),
    paidAdviceSavedClients: factField(Number),
    paidAdviceSavedAmount: factField(String),
    midApplicationTransferCount: factField(Number),
    midApplicationDaysAdded: factField(Number),
    suitabilityReportCriteria: factField(Number),
    minimumTieInWeeks: factField(Number),
    rentalPropertiesManagedForRights: factField(Number),
    complianceLandlordsManaged: factField(Number),
    safetyCertsRenewed: factField(Number),
    epcRatingCOrAbovePercent: factField(Number),
    cityAverageEpcPercent: factField(Number),
  },
  expertise: {
    specialistSolicitorCount: factField(Number),
    totalSolicitorCount: factField(Number),
    caseStudyDurationWeeks: factField(Number),
    industryAverageDurationWeeks: factField(Number),
    specialismPercentOfBook: factField(Number),
    equityReleaseClientsThisYear: factField(Number),
    averageEquityReleased: factField(String),
    adverseCreditMortgagesArranged: factField(Number),
    selfEmployedClientPercent: factField(Number),
    selfEmployedOfferTimeWeeks: factField(Number),
    charteredAccountantCount: factField(Number),
    charteredTaxAdviserCount: factField(Number),
    softwarePlatformsSupported: factField(Number),
    xeroMigrationPercent: factField(Number),
    caseStudySavings: factField(String),
    averagePropertyPriceSold: factField(String),
    vsLandRegistryAvgPercent: factField(String),
    newBuildPremiumPercent: factField(Number),
    averageFirstWeekEnquiries: factField(Number),
  },

  // ─── Group E: Brand Identity (stage3 extras) ────────────────
  brandIdentity: {
    partners: factField([mongoose.Schema.Types.Mixed]),
    feeEarnerCount: factField(Number),
    additionalOffices: factField([mongoose.Schema.Types.Mixed]),
    awards: factField([String]),
    memberships: factField([String]),
    competitors: factField([String]),
  },
}, { timestamps: true });

const STAGE1_PATHS = ['stage1.regulatoryNumber', 'stage1.transactionCountLastYear', 'stage1.typicalAllInCost'];
const STAGE2_PATHS = [
  'stage2.formalComplaintsThisYear', 'stage2.complaintResolutionDays', 'stage2.averageCompletionTimeWeeks',
  'stage2.specialismCaseCount', 'stage2.teamCombinedYears', 'stage2.averageDisbursements',
  'stage2.fixedFeeSavingVsHourly', 'stage2.averageAnnualFees', 'stage2.qualificationsHeld',
  'stage2.brokerFee', 'stage2.averageRateSavingPerYear', 'stage2.lenderPanelSize',
  'stage2.soleAgencyFeePercent', 'stage2.achievedVsAskingPercent', 'stage2.daysListingToSaleAgreed',
  'stage2.clientTypes', 'stage2.toneOfVoice', 'stage2.brandKeywords', 'stage2.uniqueSellingPoints',
];

function isFilled(factObj) {
  if (!factObj || factObj.value === null || factObj.value === undefined) return false;
  if (typeof factObj.value === 'string' && factObj.value.trim() === '') return false;
  if (Array.isArray(factObj.value) && factObj.value.length === 0) return false;
  return true;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function countFilledInGroup(doc, groupName) {
  const group = doc[groupName];
  if (!group || typeof group !== 'object') return { filled: 0, total: 0 };
  const keys = Object.keys(group).filter(k => k !== '_id' && typeof group[k] === 'object' && group[k] !== null && 'value' in (group[k] || {}));
  const filled = keys.filter(k => isFilled(group[k])).length;
  return { filled, total: keys.length };
}

firmFactsSchema.pre('save', function () {
  const stage1Filled = STAGE1_PATHS.filter(p => isFilled(getNestedValue(this, p))).length;
  const stage2Filled = STAGE2_PATHS.filter(p => isFilled(getNestedValue(this, p))).length;

  const groups = ['costs', 'process', 'authority', 'mistakes', 'rights', 'expertise', 'brandIdentity'];
  let stage3Filled = 0;
  let stage3Total = 0;
  for (const g of groups) {
    const { filled, total } = countFilledInGroup(this, g);
    stage3Filled += filled;
    stage3Total += total;
  }

  const s1Pct = STAGE1_PATHS.length > 0 ? Math.round((stage1Filled / STAGE1_PATHS.length) * 100) : 0;
  const s2Pct = STAGE2_PATHS.length > 0 ? Math.round((stage2Filled / STAGE2_PATHS.length) * 100) : 0;
  const s3Pct = stage3Total > 0 ? Math.round((stage3Filled / stage3Total) * 100) : 0;

  this.completionByStage = { stage1: s1Pct, stage2: s2Pct, stage3: s3Pct };

  const totalFields = STAGE1_PATHS.length + STAGE2_PATHS.length + stage3Total;
  const totalFilled = stage1Filled + stage2Filled + stage3Filled;
  this.completionPercentage = totalFields > 0 ? Math.round((totalFilled / totalFields) * 100) : 0;

  if (s1Pct === 100 && s2Pct === 100) {
    this.stage = 'stage3_optional';
  } else if (s1Pct === 100) {
    this.stage = 'stage2_recommended';
  } else {
    this.stage = 'stage1_required';
  }

  this.lastUpdatedAt = new Date();
});

firmFactsSchema.methods.isStage1Complete = function () {
  return STAGE1_PATHS.every(p => isFilled(getNestedValue(this, p)));
};

firmFactsSchema.methods.getMissingFields = function (stage) {
  if (stage === 'stage1') return STAGE1_PATHS.filter(p => !isFilled(getNestedValue(this, p)));
  if (stage === 'stage2') return STAGE2_PATHS.filter(p => !isFilled(getNestedValue(this, p)));
  const missing = [];
  for (const g of ['costs', 'process', 'authority', 'mistakes', 'rights', 'expertise']) {
    const group = this[g];
    if (!group) continue;
    for (const [k, v] of Object.entries(group.toObject ? group.toObject() : group)) {
      if (k === '_id') continue;
      if (v && typeof v === 'object' && 'value' in v && !isFilled(v)) {
        missing.push(`${g}.${k}`);
      }
    }
  }
  return missing;
};

firmFactsSchema.methods.toFirmContextBlock = function () {
  const ctx = {};
  const addIfFilled = (target, key, factObj) => {
    if (isFilled(factObj)) target[key] = factObj.value;
  };

  addIfFilled(ctx, 'company', this.identity?.firmName);
  addIfFilled(ctx, 'city', this.identity?.city);
  addIfFilled(ctx, 'vendorType', this.identity?.vendorType);
  addIfFilled(ctx, 'primarySpecialism', this.identity?.primarySpecialism);
  addIfFilled(ctx, 'yearEstablished', this.identity?.yearEstablished);
  addIfFilled(ctx, 'regulatoryNumber', this.stage1?.regulatoryNumber);
  addIfFilled(ctx, 'transactionCountLastYear', this.stage1?.transactionCountLastYear);
  addIfFilled(ctx, 'typicalAllInCost', this.stage1?.typicalAllInCost);

  for (const group of ['stage2', 'costs', 'process', 'authority', 'mistakes', 'rights', 'expertise', 'brandIdentity']) {
    const g = this[group];
    if (!g) continue;
    const obj = g.toObject ? g.toObject() : g;
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_id') continue;
      if (v && typeof v === 'object' && 'value' in v && isFilled(v)) {
        ctx[k] = v.value;
      }
    }
  }

  return ctx;
};

firmFactsSchema.statics.findOrCreateForVendor = async function (vendorId) {
  let doc = await this.findOne({ vendorId });
  if (doc) return doc;
  doc = new this({ vendorId });
  await doc.save();
  return doc;
};

export { STAGE1_PATHS, STAGE2_PATHS, isFilled };
export default mongoose.model('FirmFacts', firmFactsSchema);
