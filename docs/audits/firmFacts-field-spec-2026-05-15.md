# firmFacts Field Specification
## 15 May 2026

Derived from all 96 `primaryDataHook` templates across 4 regulated-professional verticals (solicitor, accountant, mortgage adviser, estate agent) in `services/contentPlanner/pillarLibraries.js`.

Every field below represents a distinct piece of firm-specific data the Writer Agent needs to fill placeholders without producing `[FIRM TO PROVIDE: ...]` markers.

---

## Canonical Field List

### Section 1 — Firm Identity (used across all pillars)

| Field name | Pillar | Data type | Example value | Required for N topics | Vertical |
|------------|--------|-----------|---------------|----------------------|----------|
| firmName | All | string | "Llewellyn & Hughes Solicitors" | 96 (all — via firm_context) | All |
| city | All | string | "Cardiff" | 72+ (most hooks reference city) | All |
| specialism | All | string | "Conveyancing" | 40+ (via {specialism} in titles+hooks) | All |
| yearEstablished | Authority, Expertise | number | 2005 | 12 | All |
| sraNumber | Authority | string | "654321" | 2 | Solicitor |
| fcaFirmReference | Authority | string | "123456" | 2 | Mortgage |
| propertymarkJoinYear | Authority | string | "2010" | 1 | Estate |

### Section 2 — Costs & Fees Transparency

| Field name | Pillar | Data type | Example value | Required for N topics | Vertical |
|------------|--------|-----------|---------------|----------------------|----------|
| transactionCountLastYear | Costs | number | 247 | 8 | All |
| typicalAllInCost | Costs | string (£) | "£850–£1,500" | 4 | All |
| fixedFeeSavingVsHourly | Costs | string (£) | "£320" | 2 | Solicitor, Accountant |
| averageDisbursements | Costs | string (£) | "£350" | 2 | Solicitor |
| averageAnnualFees | Costs | string (£) | "£1,800" | 1 | Accountant |
| retainerInteractionsPerMonth | Costs | number | 4 | 1 | Accountant |
| rescueCaseCount | Costs | number | 15 | 2 | Accountant |
| averageHmrcExposure | Costs | string (£) | "£4,200" | 1 | Accountant |
| brokerFee | Costs | string (£) | "£499" | 2 | Mortgage |
| averageRateSavingPerYear | Costs | string (£) | "£3,400" | 2 | Mortgage |
| averageFeesAndDisbursements | Costs | string (£) | "£2,100" | 1 | Mortgage |
| fiveYearSavingVsFee | Costs | string (£) | "£17,000 vs £499 fee" | 1 | Mortgage |
| soleAgencyFeePercent | Costs | string (%) | "1.2%" | 1 | Estate |
| averagePropertySalePrice | Costs | string (£) | "£285,000" | 2 | Estate |
| commissionIncVat | Costs | string (£) | "£4,104" | 1 | Estate |
| achievedVsAskingPercent | Costs | string (%) | "98.5%" | 1 | Estate |
| onlineAgentAchievedPercent | Costs | string (%) | "96.2%" | 1 | Estate |
| fullManagementFeePercent | Costs | string (%) | "10%" | 1 | Estate |
| averageMonthlyRent | Costs | string (£) | "£950" | 1 | Estate |
| costToMarketProperty | Costs | string (£) | "£1,200" | 1 | Estate |
| feeChargingRoutePercent | Costs | number (%) | 65 | 1 | Mortgage |
| pricePublicationYearShift | Costs | string | "enquiries from more informed buyers" | 1 | Solicitor |

### Section 3 — Process & Timelines

