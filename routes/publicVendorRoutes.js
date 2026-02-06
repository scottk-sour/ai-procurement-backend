// routes/publicVendorRoutes.js
// Public vendor directory API - NO AUTH REQUIRED
// Designed for GEO (Generative Engine Optimisation) - AI assistants can access this data

import express from 'express';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';
import { lookupPostcode, bulkLookupPostcodes } from '../utils/postcodeUtils.js';
import { calculateDistance, filterByDistance, getBoundingBox, formatDistance } from '../utils/distanceUtils.js';

const router = express.Router();

// Tier priority for sorting (Verified > Visible > Free)
// Verified tiers: enterprise, managed, verified (£149/mo)
// Visible tiers: basic, visible, standard (£99/mo)
// Free tiers: free, listed
const TIER_PRIORITY = {
  enterprise: 100,  // Verified
  managed: 100,     // Verified
  verified: 100,    // Verified
  basic: 50,        // Visible
  visible: 50,      // Visible
  standard: 50,     // Visible
  free: 0,          // Free
  listed: 0         // Free
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
        'businessProfile.certifications': 1,
        'businessProfile.yearsInBusiness': 1,
        'businessProfile.numEmployees': 1,
        'businessProfile.logoUrl': 1,
        'description': 1,
        'accreditations': 1,
        'yearsInBusiness': 1,
        'numEmployees': 1,
        'contactInfo.phone': 1,
        'contactInfo.website': 1,
        'email': 1,
        'phone': 1,
        'website': 1,
        'serviceCapabilities.responseTime': 1,
        'brands': 1,
        'subscription.priorityBoost': 1,
        'listingStatus': 1,
        'account.loginCount': 1,
        'createdAt': 1
      })
      .lean();

    // Get product counts for all vendors in one query
    const vendorIds = vendors.map(v => v._id);
    const productCounts = await VendorProduct.aggregate([
      { $match: { vendorId: { $in: vendorIds }, isActive: { $ne: false } } },
      { $group: { _id: '$vendorId', count: { $sum: 1 } } }
    ]);
    const productCountMap = {};
    productCounts.forEach(p => {
      productCountMap[p._id.toString()] = p.count;
    });

    // Calculate distance and filter if postcode search
    let processedVendors = vendors.map(v => {
      const vendorProductCount = productCountMap[v._id.toString()] || 0;
      return {
        ...v,
        _productCount: vendorProductCount,
        _priorityScore: calculatePriorityScore({ ...v, hasProducts: vendorProductCount > 0 })
      };
    });

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
      // Sort: Primary = Tier/Priority, Secondary = Visibility Score (in _priorityScore), Tertiary = Distance
      .sort((a, b) => {
        const priorityDiff = b._priorityScore - a._priorityScore;
        if (priorityDiff !== 0) return priorityDiff;
        const distA = a._distance ?? Infinity;
        const distB = b._distance ?? Infinity;
        return distA - distB;
      });
    } else {
      // No postcode search - sort by priority score only
      processedVendors.sort((a, b) => b._priorityScore - a._priorityScore);
    }

    // Separate national vendors from local when doing a postcode search
    let localVendors = processedVendors;
    let nationalVendors = [];
    if (searchCoords) {
      nationalVendors = processedVendors.filter(v => {
        const city = (v.location?.city || v.city || '').toLowerCase().trim();
        return city === 'uk' || city === 'united kingdom' || city === 'nationwide' || city === '';
      });
      localVendors = processedVendors.filter(v => {
        const city = (v.location?.city || v.city || '').toLowerCase().trim();
        return city !== 'uk' && city !== 'united kingdom' && city !== 'nationwide' && city !== '';
      });
    }

    const paginatedVendors = localVendors.slice(skip, skip + limitNum);

    // Format response
    const publicVendors = paginatedVendors.map(v => formatVendorForPublic(v));
    const publicNationalVendors = nationalVendors.map(v => formatVendorForPublic(v));

    const localTotal = searchCoords ? localVendors.length : total;

    res.json({
      success: true,
      data: {
        vendors: publicVendors,
        nationalVendors: publicNationalVendors,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: localTotal,
          totalPages: Math.ceil(localTotal / limitNum),
          hasMore: skip + limitNum < localTotal,
          nationalCount: nationalVendors.length
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
 * Get single vendor profile with badges and tier-based visibility
 */
router.get('/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findOne({
      _id: id,
      'account.status': 'active',
      'account.verificationStatus': 'verified'
    }).lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    // Get vendor's products (machines) - only show public info, hide pricing
    const products = await VendorProduct.find({
      vendorId: vendor._id,
      isActive: { $ne: false }
    }).lean();

    // Determine tier and what to show
    const tier = vendor.account?.tier || vendor.tier || 'free';
    const isPaid = ['basic', 'managed', 'enterprise', 'standard'].includes(tier);
    const isPremium = ['managed', 'enterprise'].includes(tier);
    const isVerified = vendor.account?.verificationStatus === 'verified' || isPaid || vendor.showPricing === true;

    // Base data - everyone sees this
    const profileData = {
      id: vendor._id,
      company: vendor.company || vendor.companyName,
      name: vendor.name,
      services: vendor.services || [],
      location: {
        city: vendor.location?.city || vendor.city || '',
        region: vendor.location?.region || vendor.region || '',
        coverage: vendor.location?.coverage || vendor.coverageAreas || [],
        postcode: vendor.location?.postcode || vendor.postcode || ''
      },
      tier: tier,
      badges: {
        verified: isVerified,
        premium: isPremium
      },

      // Schema.org
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      'areaServed': vendor.location?.coverage || vendor.coverageAreas || []
    };

    // Always show these if they exist
    profileData.rating = vendor.performance?.rating || vendor.rating || 0;
    profileData.reviewCount = vendor.performance?.reviewCount || vendor.reviewCount || 0;
    profileData.description = vendor.businessProfile?.description || vendor.description || '';
    profileData.yearsInBusiness = vendor.businessProfile?.yearsInBusiness || vendor.yearsInBusiness || 0;
    profileData.yearEstablished = profileData.yearsInBusiness; // Alias for frontend
    profileData.brands = vendor.brands || [];
    profileData.accreditations = vendor.businessProfile?.accreditations || vendor.accreditations || [];
    profileData.certifications = vendor.businessProfile?.certifications || vendor.certifications || [];
    profileData.logoUrl = vendor.businessProfile?.logoUrl || vendor.logoUrl || null;

    // Contact info and products - paid tiers only (or legacy showPricing)
    const canShowDetails = isPaid || vendor.showPricing === true;

    if (canShowDetails) {
      profileData.phone = vendor.phone || vendor.contactInfo?.phone || '';
      profileData.email = vendor.email || '';
      profileData.website = vendor.website || vendor.contactInfo?.website || '';
      profileData.numEmployees = vendor.businessProfile?.numEmployees || vendor.numEmployees || 0;
      profileData.employeeCount = profileData.numEmployees; // Alias
      profileData.responseTime = vendor.serviceCapabilities?.responseTime || vendor.responseTime || '';
      profileData.supportHours = vendor.serviceCapabilities?.supportHours || vendor.supportHours || '';
      profileData.canReceiveQuotes = true;
      profileData.showPricing = true;

      // Add products/machines (without CPC pricing - keep that private)
      profileData.products = products.map(p => ({
        id: p._id,
        productName: p.productName,
        manufacturer: p.manufacturer,
        model: p.model,
        category: p.category,
        type: p.type,
        colour: p.colourMono || p.colour,
        speed: p.speedPpm || p.speed,
        isA3: p.isA3,
        features: p.features || [],
        description: p.description || '',
        minVolume: p.volumeRange?.min || p.minVolume,
        maxVolume: p.volumeRange?.max || p.maxVolume,
        inStock: p.availability?.inStock ?? true,
        leadTime: p.availability?.leadTimeDays || 0,
        image: p.image || null,
        specifications: p.specifications || {}
        // NOTE: No CPC rates, no lease rates, no machine cost - pricing stays private
      }));
      profileData.productCount = products.length;
    } else {
      // Free tier - limited info, no contact details, no products
      profileData.phone = '';
      profileData.email = '';
      profileData.website = '';
      profileData.products = [];
      profileData.productCount = 0;
      profileData.canReceiveQuotes = false;
      profileData.showPricing = false;
      profileData.upgradePrompt = {
        message: 'Upgrade to see full profile and request quotes',
        tier: 'basic',
        price: '£99/mo'
      };
    }

    // Add Schema.org aggregate rating if exists
    if (profileData.rating > 0) {
      profileData.aggregateRating = {
        '@type': 'AggregateRating',
        'ratingValue': profileData.rating,
        'reviewCount': profileData.reviewCount
      };
    }

    res.json({ success: true, data: profileData });

  } catch (error) {
    console.error('Vendor profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load vendor profile'
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
        'contactInfo.phone': 1,
        'contactInfo.website': 1,
        'brands': 1,
        'subscription.priorityBoost': 1,
        'listingStatus': 1,
        'account.loginCount': 1
      })
      .lean();

    // Sort by priority and separate national vendors
    const allSorted = vendors
      .map(v => ({ ...v, _priorityScore: calculatePriorityScore(v) }))
      .sort((a, b) => b._priorityScore - a._priorityScore);

    const nationalVendors = allSorted.filter(v => {
      const city = (v.location?.city || '').toLowerCase().trim();
      return city === 'uk' || city === 'united kingdom' || city === 'nationwide' || city === '';
    });
    const localVendors = allSorted.filter(v => {
      const city = (v.location?.city || '').toLowerCase().trim();
      return city !== 'uk' && city !== 'united kingdom' && city !== 'nationwide' && city !== '';
    });

    const paginatedVendors = localVendors.slice(skip, skip + limitNum);

    const publicVendors = paginatedVendors.map(v => formatVendorForPublic(v));
    const publicNationalVendors = nationalVendors.map(v => formatVendorForPublic(v));

    // Page metadata for SEO
    const pageTitle = `${capitalize(categoryNorm)} Suppliers in ${capitalize(locationNorm)}`;
    const pageDescription = `Find trusted ${categoryNorm} suppliers and installers in ${locationNorm}. Compare ${total} verified vendors, read reviews, and get quotes.`;

    res.json({
      success: true,
      data: {
        vendors: publicVendors,
        nationalVendors: publicNationalVendors,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: localVendors.length,
          totalPages: Math.ceil(localVendors.length / limitNum),
          hasMore: skip + limitNum < localVendors.length,
          nationalCount: nationalVendors.length
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

// Helper: check if a vendor has been claimed (signed up / logged in)
function isVendorClaimed(vendor) {
  const ls = (vendor.listingStatus || 'unclaimed').toLowerCase();
  if (ls === 'claimed' || ls === 'verified') return true;
  if (vendor.contactInfo?.phone || vendor.phone) return true;
  const rawTier = (vendor.tier || 'free').toLowerCase();
  if (!['free', 'listed'].includes(rawTier)) return true;
  if ((vendor.performance?.rating || vendor.rating || 0) > 0) return true;
  if ((vendor.account?.loginCount || 0) > 0) return true;
  return false;
}

// Helper: format a vendor document for public API response
function formatVendorForPublic(v) {
  const rawTier = v.tier || v.account?.tier || 'free';
  const tierMapping = {
    'enterprise': 'verified', 'managed': 'verified', 'verified': 'verified',
    'silver': 'verified', 'gold': 'verified', 'platinum': 'verified',
    'basic': 'visible', 'visible': 'visible', 'standard': 'visible', 'bronze': 'visible',
    'free': 'free', 'listed': 'free'
  };
  const tier = tierMapping[rawTier.toLowerCase()] || 'free';
  const paidTiers = ['verified', 'visible'];
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
    yearEstablished: v.businessProfile?.yearsInBusiness || v.yearsInBusiness,
    employeeCount: v.businessProfile?.numEmployees || v.numEmployees,
    logoUrl: v.businessProfile?.logoUrl,
    brands: v.brands || [],
    productCount: v._productCount || 0,
    phone: showPricing ? (v.contactInfo?.phone || v.phone) : undefined,
    website: v.contactInfo?.website || v.website,
    showPricing: showPricing,
    accountClaimed: isVendorClaimed(v),
    // Schema.org metadata for AI consumption
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    'areaServed': v.location?.coverage || v.coverageAreas || []
  };
}

// Helper function to calculate priority score
// Sort order: Primary = Tier, Secondary = Claimed bonus, Tertiary = Visibility Score
function calculatePriorityScore(vendor) {
  const tierScore = TIER_PRIORITY[vendor.tier] || TIER_PRIORITY[vendor.account?.tier] || 0;

  let visibilityScore = 0;

  // Profile fields (25 pts max)
  if (vendor.company) visibilityScore += 3;
  if (vendor.contactInfo?.phone || vendor.phone) visibilityScore += 4;
  if (vendor.email) visibilityScore += 3;
  if (vendor.contactInfo?.website || vendor.website) visibilityScore += 5;
  if (vendor.businessProfile?.yearsInBusiness || vendor.yearsInBusiness) visibilityScore += 3;
  if (vendor.businessProfile?.description?.length > 20 || vendor.description?.length > 20) visibilityScore += 4;
  if (vendor.location?.postcode || vendor.postcode) visibilityScore += 3;

  // Product data (25 pts max)
  if (vendor.hasProducts) visibilityScore += 15;

  // Trust signals (20 pts max)
  if ((vendor.businessProfile?.certifications?.length || 0) > 0) visibilityScore += 5;
  if ((vendor.businessProfile?.accreditations?.length || vendor.accreditations?.length || 0) > 0) visibilityScore += 5;
  if ((vendor.brands?.length || 0) > 0) visibilityScore += 5;
  if ((vendor.location?.coverage?.length || vendor.coverageAreas?.length || 0) > 0) visibilityScore += 5;

  const boostScore = vendor.subscription?.priorityBoost || 0;

  // Claimed bonus: push claimed free-tier vendors above unclaimed ones
  let claimedBonus = 0;
  if (tierScore === 0 && isVendorClaimed(vendor)) {
    claimedBonus = 500;
  }

  return (tierScore * 1000) + claimedBonus + (visibilityScore * 10) + boostScore;
}

// Helper function to capitalize
function capitalize(str) {
  return str.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

export default router;
