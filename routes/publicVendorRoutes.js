// routes/publicVendorRoutes.js
// Public vendor directory API - NO AUTH REQUIRED
// Designed for GEO (Generative Engine Optimisation) - AI assistants can access this data

import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';
import VendorPost from '../models/VendorPost.js';
import AeoReport from '../models/AeoReport.js';
import Subscriber from '../models/Subscriber.js';
import { sendAeoReportEmail } from '../services/emailService.js';
import { generateFullReport } from '../services/aeoReportGenerator.js';
import { generateReportPdf } from '../services/aeoReportPdf.js';
import { lookupPostcode, bulkLookupPostcodes } from '../utils/postcodeUtils.js';
import { calculateDistance, filterByDistance, getBoundingBox, formatDistance } from '../utils/distanceUtils.js';

const router = express.Router();

// Tier priority for sorting (Pro > Starter > Free)
// Pro tiers: pro, enterprise, managed, verified (£299/mo)
// Starter tiers: starter, basic, visible, standard (£149/mo)
// Free tiers: free, listed
const TIER_PRIORITY = {
  pro: 100,         // Pro (£299/mo)
  enterprise: 100,  // Legacy → Pro
  managed: 100,     // Legacy → Pro
  verified: 100,    // Legacy → Pro
  starter: 50,      // Starter (£149/mo)
  basic: 50,        // Legacy → Starter
  visible: 50,      // Legacy → Starter
  standard: 50,     // Legacy → Starter
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

    // Build query - active verified + unclaimed vendors
    const query = {
      $or: [
        { 'account.status': 'active', 'account.verificationStatus': 'verified' },
        { listingStatus: 'unclaimed' }
      ]
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
 * GET /api/public/vendors/search
 * Search vendors by business name
 *
 * Query params:
 * - q: Search string (required, min 2 chars)
 * - limit: Max results (default 20, max 50)
 *
 * Returns: Array of matching vendors sorted by claimed first, tier, then alphabetical
 */
router.get('/vendors/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "q" is required (min 2 characters)'
      });
    }

    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const query = {
      company: { $regex: new RegExp(q.trim(), 'i') },
      $or: [
        { 'account.status': 'active', 'account.verificationStatus': 'verified' },
        { listingStatus: 'unclaimed' }
      ]
    };

    const vendors = await Vendor.find(query)
      .select({
        company: 1,
        'location.city': 1,
        vendorType: 1,
        practiceAreas: 1,
        services: 1,
        slug: 1,
        sraNumber: 1,
        claimed: 1,
        tier: 1
      })
      .limit(limitNum)
      .lean();

    // Sort: claimed first, then tier priority, then alphabetical
    vendors.sort((a, b) => {
      const claimedA = isVendorClaimed(a) ? 1 : 0;
      const claimedB = isVendorClaimed(b) ? 1 : 0;
      if (claimedB !== claimedA) return claimedB - claimedA;

      const tierA = TIER_PRIORITY[a.tier] || 0;
      const tierB = TIER_PRIORITY[b.tier] || 0;
      if (tierB !== tierA) return tierB - tierA;

      return (a.company || '').localeCompare(b.company || '');
    });

    const results = vendors.map(v => ({
      id: v._id,
      company: v.company,
      city: v.location?.city || '',
      vendorType: v.vendorType || 'office-equipment',
      slug: v.slug || null
    }));

    res.json({
      success: true,
      data: { vendors: results, total: results.length }
    });
  } catch (error) {
    console.error('Vendor search API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search vendors'
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
      $or: [
        { 'account.status': 'active', 'account.verificationStatus': 'verified' },
        { listingStatus: 'unclaimed' }
      ]
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
      '@type': vendor.vendorType === 'solicitor' ? 'LegalService'
        : vendor.vendorType === 'accountant' ? 'AccountingService'
        : vendor.vendorType === 'mortgage-advisor' ? 'FinancialService'
        : vendor.vendorType === 'estate-agent' ? 'RealEstateAgent'
        : 'LocalBusiness',
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

// Solicitor slug → practiceAreas mapping
const SOLICITOR_SLUG_MAP = {
  conveyancing: 'Conveyancing',
  'family-law': 'Family Law',
  'criminal-law': 'Criminal Law',
  'commercial-law': 'Commercial Law',
  'employment-law': 'Employment Law',
  'wills-and-probate': 'Wills & Probate',
  immigration: 'Immigration',
  'personal-injury': 'Personal Injury',
};

// Accountant slug → practiceAreas mapping
const ACCOUNTANT_SLUG_MAP = {
  'tax-advisory': 'Tax Advisory',
  'audit-assurance': 'Audit & Assurance',
  bookkeeping: 'Bookkeeping',
  payroll: 'Payroll',
  'corporate-finance': 'Corporate Finance',
  'business-advisory': 'Business Advisory',
  'vat-services': 'VAT',
  'financial-planning': 'Financial Planning',
};

// Mortgage Advisor slug → practiceAreas mapping
const MORTGAGE_SLUG_MAP = {
  'residential-mortgages': 'Residential Mortgages',
  'buy-to-let': 'Buy-to-Let',
  remortgage: 'Remortgage',
  'first-time-buyer': 'First-Time Buyer',
  'equity-release': 'Equity Release',
  'commercial-mortgages': 'Commercial Mortgages',
  'protection-insurance': 'Protection Insurance',
};

// Estate Agent slug → practiceAreas mapping
const ESTATE_AGENT_SLUG_MAP = {
  sales: 'Sales',
  lettings: 'Lettings',
  'property-management': 'Property Management',
  'block-management': 'Block Management',
  auctions: 'Auctions',
  'commercial-property': 'Commercial Property',
  inventory: 'Inventory',
};

function isSolicitorSlug(slug) {
  return slug in SOLICITOR_SLUG_MAP;
}

function isAccountantSlug(slug) {
  return slug in ACCOUNTANT_SLUG_MAP;
}

function isMortgageSlug(slug) {
  return slug in MORTGAGE_SLUG_MAP;
}

function isEstateAgentSlug(slug) {
  return slug in ESTATE_AGENT_SLUG_MAP;
}

/**
 * GET /api/public/vendors/locations/:category
 * List all cities for a given category, with vendor counts
 * Returns: array of { city, count } sorted by count desc
 */
router.get('/vendors/locations/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 50 } = req.query;

    const statusFilter = {
      $or: [
        { 'account.status': 'active', 'account.verificationStatus': 'verified' },
        { listingStatus: 'unclaimed' }
      ]
    };

    let matchStage;
    if (isSolicitorSlug(category)) {
      const practiceArea = SOLICITOR_SLUG_MAP[category];
      matchStage = { ...statusFilter, vendorType: 'solicitor', practiceAreas: practiceArea };
    } else if (isAccountantSlug(category)) {
      matchStage = { ...statusFilter, vendorType: 'accountant' };
    } else if (isMortgageSlug(category)) {
      const practiceArea = MORTGAGE_SLUG_MAP[category];
      matchStage = { ...statusFilter, vendorType: 'mortgage-advisor', practiceAreas: practiceArea };
    } else if (isEstateAgentSlug(category)) {
      const practiceArea = ESTATE_AGENT_SLUG_MAP[category];
      matchStage = { ...statusFilter, vendorType: 'estate-agent', practiceAreas: practiceArea };
    } else {
      const categoryNorm = category.toLowerCase().replace(/-/g, ' ');
      matchStage = { ...statusFilter, services: { $regex: new RegExp(categoryNorm, 'i') } };
    }

    const locations = await Vendor.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$location.city',
          count: { $sum: 1 }
        }
      },
      { $match: { _id: { $ne: null, $ne: '' } } },
      { $sort: { count: -1 } },
      { $limit: Math.min(parseInt(limit) || 50, 200) },
      {
        $project: {
          _id: 0,
          city: '$_id',
          count: 1
        }
      }
    ]);

    res.json({ success: true, data: { locations, total: locations.length, category } });
  } catch (error) {
    console.error('Public vendor locations API error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch locations' });
  }
});

