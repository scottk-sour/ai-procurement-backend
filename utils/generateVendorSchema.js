/**
 * Generate Schema.org JSON-LD for a vendor's website.
 * Includes two-way references to TendorAI so AI crawlers see corroboration.
 */

import UK_POSTCODE_AREA_MAP from './ukPostcodeAreaMap.js';

const VENDOR_TYPE_MAP = {
  solicitor: 'LegalService',
  accountant: 'AccountingService',
  'mortgage-advisor': 'FinancialService',
  'estate-agent': 'RealEstateAgent',
};

/** Fix 1: additionalType map for office-equipment services */
const SERVICE_ADDITIONAL_TYPE_MAP = {
  Photocopiers: 'OfficeEquipmentStore',
  IT: 'ProfessionalService',
  Telecoms: 'ProfessionalService',
  CCTV: 'ProfessionalService',
  Security: 'ProfessionalService',
  Software: 'SoftwareApplication',
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
 * Fix 1: Build additionalType array for office-equipment vendors.
 */
function buildAdditionalTypes(vendor) {
  if (vendor.vendorType !== 'office-equipment') return undefined;
  const types = new Set();
  for (const svc of (vendor.services || [])) {
    const t = SERVICE_ADDITIONAL_TYPE_MAP[svc];
    if (t) types.add(t);
  }
  const arr = [...types];
  return arr.length > 0 ? arr : undefined;
}

/**
 * Fix 2: Build areaServed with real place names from postcode areas.
 */
function buildAreaServed(vendor) {
  const areas = [];

  if (vendor.location?.city) {
    areas.push({ '@type': 'City', name: vendor.location.city });
  }

  const codes = vendor.postcodeAreas?.length > 0
    ? vendor.postcodeAreas
    : (vendor.location?.coverage || []);

  for (const code of codes) {
    // Try exact match first, then extract alpha prefix for postcode districts (e.g. WR10 → WR)
    let placeName = UK_POSTCODE_AREA_MAP[code];
    let areaCode = code;
    if (!placeName) {
      const prefix = code.match(/^[A-Z]{1,2}/i)?.[0]?.toUpperCase();
      if (prefix && UK_POSTCODE_AREA_MAP[prefix]) {
        placeName = UK_POSTCODE_AREA_MAP[prefix];
        areaCode = prefix;
      }
    }
    areas.push({
      '@type': 'AdministrativeArea',
      name: placeName ? `${placeName} (${areaCode})` : code,
    });
  }

  return areas.length > 0 ? areas : undefined;
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
 * Fix 5: Build hasCredential array from regulatory numbers and certifications.
 */
function buildCredentials(vendor) {
  const credentials = [];

  if (vendor.sraNumber) {
    credentials.push({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'regulatory',
      name: 'SRA Registration',
      recognizedBy: {
        '@type': 'Organization',
        name: 'Solicitors Regulation Authority',
        url: 'https://www.sra.org.uk',
      },
      identifier: vendor.sraNumber,
    });
  }
  if (vendor.fcaNumber) {
    credentials.push({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'regulatory',
      name: 'FCA Registration',
      recognizedBy: {
        '@type': 'Organization',
        name: 'Financial Conduct Authority',
        url: 'https://www.fca.org.uk',
      },
      identifier: vendor.fcaNumber,
    });
  }
  if (vendor.icaewFirmNumber) {
    credentials.push({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'regulatory',
      name: 'ICAEW Membership',
      recognizedBy: {
        '@type': 'Organization',
        name: 'Institute of Chartered Accountants in England and Wales',
        url: 'https://www.icaew.com',
      },
      identifier: vendor.icaewFirmNumber,
    });
  }
  if (vendor.propertymarkNumber) {
    credentials.push({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'regulatory',
      name: 'Propertymark Membership',
      recognizedBy: {
        '@type': 'Organization',
        name: 'Propertymark',
        url: 'https://www.propertymark.co.uk',
      },
      identifier: vendor.propertymarkNumber,
    });
  }

  for (const cert of (vendor.businessProfile?.certifications || [])) {
    if (cert) {
      credentials.push({
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: 'certification',
        name: cert,
      });
    }
  }

  return credentials;
}

/**
 * Fix 6: Build openingHoursSpecification from supportHours.
 */
function buildOpeningHours(vendor) {
  const hours = vendor.serviceCapabilities?.supportHours;
  if (!hours) return undefined;

  const HOURS_MAP = {
    '9-5': { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '17:00' },
    '8-6': { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '18:00' },
    '24/7': { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' },
    'Extended hours': { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '07:00', closes: '21:00' },
  };

  const config = HOURS_MAP[hours];
  if (!config) return undefined;

  return config.days.map(day => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: day,
    opens: config.opens,
    closes: config.closes,
  }));
}

/**
 * Fix 8: Derive priceRange from fixedFees or product costs.
 */
function buildPriceRange(vendor, products) {
  const fees = vendor.fixedFees?.filter(f => f.fee);
  if (fees?.length > 0) {
    const nums = fees
      .map(f => parseFloat(String(f.fee).replace(/[^0-9.]/g, '')))
      .filter(n => !isNaN(n) && n > 0);
    if (nums.length > 0) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      return min === max ? `\u00a3${min}` : `\u00a3${min} - \u00a3${max}`;
    }
  }

  const costs = products.map(p => p.costs?.totalMachineCost).filter(c => c && c > 0);
  if (costs.length > 0) {
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    return min === max ? `\u00a3${min}` : `\u00a3${min} - \u00a3${max}`;
  }

  return '\u00a3\u00a3';
}

