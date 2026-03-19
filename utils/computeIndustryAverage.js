import AeoReport from '../models/AeoReport.js';

const MINIMUM_SAMPLE_SIZE = 5;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const LOOKBACK_DAYS = 90;

const cache = new Map();

/**
 * Compute the real average AEO score for a given category
 * from actual report data (last 90 days, score > 0, min 5 reports).
 *
 * Returns: { average: number | null, sampleSize: number, category: string }
 */
export async function computeIndustryAverage(category) {
  // Check cache
  const cached = cache.get(category);
  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const result = await AeoReport.aggregate([
    {
      $match: {
        category,
        score: { $gt: 0 },
        createdAt: { $gte: cutoff },
      },
    },
    {
      $group: {
        _id: null,
        avg: { $avg: '$score' },
        count: { $sum: 1 },
      },
    },
  ]);

  let average = null;
  let sampleSize = 0;

  if (result.length && result[0].count >= MINIMUM_SAMPLE_SIZE) {
    average = Math.round(result[0].avg);
    sampleSize = result[0].count;
  } else {
    sampleSize = result.length ? result[0].count : 0;
  }

  const value = { average, sampleSize, category };
  cache.set(category, { value, expiry: Date.now() + CACHE_TTL_MS });

  return value;
}
