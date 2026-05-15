import Vendor from '../../models/Vendor.js';
import FirmFacts from '../../models/FirmFacts.js';
import { isFilled as isFirmFactFilled } from '../../models/FirmFacts.js';

function cleanUrl(value) {
  if (typeof value !== 'string') return value;
  const markdownLinkMatch = value.match(/^\[.*?\]\((.*?)\)$/);
  if (markdownLinkMatch) return markdownLinkMatch[1];
  return value;
}

/**
 * Extract all filled values from a FirmFacts group object.
 * Returns a flat object of { fieldName: value } for fields where
 * the { value, filledAt, source } wrapper has a non-empty value.
 */
function extractFilledFields(group) {
  if (!group || typeof group !== 'object') return {};
  const result = {};
  for (const [key, wrapper] of Object.entries(group)) {
    if (key === '_id') continue;
    if (wrapper && typeof wrapper === 'object' && 'value' in wrapper && isFirmFactFilled(wrapper)) {
      result[key] = wrapper.value;
    }
  }
  return result;
}

/**
 * Build a firmContext object for the Writer Agent system prompt.
 * Returns only verified facts from the database. Empty strings,
 * empty arrays, and null values are excluded so the agent treats
 * them as "unknown — use [FIRM TO PROVIDE: ...]".
 *
 * @param {string} vendorId - MongoDB ObjectId of the Vendor
 * @returns {Promise<object>} firmContext object ready for prompt injection
 */
