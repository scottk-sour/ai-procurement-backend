/**
 * Schema.org JSON-LD generator for VendorService documents.
 *
 * Three public entry points:
 *   generateServiceSchema(vendorService, vendor)
 *     → single-service JSON-LD (Service or FinancialProduct).
 *
 *   combineVendorAndServiceSchemas(vendor, services)
 *     → combined @graph: vendor-level schema with hasOfferCatalog
 *       populated from the services, plus per-service FAQPage entries.
 *
 *   calculateCompletenessScore(vendorService)
 *     → { score: 0-100, signals: { hasDescription, hasFeeDetail,
 *         hasFaqs, hasAccreditations, faqCount,
 *         descriptionWordCount } }.
 *
 * The generator never imports the VendorService model — it accepts
 * plain objects or Mongoose docs interchangeably. This keeps the
 * dependency direction model → generator.
 */

import { generateVendorSchema } from '../utils/generateVendorSchema.js';

const VENDOR_PROVIDER_TYPE = Object.freeze({
  'solicitor': 'LegalService',
  'accountant': 'AccountingService',
  'mortgage-advisor': 'FinancialService',
  'estate-agent': 'RealEstateAgent',
});

const JURISDICTION_NAME = Object.freeze({
  'England-Wales': 'England and Wales',
  'Scotland': 'Scotland',
  'NI': 'Northern Ireland',
});

const REDRESS_NAME = Object.freeze({
  'TPO': 'The Property Ombudsman',
  'PRS': 'Property Redress Scheme',
});

const SOLICITOR_PRICE_TYPE = Object.freeze({
  'fixed': 'RegularPrice',
  'hourly': 'Hourly',
  'from': 'MinimumPrice',
});

const ACCOUNTANT_PRICE_TYPE = Object.freeze({
  'fixed': 'RegularPrice',
  'hourly': 'Hourly',
  'monthly-retainer': 'Subscription',
  'from': 'MinimumPrice',
});

const ESTATE_PRICE_TYPE = Object.freeze({
  'fixed': 'RegularPrice',
  'hybrid': 'Compound',
});

// ─── Helpers ──────────────────────────────────────────────────────────

function profileUrl(vendor) {
  if (!vendor) return undefined;
  const slug = vendor.slug;
  const id = vendor._id?.toString?.() || (typeof vendor._id === 'string' ? vendor._id : '');
  if (slug) return `https://www.tendorai.com/suppliers/vendor/${slug}`;
  if (id) return `https://www.tendorai.com/suppliers/profile/${id}`;
  return undefined;
}

