import crypto from 'crypto';

export function seedFromString(str) {
  return parseInt(crypto.createHash('md5').update(str).digest('hex').slice(0, 8), 16);
}

export function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export function getYearWeek(date) {
  const d = new Date(date);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

export function generateIndustryBenchmark(vertical, city, weekStart, realSegmentSize) {
  if (realSegmentSize >= 10) {
    return { isSynthetic: false, requiresRealData: true };
  }
  const seed = seedFromString(`benchmark-${vertical}-${city}-${getYearWeek(weekStart)}`);
  const rand = seededRandom(seed);
  const base = 32 + Math.floor(rand() * 8);
  const drift = Math.floor(rand() * 4) - 2;
  return {
    value: Math.max(28, Math.min(42, base + drift)),
    isSynthetic: true,
    method: 'deterministic_seed_per_segment_per_week',
    replaceCondition: `vendors_in_segment >= 10 (current: ${realSegmentSize})`,
  };
}

export function generateCompetitorScore(competitorFirmName, weekStart, priorScore) {
  const seed = seedFromString(`competitor-${competitorFirmName}-${getYearWeek(weekStart)}`);
  const rand = seededRandom(seed);

  if (priorScore == null) {
    const base = 25 + Math.floor(rand() * 30);
    return { value: base, weeklyChange: 0, trendDirection: 'flat', isSynthetic: true, method: 'deterministic_seed_initial', replaceCondition: 'competitor_real_scan_data_available' };
  }

  const continueTrend = rand() < 0.6;
  const trendSign = continueTrend ? 1 : -1;
  const delta = Math.floor(rand() * 4) * trendSign;
  const newScore = Math.max(20, Math.min(60, priorScore + delta));

  return {
    value: newScore,
    weeklyChange: newScore - priorScore,
    trendDirection: newScore > priorScore ? 'up' : newScore < priorScore ? 'down' : 'flat',
    isSynthetic: true,
    method: 'deterministic_drift_max_3',
    replaceCondition: 'competitor_real_scan_data_available',
  };
}

export const TRANSACTION_VALUES = {
  solicitor: 1500,
  accountant: 5400,
  'mortgage-advisor': 350,
  'estate-agent': 2400,
  'office-equipment': 6000,
};

export function generateOpportunityLoss(vertical, citationGap, city, weekStart) {
  const seed = seedFromString(`opportunity-${vertical}-${city}-${getYearWeek(weekStart)}`);
  const rand = seededRandom(seed);
  const monthlyQueries = 800 + Math.floor(rand() * 1200);
  const txValue = TRANSACTION_VALUES[vertical] || 1000;
  const conversionRate = 0.02;
  const lostQueries = Math.floor(monthlyQueries * (citationGap / 100));
  const lostTransactions = lostQueries * conversionRate;
  const exposureMid = Math.round(lostTransactions * txValue);

  return {
    monthlyMin: Math.round(exposureMid * 0.7),
    monthlyMax: Math.round(exposureMid * 1.3),
    methodology: { estimatedMonthlyAIQueries: monthlyQueries, citationRateGap: citationGap, averageTransactionValue: txValue },
    isSynthetic: true,
    method: 'derived_from_synthetic_query_volume',
    replaceCondition: 'real_query_volume_data_from_partner_apis',
  };
}

const PERCEPTION_POOLS = {
  solicitor: { positive: ['local', 'family-run', 'approachable', 'long-established'], aspirational: ['trusted', 'award-winning', 'specialist', 'commercial'], competitor: ['top-rated', 'experienced', 'best reviewed', 'expert'] },
  accountant: { positive: ['local', 'small-business focused', 'personable'], aspirational: ['Xero certified', 'cloud accounting specialist', 'tax planning experts'], competitor: ['highly rated', 'experienced', 'comprehensive'] },
  'mortgage-advisor': { positive: ['local', 'first-time buyer specialist'], aspirational: ['whole-of-market', 'specialist for self-employed', 'fee-free'], competitor: ['most recommended', 'flexible', 'fast turnaround'] },
  'estate-agent': { positive: ['local', 'family-run'], aspirational: ['trusted', 'award-winning', 'luxury', 'commercial specialists'], competitor: ['top-rated', 'experienced', 'best reviewed'] },
  'office-equipment': { positive: ['local', 'responsive'], aspirational: ['managed print specialists', 'multi-brand', 'service-led'], competitor: ['established', 'comprehensive', 'reliable'] },
};

export function generatePerception(vendor, weekStart) {
  const pool = PERCEPTION_POOLS[vendor.vendorType] || PERCEPTION_POOLS.solicitor;
  return {
    positiveAssociations: pool.positive.slice(0, 2),
    missingAssociations: pool.aspirational.slice(0, 4),
    competitorAssociations: pool.competitor.slice(0, 3),
    isSynthetic: true,
    method: 'vertical_pool_until_real_perception_scan',
    replaceCondition: 'detective_perception_scan_per_vendor',
  };
}
