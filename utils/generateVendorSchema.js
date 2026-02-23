/**
 * Generate Schema.org JSON-LD for a vendor's website.
 * Includes two-way references to TendorAI so AI crawlers see corroboration.
 */

const VENDOR_TYPE_MAP = {
  solicitor: 'LegalService',
  accountant: 'AccountingService',
  'mortgage-advisor': 'FinancialService',
  'estate-agent': 'RealEstateAgent',
};

function mapSchemaType(vendorType) {
  return VENDOR_TYPE_MAP[vendorType] || 'LocalBusiness';
}

/**
 * Recursively remove null, undefined, empty string, and empty array/object values.
 */
function stripEmpty(obj) {
  if (Array.isArray(obj)) {
    const filtered = obj.map(stripEmpty).filter(v => v !== null && v !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (obj && typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      const v = stripEmpty(value);
      if (v !== null && v !== undefined && v !== '' &&
          !(Array.isArray(v) && v.length === 0) &&
          !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) {
        cleaned[key] = v;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  return obj;
}

/**
 * Build regulatory identifiers from vendor data.
 */
function buildIdentifiers(vendor) {
  const identifiers = [];

  if (vendor.sraNumber) {
    identifiers.push({
      '@type': 'PropertyValue',
      name: 'SRA Number',
      propertyID: 'https://www.sra.org.uk',
      value: vendor.sraNumber,
    });
  }
  if (vendor.fcaNumber) {
    identifiers.push({
      '@type': 'PropertyValue',
      name: 'FCA Number',
      propertyID: 'https://www.fca.org.uk',
      value: vendor.fcaNumber,
    });
  }
  if (vendor.icaewFirmNumber) {
    identifiers.push({
      '@type': 'PropertyValue',
      name: 'ICAEW Firm Number',
      propertyID: 'https://www.icaew.com',
      value: vendor.icaewFirmNumber,
    });
  }
  if (vendor.propertymarkNumber) {
    identifiers.push({
      '@type': 'PropertyValue',
      name: 'Propertymark Number',
      propertyID: 'https://www.propertymark.co.uk',
      value: vendor.propertymarkNumber,
    });
  }

  // TendorAI Verified identifier
  const tier = vendor.tier || vendor.account?.tier || 'free';
  if (tier === 'verified') {
    identifiers.push({
      '@type': 'PropertyValue',
      name: 'TendorAI Verified',
      propertyID: 'https://www.tendorai.com',
      value: vendor._id?.toString() || '',
    });
  }

  return identifiers;
}

/**
 * Generate full Schema.org JSON-LD for a vendor.
 *
 * @param {Object} vendor - Vendor document (lean or full)
 * @param {Array} products - Active VendorProduct documents
 * @param {Array} reviews - Approved Review documents
 * @returns {Object} Clean JSON-LD object
 */
export function generateVendorSchema(vendor, products = [], reviews = []) {
  const vendorId = vendor._id?.toString() || '';
  const profileUrl = `https://www.tendorai.com/suppliers/profile/${vendorId}`;
  const schemaType = mapSchemaType(vendor.vendorType);

  // Ensure website URL has a protocol
  const rawWebsite = vendor.contactInfo?.website || '';
  const website = rawWebsite && !rawWebsite.startsWith('http') ? `https://${rawWebsite}` : rawWebsite;

  // Build sameAs links
  const sameAs = [profileUrl];
  if (website) sameAs.push(website);
  if (vendor.contactInfo?.linkedIn) sameAs.push(vendor.contactInfo.linkedIn);

  // Build knowsAbout from services, practiceAreas, specializations
  const knowsAbout = [
    ...(vendor.services || []),
    ...(vendor.practiceAreas || []),
    ...(vendor.businessProfile?.specializations || []),
  ].filter(Boolean);

  // Build offers catalog from products
  const offers = products.slice(0, 20).map(p => ({
    '@type': 'Offer',
    itemOffered: {
      '@type': 'Product',
      name: `${p.manufacturer || ''} ${p.model || p.productModel || ''}`.trim(),
      description: p.description || undefined,
      category: p.category || p.serviceCategory || undefined,
    },
    ...(p.costs?.totalMachineCost && {
      price: p.costs.totalMachineCost,
      priceCurrency: 'GBP',
    }),
    availability: 'https://schema.org/InStock',
  }));

  // Build aggregate rating
  const rating = vendor.performance?.rating || 0;
  const reviewCount = vendor.performance?.reviewCount || reviews.length || 0;
  const aggregateRating = rating > 0 ? {
    '@type': 'AggregateRating',
    ratingValue: rating,
    reviewCount: reviewCount || 1,
    bestRating: 5,
    worstRating: 1,
  } : undefined;

  // Build individual reviews
  const reviewItems = reviews.slice(0, 10).map(r => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: r.reviewer?.name || 'Anonymous' },
    datePublished: r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : undefined,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: r.rating,
      bestRating: 5,
    },
    name: r.title || undefined,
    reviewBody: r.content || undefined,
  }));

  const schema = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    '@id': profileUrl,
    name: vendor.company,
    description: vendor.businessProfile?.description || `${vendor.company} - Professional services`,
    url: website || profileUrl,
    telephone: vendor.contactInfo?.phone || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: vendor.location?.address || undefined,
      addressLocality: vendor.location?.city || undefined,
      addressRegion: vendor.location?.region || undefined,
      postalCode: vendor.location?.postcode || undefined,
      addressCountry: 'GB',
    },
    sameAs,
    identifier: buildIdentifiers(vendor),
    memberOf: {
      '@type': 'Organization',
      name: 'TendorAI',
      url: 'https://www.tendorai.com',
      description: 'The UK\u2019s AI Visibility Platform \u2014 verified business profiles optimised for AI recommendations',
    },
    knowsAbout: knowsAbout.length > 0 ? knowsAbout : undefined,
    ...(vendor.businessProfile?.yearsInBusiness && {
      foundingDate: new Date().getFullYear() - vendor.businessProfile.yearsInBusiness,
    }),
    ...(vendor.brands?.length > 0 && { brand: vendor.brands.map(b => ({ '@type': 'Brand', name: b })) }),
    aggregateRating,
    review: reviewItems.length > 0 ? reviewItems : undefined,
    hasOfferCatalog: offers.length > 0 ? {
      '@type': 'OfferCatalog',
      name: `${vendor.company} Products & Services`,
      itemListElement: offers,
    } : undefined,
    potentialAction: {
      '@type': 'AskAction',
      name: 'Request a Quote',
      target: profileUrl,
      description: `Request a quote from ${vendor.company} via TendorAI`,
    },
    areaServed: vendor.location?.coverage?.map(code => ({
      '@type': 'Place',
      name: code,
    })),
  };

  return stripEmpty(schema);
}

export { mapSchemaType, stripEmpty, buildIdentifiers };
