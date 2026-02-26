/**
 * AI Visibility Score — Hard-to-climb model
 *
 * 7 categories, 100 points total. Tier ceilings:
 *   Free vendor, fully active:       ~40/100
 *   Starter £149, fully active:      ~75/100
 *   Pro £299, fully active:          ~95/100
 *   Nobody hits 100 without doing everything.
 */

export function calculateVisibilityScore(vendor, products = [], mentionData = {}, reviewData = {}, engagementData = {}, verifiedFeatures = {}) {
  // Normalize tier
  const rawTier = vendor.tier || vendor.account?.tier || 'free';
  const tierMapping = {
    'free': 'listed', 'listed': 'listed',
    'basic': 'visible', 'visible': 'visible', 'bronze': 'visible', 'standard': 'visible',
    'managed': 'verified', 'verified': 'verified', 'silver': 'verified',
    'gold': 'verified', 'enterprise': 'verified', 'platinum': 'verified',
  };
  const tier = tierMapping[rawTier.toLowerCase()] || 'listed';
  const isVerified = tier === 'verified';

  const breakdown = {
    profile:    { earned: 0, max: 10, label: 'Profile Completeness', items: [] },
    products:   { earned: 0, max: 10, label: 'Product Catalog', items: [] },
    reviews:    { earned: 0, max: 10, label: 'Reviews', items: [] },
    mentions:   { earned: 0, max: 20, label: 'AI Mentions', items: [] },
    engagement: { earned: 0, max: 10, label: 'Engagement', items: [] },
    plan:       { earned: 0, max: 20, label: 'Plan Tier', items: [] },
    verified:   { earned: 0, max: 20, label: 'Verified Features', items: [], locked: !isVerified },
  };

  const tips = [];

  // ============================================
  // PROFILE COMPLETENESS (max 10 pts)
  // ============================================
  const hasCompanyAndLocation = !!vendor.company && !!(vendor.location?.city || vendor.location?.postcode);
  const hasContactInfo = !!(vendor.contactInfo?.phone || vendor.phone) && !!vendor.email && !!(vendor.contactInfo?.website || vendor.website);
  const description = vendor.businessProfile?.description || vendor.description || '';
  const hasDescription = description.length >= 100;
  const hasLogo = !!vendor.businessProfile?.logoUrl;
  const hasCoverageAndServices = (vendor.services || []).length > 0 && (vendor.location?.coverage || vendor.coverageAreas || []).length > 0;

  const profileChecks = [
    { name: 'Company name + location', points: 2, completed: hasCompanyAndLocation },
    { name: 'Phone, email & website', points: 2, completed: hasContactInfo },
    { name: 'Description (100+ characters)', points: 2, completed: hasDescription },
    { name: 'Logo uploaded', points: 2, completed: hasLogo },
    { name: 'Coverage areas + services defined', points: 2, completed: hasCoverageAndServices },
  ];

  profileChecks.forEach((check) => {
    breakdown.profile.items.push(check);
    if (check.completed) breakdown.profile.earned += check.points;
  });

  if (breakdown.profile.earned < 10) {
    tips.push({
      message: `Complete your profile to earn ${10 - breakdown.profile.earned} more points`,
      impact: 'medium', points: 10 - breakdown.profile.earned, priority: 10,
      category: 'profile', action: 'Go to Settings',
    });
  }

  // ============================================
  // PRODUCT CATALOG (max 10 pts)
  // ============================================
  const productCount = products.length;
  const productsWithDesc = products.filter(p => (p.description || '').length > 0).length;
  const productsWithPricing = products.filter(p =>
    p.costs?.totalMachineCost > 0 || p.costs?.machineCost > 0 ||
    p.telecomsPricing?.perUserMonthly > 0 ||
    p.cctvPricing?.perCameraCost > 0 ||
    p.itPricing?.perUserMonthly > 0 ||
    p.leaseRates?.length > 0
  ).length;

  const productChecks = [
    { name: 'Has 1+ products', points: 2, completed: productCount >= 1 },
    { name: '3+ products with descriptions', points: 3, completed: productsWithDesc >= 3 },
    { name: '5+ products with pricing', points: 5, completed: productsWithPricing >= 5 },
  ];

  productChecks.forEach((check) => {
    breakdown.products.items.push(check);
    if (check.completed) breakdown.products.earned += check.points;
  });

  if (breakdown.products.earned < 10) {
    tips.push({
      message: 'Add more products with descriptions and pricing',
      impact: 'high', points: 10 - breakdown.products.earned, priority: 15,
      category: 'products', action: 'Go to Products',
    });
  }

  // ============================================
  // REVIEWS (max 10 pts)
  // ============================================
  const { reviewCount = 0, averageRating = 0 } = reviewData || {};

  const reviewChecks = [
    { name: '1 verified review', points: 2, completed: reviewCount >= 1 },
    { name: '3+ reviews', points: 3, completed: reviewCount >= 3 },
    { name: '5+ reviews', points: 3, completed: reviewCount >= 5 },
    { name: 'Average rating 4.0+', points: 2, completed: averageRating >= 4.0 && reviewCount > 0 },
  ];

  reviewChecks.forEach((check) => {
    breakdown.reviews.items.push(check);
    if (check.completed) breakdown.reviews.earned += check.points;
  });

  if (reviewCount === 0) {
    tips.push({
      message: 'Get your first verified review to start earning points',
      impact: 'medium', points: 10, priority: 12,
      category: 'reviews', action: 'Request reviews from customers',
    });
  }

  // ============================================
  // AI MENTIONS (max 20 pts)
  // ============================================
  const { mentionsThisWeek = 0, mentionsLastWeek = 0, totalMentions30d = 0, avgPosition } = mentionData;

  const mentionChecks = [
    { name: 'Mentioned in 1+ prompts (30 days)', points: 4, completed: totalMentions30d >= 1 },
    { name: 'Mentioned in 3+ prompts', points: 4, completed: totalMentions30d >= 3 },
    { name: 'Mentioned in 5+ prompts', points: 4, completed: totalMentions30d >= 5 },
    { name: 'Average position: top 3', points: 4, completed: avgPosition === 'first' || avgPosition === 'top3' },
    { name: 'Trending up week on week', points: 4, completed: mentionsThisWeek > mentionsLastWeek && mentionsThisWeek > 0 },
  ];

  mentionChecks.forEach((check) => {
    breakdown.mentions.items.push(check);
    if (check.completed) breakdown.mentions.earned += check.points;
  });

  if (totalMentions30d === 0) {
    tips.push({
      message: "AI tools aren't mentioning you yet — improve your profile and products",
      impact: 'high', points: 20, priority: 20,
      category: 'mentions', action: null,
    });
  }

  // ============================================
  // ENGAGEMENT (max 10 pts)
  // ============================================
  const {
    loggedInLast7Days = false,
    ranSearchTestThisMonth = false,
    respondedToQuoteWithin24hrs = false,
    updatedProfileThisMonth = false,
  } = engagementData;

  const engagementChecks = [
    { name: 'Logged in within last 7 days', points: 2, completed: loggedInLast7Days },
    { name: 'Ran an AI search test this month', points: 2, completed: ranSearchTestThisMonth },
    { name: 'Responded to a quote within 24hrs', points: 3, completed: respondedToQuoteWithin24hrs },
    { name: 'Updated profile or products this month', points: 3, completed: updatedProfileThisMonth },
  ];

  engagementChecks.forEach((check) => {
    breakdown.engagement.items.push(check);
    if (check.completed) breakdown.engagement.earned += check.points;
  });

  if (breakdown.engagement.earned < 5) {
    tips.push({
      message: 'Stay active — log in, run tests, and respond to leads',
      impact: 'medium', points: 10 - breakdown.engagement.earned, priority: 8,
      category: 'engagement', action: 'Go to Dashboard',
    });
  }

  // ============================================
  // PLAN TIER (max 20 pts)
  // ============================================
  const isClaimed = vendor.listingStatus !== 'unclaimed';
  const hasBlogAddon = !!vendor.blogAddonActive;

  const planChecks = [
    { name: 'Starter plan (£149/mo)', points: 5, completed: tier === 'visible' || tier === 'verified' },
    { name: 'Pro plan (£299/mo)', points: 5, completed: tier === 'verified' },
    { name: 'Blog add-on active', points: 5, completed: hasBlogAddon },
    { name: 'Profile claimed (not unclaimed)', points: 5, completed: isClaimed },
  ];

  planChecks.forEach((check) => {
    breakdown.plan.items.push(check);
    if (check.completed) breakdown.plan.earned += check.points;
  });

  if (tier === 'listed') {
    tips.push({
      message: 'Upgrade to Starter (£149/mo) to earn plan tier points',
      impact: 'high', points: 5, priority: 18,
      category: 'plan', action: 'View Plans',
    });
  } else if (tier === 'visible') {
    tips.push({
      message: 'Upgrade to Pro (£299/mo) to unlock 20 more points',
      impact: 'high', points: 25, priority: 22,
      category: 'plan', action: 'View Plans',
    });
  }

  // ============================================
  // VERIFIED-ONLY FEATURES (max 20 pts — £149 only)
  // ============================================
  const {
    aeoAuditCompleted = false,
    schemaVerified = false,
    priorityPlacement = false,
    competitorTracking = false,
    customAiPrompt = false,
  } = verifiedFeatures;

  const verifiedChecks = [
    { name: 'AI Visibility (AEO) audit completed on website', points: 4, completed: isVerified && aeoAuditCompleted },
    { name: 'Schema.org data verified', points: 4, completed: isVerified && schemaVerified },
    { name: 'Priority placement on location pages', points: 4, completed: isVerified && priorityPlacement },
    { name: 'Competitor tracking enabled', points: 4, completed: isVerified && competitorTracking },
    { name: 'Custom AI recommendation prompt', points: 4, completed: isVerified && customAiPrompt },
  ];

  verifiedChecks.forEach((check) => {
    breakdown.verified.items.push(check);
    if (check.completed) breakdown.verified.earned += check.points;
  });

  // ============================================
  // TOTAL (capped at 100)
  // ============================================
  const rawTotal = Object.values(breakdown).reduce((sum, cat) => sum + cat.earned, 0);
  const totalScore = Math.min(rawTotal, 100);

  // Sort tips by priority desc, take top 3
  tips.sort((a, b) => b.priority - a.priority);
  const topTips = tips.slice(0, 3);

  // Max possible for this tier (practical ceiling)
  let maxPossibleForTier;
  if (tier === 'listed') maxPossibleForTier = 40;
  else if (tier === 'visible') maxPossibleForTier = 75;
  else maxPossibleForTier = 100;

  // Next tier info
  let nextTier = null;
  if (tier === 'listed') {
    nextTier = { name: 'Starter', price: '£149/mo', additionalPoints: 35 };
  } else if (tier === 'visible') {
    nextTier = { name: 'Pro', price: '£299/mo', additionalPoints: 25 };
  }

  // Backward-compat recommendations
  const recommendations = topTips.map((tip) => ({
    action: tip.message,
    points: tip.points,
    section: tip.category,
  }));

  return {
    score: totalScore,
    maxScore: 100,
    maxPossible: maxPossibleForTier,
    maxPossibleForTier,
    maxOverall: 100,
    label: getScoreLabel(totalScore),
    colour: getScoreColour(totalScore),
    tier,
    tierDisplayName: getTierDisplayName(tier),
    breakdown,
    tips: topTips,
    recommendations,
    nextTier,
    nextMilestone: getNextMilestone(totalScore),
  };
}

