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

const router = express.Router();

/**
 * Helper to find products by vendorId (handles both ObjectId and string)
 */
async function findVendorProducts(vendorId) {
  // Query with $or to match both ObjectId and string vendorId
  // This handles legacy products that might have string vendorId
  return VendorProduct.find({
    $or: [
      { vendorId: vendorId },
      { vendorId: vendorId.toString() }
    ]
  });
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

    const products = await findVendorProducts(vendor._id);
    const scoreData = calculateVisibilityScore(vendor, products);

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

    const products = await findVendorProducts(vendor._id);
    const scoreData = calculateVisibilityScore(vendor, products);

    // Add more detailed guidance for each section
    const detailedBreakdown = {
      ...scoreData.breakdown,
      guidance: {
        profile: 'Complete your company profile to help AI assistants find and recommend you to businesses.',
        products: 'Upload your product catalog so AI can match you with relevant customer queries.',
        trust: 'Add certifications and accreditations to boost your credibility score.',
        optimisation: 'Enable real-time sync to ensure AI always has your latest information.'
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

    const products = await findVendorProducts(vendor._id);
    const scoreData = calculateVisibilityScore(vendor, products);

    // Enhance recommendations with action URLs
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

  if (actionLower.includes('upgrade')) {
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

  return '/vendor-dashboard?tab=profile';
}

export default router;
