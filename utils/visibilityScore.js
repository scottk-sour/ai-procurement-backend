/**
 * Calculate AI Visibility Score for a vendor
 * Score from 0-100 based on profile completeness and tier
 *
 * This is the core monetisation driver - vendors see how visible they
 * are to AI assistants and are encouraged to upgrade/complete profile
 */

export function calculateVisibilityScore(vendor, products = []) {
  const breakdown = {
    profile: { earned: 0, max: 40, items: [] },
    products: { earned: 0, max: 30, items: [], locked: false },
    trust: { earned: 0, max: 20, items: [], locked: false },
    optimisation: { earned: 0, max: 10, items: [], locked: false }
  };

  const tier = vendor.tier || vendor.subscriptionTier || 'free';
  const recommendations = [];

  // PROFILE COMPLETENESS (40 pts) - All tiers can earn these
  const profileChecks = [
    { field: 'company', name: 'Company name', points: 5 },
    { field: 'location.postcode', name: 'Location/postcode', points: 5, nested: true },
    { field: 'contactInfo.phone', name: 'Phone number', points: 5, nested: true },
    { field: 'email', name: 'Email address', points: 5 },
    { field: 'services', name: 'Services listed', points: 5, isArray: true },
    { field: 'location.coverage', name: 'Coverage areas', points: 5, nested: true, isArray: true },
    { field: 'businessProfile.yearsInBusiness', name: 'Years in business', points: 5, nested: true, minValue: 1 },
    { field: 'contactInfo.website', name: 'Company website', points: 5, nested: true }
  ];

  profileChecks.forEach(check => {
    let completed = false;
    let value;

    if (check.nested) {
      // Handle nested fields like 'location.postcode'
      const parts = check.field.split('.');
      value = vendor;
      for (const part of parts) {
        value = value?.[part];
        if (value === undefined) break;
      }
    } else {
      value = vendor[check.field];
    }

    if (check.isArray) {
      completed = value && Array.isArray(value) && value.length > 0;
    } else if (check.minLength) {
      completed = value && typeof value === 'string' && value.length >= check.minLength;
    } else if (check.minValue) {
      completed = value && value >= check.minValue;
    } else {
      completed = !!value && value !== '';
    }

    breakdown.profile.items.push({
      name: check.name,
      points: check.points,
      completed,
      action: completed ? null : `Add ${check.name.toLowerCase()}`
    });

    if (completed) {
      breakdown.profile.earned += check.points;
    } else {
      recommendations.push({
        action: `Add ${check.name.toLowerCase()}`,
        points: check.points,
        tier: 'free'
      });
    }
  });

  // PRODUCT DATA (30 pts) - Requires Basic tier or higher
  const isBasicOrHigher = ['basic', 'managed', 'enterprise'].includes(tier);

  if (!isBasicOrHigher) {
    breakdown.products.locked = true;
    breakdown.products.items = [
      { name: 'Upload product catalog', points: 15, completed: false, requiresTier: 'basic' },
      { name: 'Add pricing details', points: 10, completed: false, requiresTier: 'basic' },
      { name: 'Set stock availability', points: 5, completed: false, requiresTier: 'basic' }
    ];
    recommendations.push({
      action: 'Upgrade to Basic to upload products',
      points: 30,
      tier: 'basic',
      price: '£99/mo'
    });
  } else {
    const hasProducts = products.length > 0;
    const hasPricing = products.some(p => p.costs && p.costs.totalMachineCost > 0);
    const hasStock = products.some(p => p.availability && typeof p.availability.inStock === 'boolean');

    breakdown.products.items = [
      { name: 'Upload product catalog', points: 15, completed: hasProducts },
      { name: 'Add pricing details', points: 10, completed: hasPricing },
      { name: 'Set stock availability', points: 5, completed: hasStock }
    ];

    if (hasProducts) breakdown.products.earned += 15;
    if (hasPricing) breakdown.products.earned += 10;
    if (hasStock) breakdown.products.earned += 5;

    if (!hasProducts) {
      recommendations.push({ action: 'Upload your product catalog', points: 15, tier: 'basic' });
    }
    if (!hasPricing && hasProducts) {
      recommendations.push({ action: 'Add pricing to your products', points: 10, tier: 'basic' });
    }
  }

  // TRUST SIGNALS (20 pts) - Requires Basic tier or higher
  if (!isBasicOrHigher) {
    breakdown.trust.locked = true;
    breakdown.trust.items = [
      { name: 'ISO certifications', points: 5, completed: false, requiresTier: 'basic' },
      { name: 'Brand partnerships', points: 5, completed: false, requiresTier: 'basic' },
      { name: 'Accreditations', points: 5, completed: false, requiresTier: 'basic' },
      { name: 'Verified badge', points: 5, completed: false, requiresTier: 'managed' }
    ];
  } else {
    const certs = vendor.businessProfile?.certifications || [];
    const brands = vendor.businessProfile?.accreditations || [];
    const accreditations = vendor.businessProfile?.specializations || [];
    const isManaged = ['managed', 'enterprise'].includes(tier);
    const isVerified = vendor.account?.verificationStatus === 'verified';

    const hasCerts = certs.length > 0;
    const hasBrands = brands.length > 0;
    const hasAccreditations = accreditations.length > 0;

    breakdown.trust.items = [
      { name: 'ISO certifications', points: 5, completed: hasCerts },
      { name: 'Brand partnerships', points: 5, completed: hasBrands },
      { name: 'Accreditations', points: 5, completed: hasAccreditations },
      { name: 'Verified badge', points: 5, completed: isManaged && isVerified, requiresTier: 'managed' }
    ];

    if (hasCerts) breakdown.trust.earned += 5;
    if (hasBrands) breakdown.trust.earned += 5;
    if (hasAccreditations) breakdown.trust.earned += 5;
    if (isManaged && isVerified) breakdown.trust.earned += 5;

    if (!hasCerts) {
      recommendations.push({ action: 'Add your certifications (ISO, etc.)', points: 5, tier: 'basic' });
    }
  }

  // AI OPTIMISATION (10 pts) - Requires Managed/Enterprise
  const isManagedOrHigher = ['managed', 'enterprise'].includes(tier);

  breakdown.optimisation.locked = !isManagedOrHigher;

  if (!isManagedOrHigher) {
    breakdown.optimisation.items = [
      { name: 'Real-time sync enabled', points: 5, completed: false, requiresTier: 'managed' },
      { name: 'API connection active', points: 5, completed: false, requiresTier: 'enterprise' }
    ];
    recommendations.push({
      action: 'Upgrade to Managed for real-time AI sync',
      points: 10,
      tier: 'managed',
      price: '£150/mo'
    });
  } else {
    const hasAutoQuote = vendor.integration?.autoQuoteGeneration === true;
    const hasApiKey = !!vendor.integration?.apiKey;
    const isEnterprise = tier === 'enterprise';

    breakdown.optimisation.items = [
      { name: 'Real-time sync enabled', points: 5, completed: hasAutoQuote },
      { name: 'API connection active', points: 5, completed: isEnterprise && hasApiKey }
    ];

    if (hasAutoQuote) breakdown.optimisation.earned += 5;
    if (isEnterprise && hasApiKey) breakdown.optimisation.earned += 5;
  }

  // Calculate total score
  const totalScore =
    breakdown.profile.earned +
    breakdown.products.earned +
    breakdown.trust.earned +
    breakdown.optimisation.earned;

  return {
    score: totalScore,
    maxScore: 100,
    label: getScoreLabel(totalScore),
    colour: getScoreColour(totalScore),
    tier,
    breakdown,
    recommendations: recommendations.slice(0, 5), // Top 5 recommendations
    nextMilestone: getNextMilestone(totalScore)
  };
}

function getScoreLabel(score) {
  if (score <= 20) return 'Poor';
  if (score <= 40) return 'Basic';
  if (score <= 60) return 'Good';
  if (score <= 80) return 'Strong';
  return 'Excellent';
}

function getScoreColour(score) {
  if (score <= 20) return '#ef4444'; // red
  if (score <= 40) return '#f97316'; // orange
  if (score <= 60) return '#eab308'; // yellow
  if (score <= 80) return '#3b82f6'; // blue
  return '#22c55e'; // green
}

function getNextMilestone(score) {
  if (score < 20) return { target: 20, label: 'Basic', pointsNeeded: 20 - score };
  if (score < 40) return { target: 40, label: 'Good', pointsNeeded: 40 - score };
  if (score < 60) return { target: 60, label: 'Strong', pointsNeeded: 60 - score };
  if (score < 80) return { target: 80, label: 'Excellent', pointsNeeded: 80 - score };
  return { target: 100, label: 'Perfect', pointsNeeded: 100 - score };
}

export default { calculateVisibilityScore };
