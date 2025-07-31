const validateQuoteRequest = (req, res, next) => {
  try {
    const userRequirements = req.body;
    
    // ✅ Check if request body exists
    if (!userRequirements || typeof userRequirements !== 'object') {
      console.error("❌ ERROR: Missing or invalid request body.");
      return res.status(400).json({ 
        error: "Invalid or missing request data.",
        details: ["Request body must be a valid object with user requirements"]
      });
    }

    // ✅ FIXED: Validate required fields that actually exist in your form
    const requiredFields = [
      'companyName',
      'industryType', 
      'numEmployees',
      'postcode', // Added this since it's required by backend
      'implementationTimeline', // This is what your form actually sends
      'max_lease_price', // This is what your form actually sends
      'preference', // This is what your form actually sends
      'type' // This is what your form actually sends (paper size)
    ];

    const missingFields = [];
    requiredFields.forEach(field => {
      const value = getNestedValue(userRequirements, field);
      if (!value && value !== 0) {
        missingFields.push(field);
      }
    });

    // ✅ Also check for monthly volume (either individual or total)
    const hasMonthlyVolume = userRequirements.monthlyVolume?.mono || 
                            userRequirements.monthlyVolume?.colour ||
                            userRequirements.monthlyVolume?.total ||
                            userRequirements.monthlyPrintVolume;
    
    if (!hasMonthlyVolume) {
      missingFields.push('monthlyVolume (mono, colour, or total)');
    }

    if (missingFields.length > 0) {
      console.error("❌ ERROR: Missing required fields:", missingFields);
      return res.status(400).json({ 
        error: "Missing required fields",
        details: missingFields.map(field => `Path \`${field}\` is required.`)
      });
    }

    // ✅ Sanitize and validate data with comprehensive defaults
    req.validatedUserRequirements = {
      // Company Profile
      companyName: userRequirements.companyName?.trim() || '',
      contactName: userRequirements.contactName?.trim() || '',
      email: userRequirements.email?.trim() || '',
      industryType: userRequirements.industryType?.trim() || '',
      subSector: userRequirements.subSector?.trim() || '',
      annualRevenue: userRequirements.annualRevenue?.trim() || '',
      numEmployees: Number(userRequirements.numEmployees) || 0,
      officeBasedEmployees: Number(userRequirements.officeBasedEmployees) || 0,
      numLocations: Math.abs(Number(userRequirements.numLocations)) || 1,
      primaryBusinessActivity: userRequirements.primaryBusinessActivity?.trim() || '',
      organizationStructure: userRequirements.organizationStructure?.trim() || '',
      multiFloor: Boolean(userRequirements.multiFloor),

      // Location - FIXED: Handle both possible field locations
      location: {
        postcode: userRequirements.location?.postcode?.trim() || userRequirements.postcode?.trim() || ''
      },

      // Challenges & Timeline
      primaryChallenges: Array.isArray(userRequirements.primaryChallenges) 
        ? userRequirements.primaryChallenges 
        : [],
      currentPainPoints: userRequirements.currentPainPoints?.trim() || '',
      impactOnProductivity: userRequirements.impactOnProductivity?.trim() || '',
      urgencyLevel: userRequirements.urgencyLevel?.trim() || '',
      
      // FIXED: Map from actual form field
      urgency: {
        timeframe: userRequirements.urgency?.timeframe || userRequirements.implementationTimeline || ''
      },
      
      budgetCycle: userRequirements.budgetCycle?.trim() || '',

      // Volume & Usage - FIXED: Better handling of volume data
      monthlyPrintVolume: Number(userRequirements.monthlyPrintVolume) || 0,
      annualPrintVolume: Number(userRequirements.annualPrintVolume) || 0,
      
      monthlyVolume: {
        colour: Number(userRequirements.monthlyVolume?.colour) || 0,
        mono: Number(userRequirements.monthlyVolume?.mono) || 0,
        total: userRequirements.monthlyVolume?.total || 
               (Number(userRequirements.monthlyVolume?.colour) || 0) + 
               (Number(userRequirements.monthlyVolume?.mono) || 0) ||
               Number(userRequirements.monthlyPrintVolume) || 0
      },
      
      peakUsagePeriods: userRequirements.peakUsagePeriods?.trim() || '',
      documentTypes: Array.isArray(userRequirements.documentTypes) 
        ? userRequirements.documentTypes 
        : [],
      averagePageCount: userRequirements.averagePageCount?.trim() || '',
      finishingRequirements: Array.isArray(userRequirements.finishingRequirements) 
        ? userRequirements.finishingRequirements 
        : [],

      // Technical Environment
      networkSetup: userRequirements.networkSetup?.trim() || '',
      itSupportStructure: userRequirements.itSupportStructure?.trim() || '',
      securityRequirements: Array.isArray(userRequirements.securityRequirements) 
        ? userRequirements.securityRequirements 
        : [],
      currentSoftwareEnvironment: userRequirements.currentSoftwareEnvironment?.trim() || '',
      cloudPreference: userRequirements.cloudPreference?.trim() || '',
      integrationNeeds: Array.isArray(userRequirements.integrationNeeds) 
        ? userRequirements.integrationNeeds 
        : [],
      mobileRequirements: Boolean(userRequirements.mobileRequirements),
      remoteWorkImpact: userRequirements.remoteWorkImpact?.trim() || '',

      // Current Setup & Costs
      currentColorCPC: Number(userRequirements.currentColorCPC) || 0,
      currentMonoCPC: Number(userRequirements.currentMonoCPC) || 0,
      quarterlyLeaseCost: Number(userRequirements.quarterlyLeaseCost) || 0,
      totalAnnualCosts: Number(userRequirements.totalAnnualCosts) || 0,
      hiddenCosts: userRequirements.hiddenCosts?.trim() || '',
      leasingCompany: userRequirements.leasingCompany?.trim() || '',
      serviceProvider: userRequirements.serviceProvider?.trim() || '',
      contractStartDate: userRequirements.contractStartDate || '',
      contractEndDate: userRequirements.contractEndDate || '',
      maintenanceIssues: userRequirements.maintenanceIssues?.trim() || '',

      currentSetup: {
        machineAge: userRequirements.currentSetup?.machineAge || userRequirements.currentEquipmentAge || ''
      },

      // Requirements & Specifications
      additionalServices: Array.isArray(userRequirements.additionalServices) 
        ? userRequirements.additionalServices 
        : [],
      paysForScanning: Boolean(userRequirements.paysForScanning),
      serviceType: userRequirements.serviceType?.trim() || 'Photocopiers',
      colour: userRequirements.colour?.trim() || '',
      
      // FIXED: Map from actual form field
      paperRequirements: {
        primarySize: userRequirements.paperRequirements?.primarySize || userRequirements.type || ''
      },
      
      min_speed: Number(userRequirements.min_speed) || 0,
      securityFeatures: Array.isArray(userRequirements.securityFeatures) 
        ? userRequirements.securityFeatures 
        : [],
      accessibilityNeeds: Boolean(userRequirements.accessibilityNeeds),
      sustainabilityGoals: userRequirements.sustainabilityGoals?.trim() || '',

      // Service & Support
      responseTimeExpectation: userRequirements.responseTimeExpectation?.trim() || '',
      maintenancePreference: userRequirements.maintenancePreference?.trim() || '',
      trainingNeeds: userRequirements.trainingNeeds?.trim() || '',
      supplyManagement: userRequirements.supplyManagement?.trim() || '',
      reportingNeeds: Array.isArray(userRequirements.reportingNeeds) 
        ? userRequirements.reportingNeeds 
        : [],
      vendorRelationshipType: userRequirements.vendorRelationshipType?.trim() || '',

      // Decision Process
      decisionMakers: Array.isArray(userRequirements.decisionMakers) 
        ? userRequirements.decisionMakers 
        : [],
      evaluationCriteria: Array.isArray(userRequirements.evaluationCriteria) 
        ? userRequirements.evaluationCriteria 
        : [],
      contractLengthPreference: userRequirements.contractLengthPreference?.trim() || '',
      pricingModelPreference: userRequirements.pricingModelPreference?.trim() || '',
      required_functions: Array.isArray(userRequirements.required_functions) 
        ? userRequirements.required_functions 
        : [],
      
      // FIXED: Map from actual form field
      requirements: {
        priority: userRequirements.requirements?.priority || userRequirements.preference || ''
      },
      
      // FIXED: Map from actual form field
      budget: {
        maxLeasePrice: Number(userRequirements.budget?.maxLeasePrice) || 
                      Number(userRequirements.max_lease_price) || 0
      },
      
      roiExpectations: userRequirements.roiExpectations?.trim() || '',

      // Future Planning
      expectedGrowth: userRequirements.expectedGrowth?.trim() || '',
      expansionPlans: userRequirements.expansionPlans?.trim() || '',
      technologyRoadmap: userRequirements.technologyRoadmap?.trim() || '',
      digitalTransformation: userRequirements.digitalTransformation?.trim() || '',
      threeYearVision: userRequirements.threeYearVision?.trim() || '',

      // Status & Metadata
      status: 'Pending',
      submittedBy: userRequirements.submittedBy || '',
      userId: userRequirements.userId || ''
    };

    console.log("✅ Validated comprehensive userRequirements");
    console.log("📊 Company:", req.validatedUserRequirements.companyName);
    console.log("📊 Industry:", req.validatedUserRequirements.industryType);
    console.log("📊 Monthly Volume:", req.validatedUserRequirements.monthlyVolume.total);
    console.log("📊 Budget:", req.validatedUserRequirements.budget.maxLeasePrice);

    next(); // ✅ Proceed to the next middleware
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
