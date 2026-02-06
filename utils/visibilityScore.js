/**
 * Calculate AI Visibility Score for a vendor
 * Score from 0-100 based on profile completeness and tier
 *
 * Scoring breakdown:
 * - PROFILE COMPLETENESS: 25 points (all vendors)
 * - PRODUCT DATA: 25 points (all vendors)
 * - TRUST & REVIEWS: 20 points (all vendors)
 * - SUBSCRIPTION TIER: 30 points (Listed=0, Visible=15, Verified=30)
 *
 * Max scores:
 * - Listed (free): 70/100
 * - Visible (£99/mo): 85/100
 * - Verified (£149/mo): 100/100
 */

export function calculateVisibilityScore(vendor, products = []) {
  const breakdown = {
    profileCompleteness: { earned: 0, max: 25, label: 'Profile Completeness', subtitle: 'How findable you are', items: [] },
    productData: { earned: 0, max: 25, label: 'Product Data', subtitle: 'What AI can recommend', items: [] },
    trustAndReviews: { earned: 0, max: 20, label: 'Trust & Reviews', subtitle: 'Why customers choose you', items: [] },
    subscriptionTier: { earned: 0, max: 30, label: 'Subscription Tier', subtitle: 'Your ranking advantage', items: [] },
  };

  // Backward compatibility aliases
  Object.defineProperty(breakdown, 'profile', { get() { return breakdown.profileCompleteness; }, enumerable: false });
  Object.defineProperty(breakdown, 'products', { get() { return breakdown.productData; }, enumerable: false });
  Object.defineProperty(breakdown, 'trust', { get() { return breakdown.trustAndReviews; }, enumerable: false });
  Object.defineProperty(breakdown, 'tierBonus', { get() { return breakdown.subscriptionTier; }, enumerable: false });

  // Normalize tier
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
  const tips = [];

  // ============================================
  // PROFILE COMPLETENESS (25 pts)
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

    breakdown.profileCompleteness.items.push({
      name: check.name,
      points: check.points,
      completed,
      action: completed ? null : `Add ${check.name.toLowerCase()}`
    });

    if (completed) {
      breakdown.profileCompleteness.earned += check.points;
    } else {
      // Generate tip for missing profile field
      const tipMap = {
        'contactInfo.website': {
          message: 'Add your website so AI can link directly to you',
          impact: 'high',
          action: 'Go to Settings → Profile',
          category: 'profileCompleteness',
        },
        'contactInfo.phone': {
          message: 'Add a phone number so customers can reach you quickly',
          impact: 'medium',
          action: 'Go to Settings → Profile',
          category: 'profileCompleteness',
        },
        'businessProfile.description': {
          message: 'Write a description (20+ chars) so AI knows what you do',
          impact: 'medium',
          action: 'Go to Settings → Profile → About',
          category: 'profileCompleteness',
        },
        'location.postcode': {
          message: 'Add your postcode so AI can recommend you for local searches',
          impact: 'medium',
          action: 'Go to Settings → Profile → Location',
          category: 'profileCompleteness',
        },
        'businessProfile.yearsInBusiness': {
          message: 'Add years in business to boost trust signals',
          impact: 'low',
          action: 'Go to Settings → Profile',
          category: 'profileCompleteness',
        },
      };

      const mapped = tipMap[check.field];
      if (mapped) {
        tips.push({
          message: mapped.message,
          impact: mapped.impact,
          points: check.points,
          priority: check.points,
          category: mapped.category,
          action: mapped.action,
        });
      } else {
        tips.push({
          message: `Add ${check.name.toLowerCase()} to your profile`,
          impact: check.points >= 4 ? 'medium' : 'low',
          points: check.points,
          priority: check.points,
          category: 'profileCompleteness',
          action: 'Go to Settings → Profile',
        });
      }
    }
  });

  // ============================================
  // PRODUCT DATA (25 pts)
  // ============================================
  const hasProducts = products.length > 0;
  const hasPricing = products.some(p =>
    (p.costs?.cpcRates?.A4Mono > 0) ||
    (p.costs?.totalMachineCost > 0) ||
    (p.leaseRates?.term36 > 0)
  );
  const hasThreeOrMore = products.length >= 3;

  breakdown.productData.items = [
    { name: 'Products uploaded', points: 10, completed: hasProducts },
    { name: 'Pricing/CPC data added', points: 10, completed: hasPricing },
    { name: '3+ products listed', points: 5, completed: hasThreeOrMore }
  ];

  if (hasProducts) breakdown.productData.earned += 10;
  if (hasPricing) breakdown.productData.earned += 10;
  if (hasThreeOrMore) breakdown.productData.earned += 5;

  if (!hasProducts) {
    tips.push({
      message: 'Upload at least one product so AI can match you to buyer queries',
      impact: 'high',
      points: 10,
      priority: 10,
      category: 'productData',
      action: 'Go to Products → Add Product',
    });
  } else if (!hasPricing) {
    tips.push({
      message: 'Add CPC rates or pricing to your products — AI uses this to recommend best-value options',
      impact: 'high',
      points: 10,
      priority: 10,
      category: 'productData',
      action: 'Go to Products → Edit',
    });
  }
  if (hasProducts && !hasThreeOrMore) {
    tips.push({
      message: 'Add at least 3 products to cover more buyer requirements',
      impact: 'medium',
      points: 5,
      priority: 5,
      category: 'productData',
      action: 'Go to Products → Add Product',
    });
  }

  // ============================================
  // TRUST & REVIEWS (20 pts)
  // ============================================
  const certifications = vendor.businessProfile?.certifications || [];
  const accreditations = vendor.businessProfile?.accreditations || [];
  const brands = vendor.brands || [];
  const coverage = vendor.location?.coverage || [];

  const hasCerts = certifications.length > 0;
  const hasAccreditations = accreditations.length > 0;
  const hasBrands = brands.length > 0;
  const hasCoverage = coverage.length > 0;

  breakdown.trustAndReviews.items = [
    { name: 'Certifications (ISO, etc.)', points: 5, completed: hasCerts },
    { name: 'Accreditations', points: 5, completed: hasAccreditations },
    { name: 'Brands listed', points: 5, completed: hasBrands },
    { name: 'Coverage areas', points: 5, completed: hasCoverage }
  ];

  if (hasCerts) breakdown.trustAndReviews.earned += 5;
  if (hasAccreditations) breakdown.trustAndReviews.earned += 5;
  if (hasBrands) breakdown.trustAndReviews.earned += 5;
  if (hasCoverage) breakdown.trustAndReviews.earned += 5;

  if (!hasCerts) {
    tips.push({
      message: 'Add certifications (e.g. ISO 9001) to stand out as a trusted supplier',
      impact: 'medium',
      points: 5,
      priority: 5,
      category: 'trustAndReviews',
      action: 'Go to Settings → Profile → Certifications',
    });
  }
  if (!hasAccreditations) {
    tips.push({
      message: 'Add accreditations to increase your credibility with AI',
      impact: 'medium',
      points: 5,
      priority: 5,
      category: 'trustAndReviews',
      action: 'Go to Settings → Profile → Certifications',
    });
  }
  if (!hasBrands) {
    tips.push({
      message: 'List the brands you sell (e.g. Canon, Ricoh) so AI can match brand-specific queries',
      impact: 'medium',
      points: 5,
      priority: 5,
      category: 'trustAndReviews',
      action: 'Go to Settings → Profile → Brands',
    });
  }
  if (!hasCoverage) {
    tips.push({
      message: 'Set your coverage areas so AI recommends you for local searches',
      impact: 'medium',
      points: 5,
      priority: 5,
      category: 'trustAndReviews',
      action: 'Go to Settings → Profile → Location',
    });
  }

  // ============================================
  // SUBSCRIPTION TIER (30 pts)
  // ============================================
  let tierBonus = 0;

  if (tier === 'verified') {
    tierBonus = 30;
    breakdown.subscriptionTier.items = [
      { name: 'Verified tier bonus', points: 30, completed: true }
    ];
  } else if (tier === 'visible') {
    tierBonus = 15;
    breakdown.subscriptionTier.items = [
      { name: 'Visible tier bonus', points: 15, completed: true },
      { name: 'Upgrade to Verified', points: 15, completed: false, upgrade: true, targetTier: 'verified', price: '£149/mo' }
    ];
    tips.push({
      message: 'Upgrade to Verified for +15 visibility points, a verified badge, and unlimited products',
      impact: 'high',
      points: 15,
      priority: 15,
      category: 'subscriptionTier',
      action: 'Go to Settings → Subscription',
    });
  } else {
    // Listed (free) tier
    tierBonus = 0;
    breakdown.subscriptionTier.items = [
      { name: 'Upgrade to Visible', points: 15, completed: false, upgrade: true, targetTier: 'visible', price: '£99/mo' },
      { name: 'Upgrade to Verified', points: 30, completed: false, upgrade: true, targetTier: 'verified', price: '£149/mo' }
    ];
    tips.push({
      message: 'Upgrade to Visible for +15 visibility points, analytics, and up to 10 products',
      impact: 'high',
      points: 15,
      priority: 15,
      category: 'subscriptionTier',
      action: 'Go to Settings → Subscription',
    });
  }

  breakdown.subscriptionTier.earned = tierBonus;

  // Calculate total score
  const totalScore =
    breakdown.profileCompleteness.earned +
    breakdown.productData.earned +
    breakdown.trustAndReviews.earned +
    breakdown.subscriptionTier.earned;

  // Sort tips by points desc, take top 5
  tips.sort((a, b) => b.points - a.points);
  const topTips = tips.slice(0, 5);

  // Calculate max possible for current tier
  const maxPossible = 70 + tierBonus;

  // Next tier info
  let nextTier = null;
  if (tier === 'listed') {
    nextTier = { name: 'Visible', price: '£99/mo', additionalPoints: 15 };
  } else if (tier === 'visible') {
    nextTier = { name: 'Verified', price: '£149/mo', additionalPoints: 15 };
  }

  // Build backward-compat recommendations from tips
  const recommendations = topTips.map(tip => ({
    action: tip.message,
    points: tip.points,
    section: tip.category,
    ...(tip.category === 'subscriptionTier' ? { tier: nextTier?.name?.toLowerCase(), price: nextTier?.price } : {})
  }));

  return {
    score: totalScore,
    maxScore: 100,
    maxPossible,
    maxPossibleForTier: maxPossible, // backward compat alias
    maxOverall: 100,
    label: getScoreLabel(totalScore),
    colour: getScoreColour(totalScore),
    tier,
    tierDisplayName: getTierDisplayName(tier),
    breakdown,
    tips: topTips,
    recommendations, // backward compat
    nextTier,
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