/**
 * Fix 11: Generate a rich description fallback when none exists.
 */
function buildDescription(vendor) {
  const existing = vendor.businessProfile?.description;
  if (existing && existing.length >= 20) return existing;

  const typeNames = {
    solicitor: 'solicitors',
    accountant: 'accountants',
    'mortgage-advisor': 'mortgage advisors',
    'estate-agent': 'estate agents',
    'office-equipment': 'office equipment suppliers',
  };
  const typeName = typeNames[vendor.vendorType] || 'professional services providers';

  const parts = [`${vendor.company} is a firm of ${typeName}`];

  if (vendor.location?.city) {
    parts.push(`based in ${vendor.location.city}`);
  }

  if (vendor.sraNumber) parts.push('regulated by the Solicitors Regulation Authority');
  else if (vendor.fcaNumber) parts.push('regulated by the Financial Conduct Authority');
  else if (vendor.icaewFirmNumber) parts.push('registered with ICAEW');
  else if (vendor.propertymarkNumber) parts.push('registered with Propertymark');

  const areas = vendor.practiceAreas?.filter(Boolean);
  if (areas?.length > 0) {
    parts.push(`specialising in ${areas.slice(0, 5).join(', ')}`);
  }

  return parts.join(', ') + '.';
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

  // Fix 1: additionalType for office-equipment vendors
  const additionalType = buildAdditionalTypes(vendor);

  // Ensure website URL has a protocol
  const rawWebsite = vendor.contactInfo?.website || '';
  const website = rawWebsite && !rawWebsite.startsWith('http') ? `https://${rawWebsite}` : rawWebsite;

  // Fix 10: Deduplicate sameAs
  const sameAsSet = new Set([profileUrl]);
  if (website) sameAsSet.add(website);
  if (vendor.contactInfo?.linkedIn) sameAsSet.add(vendor.contactInfo.linkedIn);
  const sameAs = [...sameAsSet];

  // Build knowsAbout from services, practiceAreas, specializations
  const knowsAbout = [
    ...(vendor.services || []),
    ...(vendor.practiceAreas || []),
    ...(vendor.businessProfile?.specializations || []),
  ].filter(Boolean);

  // Build offers catalog from products
  let offers = products.slice(0, 20).map(p => ({
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

  // Fix 7: practiceAreas as Service offers for professional vendors with no products
  if (offers.length === 0 && vendor.practiceAreas?.length > 0) {
    const feeMap = {};
    for (const ff of (vendor.fixedFees || [])) {
      if (ff.service && ff.fee) feeMap[ff.service.toLowerCase()] = ff.fee;
    }
    offers = vendor.practiceAreas.filter(Boolean).slice(0, 20).map(area => {
      const fee = feeMap[area.toLowerCase()];
      const parsed = fee ? parseFloat(String(fee).replace(/[^0-9.]/g, '')) : NaN;
      return {
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: area },
        ...(!isNaN(parsed) && parsed > 0 && {
          price: parsed,
          priceCurrency: 'GBP',
        }),
      };
    });
  }

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

  // Fix 4: geo coordinates
  const lat = vendor.location?.coordinates?.latitude;
  const lng = vendor.location?.coordinates?.longitude;
  const geo = (lat && lng) ? {
    '@type': 'GeoCoordinates',
    latitude: lat,
    longitude: lng,
  } : undefined;

  const schema = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    ...(additionalType && { additionalType }),
    '@id': profileUrl,
    name: vendor.company,
    description: buildDescription(vendor),
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
    geo,
    sameAs,
    identifier: buildIdentifiers(vendor),
    hasCredential: buildCredentials(vendor),
    memberOf: {
      '@type': 'Organization',
      name: 'TendorAI',
      url: 'https://www.tendorai.com',
      description: 'The UK\u2019s AI Visibility Platform \u2014 verified business profiles optimised for AI recommendations',
    },
    knowsAbout: knowsAbout.length > 0 ? knowsAbout : undefined,
    ...(vendor.businessProfile?.yearsInBusiness && {
      foundingDate: String(new Date().getFullYear() - vendor.businessProfile.yearsInBusiness),
    }),
    ...(vendor.brands?.length > 0 && { brand: vendor.brands.map(b => ({ '@type': 'Brand', name: b })) }),
    priceRange: buildPriceRange(vendor, products),
    aggregateRating,
    review: reviewItems.length > 0 ? reviewItems : undefined,
    hasOfferCatalog: offers.length > 0 ? {
      '@type': 'OfferCatalog',
      name: `${vendor.company} Products & Services`,
      itemListElement: offers,
    } : undefined,
    potentialAction: {
      '@type': 'CommunicateAction',
      name: 'Request a Quote',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${profileUrl}?quote=true`,
        actionPlatform: 'https://schema.org/DesktopWebPlatform',
      },
      description: `Request a quote from ${vendor.company} via TendorAI`,
    },
    areaServed: buildAreaServed(vendor),
    openingHoursSpecification: buildOpeningHours(vendor),
    ...(vendor.languages?.length > 0 && { knowsLanguage: vendor.languages }),
  };

  return stripEmpty(schema);
}

export { mapSchemaType, stripEmpty, buildIdentifiers, buildCredentials, buildDescription };
