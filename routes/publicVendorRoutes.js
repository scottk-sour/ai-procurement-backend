// routes/publicVendorRoutes.js
// Public vendor directory API - NO AUTH REQUIRED
// Designed for GEO (Generative Engine Optimisation) - AI assistants can access this data

import express from 'express';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';

const router = express.Router();

// Tier priority for sorting (paid vendors appear first)
const TIER_PRIORITY = {
  enterprise: 4,
  managed: 3,
  basic: 2,
  free: 1
};

/**
 * GET /api/public/vendors
 * List vendors with optional filters
 * 
 * Query params:
 * - category: Filter by service (CCTV, Photocopiers, IT, Telecoms, Security)
 * - location: Filter by coverage area
 * - brand: Filter by brand/accreditation
 * - page: Page number (default 1)
 * - limit: Results per page (default 20, max 100)
 * 
 * Returns: Array of vendors sorted by tier (paid first) then rating
 */
router.get('/vendors', async (req, res) => {
  try {
    const { 
      category, 
      location, 
      brand, 
      page = 1, 
      limit = 20 
    } = req.query;

    // Build query - only active vendors
    const query = { 
      'account.status': 'active',
      'account.verificationStatus': 'verified'
    };

    // Filter by service category
    if (category) {
      query.services = { $regex: new RegExp(category, 'i') };
    }

    // Filter by coverage location
    if (location) {
      query['location.coverage'] = { $regex: new RegExp(location, 'i') };
    }

    // Filter by brand/accreditation
    if (brand) {
      query['businessProfile.accreditations'] = { $regex: new RegExp(brand, 'i') };
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await Vendor.countDocuments(query);

    // Fetch vendors with public fields only
    const vendors = await Vendor.find(query)
      .select({
        'company': 1,
        'name': 1,
        'services': 1,
        'location.city': 1,
        'location.region': 1,
        'location.coverage': 1,
        'location.postcode': 1,
        'performance.rating': 1,
        'performance.reviewCount': 1,
        'performance.responseTime': 1,
        'account.tier': 1,
        'businessProfile.companyDescription': 1,
        'businessProfile.accreditations': 1,
        'businessProfile.yearEstablished': 1,
        'businessProfile.employeeCount': 1,
        'businessProfile.logoUrl': 1,
        'contactDetails.phone': 1,
        'contactDetails.website': 1,
        'subscription.pricingVisible': 1,
        'subscription.priorityBoost': 1,
        'createdAt': 1
      })
      .lean();

    // Sort by priority score (tier + boost + rating)
    const sortedVendors = vendors
      .map(v => ({
        ...v,
        _priorityScore: calculatePriorityScore(v)
      }))
      .sort((a, b) => b._priorityScore - a._priorityScore)
      .slice(skip, skip + limitNum);

    // Format response - hide pricing flag, add showPricing boolean
    const publicVendors = sortedVendors.map(v => {
      const tier = v.account?.tier || 'free';
      const paidTiers = ['basic', 'managed', 'enterprise'];
      const showPricing = paidTiers.includes(tier) && v.subscription?.pricingVisible === true;

      return {
        id: v._id,
        company: v.company,
        name: v.name,
        services: v.services || [],
        location: {
          city: v.location?.city,
          region: v.location?.region,
          coverage: v.location?.coverage || [],
          postcode: v.location?.postcode
        },
        rating: v.performance?.rating || 0,
        reviewCount: v.performance?.reviewCount || 0,
        responseTime: v.performance?.responseTime,
        tier: tier,
        description: v.businessProfile?.companyDescription,
        accreditations: v.businessProfile?.accreditations || [],
        yearEstablished: v.businessProfile?.yearEstablished,
        employeeCount: v.businessProfile?.employeeCount,
        logoUrl: v.businessProfile?.logoUrl,
        phone: showPricing ? v.contactDetails?.phone : undefined,
        website: v.contactDetails?.website,
        showPricing: showPricing,
        // Schema.org metadata for AI consumption
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        'areaServed': v.location?.coverage || []
      };
    });

    res.json({
      success: true,
      data: {
        vendors: publicVendors,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          totalPages: Math.ceil(total / limitNum),
          hasMore: skip + limitNum < total
        },
        filters: {
          category: category || null,
          location: location || null,
          brand: brand || null
        }
      }
    });

  } catch (error) {
    console.error('Public vendors API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/public/vendors/:id
 * Get single vendor details
 */
router.get('/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findOne({
      _id: id,
      'account.status': 'active',
      'account.verificationStatus': 'verified'
    })
    .select({
      'company': 1,
      'name': 1,
      'services': 1,
      'location': 1,
      'performance': 1,
      'account.tier': 1,
      'businessProfile': 1,
      'contactDetails.phone': 1,
      'contactDetails.website': 1,
      'contactDetails.email': 1,
      'subscription.pricingVisible': 1,
      'createdAt': 1
    })
    .lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const tier = vendor.account?.tier || 'free';
    const paidTiers = ['basic', 'managed', 'enterprise'];
    const showPricing = paidTiers.includes(tier) && vendor.subscription?.pricingVisible === true;

    // Get vendor products if pricing visible
    let products = [];
    if (showPricing) {
      products = await VendorProduct.find({ 
        vendorId: vendor._id,
        isActive: true 
      })
      .select({
        'productName': 1,
        'manufacturer': 1,
        'category': 1,
        'costs': 1,
        'specifications': 1
      })
      .lean();
    }

    const publicVendor = {
      id: vendor._id,
      company: vendor.company,
      name: vendor.name,
      services: vendor.services || [],
      location: {
        city: vendor.location?.city,
        region: vendor.location?.region,
        coverage: vendor.location?.coverage || [],
        postcode: vendor.location?.postcode,
        address: showPricing ? vendor.location?.address : undefined
      },
      rating: vendor.performance?.rating || 0,
      reviewCount: vendor.performance?.reviewCount || 0,
      responseTime: vendor.performance?.responseTime,
      completedJobs: vendor.performance?.completedJobs || 0,
      tier: tier,
      description: vendor.businessProfile?.companyDescription,
      accreditations: vendor.businessProfile?.accreditations || [],
      yearEstablished: vendor.businessProfile?.yearEstablished,
      employeeCount: vendor.businessProfile?.employeeCount,
      logoUrl: vendor.businessProfile?.logoUrl,
      serviceAreas: vendor.businessProfile?.serviceAreas || [],
      phone: showPricing ? vendor.contactDetails?.phone : undefined,
      email: showPricing ? vendor.contactDetails?.email : undefined,
      website: vendor.contactDetails?.website,
      showPricing: showPricing,
      products: showPricing ? products : [],
      // Schema.org metadata
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      'name': vendor.company,
      'description': vendor.businessProfile?.companyDescription,
      'areaServed': vendor.location?.coverage || [],
      'aggregateRating': vendor.performance?.rating ? {
        '@type': 'AggregateRating',
        'ratingValue': vendor.performance.rating,
        'reviewCount': vendor.performance.reviewCount || 0
      } : undefined
    };

    res.json({
      success: true,
      data: publicVendor
    });

  } catch (error) {
    console.error('Public vendor detail API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/public/vendors/category/:category/location/:location
 * SEO-friendly endpoint for directory pages
 * Example: /api/public/vendors/category/cctv/location/cardiff
 */
router.get('/vendors/category/:category/location/:location', async (req, res) => {
  try {
    const { category, location } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Normalize inputs
    const categoryNorm = category.toLowerCase().replace(/-/g, ' ');
    const locationNorm = location.toLowerCase().replace(/-/g, ' ');

    // Build query
    const query = {
      'account.status': 'active',
      'account.verificationStatus': 'verified',
      'services': { $regex: new RegExp(categoryNorm, 'i') },
      'location.coverage': { $regex: new RegExp(locationNorm, 'i') }
    };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const total = await Vendor.countDocuments(query);

    const vendors = await Vendor.find(query)
      .select({
        'company': 1,
        'services': 1,
        'location.city': 1,
        'location.coverage': 1,
        'performance.rating': 1,
        'performance.reviewCount': 1,
        'account.tier': 1,
        'businessProfile.companyDescription': 1,
        'businessProfile.accreditations': 1,
        'businessProfile.logoUrl': 1,
        'contactDetails.website': 1,
        'subscription.pricingVisible': 1,
        'subscription.priorityBoost': 1
      })
      .lean();

    // Sort by priority
    const sortedVendors = vendors
      .map(v => ({ ...v, _priorityScore: calculatePriorityScore(v) }))
      .sort((a, b) => b._priorityScore - a._priorityScore)
      .slice(skip, skip + limitNum);

    const publicVendors = sortedVendors.map(v => {
      const tier = v.account?.tier || 'free';
      const paidTiers = ['basic', 'managed', 'enterprise'];
      const showPricing = paidTiers.includes(tier) && v.subscription?.pricingVisible === true;

      return {
        id: v._id,
        company: v.company,
        services: v.services || [],
        city: v.location?.city,
        coverage: v.location?.coverage || [],
        rating: v.performance?.rating || 0,
        reviewCount: v.performance?.reviewCount || 0,
        tier: tier,
        description: v.businessProfile?.companyDescription,
        accreditations: v.businessProfile?.accreditations || [],
        logoUrl: v.businessProfile?.logoUrl,
        website: v.contactDetails?.website,
        showPricing: showPricing
      };
    });

    // Page metadata for SEO
    const pageTitle = `${capitalize(categoryNorm)} Suppliers in ${capitalize(locationNorm)}`;
    const pageDescription = `Find trusted ${categoryNorm} suppliers and installers in ${locationNorm}. Compare ${total} verified vendors, read reviews, and get quotes.`;

    res.json({
      success: true,
      data: {
        vendors: publicVendors,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          totalPages: Math.ceil(total / limitNum),
          hasMore: skip + limitNum < total
        },
        meta: {
          category: categoryNorm,
          location: locationNorm,
          title: pageTitle,
          description: pageDescription,
          canonical: `/suppliers/${category}/${location}`
        }
      }
    });

  } catch (error) {
    console.error('Public category/location API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/public/categories
 * List all service categories with vendor counts
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await Vendor.aggregate([
      { 
        $match: { 
          'account.status': 'active',
          'account.verificationStatus': 'verified'
        } 
      },
      { $unwind: '$services' },
      { 
        $group: { 
          _id: '$services', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } },
      {
        $project: {
          _id: 0,
          name: '$_id',
          count: 1,
          slug: { $toLower: { $replaceAll: { input: '$_id', find: ' ', replacement: '-' } } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        categories: categories,
        total: categories.length
      }
    });

  } catch (error) {
    console.error('Public categories API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/public/locations
 * List all coverage locations with vendor counts
 */
router.get('/locations', async (req, res) => {
  try {
    const { category } = req.query;

    const matchStage = { 
      'account.status': 'active',
      'account.verificationStatus': 'verified'
    };

    if (category) {
      matchStage.services = { $regex: new RegExp(category, 'i') };
    }

    const locations = await Vendor.aggregate([
      { $match: matchStage },
      { $unwind: '$location.coverage' },
      { 
        $group: { 
          _id: '$location.coverage', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 100 },
      {
        $project: {
          _id: 0,
          name: '$_id',
          count: 1,
          slug: { $toLower: { $replaceAll: { input: '$_id', find: ' ', replacement: '-' } } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        locations: locations,
        total: locations.length,
        filter: {
          category: category || null
        }
      }
    });

  } catch (error) {
    console.error('Public locations API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch locations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/public/stats
 * Public statistics for landing page
 */
router.get('/stats', async (req, res) => {
  try {
    const [vendorCount, categoryStats, locationCount] = await Promise.all([
      Vendor.countDocuments({ 
        'account.status': 'active',
        'account.verificationStatus': 'verified'
      }),
      Vendor.aggregate([
        { $match: { 'account.status': 'active', 'account.verificationStatus': 'verified' } },
        { $unwind: '$services' },
        { $group: { _id: '$services', count: { $sum: 1 } } },
        { $count: 'total' }
      ]),
      Vendor.aggregate([
        { $match: { 'account.status': 'active', 'account.verificationStatus': 'verified' } },
        { $unwind: '$location.coverage' },
        { $group: { _id: '$location.coverage' } },
        { $count: 'total' }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalVendors: vendorCount,
        totalCategories: categoryStats[0]?.total || 0,
        totalLocations: locationCount[0]?.total || 0,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Public stats API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats'
    });
  }
});

// Helper function to calculate priority score
function calculatePriorityScore(vendor) {
  const tierWeights = { free: 0, basic: 25, managed: 50, enterprise: 100 };
  const tier = vendor.account?.tier || 'free';
  const tierScore = tierWeights[tier] || 0;
  const boostScore = vendor.subscription?.priorityBoost || 0;
  const ratingScore = (vendor.performance?.rating || 0) * 10;
  return tierScore + boostScore + ratingScore;
}

// Helper function to capitalize
function capitalize(str) {
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

export default router;
