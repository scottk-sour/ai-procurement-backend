/**
 * Calculate AI Visibility Score for a vendor
 * Score from 0-100 based on profile completeness and tier
 *
 * Scoring breakdown:
 * - PROFILE: 25 points (all vendors)
 * - PRODUCTS: 25 points (all vendors)
 * - TRUST: 20 points (all vendors)
 * - TIER BONUS: 30 points (Listed=0, Visible=15, Verified=30)
 *
 * Max scores:
 * - Listed (free): 70/100
 * - Visible (£99/mo): 85/100
 * - Verified (£149/mo): 100/100
 */

export function calculateVisibilityScore(vendor, products = []) {
  const breakdown = {
    profile: { earned: 0, max: 25, items: [] },
    products: { earned: 0, max: 25, items: [] },
    trust: { earned: 0, max: 20, items: [] },
    tierBonus: { earned: 0, max: 30, items: [] }
  };

  // Normalize tier - only 3 tiers: listed (free), visible (£99), verified (£149)
  const rawTier = vendor.tier || vendor.account?.tier || vendor.subscriptionTier || 'free';
  const tierMapping = {
    'free': 'listed',
    'listed': 'listed',
    'basic': 'visible',
    'visible': 'visible',
    'bronze': 'visible',
    'standard': 'visible',
    'managed': 'verified',
    'verified': 'verified',
    'silver': 'verified',
    'gold': 'verified',
    'enterprise': 'verified',
    'platinum': 'verified'
  };

  const tier = tierMapping[rawTier.toLowerCase()] || 'listed';
  const recommendations = [];

  // ============================================
  // PROFILE COMPLETENESS (25 pts) - All tiers
  // ============================================
  const profileChecks = [
    { field: 'company', name: 'Company name', points: 3 },
    { field: 'contactInfo.phone', name: 'Phone number', points: 4, nested: true },
    { field: 'email', name: 'Email address', points: 3 },
    { field: 'contactInfo.website', name: 'Website', points: 5, nested: true },
    { field: 'businessProfile.yearsInBusiness', name: 'Years in business', points: 3, nested: true, minValue: 1 },
    { field: 'businessProfile.description', name: 'Business description', points: 4, nested: true, minLength: 20 },
    { field: 'location.postcode', name: 'City/Postcode', points: 3, nested: true }
  ];

  profileChecks.forEach(check => {
    let completed = false;
    let value;

    if (check.nested) {
      const parts = check.field.split('.');
      value = vendor;
      for (const part of parts) {
        value = value?.[part];
        if (value === undefined) break;
      }
    } else {
      value = vendor[check.field];
    }

    if (check.minLength) {
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
        section: 'profile'
      });
    }
  });

  // ============================================
  // PRODUCT DATA (25 pts) - All tiers
  // ============================================
  const hasProducts = products.length > 0;
  const hasPricing = products.some(p =>
    (p.costs?.cpcRates?.A4Mono > 0) ||
    (p.costs?.totalMachineCost > 0) ||
    (p.leaseRates?.term36 > 0)
  );
  const hasThreeOrMore = products.length >= 3;

  breakdown.products.items = [
    { name: 'Products uploaded', points: 10, completed: hasProducts },
    { name: 'Pricing/CPC data added', points: 10, completed: hasPricing },
    { name: '3+ products listed', points: 5, completed: hasThreeOrMore }
  ];

  if (hasProducts) breakdown.products.earned += 10;
  if (hasPricing) breakdown.products.earned += 10;
  if (hasThreeOrMore) breakdown.products.earned += 5;

  if (!hasProducts) {
    recommendations.push({ action: 'Upload your product catalog', points: 10, section: 'products' });
  } else if (!hasPricing) {
    recommendations.push({ action: 'Add pricing to your products', points: 10, section: 'products' });
  }
  if (hasProducts && !hasThreeOrMore) {
    recommendations.push({ action: 'Add more products (3+ recommended)', points: 5, section: 'products' });
  }

  // ============================================
  // TRUST SIGNALS (20 pts) - All tiers
  // ============================================
  const certifications = vendor.businessProfile?.certifications || [];
  const accreditations = vendor.businessProfile?.accreditations || [];
  const brands = vendor.brands || [];
  const coverage = vendor.location?.coverage || [];

  const hasCerts = certifications.length > 0;
  const hasAccreditations = accreditations.length > 0;
  const hasBrands = brands.length > 0;
  const hasCoverage = coverage.length > 0;

  breakdown.trust.items = [
    { name: 'Certifications (ISO, etc.)', points: 5, completed: hasCerts },
    { name: 'Accreditations', points: 5, completed: hasAccreditations },
    { name: 'Brands listed', points: 5, completed: hasBrands },
    { name: 'Coverage areas', points: 5, completed: hasCoverage }
  ];

  if (hasCerts) breakdown.trust.earned += 5;
  if (hasAccreditations) breakdown.trust.earned += 5;
  if (hasBrands) breakdown.trust.earned += 5;
  if (hasCoverage) breakdown.trust.earned += 5;

  if (!hasCerts) recommendations.push({ action: 'Add certifications', points: 5, section: 'trust' });
  if (!hasAccreditations) recommendations.push({ action: 'Add accreditations', points: 5, section: 'trust' });
  if (!hasBrands) recommendations.push({ action: 'List your brands', points: 5, section: 'trust' });
  if (!hasCoverage) recommendations.push({ action: 'Set coverage areas', points: 5, section: 'trust' });

  // ============================================
  // TIER BONUS (30 pts) - Based on subscription
  // ============================================
  let tierBonus = 0;
  let tierBonusLabel = '';

  if (tier === 'verified') {
    tierBonus = 30;
    tierBonusLabel = 'Verified tier bonus';
    breakdown.tierBonus.items = [
      { name: 'Verified tier bonus', points: 30, completed: true }
    ];
  } else if (tier === 'visible') {
    tierBonus = 15;
    tierBonusLabel = 'Visible tier bonus';
    breakdown.tierBonus.items = [
      { name: 'Visible tier bonus', points: 15, completed: true },
      { name: 'Upgrade to Verified', points: 15, completed: false, upgrade: true, targetTier: 'verified', price: '£149/mo' }
    ];
    recommendations.push({
      action: 'Upgrade to Verified for +15 pts',
      points: 15,
      section: 'tierBonus',
      tier: 'verified',
      price: '£149/mo'
    });
  } else {
    // Listed (free) tier
    tierBonus = 0;
    breakdown.tierBonus.items = [
      { name: 'Upgrade to Visible', points: 15, completed: false, upgrade: true, targetTier: 'visible', price: '£99/mo' },
      { name: 'Upgrade to Verified', points: 30, completed: false, upgrade: true, targetTier: 'verified', price: '£149/mo' }
    ];
    recommendations.unshift({
      action: 'Upgrade to Visible for +15 pts',
      points: 15,
      section: 'tierBonus',
      tier: 'visible',
      price: '£99/mo'
    });
  }

  breakdown.tierBonus.earned = tierBonus;

  // Calculate total score
  const totalScore =
    breakdown.profile.earned +
    breakdown.products.earned +
    breakdown.trust.earned +
    breakdown.tierBonus.earned;

  // Calculate max possible for current tier
  const maxPossibleForTier = 70 + tierBonus; // 70 base + tier bonus

  return {
    score: totalScore,
    maxScore: 100,
    maxPossibleForTier,
    label: getScoreLabel(totalScore),
    colour: getScoreColour(totalScore),
    tier,
    tierDisplayName: getTierDisplayName(tier),
    breakdown,
    recommendations: recommendations.slice(0, 5),
    nextMilestone: getNextMilestone(totalScore)
  };
}

function getTierDisplayName(tier) {
  const names = {
    'listed': 'Listed (Free)',
    'visible': 'Visible (£99/mo)',
    'verified': 'Verified (£149/mo)'
  };
  return names[tier] || 'Listed (Free)';
}

function getScoreLabel(score) {
  if (score <= 20) return 'Poor';
  if (score <= 40) return 'Fair';
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
  if (score < 25) return { target: 25, label: 'Fair', pointsNeeded: 25 - score };
  if (score < 50) return { target: 50, label: 'Good', pointsNeeded: 50 - score };
  if (score < 70) return { target: 70, label: 'Strong', pointsNeeded: 70 - score };
  if (score < 85) return { target: 85, label: 'Excellent', pointsNeeded: 85 - score };
  if (score < 100) return { target: 100, label: 'Perfect', pointsNeeded: 100 - score };
  return null;
}

export default { calculateVisibilityScore };