function getTierDisplayName(tier) {
  const names = {
    listed: 'Free',
    visible: 'Starter (£149/mo)',
    verified: 'Pro (£299/mo)',
  };
  return names[tier] || 'Free';
}

function getScoreLabel(score) {
  if (score <= 15) return 'Poor';
  if (score <= 30) return 'Fair';
  if (score <= 50) return 'Good';
  if (score <= 70) return 'Strong';
  if (score <= 85) return 'Very Strong';
  return 'Excellent';
}

function getScoreColour(score) {
  if (score <= 15) return '#ef4444';
  if (score <= 30) return '#f97316';
  if (score <= 50) return '#eab308';
  if (score <= 70) return '#3b82f6';
  if (score <= 85) return '#8b5cf6';
  return '#22c55e';
}

function getNextMilestone(score) {
  if (score < 20) return { target: 20, label: 'Fair', pointsNeeded: 20 - score };
  if (score < 40) return { target: 40, label: 'Good', pointsNeeded: 40 - score };
  if (score < 60) return { target: 60, label: 'Strong', pointsNeeded: 60 - score };
  if (score < 75) return { target: 75, label: 'Very Strong', pointsNeeded: 75 - score };
  if (score < 90) return { target: 90, label: 'Excellent', pointsNeeded: 90 - score };
  if (score < 100) return { target: 100, label: 'Perfect', pointsNeeded: 100 - score };
  return null;
}

export default { calculateVisibilityScore };
