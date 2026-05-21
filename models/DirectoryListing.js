import mongoose from 'mongoose';

const directoryListingSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  directory: {
    type: String, required: true,
    enum: ['google_business_profile', 'bing_places', 'yell', 'freeindex',
           'trustpilot', 'cylex', 'thomson_local', 'apple_business',
           'law_society', 'icaew', 'fca_register', 'propertymark'],
  },
  status: {
    type: String, required: true,
    enum: ['queued', 'submitted', 'pending_verification', 'live', 'failed', 'removed',
           'found', 'not_found', 'undetermined'],
    default: 'queued',
  },
  listingUrl: { type: String },
  submittedAt: { type: Date },
  verifiedAt: { type: Date },
  retryCount: { type: Number, default: 0 },
  errorReason: { type: String },
  submissionMethod: { type: String, enum: ['api', 'manual', 'concierge', 'auto_regulatory'] },

  // Audit fields (presence + NAP consistency)
  auditMode: { type: Boolean, default: false },
  presenceConfidence: { type: Number },
  scrapedName: { type: String },
  scrapedPhone: { type: String },
  scrapedPostcode: { type: String },
  napNameStatus: { type: String, enum: ['match', 'name_variation', null], default: null },
  napPhoneStatus: { type: String, enum: ['match', 'phone_mismatch', 'unverifiable', null], default: null },
  napPostcodeStatus: { type: String, enum: ['match', 'mismatch', 'unverifiable', null], default: null },
  lastCheckedAt: { type: Date },
}, { timestamps: true });

directoryListingSchema.index({ vendorId: 1, directory: 1 }, { unique: true });

export default mongoose.model('DirectoryListing', directoryListingSchema);
