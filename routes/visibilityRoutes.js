/**
 * AI Visibility Score Routes
 * Endpoints for vendors to check and understand their visibility score
 */

import express from 'express';
import mongoose from 'mongoose';
import vendorAuth from '../middleware/vendorAuth.js';
import { calculateVisibilityScore } from '../utils/visibilityScore.js';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';
import AIMentionScan from '../models/AIMentionScan.js';
import Review from '../models/Review.js';

const router = express.Router();

/**
 * Helper to find products by vendorId (handles both ObjectId and string)
 */
async function findVendorProducts(vendorId) {
  return VendorProduct.find({
    $or: [
      { vendorId: vendorId },
      { vendorId: vendorId.toString() }
    ]
  });
}

/**
 * Fetch AI mention data for visibility score calculation
 */
async function getMentionData(vendorId) {
  const now = new Date();

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const [mentionsThisWeek, mentionsLastWeek, totalMentions30d, positionAgg] = await Promise.all([
    AIMentionScan.countDocuments({
      vendorId, mentioned: true,
      scanDate: { $gte: thisWeekStart },
    }).catch(() => 0),

    AIMentionScan.countDocuments({
      vendorId, mentioned: true,
      scanDate: { $gte: lastWeekStart, $lt: thisWeekStart },
    }).catch(() => 0),

    AIMentionScan.countDocuments({
      vendorId, mentioned: true,
      scanDate: { $gte: thirtyDaysAgo },
    }).catch(() => 0),

    AIMentionScan.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          mentioned: true,
          scanDate: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: null,
          positions: { $push: '$position' },
        },
      },
    ]).catch(() => []),
  ]);

  // Calculate average position from position strings
  let avgPosition = null;
  if (positionAgg.length > 0) {
    const positions = positionAgg[0].positions;
    const firstCount = positions.filter(p => p === 'first').length;
    const top3Count = positions.filter(p => p === 'top3').length;
    if (firstCount > positions.length / 2) avgPosition = 'first';
    else if ((firstCount + top3Count) > positions.length / 2) avgPosition = 'top3';
    else avgPosition = 'mentioned';
  }

  return { mentionsThisWeek, mentionsLastWeek, totalMentions30d, avgPosition };
}

/**
 * Fetch review stats for visibility score
 */
async function getReviewData(vendorId) {
  try {
    const stats = await Review.aggregate([
      { $match: { vendor: new mongoose.Types.ObjectId(vendorId), status: 'approved' } },
      {
        $group: {
          _id: null,
          reviewCount: { $sum: 1 },
          averageRating: { $avg: '$rating' },
        },
      },
    ]);
    return stats[0] || { reviewCount: 0, averageRating: 0 };
  } catch {
    return { reviewCount: 0, averageRating: 0 };
  }
}

/**
 * GET /api/visibility/score
 * Get the authenticated vendor's AI visibility score
 */
router.get('/score', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    const [products, mentionData, reviewData] = await Promise.all([
      findVendorProducts(vendor._id),
      getMentionData(vendor._id),
      getReviewData(vendor._id)
    ]);

    // geoAuditScore: null until GEO Audit feature is built
    const scoreData = calculateVisibilityScore(vendor, products, mentionData, null, reviewData);

    res.json({
      success: true,
      data: scoreData
    });
  } catch (error) {
    console.error('Error calculating visibility score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate visibility score'
    });
  }
});

/**
 * GET /api/visibility/breakdown
 * Get detailed breakdown of score components
 */
router.get('/breakdown', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    const [products, mentionData, reviewData] = await Promise.all([
      findVendorProducts(vendor._id),
      getMentionData(vendor._id),
      getReviewData(vendor._id)
    ]);

    const scoreData = calculateVisibilityScore(vendor, products, mentionData, null, reviewData);

    const detailedBreakdown = {
      ...scoreData.breakdown,
      guidance: {
        profile: 'Complete your profile so AI assistants can find and recommend you.',
        products: 'Add products with pricing to show up in buyer queries.',
        geo: 'Run a GEO Audit to see how AI-ready your website is.',
        mentions: 'Track how often AI tools mention your business.',
      }
    };

    res.json({
      success: true,
      data: {
        score: scoreData.score,
        maxScore: scoreData.maxScore,
        breakdown: detailedBreakdown,
        tier: scoreData.tier
      }
    });
  } catch (error) {
    console.error('Error getting visibility breakdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get visibility breakdown'
    });
  }
});

/**
 * GET /api/visibility/recommendations
 * Get personalised recommendations to improve score
 */
router.get('/recommendations', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    const [products, mentionData, reviewData] = await Promise.all([
      findVendorProducts(vendor._id),
      getMentionData(vendor._id),
      getReviewData(vendor._id)
    ]);

    const scoreData = calculateVisibilityScore(vendor, products, mentionData, null, reviewData);

    const enhancedRecommendations = scoreData.recommendations.map(rec => ({
      ...rec,
      actionUrl: getActionUrl(rec.action),
      impact: rec.points >= 10 ? 'high' : rec.points >= 5 ? 'medium' : 'low'
    }));

    res.json({
      success: true,
      data: {
        currentScore: scoreData.score,
        recommendations: enhancedRecommendations,
        nextMilestone: scoreData.nextMilestone
      }
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations'
    });
  }
});

/**
 * Helper to map recommendation actions to URLs
 */
function getActionUrl(action) {
  if (!action) return '/vendor-dashboard?tab=profile';
  const actionLower = action.toLowerCase();

  if (actionLower.includes('upgrade') || actionLower.includes('subscription')) {
    return '/vendor-dashboard/upgrade';
  }
  if (actionLower.includes('product') || actionLower.includes('catalog')) {
    return '/vendor-dashboard?tab=products';
  }
  if (actionLower.includes('geo') || actionLower.includes('audit')) {
    return '/vendor-dashboard/geo-audit';
  }
  if (actionLower.includes('profile') || actionLower.includes('settings')) {
    return '/vendor-dashboard?tab=profile';
  }
  if (actionLower.includes('coverage') || actionLower.includes('location')) {
    return '/vendor-dashboard?tab=profile&section=coverage';
  }
  if (actionLower.includes('post') || actionLower.includes('blog')) {
    return '/vendor-dashboard/posts';
  }

  return '/vendor-dashboard?tab=profile';
}

export default router;
