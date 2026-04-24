/**
 * GET /api/content-library
 *
 * Read-only endpoint that returns the v7 pillar library for the
 * authenticated vendor's vendorType, with placeholders in topic
 * titles and primaryDataHooks resolved from the vendor's profile.
 *
 * Auth: vendor JWT (same pattern as vendorPostRoutes).
 * Tier gate: any paid tier. Free tier is rejected.
 * Vendor-type gate: only the four professional verticals (solicitor /
 * accountant / mortgage-advisor / estate-agent). Other types receive
 * 400 because no library exists for them yet.
 *
 * The library itself lives at services/contentPlanner/pillarLibraries.js
 * and is the same data the post generator uses — this endpoint just
 * surfaces it to the frontend's pillar reference grid.
 */

import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from '../models/Vendor.js';
import {
  PILLAR_LIBRARIES,
  UNIVERSAL_RULES,
  LINKEDIN_HOOK_TYPES,
} from '../services/contentPlanner/pillarLibraries.js';

const router = express.Router();

const PAID_TIERS = new Set([
  'starter', 'pro', 'basic', 'visible', 'verified', 'managed', 'enterprise',
]);

const SUPPORTED_VENDOR_TYPES = new Set([
  'solicitor', 'accountant', 'mortgage-advisor', 'estate-agent',
]);

/**
 * Resolve placeholders in a string using the vendor's profile.
 * Only four placeholders are filled in here — {city}, {specialism},
 * {firmName}, and {year}. Every other placeholder ({N}, {X}, {Y},
 * {client-type}, {complex-scenario}, etc.) is left literal so the
 * frontend shows the vendor exactly what they need to fill in.
 *
 * Exported for direct unit testing; the library itself is already
 * covered in contentPlanner.test.js.
 */
export function resolvePlaceholders(text, vendor) {
  if (!text || typeof text !== 'string') return text;
  const city = vendor?.location?.city || 'your city';
  const specialism =
       (vendor?.specialisms && vendor.specialisms[0])
    || (vendor?.practiceAreas && vendor.practiceAreas[0])
    || 'your main service area';
  const firmName = vendor?.company || 'your firm';
  const year = String(new Date().getFullYear());

  return text
    .replace(/\{city\}/g, city)
    .replace(/\{specialism\}/g, specialism)
    .replace(/\{firmName\}/g, firmName)
    .replace(/\{year\}/g, year);
}

router.get('/', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id)
      .select('tier vendorType company location.city specialisms practiceAreas')
      .lean();

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const tier = vendor.tier || 'free';
    if (!PAID_TIERS.has(tier)) {
      return res.status(403).json({
        success: false,
        error: 'Content library requires a paid plan.',
      });
    }

    if (!SUPPORTED_VENDOR_TYPES.has(vendor.vendorType)) {
      return res.status(400).json({
        success: false,
        error: `Content library not available for vendor type: ${vendor.vendorType || '(unset)'}`,
      });
    }

    const library = PILLAR_LIBRARIES[vendor.vendorType] || [];
    const pillars = library.map((pillar) => ({
      id: pillar.id,
      name: pillar.name,
      whyItMatters: pillar.whyItMatters,
      topics: pillar.topics.map((topic) => ({
        ...topic,
        pillar: pillar.id,
        title: resolvePlaceholders(topic.title, vendor),
        primaryDataHook: resolvePlaceholders(topic.primaryDataHook, vendor),
      })),
    }));

    res.json({
      success: true,
      vendorType: vendor.vendorType,
      pillars,
      linkedInHookTypes: LINKEDIN_HOOK_TYPES,
      universalRules: UNIVERSAL_RULES,
    });
  } catch (error) {
    console.error('[ContentLibrary] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load content library' });
  }
});

export default router;
