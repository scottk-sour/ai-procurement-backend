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
import VendorPost from '../models/VendorPost.js';
import AiMention from '../models/AiMention.js';
import VendorLead from '../models/VendorLead.js';

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
 * Fetch activity data for the visibility score calculation
 */
async function getVendorActivity(vendorId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  const [publishedPostCount, aiMentionCount, leadResponseData] = await Promise.all([
    // Count published posts
    VendorPost.countDocuments({ vendor: vendorObjectId, status: 'published' }).catch(() => 0),

    // Count AI mentions in last 30 days
    AiMention.countDocuments({
      'vendorsReturned.vendorId': vendorObjectId,
      timestamp: { $gte: thirtyDaysAgo }
    }).catch(() => 0),

    // Average lead response time (time between lead creation and first status change from 'pending')
    VendorLead.aggregate([
      {
        $match: {
          vendor: vendorObjectId,
          viewedAt: { $exists: true, $ne: null },
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $project: {
          responseHours: {
            $divide: [
              { $subtract: ['$viewedAt', '$createdAt'] },
              1000 * 60 * 60 // ms to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgHours: { $avg: '$responseHours' }
        }
      }
    ]).catch(() => [])
  ]);

  return {
    publishedPostCount,
    aiMentionCount,
    avgLeadResponseHours: leadResponseData[0]?.avgHours ?? null
  };
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

    const [products, activity] = await Promise.all([
      findVendorProducts(vendor._id),
      getVendorActivity(vendor._id)
    ]);

    const scoreData = calculateVisibilityScore(vendor, products, activity);

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

    const [products, activity] = await Promise.all([
      findVendorProducts(vendor._id),
      getVendorActivity(vendor._id)
    ]);

    const scoreData = calculateVisibilityScore(vendor, products, activity);

    const detailedBreakdown = {
      ...scoreData.breakdown,
      guidance: {
        baseTier: 'Your subscription tier sets your base visibility ranking.',
        profileCompleteness: 'Complete your profile so AI assistants can find and recommend you.',
        activity: 'Stay active with products, posts, and fast responses to boost your score.',
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

    const [products, activity] = await Promise.all([
      findVendorProducts(vendor._id),
      getVendorActivity(vendor._id)
    ]);

    const scoreData = calculateVisibilityScore(vendor, products, activity);

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
  const actionLower = action.toLowerCase();

  if (actionLower.includes('upgrade') || actionLower.includes('subscription')) {
    return '/vendor-dashboard/upgrade';
  }
  if (actionLower.includes('product') || actionLower.includes('catalog')) {
    return '/vendor-dashboard?tab=products';
  }
  if (actionLower.includes('certification') || actionLower.includes('accreditation')) {
    return '/vendor-dashboard?tab=profile&section=certifications';
  }
  if (actionLower.includes('coverage') || actionLower.includes('location')) {
    return '/vendor-dashboard?tab=profile&section=coverage';
  }
  if (actionLower.includes('post') || actionLower.includes('blog')) {
    return '/vendor-dashboard/posts';
  }
  if (actionLower.includes('quote') || actionLower.includes('lead')) {
    return '/vendor-dashboard/quotes';
  }

  return '/vendor-dashboard?tab=profile';
}

export default router;
