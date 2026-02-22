import express from 'express';
import cors from 'cors';
import axios from 'axios';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';
import Review from '../models/Review.js';
import { generateVendorSchema } from '../utils/generateVendorSchema.js';

const router = express.Router();

// Public CORS — any origin can embed the schema script
router.use(cors({ origin: '*' }));

/**
 * Load vendor + products + reviews for schema generation.
 */
async function loadVendorData(vendorId) {
  const [vendor, products, reviews] = await Promise.all([
    Vendor.findById(vendorId)
      .select('-password')
      .lean(),
    VendorProduct.find({ vendorId, status: 'active' })
      .select('manufacturer model productModel description category serviceCategory speed features costs')
      .limit(20)
      .lean(),
    Review.find({ vendor: vendorId, status: 'approved' })
      .select('reviewer.name rating title content createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);
  return { vendor, products, reviews };
}

/**
 * Check if vendor is on pro/verified tier.
 */
function isProTier(vendor) {
  const tier = vendor?.tier || vendor?.account?.tier || 'free';
  return tier === 'verified';
}

/**
 * GET /api/schema/:vendorId.js
 * Returns a self-executing script that injects JSON-LD into the page.
 */
router.get('/:file([a-f0-9]{24}\\.js)', async (req, res) => {
  try {
    const vendorId = req.params.file.replace('.js', '');
    const { vendor, products, reviews } = await loadVendorData(vendorId);

    if (!vendor) {
      res.set('Content-Type', 'application/javascript');
      return res.status(404).send('// TendorAI: Vendor not found');
    }

    if (!isProTier(vendor)) {
      res.set('Content-Type', 'application/javascript');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send("console.log('TendorAI Schema requires Pro. Upgrade at tendorai.com');");
    }

    const schema = generateVendorSchema(vendor, products, reviews);
    const jsonString = JSON.stringify(schema);

    const script = `(function(){try{var s=document.createElement('script');s.type='application/ld+json';s.textContent=${JSON.stringify(jsonString)};document.head.appendChild(s);}catch(e){console.warn('TendorAI Schema: ',e);}})();`;

    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(script);
  } catch (error) {
    console.error('Schema .js error:', error);
    res.set('Content-Type', 'application/javascript');
    res.status(500).send('// TendorAI Schema: internal error');
  }
});

/**
 * GET /api/schema/:vendorId.json
 * Returns raw JSON-LD.
 */
router.get('/:file([a-f0-9]{24}\\.json)', async (req, res) => {
  try {
    const vendorId = req.params.file.replace('.json', '');
    const { vendor, products, reviews } = await loadVendorData(vendorId);

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!isProTier(vendor)) {
      return res.status(403).json({
        error: 'TendorAI Schema requires Pro tier',
        upgradeUrl: 'https://www.tendorai.com/vendor-dashboard/settings?tab=subscription',
      });
    }

    const schema = generateVendorSchema(vendor, products, reviews);

    res.set('Content-Type', 'application/ld+json');
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(schema);
  } catch (error) {
    console.error('Schema .json error:', error);
    res.status(500).json({ error: 'Failed to generate schema' });
  }
});

/**
 * GET /api/schema/:vendorId/validate
 * Fetch vendor's website and check if TendorAI schema is installed.
 * Requires vendorAuth + pro tier.
 */
router.get('/:vendorId/validate', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id).select('-password').lean();
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    if (!isProTier(vendor)) {
      return res.status(403).json({
        success: false,
        error: 'Schema validation requires Pro tier',
      });
    }

    const websiteUrl = vendor.contactInfo?.website;
    if (!websiteUrl) {
      return res.status(400).json({
        success: false,
        error: 'No website URL on your profile. Add one in Settings.',
      });
    }

    // Fetch the vendor's website
    let html;
    try {
      const response = await axios.get(websiteUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'TendorAI-Schema-Validator/1.0',
          Accept: 'text/html',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });
      html = response.data;
    } catch (fetchError) {
      const msg = fetchError.code === 'ECONNABORTED'
        ? 'Website took too long to respond.'
        : fetchError.response
          ? `Website returned HTTP ${fetchError.response.status}.`
          : 'Could not reach the website.';
      return res.status(422).json({ success: false, error: msg });
    }

    if (typeof html !== 'string') {
      return res.status(422).json({ success: false, error: 'Website did not return HTML.' });
    }

    // Extract JSON-LD blocks
    const ldJsonMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    const schemasFound = [];
    let tendoraiSchemaFound = false;

    for (const match of ldJsonMatches) {
      const contentMatch = match.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (contentMatch && contentMatch[1]) {
        try {
          const parsed = JSON.parse(contentMatch[1].trim());
          schemasFound.push(parsed);
          // Check if this schema references TendorAI
          const jsonStr = JSON.stringify(parsed).toLowerCase();
          if (jsonStr.includes('tendorai.com')) {
            tendoraiSchemaFound = true;
          }
        } catch {
          // Invalid JSON-LD, skip
        }
      }
    }

    // Also check for script tag embed
    const hasScriptTag = html.includes('api.tendorai.com/api/schema/') ||
                         html.includes('ai-procurement-backend') && html.includes('/api/schema/');

    if (hasScriptTag && !tendoraiSchemaFound) {
      tendoraiSchemaFound = true;
    }

    // Generate canonical schema for comparison
    const products = await VendorProduct.find({ vendorId: vendor._id, status: 'active' })
      .select('manufacturer model productModel description category serviceCategory speed features costs')
      .limit(20).lean();
    const reviews = await Review.find({ vendor: vendor._id, status: 'approved' })
      .select('reviewer.name rating title content createdAt')
      .sort({ createdAt: -1 }).limit(10).lean();

    const canonicalSchema = generateVendorSchema(vendor, products, reviews);

    // Compare fields
    const canonicalFields = Object.keys(canonicalSchema).filter(k => k !== '@context');
    const matchingFields = [];
    const missingFields = [];

    for (const field of canonicalFields) {
      const found = schemasFound.some(s => {
        const jsonStr = JSON.stringify(s);
        // Check if the field name exists in any found schema
        return jsonStr.includes(`"${field}"`) || jsonStr.includes(`"@${field}"`);
      });
      if (found) {
        matchingFields.push(field);
      } else {
        missingFields.push(field);
      }
    }

    const matchPercentage = canonicalFields.length > 0
      ? Math.round((matchingFields.length / canonicalFields.length) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        schemasFound: schemasFound.length,
        tendoraiSchemaFound,
        hasScriptTag,
        matchingFields,
        missingFields,
        matchPercentage,
        websiteUrl,
      },
    });
  } catch (error) {
    console.error('Schema validate error:', error);
    res.status(500).json({ success: false, error: 'Validation failed.' });
  }
});

export default router;
