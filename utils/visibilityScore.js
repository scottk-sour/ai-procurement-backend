/**
 * Calculate AI Visibility Score for a vendor
 * Blended score from 0-100 across 4 components:
 *
 * - PROFILE COMPLETENESS: max 30 points (30%)
 * - PRODUCT DATA: max 20 points (20%)
 * - GEO AUDIT: max 25 points (25%)
 * - AI MENTIONS: max 25 points (25%)
 *
 * A vendor with a perfect profile but no GEO audit and no AI mentions
 * maxes out at 50/100. This is intentional — it forces engagement
 * with the features that actually drive AI visibility.
 */

export function calculateVisibilityScore(vendor, products = [], mentionData = {}, geoAuditScore = null, reviewData = {}) {
  const breakdown = {
    profile: { earned: 0, max: 30, label: 'Profile Completeness', items: [] },
    products: { earned: 0, max: 20, label: 'Product Data', items: [] },
    geo: { earned: 0, max: 25, label: 'GEO Audit', items: [] },
    mentions: { earned: 0, max: 25, label: 'AI Mentions', items: [] },
  };

  // Backward compatibility aliases (old code may reference these)
  Object.defineProperty(breakdown, 'baseTier', { get() { return breakdown.profile; }, enumerable: false });
  Object.defineProperty(breakdown, 'subscriptionTier', { get() { return breakdown.profile; }, enumerable: false });
  Object.defineProperty(breakdown, 'tierBonus', { get() { return breakdown.profile; }, enumerable: false });
  Object.defineProperty(breakdown, 'profileCompleteness', { get() { return breakdown.profile; }, enumerable: false });
  Object.defineProperty(breakdown, 'productData', { get() { return breakdown.products; }, enumerable: false });
  Object.defineProperty(breakdown, 'activity', { get() { return breakdown.mentions; }, enumerable: false });
  Object.defineProperty(breakdown, 'trustAndReviews', { get() { return breakdown.mentions; }, enumerable: false });

  const tips = [];

  // Normalize tier for display
  const rawTier = vendor.tier || vendor.account?.tier || 'free';
  const tierMapping = {
    'free': 'listed', 'listed': 'listed',
    'basic': 'visible', 'visible': 'visible', 'bronze': 'visible', 'standard': 'visible',
    'managed': 'verified', 'verified': 'verified', 'silver': 'verified',
    'gold': 'verified', 'enterprise': 'verified', 'platinum': 'verified',
  };
  const tier = tierMapping[rawTier.toLowerCase()] || 'listed';

  // ============================================
  // PROFILE COMPLETENESS (max 30 pts)
  // ============================================
  const hasCompanyName = !!vendor.company;
  const hasLocation = !!(vendor.location?.city || vendor.location?.postcode);
  const hasPhone = !!(vendor.contactInfo?.phone || vendor.phone);
  const hasEmail = !!vendor.email;
  const hasWebsite = !!(vendor.contactInfo?.website || vendor.website);
  const description = vendor.businessProfile?.description || vendor.description || '';
  const hasDescription = description.length >= 50;
  const hasLogo = !!vendor.businessProfile?.logoUrl;
  const hasServices = (vendor.services || []).length > 0;
  const hasCoverage = (vendor.location?.coverage || vendor.coverageAreas || []).length > 0;
  const hasBrands = (vendor.brands || []).length > 0 ||
    (vendor.businessProfile?.certifications || []).length > 0;

  const profileChecks = [
    { name: 'Company name', points: 3, completed: hasCompanyName },
    { name: 'Location/postcode', points: 3, completed: hasLocation },
    { name: 'Phone number', points: 3, completed: hasPhone },
    { name: 'Email address', points: 3, completed: hasEmail },
    { name: 'Website URL', points: 3, completed: hasWebsite },
    { name: 'Description (50+ chars)', points: 3, completed: hasDescription },
    { name: 'Logo uploaded', points: 3, completed: hasLogo },
    { name: 'Services listed', points: 3, completed: hasServices },
    { name: 'Coverage areas defined', points: 3, completed: hasCoverage },
    { name: 'Brands/certifications listed', points: 3, completed: hasBrands },
  ];

  profileChecks.forEach((check) => {
    breakdown.profile.items.push(check);
    if (check.completed) breakdown.profile.earned += check.points;
  });

  const profileMissing = profileChecks.filter((c) => !c.completed);
  if (profileMissing.length > 0) {
    const totalMissing = profileMissing.reduce((s, c) => s + c.points, 0);
    tips.push({
      message: `Complete your profile to gain up to ${totalMissing} points`,
      impact: totalMissing >= 9 ? 'high' : 'medium',
      points: totalMissing,
      priority: totalMissing,
      category: 'profile',
      action: 'Go to Settings → Profile',
    });
  }

  // ============================================
  // PRODUCT DATA (max 20 pts)
  // ============================================
  const productCount = products.length;
  const hasOneProduct = productCount >= 1;
  const hasThreeProducts = productCount >= 3;
  const hasFiveProducts = productCount >= 5;
  const hasPricing = products.some((p) =>
    p.costs?.totalMachineCost > 0 ||
    p.telecomsPricing?.monthlyPerUser > 0 ||
    p.cctvPricing?.monthlyTotal > 0 ||
    p.itPricing?.perUserMonthly > 0 ||
    p.leaseRates?.length > 0
  );

  const productChecks = [
    { name: 'At least 1 product', points: 5, completed: hasOneProduct },
    { name: '3+ products', points: 5, completed: hasThreeProducts },
    { name: '5+ products', points: 5, completed: hasFiveProducts },
    { name: 'Products have pricing', points: 5, completed: hasPricing },
  ];

  productChecks.forEach((check) => {
    breakdown.products.items.push(check);
    if (check.completed) breakdown.products.earned += check.points;
  });

  if (!hasOneProduct) {
    tips.push({
      message: 'Add your products and pricing to gain up to 20 points',
      impact: 'high', points: 20, priority: 20,
      category: 'products', action: 'Go to Products → Add Product',
    });
  } else if (!hasFiveProducts) {
    const remaining = (hasThreeProducts ? 5 : 10) + (hasPricing ? 0 : 5);
    tips.push({
      message: `Upload more products to gain up to ${remaining} points`,
      impact: 'medium', points: remaining, priority: remaining,
      category: 'products', action: 'Go to Products → Add Product',
    });
  }

  // ============================================
  // GEO AUDIT (max 25 pts)
  // ============================================
  if (geoAuditScore !== null && geoAuditScore !== undefined) {
    const geoPoints = Math.round((geoAuditScore / 100) * 25);
    breakdown.geo.earned = geoPoints;
    breakdown.geo.items.push({
      name: `GEO Audit score: ${geoAuditScore}/100`,
      points: geoPoints,
      completed: true,
    });

    if (geoAuditScore < 50) {
      tips.push({
        message: `Your website scored ${geoAuditScore}/100 for AI readiness — see your GEO report for fixes`,
        impact: 'high', points: 25 - geoPoints, priority: 25 - geoPoints,
        category: 'geo', action: 'View GEO Audit Report',
      });
    }
  } else {
    breakdown.geo.earned = 0;
    breakdown.geo.items.push({
      name: 'No GEO Audit yet',
      points: 0,
      completed: false,
    });
    tips.push({
      message: 'Run a GEO Audit to unlock up to 25 points',
      impact: 'high', points: 25, priority: 25,
      category: 'geo', action: 'Run GEO Audit',
    });
  }

  // ============================================
  // AI MENTIONS (max 25 pts)
  // ============================================
  const { mentionsThisWeek = 0, mentionsLastWeek = 0, totalMentions30d = 0, avgPosition } = mentionData;

  const hasMention1 = totalMentions30d >= 1;
  const hasMention3 = totalMentions30d >= 3;
  const hasMention5 = totalMentions30d >= 5;
  const hasTopPosition = avgPosition === 'first' || avgPosition === 'top3';
  const hasTrendUp = mentionsThisWeek > mentionsLastWeek;

  const mentionChecks = [
    { name: 'Mentioned in 1+ prompts', points: 5, completed: hasMention1 },
    { name: 'Mentioned in 3+ prompts', points: 5, completed: hasMention3 },
    { name: 'Mentioned in 5+ prompts', points: 5, completed: hasMention5 },
    { name: 'Average position: first or top 3', points: 5, completed: hasTopPosition },
    { name: 'Mentions trending up (week over week)', points: 5, completed: hasTrendUp },
  ];

  mentionChecks.forEach((check) => {
    breakdown.mentions.items.push(check);
    if (check.completed) breakdown.mentions.earned += check.points;
  });

  if (totalMentions30d === 0) {
    tips.push({
      message: "AI tools aren't finding you yet — complete your profile and upgrade to boost visibility",
      impact: 'high', points: 25, priority: 20,
      category: 'mentions', action: null,
    });
  }

  // ============================================
  // REVIEW BONUS (max 5 pts, added to mentions)
  // ============================================
  const { reviewCount = 0, averageRating = 0 } = reviewData || {};

  const hasOneReview = reviewCount >= 1;
  const hasThreeReviews = reviewCount >= 3;
  const hasHighRating = averageRating >= 4.0 && reviewCount > 0;

  const reviewChecks = [
    { name: 'Has at least 1 verified review', points: 2, completed: hasOneReview },
    { name: 'Has 3+ reviews', points: 2, completed: hasThreeReviews },
    { name: 'Average rating 4.0+', points: 1, completed: hasHighRating },
  ];

  reviewChecks.forEach((check) => {
    breakdown.mentions.items.push(check);
    if (check.completed) breakdown.mentions.earned += check.points;
  });

  // Update mentions max to include review bonus
  breakdown.mentions.max = 30; // 25 base + 5 review bonus

  if (reviewCount === 0) {
    tips.push({
      message: 'Get verified reviews to earn up to 5 bonus points',
      impact: 'medium', points: 5, priority: 10,
      category: 'mentions', action: 'Request Reviews from Customers',
    });
  }

  // ============================================
  // TOTAL (capped at 100)
  // ============================================
  const rawTotal =
    breakdown.profile.earned +
    breakdown.products.earned +
    breakdown.geo.earned +
    breakdown.mentions.earned;
  const totalScore = Math.min(rawTotal, 100);

  // Sort tips by points desc, take top 3
  tips.sort((a, b) => b.points - a.points);
  const topTips = tips.slice(0, 3);

  // Next tier info (for upgrade CTAs)
  let nextTier = null;
  if (tier === 'listed') {
    nextTier = { name: 'Visible', price: '£99/mo', additionalPoints: 0 };
  } else if (tier === 'visible') {
    nextTier = { name: 'Verified', price: '£149/mo', additionalPoints: 0 };
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
    maxPossible: 100,
    maxPossibleForTier: 100,
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
    listed: 'Listed (Free)',
    visible: 'Visible (£99/mo)',
    verified: 'Verified (£149/mo)',
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
  if (score <= 20) return '#ef4444';
  if (score <= 40) return '#f97316';
  if (score <= 60) return '#eab308';
  if (score <= 80) return '#3b82f6';
  return '#22c55e';
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
