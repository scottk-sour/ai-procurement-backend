// routes/publicVendorRoutes.js
// Public vendor directory API - NO AUTH REQUIRED
// Designed for GEO (Generative Engine Optimisation) - AI assistants can access this data

import express from 'express';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';
import { lookupPostcode, bulkLookupPostcodes } from '../utils/postcodeUtils.js';
import { calculateDistance, filterByDistance, getBoundingBox, formatDistance } from '../utils/distanceUtils.js';

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
 * - postcode: UK postcode for distance-based search
 * - distance: Max distance in km (requires postcode, default 50)
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
      postcode,
      distance = 50,
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

    // Filter by coverage location (text-based)
    if (location && !postcode) {
      query['location.coverage'] = { $regex: new RegExp(location, 'i') };
    }

    // Filter by brand/accreditation
    if (brand) {
      query['businessProfile.accreditations'] = { $regex: new RegExp(brand, 'i') };
    }

    // Postcode-based distance filtering
    let searchCoords = null;
    let maxDistanceMiles = parseInt(distance) || 50;
    let maxDistanceKm = maxDistanceMiles * 1.60934; // Convert miles to km

    if (postcode) {
      const postcodeData = await lookupPostcode(postcode);
      if (postcodeData.valid) {
        searchCoords = {
          latitude: postcodeData.latitude,
          longitude: postcodeData.longitude,
          postcode: postcodeData.postcode,
          region: postcodeData.region
        };

        // Use bounding box for initial DB query IF vendors have coordinates
        // Skip this for now as we need to geocode vendors dynamically
        // const bbox = getBoundingBox(searchCoords.latitude, searchCoords.longitude, maxDistanceKm);
        // query['location.coordinates.latitude'] = { $gte: bbox.minLat, $lte: bbox.maxLat };
        // query['location.coordinates.longitude'] = { $gte: bbox.minLon, $lte: bbox.maxLon };
      } else {
        console.log('Postcode lookup failed for:', postcode, postcodeData.error);
      }
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await Vendor.countDocuments(query);

    // Fetch vendors with public fields only (support both nested and flat schemas)
    const vendors = await Vendor.find(query)
      .select({
        'company': 1,
        'name': 1,
        'services': 1,
        'location': 1,
        'city': 1,
        'region': 1,
        'postcode': 1,
        'coverageAreas': 1,
        'performance.rating': 1,
        'performance.reviewCount': 1,
        'rating': 1,
        'reviewCount': 1,
        'tier': 1,
        'showPricing': 1,
        'businessProfile.description': 1,
        'businessProfile.accreditations': 1,
        'businessProfile.yearsInBusiness': 1,
        'businessProfile.numEmployees': 1,
        'businessProfile.logoUrl': 1,
        'description': 1,
        'accreditations': 1,
        'yearsInBusiness': 1,
        'numEmployees': 1,
        'contactInfo.phone': 1,
        'contactInfo.website': 1,
        'phone': 1,
        'website': 1,
        'serviceCapabilities.responseTime': 1,
        'brands': 1,
        'subscription.priorityBoost': 1,
        'createdAt': 1
      })
      .lean();

    // Calculate distance and filter if postcode search
    let processedVendors = vendors.map(v => ({
      ...v,
      _priorityScore: calculatePriorityScore(v)
    }));

    if (searchCoords) {
      // Collect vendor postcodes that need geocoding
      const vendorsNeedingGeocode = processedVendors.filter(v =>
        !v.location?.coordinates?.latitude && v.location?.postcode
      );

      // Bulk lookup postcodes for vendors without coordinates (max 100)
      let geocodedPostcodes = {};
      if (vendorsNeedingGeocode.length > 0) {
        const postcodeList = [...new Set(vendorsNeedingGeocode.map(v => v.location.postcode))];
        const results = await bulkLookupPostcodes(postcodeList.slice(0, 100));
        results.forEach(r => {
          if (r.valid) {
            geocodedPostcodes[r.query.toUpperCase().replace(/\s+/g, '')] = {
              latitude: r.latitude,
              longitude: r.longitude
            };
          }
        });
      }

      // Calculate precise distance for each vendor
      processedVendors = processedVendors.map(v => {
        let vendorLat = v.location?.coordinates?.latitude;
        let vendorLon = v.location?.coordinates?.longitude;

        // If no stored coordinates, try geocoded lookup
        if (!vendorLat && v.location?.postcode) {
          const normalizedPostcode = v.location.postcode.toUpperCase().replace(/\s+/g, '');
          const geocoded = geocodedPostcodes[normalizedPostcode];
          if (geocoded) {
            vendorLat = geocoded.latitude;
            vendorLon = geocoded.longitude;
          }
        }

        if (vendorLat && vendorLon) {
          const dist = calculateDistance(
            searchCoords.latitude,
            searchCoords.longitude,
            vendorLat,
            vendorLon
          );
          return { ...v, _distance: Math.round(dist * 10) / 10 };
        }
        return { ...v, _distance: null };
      })
      // Filter by actual distance - exclude vendors without coordinates
      .filter(v => v._distance !== null && v._distance <= maxDistanceKm)
      // Sort by distance first, then priority
      .sort((a, b) => {
        if (a._distance === null) return 1;
        if (b._distance === null) return -1;
        return a._distance - b._distance;
      });
    } else {
      // Sort by priority score (tier + boost + rating)
      processedVendors.sort((a, b) => b._priorityScore - a._priorityScore);
    }

    const sortedVendors = processedVendors.slice(skip, skip + limitNum);

    // Format response - hide pricing flag, add showPricing boolean
    // Support both nested schema (imported vendors) and flat schema (legacy vendors)
    const publicVendors = sortedVendors.map(v => {
      const tier = v.tier || 'free';
      const paidTiers = ['basic', 'managed', 'enterprise'];
      const showPricing = paidTiers.includes(tier) || v.showPricing === true;

      return {
        id: v._id,
        company: v.company,
        name: v.name,
        services: v.services || [],
        location: {
          city: v.location?.city || v.city,
          region: v.location?.region || v.region,
          coverage: v.location?.coverage || v.coverageAreas || [],
          postcode: v.location?.postcode || v.postcode
        },
        distance: v._distance ? {
          km: v._distance,
          miles: Math.round(v._distance / 1.60934 * 10) / 10,
          formatted: `${Math.round(v._distance / 1.60934)} miles`
        } : null,
        rating: v.performance?.rating || v.rating || 0,
        reviewCount: v.performance?.reviewCount || v.reviewCount || 0,
        responseTime: v.serviceCapabilities?.responseTime,
        tier: tier,
        description: v.businessProfile?.description || v.description,
        accreditations: v.businessProfile?.accreditations || v.accreditations || [],
        yearsInBusiness: v.businessProfile?.yearsInBusiness || v.yearsInBusiness,
        yearEstablished: v.businessProfile?.yearsInBusiness || v.yearsInBusiness, // Alias for frontend
        employeeCount: v.businessProfile?.numEmployees || v.numEmployees,
        logoUrl: v.businessProfile?.logoUrl,
        brands: v.brands || [],
        phone: showPricing ? (v.contactInfo?.phone || v.phone) : undefined,
        website: v.contactInfo?.website || v.website,
        showPricing: showPricing,
        // Schema.org metadata for AI consumption
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        'areaServed': v.location?.coverage || v.coverageAreas || []
      };
    });

    res.json({
      success: true,
      data: {
        vendors: publicVendors,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: searchCoords ? processedVendors.length : total,
          totalPages: Math.ceil((searchCoords ? processedVendors.length : total) / limitNum),
          hasMore: skip + limitNum < (searchCoords ? processedVendors.length : total)
        },
        filters: {
          category: category || null,
          location: location || null,
          brand: brand || null
        },
        search: searchCoords ? {
          postcode: searchCoords.postcode,
          maxDistance: maxDistanceMiles,
          maxDistanceKm: maxDistanceKm,
          region: searchCoords.region
        } : null
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
      'email': 1,
      'services': 1,
      'location': 1,
      'city': 1,
      'region': 1,
      'postcode': 1,
      'coverageAreas': 1,
      'performance': 1,
      'rating': 1,
      'reviewCount': 1,
      'account.tier': 1,
      'tier': 1,
      'businessProfile': 1,
      'description': 1,
      'yearsInBusiness': 1,
      'numEmployees': 1,
      'accreditations': 1,
      'certifications': 1,
      'contactInfo': 1,
      'phone': 1,
      'website': 1,
      'brands': 1,
      'serviceCapabilities': 1,
      'subscriptionStatus': 1,
      'showPricing': 1,
      'createdAt': 1
    })
    .lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Use top-level tier (free/basic/managed/enterprise) for pricing visibility
    // Also check legacy showPricing field for backwards compatibility
    const tier = vendor.tier || 'free';
    const paidTiers = ['basic', 'managed', 'enterprise'];
    const showPricing = paidTiers.includes(tier) || vendor.showPricing === true;

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

    // Support both nested schema (imported vendors) and flat schema (legacy vendors)
    const publicVendor = {
      id: vendor._id,
      company: vendor.company,
      name: vendor.name,
      services: vendor.services || [],
      location: {
        city: vendor.location?.city || vendor.city,
        region: vendor.location?.region || vendor.region,
        coverage: vendor.location?.coverage || vendor.coverageAreas || [],
        postcode: vendor.location?.postcode || vendor.postcode,
        address: showPricing ? vendor.location?.address : undefined
      },
      rating: vendor.performance?.rating || vendor.rating || 0,
      reviewCount: vendor.performance?.reviewCount || vendor.reviewCount || 0,
      responseTime: vendor.serviceCapabilities?.responseTime || vendor.performance?.averageResponseTime,
      supportHours: vendor.serviceCapabilities?.supportHours,
      completedJobs: vendor.performance?.completedJobs || 0,
      tier: tier,
      description: vendor.businessProfile?.description || vendor.description,
      accreditations: vendor.businessProfile?.accreditations || vendor.accreditations || [],
      certifications: vendor.businessProfile?.certifications || vendor.certifications || [],
      specializations: vendor.businessProfile?.specializations || [],
      yearsInBusiness: vendor.businessProfile?.yearsInBusiness || vendor.yearsInBusiness,
      yearEstablished: vendor.businessProfile?.yearsInBusiness || vendor.yearsInBusiness, // Alias for frontend compatibility
      companySize: vendor.businessProfile?.companySize,
      employeeCount: vendor.businessProfile?.numEmployees || vendor.numEmployees,
      logoUrl: vendor.businessProfile?.logoUrl,
      brands: vendor.brands || [],
      phone: showPricing ? (vendor.contactInfo?.phone || vendor.phone) : undefined,
      email: showPricing ? vendor.email : undefined,
      website: vendor.contactInfo?.website || vendor.website,
      showPricing: showPricing,
      products: showPricing ? products : [],
      // Schema.org metadata
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      'name': vendor.company,
      'description': vendor.businessProfile?.description || vendor.description,
      'areaServed': vendor.location?.coverage || vendor.coverageAreas || [],
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
        'tier': 1,
        'businessProfile.description': 1,
        'businessProfile.accreditations': 1,
        'businessProfile.logoUrl': 1,
        'contactInfo.website': 1,
        'brands': 1,
        'subscription.priorityBoost': 1
      })
      .lean();

    // Sort by priority
    const sortedVendors = vendors
      .map(v => ({ ...v, _priorityScore: calculatePriorityScore(v) }))
      .sort((a, b) => b._priorityScore - a._priorityScore)
      .slice(skip, skip + limitNum);

    const publicVendors = sortedVendors.map(v => {
      const tier = v.tier || 'free';
      const paidTiers = ['basic', 'managed', 'enterprise'];
      const showPricing = paidTiers.includes(tier);

      return {
        id: v._id,
        company: v.company,
        services: v.services || [],
        city: v.location?.city,
        coverage: v.location?.coverage || [],
        rating: v.performance?.rating || 0,
        reviewCount: v.performance?.reviewCount || 0,
        tier: tier,
        description: v.businessProfile?.description,
        accreditations: v.businessProfile?.accreditations || [],
        logoUrl: v.businessProfile?.logoUrl,
        brands: v.brands || [],
        website: v.contactInfo?.website,
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
  const tier = vendor.tier || 'free';
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
