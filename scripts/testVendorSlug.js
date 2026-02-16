#!/usr/bin/env node

/**
 * Test: Verifies vendor slug lookup + public profile data shape
 * Simulates what the frontend page.tsx does
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
await mongoose.connect(MONGO_URI);
console.log('DB connected\n');

// Pick a real vendor with good data
const richVendor = await Vendor.findOne({
  slug: { $exists: true, $ne: null },
  'location.city': { $exists: true, $ne: '' },
  'services.0': { $exists: true },
  'brands.0': { $exists: true },
}).select({ company: 1, slug: 1 }).lean();

const testSlug = richVendor?.slug || '1-kind-communications';
console.log(`=== TESTING SLUG: "${testSlug}" ===\n`);

// 1. Lookup by slug (same query as frontend page.tsx)
const vendor = await Vendor.findOne({ slug: testSlug })
  .select({
    company: 1,
    slug: 1,
    services: 1,
    location: 1,
    businessProfile: 1,
    brands: 1,
    tier: 1,
    listingStatus: 1,
    'account.status': 1,
    'account.verificationStatus': 1,
  })
  .lean()
  .exec();

if (!vendor) {
  console.log('FAIL: Vendor not found by slug');
  await mongoose.disconnect();
  process.exit(1);
}

console.log('=== VENDOR DATA ===');
console.log(`Company:      ${vendor.company}`);
console.log(`Slug:         ${vendor.slug}`);
console.log(`City:         ${vendor.location?.city || '(none)'}`);
console.log(`Region:       ${vendor.location?.region || '(none)'}`);
console.log(`Services:     ${vendor.services?.join(', ') || '(none)'}`);
console.log(`Brands:       ${vendor.brands?.join(', ') || '(none)'}`);
console.log(`Years:        ${vendor.businessProfile?.yearsInBusiness || 0}`);
console.log(`Description:  ${vendor.businessProfile?.description ? vendor.businessProfile.description.slice(0, 80) + '...' : '(none)'}`);
console.log(`Coverage:     ${vendor.location?.coverage?.length || 0} postcode areas`);
console.log(`Tier:         ${vendor.tier}`);
console.log(`Listing:      ${vendor.listingStatus}`);

// 2. Verify checks
console.log('\n=== CHECKS ===');
const checks = [
  ['has slug', !!vendor.slug],
  ['has company name', !!vendor.company],
  ['has services', vendor.services?.length > 0],
  ['has city', !!vendor.location?.city],
  ['slug matches URL pattern', /^[a-z0-9-]+$/.test(vendor.slug)],
  ['NO phone exposed', !vendor.contactInfo?.phone],  // contactInfo not selected
  ['NO email exposed', !vendor.email],                // email not selected
  ['NO website exposed', !vendor.contactInfo?.website],
  ['NO password exposed', !vendor.password],
];

let allPassed = true;
checks.forEach(([label, pass]) => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}: ${label}`);
  if (!pass) allPassed = false;
});

// 3. Verify page URLs
const pageUrl = `https://www.tendorai.com/suppliers/vendor/${vendor.slug}`;
const canonicalUrl = `https://www.tendorai.com/suppliers/vendor/${vendor.slug}`;
console.log(`\n=== URLS ===`);
console.log(`Page:      ${pageUrl}`);
console.log(`Canonical: ${canonicalUrl}`);

// 4. Verify JSON-LD would be valid
const city = vendor.location?.city || '';
const region = vendor.location?.region || '';
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': canonicalUrl,
  name: vendor.company,
  description: vendor.businessProfile?.description || `${vendor.company} provides ${vendor.services?.join(', ')} in ${city}.`,
  url: canonicalUrl,
  address: {
    '@type': 'PostalAddress',
    ...(city && { addressLocality: city }),
    ...(region && { addressRegion: region }),
    addressCountry: 'GB',
  },
};
const jsonLdStr = JSON.stringify(jsonLd);
const jsonLdValid = jsonLdStr.includes('"@context"') && jsonLdStr.includes('"LocalBusiness"') && jsonLdStr.includes(vendor.company);
console.log(`\n=== JSON-LD ===`);
console.log(`  ${jsonLdValid ? 'PASS' : 'FAIL'}: Valid LocalBusiness schema`);
console.log(`  ${jsonLd.name ? 'PASS' : 'FAIL'}: has name`);
console.log(`  ${jsonLd.address?.addressLocality ? 'PASS' : 'FAIL'}: has addressLocality`);
if (!jsonLdValid) allPassed = false;

// 5. Verify meta title/description
const primaryService = vendor.services?.[0] || 'Office Equipment';
const metaTitle = `${vendor.company} | ${primaryService} Supplier in ${city} | TendorAI`;
const metaDesc = vendor.businessProfile?.description?.slice(0, 140) ||
  `${vendor.company} provides ${vendor.services?.join(', ')} in ${city}. Compare suppliers and request quotes on TendorAI.`;
console.log(`\n=== SEO META ===`);
console.log(`  Title (${metaTitle.length} chars): ${metaTitle}`);
console.log(`  Desc  (${metaDesc.slice(0, 160).length} chars): ${metaDesc.slice(0, 160)}`);
console.log(`  ${metaTitle.length <= 70 ? 'PASS' : 'WARN'}: Title length ${metaTitle.length <= 70 ? '<= 70' : '> 70 (long but OK)'}`);
console.log(`  ${metaDesc.length <= 160 ? 'PASS' : 'WARN'}: Desc length ${metaDesc.length <= 160 ? '<= 160' : '> 160'}`);

// 6. Count total vendors in sitemap
const sitemapCount = await Vendor.countDocuments({ slug: { $exists: true, $ne: null } });
console.log(`\n=== SITEMAP ===`);
console.log(`  ${sitemapCount > 1000 ? 'PASS' : 'FAIL'}: ${sitemapCount} vendor URLs will be in sitemap`);
if (sitemapCount <= 1000) allPassed = false;

console.log(`\n=== ${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} ===`);

await mongoose.disconnect();
process.exit(allPassed ? 0 : 1);