/**
 * GET /api/public/vendors/category/:category/location/:location
 * SEO-friendly endpoint for directory pages
 * Handles both office equipment (services field) and solicitor categories (practiceAreas field)
 */
router.get('/vendors/category/:category/location/:location', async (req, res) => {
  try {
    const { category, location } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const locationNorm = location.toLowerCase().replace(/-/g, ' ');
    const isSolicitor = isSolicitorSlug(category);
    const isAccountant = isAccountantSlug(category);
    const isMortgage = isMortgageSlug(category);
    const isEstateAgent = isEstateAgentSlug(category);
    const isProfessional = isSolicitor || isAccountant || isMortgage || isEstateAgent;

    // Build category filter
    let categoryFilter;
    let categoryLabel;
    if (isSolicitor) {
      const practiceArea = SOLICITOR_SLUG_MAP[category];
      categoryFilter = { vendorType: 'solicitor', practiceAreas: practiceArea };
      categoryLabel = practiceArea;
    } else if (isAccountant) {
      categoryFilter = { vendorType: 'accountant' };
      categoryLabel = ACCOUNTANT_SLUG_MAP[category];
    } else if (isMortgage) {
      const practiceArea = MORTGAGE_SLUG_MAP[category];
      categoryFilter = { vendorType: 'mortgage-advisor', practiceAreas: practiceArea };
      categoryLabel = practiceArea;
    } else if (isEstateAgent) {
      const practiceArea = ESTATE_AGENT_SLUG_MAP[category];
      categoryFilter = { vendorType: 'estate-agent', practiceAreas: practiceArea };
      categoryLabel = practiceArea;
    } else {
      const categoryNorm = category.toLowerCase().replace(/-/g, ' ');
      categoryFilter = { services: { $regex: new RegExp(categoryNorm, 'i') } };
      categoryLabel = categoryNorm;
    }

    // Build query - active verified + unclaimed vendors
    const query = {
      $and: [
        {
          $or: [
            { 'account.status': 'active', 'account.verificationStatus': 'verified' },
            { listingStatus: 'unclaimed' }
          ]
        },
        categoryFilter,
        // For professional services match on city; for equipment match on coverage
        isProfessional
          ? { 'location.city': { $regex: new RegExp(`^${locationNorm}$`, 'i') } }
          : { 'location.coverage': { $regex: new RegExp(locationNorm, 'i') } }
      ]
    };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const total = await Vendor.countDocuments(query);

    const vendors = await Vendor.find(query)
      .select({
        'company': 1,
        'services': 1,
        'vendorType': 1,
        'practiceAreas': 1,
        'sraNumber': 1,
        'icaewFirmNumber': 1,
        'fcaNumber': 1,
        'propertymarkNumber': 1,
        'propertymarkQualification': 1,
        'regulatoryBody': 1,
        'claimed': 1,
        'location.city': 1,
        'location.coverage': 1,
        'location.postcode': 1,
        'location.address': 1,
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
        'account.loginCount': 1,
        'slug': 1
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
    const suffix = isSolicitor ? 'Solicitors' : isAccountant ? 'Accountants' : isMortgage ? 'Mortgage Advisors' : isEstateAgent ? 'Estate Agents' : 'Suppliers';
    const pageTitle = `${capitalize(categoryLabel)} ${suffix} in ${capitalize(locationNorm)}`;
    const pageDescription = isSolicitor
      ? `Find verified ${categoryLabel.toLowerCase()} solicitors in ${capitalize(locationNorm)}. SRA-regulated firms with reviews and accreditations on TendorAI.`
      : isAccountant
        ? `Find verified ${categoryLabel.toLowerCase()} accountants in ${capitalize(locationNorm)}. ICAEW-regulated firms with reviews and accreditations on TendorAI.`
        : isMortgage
          ? `Find FCA-authorised ${categoryLabel.toLowerCase()} mortgage advisors in ${capitalize(locationNorm)}. Compare fees, lender panels and reviews on TendorAI.`
          : isEstateAgent
            ? `Find Propertymark-registered ${categoryLabel.toLowerCase()} estate agents in ${capitalize(locationNorm)}. Compare fees, coverage and reviews on TendorAI.`
            : `Find trusted ${categoryLabel} suppliers and installers in ${capitalize(locationNorm)}. Compare ${total} vendors, read reviews, and get quotes.`;

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
          category: categoryLabel,
          location: locationNorm,
          title: pageTitle,
          description: pageDescription,
          canonical: `/suppliers/${category}/${location}`,
          isSolicitor,
          isAccountant,
          isMortgage,
          isEstateAgent
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
          $or: [
            { 'account.status': 'active', 'account.verificationStatus': 'verified' },
            { listingStatus: 'unclaimed' }
          ]
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
      $or: [
        { 'account.status': 'active', 'account.verificationStatus': 'verified' },
        { listingStatus: 'unclaimed' }
      ]
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
    const statusFilter = {
      $or: [
        { 'account.status': 'active', 'account.verificationStatus': 'verified' },
        { listingStatus: 'unclaimed' }
      ]
    };

    const [vendorCount, categoryStats, locationCount] = await Promise.all([
      Vendor.countDocuments(statusFilter),
      Vendor.aggregate([
        { $match: statusFilter },
        { $unwind: '$services' },
        { $group: { _id: '$services', count: { $sum: 1 } } },
        { $count: 'total' }
      ]),
      Vendor.aggregate([
        { $match: statusFilter },
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

/**
 * GET /api/public/vendors/:vendorId/posts
 * List a vendor's published posts (public, no auth)
 */
router.get('/vendors/:vendorId/posts', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      VendorPost.find({ vendor: vendorId, status: 'published' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('vendor', 'company tier')
        .lean(),
      VendorPost.countDocuments({ vendor: vendorId, status: 'published' }),
    ]);

    res.json({
      success: true,
      posts,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    // Professional fields
    vendorType: v.vendorType || 'office-equipment',
    practiceAreas: v.practiceAreas || [],
    sraNumber: v.sraNumber || null,
    icaewFirmNumber: v.icaewFirmNumber || null,
    fcaNumber: v.fcaNumber || null,
    propertymarkNumber: v.propertymarkNumber || null,
    regulatoryBody: v.regulatoryBody || null,
    slug: v.slug || null,
    // Schema.org metadata for AI consumption
    '@context': 'https://schema.org',
    '@type': v.vendorType === 'solicitor' ? 'LegalService'
      : v.vendorType === 'accountant' ? 'AccountingService'
      : v.vendorType === 'mortgage-advisor' ? 'FinancialService'
      : v.vendorType === 'estate-agent' ? 'RealEstateAgent'
      : 'LocalBusiness',
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

// ============================================================
// AEO FULL REPORT — Public viewing (no auth, report ID = secret token)
// ============================================================

/**
 * GET /api/public/aeo-report/:reportId
 * Return full report JSON (excludes pdfBuffer and ipAddress)
 */
router.get('/aeo-report/:reportId', async (req, res) => {
  try {
    const report = await AeoReport.findById(req.params.reportId)
      .select('-pdfBuffer -ipAddress')
      .lean();

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('AEO report fetch error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
});

/**
 * GET /api/public/aeo-report/:reportId/pdf
 * Return PDF as binary download
 */
router.get('/aeo-report/:reportId/pdf', async (req, res) => {
  try {
    const report = await AeoReport.findById(req.params.reportId).select('pdfBuffer companyName').lean();

    if (!report || !report.pdfBuffer) {
      return res.status(404).json({ success: false, error: 'PDF not found' });
    }

    const filename = `AEO-Report-${(report.companyName || 'Company').replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(report.pdfBuffer);
  } catch (error) {
    console.error('AEO report PDF error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch PDF' });
  }
});

// ============================================================
// AEO REPORT — Public generation (full report with PDF)
// ============================================================

const aeoRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'Rate limit exceeded. You can run 3 reports per hour. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/public/aeo-report
 * Generate a full AEO visibility report with score, competitors, gaps, and PDF
 * Returns reportId for redirect to /aeo-report/results/[reportId]
 */
router.post('/aeo-report', aeoRateLimiter, async (req, res) => {
  try {
    const { companyName, category, city, email } = req.body;

    if (!companyName || !category || !city) {
      return res.status(400).json({
        success: false,
        error: 'companyName, category, and city are required',
      });
    }

    const validCategories = [
      'copiers', 'telecoms', 'cctv', 'it',
      'conveyancing', 'family-law', 'criminal-law', 'commercial-law',
      'employment-law', 'wills-and-probate', 'immigration', 'personal-injury',
      'tax-advisory', 'audit-assurance', 'bookkeeping', 'payroll',
      'corporate-finance', 'business-advisory', 'vat-services', 'financial-planning',
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `category must be one of: ${validCategories.join(', ')}`,
      });
    }

    console.log(`[AEO Public] Generating full report for "${companyName}" (${category}, ${city})`);

    // 1. Generate full report via Claude with web search
    const reportData = await generateFullReport({ companyName, category, city, email });

    // 2. Generate PDF
    const pdfBuffer = await generateReportPdf(reportData);

    // 3. Save to MongoDB
    const report = await AeoReport.create({
      ...reportData,
      pdfBuffer,
      ipAddress: req.ip,
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://www.tendorai.com';
    const reportUrl = `${baseUrl}/aeo-report/results/${report._id}`;

    console.log(`[AEO Public] Report generated: ${report._id} — Score: ${report.score}/100`);

    // 4. Send email with link to full report (not inline data)
    if (email) {
      sendAeoReportEmail(email, {
        companyName,
        category,
        city,
        score: report.score,
        aiMentioned: report.aiMentioned,
        reportUrl,
      }).catch((err) =>
        console.error('Failed to send AEO report email:', err.message)
      );
    }

    // 5. Return reportId for frontend redirect
    res.json({
      success: true,
      reportId: report._id,
      reportUrl,
    });
  } catch (error) {
    console.error('AEO Report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AEO report. Please try again.',
    });
  }
});

/**
 * POST /api/public/subscribe
 * Newsletter signup — saves email to MongoDB
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid email is required.' });
    }

    await Subscriber.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { email: email.toLowerCase().trim(), source: 'website', unsubscribed: false },
      { upsert: true }
    );

    res.json({ success: true, message: 'Subscribed successfully.' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ message: 'Failed to subscribe. Please try again.' });
  }
});

/**
 * GET /api/public/unsubscribe
 * One-click email unsubscribe (no login required, accessed from email link)
 */
router.get('/unsubscribe', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(unsubscribePage('Invalid unsubscribe link.', false));
    }

    const JWT_SECRET = process.env.JWT_SECRET || process.env.VENDOR_JWT_SECRET || 'tendorai-secret';
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.purpose !== 'unsubscribe' || !decoded.vendorId) {
      return res.status(400).send(unsubscribePage('Invalid unsubscribe link.', false));
    }

    await Vendor.updateOne(
      { _id: decoded.vendorId },
      { $set: { emailUnsubscribed: true } }
    );

    res.send(unsubscribePage("You've been unsubscribed from TendorAI weekly emails.", true));
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(400).send(unsubscribePage('This unsubscribe link is invalid or has expired.', false));
  }
});

function unsubscribePage(message, success) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${success ? 'Unsubscribed' : 'Error'} — TendorAI</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f3f4f6;}
.card{background:white;padding:40px;border-radius:12px;text-align:center;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.1);}
.icon{font-size:48px;margin-bottom:16px;}
h1{margin:0 0 8px;font-size:20px;color:#1f2937;}
p{color:#6b7280;font-size:14px;margin:0;}
a{color:#7c3aed;text-decoration:none;margin-top:16px;display:inline-block;font-size:14px;}</style>
</head><body><div class="card">
<div class="icon">${success ? '&#9989;' : '&#9888;'}</div>
<h1>${success ? 'Unsubscribed' : 'Something went wrong'}</h1>
<p>${message}</p>
${success ? '<a href="https://www.tendorai.com">Go to TendorAI</a>' : ''}
</div></body></html>`;
}

export default router;