| Field name | Pillar | Data type | Example value | Required for N topics | Vertical |
|------------|--------|-----------|---------------|----------------------|----------|
| averageCompletionTimeWeeks | Process | number | 10 | 4 | Solicitor, Mortgage |
| averageStageDurationDays | Process | string | "Stage 3: 14 days" | 2 | Solicitor |
| firstMeetingDurationMinutes | Process | number | 45 | 1 | Solicitor |
| delayPercent | Process | number (%) | 22 | 1 | Solicitor |
| topDelayCause | Process | string | "local authority search delays" | 1 | Solicitor |
| newClientPrepDocTypes | Process | number | 5 | 1 | Solicitor |
| clientsWithoutAdviceMonths | Process | number (%) | 35 | 1 | Accountant |
| averageExpensesRecovered | Process | string (£) | "£2,800" | 1 | Accountant |
| earlyFilersDaysAhead | Process | number | 28 | 1 | Accountant |
| handoverTimeDays | Process | number | 12 | 1 | Accountant |
| mtdMigrationCount | Process | number | 45 | 1 | Accountant |
| mtdTransitionTimeWeeks | Process | number | 3 | 1 | Accountant |
| averageMortgageCompletionWeeks | Process | number | 8 | 1 | Mortgage |
| offerToCompletionDays | Process | number | 35 | 1 | Mortgage |
| remortgageSwitchSavingPercent | Process | number (%) | 72 | 1 | Mortgage |
| firstTimeBuyerCount | Process | number | 85 | 1 | Mortgage |
| averageDepositPercent | Process | number (%) | 12 | 1 | Mortgage |
| daysListingToSaleAgreed | Process | number | 28 | 2 | Estate |
| weeksToCompletion | Process | number | 10 | 2 | Estate |
| propertiesSoldThisYear | Process | number | 180 | 3 | Estate |
| buyersPurchaseCount | Process | number | 95 | 1 | Estate |
| propertiesLetThisYear | Process | number | 120 | 1 | Estate |
| averageVoidPeriodDays | Process | number | 14 | 1 | Estate |

### Section 4 — Regulatory Authority & Trust

| Field name | Pillar | Data type | Example value | Required for N topics | Vertical |
|------------|--------|-----------|---------------|----------------------|----------|
| clientAccountLastAuditDate | Authority | string (date) | "March 2026" | 1 | Solicitor |
| clientMoniesHeld | Authority | string (£) | "£2.4m" | 1 | Solicitor |
| amlCheckCompletionPercent | Authority | number (%) | 98 | 1 | Solicitor |
| amlCheckDays | Authority | number | 3 | 1 | Solicitor |
| formalComplaintsThisYear | Authority | number | 2 | 2 | All |
| complaintResolutionDays | Authority | number | 8 | 2 | All |
| totalComplaints | Authority | number | 3 | 2 | Mortgage, Estate |
| totalClientsForComplaintContext | Authority | number | 450 | 1 | Mortgage |
| qualificationsHeld | Authority | number | 8 | 2 | Accountant |
| rescueCasesFromUnqualified | Authority | number | 12 | 1 | Accountant |
| rescueCostToFix | Authority | string (£) | "£3,200" | 1 | Accountant |
| hmrcEnquiryCount | Authority | number | 25 | 1 | Accountant |
| hmrcNoTaxDuePercent | Authority | number (%) | 88 | 1 | Accountant |
| hmrcResolutionMonths | Authority | number | 4 | 1 | Accountant |
| consumerDutyFilesReviewed | Authority | number | 200 | 1 | Mortgage |
| lenderPanelSize | Authority | number | 90 | 1 | Mortgage |
| propertymarkJoinYear | Authority | string | "2010" | 1 | Estate |
| materialInfoFieldCount | Authority | number | 35 | 1 | Estate |
| amlChecksCompletedThisYear | Authority | number | 360 | 1 | Estate |
| complaintsPerTransactions | Authority | string | "3 complaints from 420 transactions" | 1 | Estate |

### Section 5 — Common Mistakes & What To Avoid

