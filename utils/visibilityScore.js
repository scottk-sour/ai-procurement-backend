/**
 * Calculate AI Visibility Score for a vendor
 * Score from 0-100 based on tier, profile completeness, and activity
 *
 * Scoring breakdown:
 * - BASE TIER: 5-30 points (Free=5, Visible=15, Verified=30)
 * - PROFILE COMPLETENESS: up to 40 points
 * - ACTIVITY: up to 30 points
 *
 * Realistic ranges:
 * - New Visible vendor with basic info: ~30-40
 * - Fully completed Visible vendor: ~60-65
 * - Only Verified with full data and activity: 80+
 */

export function calculateVisibilityScore(vendor, products = [], activity = {}) {
  const breakdown = {
    baseTier: { earned: 0, max: 30, label: 'Subscription Tier', subtitle: 'Your base ranking', items: [] },
    profileCompleteness: { earned: 0, max: 40, label: 'Profile Completeness', subtitle: 'How findable you are', items: [] },
    activity: { earned: 0, max: 30, label: 'Activity & Engagement', subtitle: 'Signals that boost ranking', items: [] },
  };

  // Backward compatibility aliases
  Object.defineProperty(breakdown, 'subscriptionTier', { get() { return breakdown.baseTier; }, enumerable: false });
  Object.defineProperty(breakdown, 'tierBonus', { get() { return breakdown.baseTier; }, enumerable: false });
  Object.defineProperty(breakdown, 'productData', { get() { return breakdown.activity; }, enumerable: false });
  Object.defineProperty(breakdown, 'trustAndReviews', { get() { return breakdown.activity; }, enumerable: false });
  Object.defineProperty(breakdown, 'profile', { get() { return breakdown.profileCompleteness; }, enumerable: false });
  Object.defineProperty(breakdown, 'products', { get() { return breakdown.activity; }, enumerable: false });
  Object.defineProperty(breakdown, 'trust', { get() { return breakdown.activity; }, enumerable: false });

  // Normalize tier
  const rawTier = vendor.tier || vendor.account?.tier || vendor.subscriptionTier || 'free';
  const tierMapping = {
    'free': 'listed', 'listed': 'listed',
    'basic': 'visible', 'visible': 'visible', 'bronze': 'visible', 'standard': 'visible',
    'managed': 'verified', 'verified': 'verified', 'silver': 'verified',
    'gold': 'verified', 'enterprise': 'verified', 'platinum': 'verified'
  };

  const tier = tierMapping[rawTier.toLowerCase()] || 'listed';
  const tips = [];

  // ============================================
  // BASE TIER (5 / 15 / 30 pts)
  // ============================================
  let tierPoints = 5;
  if (tier === 'verified') {
    tierPoints = 30;
    breakdown.baseTier.items = [
      { name: 'Verified tier', points: 30, completed: true }
    ];
  } else if (tier === 'visible') {
    tierPoints = 15;
    breakdown.baseTier.items = [
      { name: 'Visible tier', points: 15, completed: true },
      { name: 'Upgrade to Verified', points: 15, completed: false, upgrade: true, targetTier: 'verified', price: '£149/mo' }
    ];
    tips.push({
      message: 'Upgrade to Verified for +15 base points, verified badge, and unlimited products',
      impact: 'high', points: 15, priority: 15,
      category: 'baseTier', action: 'Go to Settings → Subscription',
    });
  } else {
    tierPoints = 5;
    breakdown.baseTier.items = [
      { name: 'Free tier', points: 5, completed: true },
      { name: 'Upgrade to Visible', points: 10, completed: false, upgrade: true, targetTier: 'visible', price: '£99/mo' },
      { name: 'Upgrade to Verified', points: 25, completed: false, upgrade: true, targetTier: 'verified', price: '£149/mo' }
    ];
    tips.push({
      message: 'Upgrade to Visible for +10 base points, analytics, and up to 10 products',
      impact: 'high', points: 10, priority: 15,
      category: 'baseTier', action: 'Go to Settings → Subscription',
    });
  }
  breakdown.baseTier.earned = tierPoints;

  // ============================================
  // PROFILE COMPLETENESS (up to 40 pts)
  // ============================================
  // Company name + contact info: +5
  const hasCompanyAndContact = !!(
    vendor.company &&
    (vendor.contactInfo?.phone || vendor.phone) &&
    (vendor.email)
  );
  // Address + postcode: +5
  const hasAddress = !!(
    (vendor.location?.city || vendor.city) &&
    (vendor.location?.postcode || vendor.postcode)
  );
  // Description (2+ sentences): +5
  const description = vendor.businessProfile?.description || vendor.description || '';
  const sentenceCount = (description.match(/[.!?]+/g) || []).length;
  const hasDescription = description.length >= 40 && sentenceCount >= 2;
  // Services listed: +5
  const hasServices = (vendor.services || []).length > 0;
  // Brands listed: +5
  const hasBrands = (vendor.brands || []).length > 0;
  // Coverage area defined: +5
  const hasCoverage = (vendor.location?.coverage || vendor.coverageAreas || []).length > 0;
  // Products uploaded (at least 1): +10
  const hasProducts = products.length > 0;

  const profileChecks = [
    { name: 'Company name + contact info', points: 5, completed: hasCompanyAndContact },
    { name: 'Address + postcode', points: 5, completed: hasAddress },
    { name: 'Description (2+ sentences)', points: 5, completed: hasDescription },
    { name: 'Services listed', points: 5, completed: hasServices },
    { name: 'Brands listed', points: 5, completed: hasBrands },
    { name: 'Coverage area defined', points: 5, completed: hasCoverage },
    { name: 'Products uploaded (1+)', points: 10, completed: hasProducts },
  ];

  profileChecks.forEach(check => {
    breakdown.profileCompleteness.items.push(check);
    if (check.completed) {
      breakdown.profileCompleteness.earned += check.points;
    }
  });

  // Profile tips
  if (!hasCompanyAndContact) {
    tips.push({
      message: 'Complete company name, phone, and email so AI can recommend you',
      impact: 'medium', points: 5, priority: 5,
      category: 'profileCompleteness', action: 'Go to Settings → Profile',
    });
  }
  if (!hasAddress) {
    tips.push({
      message: 'Add your city and postcode so AI recommends you for local searches',
      impact: 'medium', points: 5, priority: 5,
      category: 'profileCompleteness', action: 'Go to Settings → Profile → Location',
    });
  }
  if (!hasDescription) {
    tips.push({
      message: 'Write a description (2+ sentences) so AI knows what you do',
      impact: 'medium', points: 5, priority: 5,
      category: 'profileCompleteness', action: 'Go to Settings → Profile → About',
    });
  }
  if (!hasServices) {
    tips.push({
      message: 'List the services you offer (Photocopiers, Telecoms, etc.)',
      impact: 'medium', points: 5, priority: 5,
      category: 'profileCompleteness', action: 'Go to Settings → Profile → Services',
    });
  }
  if (!hasBrands) {
    tips.push({
      message: 'List the brands you sell (e.g. Canon, Ricoh) so AI can match brand queries',
      impact: 'medium', points: 5, priority: 5,
      category: 'profileCompleteness', action: 'Go to Settings → Profile → Brands',
    });
  }
  if (!hasCoverage) {
    tips.push({
      message: 'Define your coverage areas so AI recommends you regionally',
      impact: 'medium', points: 5, priority: 5,
      category: 'profileCompleteness', action: 'Go to Settings → Profile → Location',
    });
  }
  if (!hasProducts) {
    tips.push({
      message: 'Upload at least one product so AI can match you to buyer queries',
      impact: 'high', points: 10, priority: 10,
      category: 'profileCompleteness', action: 'Go to Products → Add Product',
    });
  }

  // ============================================
  // ACTIVITY & ENGAGEMENT (up to 30 pts)
  // ============================================
  const hasThreePlus = products.length >= 3;
  const hasFivePlus = products.length >= 5;
  const hasPost = !!(activity.publishedPostCount && activity.publishedPostCount > 0);
  const hasCerts = (vendor.businessProfile?.certifications || []).length > 0 ||
                   (vendor.businessProfile?.accreditations || vendor.accreditations || []).length > 0;
  const hasAiMentions = !!(activity.aiMentionCount && activity.aiMentionCount > 0);
  const hasFastResponse = !!(activity.avgLeadResponseHours !== undefined &&
                             activity.avgLeadResponseHours !== null &&
                             activity.avgLeadResponseHours < 24);

  const activityChecks = [
    { name: '3+ products uploaded', points: 5, completed: hasThreePlus },
    { name: '5+ products uploaded', points: 5, completed: hasFivePlus },
    { name: 'Published a blog post', points: 5, completed: hasPost },
    { name: 'Certifications or accreditations', points: 5, completed: hasCerts },
    { name: 'AI mentions in last 30 days', points: 5, completed: hasAiMentions },
    { name: 'Lead response under 24hrs', points: 5, completed: hasFastResponse },
  ];

  activityChecks.forEach(check => {
    breakdown.activity.items.push(check);
    if (check.completed) {
      breakdown.activity.earned += check.points;
    }
  });

  // Activity tips
  if (hasProducts && !hasThreePlus) {
    tips.push({
      message: 'Upload 3+ products to cover more buyer requirements',
      impact: 'medium', points: 5, priority: 5,
      category: 'activity', action: 'Go to Products → Add Product',
    });
  }
  if (hasThreePlus && !hasFivePlus) {
    tips.push({
      message: 'Upload 5+ products for better query matching',
      impact: 'low', points: 5, priority: 3,
      category: 'activity', action: 'Go to Products → Add Product',
    });
  }
  if (!hasPost) {
    tips.push({
      message: 'Publish a blog post to boost engagement signals',
      impact: 'medium', points: 5, priority: 4,
      category: 'activity', action: 'Go to Posts → New Post',
    });
  }
  if (!hasCerts) {
    tips.push({
      message: 'Add certifications (e.g. ISO 9001) or accreditations to boost trust',
      impact: 'medium', points: 5, priority: 5,
      category: 'activity', action: 'Go to Settings → Profile → Certifications',
    });
  }
  if (!hasAiMentions) {
    tips.push({
      message: 'Complete your profile so AI starts recommending you in queries',
      impact: 'low', points: 5, priority: 2,
      category: 'activity', action: null,
    });
  }
  if (!hasFastResponse) {
    tips.push({
      message: 'Respond to leads within 24 hours to earn a fast-response bonus',
      impact: 'medium', points: 5, priority: 4,
      category: 'activity', action: 'Go to Quotes',
    });
  }

  // ============================================
  // TOTAL
  // ============================================
  const totalScore =
    breakdown.baseTier.earned +
    breakdown.profileCompleteness.earned +
    breakdown.activity.earned;

  // Sort tips by points desc, take top 5
  tips.sort((a, b) => b.points - a.points);
  const topTips = tips.slice(0, 5);

  // Max possible for current tier
  const maxPossible = (tier === 'verified' ? 30 : tier === 'visible' ? 15 : 5) + 40 + 30;

  // Next tier info
  let nextTier = null;
  if (tier === 'listed') {
    nextTier = { name: 'Visible', price: '£99/mo', additionalPoints: 10 };
  } else if (tier === 'visible') {
    nextTier = { name: 'Verified', price: '£149/mo', additionalPoints: 15 };
  }

  // Backward-compat recommendations
  const recommendations = topTips.map(tip => ({
    action: tip.message,
    points: tip.points,
    section: tip.category,
    ...(tip.category === 'baseTier' ? { tier: nextTier?.name?.toLowerCase(), price: nextTier?.price } : {})
  }));

  return {
    score: totalScore,
    maxScore: 100,
    maxPossible,
    maxPossibleForTier: maxPossible,
    maxOverall: 100,
    label: getScoreLabel(totalScore),
    colour: getScoreColour(totalScore),
    tier,
    tierDisplayName: getTierDisplayName(tier),
    breakdown,
    tips: topTips,
    recommendations,
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
