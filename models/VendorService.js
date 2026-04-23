import mongoose from 'mongoose';
import {
  generateServiceSchema,
  calculateCompletenessScore,
} from '../services/serviceSchemaGenerator.js';

const { Schema } = mongoose;

// ---- Reusable sub-document schemas --------------------------------------

const faqSchema = new Schema({
  question: { type: String, required: true, trim: true },
  answer: { type: String, required: true, trim: true },
}, { _id: false });

const solicitorDataSchema = new Schema({
  practiceArea: {
    type: String,
    enum: [
      'Conveyancing', 'Family Law', 'Criminal Law', 'Commercial Law',
      'Employment Law', 'Wills & Probate', 'Immigration', 'Personal Injury',
    ],
  },
  feeType: { type: String, enum: ['fixed', 'hourly', 'from'] },
  feeAmountGBP: { type: Number, min: 0 },
  turnaround: {
    type: String,
    enum: [
      'same-day', '1-2-days', '3-5-days', '1-2-weeks',
      '2-4-weeks', '4-8-weeks', '8-12-weeks', '12-plus',
    ],
  },
  whatsIncluded: [{ type: String, trim: true }],
  // Free-text so firms can list any panel / accreditation name
  // (CQS, Lexcel, Family Law Panel, etc.).
  accreditations: [{ type: String, trim: true }],
  jurisdictions: [{
    type: String,
    enum: ['England-Wales', 'Scotland', 'NI'],
  }],
  legalAidAvailable: { type: Boolean, default: false },
}, { _id: false });

const accountantDataSchema = new Schema({
  serviceCategory: {
    type: String,
    enum: [
      'Bookkeeping', 'Self-Assessment', 'Limited Company Accounts',
      'VAT Returns', 'Payroll', 'CIS', 'R&D Tax Credits',
      'Management Accounts', 'Tax Advisory', 'Audit',
    ],
  },
  feeType: { type: String, enum: ['fixed', 'hourly', 'monthly-retainer', 'from'] },
  feeAmountGBP: { type: Number, min: 0 },
  clientTypes: [{
    type: String,
    enum: ['Sole Trader', 'Limited Company', 'Partnership', 'LLP', 'Charity'],
  }],
  industrySpecialisms: [{ type: String, trim: true }],
  softwareSupported: [{
    type: String,
    enum: ['Xero', 'QuickBooks', 'Sage', 'FreeAgent', 'Other'],
  }],
  softwarePartnerStatus: {
    type: String,
    enum: ['Platinum', 'Gold', 'Silver', 'Partner', 'None'],
  },
  mtdCompliant: { type: Boolean, default: false },
  freeConsultation: { type: Boolean, default: false },
}, { _id: false });

const mortgageAdvisorDataSchema = new Schema({
  mortgageType: {
    type: String,
    enum: [
      'Residential', 'Buy-to-Let', 'First-Time Buyer', 'Remortgage',
      'Equity Release', 'Commercial', 'Bridging', 'Self-Employed',
      'Adverse Credit',
    ],
  },
  feeType: { type: String, enum: ['fee-free', 'fixed', 'percentage', 'combination'] },
  feeAmountGBP: { type: Number, min: 0 },
  feePercentage: { type: Number, min: 0, max: 100 },
  wholeOfMarket: { type: Boolean, default: false },
  lenderPanelSize: { type: Number, min: 0 },
  network: { type: String, trim: true },
  protectionOffered: [{
    type: String,
    enum: ['Life', 'Critical Illness', 'Income Protection', 'Building & Contents'],
  }],
  appointmentTypes: [{
    type: String,
    enum: ['in-person', 'phone', 'video', 'home-visit'],
  }],
}, { _id: false });

const estateAgentDataSchema = new Schema({
  serviceCategory: {
    type: String,
    enum: [
      'Sales', 'Lettings', 'Property Management', 'Block Management',
      'Valuations', 'Commercial', 'Auctions',
    ],
  },
  feeType: { type: String, enum: ['percentage', 'fixed', 'hybrid'] },
  feePercentage: { type: Number, min: 0, max: 100 },
  feeAmountGBP: { type: Number, min: 0 },
  tieInPeriodWeeks: { type: Number, min: 0 },
  propertyTypes: [{
    type: String,
    enum: ['Residential', 'Commercial', 'New-Build', 'HMO', 'Student', 'Land'],
  }],
  coveragePostcodes: [{ type: String, trim: true, uppercase: true }],
  portals: [{
    type: String,
    enum: ['Rightmove', 'Zoopla', 'OnTheMarket'],
  }],
  redressScheme: { type: String, enum: ['TPO', 'PRS'] },
  clientMoneyProtection: { type: Boolean, default: false },
}, { _id: false });

const aeoSignalsSchema = new Schema({
  hasDescription: { type: Boolean, default: false },
  hasFeeDetail: { type: Boolean, default: false },
  hasFaqs: { type: Boolean, default: false },
  hasAccreditations: { type: Boolean, default: false },
  faqCount: { type: Number, default: 0 },
  descriptionWordCount: { type: Number, default: 0 },
}, { _id: false });

