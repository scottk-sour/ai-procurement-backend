const validateQuoteRequest = (req, res, next) => {
  try {
    const userRequirements = req.body;

    // Check if request body exists
    if (!userRequirements || typeof userRequirements !== 'object') {
      console.error("❌ ERROR: Missing or invalid request body.");
      return res.status(400).json({
        error: "Invalid or missing request data.",
        details: ["Request body must be a valid object with user requirements"]
      });
    }

    // Validate required fields from QuoteRequest schema
    const requiredFields = [
      'companyName',
      'contactName',
      'email',
      'industryType',
      'numEmployees',
      'numLocations',
      'monthlyVolume.mono',
      'monthlyVolume.colour',
      'monthlyVolume.total',
      'paperRequirements.primarySize',
      'currentSetup.machineAge',
      'requirements.priority',
      'budget.maxLeasePrice',
      'urgency.timeframe',
      'location.postcode'
    ];

    const missingFields = [];
    requiredFields.forEach(field => {
      const value = getNestedValue(userRequirements, field);
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        missingFields.push(field);
      }
    });

    // Validate specific formats
    if (userRequirements.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userRequirements.email)) {
      missingFields.push('email (invalid format)');
    }
    if (userRequirements.location?.postcode && !/^[A-Z0-9]{2,4}\s?[A-Z0-9]{3}$/i.test(userRequirements.location.postcode)) {
      missingFields.push('location.postcode (invalid format)');
    }

    if (missingFields.length > 0) {
      console.error("❌ ERROR: Missing or invalid required fields:", missingFields);
      return res.status(400).json({
        error: "Missing or invalid required fields",
        details: missingFields.map(field => `Path \`${field}\` is required or invalid.`)
      });
    }

    // Sanitize and provide defaults for userRequirements
    req.validatedUserRequirements = {
      // Required fields with defaults
      companyName: userRequirements.companyName?.trim() || 'Unknown Company',
      contactName: userRequirements.contactName?.trim() || 'Unknown Contact',
      email: userRequirements.email?.trim() || 'unknown@example.com',
      industryType: userRequirements.industryType?.trim() || 'Other',
      numEmployees: Number(userRequirements.numEmployees) || 1,
      numLocations: Math.abs(Number(userRequirements.numLocations)) || 1,
      monthlyVolume: {
        mono: Number(userRequirements.monthlyVolume?.mono) || 0,
        colour: Number(userRequirements.monthlyVolume?.colour) || 0,
        total: Number(userRequirements.monthlyVolume?.total) ||
               (Number(userRequirements.monthlyVolume?.mono) || 0) + 
               (Number(userRequirements.monthlyVolume?.colour) || 0) || 1
      },
      paperRequirements: {
        primarySize: userRequirements.paperRequirements?.primarySize || userRequirements.type || 'A4',
        additionalSizes: Array.isArray(userRequirements.paperRequirements?.additionalSizes) ? userRequirements.paperRequirements.additionalSizes : [],
        specialPaper: Boolean(userRequirements.paperRequirements?.specialPaper),
        specialPaperTypes: Array.isArray(userRequirements.paperRequirements?.specialPaperTypes) ? userRequirements.paperRequirements.specialPaperTypes : []
      },
      currentSetup: {
        machineAge: userRequirements.currentSetup?.machineAge || userRequirements.currentEquipmentAge || 'No current machine',
        currentSupplier: userRequirements.serviceProvider?.trim() || undefined,
        contractEndDate: userRequirements.contractEndDate ? new Date(userRequirements.contractEndDate) : undefined,
        currentCosts: {
          monoRate: Number(userRequirements.currentMonoCPC) || undefined,
          colourRate: Number(userRequirements.currentColorCPC) || undefined,
          quarterlyLeaseCost: Number(userRequirements.quarterlyLeaseCost) || undefined,
          quarterlyService: undefined
        },
        painPoints: Array.isArray(userRequirements.primaryChallenges) ? userRequirements.primaryChallenges : [],
        satisfactionLevel: undefined
      },
      requirements: {
        priority: userRequirements.requirements?.priority || userRequirements.preference || 'cost',
        essentialFeatures: Array.isArray(userRequirements.required_functions) ? userRequirements.required_functions : [],
        niceToHaveFeatures: Array.isArray(userRequirements.requirements?.niceToHaveFeatures) ? userRequirements.requirements.niceToHaveFeatures : [],
        minSpeed: Number(userRequirements.min_speed) || undefined,
        maxNoiseLevel: undefined,
        environmentalConcerns: Boolean(userRequirements.sustainabilityGoals)
      },
      budget: {
        maxLeasePrice: Number(userRequirements.budget?.maxLeasePrice) || Number(userRequirements.max_lease_price) || 100,
        preferredTerm: userRequirements.contractLengthPreference?.trim() || '36 months',
        includeService: true,
        includeConsumables: true
      },
      urgency: {
        timeframe: userRequirements.urgency?.timeframe || userRequirements.implementationTimeline || 'Within 1 month',
        reason: userRequirements.currentPainPoints?.trim() || undefined
      },
      location: {
        postcode: userRequirements.location?.postcode?.trim() || userRequirements.postcode?.trim() || 'Unknown',
        city: undefined,
        region: undefined,
        installationRequirements: undefined
      },
      // Optional fields
      subSector: userRequirements.subSector?.trim() || undefined,
      annualRevenue: userRequirements.annualRevenue?.trim() || undefined,
      officeBasedEmployees: Number(userRequirements.officeBasedEmployees) || undefined,
      primaryBusinessActivity: userRequirements.primaryBusinessActivity?.trim() || undefined,
      organizationStructure: userRequirements.organizationStructure?.trim() || undefined,
      multiFloor: Boolean(userRequirements.multiFloor),
      primaryChallenges: Array.isArray(userRequirements.primaryChallenges) ? userRequirements.primaryChallenges : [],
      currentPainPoints: userRequirements.currentPainPoints?.trim() || undefined,
      impactOnProductivity: userRequirements.impactOnProductivity?.trim() || undefined,
      urgencyLevel: userRequirements.urgencyLevel?.trim() || undefined,
      budgetCycle: userRequirements.budgetCycle?.trim() || undefined,
      monthlyPrintVolume: Number(userRequirements.monthlyPrintVolume) || undefined,
      annualPrintVolume: Number(userRequirements.annualPrintVolume) || undefined,
      peakUsagePeriods: userRequirements.peakUsagePeriods?.trim() || undefined,
      documentTypes: Array.isArray(userRequirements.documentTypes) ? userRequirements.documentTypes : [],
      averagePageCount: userRequirements.averagePageCount?.trim() || undefined,
      finishingRequirements: Array.isArray(userRequirements.finishingRequirements) ? userRequirements.finishingRequirements : [],
      networkSetup: userRequirements.networkSetup?.trim() || undefined,
      itSupportStructure: userRequirements.itSupportStructure?.trim() || undefined,
      securityRequirements: Array.isArray(userRequirements.securityRequirements) ? userRequirements.securityRequirements : [],
      currentSoftwareEnvironment: userRequirements.currentSoftwareEnvironment?.trim() || undefined,
      cloudPreference: userRequirements.cloudPreference?.trim() || undefined,
      integrationNeeds: Array.isArray(userRequirements.integrationNeeds) ? userRequirements.integrationNeeds : [],
      mobileRequirements: Boolean(userRequirements.mobileRequirements),
      remoteWorkImpact: userRequirements.remoteWorkImpact?.trim() || undefined,
      currentColorCPC: Number(userRequirements.currentColorCPC) || undefined,
      currentMonoCPC: Number(userRequirements.currentMonoCPC) || undefined,
      quarterlyLeaseCost: Number(userRequirements.quarterlyLeaseCost) || undefined,
      totalAnnualCosts: Number(userRequirements.totalAnnualCosts) || undefined,
      hiddenCosts: userRequirements.hiddenCosts?.trim() || undefined,
      leasingCompany: userRequirements.leasingCompany?.trim() || undefined,
      serviceProvider: userRequirements.serviceProvider?.trim() || undefined,
      contractStartDate: userRequirements.contractStartDate ? new Date(userRequirements.contractStartDate) : undefined,
      contractEndDate: userRequirements.contractEndDate ? new Date(userRequirements.contractEndDate) : undefined,
      maintenanceIssues: userRequirements.maintenanceIssues?.trim() || undefined,
      additionalServices: Array.isArray(userRequirements.additionalServices) ? userRequirements.additionalServices : [],
      paysForScanning: Boolean(userRequirements.paysForScanning),
      serviceType: userRequirements.serviceType?.trim() || 'Photocopiers',
      colour: userRequirements.colour?.trim() || undefined,
      min_speed: Number(userRequirements.min_speed) || undefined,
      securityFeatures: Array.isArray(userRequirements.securityFeatures) ? userRequirements.securityFeatures : [],
      accessibilityNeeds: Boolean(userRequirements.accessibilityNeeds),
      sustainabilityGoals: userRequirements.sustainabilityGoals?.trim() || undefined,
      responseTimeExpectation: userRequirements.responseTimeExpectation?.trim() || undefined,
      maintenancePreference: userRequirements.maintenancePreference?.trim() || undefined,
      trainingNeeds: userRequirements.trainingNeeds?.trim() || undefined,
      supplyManagement: userRequirements.supplyManagement?.trim() || undefined,
      reportingNeeds: Array.isArray(userRequirements.reportingNeeds) ? userRequirements.reportingNeeds : [],
      vendorRelationshipType: userRequirements.vendorRelationshipType?.trim() || undefined,
      decisionMakers: Array.isArray(userRequirements.decisionMakers) ? userRequirements.decisionMakers : [],
      evaluationCriteria: Array.isArray(userRequirements.evaluationCriteria) ? userRequirements.evaluationCriteria : [],
      contractLengthPreference: userRequirements.contractLengthPreference?.trim() || undefined,
      pricingModelPreference: userRequirements.pricingModelPreference?.trim() || undefined,
      required_functions: Array.isArray(userRequirements.required_functions) ? userRequirements.required_functions : [],
      roiExpectations: userRequirements.roiExpectations?.trim() || undefined,
      expectedGrowth: userRequirements.expectedGrowth?.trim() || undefined,
      expansionPlans: userRequirements.expansionPlans?.trim() || undefined,
      technologyRoadmap: userRequirements.technologyRoadmap?.trim() || undefined,
      digitalTransformation: userRequirements.digitalTransformation?.trim() || undefined,
      threeYearVision: userRequirements.threeYearVision?.trim() || undefined,
      status: 'pending',
      submittedBy: userRequirements.submittedBy || userRequirements.userId || undefined,
      userId: userRequirements.userId || undefined
    };

    console.log("✅ Validated comprehensive userRequirements");
    console.log("📊 Company:", req.validatedUserRequirements.companyName);
    console.log("📊 Industry:", req.validatedUserRequirements.industryType);
    console.log("📊 Monthly Volume:", req.validatedUserRequirements.monthlyVolume.total);
    console.log("📊 Budget:", req.validatedUserRequirements.budget.maxLeasePrice);
    next(); // Proceed to the next middleware
  } catch (error) {
    console.error("❌ ERROR in validateQuoteRequest middleware:", error.message);
    res.status(500).json({
      error: "Internal server error during validation.",
      details: [error.message]
    });
  }
};

// Helper function to get nested object values
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

export default validateQuoteRequest;