export async function getFirmContext(vendorId) {
  const [vendor, firmFacts] = await Promise.all([
    Vendor.findById(vendorId).lean(),
    FirmFacts.findOne({ vendorId }).lean().catch(() => null),
  ]);
  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found`);
  }

  const schemaTypeMap = {
    'solicitor': 'LegalService',
    'accountant': 'AccountingService',
    'mortgage-advisor': 'FinancialService',
    'financial-advisor': 'FinancialService',
    'insurance-broker': 'FinancialService',
    'estate-agent': 'RealEstateAgent',
    'office-equipment': 'LocalBusiness',
  };

  const regulatorMap = {
    'solicitor': 'SRA (Solicitors Regulation Authority)',
    'accountant': 'ICAEW or ACCA',
    'mortgage-advisor': 'FCA (Financial Conduct Authority)',
    'financial-advisor': 'FCA (Financial Conduct Authority)',
    'insurance-broker': 'FCA (Financial Conduct Authority)',
    'estate-agent': 'Propertymark / The Property Ombudsman',
    'office-equipment': null,
  };

  const present = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  };

  const ctx = {
    company: vendor.company,
    slug: vendor.slug || null,
    vendorType: vendor.vendorType,
    schemaType: schemaTypeMap[vendor.vendorType] || 'LocalBusiness',
    regulator: regulatorMap[vendor.vendorType] || null,
  };

  const regNumbers = {};
  if (present(vendor.sraNumber)) regNumbers.sra = vendor.sraNumber;
  if (present(vendor.icaewFirmNumber)) regNumbers.icaew = vendor.icaewFirmNumber;
  if (present(vendor.accaNumber)) regNumbers.acca = vendor.accaNumber;
  if (present(vendor.fcaNumber)) regNumbers.fca = vendor.fcaNumber;
  if (present(vendor.propertymarkNumber)) regNumbers.propertymark = vendor.propertymarkNumber;
  if (Object.keys(regNumbers).length > 0) ctx.regulatoryNumbers = regNumbers;

  if (present(vendor.companyNumber)) ctx.companyNumber = vendor.companyNumber;

  const loc = vendor.location || {};
  const locationFacts = {};
  if (present(loc.city)) locationFacts.city = loc.city;
  if (present(loc.region)) locationFacts.region = loc.region;
  if (present(loc.address)) locationFacts.address = loc.address;
  if (present(loc.postcode)) locationFacts.postcode = loc.postcode;
  if (present(loc.coverage)) locationFacts.serviceArea = loc.coverage;
  if (Object.keys(locationFacts).length > 0) ctx.location = locationFacts;

  const contact = vendor.contactInfo || {};
  const contactFacts = {};
  if (present(contact.phone)) contactFacts.phone = contact.phone;
  if (present(contact.website)) contactFacts.website = cleanUrl(contact.website);
  if (Object.keys(contactFacts).length > 0) ctx.contact = contactFacts;

  const bp = vendor.businessProfile || {};
  const bizFacts = {};
  if (present(bp.yearsInBusiness) && bp.yearsInBusiness > 0) {
    bizFacts.yearsInBusiness = bp.yearsInBusiness;
  }
  if (present(bp.description)) bizFacts.description = bp.description;
  if (present(bp.specializations)) bizFacts.specializations = bp.specializations;
  if (present(bp.certifications)) bizFacts.certifications = bp.certifications;
  if (present(bp.accreditations)) bizFacts.accreditations = bp.accreditations;
  if (Object.keys(bizFacts).length > 0) ctx.businessProfile = bizFacts;

  if (present(vendor.practiceAreas)) ctx.practiceAreas = vendor.practiceAreas;
  if (present(vendor.industrySpecialisms)) ctx.industrySpecialisms = vendor.industrySpecialisms;
  if (present(vendor.languages)) ctx.languages = vendor.languages;

  if (present(vendor.services)) ctx.services = vendor.services;

  if (vendor.vendorType === 'solicitor') {
    const solicitorFacts = {};
    if (present(vendor.legalAid)) solicitorFacts.legalAid = vendor.legalAid;
    if (present(vendor.noWinNoFee)) solicitorFacts.noWinNoFee = vendor.noWinNoFee;
    if (present(vendor.courtCoverageAreas)) solicitorFacts.courtCoverageAreas = vendor.courtCoverageAreas;
    if (present(vendor.individualSolicitors)) solicitorFacts.namedSolicitors = vendor.individualSolicitors;
    if (Object.keys(solicitorFacts).length > 0) ctx.solicitorFacts = solicitorFacts;
  }

  if (vendor.vendorType === 'accountant') {
    const accountantFacts = {};
    if (present(vendor.mtdCompliant)) accountantFacts.mtdCompliant = vendor.mtdCompliant;
    if (present(vendor.rdTaxCreditsSpecialist)) accountantFacts.rdTaxCreditsSpecialist = vendor.rdTaxCreditsSpecialist;
    if (present(vendor.softwareUsed)) accountantFacts.softwareUsed = vendor.softwareUsed;
    if (present(vendor.minimumFeeThreshold)) accountantFacts.minimumFeeThreshold = vendor.minimumFeeThreshold;
    if (present(vendor.practiceCertificateNumber)) accountantFacts.practiceCertificateNumber = vendor.practiceCertificateNumber;
    if (Object.keys(accountantFacts).length > 0) ctx.accountantFacts = accountantFacts;
  }

  if (vendor.vendorType === 'mortgage-advisor') {
    const mortgageFacts = {};
    if (present(vendor.wholeOfMarket)) mortgageFacts.wholeOfMarket = vendor.wholeOfMarket;
    if (present(vendor.numberOfLenders)) mortgageFacts.numberOfLenders = vendor.numberOfLenders;
    if (present(vendor.lenderPanels)) mortgageFacts.lenderPanels = vendor.lenderPanels;
    if (present(vendor.typicalCompletionTime)) mortgageFacts.typicalCompletionTime = vendor.typicalCompletionTime;
    if (present(vendor.feeModel)) mortgageFacts.feeModel = vendor.feeModel;
    if (present(vendor.maximumLoanSize)) mortgageFacts.maximumLoanSize = vendor.maximumLoanSize;
    if (Object.keys(mortgageFacts).length > 0) ctx.mortgageAdviserFacts = mortgageFacts;
  }

  if (vendor.vendorType === 'estate-agent') {
    const estateAgentFacts = {};
    if (present(vendor.averageSaleTime)) estateAgentFacts.averageSaleTime = vendor.averageSaleTime;
    if (present(vendor.achievedVsAskingPercent)) estateAgentFacts.achievedVsAskingPercent = vendor.achievedVsAskingPercent;
    if (present(vendor.managementFeePercent)) estateAgentFacts.managementFeePercent = vendor.managementFeePercent;
    if (present(vendor.tenantFindOrFullManagement)) estateAgentFacts.tenantFindOrFullManagement = vendor.tenantFindOrFullManagement;
    if (present(vendor.epcAssessor)) estateAgentFacts.epcAssessor = vendor.epcAssessor;
    if (present(vendor.propertyTypesHandled)) estateAgentFacts.propertyTypesHandled = vendor.propertyTypesHandled;
    if (Object.keys(estateAgentFacts).length > 0) ctx.estateAgentFacts = estateAgentFacts;
  }

  if (present(vendor.fixedFees)) {
    ctx.publishedFees = vendor.fixedFees.filter(f =>
      present(f.service) && present(f.fee)
    );
    if (ctx.publishedFees.length === 0) delete ctx.publishedFees;
  }

  if (present(vendor.feeStructureType)) ctx.feeStructureType = vendor.feeStructureType;
  if (present(vendor.responseTime)) ctx.responseTime = vendor.responseTime;

  const trust = {};
  if (present(vendor.performance?.rating) && vendor.performance.rating > 0) {
    trust.rating = vendor.performance.rating;
  }
  if (present(vendor.performance?.reviewCount) && vendor.performance.reviewCount > 0) {
    trust.reviewCount = vendor.performance.reviewCount;
  }
  if (Object.keys(trust).length > 0) ctx.trustSignals = trust;

  if (present(vendor.brands)) ctx.brands = vendor.brands;

  // ─── Merge FirmFacts data (if available) ──────────────────────
  if (firmFacts) {
    ctx.firmFactsCompleteness = firmFacts.completionPercentage || 0;

    const firmFactsData = {};
    const groups = ['identity', 'stage1', 'stage2', 'costs', 'process', 'authority', 'mistakes', 'rights', 'expertise'];
    for (const groupName of groups) {
      const filled = extractFilledFields(firmFacts[groupName]);
      Object.assign(firmFactsData, filled);
    }

    // FirmFacts values override Vendor-derived values where both exist
    if (present(firmFactsData.firmName)) ctx.company = firmFactsData.firmName;
    if (present(firmFactsData.city)) {
      if (!ctx.location) ctx.location = {};
      ctx.location.city = firmFactsData.city;
    }
    if (present(firmFactsData.yearEstablished)) {
      if (!ctx.businessProfile) ctx.businessProfile = {};
      ctx.businessProfile.yearsInBusiness = new Date().getFullYear() - firmFactsData.yearEstablished;
    }
    if (present(firmFactsData.regulatoryNumber)) {
      if (!ctx.regulatoryNumbers) ctx.regulatoryNumbers = {};
      const vt = vendor.vendorType;
      if (vt === 'solicitor') ctx.regulatoryNumbers.sra = firmFactsData.regulatoryNumber;
      else if (vt === 'accountant') ctx.regulatoryNumbers.icaew = firmFactsData.regulatoryNumber;
      else if (vt === 'mortgage-advisor') ctx.regulatoryNumbers.fca = firmFactsData.regulatoryNumber;
      else if (vt === 'estate-agent') ctx.regulatoryNumbers.propertymark = firmFactsData.regulatoryNumber;
    }

    // Attach all remaining firmFacts fields as a flat block for Claude
    const excludeKeys = new Set(['firmName', 'city', 'vendorType', 'primarySpecialism', 'yearEstablished', 'regulatoryNumber']);
    const additionalFacts = {};
    for (const [k, v] of Object.entries(firmFactsData)) {
      if (!excludeKeys.has(k) && present(v)) {
        additionalFacts[k] = v;
      }
    }
    if (Object.keys(additionalFacts).length > 0) {
      ctx.firmFacts = additionalFacts;
    }
  } else {
    ctx.firmFactsCompleteness = 0;
  }

  return ctx;
}

/**
 * Render a firmContext object as a string block for system prompt injection.
 * Used inside the Writer Agent prompt.
 *
 * @param {object} firmContext - output of getFirmContext()
 * @returns {string} formatted block ready to embed in the prompt
 */
export function renderFirmContextBlock(firmContext) {
  const completeness = firmContext.firmFactsCompleteness ?? 0;
  const guidance = completeness >= 80
    ? 'This firm has filled in most of its data. Prefer the verified numbers in firm_context. Only use [FIRM TO PROVIDE: ...] markers for facts not present in this block.'
    : completeness >= 40
      ? 'This firm has filled in some of its data. Use verified numbers where present in firm_context. Use [FIRM TO PROVIDE: ...] markers liberally for the rest.'
      : 'This firm has filled in very little of its data. Use [FIRM TO PROVIDE: ...] markers throughout. Only use the basic identity fields (company, city, specialism, vendorType) without markers.';

  return `<firm_context>
The following facts are verified from this firm's record in the TendorAI database.

${JSON.stringify(firmContext, null, 2)}

<data_completeness>${completeness}% of firm data fields are filled. ${guidance}</data_completeness>
</firm_context>`;
}