function stripEmpty(obj) {
  if (Array.isArray(obj)) {
    const filtered = obj.map(stripEmpty).filter((v) => v !== null && v !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
      const s = stripEmpty(v);
      if (s === null || s === undefined || s === '') continue;
      if (Array.isArray(s) && s.length === 0) continue;
      if (typeof s === 'object' && !Array.isArray(s) && Object.keys(s).length === 0) continue;
      cleaned[k] = s;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  return obj;
}

function plainify(v) {
  if (v && typeof v.toObject === 'function') return v.toObject({ depopulate: true, virtuals: false });
  return v;
}

function providerNode(vendor, vendorType) {
  if (!vendor) return undefined;
  return stripEmpty({
    '@type': VENDOR_PROVIDER_TYPE[vendorType] || 'Organization',
    '@id': profileUrl(vendor),
    name: vendor.company,
    url: profileUrl(vendor),
  });
}

function faqItem(faq) {
  return {
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  };
}

function buildFaqPage(service, vendor) {
  const faqs = (service.faqs || []).filter((f) => f && f.question && f.answer);
  if (faqs.length === 0) return undefined;
  const url = profileUrl(vendor);
  const serviceId = service._id?.toString?.() || service._id || '';
  return {
    '@type': 'FAQPage',
    '@id': url ? `${url}#service-${serviceId}-faq` : undefined,
    name: service.name ? `${service.name} — frequently asked questions` : 'Frequently asked questions',
    mainEntity: faqs.map(faqItem),
    about: url ? { '@id': url } : undefined,
  };
}

// ─── Per-vertical service schema ──────────────────────────────────────

function buildSolicitorSchema(service, vendor) {
  const d = service.solicitorData || {};
  const provider = providerNode(vendor, 'solicitor');

  const offer = (d.feeType || typeof d.feeAmountGBP === 'number') ? {
    '@type': 'Offer',
    ...(typeof d.feeAmountGBP === 'number' && { price: d.feeAmountGBP, priceCurrency: 'GBP' }),
    priceSpecification: {
      '@type': 'PriceSpecification',
      priceCurrency: 'GBP',
      ...(typeof d.feeAmountGBP === 'number' && { price: d.feeAmountGBP }),
      ...(d.feeType && { priceType: SOLICITOR_PRICE_TYPE[d.feeType] || 'RegularPrice' }),
    },
  } : undefined;

  const hasCredential = (d.accreditations || []).filter(Boolean).map((a) => ({
    '@type': 'EducationalOccupationalCredential',
    credentialCategory: a,
  }));

  const areaServed = (d.jurisdictions || []).map((j) => ({
    '@type': 'AdministrativeArea',
    name: JURISDICTION_NAME[j] || j,
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description || undefined,
    serviceType: d.practiceArea || undefined,
    provider,
    offers: offer,
    termsOfService: (d.whatsIncluded || []).filter(Boolean).join('. ') || undefined,
    hasCredential: hasCredential.length > 0 ? hasCredential : undefined,
    areaServed: areaServed.length > 0 ? areaServed : undefined,
    ...(d.legalAidAvailable === true && { isAccessibleForFree: false, acceptedPaymentMethod: 'LegalAid' }),
  };
}

function buildAccountantSchema(service, vendor) {
  const d = service.accountantData || {};
  const provider = providerNode(vendor, 'accountant');

  const offer = (d.feeType || typeof d.feeAmountGBP === 'number') ? {
    '@type': 'Offer',
    ...(typeof d.feeAmountGBP === 'number' && { price: d.feeAmountGBP, priceCurrency: 'GBP' }),
    priceSpecification: {
      '@type': 'PriceSpecification',
      priceCurrency: 'GBP',
      ...(typeof d.feeAmountGBP === 'number' && { price: d.feeAmountGBP }),
      ...(d.feeType && { priceType: ACCOUNTANT_PRICE_TYPE[d.feeType] || 'RegularPrice' }),
    },
  } : undefined;

  const audience = (d.clientTypes && d.clientTypes.length > 0) ? {
    '@type': 'Audience',
    audienceType: d.clientTypes.join(', '),
  } : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description || undefined,
    serviceType: d.serviceCategory || undefined,
    provider,
    offers: offer,
    knowsAbout: (d.softwareSupported && d.softwareSupported.length > 0) ? d.softwareSupported : undefined,
    audience,
    ...(d.softwarePartnerStatus && d.softwarePartnerStatus !== 'None' && {
      award: `${d.softwarePartnerStatus} software partner`,
    }),
  };
}

function buildMortgageAdvisorSchema(service, vendor) {
  const d = service.mortgageAdvisorData || {};
  const provider = providerNode(vendor, 'mortgage-advisor');

  const feeParts = [];
  if (d.feeType === 'fee-free') feeParts.push('Fee-free to the client');
  else if (d.feeType === 'fixed' && typeof d.feeAmountGBP === 'number') feeParts.push(`Fixed fee of £${d.feeAmountGBP}`);
  else if (d.feeType === 'percentage' && typeof d.feePercentage === 'number') feeParts.push(`${d.feePercentage}% of loan amount`);
  else if (d.feeType === 'combination') feeParts.push('Combination fee structure');

  const descriptionParts = [];
  if (service.description) descriptionParts.push(service.description);
  if (d.wholeOfMarket === true) descriptionParts.push('Whole-of-market adviser.');
  if (typeof d.lenderPanelSize === 'number' && d.lenderPanelSize > 0) {
    descriptionParts.push(`Access to ${d.lenderPanelSize} lenders.`);
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: service.name,
    description: descriptionParts.join(' ') || undefined,
    category: d.mortgageType || undefined,
    provider,
    feesAndCommissionsSpecification: feeParts.length > 0 ? feeParts.join('. ') : undefined,
    ...(d.protectionOffered && d.protectionOffered.length > 0 && {
      isRelatedTo: d.protectionOffered.map((p) => ({ '@type': 'FinancialProduct', name: p, category: 'Protection' })),
    }),
    ...(d.appointmentTypes && d.appointmentTypes.length > 0 && {
      availableChannel: d.appointmentTypes.map((a) => ({ '@type': 'ServiceChannel', availableLanguage: 'en-GB', serviceType: a })),
    }),
  };
}

function buildEstateAgentSchema(service, vendor) {
  const d = service.estateAgentData || {};
  const provider = providerNode(vendor, 'estate-agent');

  let offer;
  if (d.feeType === 'percentage' && typeof d.feePercentage === 'number') {
    offer = {
      '@type': 'Offer',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: d.feePercentage,
        priceCurrency: 'GBP',
        unitText: '%',
      },
    };
  } else if (d.feeType || typeof d.feeAmountGBP === 'number') {
    offer = {
      '@type': 'Offer',
      ...(typeof d.feeAmountGBP === 'number' && { price: d.feeAmountGBP, priceCurrency: 'GBP' }),
      priceSpecification: {
        '@type': 'PriceSpecification',
        priceCurrency: 'GBP',
        ...(typeof d.feeAmountGBP === 'number' && { price: d.feeAmountGBP }),
        ...(d.feeType && { priceType: ESTATE_PRICE_TYPE[d.feeType] || 'RegularPrice' }),
      },
    };
  }

  const areaServed = (d.coveragePostcodes || []).map((p) => ({ '@type': 'Place', name: p }));

  const memberOf = d.redressScheme ? {
    '@type': 'Organization',
    name: REDRESS_NAME[d.redressScheme] || d.redressScheme,
  } : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description || undefined,
    serviceType: d.serviceCategory || undefined,
    provider,
    offers: offer,
    areaServed: areaServed.length > 0 ? areaServed : undefined,
    memberOf,
    ...(d.clientMoneyProtection === true && { hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Client Money Protection' } }),
    ...(d.propertyTypes && d.propertyTypes.length > 0 && { category: d.propertyTypes }),
  };
}

const BUILDERS = Object.freeze({
  'solicitor': buildSolicitorSchema,
  'accountant': buildAccountantSchema,
  'mortgage-advisor': buildMortgageAdvisorSchema,
  'estate-agent': buildEstateAgentSchema,
});

// ─── Public API ───────────────────────────────────────────────────────

export function generateServiceSchema(vendorService, vendor) {
  if (!vendorService) return null;
  const service = plainify(vendorService);
  const v = plainify(vendor);
  const builder = BUILDERS[service.vendorType];
  if (!builder) return null;
  return stripEmpty(builder(service, v));
}

export function combineVendorAndServiceSchemas(vendor, services) {
  const v = plainify(vendor);
  // Vendor-level schema generated without products — services replace the
  // old catalog. stripEmpty later removes empty branches.
  const vendorSchema = generateVendorSchema(v, [], []);

  const items = (services || []).map(plainify).filter(Boolean).map((s) => {
    const node = BUILDERS[s.vendorType]?.(s, v);
    if (!node) return null;
    // Nested under OfferCatalog → drop @context on inner nodes.
    const { '@context': _omit, ...rest } = node;
    return { '@type': 'Offer', itemOffered: stripEmpty(rest) };
  }).filter(Boolean);

  if (vendorSchema && items.length > 0) {
    vendorSchema.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: `${v?.company || 'Vendor'} services`,
      itemListElement: items,
    };
  }

  const faqPages = (services || []).map((s) => buildFaqPage(plainify(s), v)).filter(Boolean);

  const graph = [];
  if (vendorSchema) graph.push(vendorSchema);
  for (const p of faqPages) graph.push(p);

  if (graph.length === 0) return null;
  return stripEmpty({
    '@context': 'https://schema.org',
    '@graph': graph,
  });
}

// ─── Completeness scoring ─────────────────────────────────────────────

function wordCount(s) {
  if (!s || typeof s !== 'string') return 0;
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function hasFeeDetail(service) {
  const d = (service.solicitorData || service.accountantData
         || service.mortgageAdvisorData || service.estateAgentData) || {};
  if (service.vendorType === 'mortgage-advisor') {
    if (!d.feeType) return false;
    if (d.feeType === 'fee-free') return true;
    return (typeof d.feeAmountGBP === 'number' && d.feeAmountGBP > 0)
        || (typeof d.feePercentage === 'number' && d.feePercentage > 0);
  }
  if (service.vendorType === 'estate-agent') {
    if (!d.feeType) return false;
    return (typeof d.feeAmountGBP === 'number' && d.feeAmountGBP > 0)
        || (typeof d.feePercentage === 'number' && d.feePercentage > 0);
  }
  // solicitor + accountant
  return !!d.feeType && typeof d.feeAmountGBP === 'number' && d.feeAmountGBP > 0;
}

function hasVerticalTurnaroundSignal(service) {
  if (service.vendorType === 'solicitor') {
    return !!service.solicitorData?.turnaround;
  }
  if (service.vendorType === 'accountant') {
    const d = service.accountantData || {};
    return d.feeType === 'monthly-retainer' || d.freeConsultation === true;
  }
  if (service.vendorType === 'mortgage-advisor') {
    const arr = service.mortgageAdvisorData?.appointmentTypes || [];
    return arr.length > 0;
  }
  if (service.vendorType === 'estate-agent') {
    return typeof service.estateAgentData?.tieInPeriodWeeks === 'number';
  }
  return false;
}

function hasVerticalCredentialSignal(service) {
  if (service.vendorType === 'solicitor') {
    const arr = service.solicitorData?.accreditations || [];
    return arr.length > 0;
  }
  if (service.vendorType === 'accountant') {
    const d = service.accountantData || {};
    return (d.softwarePartnerStatus && d.softwarePartnerStatus !== 'None') || d.mtdCompliant === true;
  }
  if (service.vendorType === 'mortgage-advisor') {
    return typeof service.mortgageAdvisorData?.wholeOfMarket === 'boolean';
  }
  if (service.vendorType === 'estate-agent') {
    const d = service.estateAgentData || {};
    return !!d.redressScheme && d.clientMoneyProtection === true;
  }
  return false;
}

export function calculateCompletenessScore(vendorService) {
  const s = plainify(vendorService) || {};

  const descWords = wordCount(s.description);
  const faqs = (s.faqs || []).filter((f) => f && f.question && f.answer);
  const faqCount = faqs.length;

  let score = 0;
  if (s.description) score += descWords >= 150 ? 20 : 10;
  if (hasFeeDetail(s)) score += 20;
  if (hasVerticalTurnaroundSignal(s)) score += 10;
  if (faqCount === 0) score += 0;
  else if (faqCount <= 2) score += 10;
  else score += 25;
  if (hasVerticalCredentialSignal(s)) score += 15;
  if (s.name && typeof s.name === 'string' && s.name.trim().length > 3) score += 10;

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  const signals = {
    hasDescription: !!s.description,
    hasFeeDetail: hasFeeDetail(s),
    hasFaqs: faqCount > 0,
    hasAccreditations: hasVerticalCredentialSignal(s),
    faqCount,
    descriptionWordCount: descWords,
  };

  return { score: Math.round(score), signals };
}
