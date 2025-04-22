import mongoose from 'mongoose';

const copierQuoteRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  companyName: { type: String, required: true },
  industryType: { type: String },
  contractStartDate: { type: Date },
  contractEndDate: { type: Date },
  financeCompany: { type: String },
  quarterlyPayment: { type: Number },

  invoices: [String], // File paths for uploaded invoices

  // Costs per copy (in pence or appropriate unit)
  costPerCopy: {
    mono: { type: Number },
    colour: { type: Number }
  },

  // Monthly print volumes split by mono and colour
  monthlyVolume: {
    mono: { type: Number },
    colour: { type: Number }
  },

  // Details about potential machines for comparison
  machineDetails: [{
    model: { type: String },
    isA3: { type: Boolean },
    trays: { type: Number },
    paperCut: { type: Boolean },
    followMePrint: { type: Boolean },
    bookletFinisher: { type: Boolean },
    location: { type: String }
  }],

  totalPrinters: { type: Number },
  monoPrinters: { type: Number },
  colourPrinters: { type: Number },
  reasonForUse: { type: String },

  // Current machine details and costs
  currentMachinePurchased: { type: Boolean },
  currentInkSpend: { type: Number },
  cartridgeChangeFrequency: { type: String },
  isServiced: { type: Boolean },
  addedServices: [String],

  // User preferences for the quote
  preference: {
    likeForLike: { type: Boolean },
    newModel: { type: Boolean },
    refurbished: { type: Boolean }
  },

  // Additional priorities, e.g., ['eco-friendly', 'speed']
  priorities: [String],

  // Location preferences for the service
  locationPreference: {
    type: { type: String }, // 'local' or 'national'
    radiusMiles: { type: Number }
  },

  // AI recommendation type for matching machines
  aiRecommendationType: {
    type: String,
    enum: ['like-for-like', 'optimised'],
    default: 'like-for-like'
  },

  status: { type: String, default: 'Pending' }
}, { timestamps: true });

export default mongoose.model('CopierQuoteRequest', copierQuoteRequestSchema);