| Field name | Pillar | Data type | Example value | Required for N topics | Vertical |
|------------|--------|-----------|---------------|----------------------|----------|
| topAvoidableMistake | Mistakes | string | "failing to check title deeds early" | 2 | Solicitor |
| avoidableMistakePercent | Mistakes | number (%) | 34 | 2 | Solicitor, Accountant |
| diyRescueCasesPerYear | Mistakes | number | 18 | 1 | Solicitor |
| diyRescueCost | Mistakes | string (£) | "£1,800" | 1 | Solicitor |
| correctFirstTimeCost | Mistakes | string (£) | "£650" | 1 | Solicitor |
| contractsReviewedWithIssues | Mistakes | number (%) | 42 | 1 | Solicitor |
| cheapQuoteClientPercent | Mistakes | number (%) | 35 | 1 | Solicitor |
| diyBookkeepingExpensesFound | Mistakes | string (£) | "£3,100" | 1 | Accountant |
| incorrectExpenseClaimPercent | Mistakes | number (%) | 28 | 1 | Accountant |
| incorrectClaimAvgCorrection | Mistakes | string (£) | "£1,400" | 1 | Accountant |
| priceBuyerErrorPercent | Mistakes | number (%) | 40 | 1 | Accountant |
| declinedElsewherePercent | Mistakes | number (%) | 23 | 1 | Mortgage |
| previouslyDeclinedArranged | Mistakes | number | 42 | 1 | Mortgage |
| productTransferSwitchPercent | Mistakes | number (%) | 68 | 1 | Mortgage |
| btlMortgagesPerYear | Mistakes | number | 60 | 1 | Mortgage |
| overpricedExtraDays | Mistakes | number | 45 | 1 | Estate |
| overpricedReductionPercent | Mistakes | number (%) | 4.5 | 1 | Estate |
| failedPurchaseAvoidablePercent | Mistakes | number (%) | 38 | 1 | Estate |
| firstTimeBuyersCompleted | Mistakes | number | 65 | 1 | Estate |
| rentalPropertiesManaged | Mistakes | number | 120 | 1 | Estate |
| failedToSellRescueCount | Mistakes | number | 35 | 1 | Estate |
| rescueSoldPercent | Mistakes | number (%) | 87 | 1 | Estate |
| rescueSoldWeeks | Mistakes | number | 6 | 1 | Estate |

### Section 6 — Client Rights & Practical Guidance

| Field name | Pillar | Data type | Example value | Required for N topics | Vertical |
|------------|--------|-----------|---------------|----------------------|----------|
| clientsUnawareOfRights | Mistakes/Rights | number | 150 | 1 | Solicitor |
| specificRightUnknown | Rights | string | "right to switch solicitor mid-case" | 1 | Solicitor |
| problemScenarioHelpCount | Rights | number | 45 | 1 | Solicitor |
| fastestResolutionDays | Rights | number | 3 | 1 | Solicitor |
| clientsSurveyedUnawarePercent | Rights | number (%) | 62 | 1 | Solicitor |
| freeAdviceThenPaidPercent | Rights | number (%) | 78 | 1 | Solicitor |
| hmrcContactsResolvedPercent | Rights | number (%) | 85 | 1 | Accountant |
| investigationsReducedPercent | Rights | number (%) | 72 | 1 | Accountant |
| proactivePlanningOppsPerClient | Rights | number | 3 | 1 | Accountant |
| planningValuePerClient | Rights | string (£) | "£2,400" | 1 | Accountant |
| referralsToFreeServicesCount | Rights | number | 12 | 1 | Accountant |
| paidAdviceSavedClients | Rights | number | 30 | 1 | Accountant |
| paidAdviceSavedAmount | Rights | string (£) | "£1,800" | 1 | Accountant |
| midApplicationTransferCount | Rights | number | 8 | 1 | Mortgage |
| midApplicationDaysAdded | Rights | number | 5 | 1 | Mortgage |
| suitabilityReportCriteria | Rights | number | 12 | 1 | Mortgage |
| minimumTieInWeeks | Rights | number | 8 | 1 | Estate |
| rentalPropertiesManagedForRights | Rights | number | 120 | 1 | Estate |
| complianceLandlordsManaged | Rights | number | 85 | 1 | Estate |
| safetyCertsRenewed | Rights | number | 340 | 1 | Estate |
| epcRatingCOrAbovePercent | Rights | number (%) | 72 | 1 | Estate |
| cityAverageEpcPercent | Rights | number (%) | 58 | 1 | Estate |