// ---- vendorType → sub-doc field map -------------------------------------

const VENDOR_TYPE_TO_DATA_FIELD = Object.freeze({
  'solicitor': 'solicitorData',
  'accountant': 'accountantData',
  'mortgage-advisor': 'mortgageAdvisorData',
  'estate-agent': 'estateAgentData',
});
const ALL_DATA_FIELDS = Object.freeze(Object.values(VENDOR_TYPE_TO_DATA_FIELD));

// Treat a sub-doc as "populated" only if it carries real content.
// Empty arrays, empty strings, and default `false` booleans do not count,
// so sub-docs created implicitly from defaults don't trip the mismatch check.
function hasAnyValue(subdoc) {
  if (subdoc === undefined || subdoc === null) return false;
  const obj = typeof subdoc.toObject === 'function' ? subdoc.toObject() : subdoc;
  return Object.entries(obj).some(([k, v]) => {
    if (k === '_id' || k === '__v') return false;
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'boolean') return v === true;
    if (typeof v === 'number') return true;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  });
}

// ---- Main schema --------------------------------------------------------

const vendorServiceSchema = new Schema({
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  vendorType: {
    type: String,
    required: true,
    enum: ['solicitor', 'accountant', 'mortgage-advisor', 'estate-agent'],
    index: true,
  },

  name: { type: String, required: true, trim: true },

  // Length is an AEO-quality signal, not a hard rule — scored in aeoSignals
  // (Commit 3), never rejected at save time. Vendors must be able to draft.
  description: { type: String, trim: true },

  active: { type: Boolean, default: true, index: true },

  // Vertical-specific sub-documents. `default: undefined` keeps unset
  // sub-docs absent rather than auto-instantiated, so the mismatch
  // validator only fires on truly populated wrong-type data.
  solicitorData:       { type: solicitorDataSchema,       default: undefined },
  accountantData:      { type: accountantDataSchema,      default: undefined },
  mortgageAdvisorData: { type: mortgageAdvisorDataSchema, default: undefined },
  estateAgentData:     { type: estateAgentDataSchema,     default: undefined },

  faqs: { type: [faqSchema], default: [] },

  // Schema cache — fields defined here; population arrives in Commit 3
  // (services/serviceSchemaGenerator.js + pre-save hook).
  schemaJsonLd: { type: Schema.Types.Mixed, default: null },
  schemaCompletenessScore: { type: Number, min: 0, max: 100, default: 0 },
  aeoSignals: { type: aeoSignalsSchema, default: undefined },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ---- Validation: reject sub-doc that doesn't match vendorType -----------

vendorServiceSchema.pre('validate', function (next) {
  // Absent vendorType → let Mongoose's native required/enum validator fire
  // with the cleaner message instead of our "Unsupported vendorType" one.
  if (!this.vendorType) return next();
  const expectedField = VENDOR_TYPE_TO_DATA_FIELD[this.vendorType];
  if (!expectedField) {
    return next(new Error(`Unsupported vendorType '${this.vendorType}'.`));
  }
  for (const field of ALL_DATA_FIELDS) {
    if (field === expectedField) continue;
    if (hasAnyValue(this[field])) {
      return next(new Error(
        `vendorType '${this.vendorType}' cannot include '${field}'; only '${expectedField}' is allowed.`
      ));
    }
  }
  next();
});

// ---- Pre-save: completeness scoring + schema cache ----------------------
//
// Scoring is cheap and always runs. Schema generation fetches the parent
// Vendor (once, lean) unless the caller attached `doc._vendor` beforehand.
// Either step swallowing an error must not block the save.

vendorServiceSchema.pre('save', async function (next) {
  try {
    const { score, signals } = calculateCompletenessScore(this);
    this.schemaCompletenessScore = score;
    this.aeoSignals = signals;
  } catch (e) {
    console.error('[VendorService] completeness scoring failed:', e?.message || e);
  }

  try {
    let vendor = this._vendor;
    if (!vendor && this.vendorId) {
      vendor = await mongoose.model('Vendor').findById(this.vendorId).lean();
    }
    this.schemaJsonLd = generateServiceSchema(this, vendor) || null;
  } catch (e) {
    console.error('[VendorService] schema generation failed:', e?.message || e);
    this.schemaJsonLd = null;
  }

  next();
});

// ---- Indexes ------------------------------------------------------------

vendorServiceSchema.index({ vendorId: 1, active: 1 });
vendorServiceSchema.index({ vendorType: 1, active: 1 });
vendorServiceSchema.index({ 'solicitorData.practiceArea': 1 });
vendorServiceSchema.index({ 'accountantData.serviceCategory': 1 });
vendorServiceSchema.index({ 'mortgageAdvisorData.mortgageType': 1 });
vendorServiceSchema.index({ 'estateAgentData.serviceCategory': 1 });
vendorServiceSchema.index({ 'estateAgentData.coveragePostcodes': 1 });

const VendorService = mongoose.model('VendorService', vendorServiceSchema, 'vendor_services');

export { VENDOR_TYPE_TO_DATA_FIELD };
export default VendorService;
