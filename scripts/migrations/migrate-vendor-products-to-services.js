/**
 * Migrate VendorProduct → VendorService
 *
 * Reads every VendorProduct, resolves its parent Vendor, maps the
 * matching *Pricing sub-doc to the new *Data shape, validates the
 * candidate VendorService via the new model, and either writes it
 * (--live) or emits a CSV report (dry-run, default).
 *
 * The old vendor_products collection is never touched.
 *
 * Usage:
 *   node scripts/migrations/migrate-vendor-products-to-services.js
 *   node scripts/migrations/migrate-vendor-products-to-services.js --live
 *   node scripts/migrations/migrate-vendor-products-to-services.js --limit=50
 *
 * Output: scripts/migrations/output/{dry-run|live}-<timestamp>.csv
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Vendor from '../../models/Vendor.js';
import VendorProduct from '../../models/VendorProduct.js';
import VendorService, { VENDOR_TYPE_TO_DATA_FIELD } from '../../models/VendorService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config & CLI ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const LIMIT_ARG = args.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number.parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

const SKIP_VENDOR_TYPES = new Set([
  'office-equipment',
  'financial-advisor',
  'insurance-broker',
]);

const SUPPORTED_VENDOR_TYPES = new Set(Object.keys(VENDOR_TYPE_TO_DATA_FIELD));

// ─── Normalisation helpers ────────────────────────────────────────────

const SOLICITOR_PRACTICE_AREAS = [
  'Conveyancing', 'Family Law', 'Criminal Law', 'Commercial Law',
  'Employment Law', 'Wills & Probate', 'Immigration', 'Personal Injury',
];
function normalisePracticeArea(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  for (const canon of SOLICITOR_PRACTICE_AREAS) {
    if (s === canon.toLowerCase()) return canon;
  }
  if (s.includes('conveyanc')) return 'Conveyancing';
  if (s.includes('family') || s.includes('matrimon')) return 'Family Law';
  if (s.includes('criminal')) return 'Criminal Law';
  if (s.includes('commercial') && s.includes('law')) return 'Commercial Law';
  if (s.includes('employment')) return 'Employment Law';
  if (s.includes('will') || s.includes('probate')) return 'Wills & Probate';
  if (s.includes('immigration')) return 'Immigration';
  if (s.includes('personal injury') || s.includes('pi claim')) return 'Personal Injury';
  return null;
}

const TURNAROUND_BANDS = [
  'same-day', '1-2-days', '3-5-days', '1-2-weeks',
  '2-4-weeks', '4-8-weeks', '8-12-weeks', '12-plus',
];
function normaliseTurnaround(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (TURNAROUND_BANDS.includes(s)) return s;
  if (/same[- ]?day/.test(s)) return 'same-day';
  const mDays = s.match(/(\d+)\s*(?:-|to)\s*(\d+)?\s*day/);
  if (mDays) {
    const hi = Number.parseInt(mDays[2] || mDays[1], 10);
    if (hi <= 2) return '1-2-days';
    if (hi <= 5) return '3-5-days';
  } else {
    const mSingleDay = s.match(/(\d+)\s*day/);
    if (mSingleDay) {
      const d = Number.parseInt(mSingleDay[1], 10);
      if (d <= 2) return '1-2-days';
      if (d <= 5) return '3-5-days';
    }
  }
  const mWeeks = s.match(/(\d+)\s*(?:-|to)\s*(\d+)?\s*week/);
  if (mWeeks) {
    const hi = Number.parseInt(mWeeks[2] || mWeeks[1], 10);
    if (hi <= 2) return '1-2-weeks';
    if (hi <= 4) return '2-4-weeks';
    if (hi <= 8) return '4-8-weeks';
    if (hi <= 12) return '8-12-weeks';
    return '12-plus';
  } else {
    const mSingleWeek = s.match(/(\d+)\s*week/);
    if (mSingleWeek) {
      const w = Number.parseInt(mSingleWeek[1], 10);
      if (w <= 2) return '1-2-weeks';
      if (w <= 4) return '2-4-weeks';
      if (w <= 8) return '4-8-weeks';
      if (w <= 12) return '8-12-weeks';
      return '12-plus';
    }
  }
  if (/month/.test(s)) return '4-8-weeks';
  return null;
}

const ACCOUNTANT_CATEGORIES = [
  'Bookkeeping', 'Self-Assessment', 'Limited Company Accounts', 'VAT Returns',
  'Payroll', 'CIS', 'R&D Tax Credits', 'Management Accounts', 'Tax Advisory',
  'Audit',
];
function normaliseAccountantCategory(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  for (const canon of ACCOUNTANT_CATEGORIES) {
    if (s === canon.toLowerCase()) return canon;
  }
  if (s.includes('bookkeep')) return 'Bookkeeping';
  if (s.includes('self') && s.includes('assess')) return 'Self-Assessment';
  if (s.includes('self-assess')) return 'Self-Assessment';
  if (s.includes('annual account') || (s.includes('ltd') && s.includes('account'))
      || (s.includes('limited') && s.includes('account'))) return 'Limited Company Accounts';
  if (s.includes('vat')) return 'VAT Returns';
  if (s.includes('payroll')) return 'Payroll';
  if (s.startsWith('cis') || s.includes('construction industry')) return 'CIS';
  if (s.includes('r&d') || s.includes('research and development')) return 'R&D Tax Credits';
  if (s.includes('management account')) return 'Management Accounts';
  if (s.includes('tax advisory') || s.includes('tax planning') || s.includes('tax advice')) return 'Tax Advisory';
  if (s.includes('audit')) return 'Audit';
  return null;
}

const ACCOUNTANT_SOFTWARE = ['Xero', 'QuickBooks', 'Sage', 'FreeAgent'];
function normaliseSoftware(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  for (const canon of ACCOUNTANT_SOFTWARE) {
    if (s === canon.toLowerCase()) return canon;
  }
  if (s.includes('xero')) return 'Xero';
  if (s.includes('quickbook') || s === 'qb' || s === 'qbo') return 'QuickBooks';
  if (s.includes('sage')) return 'Sage';
  if (s.includes('freeagent') || s.includes('free agent')) return 'FreeAgent';
  return 'Other';
}

const MORTGAGE_TYPES = [
  'Residential', 'Buy-to-Let', 'First-Time Buyer', 'Remortgage',
  'Equity Release', 'Commercial', 'Bridging', 'Self-Employed', 'Adverse Credit',
];
function normaliseMortgageType(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  for (const canon of MORTGAGE_TYPES) {
    if (s === canon.toLowerCase()) return canon;
  }
  if (s.includes('buy') && s.includes('let')) return 'Buy-to-Let';
  if (s === 'btl') return 'Buy-to-Let';
  if (s.includes('first') && s.includes('time')) return 'First-Time Buyer';
  if (s === 'ftb') return 'First-Time Buyer';
  if (s.includes('remortgage')) return 'Remortgage';
  if (s.includes('equity') && s.includes('release')) return 'Equity Release';
  if (s.includes('commercial')) return 'Commercial';
  if (s.includes('bridging')) return 'Bridging';
  if (s.includes('self') && s.includes('employ')) return 'Self-Employed';
  if (s.includes('adverse') || s.includes('bad credit') || s.includes('sub-prime')) return 'Adverse Credit';
  if (s.includes('residential')) return 'Residential';
  return null;
}

function normaliseMortgageFeeType(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'free' || s === 'fee-free') return 'fee-free';
  if (s === 'fee-based' || s === 'fixed') return 'fixed';
  if (s === 'percentage') return 'percentage';
  if (s === 'combination') return 'combination';
  return null;
}

function normaliseAppointmentType(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  const allowed = ['in-person', 'phone', 'video', 'home-visit'];
  if (allowed.includes(s)) return s;
  if (s.includes('home')) return 'home-visit';
  if (s.includes('person')) return 'in-person';
  if (s.includes('video') || s.includes('zoom') || s.includes('teams')) return 'video';
  if (s.includes('phone') || s.includes('call')) return 'phone';
  return null; // 'hybrid' and anything else → drop + warn
}

const ESTATE_CATEGORIES = [
  'Sales', 'Lettings', 'Property Management', 'Block Management',
  'Valuations', 'Commercial', 'Auctions',
];
function normaliseEstateCategory(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  for (const canon of ESTATE_CATEGORIES) {
    if (s === canon.toLowerCase()) return canon;
  }
  if (s.includes('sale')) return 'Sales';
  if (s.includes('letting') || s.includes('rental')) return 'Lettings';
  if (s.includes('block')) return 'Block Management';
  if (s.includes('property') && s.includes('manage')) return 'Property Management';
  if (s.includes('valuation')) return 'Valuations';
  if (s.includes('commercial')) return 'Commercial';
  if (s.includes('auction')) return 'Auctions';
  return null;
}

const ESTATE_PROPERTY_TYPES = ['Residential', 'Commercial', 'New-Build', 'HMO', 'Student', 'Land'];
function normalisePropertyType(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  for (const canon of ESTATE_PROPERTY_TYPES) {
    if (s === canon.toLowerCase()) return canon;
  }
  if (s.includes('residential')) return 'Residential';
  if (s.includes('commercial')) return 'Commercial';
  if (s.includes('new') && s.includes('build')) return 'New-Build';
  if (s === 'hmo') return 'HMO';
  if (s.includes('student')) return 'Student';
  if (s.includes('land')) return 'Land';
  return null;
}

const PORTALS = ['Rightmove', 'Zoopla', 'OnTheMarket'];
function normalisePortal(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '');
  if (s.includes('rightmove')) return 'Rightmove';
  if (s.includes('zoopla')) return 'Zoopla';
  if (s.includes('onthemarket') || s.includes('otm')) return 'OnTheMarket';
  return null;
}

// ─── Mappers ──────────────────────────────────────────────────────────

function pickName(source, pricing) {
  return (pricing?.serviceName || '').trim()
      || [source.manufacturer, source.model].filter(Boolean).join(' ').trim()
      || null;
}

function mapSolicitor(product, vendor) {
  const pricing = product.solicitorPricing || {};
  const warnings = [];
  const data = {};

  const practiceArea = normalisePracticeArea(pricing.practiceArea);
  if (pricing.practiceArea && !practiceArea) {
    warnings.push(`practiceArea '${pricing.practiceArea}' does not match new enum — dropped`);
  } else if (practiceArea) {
    data.practiceArea = practiceArea;
  }

  if (pricing.feeType) data.feeType = pricing.feeType;
  if (typeof pricing.feeAmount === 'number') data.feeAmountGBP = pricing.feeAmount;

  const turnaround = normaliseTurnaround(pricing.turnaroundTime);
  if (pricing.turnaroundTime && !turnaround) {
    warnings.push(`turnaroundTime '${pricing.turnaroundTime}' does not match new enum — dropped`);
  } else if (turnaround) {
    data.turnaround = turnaround;
  }

  if (Array.isArray(pricing.whatsIncluded) && pricing.whatsIncluded.length) {
    data.whatsIncluded = pricing.whatsIncluded.filter(Boolean).map((s) => String(s).trim());
  }

  if (pricing.keyTeamMember && (pricing.keyTeamMember.name || pricing.keyTeamMember.role)) {
    warnings.push('keyTeamMember has no destination in solicitorData — dropped');
  }

  const name = pickName(product, pricing);
  const doc = {
    vendorId: product.vendorId,
    vendorType: vendor.vendorType,
    name,
    description: product.description || undefined,
    active: product.status !== 'inactive' && product.status !== 'draft',
    solicitorData: Object.keys(data).length ? data : undefined,
  };
  return { doc, warnings };
}

function mapAccountant(product, vendor) {
  const pricing = product.accountantPricing || {};
  const warnings = [];
  const data = {};

  const category = normaliseAccountantCategory(pricing.serviceCategory);
  if (pricing.serviceCategory && !category) {
    warnings.push(`accountant serviceCategory '${pricing.serviceCategory}' does not match new enum — dropped`);
  } else if (category) {
    data.serviceCategory = category;
  }

  if (pricing.feeType === 'per-transaction') {
    warnings.push("feeType 'per-transaction' has no destination in accountantData — dropped");
  } else if (pricing.feeType) {
    data.feeType = pricing.feeType;
  }
  if (typeof pricing.feeAmount === 'number') data.feeAmountGBP = pricing.feeAmount;

  if (Array.isArray(pricing.softwareUsed) && pricing.softwareUsed.length) {
    const mapped = new Set();
    for (const s of pricing.softwareUsed) {
      const n = normaliseSoftware(s);
      if (n) mapped.add(n);
    }
    if (mapped.size) data.softwareSupported = Array.from(mapped);
  }

  if (Array.isArray(pricing.whatsIncluded) && pricing.whatsIncluded.length) {
    warnings.push('accountant whatsIncluded has no destination in accountantData — dropped');
  }
  if (pricing.keyTeamMember && (pricing.keyTeamMember.name || pricing.keyTeamMember.role)) {
    warnings.push('keyTeamMember has no destination in accountantData — dropped');
  }

  // Fold vendor-level signals that match the new sub-doc shape.
  if (typeof vendor.mtdCompliant === 'boolean' && vendor.mtdCompliant) data.mtdCompliant = true;
  if (Array.isArray(vendor.industrySpecialisms) && vendor.industrySpecialisms.length) {
    data.industrySpecialisms = vendor.industrySpecialisms.filter(Boolean).slice();
  }

  const name = pickName(product, pricing);
  const doc = {
    vendorId: product.vendorId,
    vendorType: vendor.vendorType,
    name,
    description: product.description || undefined,
    active: product.status !== 'inactive' && product.status !== 'draft',
    accountantData: Object.keys(data).length ? data : undefined,
  };
  return { doc, warnings };
}

function mapMortgageAdvisor(product, vendor) {
  const pricing = product.mortgageAdvisorPricing || {};
  const warnings = [];
  const data = {};

  const mortgageType = normaliseMortgageType(pricing.serviceCategory);
  if (pricing.serviceCategory && !mortgageType) {
    warnings.push(`mortgage serviceCategory '${pricing.serviceCategory}' does not match mortgageType enum — dropped`);
  } else if (mortgageType) {
    data.mortgageType = mortgageType;
  }

  const feeType = normaliseMortgageFeeType(pricing.feeType);
  if (pricing.feeType && !feeType) {
    warnings.push(`mortgage feeType '${pricing.feeType}' does not match new enum — dropped`);
  } else if (feeType) {
    data.feeType = feeType;
  }

  if (typeof pricing.feeAmount === 'number' && pricing.feeAmount > 0) {
    if (feeType === 'percentage' && pricing.feeAmount <= 10) {
      data.feePercentage = pricing.feeAmount;
    } else {
      data.feeAmountGBP = pricing.feeAmount;
    }
  }

  if (typeof pricing.lenderPanel === 'boolean' && pricing.lenderPanel) {
    warnings.push('lenderPanel (Boolean) has no equivalent in mortgageAdvisorData — dropped (wholeOfMarket pulled from Vendor instead)');
  }

  const appt = normaliseAppointmentType(pricing.appointmentType);
  if (pricing.appointmentType && !appt) {
    warnings.push(`appointmentType '${pricing.appointmentType}' does not match new enum — dropped`);
  } else if (appt) {
    data.appointmentTypes = [appt];
  }

  // Vendor-level mortgage signals
  if (typeof vendor.wholeOfMarket === 'boolean') data.wholeOfMarket = vendor.wholeOfMarket;
  if (typeof vendor.numberOfLenders === 'number' && vendor.numberOfLenders > 0) {
    data.lenderPanelSize = vendor.numberOfLenders;
  }

  const name = pickName(product, pricing);
  const doc = {
    vendorId: product.vendorId,
    vendorType: vendor.vendorType,
    name,
    description: product.description || pricing.description || undefined,
    active: product.status !== 'inactive' && product.status !== 'draft',
    mortgageAdvisorData: Object.keys(data).length ? data : undefined,
  };
  return { doc, warnings };
}

function mapEstateAgent(product, vendor) {
  const pricing = product.estateAgentPricing || {};
  const warnings = [];
  const data = {};

  const category = normaliseEstateCategory(pricing.serviceCategory);
  if (pricing.serviceCategory && !category) {
    warnings.push(`estate serviceCategory '${pricing.serviceCategory}' does not match new enum — dropped`);
  } else if (category) {
    data.serviceCategory = category;
  }

  if (pricing.feeType) data.feeType = pricing.feeType;
  if (typeof pricing.feePercentage === 'number') data.feePercentage = pricing.feePercentage;
  if (typeof pricing.feeAmount === 'number') data.feeAmountGBP = pricing.feeAmount;

  if (Array.isArray(pricing.propertyTypes) && pricing.propertyTypes.length) {
    const mapped = [];
    for (const t of pricing.propertyTypes) {
      const n = normalisePropertyType(t);
      if (n) mapped.push(n);
      else warnings.push(`propertyType '${t}' does not match new enum — dropped`);
    }
    if (mapped.length) data.propertyTypes = Array.from(new Set(mapped));
  }

  if (Array.isArray(pricing.coveragePostcodes) && pricing.coveragePostcodes.length) {
    data.coveragePostcodes = pricing.coveragePostcodes.filter(Boolean).map((s) => String(s).trim().toUpperCase());
  }

  if (Array.isArray(pricing.portalListings) && pricing.portalListings.length) {
    const mapped = [];
    for (const p of pricing.portalListings) {
      const n = normalisePortal(p);
      if (n) mapped.push(n);
      else warnings.push(`portal '${p}' does not match new enum — dropped`);
    }
    if (mapped.length) data.portals = Array.from(new Set(mapped));
  }

  const name = pickName(product, pricing);
  const doc = {
    vendorId: product.vendorId,
    vendorType: vendor.vendorType,
    name,
    description: product.description || pricing.description || undefined,
    active: product.status !== 'inactive' && product.status !== 'draft',
    estateAgentData: Object.keys(data).length ? data : undefined,
  };
  return { doc, warnings };
}

const MAPPERS = {
  'solicitor': mapSolicitor,
  'accountant': mapAccountant,
  'mortgage-advisor': mapMortgageAdvisor,
  'estate-agent': mapEstateAgent,
};

// ─── CSV writer ───────────────────────────────────────────────────────

const CSV_COLUMNS = [
  'productId', 'vendorId', 'vendorCompany', 'parentVendorType',
  'sourceServiceCategory', 'sourceServiceName', 'targetName', 'targetVendorType',
  'outcome', 'reason', 'dataLossWarnings',
];

function csvEscape(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(rows, outPath) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvEscape(r[c])).join(','));
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('✗ MONGODB_URI missing from env. Aborting.');
    process.exit(1);
  }

  const modeLabel = LIVE ? 'LIVE' : 'DRY-RUN';
  console.log(`\n=== VendorProduct → VendorService migration (${modeLabel}) ===`);
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT} product(s)`);
  console.log('');

  await mongoose.connect(MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // Build a vendor map keyed by string _id. Read only the fields we need.
  const vendors = await Vendor.find({}, {
    vendorType: 1, company: 1, mtdCompliant: 1, industrySpecialisms: 1,
    wholeOfMarket: 1, numberOfLenders: 1,
  }).lean();
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));
  console.log(`Vendors loaded: ${vendorMap.size}`);

  // Read all products (or up to LIMIT).
  const query = VendorProduct.find({});
  if (LIMIT !== Infinity) query.limit(LIMIT);
  const products = await query.lean();
  console.log(`Products loaded: ${products.length}\n`);

  const rows = [];
  const summary = {
    scanned: 0,
    migrated: 0,
    skippedByVendorType: 0,
    skippedOrphan: 0,
    skippedDuplicate: 0,
    skippedUnknownType: 0,
    skippedInconsistent: 0,
    skippedValidation: 0,
    dataLossWarnings: 0,
  };

  for (const product of products) {
    summary.scanned += 1;
    const vendor = product.vendorId ? vendorMap.get(String(product.vendorId)) : null;
    const sourceServiceCategory = product.serviceCategory || '';

    const baseRow = {
      productId: String(product._id),
      vendorId: product.vendorId ? String(product.vendorId) : '',
      vendorCompany: vendor?.company || '',
      parentVendorType: vendor?.vendorType || '',
      sourceServiceCategory,
      sourceServiceName: '',
      targetName: '',
      targetVendorType: '',
      outcome: '',
      reason: '',
      dataLossWarnings: '',
    };

    // Orphan?
    if (!vendor) {
      rows.push({ ...baseRow, outcome: 'skipped-orphan', reason: 'parent vendor not found' });
      summary.skippedOrphan += 1;
      continue;
    }

    // Parent vendorType in skip list?
    if (SKIP_VENDOR_TYPES.has(vendor.vendorType)) {
      rows.push({
        ...baseRow,
        outcome: 'skipped-vendor-type',
        reason: `parent vendorType '${vendor.vendorType}' is out of scope for VendorService`,
      });
      summary.skippedByVendorType += 1;
      continue;
    }

    // Parent vendorType unknown or unsupported?
    if (!SUPPORTED_VENDOR_TYPES.has(vendor.vendorType)) {
      rows.push({
        ...baseRow,
        outcome: 'skipped-unknown-type',
        reason: `parent vendorType '${vendor.vendorType || '(empty)'}' has no mapper`,
      });
      summary.skippedUnknownType += 1;
      continue;
    }

    const mapper = MAPPERS[vendor.vendorType];
    const { doc, warnings } = mapper(product, vendor);

    // Capture source service name (pre-mapping) for the CSV column.
    const srcPricing = product[`${vendor.vendorType.replace('-advisor', 'Advisor').replace('-agent', 'Agent')}Pricing`]
      || product.solicitorPricing || product.accountantPricing
      || product.mortgageAdvisorPricing || product.estateAgentPricing
      || {};
    baseRow.sourceServiceName = srcPricing?.serviceName || '';

    // If the product also carries legacy office-equipment category under
    // a professional vendor, flag inconsistency (still proceed with mapping).
    if (['Photocopiers', 'Telecoms', 'CCTV', 'IT'].includes(sourceServiceCategory)) {
      warnings.push(`source serviceCategory '${sourceServiceCategory}' is office-equipment under a ${vendor.vendorType} vendor — parent type used for mapping`);
    }

    baseRow.targetName = doc.name || '';
    baseRow.targetVendorType = doc.vendorType;

    if (!doc.name) {
      rows.push({
        ...baseRow,
        outcome: 'skipped-inconsistent',
        reason: 'no name derivable from serviceName/manufacturer/model',
        dataLossWarnings: warnings.join('; '),
      });
      summary.skippedInconsistent += 1;
      if (warnings.length) summary.dataLossWarnings += 1;
      continue;
    }

    // Validate against new model (runs the pre-validate hook).
    try {
      const candidate = new VendorService(doc);
      await candidate.validate();
    } catch (e) {
      rows.push({
        ...baseRow,
        outcome: 'skipped-validation',
        reason: (e.message || 'validation failed').split('\n')[0],
        dataLossWarnings: warnings.join('; '),
      });
      summary.skippedValidation += 1;
      if (warnings.length) summary.dataLossWarnings += 1;
      continue;
    }

    // Duplicate? (vendorId + vendorType + name).
    const existing = await VendorService.findOne({
      vendorId: doc.vendorId, vendorType: doc.vendorType, name: doc.name,
    }).lean();
    if (existing) {
      rows.push({
        ...baseRow,
        outcome: 'skipped-duplicate',
        reason: `VendorService already exists (id ${existing._id})`,
        dataLossWarnings: warnings.join('; '),
      });
      summary.skippedDuplicate += 1;
      if (warnings.length) summary.dataLossWarnings += 1;
      continue;
    }

    // Write in live mode.
    if (LIVE) {
      try {
        await VendorService.create(doc);
      } catch (e) {
        rows.push({
          ...baseRow,
          outcome: 'skipped-validation',
          reason: `live insert failed: ${(e.message || '').split('\n')[0]}`,
          dataLossWarnings: warnings.join('; '),
        });
        summary.skippedValidation += 1;
        if (warnings.length) summary.dataLossWarnings += 1;
        continue;
      }
    }

    rows.push({
      ...baseRow,
      outcome: 'migrated',
      reason: LIVE ? 'written to vendor_services' : 'would be written (dry-run)',
      dataLossWarnings: warnings.join('; '),
    });
    summary.migrated += 1;
    if (warnings.length) summary.dataLossWarnings += 1;
  }

  // Write CSV.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${LIVE ? 'live' : 'dry-run'}-${timestamp}.csv`);
  writeCsv(rows, outFile);

  // Print summary.
  console.log('─── Summary ─────────────────────────────────────────────');
  console.log(`Total scanned            : ${summary.scanned}`);
  console.log(`Migrated                 : ${summary.migrated}${LIVE ? '' : ' (would migrate)'}`);
  console.log(`Skipped — vendorType     : ${summary.skippedByVendorType}`);
  console.log(`Skipped — orphan         : ${summary.skippedOrphan}`);
  console.log(`Skipped — duplicate      : ${summary.skippedDuplicate}`);
  console.log(`Skipped — unknown type   : ${summary.skippedUnknownType}`);
  console.log(`Skipped — inconsistent   : ${summary.skippedInconsistent}`);
  console.log(`Skipped — validation     : ${summary.skippedValidation}`);
  console.log(`Records w/ data-loss warn: ${summary.dataLossWarnings}`);
  console.log('─────────────────────────────────────────────────────────');
  console.log(`Output: ${outFile}`);
  console.log(`Mode  : ${modeLabel}`);

  await mongoose.disconnect();
}

// Only run `main` when this file is the entry point, not when imported
// for testing.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => {
    console.error('✗ Migration failed:', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
}

export {
  mapSolicitor, mapAccountant, mapMortgageAdvisor, mapEstateAgent,
  normalisePracticeArea, normaliseTurnaround, normaliseAccountantCategory,
  normaliseSoftware, normaliseMortgageType, normaliseMortgageFeeType,
  normaliseAppointmentType, normaliseEstateCategory, normalisePropertyType,
  normalisePortal,
};