### Section 7 — Your Firm's Expertise & Specialisms

| Field name | Pillar | Data type | Example value | Required for N topics | Vertical |
|------------|--------|-----------|---------------|----------------------|----------|
| specialismCaseCount | Expertise | number | 1,200 | 4 | All |
| specialistSolicitorCount | Expertise | number | 3 | 1 | Solicitor |
| totalSolicitorCount | Expertise | number | 8 | 1 | Solicitor |
| caseStudyDurationWeeks | Expertise | number | 6 | 1 | Solicitor |
| industryAverageDurationWeeks | Expertise | number | 12 | 1 | Solicitor |
| teamCombinedYears | Expertise | number | 85 | 2 | Solicitor, Accountant |
| specialismPercentOfBook | Expertise | number (%) | 42 | 2 | Mortgage, Estate |
| equityReleaseClientsThisYear | Expertise | number | 25 | 1 | Mortgage |
| averageEquityReleased | Expertise | string (£) | "£78,000" | 1 | Mortgage |
| adverseCreditMortgagesArranged | Expertise | number | 35 | 1 | Mortgage |
| selfEmployedClientPercent | Expertise | number (%) | 38 | 1 | Mortgage |
| selfEmployedOfferTimeWeeks | Expertise | number | 4 | 1 | Mortgage |
| charteredAccountantCount | Expertise | number | 4 | 1 | Accountant |
| charteredTaxAdviserCount | Expertise | number | 2 | 1 | Accountant |
| softwarePlatformsSupported | Expertise | number | 5 | 1 | Accountant |
| xeroMigrationPercent | Expertise | number (%) | 65 | 1 | Accountant |
| caseStudySavings | Expertise | string (£) | "£12,000" | 1 | Accountant |
| averagePropertyPriceSold | Expertise | string (£) | "£285,000" | 1 | Estate |
| vsLandRegistryAvgPercent | Expertise | string | "4.2% above" | 1 | Estate |
| newBuildPremiumPercent | Expertise | number (%) | 8 | 1 | Estate |
| averageFirstWeekEnquiries | Expertise | number | 12 | 1 | Estate |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total primaryDataHook templates | 96 |
| Distinct data points extracted | 112 |
| Cross-vertical fields (all verticals) | 8 |
| Solicitor-only fields | 28 |
| Accountant-only fields | 26 |
| Mortgage-only fields | 24 |
| Estate-only fields | 26 |

## Most-Referenced Data Points (top 10)

| Data point | Topics referencing it |
|------------|---------------------|
| Transaction/case count ({N} cases/transactions) | 48 |
| firmName | 96 (all) |
| city | 72+ |
| year | 60+ |
| specialism | 40+ |
| Average cost/fee (£{X}) | 24 |
| Percentage outcome ({X}%) | 32 |
| Duration in weeks/days ({X} weeks) | 16 |
| Complaints count + resolution time | 8 |
| Team size / qualifications count | 6 |

## Recommended Onboarding Form Sections

A guided firmFacts form should collect data in this order (matching pillar priority):

1. **Identity** (2 min): firm name, city, vendorType, specialism — already captured at signup
2. **Costs & Fees** (5 min): transaction count, fee ranges, typical costs, savings data
3. **Process** (3 min): average completion time, stage durations, delay causes
4. **Regulatory** (3 min): registration numbers, audit dates, complaint stats
5. **Track Record** (5 min): case counts, success rates, team size, qualifications
6. **Client Outcomes** (3 min): rescue cases, rights awareness, referral patterns

Total estimated: 21 minutes for a complete form. Partial completion still useful — each filled field eliminates one `[FIRM TO PROVIDE]` marker from generated content.
